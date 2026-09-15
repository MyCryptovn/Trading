import assert from "node:assert/strict";
import { createMultiCoinResearchPipeline } from "./MultiCoinResearchPipeline.js";

const now = Date.now();
const candidates = Array.from({ length: 5 }, (_, i) => ({
  productId: `COIN${i}-USD`,
  price: 100 + i,
  timestamp: new Date(now).toISOString()
}));

let calls = 0;
const pipeline = createMultiCoinResearchPipeline({
  maxCandidates: 3,
  maxConcurrent: 2,
  minIntervalMs: 60000
});

const first = await pipeline.research(candidates, async candidate => {
  calls += 1;
  return { ok: true, productId: candidate.productId, action: "HOLD", confidence: 0.5 };
}, now);

assert.equal(first.ok, true);
assert.equal(first.selected, 3);
assert.equal(first.rejected, 2);
assert.equal(calls, 3);

const cooldown = await pipeline.research(candidates, async () => {
  calls += 1;
  return { ok: true };
}, now + 1000);

assert.equal(cooldown.skipped, true);
assert.equal(cooldown.reason, "RESEARCH_COOLDOWN");
assert.equal(calls, 3);

const second = await pipeline.research(candidates, async candidate => ({
  ok: true,
  productId: candidate.productId,
  action: "HOLD",
  confidence: 0.5
}), now + 60000);

assert.equal(second.ok, true);
assert.equal(second.selected, 3);

console.log("Multi-Coin Research Pipeline test passed");
