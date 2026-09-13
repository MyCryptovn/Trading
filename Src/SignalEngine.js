const DEFAULT_MAX_SPREAD_PCT = 0.40;
const DEFAULT_MIN_VOLUME_USD = 1000000;
const DEFAULT_MIN_MOVE_PCT = 0.50;

export function evaluateSignal({
  movePct,
  spreadPct,
  volume24h,
  maxSpreadPct = DEFAULT_MAX_SPREAD_PCT,
  minVolumeUsd = DEFAULT_MIN_VOLUME_USD,
  minMovePct = DEFAULT_MIN_MOVE_PCT
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

  if (movePct > 0) {
    return { action: "WATCH_BUY", reason: "MOMENTUM_UP" };
  }

  if (movePct < 0) {
    return { action: "WATCH_SELL", reason: "MOMENTUM_DOWN" };
  }

  return { action: "HOLD", reason: "NO_EDGE" };
}
