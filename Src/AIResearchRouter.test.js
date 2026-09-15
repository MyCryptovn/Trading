import assert from "node:assert/strict";
import { createAIResearchRouter } from "./AIResearchRouter.js";

const now = Date.now();
const candidates = Array.from({ length: 6 }, (_, i) => ({
  productId: `COIN${i}-USD`,
  price: 100 + i,
  timestamp: new Date(now).toISOString()
}));

const router = createAIResearchRouter({ maxCandidates: 4, maxConcurrent: 2 });
let active = 0;
let peak = 0;

const result = await router.research(candidates, async candidate => {
  active += 1;
  peak = Math.max(peak, active);
  await new Promise(resolve => setTimeout(resolve, 5));
  active -= 1;
  return { ok: true, productId: candidate.productId, action: "HOLD", confidence: 0.5 };
}, now);

assert.equal(result.selected, 4);
assert.equal(result.rejected, 2);
assert.equal(result.results.length, 4);
assert.ok(peak <= 2);
assert.ok(result.results.every(item => item.ok === true));

const stale = await router.research([
  { productId: "STALE-USD", price: 10, timestamp: new Date(now - 180000).toISOString() }
], async () => ({ ok: true }), now);
assert.equal(stale.selected, 0);
assert.equal(stale.reason, "NO_FRESH_AI_CANDIDATES");

console.log("AI Research Router test passed");
