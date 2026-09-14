import assert from "node:assert/strict";
import { createMarketDataQualityGate } from "./DataQualityGate.js";

const now = Date.parse("2026-09-14T18:00:00.000Z");
const gate = createMarketDataQualityGate({
  clock: () => now,
  maxAgeMs: 120000,
  maxFutureMs: 5000,
  maxSpreadPct: 5
});

function ticker(overrides = {}) {
  return {
    productId: "BTC-USD",
    price: 100,
    bid: 99.9,
    ask: 100.1,
    spreadPct: 0.2,
    timestamp: new Date(now).toISOString(),
    ...overrides
  };
}

assert.equal(gate.validate(ticker()).ok, true);
assert.equal(gate.validate(ticker({ price: 0 })).reason, "INVALID_PRICE");
assert.equal(gate.validate(ticker({ ask: 99 })).reason, "INVALID_ASK");
assert.equal(gate.validate(ticker({ timestamp: new Date(now - 180000).toISOString() })).reason, "STALE_DATA");
assert.equal(gate.validate(ticker({ timestamp: new Date(now + 10000).toISOString() })).reason, "FUTURE_TIMESTAMP");
assert.equal(gate.validate(ticker({ bid: 90, ask: 100, spreadPct: 10 })).reason, "INVALID_REPORTED_SPREAD");
assert.equal(gate.validate(ticker({ bid: 99.9, ask: 100.1, spreadPct: 1 })).reason, "SPREAD_DISCREPANCY");

console.log("Market data quality gate test passed");
