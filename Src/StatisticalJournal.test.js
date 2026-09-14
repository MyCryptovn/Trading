import assert from "node:assert/strict";
import { createStatisticalJournal } from "./StatisticalJournal.js";

const start = 1_700_000_000_000;
const horizon = 15 * 60 * 1000;

const journal = createStatisticalJournal({
  horizonMs: horizon,
  maxSamples: 3
});

const opened = await journal.observe({
  timestamp: start,
  price: 100,
  contextKey: "BTC|FLOW_UP|MOMENTUM_UP"
});
assert.equal(opened.accepted, true);

const duplicate = await journal.observe({
  timestamp: start + 60_000,
  price: 101,
  contextKey: "BTC|FLOW_UP|MOMENTUM_UP"
});
assert.equal(duplicate.accepted, false);
assert.equal(duplicate.reason, "CONTEXT_ALREADY_PENDING");

const early = await journal.resolve({
  timestamp: start + horizon - 1,
  price: 105
});
assert.equal(early.resolved, false);
assert.equal(journal.getSamples().length, 0);
assert.equal(journal.getPending().length, 1);

const resolved = await journal.resolve({
  timestamp: start + horizon,
  price: 105
});
assert.equal(resolved.resolved, true);
assert.equal(resolved.samples.length, 1);
assert.equal(resolved.samples[0].forwardReturnPct, 5);
assert.equal(journal.getPending().length, 0);
assert.equal(journal.getSamples("BTC|FLOW_UP|MOMENTUM_UP").length, 1);

const second = await journal.observe({
  timestamp: start + horizon,
  price: 105,
  contextKey: "BTC|FLOW_UP|MOMENTUM_UP"
});
assert.equal(second.accepted, true);

await journal.resolve({
  timestamp: start + 2 * horizon,
  price: 102
});

const third = await journal.observe({
  timestamp: start + 2 * horizon,
  price: 102,
  contextKey: "BTC|FLOW_UP|MOMENTUM_UP"
});
assert.equal(third.accepted, true);
await journal.resolve({
  timestamp: start + 3 * horizon,
  price: 110
});

const fourth = await journal.observe({
  timestamp: start + 3 * horizon,
  price: 110,
  contextKey: "BTC|FLOW_UP|MOMENTUM_UP"
});
assert.equal(fourth.accepted, true);
await journal.resolve({
  timestamp: start + 4 * horizon,
  price: 111
});

assert.equal(journal.getSamples().length, 3);
assert.equal(journal.getSamples()[0].forwardReturnPct, -2.857142857142857);

const invalid = await journal.observe({
  timestamp: start,
  price: 0,
  contextKey: "INVALID"
});
assert.equal(invalid.accepted, false);

console.log("Statistical Journal tests passed");
