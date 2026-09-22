import assert from "node:assert/strict";
import { evaluateSignal } from "./SignalEngine.js";
import { createSignalFusion } from "./SignalFusion.js";
import { createTradingAgentsAdapter } from "./TradingAgentsAdapter.js";
import { decideTrade } from "./TradeDecisionGate.js";
import { createPaperTrader, buy, sell, getEquity } from "./Papertrader.js";
import { createPaperPerformanceJournal } from "./PaperPerformanceJournal.js";

const start = Date.now();
let aiAction = "BUY";

const agents = createTradingAgentsAdapter({
  runner: async ({ snapshot }) => ({
    action: aiAction,
    confidence: snapshot.price >= 100 ? 0.9 : 0.85
  })
});

const fusion = createSignalFusion({ minConfidence: 60 });
const paper = createPaperTrader(1000, {
  feePct: 0.1,
  slippagePct: 0.05
});
const journal = createPaperPerformanceJournal({
  storagePath: null,
  initialBalanceUsd: 1000
});

const strongBuyMarket = {
  symbol: "ETH-USD",
  price: 2000,
  timestamp: start,
  bid: 1999,
  ask: 2001,
  volume24h: 10_000_000
};

const quantBuy = evaluateSignal({
  movePct: 1.2,
  spreadPct: 0.10,
  volume24h: strongBuyMarket.volume24h,
  capitalFlow: { action: "BUY", confidence: 90 }
});

assert.equal(quantBuy.action, "WATCH_BUY");

const aiBuy = await agents.analyze({
  nowMs: start,
  snapshot: strongBuyMarket
});
assert.equal(aiBuy.ok, true);
assert.equal(aiBuy.action, "BUY");

const fusedBuy = fusion.fuse({
  quant: { action: "BUY", confidence: 90 },
  research: { action: aiBuy.action, confidence: aiBuy.confidence * 100 }
});
assert.equal(fusedBuy.action, "BUY");
assert.ok(fusedBuy.confidence >= 60);

const buyDecision = decideTrade({
  nowMs: start,
  timestamp: start,
  hasPosition: false,
  botMode: "paper",
  paperSafetyBypass: true,
  aiDecisionAction: aiBuy.action,
  directionAction: fusedBuy.action,
  statisticalEdgeConfirmed: true,
  statisticalOutOfSampleValidated: true,
  statisticalDirection: "UP",
  score: 92,
  safetyScore: null,
  safetyApproved: false,
  spreadPct: 0.10,
  netEdgePct: 1.4,
  flowConfidence: 90,
  flowDirection: "UP",
  momentumDirection: "UP",
  newsRisk: "NONE"
});

assert.equal(buyDecision.action, "BUY");

const buyExecuted = buy(paper, strongBuyMarket.price, 500);
assert.equal(buyExecuted, true);
assert.ok(paper.asset > 0);
assert.ok(paper.usd < 1000);

await journal.record({
  timestamp: start,
  price: strongBuyMarket.price,
  equityUsd: getEquity(paper, strongBuyMarket.price),
  action: buyDecision.action,
  decisionMode: buyDecision.mode,
  executionAction: buyExecuted ? "BUY" : "HOLD",
  reasons: buyDecision.reasons,
  hasPosition: paper.asset > 0,
  evidence: {
    score: 92,
    netEdgePct: 1.4,
    flowConfidence: 90
  }
});

aiAction = "SELL";
const sellNow = start + 5_000;
const sellMarket = {
  ...strongBuyMarket,
  price: 1980,
  timestamp: sellNow
};

const aiSell = await agents.analyze({
  nowMs: sellNow,
  snapshot: sellMarket
});
assert.equal(aiSell.ok, true);
assert.equal(aiSell.action, "SELL");

const fusedSell = fusion.fuse({
  quant: { action: "SELL", confidence: 90 },
  research: { action: aiSell.action, confidence: aiSell.confidence * 100 }
});
assert.equal(fusedSell.action, "SELL");

const sellDecision = decideTrade({
  nowMs: sellNow,
  timestamp: sellNow,
  hasPosition: paper.asset > 0,
  botMode: "paper",
  paperSafetyBypass: true,
  aiDecisionAction: aiSell.action,
  directionAction: fusedSell.action,
  flowConfidence: 90,
  flowDirection: "DOWN",
  momentumDirection: "DOWN",
  netEdgePct: -0.2,
  spreadPct: 0.10,
  newsRisk: "NONE"
});

assert.equal(sellDecision.action, "SELL");

const sellExecuted = sell(paper, sellMarket.price);
assert.equal(sellExecuted, true);
assert.equal(paper.asset, 0);
assert.equal(paper.entryPrice, null);

await journal.record({
  timestamp: sellNow,
  price: sellMarket.price,
  equityUsd: getEquity(paper, sellMarket.price),
  action: sellDecision.action,
  decisionMode: sellDecision.mode,
  executionAction: sellExecuted ? "SELL" : "HOLD",
  reasons: sellDecision.reasons,
  hasPosition: paper.asset > 0,
  evidence: {
    netEdgePct: -0.2,
    flowConfidence: 90
  }
});

const summary = journal.summary();
assert.equal(summary.ticks, 2);
assert.equal(summary.executedBuys, 1);
assert.equal(summary.executedSells, 1);
assert.ok(Number.isFinite(summary.latestEquityUsd));

console.log("PaperCoreIntegration: PASS");
console.log(JSON.stringify({
  buyDecision,
  sellDecision,
  initialBalanceUsd: 1000,
  finalEquityUsd: summary.latestEquityUsd,
  returnPct: summary.totalReturnPct,
  trades: paper.trades.length
}, null, 2));
