const DEFAULTS = Object.freeze({
  minLiquidityUsd: 25000,
  maxBuyTaxPct: 8,
  maxSellTaxPct: 8,
  maxTopHolderPct: 25,
  minSafetyScore: 70,
  maxDataAgeMs: 120000,
  maxFutureMs: 30000
});

function finiteNonNegative(value) {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0;
}

function finiteTimestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "string" || typeof value === "number") {
    const timestamp = typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
}

function bool(value) {
  return value === true;
}

/**
 * Conservative pre-trade token safety admission gate.
 * Critical unknown or stale security data is rejected, never treated as safe.
 * This module never executes a transaction or calls a wallet.
 */
export function createTokenSafetyScanner(options = {}) {
  const limits = {
    minLiquidityUsd: finiteNonNegative(options.minLiquidityUsd)
      ? options.minLiquidityUsd : DEFAULTS.minLiquidityUsd,
    maxBuyTaxPct: finiteNonNegative(options.maxBuyTaxPct)
      ? options.maxBuyTaxPct : DEFAULTS.maxBuyTaxPct,
    maxSellTaxPct: finiteNonNegative(options.maxSellTaxPct)
      ? options.maxSellTaxPct : DEFAULTS.maxSellTaxPct,
    maxTopHolderPct: finiteNonNegative(options.maxTopHolderPct)
      ? options.maxTopHolderPct : DEFAULTS.maxTopHolderPct,
    minSafetyScore: finiteNonNegative(options.minSafetyScore)
      ? options.minSafetyScore : DEFAULTS.minSafetyScore,
    maxDataAgeMs: finiteNonNegative(options.maxDataAgeMs)
      ? options.maxDataAgeMs : DEFAULTS.maxDataAgeMs,
    maxFutureMs: finiteNonNegative(options.maxFutureMs)
      ? options.maxFutureMs : DEFAULTS.maxFutureMs
  };

  function scan(token = {}, { nowMs = Date.now() } = {}) {
    const reasons = [];
    const warnings = [];
    let score = 100;

    const liquidityUsd = token.liquidityUsd;
    const buyTaxPct = token.buyTaxPct;
    const sellTaxPct = token.sellTaxPct;
    const topHolderPct = token.topHolderPct;
    const timestampMs = finiteTimestamp(token.timestamp);

    if (!token.address || !token.chain) {
      reasons.push("TOKEN_IDENTITY_MISSING");
    }

    if (!finiteNonNegative(liquidityUsd)) {
      reasons.push("LIQUIDITY_UNKNOWN");
    } else if (liquidityUsd < limits.minLiquidityUsd) {
      score -= 30;
      reasons.push("LIQUIDITY_TOO_LOW");
    }

    if (!finiteNonNegative(buyTaxPct)) {
      reasons.push("BUY_TAX_UNKNOWN");
    } else if (buyTaxPct > limits.maxBuyTaxPct) {
      score -= 20;
      reasons.push("BUY_TAX_TOO_HIGH");
    }

    if (!finiteNonNegative(sellTaxPct)) {
      reasons.push("SELL_TAX_UNKNOWN");
    } else if (sellTaxPct > limits.maxSellTaxPct) {
      score -= 25;
      reasons.push("SELL_TAX_TOO_HIGH");
    }

    if (!finiteNonNegative(topHolderPct)) {
      reasons.push("HOLDER_CONCENTRATION_UNKNOWN");
    } else if (topHolderPct > limits.maxTopHolderPct) {
      score -= 20;
      reasons.push("HOLDER_CONCENTRATION_HIGH");
    }

    if (timestampMs === null) {
      reasons.push("SAFETY_DATA_TIMESTAMP_UNKNOWN");
    } else {
      const ageMs = nowMs - timestampMs;
      if (ageMs < -limits.maxFutureMs) {
        reasons.push("SAFETY_DATA_TIMESTAMP_IN_FUTURE");
      } else if (ageMs > limits.maxDataAgeMs) {
        reasons.push("SAFETY_DATA_STALE");
      }
    }

    if (token.honeypot !== false) {
      reasons.push(token.honeypot === true ? "HONEYPOT_DETECTED" : "HONEYPOT_UNKNOWN");
    }

    if (token.sellBlocked !== false) {
      reasons.push(token.sellBlocked === true ? "SELL_BLOCKED" : "SELL_BLOCK_STATUS_UNKNOWN");
    }

    if (token.mintAuthorityRisk !== false) {
      reasons.push(token.mintAuthorityRisk === true ? "MINT_AUTHORITY_RISK" : "MINT_AUTHORITY_UNKNOWN");
    }

    if (token.blacklistRisk !== false) {
      reasons.push(token.blacklistRisk === true ? "BLACKLIST_RISK" : "BLACKLIST_STATUS_UNKNOWN");
    }

    if (token.proxyRisk !== false) {
      reasons.push(token.proxyRisk === true ? "PROXY_CONTRACT_RISK" : "PROXY_STATUS_UNKNOWN");
    }

    if (token.liquidityLocked !== true) {
      reasons.push(token.liquidityLocked === false ? "LIQUIDITY_NOT_LOCKED" : "LIQUIDITY_LOCK_UNKNOWN");
    }

    if (token.contractVerified !== true) {
      reasons.push(token.contractVerified === false ? "CONTRACT_NOT_VERIFIED" : "CONTRACT_VERIFICATION_UNKNOWN");
    }

    if (token.sellTestPassed !== true) {
      reasons.push(token.sellTestPassed === false ? "SELL_TEST_FAILED" : "SELL_TEST_UNKNOWN");
    }

    score = Math.max(0, Math.min(100, score));

    const blocked = reasons.length > 0 || score < limits.minSafetyScore;

    if (score < limits.minSafetyScore && !reasons.includes("SAFETY_SCORE_TOO_LOW")) {
      reasons.push("SAFETY_SCORE_TOO_LOW");
    }

    return {
      safe: !blocked,
      action: blocked ? "REJECT" : "PASS",
      admitted: !blocked,
      score,
      reasons,
      warnings,
      token: token.address || token.symbol || "UNKNOWN"
    };
  }

  return { scan, limits };
}

export const DEFAULT_TOKEN_SAFETY_LIMITS = DEFAULTS;
