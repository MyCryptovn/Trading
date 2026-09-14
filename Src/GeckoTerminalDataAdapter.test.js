import assert from "node:assert/strict";
import { createGeckoTerminalDataAdapter } from "./GeckoTerminalDataAdapter.js";

const now = Date.now();
const calls = [];

const responses = new Map([
  [
    "pool",
    {
      data: {
        attributes: {
          address: "0xPOOL",
          name: "TEST / USDC",
          base_token_price_usd: "1.25",
          reserve_in_usd: "250000",
          volume_usd: { h1: "180000" },
          last_updated_at: new Date(now).toISOString()
        }
      }
    }
  ],
  [
    "trades",
    {
      data: [
        {
          attributes: {
            kind: "buy",
            volume_in_usd: "50000",
            tx_from_address: "0xBUY1"
          }
        },
        {
          attributes: {
            kind: "buy",
            volume_in_usd: "25000",
            tx_from_address: "0xBUY2"
          }
        },
        {
          attributes: {
            kind: "sell",
            volume_in_usd: "10000",
            tx_from_address: "0xSELL1"
          }
        },
        {
          attributes: {
            kind: "sell",
            volume_in_usd: "5000",
            tx_from_address: "0xSELL2"
          }
        }
      ]
    }
  ]
]);

const adapter = createGeckoTerminalDataAdapter({
  clock: () => now,
  largeTradeUsd: 20000,
  fetchImpl: async url => {
    calls.push(url);
    const key = url.endsWith("/trades") ? "trades" : "pool";
    return {
      ok: true,
      async json() {
        return responses.get(key);
      }
    };
  }
});

const result = await adapter.getFlowSnapshot({
  network: "ethereum",
  poolAddress: "0xPOOL"
});

assert.equal(result.ok, true);
assert.equal(result.reason, "VALID");
assert.equal(result.data.chain, "ethereum");
assert.equal(result.data.address, "0xPOOL");
assert.equal(result.data.buyVolumeUsd, 75000);
assert.equal(result.data.sellVolumeUsd, 15000);
assert.equal(result.data.largeBuyUsd, 75000);
assert.equal(result.data.largeSellUsd, 0);
assert.equal(result.data.tradeCount, 4);
assert.equal(result.data.uniqueBuyers, 2);
assert.equal(result.data.uniqueSellers, 2);
assert.equal(calls.length, 2);

const missingIdentity = await adapter.getFlowSnapshot();
assert.equal(missingIdentity.ok, false);
assert.equal(missingIdentity.reason, "IDENTITY_FIELDS_MISSING");

const lowLiquidityAdapter = createGeckoTerminalDataAdapter({
  clock: () => now,
  fetchImpl: async url => ({
    ok: true,
    async json() {
      if (url.endsWith("/trades")) {
        return { data: [{ attributes: { kind: "buy", volume_in_usd: "1000" } }] };
      }
      return {
        data: {
          attributes: {
            address: "0xLOW",
            reserve_in_usd: "1000",
            last_updated_at: new Date(now).toISOString()
          }
        }
      };
    }
  })
});

const lowLiquidity = await lowLiquidityAdapter.getFlowSnapshot({
  network: "ethereum",
  poolAddress: "0xLOW"
});
assert.equal(lowLiquidity.ok, false);
assert.equal(lowLiquidity.reason, "LIQUIDITY_TOO_LOW");

console.log("GeckoTerminal adapter unit test passed");
