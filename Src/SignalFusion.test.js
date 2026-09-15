import assert from "node:assert/strict";
import { createSignalFusion } from "./SignalFusion.js";

const fusion = createSignalFusion({ minConfidence: 60 });

const buy = fusion.fuse({
  quant: { action: "BUY", confidence: 90 },
  flow: { action: "BUY", confidence: 80 },
  onchain: { action: "BUY", confidence: 70 },
  research: { action: "HOLD", confidence: 40 }
});
assert.equal(buy.action, "BUY");
assert.ok(buy.confidence >= 60);

const conflict = fusion.fuse({
  quant: { action: "BUY", confidence: 70 },
  flow: { action: "SELL", confidence: 70 }
});
assert.equal(conflict.action, "HOLD");
assert.match(conflict.reason, /CONFLICT|WEAK/);

const unknown = fusion.fuse({
  quant: { action: "UNKNOWN", confidence: 100 },
  flow: { action: "BAD", confidence: 100 }
});
assert.equal(unknown.action, "HOLD");
assert.equal(unknown.confidence, 0);

const researchOnly = fusion.fuse({
  research: { action: "BUY", confidence: 95 }
});
assert.equal(researchOnly.action, "BUY");
assert.ok(researchOnly.confidence >= 60);

const researchVsQuant = fusion.fuse({
  quant: { action: "SELL", confidence: 90 },
  research: { action: "BUY", confidence: 90 }
});
assert.equal(researchVsQuant.action, "HOLD");
assert.match(researchVsQuant.reason, /CONFLICT|WEAK/);

const unavailableResearch = fusion.fuse({
  quant: { action: "BUY", confidence: 85 },
  flow: { action: "BUY", confidence: 80 },
  research: { action: "UNKNOWN", confidence: 100 }
});
assert.equal(unavailableResearch.action, "BUY");
assert.ok(unavailableResearch.rejected.includes("research:INVALID_SIGNAL"));

const lowConfidenceResearch = fusion.fuse({
  quant: { action: "HOLD", confidence: 50 },
  research: { action: "BUY", confidence: 40 }
});
assert.equal(lowConfidenceResearch.action, "HOLD");
assert.ok(lowConfidenceResearch.confidence < 60);

console.log("SignalFusion tests passed");
