export function createPaperTrader(startUsd) {
  return {
    usd: startUsd,
    asset: 0,
    entryPrice: null,
    trades: []
  };
}

export function buy(state, price) {
  if (state.usd <= 0) {
    return false;
  }

  const amount =
    state.usd / price;

  state.asset += amount;
  state.entryPrice = price;

  state.trades.push({
    side: "BUY",
    price,
    amount,
    time: new Date().toISOString()
  });

  state.usd = 0;

  return true;
}

export function sell(state, price) {
  if (state.asset <= 0) {
    return false;
  }

  const amount = state.asset;

  state.usd += amount * price;

  state.trades.push({
    side: "SELL",
    price,
    amount,
    time: new Date().toISOString()
  });

  state.asset = 0;
  state.entryPrice = null;

  return true;
}

export function getEquity(state, price) {
  return (
    state.usd +
    state.asset * price
  );
}
