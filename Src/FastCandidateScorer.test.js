import assert from "node:assert/strict";
import { scoreCandidate } from "./FastCandidateScorer.js";

const now = 1_700_000_000_000;

function goodCandidate(overrides = {}) {
  return {
    nowMs: now,
    timestamp: now - 1000,
    safetyPassed: true,
    safetyScore: 92,
    liquidityUsd: 250000,
    spreadPct: 0.12,
    flowImbalancePct: 55,
    largeOrderImbalancePct: 40,
    momentumPct: 2.5,
    ...overrides
  };
}

{
  const result = scoreCandidate(goodCandidate({ liquidityUsd: 5000 }));
  assert.equal(result.action, "HOLD");
  assert.equal(result.gates.liquidity, false);
}

{
  const result = scoreCandidate(goodCandidate({ safetyPassed: false, safetyScore: 99 }));
  assert.equal(result.action, "HOLD");
  assert.equal(result.gates.safety, false);
}

{
  const result = scoreCandidate(goodCandidate({ timestamp: now - 180000 }));
  assert.equal(result.action, "HOLD");
  assert.equal(result.gates.freshness, false);
}

{
  const result = scoreCandidate(goodCandidate({ spreadPct: 1.2 }));
  assert.equal(result.action, "HOLD");
  assert.equal(result.gates.spread, false);
}

{
  const result = scoreCandidate(goodCandidate({ flowImbalancePct: 4 }));
  assert.equal(result.action, "HOLD");
  assert.equal(result.gates.flow, false);
}

{
  const result = scoreCandidate(goodCandidate({ momentumPct: 0.1 }));
  assert.equal(result.action, "HOLD");
  assert.equal(result.gates.momentum, false);
}

{
  const result = scoreCandidate(goodCandidate());
  assert.equal(result.action, "READY");
  assert.ok(result.score >= 80);
  assert.equal(result.gates.safety, true);
  assert.equal(result.gates.liquidity, true);
  assert.equal(result.gates.freshness, true);
}

{
  const result = scoreCandidate(goodCandidate({
    safetyScore: 85,
    liquidityUsd: 30000,
    spreadPct: 0.35,
    flowImbalancePct: 18,
    momentumPct: 0.6,
    largeOrderImbalancePct: 5
  }));
  assert.ok(["WATCH", "HOLD"].includes(result.action));
  assert.ok(result.score < 80);
}

{
  const result = scoreCandidate(goodCandidate({
    safetyScore: undefined,
    safetyPassed: true
  }));
  assert.equal(result.action, "HOLD");
  assert.equal(result.gates.safety, false);
}

{
  const result = scoreCandidate(goodCandidate({
    timestamp: now + 60000
  }));
  assert.equal(result.action, "HOLD");
  assert.equal(result.gates.freshness, false);
}

console.log("Fast candidate scorer tests passed");
