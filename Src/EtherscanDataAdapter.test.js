import assert from "node:assert/strict";
import { createEtherscanDataAdapter } from "./EtherscanDataAdapter.js";

function makeFetch(payload, status = 200) {
  return async (url, options) => {
    assert.equal(options.method, "GET");
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("apikey"), "test-key");
    assert.equal(parsed.searchParams.get("chainid"), "42161");
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return payload;
      }
    };
  };
}

{
  const adapter = createEtherscanDataAdapter({
    apiKey: "test-key",
    chainId: 42161,
    fetchImpl: makeFetch({
      status: "1",
      message: "OK",
      result: [{ hash: "0xabc", tokenSymbol: "USDC" }]
    })
  });

  const result = await adapter.getTokenTransfers({
    address: "0x1111111111111111111111111111111111111111",
    contractAddress: "0x2222222222222222222222222222222222222222"
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, "ETHERSCAN_OK");
  assert.equal(result.result[0].tokenSymbol, "USDC");
}

{
  const adapter = createEtherscanDataAdapter({
    apiKey: "",
    chainId: 1,
    fetchImpl: async () => {
      throw new Error("must not call fetch without a key");
    }
  });

  const result = await adapter.getGasOracle();
  assert.deepEqual(result, {
    ok: false,
    reason: "ETHERSCAN_API_KEY_MISSING"
  });
}

{
  const adapter = createEtherscanDataAdapter({
    apiKey: "test-key",
    chainId: 1,
    fetchImpl: makeFetch({
      status: "0",
      message: "No records found",
      result: []
    })
  });

  const result = await adapter.getLogs({
    address: "0x3333333333333333333333333333333333333333"
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, "ETHERSCAN_NO_RECORDS");
  assert.deepEqual(result.result, []);
}

{
  const adapter = createEtherscanDataAdapter({
    apiKey: "test-key",
    chainId: 1,
    fetchImpl: makeFetch({
      status: "0",
      message: "NOTOK",
      result: "Invalid API Key"
    })
  });

  const result = await adapter.getContractSource(
    "0x4444444444444444444444444444444444444444"
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "ETHERSCAN_API_ERROR");
}

{
  const adapter = createEtherscanDataAdapter({
    apiKey: "test-key",
    chainId: 1,
    fetchImpl: makeFetch({}, 429)
  });

  const result = await adapter.getNativeBalance(
    "0x5555555555555555555555555555555555555555"
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "ETHERSCAN_HTTP_ERROR");
  assert.equal(result.status, 429);
}

{
  const adapter = createEtherscanDataAdapter({
    apiKey: "test-key",
    chainId: "bad",
    fetchImpl: async () => {
      throw new Error("must not call fetch with invalid chain");
    }
  });

  const result = await adapter.getTokenSupply(
    "0x6666666666666666666666666666666666666666"
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "ETHERSCAN_CHAIN_ID_INVALID"
  });
}

console.log("EtherscanDataAdapter tests passed");
