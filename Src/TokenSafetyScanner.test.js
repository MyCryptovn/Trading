import assert from "node:assert/strict";
import { createTokenSafetyScanner } from "./TokenSafetyScanner.js";

const scanner = createTokenSafetyScanner();
const now = Date.parse("2026-09-13T12:00:00.000Z");

function baseToken(overrides = {}) {
  return {
    address: "0xSAFE",
    chain: "ethereum",
    liquidityUsd: 100000,
    buyTaxPct: 2,
    sellTaxPct: 2,
    topHolderPct: 15,
    honeypot: false,
    sellBlocked: false,
    mintAuthorityRisk: false,
    blacklistRisk: false,
    proxyRisk: false,
    liquidityLocked: true,
    contractVerified: true,
    sellTestPassed: true,
    timestamp: new Date(now).toISOString(),
    ...overrides
  };
}

const safe = scanner.scan(baseToken(), { nowMs: now });
assert.equal(safe.safe, true);
assert.equal(safe.action, "PASS");
assert.equal(safe.admitted, true);
assert.equal(safe.score, 100);

const honeypot = scanner.scan(baseToken({
  address: "0xHONEYPOT",
  honeypot: true
}), { nowMs: now });
assert.equal(honeypot.safe, false);
assert.equal(honeypot.action, "REJECT");
assert.ok(honeypot.reasons.includes("HONEYPOT_DETECTED"));

const lowLiquidity = scanner.scan(baseToken({
  address: "0xLOWLIQ",
  liquidityUsd: 1000
}), { nowMs: now });
assert.equal(lowLiquidity.safe, false);
assert.ok(lowLiquidity.reasons.includes("LIQUIDITY_TOO_LOW"));

const unknownSecurity = scanner.scan(baseToken({
  address: "0xUNKNOWN",
  sellTestPassed: undefined,
  contractVerified: undefined,
  liquidityLocked: undefined
}), { nowMs: now });
assert.equal(unknownSecurity.safe, false);
assert.ok(unknownSecurity.reasons.includes("SELL_TEST_UNKNOWN"));
assert.ok(unknownSecurity.reasons.includes("CONTRACT_VERIFICATION_UNKNOWN"));
assert.ok(unknownSecurity.reasons.includes("LIQUIDITY_LOCK_UNKNOWN"));

const unknownNumbers = scanner.scan(baseToken({
  address: "0xUNKNOWN_NUMBERS",
  liquidityUsd: null,
  buyTaxPct: null,
  sellTaxPct: null,
  topHolderPct: null
}), { nowMs: now });
assert.equal(unknownNumbers.safe, false);
assert.ok(unknownNumbers.reasons.includes("LIQUIDITY_UNKNOWN"));
assert.ok(unknownNumbers.reasons.includes("BUY_TAX_UNKNOWN"));
assert.ok(unknownNumbers.reasons.includes("SELL_TAX_UNKNOWN"));
assert.ok(unknownNumbers.reasons.includes("HOLDER_CONCENTRATION_UNKNOWN"));

const stale = scanner.scan(baseToken({
  address: "0xSTALE",
  timestamp: new Date(now - 120001).toISOString()
}), { nowMs: now });
assert.equal(stale.safe, false);
assert.ok(stale.reasons.includes("SAFETY_DATA_STALE"));

const missingIdentity = scanner.scan(baseToken({
  address: undefined,
  chain: undefined
}), { nowMs: now });
assert.equal(missingIdentity.safe, false);
assert.ok(missingIdentity.reasons.includes("TOKEN_IDENTITY_MISSING"));

const future = scanner.scan(baseToken({
  address: "0xFUTURE",
  timestamp: new Date(now + 30001).toISOString()
}), { nowMs: now });
assert.equal(future.safe, false);
assert.ok(future.reasons.includes("SAFETY_DATA_TIMESTAMP_IN_FUTURE"));

console.log("TokenSafetyScanner tests passed");
