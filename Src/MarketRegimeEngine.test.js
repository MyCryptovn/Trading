import assert from "node:assert/strict";
import { createMarketRegimeEngine } from "./MarketRegimeEngine.js";

const engine = createMarketRegimeEngine();

assert.equal(engine.classify({ movePct: 1.0, spreadPct: 0.1, liquidityUsd: 100000 }).regime, "TREND_UP");
assert.equal(engine.classify({ movePct: -1.0, spreadPct: 0.1, liquidityUsd: 100000 }).regime, "TREND_DOWN");
assert.equal(engine.classify({ movePct: 0.1, spreadPct: 0.1, liquidityUsd: 100000 }).regime, "SIDEWAYS");
assert.equal(engine.classify({ movePct: 3.0, spreadPct: 0.1, liquidityUsd: 100000 }).regime, "HIGH_VOLATILITY");
assert.equal(engine.classify({ movePct: 7.0, spreadPct: 0.1, liquidityUsd: 100000 }).regime, "PANIC");
assert.equal(engine.classify({ movePct: 1.0, spreadPct: 1.0, liquidityUsd: 10000 }).regime, "LIQUIDITY_STRESS");
assert.equal(engine.classify({ movePct: Number.NaN }).regime, "UNKNOWN");

console.log("MarketRegimeEngine tests passed");
