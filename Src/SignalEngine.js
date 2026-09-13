const DEFAULT_MAX_SPREAD_PCT = 0.40;
const DEFAULT_MIN_VOLUME_USD = 1000000;
const DEFAULT_MIN_MOVE_PCT = 0.50;
const DEFAULT_MIN_FLOW_CONFIDENCE = 60;

export function evaluateSignal({
  movePct,
  spreadPct,
  volume24h,
  capitalFlow = null,
  maxSpreadPct = DEFAULT_MAX_SPREAD_PCT,
  minVolumeUsd = DEFAULT_MIN_VOLUME_USD,
  minMovePct = DEFAULT_MIN_MOVE_PCT,
  minFlowConfidence = DEFAULT_MIN_FLOW_CONFIDENCE
}) {
  if (!Number.isFinite(movePct)) {
    return { action: "HOLD", reason: "INVALID_MOVE" };
  }

  if (Number.isFinite(spreadPct) && spreadPct > maxSpreadPct) {
    return { action: "HOLD", reason: "SPREAD_TOO_WIDE" };
  }

  if (Number.isFinite(volume24h) && volume24h < minVolumeUsd) {
    return { action: "HOLD", reason: "LIQUIDITY_TOO_LOW" };
  }

  if (Math.abs(movePct) < minMovePct) {
    return { action: "HOLD", reason: "MOVE_TOO_SMALL" };
  }

  const flowAvailable = capitalFlow !== null && typeof capitalFlow === "object";
  if (flowAvailable) {
    const confidence = Number(capitalFlow.confidence);
    if (!Number.isFinite(confidence) || confidence < minFlowConfidence) {
      return { action: "HOLD", reason: "FLOW_CONFIDENCE_TOO_LOW", flow: capitalFlow };
    }

    if (movePct > 0 && capitalFlow.action !== "FLOW_UP") {
      return { action: "HOLD", reason: "FLOW_NOT_CONFIRMING_BUY", flow: capitalFlow };
    }

    if (movePct < 0 && capitalFlow.action !== "FLOW_DOWN") {
      return { action: "HOLD", reason: "FLOW_NOT_CONFIRMING_SELL", flow: capitalFlow };
    }
  }

  if (movePct > 0) {
    return { action: "WATCH_BUY", reason: flowAvailable ? "MOMENTUM_UP_FLOW_CONFIRMED" : "MOMENTUM_UP", flow: capitalFlow };
  }

  if (movePct < 0) {
    return { action: "WATCH_SELL", reason: flowAvailable ? "MOMENTUM_DOWN_FLOW_CONFIRMED" : "MOMENTUM_DOWN", flow: capitalFlow };
  }

  return { action: "HOLD", reason: "NO_EDGE" };
}
