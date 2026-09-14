const DEFAULTS = {
  minLiquidityUsd: 25000,
  maxSpreadPct: 0.4,
  maxAgeMs: 120000,
  maxCandidates: 10
};

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizeCandidate(raw = {}, nowMs, maxAgeMs) {
  if (!raw || typeof raw !== "object") return null;

  const timestamp = Number(raw.timestamp);
  const liquidityUsd = Number(raw.liquidityUsd);
  const spreadPct = Number(raw.spreadPct);

  if (!finite(timestamp) || !finite(liquidityUsd) || liquidityUsd < 0) return null;
  if (!finite(spreadPct) || spreadPct < 0) return null;
  if (timestamp > nowMs + 30000 || nowMs - timestamp > maxAgeMs) return null;

  const id = raw.id ?? raw.address ?? raw.symbol;
  if (!id) return null;

  return {
    id: String(id),
    address: raw.address ? String(raw.address) : null,
    symbol: raw.symbol ? String(raw.symbol) : null,
    chain: raw.chain ? String(raw.chain) : null,
    liquidityUsd,
    spreadPct,
    timestamp,
    source: raw.source ? String(raw.source) : "unknown",
    raw
  };
}

function isBetter(a, b) {
  if (!b) return true;
  if (a.liquidityUsd !== b.liquidityUsd) return a.liquidityUsd > b.liquidityUsd;
  return a.timestamp > b.timestamp;
}

export function createFastDiscoveryEngine(options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  if (!finite(cfg.minLiquidityUsd) || cfg.minLiquidityUsd < 0) {
    throw new TypeError("minLiquidityUsd must be a non-negative number");
  }
  if (!finite(cfg.maxSpreadPct) || cfg.maxSpreadPct < 0) {
    throw new TypeError("maxSpreadPct must be a non-negative number");
  }
  if (!finite(cfg.maxAgeMs) || cfg.maxAgeMs <= 0) {
    throw new TypeError("maxAgeMs must be a positive number");
  }

  function discover(records = [], nowMs = Date.now()) {
    if (!Array.isArray(records) || !finite(nowMs)) {
      return { candidates: [], rejected: 0, reasons: ["INVALID_DISCOVERY_INPUT"] };
    }

    const byId = new Map();
    let rejected = 0;

    for (const raw of records) {
      const candidate = normalizeCandidate(raw, Number(nowMs), cfg.maxAgeMs);
      if (!candidate) {
        rejected += 1;
        continue;
      }

      if (candidate.liquidityUsd < cfg.minLiquidityUsd) {
        rejected += 1;
        continue;
      }

      if (candidate.spreadPct > cfg.maxSpreadPct) {
        rejected += 1;
        continue;
      }

      const existing = byId.get(candidate.id);
      if (!existing) {
        byId.set(candidate.id, candidate);
      } else if (isBetter(candidate, existing)) {
        byId.set(candidate.id, candidate);
        rejected += 1;
      } else {
        rejected += 1;
      }
    }

    const accepted = [...byId.values()];
    accepted.sort((a, b) => {
      if (b.liquidityUsd !== a.liquidityUsd) return b.liquidityUsd - a.liquidityUsd;
      return b.timestamp - a.timestamp;
    });

    return {
      candidates: accepted.slice(0, Math.max(1, Number(cfg.maxCandidates) || 10)),
      rejected,
      reasons: accepted.length ? ["DISCOVERY_COMPLETE"] : ["NO_SAFE_CANDIDATES"]
    };
  }

  return { discover };
}
