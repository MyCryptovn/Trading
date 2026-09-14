import assert from "node:assert/strict";
import { createOnchainDataAdapter } from "./OnchainDataAdapter.js";
import { createOnchainFlowIntegration } from "./OnchainFlowIntegration.js";

const now = Date.now();

const adapter = createOnchainDataAdapter({
  clock: () => now,
  fetchSnapshot: async () => ({
    chain: "ethereum",
    address: "0xTEST",
    pair: "TEST/USDC",
    source: "fixture",
    priceUsd: 1.25,
    liquidityUsd: 200000,
    buyVolumeUsd: 90000,
    sellVolumeUsd: 30000,
    volumeUsd: 180000,
    previousVolumeUsd: 100000,
    previousLiquidityUsd: 180000,
    tradeCount: 1500,
    previousTradeCount: 1000,
    uniqueBuyers: 700,
    uniqueSellers: 400,
    largeBuyUsd: 50000,
    largeSellUsd: 10000,
    washTradeRisk: 5,
    timestamp: new Date(now).toISOString()
  })
});

const integration = createOnchainFlowIntegration({ adapter });
const result = await integration.evaluate({ pair: "TEST/USDC" });

assert.equal(result.ok, true);
assert.equal(result.action, "FLOW_UP");
assert.ok(result.confidence >= 60);
assert.equal(result.snapshot.data.chain, "ethereum");
assert.equal(result.flow.imbalancePct > 0, true);

const staleAdapter = createOnchainDataAdapter({
  clock: () => now,
  maxAgeMs: 1000,
  fetchSnapshot: async () => ({
    chain: "ethereum",
    address: "0xSTALE",
    source: "fixture",
    liquidityUsd: 100000,
    timestamp: new Date(now - 5000).toISOString()
  })
});

const stale = await createOnchainFlowIntegration({ adapter: staleAdapter }).evaluate();
assert.equal(stale.ok, false);
assert.equal(stale.action, "HOLD");
assert.equal(stale.reason, "ONCHAIN_STALE_DATA");

console.log("On-chain flow integration test passed");
