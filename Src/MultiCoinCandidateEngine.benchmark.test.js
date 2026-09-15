import assert from "node:assert/strict";
import { createMultiCoinCandidateEngine } from "./MultiCoinCandidateEngine.js";

const now = Date.now();
const records = Array.from({ length: 10000 }, (_, i) => ({
  productId: `COIN${i}-USD`,
  price: 1 + i,
  bid: 1 + i,
  ask: 1.0005 + i,
  volume24h: 1000000 + i * 1000,
  change24hPct: (i % 20) / 2,
  timestamp: new Date(now).toISOString()
}));

const engine = createMultiCoinCandidateEngine({ maxCandidates: 50 });
const started = process.hrtime.bigint();
const result = engine.rank(records, now);
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

assert.equal(result.universeSize, 10000);
assert.equal(result.candidates.length, 50);
assert.ok(result.candidates.every(candidate => Number.isFinite(candidate.triageScore)));

console.log(`Multi-coin triage benchmark: ${records.length} records -> ${result.candidates.length} candidates in ${elapsedMs.toFixed(2)} ms`);
