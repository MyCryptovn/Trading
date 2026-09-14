import assert from "node:assert/strict";
import { createCapitalFlowScanner } from "./CapitalFlowScanner.js";

const scanner = createCapitalFlowScanner();

const buyFlow = scanner.scan({
  address: "0xBUY",
  buyVolumeUsd: 800000,
  sellVolumeUsd: 400000,
  volumeUsd: 1200000,
  previousVolumeUsd: 800000,
  liquidityUsd: 110000,
  previousLiquidityUsd: 100000,
  tradeCount: 1800,
  previousTradeCount: 1200,
  largeBuyUsd: 300000,
  largeSellUsd: 100000,
  washTradeRisk: 5
});

assert.equal(buyFlow.action, "BUY");
assert.ok(buyFlow.confidence >= 60);
assert.ok(buyFlow.imbalancePct > 30);

const sellFlow = scanner.scan({
  address: "0xSELL",
  buyVolumeUsd: 300000,
  sellVolumeUsd: 900000,
  volumeUsd: 1200000,
  previousVolumeUsd: 800000,
  liquidityUsd: 100000,
  previousLiquidityUsd: 105000,
  tradeCount: 1800,
  previousTradeCount: 1200,
  largeBuyUsd: 50000,
  largeSellUsd: 250000,
  washTradeRisk: 5
});

assert.equal(sellFlow.action, "SELL");
assert.ok(sellFlow.confidence >= 60);
assert.ok(sellFlow.imbalancePct < -30);

const washRisk = scanner.scan({
  address: "0xWASH",
  buyVolumeUsd: 900000,
  sellVolumeUsd: 100000,
  volumeUsd: 1000000,
  previousVolumeUsd: 500000,
  liquidityUsd: 120000,
  previousLiquidityUsd: 100000,
  tradeCount: 2500,
  previousTradeCount: 1000,
  largeBuyUsd: 500000,
  largeSellUsd: 50000,
  washTradeRisk: 80
});

assert.equal(washRisk.action, "HOLD");
assert.ok(washRisk.reasons.includes("WASH_TRADE_RISK_HIGH"));

const insufficient = scanner.scan({
  address: "0xUNKNOWN",
  volumeUsd: 1000000,
  previousVolumeUsd: 500000
});

assert.equal(insufficient.action, "HOLD");
assert.ok(insufficient.reasons.includes("INSUFFICIENT_FLOW_DATA"));
assert.ok(insufficient.warnings.includes("BUY_SELL_FLOW_UNKNOWN"));

console.log("CapitalFlowScanner tests passed");
