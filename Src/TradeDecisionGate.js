const DEFAULTS = {
  minScore: 80,
  minSafetyScore: 70,
  minNetEdgePct: 0.5,
  maxSpreadPct: 0.4,
  minFlowConfidence: 60,
  opportunityMinScore: 85,
  opportunityMinSafetyScore: 80,
  opportunityMinNetEdgePct: 1.0,
  opportunityMinFlowConfidence: 75,
  maxOpportunityCandidates: 2,
  maxDataAgeMs: 120000,
  exitFlowConfidence: 60
};

function finite(value) {
  return Number.isFinite(Number(value));
}

export function decideTrade(input = {}, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const reasons = [];
  const hasPosition = Boolean(input.hasPosition);
  const now = finite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const timestamp = Number(input.timestamp);
  const score = Number(input.score);
  const safetyScore = Number(input.safetyScore);
  const spreadPct = Number(input.spreadPct);
  const netEdgePct = Number(input.netEdgePct);
  const flowConfidence = Number(input.flowConfidence);
  const flowDirection = String(input.flowDirection || "UNKNOWN").toUpperCase();
  const momentumDirection = String(input.momentumDirection || "UNKNOWN").toUpperCase();
  const newsRisk = String(input.newsRisk || "NONE").toUpperCase();

  if (!finite(timestamp) || timestamp > now + 30000 || now - timestamp > cfg.maxDataAgeMs) {
    return { action: "HOLD", mode: "NONE", reasons: ["STALE_OR_INVALID_DATA"] };
  }

  // An exit is allowed only for an existing position. This gate never opens a short.
  if (hasPosition) {
    const deterioration =
      flowDirection === "DOWN" ||
      momentumDirection === "DOWN" ||
      newsRisk === "HIGH" ||
      (finite(netEdgePct) && netEdgePct < 0) ||
      (finite(spreadPct) && spreadPct > cfg.maxSpreadPct);

    if (deterioration) {
      return {
        action: "SELL",
        mode: "EXIT",
        reasons: ["POSITION_RISK_DETERIORATED"]
      };
    }
  }

  if (!finite(score) || score < cfg.minScore) reasons.push("SCORE_BELOW_READY");
  if (!finite(safetyScore) || safetyScore < cfg.minSafetyScore) reasons.push("SAFETY_GATE_FAILED_OR_UNKNOWN");
  if (!finite(spreadPct) || spreadPct < 0 || spreadPct > cfg.maxSpreadPct) reasons.push("SPREAD_TOO_WIDE_OR_UNKNOWN");
  if (!finite(netEdgePct) || netEdgePct < cfg.minNetEdgePct) reasons.push("NET_EDGE_TOO_LOW_OR_UNKNOWN");
  if (!finite(flowConfidence) || flowConfidence < cfg.minFlowConfidence) reasons.push("FLOW_CONFIRMATION_TOO_WEAK_OR_UNKNOWN");
  if (flowDirection !== "UP") reasons.push("FLOW_NOT_UP");
  if (momentumDirection !== "UP") reasons.push("MOMENTUM_NOT_UP");
  if (newsRisk === "HIGH") reasons.push("HIGH_NEWS_RISK");

  if (reasons.length) {
    return { action: "HOLD", mode: "NONE", reasons };
  }

  const opportunity =
    score >= cfg.opportunityMinScore &&
    safetyScore >= cfg.opportunityMinSafetyScore &&
    netEdgePct >= cfg.opportunityMinNetEdgePct &&
    flowConfidence >= cfg.opportunityMinFlowConfidence &&
    input.opportunity === true;

  return {
    action: "BUY",
    mode: opportunity ? "OPPORTUNITY" : "STANDARD",
    reasons: [opportunity ? "EXCEPTIONAL_EDGE_CONFIRMED" : "ALL_BUY_GATES_PASSED"]
  };
}

export function rankOpportunityCandidates(candidates = [], options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  if (!Array.isArray(candidates)) return [];

  return candidates
    .filter((c) => c && c.opportunity === true)
    .filter((c) => finite(c.score) && Number(c.score) >= cfg.opportunityMinScore)
    .filter((c) => finite(c.safetyScore) && Number(c.safetyScore) >= cfg.opportunityMinSafetyScore)
    .filter((c) => finite(c.netEdgePct) && Number(c.netEdgePct) >= cfg.opportunityMinNetEdgePct)
    .filter((c) => finite(c.flowConfidence) && Number(c.flowConfidence) >= cfg.opportunityMinFlowConfidence)
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, cfg.maxOpportunityCandidates);
}
