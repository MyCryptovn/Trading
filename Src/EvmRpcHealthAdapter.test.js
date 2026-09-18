import assert from "node:assert/strict";
import { createEvmRpcHealthAdapter } from "./EvmRpcHealthAdapter.js";

let calls = [];
const fetchImpl = async (_url, options) => {
  calls.push(JSON.parse(options.body));
  const request = JSON.parse(options.body);

  if (request.method === "eth_chainId") {
    return { ok: true, json: async () => ({ jsonrpc: "2.0", id: request.id, result: "0x1" }) };
  }

  if (request.method === "eth_blockNumber") {
    return { ok: true, json: async () => ({ jsonrpc: "2.0", id: request.id, result: "0x1234" }) };
  }

  throw new Error("unexpected method");
};

const adapter = createEvmRpcHealthAdapter({
  rpcUrl: "https://example.invalid",
  expectedChainId: "1",
  fetchImpl
});

const result = await adapter.health();

assert.equal(result.ok, true);
assert.equal(result.reason, "RPC_HEALTHY");
assert.equal(result.chainId, 1);
assert.equal(result.blockNumber, 0x1234);
assert.deepEqual(calls.map((call) => call.method), ["eth_chainId", "eth_blockNumber"]);

const missing = createEvmRpcHealthAdapter({ rpcUrl: "", fetchImpl });
assert.deepEqual(await missing.health(), {
  ok: false,
  reason: "ETHEREUM_RPC_URL_MISSING"
});

const mismatch = createEvmRpcHealthAdapter({
  rpcUrl: "https://example.invalid",
  expectedChainId: "56",
  fetchImpl
});
const mismatchResult = await mismatch.health();
assert.equal(mismatchResult.ok, false);
assert.equal(mismatchResult.reason, "RPC_CHAIN_ID_MISMATCH");
assert.equal(mismatchResult.expectedChainId, 56);
assert.equal(mismatchResult.observedChainId, 1);

console.log("EvmRpcHealthAdapter tests passed");
