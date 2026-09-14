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

  statisticalHorizonMs: Math.max(
    60_000,
    numberEnv("STATISTICAL_HORIZON_MS", 15 * 60 * 1000)
  ),

  statisticalMaxSamples: Math.max(
    100,
    numberEnv("STATISTICAL_MAX_SAMPLES", 5000)
  ),

  statisticalJournalPath: process.env.STATISTICAL_JOURNAL_PATH || "data/statistical-journal.jsonl",

  statisticalMinSamples: Math.max(
    20,
    numberEnv("STATISTICAL_MIN_SAMPLES", 50)
  ),

  statisticalTestWindow: Math.max(
    5,
    numberEnv("STATISTICAL_TEST_WINDOW", 20)
  ),

  statisticalMinDirectionalProbability: Math.min(
    0.99,
    Math.max(0.50, numberEnv("STATISTICAL_MIN_DIRECTIONAL_PROBABILITY", 0.60))
  ),

  statisticalMinLowerBound95: Math.min(
    0.99,
    Math.max(0.50, numberEnv("STATISTICAL_MIN_LOWER_BOUND_95", 0.55))
  ),

  statisticalMinExpectedValuePct: Math.max(
    0,
    numberEnv("STATISTICAL_MIN_EXPECTED_VALUE_PCT", 0.20)
  ),

  // Round-trip paper cost assumption: 0.30% fee + 0.10% slippage on entry
  // and the same on exit. This is a cost model, not a BUY/SELL price trigger.
  statisticalRoundTripCostPct: Math.max(
    0,
    numberEnv("STATISTICAL_ROUND_TRIP_COST_PCT", 0.80)
  ),

  pipelineTimeoutMs: Math.max(
    1_000,
    numberEnv("PIPELINE_TIMEOUT_MS", 15_000)
  ),

  pipelineRetries: Math.min(
    5,
    Math.max(0, Math.floor(numberEnv("PIPELINE_RETRIES", 2)))
  ),

  pipelineRetryDelayMs: Math.max(
    100,
    numberEnv("PIPELINE_RETRY_DELAY_MS", 750)
  ),

  pipelineCircuitFailureThreshold: Math.max(
    1,
    Math.floor(numberEnv("PIPELINE_CIRCUIT_FAILURE_THRESHOLD", 3))
  ),

  pipelineCircuitCooldownMs: Math.max(
    5_000,
    numberEnv("PIPELINE_CIRCUIT_COOLDOWN_MS", 30_000)
  ),

  dexNetwork: process.env.DEX_NETWORK || "",
  dexPoolAddress: process.env.DEX_POOL_ADDRESS || "",
  dexAsset: process.env.DEX_ASSET || ""
};
