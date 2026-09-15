import assert from "node:assert/strict";
import { createMultiCoinCandidateEngine } from "./MultiCoinCandidateEngine.js";

const now = Date.now();

const engine = createMultiCoinCandidateEngine({
  maxCandidates: 2,
  maxSpreadPct: 0.4,
  maxAgeMs: 120000
});

const result = engine.rank([
  {
    productId: "BTC-USD",
    price: 100000,
    bid: 99990,
    ask: 100010,
    volume24h: 1000000000,
    change24hPct: 3,
    timestamp: new Date(now).toISOString()
  },
  {
    productId: "ETH-USD",
    price: 4000,
    bid: 3999,
    ask: 4001,
    volume24h: 500000000,
    change24hPct: 2,
    timestamp: new Date(now).toISOString()
  },
  {
    productId: "BAD-USD",
    price: 10,
    bid: 9,
    ask: 10,
    volume24h: 1,
    change24hPct: 1,
    timestamp: new Date(now - 180000).toISOString()
  }
], now);

assert.equal(result.universeSize, 2);
assert.equal(result.candidates.length, 2);
assert.equal(result.candidates[0].productId, "BTC-USD");
assert.ok(result.candidates.every(candidate => Number.isFinite(candidate.triageScore)));

console.log("MultiCoinCandidateEngine tests passed");
