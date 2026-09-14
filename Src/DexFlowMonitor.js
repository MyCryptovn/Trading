import { createGeckoTerminalDataAdapter } from "./GeckoTerminalDataAdapter.js";
import { createOnchainFlowIntegration } from "./OnchainFlowIntegration.js";

const DEFAULT_REFRESH_MS = 60000;

/**
 * Optional read-only DEX flow monitor.
 * It is intentionally disabled unless a network and pool address are configured.
 * It never signs, submits, or executes transactions.
 * A short cache prevents unnecessary provider calls when the main bot polls faster
 * than the DEX data refresh interval.
 */
export function createDexFlowMonitor({
  network,
  poolAddress,
  adapter,
  integration,
  refreshMs = DEFAULT_REFRESH_MS,
  clock = () => Date.now()
} = {}) {
  if (!network || !poolAddress) {
    return {
      enabled: false,
      async evaluate() {
        return { ok: false, enabled: false, action: "HOLD", reason: "DEX_FLOW_NOT_CONFIGURED" };
      }
    };
  }

  const dataAdapter = adapter || createGeckoTerminalDataAdapter();
  const flowIntegration = integration || createOnchainFlowIntegration({ adapter: dataAdapter });
  const refreshInterval = Number.isFinite(refreshMs) && refreshMs >= 0
    ? refreshMs
    : DEFAULT_REFRESH_MS;

  let cachedResult = null;
  let cachedAt = 0;

  return {
    enabled: true,
    async evaluate() {
      const now = clock();
      if (cachedResult?.ok && now - cachedAt < refreshInterval) {
        return {
          ...cachedResult,
          cached: true
        };
      }

      try {
        const result = await flowIntegration.evaluate({ network, poolAddress });
        if (result?.ok) {
          cachedResult = result;
          cachedAt = clock();
        } else {
          cachedResult = null;
          cachedAt = 0;
        }

        return {
          ...result,
          cached: false
        };
      } catch (error) {
        cachedResult = null;
        cachedAt = 0;
        return {
          ok: false,
          enabled: true,
          cached: false,
          action: "HOLD",
          confidence: 0,
          reason: error instanceof Error ? error.message : "DEX_FLOW_PROVIDER_ERROR"
        };
      }
    },
    limits: { refreshMs: refreshInterval }
  };
}

export const DEFAULT_DEX_FLOW_MONITOR_LIMITS = Object.freeze({
  refreshMs: DEFAULT_REFRESH_MS
});
