const DEFAULTS = Object.freeze({
  baseUrl: "https://api.geckoterminal.com/api/v2",
  maxAgeMs: 120000,
  minLiquidityUsd: 25000,
  largeTradeUsd: 10000
});

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getAttributes(payload) {
  return payload?.data?.attributes || null;
}

function getTradeRows(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

function summarizeTrades(rows, largeTradeUsd) {
  let buyVolumeUsd = 0;
  let sellVolumeUsd = 0;
  let largeBuyUsd = 0;
  let largeSellUsd = 0;
  let tradeCount = 0;
  const buyers = new Set();
  const sellers = new Set();

  for (const row of rows) {
    const attributes = row?.attributes;
    if (!attributes) continue;

    const volumeUsd = parseNumber(attributes.volume_in_usd);
    if (volumeUsd === null || volumeUsd < 0) continue;

    const kind = String(attributes.kind || "").toLowerCase();
    if (kind !== "buy" && kind !== "sell") continue;

    tradeCount += 1;
    const wallet = attributes.tx_from_address || null;

    if (kind === "buy") {
      buyVolumeUsd += volumeUsd;
      if (volumeUsd >= largeTradeUsd) largeBuyUsd += volumeUsd;
      if (wallet) buyers.add(wallet);
    } else {
      sellVolumeUsd += volumeUsd;
      if (volumeUsd >= largeTradeUsd) largeSellUsd += volumeUsd;
      if (wallet) sellers.add(wallet);
    }
  }

  return {
    buyVolumeUsd,
    sellVolumeUsd,
    largeBuyUsd,
    largeSellUsd,
    tradeCount,
    uniqueBuyers: buyers.size,
    uniqueSellers: sellers.size
  };
}

/**
 * Read-only GeckoTerminal adapter for DEX/on-chain analytics.
 * It fetches public pool metadata plus recent trades and normalizes them
 * into the provider-agnostic snapshot consumed by OnchainFlowIntegration.
 * It never connects wallets, signs, submits, or executes transactions.
 */
export function createGeckoTerminalDataAdapter({
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULTS.baseUrl,
  maxAgeMs = DEFAULTS.maxAgeMs,
  minLiquidityUsd = DEFAULTS.minLiquidityUsd,
  largeTradeUsd = DEFAULTS.largeTradeUsd,
  clock = () => Date.now()
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  const ageLimit = Number.isFinite(maxAgeMs) && maxAgeMs >= 0
    ? maxAgeMs
    : DEFAULTS.maxAgeMs;

  const liquidityLimit = Number.isFinite(minLiquidityUsd) && minLiquidityUsd >= 0
    ? minLiquidityUsd
    : DEFAULTS.minLiquidityUsd;

  const largeTradeLimit = Number.isFinite(largeTradeUsd) && largeTradeUsd > 0
    ? largeTradeUsd
    : DEFAULTS.largeTradeUsd;

  async function getJson(url) {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`GECKOTERMINAL_HTTP_${response.status}`);
    }

    return response.json();
  }

  async function getFlowSnapshot({ network, poolAddress } = {}) {
    if (!network || !poolAddress) {
      return { ok: false, reason: "IDENTITY_FIELDS_MISSING", data: null };
    }

    const encodedNetwork = encodeURIComponent(network);
    const encodedPool = encodeURIComponent(poolAddress);

    try {
      const poolUrl = `${baseUrl}/networks/${encodedNetwork}/pools/${encodedPool}`;
      const tradesUrl = `${baseUrl}/networks/${encodedNetwork}/pools/${encodedPool}/trades`;

      const [poolPayload, tradesPayload] = await Promise.all([
        getJson(poolUrl),
        getJson(tradesUrl)
      ]);

      const attributes = getAttributes(poolPayload);
      if (!attributes) {
        return { ok: false, reason: "INVALID_SNAPSHOT", data: null };
      }

      const liquidityUsd = parseNumber(attributes.reserve_in_usd);
      if (liquidityUsd === null || liquidityUsd < liquidityLimit) {
        return {
          ok: false,
          reason: "LIQUIDITY_TOO_LOW",
          liquidityUsd,
          data: null
        };
      }

      const timestamp = normalizeTimestamp(attributes.last_updated_at);
      if (timestamp === null) {
        return {
          ok: false,
          reason: "MISSING_PROVIDER_TIMESTAMP",
          liquidityUsd,
          data: null
        };
      }

      const ageMs = clock() - timestamp;
      if (ageMs < -30000 || ageMs > ageLimit) {
        return {
          ok: false,
          reason: ageMs < -30000 ? "TIMESTAMP_IN_FUTURE" : "STALE_DATA",
          ageMs,
          liquidityUsd,
          data: null
        };
      }

      const trades = summarizeTrades(getTradeRows(tradesPayload), largeTradeLimit);
      if (trades.tradeCount === 0) {
        return { ok: false, reason: "NO_RECENT_TRADES", ageMs, liquidityUsd, data: null };
      }

      const volumeUsd = parseNumber(attributes.volume_usd?.h1);
      const priceUsd = finitePositive(parseNumber(attributes.base_token_price_usd));
      const pair = attributes.name || null;

      return {
        ok: true,
        reason: "VALID",
        ageMs,
        liquidityUsd,
        data: {
          chain: network,
          address: attributes.address || poolAddress,
          pair,
          source: "geckoterminal",
          priceUsd,
          liquidityUsd,
          buyVolumeUsd: trades.buyVolumeUsd,
          sellVolumeUsd: trades.sellVolumeUsd,
          volumeUsd,
          previousVolumeUsd: null,
          previousLiquidityUsd: null,
          tradeCount: trades.tradeCount,
          previousTradeCount: null,
          uniqueBuyers: trades.uniqueBuyers,
          uniqueSellers: trades.uniqueSellers,
          largeBuyUsd: trades.largeBuyUsd,
          largeSellUsd: trades.largeSellUsd,
          washTradeRisk: null,
          timestamp: new Date(timestamp).toISOString()
        }
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "PROVIDER_ERROR",
        data: null
      };
    }
  }

  return {
    getFlowSnapshot,
    limits: {
      maxAgeMs: ageLimit,
      minLiquidityUsd: liquidityLimit,
      largeTradeUsd: largeTradeLimit
    }
  };
}

export const DEFAULT_GECKOTERMINAL_LIMITS = DEFAULTS;
