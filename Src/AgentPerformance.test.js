import assert from "node:assert/strict";
import { createAgentPerformance } from "./AgentPerformance.js";

const performance = createAgentPerformance({ maxRecords: 10 });

assert.equal(
  performance.record({ agent: "quant", symbol: "BTC", action: "BUY", confidence: 0.8, correct: true, pnlUsd: 4 }).ok,
  true
);
assert.equal(
  performance.record({ agent: "quant", symbol: "BTC", action: "SELL", confidence: 0.6, correct: false, pnlUsd: -2 }).ok,
  true
);
assert.equal(
  performance.record({ agent: "news", symbol: "BTC", action: "HOLD", confidence: 0.9 }).ok,
  true
);

const quant = performance.summarize("quant");
assert.equal(quant.records, 2);
assert.equal(quant.resolved, 2);
assert.equal(quant.accuracy, 0.5);
assert.equal(quant.totalPnlUsd, 2);
assert.equal(quant.averageConfidence, 0.7);

const all = performance.allAgents();
assert.equal(all.length, 2);
assert.equal(performance.list(2).length, 2);

console.log("Agent Performance test passed");
