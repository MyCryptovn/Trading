import { createGeckoTerminalDataAdapter } from "./GeckoTerminalDataAdapter.js";
import { createOnchainFlowIntegration } from "./OnchainFlowIntegration.js";

/**
 * Optional read-only DEX flow monitor.
 * It is intentionally disabled unless a network and pool address are configured.
 * It never signs, submits, or executes transactions.
 */
export function createDexFlowMonitor({
  network,
  poolAddress,
  adapter,
  integration
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

  return {
    enabled: true,
    async evaluate() {
      try {
        return await flowIntegration.evaluate({ network, poolAddress });
      } catch (error) {
        return {
          ok: false,
          enabled: true,
          action: "HOLD",
          confidence: 0,
          reason: error instanceof Error ? error.message : "DEX_FLOW_PROVIDER_ERROR"
        };
      }
    }
  };
}
