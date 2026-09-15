const ACTIONS = new Set(["BUY", "SELL", "HOLD", "UNKNOWN"]);

function normalizeAction(value) {
  const action = String(value || "UNKNOWN").trim().toUpperCase();
  return ACTIONS.has(action) ? action : "UNKNOWN";
}

function finite(value) {
  return Number.isFinite(Number(value));
}

/**
 * Deterministic fusion layer. It combines independent evidence without
 * allowing unknown/stale inputs to become a directional signal.
 * AI/research agents can feed this contract later; they never execute trades.
 */
export function createSignalFusion(options = {}) {
  const minConfidence = finite(options.minConfidence)
    ? Math.max(0, Math.min(100, Number(options.minConfidence)))
    : 60;

  function fuse(inputs = {}) {
    const sources = [
      ["quant", inputs.quant],
      ["flow", inputs.flow],
      ["onchain", inputs.onchain],
      ["research", inputs.research]
    ];

    const votes = { BUY: 0, SELL: 0, HOLD: 0 };
    const weights = { BUY: 0, SELL: 0, HOLD: 0 };
    const evidence = [];
    const rejected = [];

    for (const [name, source] of sources) {
      if (!source || typeof source !== "object") continue;
      const action = normalizeAction(source.action);
      const confidence = Number(source.confidence);
      if (!finite(confidence) || confidence < 0 || confidence > 100 || action === "UNKNOWN") {
        rejected.push(`${name}:INVALID_SIGNAL`);
        continue;
      }
      const weight = Math.max(0, Math.min(1, confidence / 100));
      votes[action] += 1;
      weights[action] += weight;
      evidence.push({ name, action, confidence, weight });
    }

    const ranked = Object.entries(weights).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const second = ranked[1];
    const totalWeight = ranked.reduce((sum, [, value]) => sum + value, 0);

    if (!top || top[1] <= 0 || totalWeight <= 0) {
      return { action: "HOLD", confidence: 0, agreement: 0, votes, weights, evidence, rejected, reason: "NO_VALID_SIGNALS" };
    }

    const agreement = top[1] / totalWeight;
    const margin = top[1] - (second?.[1] || 0);
    const confidence = Math.round(agreement * 100);

    if (confidence < minConfidence || margin <= 0) {
      return { action: "HOLD", confidence, agreement, votes, weights, evidence, rejected, reason: "SIGNAL_CONFLICT_OR_WEAK" };
    }

    return {
      action: top[0],
      confidence,
      agreement,
      votes,
      weights,
      evidence,
      rejected,
      reason: "SIGNALS_FUSED"
    };
  }

  return { fuse, minConfidence };
}
