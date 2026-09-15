import assert from "node:assert/strict";
import { evaluateSignal } from "./SignalEngine.js";

const base = {
  movePct: 1.0,
  spreadPct: 0.10,
  volume24h: 2000000
};

const buy = evaluateSignal({
  ...base,
  capitalFlow: { action: "BUY", confidence: 80 }
});
assert.equal(buy.action, "WATCH_BUY");

const sell = evaluateSignal({
  ...base,
  movePct: -1.0,
  capitalFlow: { action: "SELL", confidence: 80 }
});
assert.equal(sell.action, "WATCH_SELL");

const legacyBuy = evaluateSignal({
  ...base,
  capitalFlow: { action: "FLOW_UP", confidence: 80 }
});
assert.equal(legacyBuy.action, "HOLD");
assert.equal(legacyBuy.reason, "FLOW_NOT_CONFIRMING_BUY");

const legacySell = evaluateSignal({
  ...base,
  movePct: -1.0,
  capitalFlow: { action: "FLOW_DOWN", confidence: 80 }
});
assert.equal(legacySell.action, "HOLD");
assert.equal(legacySell.reason, "FLOW_NOT_CONFIRMING_SELL");

console.log("Signal Engine tests passed");
