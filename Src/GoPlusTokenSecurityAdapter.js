function flag(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value) === "1";
}

function pctFromRatio(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number * 100 : null;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function topHolderPercent(holders) {
  if (!Array.isArray(holders) || holders.length === 0) return null;
  const values = holders
    .map(holder => finite(holder?.percent))
    .filter(value => value !== null);
  return values.length ? Math.max(...values) * 100 : null;
}

function dexLiquidity(data) {
  if (!Array.isArray(data?.dex)) return null;
  const values = data.dex
    .map(pool => finite(pool?.liquidity))
    .filter(value => value !== null);
  return values.length ? Math.max(...values) : null;
}

function mapTokenSecurity(data, { chainId, address, observedAt }) {
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "TOKEN_SECURITY_EMPTY" };
  }

  const isOpenSource = flag(data.is_open_source);
  const isProxy = flag(data.is_proxy);
  const isMintable = flag(data.is_mintable);
  const honeypot = flag(data.is_honeypot);
  const cannotSellAll = flag(data.cannot_sell_all);
  const cannotBuy = flag(data.cannot_buy);
  const blacklist = flag(data.is_blacklisted);
  const inDex = flag(data.is_in_dex);
  const liquidityLocked = Array.isArray(data.lp_holders) && data.lp_holders.length > 0
    ? data.lp_holders.every(holder => holder?.is_locked === "1")
    : null;

  const buyTaxPct = pctFromRatio(data.buy_tax);
  const sellTaxPct = pctFromRatio(data.sell_tax);

  const token = {
    address,
    chain: String(chainId),
    liquidityUsd: dexLiquidity(data),
    buyTaxPct,
    sellTaxPct,
    topHolderPct: topHolderPercent(data.holders),
    honeypot,
    sellBlocked: cannotSell === true || cannotSellAll === true,
    mintAuthorityRisk: isMintable,
    blacklistRisk: blacklist,
    proxyRisk: isProxy,
    liquidityLocked,
    contractVerified: isOpenSource,
    sellTestPassed: cannotSell === false && cannotSellAll === false,
    timestamp: new Date(observedAt).toISOString(),
    timestampSource: "adapter_observed_at",
    tokenName: data.token_name || null,
    tokenSymbol: data.token_symbol || null,
    isInDex: inDex,
    trustList: flag(data.trust_list),
    rawSecurityFlags: {
      isOpenSource,
      isProxy,
      isMintable,
      honeypot,
      cannotBuy,
      cannotSellAll,
      blacklist
    }
  };

  if (token.liquidityUsd === null) {
    return { ok: false, reason: "LIQUIDITY_UNKNOWN", token };
  }

  if (inDex !== true) {
    return { ok: false, reason: "TOKEN_NOT_IN_DEX", token };
  }

  return { ok: true, reason: "VALID", token };
}

/**
 * Read-only GoPlus Token Security API adapter.
 * It never connects wallets, signs, submits, or executes transactions.
 *
 * The provider endpoint is documented at:
 * https://api.gopluslabs.io/api/v1/token_security/{chain_id}
 */
export function createGoPlusTokenSecurityAdapter({
  fetchImpl = globalThis.fetch,
  accessToken = process.env.GOPLUS_ACCESS_TOKEN,
  baseUrl = "https://api.gopluslabs.io/api/v1",
  clock = () => Date.now()
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  async function getSecurity({ chainId, tokenAddress } = {}) {
    if (!chainId || !tokenAddress) {
      return { ok: false, reason: "TOKEN_SECURITY_IDENTITY_MISSING" };
    }

    if (!accessToken) {
      return { ok: false, reason: "GOPLUS_ACCESS_TOKEN_MISSING" };
    }

    const url = `${baseUrl}/token_security/${encodeURIComponent(chainId)}?contract_addresses=${encodeURIComponent(tokenAddress)}`;

    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        return { ok: false, reason: `GOPLUS_HTTP_${response.status}` };
      }

      const payload = await response.json();
      if (Number(payload?.code) !== 1) {
        return { ok: false, reason: payload?.message || "GOPLUS_API_ERROR" };
      }

      const data = payload?.result?.[String(tokenAddress).toLowerCase()]
        || payload?.result?.[tokenAddress]
        || null;

      return mapTokenSecurity(data, {
        chainId,
        address: tokenAddress,
        observedAt: clock()
      });
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "GOPLUS_PROVIDER_ERROR"
      };
    }
  }

  return { getSecurity };
}

export { mapTokenSecurity };
