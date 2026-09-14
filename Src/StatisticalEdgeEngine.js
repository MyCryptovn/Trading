const DEFAULTS = Object.freeze({
  minSamples: 50,
  minDirectionalProbability: 0.60,
  minLowerBound95: 0.55,
  minExpectedValuePct: 0.20,
  horizonMs: 15 * 60 * 1000,
  costPct: 0
});

function finite(value) {
  return Number.isFinite(Number(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wilsonInterval(successes, total, z = 1.96) {
  if (!Number.isFinite(successes) || !Number.isFinite(total) || total <= 0) {
    return { lower: null, upper: null };
  }

  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);

  return {
    lower: clamp((centre - margin) / denominator, 0, 1),
    upper: clamp((centre + margin) / denominator, 0, 1)
  };
}

function normalizeSamples(samples, {
  contextKey = null,
  asOfMs = null,
  horizonMs = DEFAULTS.horizonMs
} = {}) {
  if (!Array.isArray(samples)) return [];

  return samples
    .map((sample) => ({
      ...sample,
      timestamp: Number(sample?.timestamp),
      forwardReturnPct: Number(sample?.forwardReturnPct)
    }))
    .filter((sample) => {
      if (!finite(sample.timestamp) || !finite(sample.forwardReturnPct)) return false;
      if (contextKey !== null && sample.contextKey !== contextKey) return false;
      if (finite(asOfMs) && sample.timestamp + horizonMs > Number(asOfMs)) return false;
      return true;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

function summarize(samples, costPct) {
  const netReturns = samples.map(
    (sample) => sample.forwardReturnPct - costPct
  );

  const up = netReturns.filter((value) => value > 0);
  const down = netReturns.filter((value) => value < 0);
  const flat = netReturns.filter((value) => value === 0);
  const mean = netReturns.reduce((sum, value) => sum + value, 0) / netReturns.length;

  const avgWinPct = up.length
    ? up.reduce((sum, value) => sum + value, 0) / up.length
    : 0;
  const avgLossPct = down.length
    ? Math.abs(down.reduce((sum, value) => sum + value, 0) / down.length)
    : 0;

  return {
    sampleSize: netReturns.length,
    upCount: up.length,
    downCount: down.length,
    flatCount: flat.length,
    probabilityUp: up.length / netReturns.length,
    probabilityDown: down.length / netReturns.length,
    avgWinPct,
    avgLossPct,
    meanReturnPct: mean,
    expectedValuePct: mean
  };
}

/**
 * Estimate an empirical directional edge from observed historical/paper outcomes.
 *
 * No synthetic data is generated and no fixed price-move rule is treated as
 * evidence. A sample is eligible only when its forward outcome is actually
 * observed. Samples that would not have completed by asOfMs are excluded to
 * prevent look-ahead leakage.
 */
export function estimateStatisticalEdge(samples = [], options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const normalized = normalizeSamples(samples, cfg);

  if (!normalized.length) {
    return {
      eligible: false,
      reason: "NO_VALID_HISTORICAL_SAMPLES",
      sampleSize: 0
    };
  }

  const stats = summarize(normalized, cfg.costPct);
  const upInterval = wilsonInterval(stats.upCount, stats.sampleSize);
  const downInterval = wilsonInterval(stats.downCount, stats.sampleSize);

  const upReady =
    stats.sampleSize >= cfg.minSamples &&
    stats.probabilityUp >= cfg.minDirectionalProbability &&
    upInterval.lower >= cfg.minLowerBound95 &&
    stats.expectedValuePct >= cfg.minExpectedValuePct;

  const downReady =
    stats.sampleSize >= cfg.minSamples &&
    stats.probabilityDown >= cfg.minDirectionalProbability &&
    downInterval.lower >= cfg.minLowerBound95 &&
    stats.expectedValuePct <= -cfg.minExpectedValuePct;

  let direction = "NONE";
  let directionalProbability = 0;
  let lowerBound95 = 0;
  let upperBound95 = 0;

  if (upReady && stats.probabilityUp >= stats.probabilityDown) {
    direction = "UP";
    directionalProbability = stats.probabilityUp;
    lowerBound95 = upInterval.lower;
    upperBound95 = upInterval.upper;
  } else if (downReady) {
    direction = "DOWN";
    directionalProbability = stats.probabilityDown;
    lowerBound95 = downInterval.lower;
    upperBound95 = downInterval.upper;
  }

  return {
    eligible: direction !== "NONE",
    reason: direction === "NONE" ? "STATISTICAL_EDGE_NOT_CONFIRMED" : "STATISTICAL_EDGE_CONFIRMED",
    direction,
    probabilityUp: stats.probabilityUp,
    probabilityDown: stats.probabilityDown,
    probabilityUpLower95: upInterval.lower,
    probabilityUpUpper95: upInterval.upper,
    probabilityDownLower95: downInterval.lower,
    probabilityDownUpper95: downInterval.upper,
    directionalProbability,
    lowerBound95,
    upperBound95,
    expectedValuePct: stats.expectedValuePct,
    avgWinPct: stats.avgWinPct,
    avgLossPct: stats.avgLossPct,
    sampleSize: stats.sampleSize,
    upCount: stats.upCount,
    downCount: stats.downCount,
    flatCount: stats.flatCount,
    costPct: cfg.costPct,
    horizonMs: cfg.horizonMs,
    contextKey: cfg.contextKey ?? null,
    firstSampleTimestamp: normalized[0].timestamp,
    lastSampleTimestamp: normalized[normalized.length - 1].timestamp
  };
}

/**
 * Chronological walk-forward validation. Every test observation is evaluated
 * using only observations that occurred before it.
 */
export function walkForwardValidate(samples = [], options = {}) {
  const cfg = {
    ...DEFAULTS,
    trainMinSamples: 50,
    testWindow: 20,
    ...options
  };

  const normalized = normalizeSamples(samples, cfg);
  if (normalized.length < cfg.trainMinSamples + 1) {
    return {
      eligible: false,
      reason: "INSUFFICIENT_WALK_FORWARD_DATA",
      sampleSize: normalized.length,
      evaluated: 0
    };
  }

  let evaluated = 0;
  let correct = 0;
  let folds = 0;
  const directionalReturns = [];

  for (let start = cfg.trainMinSamples; start < normalized.length; start += cfg.testWindow) {
    const train = normalized.slice(0, start);
    const test = normalized.slice(start, start + cfg.testWindow);
    if (!test.length) break;

    const edge = estimateStatisticalEdge(train, {
      ...cfg,
      asOfMs: null,
      minSamples: cfg.trainMinSamples
    });

    if (!edge.eligible) continue;
    folds += 1;

    for (const sample of test) {
      const directionalReturn = edge.direction === "UP"
        ? sample.forwardReturnPct - cfg.costPct
        : -sample.forwardReturnPct - cfg.costPct;

      directionalReturns.push(directionalReturn);
      evaluated += 1;
      if (directionalReturn > 0) correct += 1;
    }
  }

  if (!evaluated) {
    return {
      eligible: false,
      reason: "NO_OUT_OF_SAMPLE_SIGNALS",
      sampleSize: normalized.length,
      evaluated: 0,
      folds
    };
  }

  const averageDirectionalReturnPct =
    directionalReturns.reduce((sum, value) => sum + value, 0) / evaluated;

  return {
    eligible: true,
    reason: "WALK_FORWARD_VALIDATED",
    sampleSize: normalized.length,
    evaluated,
    folds,
    directionalAccuracy: correct / evaluated,
    averageDirectionalReturnPct,
    profitableObservations: directionalReturns.filter((value) => value > 0).length,
    losingObservations: directionalReturns.filter((value) => value < 0).length
  };
}

export const STATISTICAL_EDGE_DEFAULTS = DEFAULTS;
