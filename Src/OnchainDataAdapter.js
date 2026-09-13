const DEFAULTS = Object.freeze({
  maxAgeMs: 120000,
  minLiquidityUsd: 25000
});

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeTimestamp(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function validateSnapshot(snapshot, now, maxAgeMs, minLiquidityUsd) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason: "INVALID_SNAPSHOT" };
  }

  const timestampMs = normalizeTimestamp(snapshot.timestamp);
  if (timestampMs === null) {
    return { ok: false, reason: "INVALID_TIMESTAMP" };
  }

  const ageMs = now - timestampMs;
  if (ageMs < -30000) {
    return { ok: false, reason: "TIMESTAMP_IN_FUTURE" };
  }

  if (ageMs > maxAgeMs) {
    return { ok: false, reason: "STALE_DATA", ageMs };
  }

  const liquidityUsd = finiteNonNegative(snapshot.liquidityUsd);
  if (liquidityUsd === null || liquidityUsd < minLiquidityUsd) {
    return { ok: false, reason: "LIQUIDITY_TOO_LOW", liquidityUsd };
  }

  if (!snapshot.chain || !snapshot.address || !snapshot.source) {
    return { ok: false, reason: "IDENTITY_FIELDS_MISSING" };
  }

  return { ok: true, ageMs, liquidityUsd };
}

/**
 * Provider-agnostic DEX/on-chain adapter.
 * The provider supplies a raw snapshot; this adapter validates and normalizes it.
 * It never signs transactions, connects wallets, or executes trades.
 */
export function createOnchainDataAdapter({
  fetchSnapshot,
  maxAgeMs = DEFAULTS.maxAgeMs,
  minLiquidityUsd = DEFAULTS.minLiquidityUsd,
  clock = () => Date.now()
} = {}) {
  if (typeof fetchSnapshot !== "function") {
    throw new TypeError("fetchSnapshot must be a function");
  }

  const ageLimit = Number.isFinite(maxAgeMs) && maxAgeMs >= 0
    ? maxAgeMs
    : DEFAULTS.maxAgeMs;

  const liquidityLimit = Number.isFinite(minLiquidityUsd) && minLiquidityUsd >= 0
    ? minLiquidityUsd
    : DEFAULTS.minLiquidityUsd;

  async function getFlowSnapshot(query = {}) {
    const raw = await fetchSnapshot(query);
    const validation = validateSnapshot(raw, clock(), ageLimit, liquidityLimit);

    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
        ageMs: validation.ageMs ?? null,
        liquidityUsd: validation.liquidityUsd ?? null,
        data: null
      };
    }

    const data = {
      chain: raw.chain,
      address: raw.address,
      pair: raw.pair || null,
      source: raw.source,
      priceUsd: finitePositive(raw.priceUsd),
      liquidityUsd: validation.liquidityUsd,
      buyVolumeUsd: finiteNonNegative(raw.buyVolumeUsd),
      sellVolumeUsd: finiteNonNegative(raw.sellVolumeUsd),
      volumeUsd: finiteNonNegative(raw.volumeUsd),
      previousVolumeUsd: finiteNonNegative(raw.previousVolumeUsd),
      previousLiquidityUsd: finiteNonNegative(raw.previousLiquidityUsd),
      tradeCount: finiteNonNegative(raw.tradeCount),
      previousTradeCount: finiteNonNegative(raw.previousTradeCount),
      uniqueBuyers: finiteNonNegative(raw.uniqueBuyers),
      uniqueSellers: finiteNonNegative(raw.uniqueSellers),
      largeBuyUsd: finiteNonNegative(raw.largeBuyUsd),
      largeSellUsd: finiteNonNegative(raw.largeSellUsd),
      washTradeRisk: finiteNonNegative(raw.washTradeRisk),
      timestamp: new Date(normalizeTimestamp(raw.timestamp)).toISOString()
    };

    return {
      ok: true,
      reason: "VALID",
      ageMs: validation.ageMs,
      data
    };
  }

  return {
    getFlowSnapshot,
    limits: { maxAgeMs: ageLimit, minLiquidityUsd: liquidityLimit }
  };
}

export const DEFAULT_ONCHAIN_ADAPTER_LIMITS = DEFAULTS;
