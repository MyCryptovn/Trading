import assert from "node:assert/strict";
import {
  estimateStatisticalEdge,
  walkForwardValidate
} from "./StatisticalEdgeEngine.js";

const baseTimestamp = 1_700_000_000_000;

function makeSamples({
  up = 0,
  down = 0,
  flat = 0,
  contextKey = "BTC|FLOW_UP|MOMENTUM_UP",
  start = baseTimestamp
} = {}) {
  const samples = [];
  let timestamp = start;

  for (let i = 0; i < up; i += 1) {
    samples.push({ timestamp, contextKey, forwardReturnPct: 1.5 });
    timestamp += 60_000;
  }

  for (let i = 0; i < down; i += 1) {
    samples.push({ timestamp, contextKey, forwardReturnPct: -0.5 });
    timestamp += 60_000;
  }

  for (let i = 0; i < flat; i += 1) {
    samples.push({ timestamp, contextKey, forwardReturnPct: 0 });
    timestamp += 60_000;
  }

  return samples;
}

const strongUp = estimateStatisticalEdge(
  makeSamples({ up: 57, down: 3 }),
  {
    minSamples: 50,
    minDirectionalProbability: 0.60,
    minLowerBound95: 0.55,
    minExpectedValuePct: 0.20,
    costPct: 0.40,
    contextKey: "BTC|FLOW_UP|MOMENTUM_UP"
  }
);

assert.equal(strongUp.eligible, true);
assert.equal(strongUp.direction, "UP");
assert.equal(strongUp.sampleSize, 60);
assert.ok(strongUp.probabilityUp > 0.9);
assert.ok(strongUp.probabilityUpLower95 > 0.8);
assert.ok(strongUp.expectedValuePct > 0);

const weakSample = estimateStatisticalEdge(
  makeSamples({ up: 3 }),
  { minSamples: 50, contextKey: "BTC|FLOW_UP|MOMENTUM_UP" }
);
assert.equal(weakSample.eligible, false);
assert.equal(weakSample.reason, "STATISTICAL_EDGE_NOT_CONFIRMED");

const mixed = estimateStatisticalEdge(
  makeSamples({ up: 31, down: 29 }),
  { minSamples: 50, contextKey: "BTC|FLOW_UP|MOMENTUM_UP" }
);
assert.equal(mixed.eligible, false);
assert.equal(mixed.direction, "NONE");

const filtered = estimateStatisticalEdge(
  [
    ...makeSamples({ up: 55, down: 5, contextKey: "BTC|FLOW_UP|MOMENTUM_UP" }),
    ...makeSamples({
      up: 1,
      down: 9,
      contextKey: "BTC|FLOW_DOWN|MOMENTUM_DOWN",
      start: baseTimestamp + 10_000_000
    })
  ],
  {
    minSamples: 50,
    contextKey: "BTC|FLOW_UP|MOMENTUM_UP"
  }
);
assert.equal(filtered.sampleSize, 60);
assert.equal(filtered.direction, "UP");

const noLeakage = estimateStatisticalEdge(
  makeSamples({ up: 55, down: 5 }),
  {
    minSamples: 50,
    contextKey: "BTC|FLOW_UP|MOMENTUM_UP",
    asOfMs: baseTimestamp + 60_000 * 30,
    horizonMs: 60_000 * 15
  }
);
assert.ok(noLeakage.sampleSize < 60);

const walkForwardSamples = [];
for (let i = 0; i < 120; i += 1) {
  walkForwardSamples.push({
    timestamp: baseTimestamp + i * 60_000,
    contextKey: "BTC|FLOW_UP|MOMENTUM_UP",
    forwardReturnPct: i < 80 ? 1 : -0.2
  });
}

const walkForward = walkForwardValidate(walkForwardSamples, {
  contextKey: "BTC|FLOW_UP|MOMENTUM_UP",
  trainMinSamples: 50,
  testWindow: 10,
  minDirectionalProbability: 0.60,
  minLowerBound95: 0.55,
  minExpectedValuePct: 0.20
});

assert.equal(walkForward.eligible, true);
assert.ok(walkForward.evaluated > 0);
assert.ok(Number.isFinite(walkForward.directionalAccuracy));
assert.ok(Number.isFinite(walkForward.averageDirectionalReturnPct));

console.log("Statistical Edge Engine tests passed");
