const DEFAULTS = Object.freeze({
  baseUrl: "https://api.etherscan.io/v2/api",
  timeoutMs: 10000
});

function normalizeChainId(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  return null;
}

function clean(value) {
  return value === undefined || value === null || value === "" ? null : String(value);
}

export function createEtherscanDataAdapter({
  apiKey = process.env.ETHERSCAN_API_KEY || "",
  chainId = process.env.ETHERSCAN_CHAIN_ID || process.env.DEX_CHAIN_ID || "1",
  baseUrl = process.env.ETHERSCAN_BASE_URL || DEFAULTS.baseUrl,
  timeoutMs = DEFAULTS.timeoutMs,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  const normalizedChainId = normalizeChainId(chainId);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULTS.timeoutMs;

  async function request(params = {}) {
    if (!apiKey) return { ok: false, reason: "ETHERSCAN_API_KEY_MISSING" };
    if (!normalizedChainId) return { ok: false, reason: "ETHERSCAN_CHAIN_ID_INVALID" };

    const url = new URL(baseUrl);
    url.searchParams.set("chainid", normalizedChainId);
    url.searchParams.set("apikey", apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        return { ok: false, reason: "ETHERSCAN_HTTP_ERROR", status: response.status };
      }

      const payload = await response.json();
      const status = clean(payload?.status);
      const message = clean(payload?.message);

      if (status === "1") {
        return {
          ok: true,
          reason: "ETHERSCAN_OK",
          chainId: normalizedChainId,
          message,
          result: payload?.result ?? null
        };
      }

      const noRecords = /no records found/i.test(message || "");
      if (noRecords) {
        return {
          ok: true,
          reason: "ETHERSCAN_NO_RECORDS",
          chainId: normalizedChainId,
          message,
          result: Array.isArray(payload?.result) ? payload.result : []
        };
      }

      return {
        ok: false,
        reason: "ETHERSCAN_API_ERROR",
        chainId: normalizedChainId,
        message,
        result: payload?.result ?? null
      };
    } catch (error) {
      return {
        ok: false,
        reason: error?.name === "AbortError" ? "ETHERSCAN_TIMEOUT" : "ETHERSCAN_REQUEST_FAILED"
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function getNativeBalance(address, tag = "latest") {
    return request({
      module: "account",
      action: "balance",
      address,
      tag
    });
  }

  function getTokenTransfers({
    address,
    contractAddress,
    startBlock,
    endBlock,
    page = 1,
    offset = 100,
    sort = "desc"
  } = {}) {
    return request({
      module: "account",
      action: "tokentx",
      address,
      contractaddress: contractAddress,
      startblock: startBlock,
      endblock: endBlock,
      page,
      offset,
      sort
    });
  }

  function getContractSource(address) {
    return request({
      module: "contract",
      action: "getsourcecode",
      address
    });
  }

  function getTokenSupply(contractAddress) {
    return request({
      module: "stats",
      action: "tokensupply",
      contractaddress: contractAddress
    });
  }

  function getTokenInfo(contractAddress) {
    return request({
      module: "token",
      action: "tokeninfo",
      contractaddress: contractAddress
    });
  }

  function getGasOracle() {
    return request({
      module: "gastracker",
      action: "gasoracle"
    });
  }

  function getLogs({
    address,
    topic0,
    topic1,
    topic2,
    topic3,
    fromBlock = "0",
    toBlock = "latest",
    page = 1,
    offset = 1000
  } = {}) {
    return request({
      module: "logs",
      action: "getLogs",
      address,
      topic0,
      topic1,
      topic2,
      topic3,
      fromBlock,
      toBlock,
      page,
      offset
    });
  }

  return {
    request,
    getNativeBalance,
    getTokenTransfers,
    getContractSource,
    getTokenSupply,
    getTokenInfo,
    getGasOracle,
    getLogs,
    limits: Object.freeze({
      timeoutMs: timeout,
      chainId: normalizedChainId
    })
  };
}

export const DEFAULT_ETHERSCAN_DATA_LIMITS = DEFAULTS;
