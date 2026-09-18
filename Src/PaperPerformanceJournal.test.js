import { createPaperPerformanceJournal } from "./PaperPerformanceJournal.js";

const journal = createPaperPerformanceJournal({
  storagePath: null,
  initialBalanceUsd: 1000,
  maxEvents: 3
});

await journal.initialize();

const first = await journal.record({
  timestamp: 1000,
  price: 100,
  equityUsd: 1000,
  action: "HOLD",
  hasPosition: false
});
if (!first.accepted) throw new Error("Expected first event to be accepted");

await journal.record({
  timestamp: 2000,
  price: 101,
  equityUsd: 1010,
  action: "BUY",
  hasPosition: true,
  decisionMode: "STANDARD",
  evidence: { score: 90, safetyScore: 85, netEdgePct: 1.2, flowConfidence: 80, statisticalExpectedValuePct: 1.2, statisticalSampleSize: 60 }
});
await journal.record({
  timestamp: 3000,
  price: 102,
  equityUsd: 1020,
  action: "HOLD",
  hasPosition: true
});
await journal.record({
  timestamp: 4000,
  price: 98,
  equityUsd: 980,
  action: "SELL",
  hasPosition: false
});

const summary = journal.summary();
if (summary.ticks !== 3) throw new Error(`Expected capped ticks=3, got ${summary.ticks}`);
if (summary.buys !== 1 || summary.sells !== 1) throw new Error("Expected one BUY and one SELL");
if (summary.maxDrawdownPct >= 0) throw new Error("Expected a negative drawdown after the equity decline");
if (summary.totalReturnPct !== -2) throw new Error(`Expected -2% return, got ${summary.totalReturnPct}`);

console.log("PaperPerformanceJournal tests passed");
