import assert from "node:assert/strict";
import { createTradingAgentsAdapter } from "./TradingAgentsAdapter.js";

const now = Date.now();
const snapshot = {
  symbol: "BTC",
  price: 100000,
  timestamp: now
};

{
  const adapter = createTradingAgentsAdapter();
  const result = await adapter.analyze({ snapshot, nowMs: now });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "TRADINGAGENTS_NOT_CONFIGURED");
  assert.equal(result.action, "UNKNOWN");
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
  const adapter = createTradingAgentsAdapter({
    runner: async () => ({ decision: "BUY", confidence: 80 })
  });
  const result = await adapter.analyze({
    snapshot: { ...snapshot, timestamp: now },
    nowMs: now,
    context: { regime: "TREND_UP" }
  });
  assert.equal(result.ok, true);
}

console.log("TradingAgents adapter tests passed");
