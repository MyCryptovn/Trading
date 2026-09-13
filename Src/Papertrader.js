import { createTradingCosts } from "./TradingCosts.js";

export function createPaperTrader(startUsd, costs = {}) {
  return {
    usd: startUsd,
    asset: 0,
    entryPrice: null,
    trades: [],
    costs: createTradingCosts(costs)
  };
}

export function buy(state, price, maxUsd = state.usd) {
  if (state.usd <= 0 || !Number.isFinite(price) || price <= 0) {
    return false;
  }

  const tradeUsd = Math.min(state.usd, Number(maxUsd));
  if (!Number.isFinite(tradeUsd) || tradeUsd <= 0) {
    return false;
  }

  const executionPrice = state.costs.buyPrice(price);
  const feeUsd = state.costs.fee(tradeUsd);
  const netUsd = tradeUsd - feeUsd;
  const amount = netUsd / executionPrice;

  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  state.asset += amount;
  state.entryPrice = executionPrice;
  state.usd -= tradeUsd;

  state.trades.push({
    side: "BUY",
    quotedPrice: price,
    executionPrice,
    amount,
    tradeUsd,
    feeUsd,
    time: new Date().toISOString()
  });

  return true;
}

export function sell(state, price) {
  if (state.asset <= 0 || !Number.isFinite(price) || price <= 0) {
    return false;
  }

  const amount = state.asset;
  const executionPrice = state.costs.sellPrice(price);
  const grossUsd = amount * executionPrice;
  const feeUsd = state.costs.fee(grossUsd);
  const netUsd = grossUsd - feeUsd;

  if (!Number.isFinite(netUsd) || netUsd < 0) {
    return false;
  }

  state.usd += netUsd;

  state.trades.push({
    side: "SELL",
    quotedPrice: price,
    executionPrice,
    amount,
    feeUsd,
    time: new Date().toISOString()
  });

  state.asset = 0;
  state.entryPrice = null;

  return true;
}

export function getEquity(state, price) {
  if (!Number.isFinite(price) || price < 0) {
    return state.usd;
  }

  return state.usd + state.asset * price;
}
