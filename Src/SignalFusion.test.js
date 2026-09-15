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

console.log("SignalFusion tests passed");
