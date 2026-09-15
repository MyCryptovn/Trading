import assert from "node:assert/strict";
import { createFastCandidatePipeline } from "./FastCandidatePipeline.js";

const now = Date.now();
const base = {
  id: "ETH-USD",
  symbol: "ETH",
  chain: "ethereum",
  liquidityUsd: 100000,
  spreadPct: 0.10,
  timestamp: now,
  safetyScore: 90,
  safetyPassed: true,
  flowImbalancePct: 30,
  momentumPct: 1.5,
  largeOrderImbalancePct: 20
};

const pipeline = createFastCandidatePipeline();

const ready = pipeline.evaluate([base], now);
assert.equal(ready.candidates.length, 1);
assert.equal(ready.candidates[0].symbol, "ETH");
assert.ok(ready.candidates[0].score >= 0);
assert.equal(ready.candidates[0].gates.safety, true);
assert.equal(ready.candidates[0].gates.liquidity, true);
assert.equal(ready.candidates[0].gates.freshness, true);
assert.equal(ready.candidates[0].gates.spread, true);
assert.equal(ready.candidates[0].gates.flow, true);
assert.equal(ready.candidates[0].gates.momentum, true);

const unsafe = pipeline.evaluate([{ ...base, safetyPassed: false }], now);
assert.equal(unsafe.candidates.length, 0);
assert.equal(unsafe.rejected, 1);

const stale = pipeline.evaluate([{ ...base, timestamp: now - 180000 }], now);
assert.equal(stale.candidates.length, 0);
assert.equal(stale.rejected, 1);

const wideSpread = pipeline.evaluate([{ ...base, spreadPct: 1 }], now);
assert.equal(wideSpread.candidates.length, 0);
assert.equal(wideSpread.rejected, 1);

const invalid = pipeline.evaluate(null, now);
assert.deepEqual(invalid.candidates, []);
assert.equal(invalid.reasons[0], "INVALID_CANDIDATE_INPUT");

console.log("FastCandidatePipeline tests passed");
