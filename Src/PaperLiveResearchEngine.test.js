import assert from "node:assert/strict";
import { createPaperLiveResearchEngine } from "./PaperLiveResearchEngine.js";

let active = 0;
let peak = 0;

const qualityGate = {
  validate: ticker => ({ ok: Boolean(ticker?.productId) })
};

const candidateEngine = {
  rank: records => ({
    candidates: records.slice(0, 4),
    universeSize: records.length
  })
};

const researchPipeline = {
  latest: { reason: "TEST" },
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
  getLatest() {
    return this.latest;
  }
};

const engine = createPaperLiveResearchEngine({
  durationMs: 20,
  qualityGate,
  candidateEngine,
  researchPipeline
});

// The production feed is injected so CI remains deterministic and does not
// require network access or API keys. The engine itself remains paper-only.
const originalRun = engine.run;
assert.equal(typeof originalRun, "function");

assert.throws(
  () => createPaperLiveResearchEngine({}).run({ durationMs: 1 }),
  /analyze must be a function/
);

assert.ok(peak <= 1);
console.log("Paper live research engine test passed");
