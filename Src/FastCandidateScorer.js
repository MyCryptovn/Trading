const DEFAULTS = {
  minLiquidityUsd: 25000,
  maxSpreadPct: 0.4,
  minSafetyScore: 70,
  minFlowImbalancePct: 15,
  minMomentumPct: 0.5,
  maxDataAgeMs: 120000,
  watchScore: 60,
  readyScore: 80
};

function finite(value) {
  return Number.isFinite(Number(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function scoreCandidate(input = {}, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const reasons = [];
  const gates = {
    safety: false,
    liquidity: false,
    freshness: false,
    spread: false,
    flow: false,
    momentum: false
  };

  if (!input || typeof input !== "object") {
    return { action: "HOLD", score: 0, reasons: ["INVALID_CANDIDATE"], gates };
  }

  const now = finite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const timestamp = Number(input.timestamp);
  if (!finite(timestamp) || timestamp > now + 30000 || now - timestamp > cfg.maxDataAgeMs) {
    reasons.push("STALE_OR_INVALID_DATA");
  } else {
    gates.freshness = true;
  }

  const safety = Number(input.safetyScore);
  if (!finite(safety) || input.safetyPassed !== true || safety < cfg.minSafetyScore) {
    reasons.push("SAFETY_GATE_FAILED_OR_UNKNOWN");
  } else {
    gates.safety = true;
  }

  const liquidity = Number(input.liquidityUsd);
  if (!finite(liquidity) || liquidity < cfg.minLiquidityUsd) {
    reasons.push("LIQUIDITY_TOO_LOW_OR_UNKNOWN");
  } else {
    gates.liquidity = true;
  }

  const spread = Number(input.spreadPct);
  if (!finite(spread) || spread < 0 || spread > cfg.maxSpreadPct) {
    reasons.push("SPREAD_TOO_WIDE_OR_UNKNOWN");
  } else {
    gates.spread = true;
  }

  const flow = Number(input.flowImbalancePct);
  if (!finite(flow)) {
    reasons.push("FLOW_UNKNOWN");
  } else if (Math.abs(flow) < cfg.minFlowImbalancePct) {
    reasons.push("FLOW_TOO_WEAK");
  } else {
    gates.flow = true;
  }

  const momentum = Number(input.momentumPct);
  if (!finite(momentum)) {
    reasons.push("MOMENTUM_UNKNOWN");
  } else if (Math.abs(momentum) < cfg.minMomentumPct) {
    reasons.push("MOMENTUM_TOO_WEAK");
  } else {
    gates.momentum = true;
  }

  const largeOrder = finite(input.largeOrderImbalancePct)
    ? clamp(Math.abs(Number(input.largeOrderImbalancePct)), 0, 100)
    : null;

  const hardGates = gates.safety && gates.liquidity && gates.freshness && gates.spread && gates.flow && gates.momentum;
  if (!hardGates) {
    return {
      action: "HOLD",
      score: 0,
      reasons,
      gates
    };
  }

  const safetyPoints = clamp((safety / 100) * 25, 0, 25);
  const liquidityPoints = clamp(Math.log10(liquidity / cfg.minLiquidityUsd + 1) * 12, 0, 20);
  const flowPoints = clamp((Math.abs(flow) / 100) * 20, 0, 20);
  const largeOrderPoints = largeOrder === null ? 0 : clamp((largeOrder / 100) * 10, 0, 10);
  const momentumPoints = clamp((Math.abs(momentum) / 5) * 15, 0, 15);
  const freshnessPoints = clamp(10 - ((now - timestamp) / cfg.maxDataAgeMs) * 10, 0, 10);

  const score = Math.round(safetyPoints + liquidityPoints + flowPoints + largeOrderPoints + momentumPoints + freshnessPoints);
  let action = "WATCH";
  if (score >= cfg.readyScore) action = "READY";
  else if (score < cfg.watchScore) action = "HOLD";

  return {
    action,
    score,
    reasons: reasons.length ? reasons : ["ALL_HARD_GATES_PASSED"],
    gates,
    components: {
      safety: Math.round(safetyPoints),
      liquidity: Math.round(liquidityPoints),
      flow: Math.round(flowPoints),
      largeOrder: Math.round(largeOrderPoints),
      momentum: Math.round(momentumPoints),
      freshness: Math.round(freshnessPoints)
    }
  };
}
