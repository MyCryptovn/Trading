import assert from "node:assert/strict";
import { createTradingAgentsAdapter } from "./TradingAgentsAdapter.js";

const now = Date.now();
const snapshot = {
  symbol: "BTC",
  price: 100000,
  timestamp: now
};

{
  const previousEnabled = process.env.TRADINGAGENTS_ENABLED;
  delete process.env.TRADINGAGENTS_ENABLED;
  try {
    const adapter = createTradingAgentsAdapter();
    const result = await adapter.analyze({ snapshot, nowMs: now });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "TRADINGAGENTS_NOT_CONFIGURED");
    assert.equal(result.action, "UNKNOWN");
  } finally {
    if (previousEnabled === undefined) delete process.env.TRADINGAGENTS_ENABLED;
    else process.env.TRADINGAGENTS_ENABLED = previousEnabled;
  }
}

{
  const adapter = createTradingAgentsAdapter({
    runner: async () => ({ decision: "Buy", confidence: 82 })
  });
  const result = await adapter.analyze({ snapshot, nowMs: now });
  assert.equal(result.ok, true);
  assert.equal(result.action, "BUY");
  assert.equal(result.confidence, 0.82);
}

{
  const adapter = createTradingAgentsAdapter({
    runner: async () => ({ decision: "REVIEW", confidence: 90 })
  });
  const result = await adapter.analyze({ snapshot, nowMs: now });
  assert.equal(result.ok, false);
  assert.equal(result.action, "UNKNOWN");
  assert.equal(result.reason, "INVALID_DECISION");
}

{
  const adapter = createTradingAgentsAdapter({
    runner: async () => ({ decision: "SELL", confidence: 0.75 })
  });
  const result = await adapter.analyze({ snapshot, nowMs: now });
  assert.equal(result.ok, true);
  assert.equal(result.action, "SELL");
  assert.equal(result.confidence, 0.75);
}

{
  const adapter = createTradingAgentsAdapter({
    runner: async () => ({ decision: "BUY", confidence: 80 })
  });
  const result = await adapter.analyze({
    snapshot: { ...snapshot, timestamp: now - 120001 },
    nowMs: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "STALE_SNAPSHOT");
}

{
  let calls = 0;
  const adapter = createTradingAgentsAdapter({
    runner: async () => {
      calls += 1;
      return { decision: "BUY", confidence: 80 };
    }
  });
  const result = await adapter.analyze({
    snapshot: { ...snapshot, timestamp: now - 120001 },
    nowMs: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.action, "UNKNOWN");
  assert.equal(calls, 0);
}

{
  const adapter = createTradingAgentsAdapter({
    runner: async () => ({ decision: "BUY", confidence: 59 })
  });
  const result = await adapter.analyze({ snapshot, nowMs: now });
  assert.equal(result.ok, true);
  assert.equal(result.action, "BUY");
  assert.equal(result.confidence, 0.59);
}

{
  const adapter = createTradingAgentsAdapter({
    runner: async () => ({ decision: "BUY" })
  });
  const result = await adapter.analyze({ snapshot, nowMs: now });
  assert.equal(result.ok, true);
  assert.equal(result.action, "BUY");
  assert.equal(result.confidence, 0);
  assert.equal(result.confidenceCalibrated, false);
  assert.equal(result.reason, "TRADINGAGENTS_UNCALIBRATED_DECISION");
}

{
  const adapter = createTradingAgentsAdapter({
    runner: async () => {
      throw new Error("runner offline");
    }
  });
  const result = await adapter.analyze({ snapshot, nowMs: now });
  assert.equal(result.ok, false);
  assert.equal(result.action, "UNKNOWN");
  assert.equal(result.reason, "TRADINGAGENTS_ERROR");
}

{
  const adapter = createTradingAgentsAdapter({
    runner: async ({ context }) => {
      assert.equal(context.regime, "TREND_UP");
      return { decision: "BUY", confidence: 80 };
    }
  });
  const result = await adapter.analyze({
    snapshot: { ...snapshot, timestamp: now },
    nowMs: now,
    context: { regime: "TREND_UP" }
  });
  assert.equal(result.ok, true);
}

console.log("TradingAgents adapter tests passed");
