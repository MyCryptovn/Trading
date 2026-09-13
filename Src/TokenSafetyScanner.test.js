import assert from "node:assert/strict";
import { createTokenSafetyScanner } from "./TokenSafetyScanner.js";

const scanner = createTokenSafetyScanner();

const safe = scanner.scan({
  address: "0xSAFE",
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
  sellTestPassed: true
});

assert.equal(safe.safe, true);
assert.equal(safe.action, "PASS");
assert.equal(safe.score, 100);

const honeypot = scanner.scan({
  address: "0xHONEYPOT",
  liquidityUsd: 100000,
  buyTaxPct: 2,
  sellTaxPct: 2,
  topHolderPct: 15,
  honeypot: true,
  sellBlocked: false,
  liquidityLocked: true,
  contractVerified: true,
  sellTestPassed: true
});

assert.equal(honeypot.safe, false);
assert.equal(honeypot.action, "HOLD");
assert.ok(honeypot.reasons.includes("HONEYPOT_DETECTED"));

const lowLiquidity = scanner.scan({
  address: "0xLOWLIQ",
  liquidityUsd: 1000,
  buyTaxPct: 2,
  sellTaxPct: 2,
  topHolderPct: 15,
  honeypot: false,
  sellBlocked: false,
  liquidityLocked: true,
  contractVerified: true,
  sellTestPassed: true
});

assert.equal(lowLiquidity.safe, false);
assert.ok(lowLiquidity.reasons.includes("LIQUIDITY_TOO_LOW"));

console.log("TokenSafetyScanner tests passed");
