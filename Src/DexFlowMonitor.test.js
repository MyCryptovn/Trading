import assert from "node:assert/strict";
import { createDexFlowMonitor } from "./DexFlowMonitor.js";

const disabled = createDexFlowMonitor();
assert.equal(disabled.enabled, false);
const disabledResult = await disabled.evaluate();
assert.equal(disabledResult.action, "HOLD");
assert.equal(disabledResult.reason, "DEX_FLOW_NOT_CONFIGURED");

const monitor = createDexFlowMonitor({
  network: "ethereum",
  poolAddress: "0xPOOL",
  integration: {
    async evaluate(query) {
      assert.deepEqual(query, { network: "ethereum", poolAddress: "0xPOOL" });
      return { ok: true, action: "FLOW_UP", confidence: 85, reason: "BUY_FLOW_DOMINANT" };
    }
  }
});

assert.equal(monitor.enabled, true);
const result = await monitor.evaluate();
assert.equal(result.ok, true);
assert.equal(result.action, "FLOW_UP");
assert.equal(result.confidence, 85);

const failing = createDexFlowMonitor({
  network: "ethereum",
  poolAddress: "0xPOOL",
  integration: {
    async evaluate() {
      throw new Error("fixture failure");
    }
  }
});

const failed = await failing.evaluate();
assert.equal(failed.action, "HOLD");
assert.equal(failed.reason, "fixture failure");

console.log("DEX flow monitor test passed");
