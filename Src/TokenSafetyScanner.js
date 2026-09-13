const DEFAULTS = Object.freeze({
  minLiquidityUsd: 25000,
  maxBuyTaxPct: 8,
  maxSellTaxPct: 8,
  maxTopHolderPct: 25,
  minSafetyScore: 70
});

function nonNegative(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function bool(value) {
  return value === true;
}

/**
 * Conservative pre-trade token safety gate.
 * Missing security data is treated as unknown, not as proof of safety.
 * This module never executes a transaction or calls a wallet.
 */
export function createTokenSafetyScanner(options = {}) {
  const limits = {
    minLiquidityUsd: nonNegative(options.minLiquidityUsd, DEFAULTS.minLiquidityUsd),
    maxBuyTaxPct: nonNegative(options.maxBuyTaxPct, DEFAULTS.maxBuyTaxPct),
    maxSellTaxPct: nonNegative(options.maxSellTaxPct, DEFAULTS.maxSellTaxPct),
    maxTopHolderPct: nonNegative(options.maxTopHolderPct, DEFAULTS.maxTopHolderPct),
    minSafetyScore: nonNegative(options.minSafetyScore, DEFAULTS.minSafetyScore)
  };

  function scan(token = {}) {
    const reasons = [];
    const warnings = [];
    let score = 100;

    const liquidityUsd = nonNegative(token.liquidityUsd, 0);
    const buyTaxPct = nonNegative(token.buyTaxPct, 0);
    const sellTaxPct = nonNegative(token.sellTaxPct, 0);
    const topHolderPct = nonNegative(token.topHolderPct, 0);

    if (liquidityUsd < limits.minLiquidityUsd) {
      score -= 30;
      reasons.push("LIQUIDITY_TOO_LOW");
    }

    if (buyTaxPct > limits.maxBuyTaxPct) {
      score -= 20;
      reasons.push("BUY_TAX_TOO_HIGH");
    }

    if (sellTaxPct > limits.maxSellTaxPct) {
      score -= 25;
      reasons.push("SELL_TAX_TOO_HIGH");
    }

    if (topHolderPct > limits.maxTopHolderPct) {
      score -= 20;
      reasons.push("HOLDER_CONCENTRATION_HIGH");
    }

    if (bool(token.honeypot)) {
      score -= 100;
      reasons.push("HONEYPOT_DETECTED");
    }

    if (bool(token.sellBlocked)) {
      score -= 100;
      reasons.push("SELL_BLOCKED");
    }

    if (bool(token.mintAuthorityRisk)) {
      score -= 25;
      warnings.push("MINT_AUTHORITY_RISK");
    }

    if (bool(token.blacklistRisk)) {
      score -= 25;
      warnings.push("BLACKLIST_RISK");
    }

    if (bool(token.proxyRisk)) {
      score -= 15;
      warnings.push("PROXY_CONTRACT_RISK");
    }

    if (token.liquidityLocked === false) {
      score -= 20;
      warnings.push("LIQUIDITY_NOT_LOCKED");
    } else if (token.liquidityLocked === undefined) {
      warnings.push("LIQUIDITY_LOCK_UNKNOWN");
    }

    if (token.contractVerified === false) {
      score -= 15;
      warnings.push("CONTRACT_NOT_VERIFIED");
    } else if (token.contractVerified === undefined) {
      warnings.push("CONTRACT_VERIFICATION_UNKNOWN");
    }

    const hasTradeTest = bool(token.sellTestPassed);
    if (token.sellTestPassed === false) {
      score -= 100;
      reasons.push("SELL_TEST_FAILED");
    } else if (!hasTradeTest) {
      warnings.push("SELL_TEST_UNKNOWN");
    }

    score = Math.max(0, Math.min(100, score));

    const blocked = reasons.length > 0 || score < limits.minSafetyScore;

    if (score < limits.minSafetyScore && reasons.length === 0) {
      reasons.push("SAFETY_SCORE_TOO_LOW");
    }

    return {
      safe: !blocked,
      action: blocked ? "HOLD" : "PASS",
      score,
      reasons,
      warnings,
      token: token.address || token.symbol || "UNKNOWN"
    };
  }

  return { scan, limits };
}

export const DEFAULT_TOKEN_SAFETY_LIMITS = DEFAULTS;
