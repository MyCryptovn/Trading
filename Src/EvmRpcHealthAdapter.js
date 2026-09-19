const DEFAULTS = Object.freeze({
  timeoutMs: 10000
});

function normalizeChainId(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function createEvmRpcHealthAdapter({
  rpcUrl = process.env.ETHEREUM_RPC_URL || "",
  expectedChainId = process.env.DEX_CHAIN_ID || "1",
  timeoutMs = DEFAULTS.timeoutMs,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  const chainId = normalizeChainId(expectedChainId);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULTS.timeoutMs;

  async function call(method, params = []) {
    if (!rpcUrl) return { ok: false, reason: "ETHEREUM_RPC_URL_MISSING" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        signal: controller.signal
      });

      if (!response.ok) return { ok: false, reason: "RPC_HTTP_ERROR", status: response.status };

      const payload = await response.json();
      if (payload?.error) {
        return { ok: false, reason: "RPC_ERROR", error: payload.error.message || "RPC_ERROR" };
      }

      return { ok: true, result: payload?.result ?? null };
    } catch (error) {
      return {
        ok: false,
        reason: error?.name === "AbortError" ? "RPC_TIMEOUT" : "RPC_REQUEST_FAILED"
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function health() {
    const network = await call("eth_chainId");
    if (!network.ok) return network;

    const observedChainId = normalizeChainId(
      typeof network.result === "string" && network.result.startsWith("0x")
        ? Number.parseInt(network.result, 16)
        : network.result
    );

    if (!observedChainId) return { ok: false, reason: "RPC_CHAIN_ID_INVALID" };

    if (chainId && observedChainId !== chainId) {
      return {
        ok: false,
        reason: "RPC_CHAIN_ID_MISMATCH",
        expectedChainId: chainId,
        observedChainId
      };
    }

    const block = await call("eth_blockNumber");
    if (!block.ok) return block;

    return {
      ok: true,
      reason: "RPC_HEALTHY",
      chainId: observedChainId,
      blockNumber: typeof block.result === "string" ? Number.parseInt(block.result, 16) : null
    };
  }

  return { health, limits: { timeoutMs: timeout } };
}

export const DEFAULT_EVM_RPC_HEALTH_LIMITS = DEFAULTS;
