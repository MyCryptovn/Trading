import assert from "node:assert/strict";
import { createDecisionMemory } from "./DecisionMemory.js";

const memory = createDecisionMemory({ maxEntries: 2 });

const first = memory.record({ symbol: "BTC", action: "BUY", confidence: 0.8, regime: "TREND_UP" });
assert.equal(first.ok, true);
assert.equal(first.entry.action, "BUY");

const second = memory.record({ symbol: "BTC", action: "SELL", confidence: 0.7 });
assert.equal(second.ok, true);

const invalid = memory.record({ timestamp: "not-a-date", action: "BUY" });
assert.equal(invalid.ok, false);
assert.equal(invalid.reason, "INVALID_TIMESTAMP");

const attached = memory.attachOutcome(first.entry.id, { pnlUsd: 3.5, status: "CLOSED" });
assert.equal(attached.ok, true);
assert.equal(attached.entry.outcome.pnlUsd, 3.5);

const stats = memory.stats();
assert.equal(stats.size, 2);
assert.equal(stats.counts.SELL, 1);

const list = memory.list(10);
assert.equal(list.length, 2);

console.log("Decision Memory test passed");
