import assert from "node:assert/strict";
import { createAIPerformanceJournal } from "./AIPerformanceJournal.js";

const journal = createAIPerformanceJournal({
  storagePath: null,
  horizonMs: 1000
});

assert.equal((await journal.observe({
  timestamp: 0,
  productId: "BTC-USD",
  action: "BUY",
  price: 100
})).accepted, true);

assert.equal((await journal.observe({
  timestamp: 0,
  productId: "BTC-USD",
  action: "BUY",
  price: 100
})).accepted, false);

const unresolved = await journal.resolveTick({
  timestamp: 999,
  productId: "BTC-USD",
  price: 101
});
assert.equal(unresolved.resolved, false);

const resolved = await journal.resolveTick({
  timestamp: 1000,
  productId: "BTC-USD",
  price: 102
});
assert.equal(resolved.resolved, true);
assert.equal(resolved.samples[0].correct, true);
assert.equal(resolved.samples[0].forwardReturnPct, 2);
assert.equal(resolved.samples[0].netReturnPct, 1.2);

await journal.observe({
  timestamp: 2000,
  productId: "ETH-USD",
  action: "SELL",
  price: 100
});
const sellResolved = await journal.resolveTick({
  timestamp: 3000,
  productId: "ETH-USD",
  price: 98
});
assert.equal(sellResolved.samples[0].correct, true);
assert.equal(sellResolved.samples[0].directionalReturnPct, 2);

const summary = journal.summary();
assert.equal(summary.directionalSamples, 2);
assert.equal(summary.wins, 2);
assert.equal(summary.precision, 1);

console.log("AIPerformanceJournal tests passed");
