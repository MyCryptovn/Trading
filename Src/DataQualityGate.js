const DEFAULT_MAX_AGE_MS = 120000;
const DEFAULT_MAX_FUTURE_MS = 5000;
const DEFAULT_MAX_SPREAD_PCT = 5;

export function createMarketDataQualityGate({
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  maxFutureMs = DEFAULT_MAX_FUTURE_MS,
  maxSpreadPct = DEFAULT_MAX_SPREAD_PCT,
  clock = () => Date.now()
} = {}) {
  function validate(ticker) {
    if (!ticker || typeof ticker !== "object") return { ok: false, reason: "INVALID_TICKER" };
    if (!ticker.productId || typeof ticker.productId !== "string") return { ok: false, reason: "INVALID_PRODUCT" };
    if (!Number.isFinite(ticker.price) || ticker.price <= 0) return { ok: false, reason: "INVALID_PRICE" };
    if (!Number.isFinite(ticker.bid) || ticker.bid <= 0) return { ok: false, reason: "INVALID_BID" };
    if (!Number.isFinite(ticker.ask) || ticker.ask <= 0 || ticker.ask < ticker.bid) return { ok: false, reason: "INVALID_ASK" };

    const timestampMs = Date.parse(ticker.timestamp);
    if (!Number.isFinite(timestampMs)) return { ok: false, reason: "INVALID_TIMESTAMP" };

    const ageMs = clock() - timestampMs;
    if (ageMs > maxAgeMs) return { ok: false, reason: "STALE_DATA", ageMs };
    if (ageMs < -maxFutureMs) return { ok: false, reason: "FUTURE_TIMESTAMP", ageMs };

    const spreadPct = ((ticker.ask - ticker.bid) / ticker.price) * 100;
    if (!Number.isFinite(spreadPct) || spreadPct < 0 || spreadPct > maxSpreadPct) {
      return { ok: false, reason: "INVALID_SPREAD", spreadPct };
    }

    if (ticker.spreadPct !== null && ticker.spreadPct !== undefined) {
      if (!Number.isFinite(ticker.spreadPct) || ticker.spreadPct < 0 || ticker.spreadPct > maxSpreadPct) {
        return { ok: false, reason: "INVALID_REPORTED_SPREAD", spreadPct: ticker.spreadPct };
      }
      const discrepancyPct = Math.abs(ticker.spreadPct - spreadPct);
      if (discrepancyPct > 0.25) return { ok: false, reason: "SPREAD_DISCREPANCY", discrepancyPct };
    }

    return { ok: true, ageMs: Math.max(0, ageMs), spreadPct };
  }

  return { validate };
}

export { DEFAULT_MAX_AGE_MS, DEFAULT_MAX_FUTURE_MS, DEFAULT_MAX_SPREAD_PCT };
