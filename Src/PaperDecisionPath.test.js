import assert from "node:assert/strict";
import { decideTrade } from "./TradeDecisionGate.js";

const now = Date.now();

const base = {
  timestamp: now,
  directionAction: "BUY",
  safetyApproved: true,
  statisticalEdgeConfirmed: true,
  statisticalOutOfSampleValidated: true,
  statisticalDirection: "UP",
  score: 90,
  safetyScore: 85,
  spreadPct: 0.10,
  netEdgePct: 1.20,
  flowConfidence: 82,
  flowDirection: "UP",
  momentumDirection: "UP",
  newsRisk: "NONE",
  hasPosition: false
};

{
  const decision = decideTrade(base);
  assert.equal(decision.action, "BUY");
  assert.equal(decision.mode, "STANDARD");
}

{
  const decision = decideTrade({
    ...base,
    directionAction: "BUY",
    aiDecisionAction: "UNKNOWN",
    netEdgePct: 0.10
  });
  assert.equal(decision.action, "HOLD");
  assert.ok(decision.reasons.includes("NET_EDGE_TOO_LOW_OR_UNKNOWN"));
}

{
  const decision = decideTrade({
    ...base,
    hasPosition: true,
    directionAction: "SELL"
  });
  assert.equal(decision.action, "SELL");
  assert.equal(decision.mode, "SIGNAL_EXIT");
}

console.log("PaperDecisionPath tests passed");
