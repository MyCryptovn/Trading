const DEFAULT_MOVE_PCT = 0.50;
const DEFAULT_ALERT_VOLUME_USD = 1000000;

export function createMarketScanner({
  movePct = DEFAULT_MOVE_PCT,
  alertVolumeUsd = DEFAULT_ALERT_VOLUME_USD
} = {}) {
  const previous = new Map();

  function update(ticker) {
    const previousTicker = previous.get(ticker.productId);
    previous.set(ticker.productId, ticker);

    if (!previousTicker || !Number.isFinite(previousTicker.price) || previousTicker.price <= 0) {
      return {
        signal: "WARMUP",
        productId: ticker.productId,
        movePct: 0
      };
    }

    const movePctFromLast =
      ((ticker.price - previousTicker.price) / previousTicker.price) * 100;

    const hasValidSpread =
      Number.isFinite(ticker.bid) &&
      Number.isFinite(ticker.ask) &&
      ticker.bid > 0 &&
      ticker.ask >= ticker.bid;

    const spreadPct = hasValidSpread
      ? ((ticker.ask - ticker.bid) / ticker.price) * 100
      : null;

    const volumeOk =
      !Number.isFinite(ticker.volume24h) ||
      ticker.volume24h >= alertVolumeUsd;

    const fastMove = Math.abs(movePctFromLast) >= movePct;

    let signal = "HOLD";
    if (fastMove && volumeOk) {
      signal = movePctFromLast > 0 ? "MOMENTUM_UP" : "MOMENTUM_DOWN";
    }

    return {
      signal,
      productId: ticker.productId,
      movePct: movePctFromLast,
      spreadPct
    };
  }

  function reset() {
    previous.clear();
  }

  return { update, reset };
}
