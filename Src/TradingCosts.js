const DEFAULT_FEE_PCT = 0.30;
const DEFAULT_SLIPPAGE_PCT = 0.10;

function safePct(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function createTradingCosts({
  feePct = DEFAULT_FEE_PCT,
  slippagePct = DEFAULT_SLIPPAGE_PCT
} = {}) {
  const feeRate = safePct(feePct, DEFAULT_FEE_PCT) / 100;
  const slippageRate = safePct(slippagePct, DEFAULT_SLIPPAGE_PCT) / 100;

  function buyPrice(quotedPrice) {
    return quotedPrice * (1 + slippageRate);
  }

  function sellPrice(quotedPrice) {
    return quotedPrice * (1 - slippageRate);
  }

  function fee(amountUsd) {
    return amountUsd * feeRate;
  }

  return { feeRate, slippageRate, buyPrice, sellPrice, fee };
}

export const DEFAULT_TRADING_COSTS = Object.freeze({
  feePct: DEFAULT_FEE_PCT,
  slippagePct: DEFAULT_SLIPPAGE_PCT
});
