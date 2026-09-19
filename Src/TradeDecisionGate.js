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
  return value !== null && value !== undefined && Number.isFinite(Number(value));
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
  const aiDecisionAction = String(input.aiDecisionAction || "UNKNOWN").toUpperCase();
  const directionAction = String(input.directionAction || "UNKNOWN").toUpperCase();
  const effectiveDirection = aiDecisionAction === "BUY" || aiDecisionAction === "SELL"
    ? aiDecisionAction
    : directionAction;

  if (!finite(timestamp) || timestamp > now + 30000 || now - timestamp > cfg.maxDataAgeMs) {
    return { action: "HOLD", mode: "NONE", reasons: ["STALE_OR_INVALID_DATA"] };
  }

  // TradingAgents is the directional decision authority. Deterministic
  // controls can veto an AI decision, but they must not invent a direction.
  if (!hasPosition && effectiveDirection !== "BUY") {
    if (effectiveDirection === "SELL") {
      return { action: "HOLD", mode: "NONE", reasons: ["SELL_WITHOUT_POSITION"] };
    }
    return { action: "HOLD", mode: "NONE", reasons: ["NO_VALID_BUY_DIRECTION"] };
  }

  if (hasPosition && effectiveDirection === "SELL") {
    return {
      action: "SELL",
      mode: aiDecisionAction === "SELL" ? "AI_EXIT" : "SIGNAL_EXIT",
      reasons: [aiDecisionAction === "SELL" ? "TRADINGAGENTS_SELL_DECISION" : "VALIDATED_SIGNAL_SELL"]
    };
  }

  if (hasPosition) {
    const flowDeteriorated =
      flowDirection === "DOWN" ||
      !finite(flowConfidence) ||
      flowConfidence < cfg.exitFlowConfidence;
    const momentumDeteriorated = momentumDirection === "DOWN";
    const marketRiskDeteriorated =
      newsRisk === "HIGH" ||
      (finite(netEdgePct) && netEdgePct < 0) ||
      (finite(spreadPct) && spreadPct > cfg.maxSpreadPct);

    if (flowDeteriorated || momentumDeteriorated || marketRiskDeteriorated) {
      const exitReasons = [];
      if (flowDeteriorated) exitReasons.push("FLOW_DETERIORATED");
      if (momentumDeteriorated) exitReasons.push("MOMENTUM_DETERIORATED");
      if (newsRisk === "HIGH") exitReasons.push("HIGH_NEWS_RISK");
      if (finite(netEdgePct) && netEdgePct < 0) exitReasons.push("NEGATIVE_NET_EDGE");
      if (finite(spreadPct) && spreadPct > cfg.maxSpreadPct) exitReasons.push("SPREAD_TOO_WIDE");
      return {
        action: "SELL",
        mode: "SAFETY_EXIT",
        reasons: exitReasons.length ? exitReasons : ["POSITION_RISK_DETERIORATED"]
      };
    }

    // The paper trader holds one position. A BUY from AI while already
    // positioned is not a new entry and must not accidentally double-execute.
    return { action: "HOLD", mode: "POSITION_HOLD", reasons: ["POSITION_ALREADY_OPEN"] };
  }

  // BUY remains fail-closed: a validated directional signal (or TradingAgents
  // when available) chooses the direction; deterministic gates decide whether
  // that direction is safe to execute. TradeDecisionGate remains the sole
  // execution authority.
  if (input.safetyApproved !== true) reasons.push("SAFETY_NOT_EXPLICITLY_APPROVED");
  if (input.statisticalEdgeConfirmed !== true) reasons.push("STATISTICAL_EDGE_NOT_CONFIRMED");
  if (input.statisticalOutOfSampleValidated !== true) reasons.push("OUT_OF_SAMPLE_VALIDATION_NOT_CONFIRMED");
  if (String(input.statisticalDirection || "NONE").toUpperCase() !== "UP") reasons.push("STATISTICAL_DIRECTION_NOT_UP");
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

  if (input.opportunity === true) {
    const opportunityReasons = [];
    if (score < cfg.opportunityMinScore) opportunityReasons.push("OPPORTUNITY_SCORE_TOO_LOW");
    if (safetyScore < cfg.opportunityMinSafetyScore) opportunityReasons.push("OPPORTUNITY_SAFETY_TOO_LOW");
    if (netEdgePct < cfg.opportunityMinNetEdgePct) opportunityReasons.push("OPPORTUNITY_NET_EDGE_TOO_LOW");
    if (flowConfidence < cfg.opportunityMinFlowConfidence) opportunityReasons.push("OPPORTUNITY_FLOW_CONFIDENCE_TOO_LOW");

    if (opportunityReasons.length) {
      return { action: "HOLD", mode: "NONE", reasons: opportunityReasons };
    }
  }

  const opportunity = input.opportunity === true;

  return {
    action: "BUY",
    mode: opportunity ? "OPPORTUNITY" : "STANDARD",
    reasons: ["AI_BUY_ALL_GATES_PASSED"]
  };
}

export function rankOpportunityCandidates(candidates = [], options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  if (!Array.isArray(candidates)) return [];

  return candidates
    .filter((c) => c && c.opportunity === true)
    .filter((c) => c.aiDecisionAction === "BUY")
    .filter((c) => c.safetyApproved === true && c.statisticalEdgeConfirmed === true)
    .filter((c) => c.statisticalOutOfSampleValidated === true)
    .filter((c) => String(c.statisticalDirection || "NONE").toUpperCase() === "UP")
    .filter((c) => finite(c.score) && Number(c.score) >= cfg.opportunityMinScore)
    .filter((c) => finite(c.safetyScore) && Number(c.safetyScore) >= cfg.opportunityMinSafetyScore)
    .filter((c) => finite(c.netEdgePct) && Number(c.netEdgePct) >= cfg.opportunityMinNetEdgePct)
    .filter((c) => finite(c.flowConfidence) && Number(c.flowConfidence) >= cfg.opportunityMinFlowConfidence)
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, cfg.maxOpportunityCandidates);
}
