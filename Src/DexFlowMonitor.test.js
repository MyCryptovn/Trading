import assert from "node:assert/strict";
import { createDexFlowMonitor } from "./DexFlowMonitor.js";

const disabled = createDexFlowMonitor();
assert.equal(disabled.enabled, false);
const disabledResult = await disabled.evaluate();
assert.equal(disabledResult.action, "HOLD");
assert.equal(disabledResult.reason, "DEX_FLOW_NOT_CONFIGURED");

let now = 1000;
let calls = 0;
const monitor = createDexFlowMonitor({
  network: "ethereum",
  poolAddress: "0xPOOL",
  refreshMs: 60000,
  clock: () => now,
  integration: {
    async evaluate(query) {
      calls += 1;
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
assert.equal(result.cached, false);
assert.equal(calls, 1);

now = 30000;
const cached = await monitor.evaluate();
assert.equal(cached.ok, true);
assert.equal(cached.cached, true);
assert.equal(calls, 1);

now = 61001;
const refreshed = await monitor.evaluate();
assert.equal(refreshed.ok, true);
assert.equal(refreshed.cached, false);
assert.equal(calls, 2);

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
assert.equal(failed.cached, false);

console.log("DEX flow monitor test passed");
