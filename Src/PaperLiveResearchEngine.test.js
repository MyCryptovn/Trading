import assert from "node:assert/strict";
import { createPaperLiveResearchEngine } from "./PaperLiveResearchEngine.js";

let active = 0;
let peak = 0;
let feedStopCalled = false;

const now = Date.now();
const tickers = Array.from({ length: 12 }, (_, i) => ({
  productId: `COIN${i}-USD`,
  price: 100 + i,
  bid: 99 + i,
  ask: 101 + i,
  volume24h: 100000 + i,
  change24hPct: i,
  timestamp: new Date(now).toISOString()
}));

const qualityGate = { validate: ticker => ({ ok: Boolean(ticker?.productId) }) };
const candidateEngine = { rank: records => ({ candidates: records.slice(0, 4), universeSize: records.length }) };

const researchPipeline = {
  latest: { reason: "NOT_RUN" },
  async research(candidates, analyze) {
    const results = [];
    for (const candidate of candidates) {
      active += 1;
      peak = Math.max(peak, active);
      results.push(await analyze(candidate));
      active -= 1;
    }
    this.latest = { reason: "AI_RESEARCH_COMPLETE", results };
    return { skipped: false, selected: candidates.length, results };
  },
  getLatest() { return this.latest; }
};

const feedFactory = ({ onTicker }) => {
  for (const ticker of tickers) onTicker(ticker);
  return () => { feedStopCalled = true; };
};

const engine = createPaperLiveResearchEngine({
  durationMs: 10,
  qualityGate,
  candidateEngine,
  researchPipeline,
  feedFactory
});

const result = await engine.run({
  analyze: async candidate => ({ ok: true, productId: candidate.productId, action: "HOLD", confidence: 0.5 })
});

assert.equal(result.universeSize, 12);
assert.equal(result.ticks, 12);
assert.equal(result.researchRuns, 1);
assert.equal(result.researchSelected, 4);
assert.equal(result.actions.HOLD, 4);
assert.equal(result.errors, 0);
assert.equal(feedStopCalled, true);
assert.equal(peak, 1);

await assert.rejects(
  () => createPaperLiveResearchEngine({}).run({ durationMs: 1 }),
  /analyze must be a function/
);

console.log("Paper live research engine test passed");
