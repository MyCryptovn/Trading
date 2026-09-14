function numberEnv(name, fallback) {
  const value = Number(process.env[name]);

  if (Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

export const config = {
  mode: process.env.BOT_MODE || "paper",

  pollSeconds: Math.max(
    10,
    numberEnv("POLL_SECONDS", 60)
  ),

  startBalance: numberEnv(
    "START_BALANCE_USD",
    1000
  ),

  asset: process.env.ASSET || "BTC",

  buyDropPct: numberEnv(
    "BUY_DROP_PCT",
    2
  ),

  sellRisePct: numberEnv(
    "SELL_RISE_PCT",
    3
  ),

  dexNetwork: process.env.DEX_NETWORK || "",
  dexPoolAddress: process.env.DEX_POOL_ADDRESS || ""
};
