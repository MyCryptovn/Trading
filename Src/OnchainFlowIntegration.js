import { createCapitalFlowScanner } from "./CapitalFlowScanner.js";

/**
 * Connects validated on-chain/DEX snapshots to the capital-flow scanner.
 * This layer is analysis-only: it never signs, submits, or executes trades.
 */
export function createOnchainFlowIntegration({
  adapter,
  flowScanner = createCapitalFlowScanner()
} = {}) {
  if (!adapter || typeof adapter.getFlowSnapshot !== "function") {
    throw new TypeError("adapter.getFlowSnapshot must be a function");
  }

  if (!flowScanner || typeof flowScanner.scan !== "function") {
    throw new TypeError("flowScanner.scan must be a function");
  }

  async function evaluate(query = {}) {
    const snapshot = await adapter.getFlowSnapshot(query);

    if (!snapshot.ok) {
      return {
        ok: false,
        action: "HOLD",
        reason: `ONCHAIN_${snapshot.reason}`,
        confidence: 0,
        snapshot
      };
    }

    const flow = flowScanner.scan(snapshot.data);

    return {
      ok: true,
      action: flow.action,
      confidence: flow.confidence,
      reason: flow.reasons[0] || "FLOW_EVALUATED",
      flow,
      snapshot
    };
  }

  return { evaluate };
}
