import assert from "node:assert/strict";
import { createOnchainDataAdapter } from "./OnchainDataAdapter.js";

const now = Date.parse("2026-09-13T16:00:00.000Z");

const validRaw = {
  chain: "ethereum",
  address: "0xTOKEN",
  pair: "0xPAIR",
  source: "fixture",
  priceUsd: 2.5,
  liquidityUsd: 100000,
  buyVolumeUsd: 800000,
  sellVolumeUsd: 300000,
  volumeUsd: 1100000,
  previousVolumeUsd: 700000,
  previousLiquidityUsd: 95000,
  tradeCount: 2000,
  previousTradeCount: 1500,
  uniqueBuyers: 700,
  uniqueSellers: 400,
  largeBuyUsd: 300000,
  largeSellUsd: 100000,
  washTradeRisk: 5,
  timestamp: "2026-09-13T15:59:30.000Z"
};

const validAdapter = createOnchainDataAdapter({
  fetchSnapshot: async () => validRaw,
  clock: () => now
});

const valid = await validAdapter.getFlowSnapshot();
assert.equal(valid.ok, true);
assert.equal(valid.reason, "VALID");
assert.equal(valid.data.chain, "ethereum");
assert.equal(valid.data.buyVolumeUsd, 800000);
assert.equal(valid.data.liquidityUsd, 100000);
assert.equal(valid.data.timestamp, "2026-09-13T15:59:30.000Z");

const staleAdapter = createOnchainDataAdapter({
  fetchSnapshot: async () => ({
    ...validRaw,
    timestamp: "2026-09-13T15:55:00.000Z"
  }),
  maxAgeMs: 120000,
  clock: () => now
});

const stale = await staleAdapter.getFlowSnapshot();
assert.equal(stale.ok, false);
assert.equal(stale.reason, "STALE_DATA");

const unsafeLiquidity = createOnchainDataAdapter({
  fetchSnapshot: async () => ({
    ...validRaw,
    liquidityUsd: 1000
  }),
  clock: () => now
});

const lowLiquidity = await unsafeLiquidity.getFlowSnapshot();
assert.equal(lowLiquidity.ok, false);
assert.equal(lowLiquidity.reason, "LIQUIDITY_TOO_LOW");

const malformed = createOnchainDataAdapter({
  fetchSnapshot: async () => ({
    ...validRaw,
    timestamp: "not-a-date"
  }),
  clock: () => now
});

const invalid = await malformed.getFlowSnapshot();
assert.equal(invalid.ok, false);
assert.equal(invalid.reason, "INVALID_TIMESTAMP");

console.log("OnchainDataAdapter tests passed");
