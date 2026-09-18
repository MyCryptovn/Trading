import assert from "node:assert/strict";
import { createGoPlusTokenSecurityAdapter, mapTokenSecurity } from "./GoPlusTokenSecurityAdapter.js";

const observedAt = Date.parse("2026-09-13T12:00:00.000Z");

const safePayload = {
  is_open_source: "1",
  is_proxy: "0",
  is_mintable: "0",
  is_honeypot: "0",
  cannot_buy: "0",
  cannot_sell_all: "0",
  is_blacklisted: "0",
  is_in_dex: "1",
  buy_tax: "0.02",
  sell_tax: "0.03",
  holders: [{ percent: "0.12" }, { percent: "0.08" }],
  lp_holders: [{ is_locked: "1" }],
  dex: [{ liquidity: "150000" }],
  token_name: "Safe Token",
  token_symbol: "SAFE"
};

const mapped = mapTokenSecurity(safePayload, {
  chainId: "1",
  address: "0xSAFE",
  observedAt
});

assert.equal(mapped.ok, true);
assert.equal(mapped.token.buyTaxPct, 2);
assert.equal(mapped.token.sellTaxPct, 3);
assert.equal(mapped.token.topHolderPct, 12);
assert.equal(mapped.token.liquidityUsd, 150000);
assert.equal(mapped.token.contractVerified, true);
assert.equal(mapped.token.honeypot, false);
assert.equal(mapped.token.liquidityLocked, true);
assert.equal(mapped.token.sellTestPassed, true);
assert.equal(mapped.token.timestampSource, "adapter_observed_at");

const rejected = mapTokenSecurity(
  { ...safePayload, is_honeypot: "1" },
  { chainId: "1", address: "0xBAD", observedAt }
);
assert.equal(rejected.ok, true);
assert.equal(rejected.token.honeypot, true);

const noDex = mapTokenSecurity(
  { ...safePayload, is_in_dex: "0" },
  { chainId: "1", address: "0xNODex", observedAt }
);
assert.equal(noDex.ok, false);
assert.equal(noDex.reason, "TOKEN_NOT_IN_DEX");

let requestUrl = "";
const adapter = createGoPlusTokenSecurityAdapter({
  accessToken: "test-token",
  clock: () => observedAt,
  fetchImpl: async (url, options) => {
    requestUrl = url;
    assert.equal(options.headers.authorization, "Bearer test-token");
    return {
      ok: true,
      async json() {
        return {
          code: 1,
          message: "ok",
          result: {
            "0xsafe": safePayload
          }
        };
      }
    };
  }
});

const result = await adapter.getSecurity({
  chainId: "1",
  tokenAddress: "0xSAFE"
});

assert.equal(result.ok, true);
assert.match(requestUrl, /token_security\/1/);
assert.match(requestUrl, /contract_addresses=0xSAFE/);

const missingKey = createGoPlusTokenSecurityAdapter({
  accessToken: "",
  fetchImpl: async () => ({ ok: true, json: async () => ({}) })
});
const missing = await missingKey.getSecurity({
  chainId: "1",
  tokenAddress: "0xSAFE"
});
assert.equal(missing.ok, false);
assert.equal(missing.reason, "GOPLUS_ACCESS_TOKEN_MISSING");

console.log("GoPlus token security adapter tests passed");
