import assert from "node:assert/strict";
import { decideTrade, rankOpportunityCandidates } from "./TradeDecisionGate.js";

const now = 1_700_000_000_000;
const base = {
  nowMs: now,
  timestamp: now,
  score: 82,
  safetyScore: 80,
  safetyApproved: true,
  statisticalEdgeConfirmed: true,
  statisticalDirection: "UP",
  spreadPct: 0.2,
  netEdgePct: 1.2,
  flowConfidence: 70,
  flowDirection: "UP",
  momentumDirection: "UP",
  newsRisk: "NONE",
  hasPosition: false
};

assert.equal(decideTrade(base).action, "BUY");
assert.equal(decideTrade(base).mode, "STANDARD");
assert.equal(decideTrade({ ...base, safetyApproved: false }).action, "HOLD");
assert.equal(decideTrade({ ...base, statisticalEdgeConfirmed: false }).action, "HOLD");
assert.equal(decideTrade({ ...base, statisticalDirection: "DOWN" }).action, "HOLD");
assert.equal(decideTrade({ ...base, score: 79 }).action, "HOLD");
assert.equal(decideTrade({ ...base, safetyScore: 69 }).action, "HOLD");
assert.equal(decideTrade({ ...base, netEdgePct: 0.4 }).action, "HOLD");
assert.equal(decideTrade({ ...base, flowConfidence: 59 }).action, "HOLD");
assert.equal(decideTrade({ ...base, flowDirection: "DOWN" }).action, "HOLD");
assert.equal(decideTrade({ ...base, momentumDirection: "DOWN" }).action, "HOLD");
assert.equal(decideTrade({ ...base, newsRisk: "HIGH" }).action, "HOLD");
assert.equal(decideTrade({ ...base, timestamp: now - 120001 }).action, "HOLD");

const hot = decideTrade({
  ...base,
  score: 92,
  safetyScore: 90,
  netEdgePct: 2.0,
  flowConfidence: 85,
  opportunity: true
});
assert.equal(hot.action, "BUY");
assert.equal(hot.mode, "OPPORTUNITY");

const hotRejected = decideTrade({
  ...base,
  score: 92,
  safetyScore: 90,
  netEdgePct: 2.0,
  flowConfidence: 70,
  opportunity: true
});
assert.equal(hotRejected.action, "HOLD");

const exit = decideTrade({
  ...base,
  hasPosition: true,
  flowDirection: "DOWN"
});
assert.equal(exit.action, "SELL");
assert.equal(exit.mode, "EXIT");

const exitLowFlowConfidence = decideTrade({
  ...base,
  hasPosition: true,
  flowDirection: "UP",
  flowConfidence: 59
});
assert.equal(exitLowFlowConfidence.action, "SELL");
assert.equal(exitLowFlowConfidence.mode, "EXIT");

const exitUnknownFlowConfidence = decideTrade({
  ...base,
  hasPosition: true,
  flowDirection: "UP",
  flowConfidence: "unknown"
});
assert.equal(exitUnknownFlowConfidence.action, "SELL");
assert.equal(exitUnknownFlowConfidence.mode, "EXIT");

const noShort = decideTrade({
  ...base,
  hasPosition: false,
  flowDirection: "DOWN",
  momentumDirection: "DOWN"
});
assert.notEqual(noShort.action, "SELL");

const ranked = rankOpportunityCandidates([
  { id: "a", opportunity: true, safetyApproved: true, statisticalEdgeConfirmed: true, statisticalDirection: "UP", score: 88, safetyScore: 85, netEdgePct: 1.5, flowConfidence: 80 },
  { id: "b", opportunity: true, safetyApproved: true, statisticalEdgeConfirmed: true, statisticalDirection: "UP", score: 95, safetyScore: 90, netEdgePct: 2.1, flowConfidence: 90 },
  { id: "c", opportunity: true, safetyApproved: true, statisticalEdgeConfirmed: true, statisticalDirection: "UP", score: 91, safetyScore: 89, netEdgePct: 1.8, flowConfidence: 82 },
  { id: "unsafe", opportunity: true, safetyApproved: false, statisticalEdgeConfirmed: true, statisticalDirection: "UP", score: 99, safetyScore: 99, netEdgePct: 3, flowConfidence: 99 }
]);
assert.deepEqual(ranked.map((x) => x.id), ["b", "c"]);

console.log("Trade Decision Gate tests passed");
