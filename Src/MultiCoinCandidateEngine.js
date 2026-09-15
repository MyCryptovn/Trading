const DEFAULTS = Object.freeze({
  maxCandidates: 20,
  minPrice: 0,
  maxSpreadPct: 0.4,
  maxAgeMs: 120000,
  minVolume24hUsd: 0
});

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizeTicker(raw, nowMs, cfg) {
  if (!raw || typeof raw !== "object") return null;

  const productId = String(raw.productId || "").trim().toUpperCase();
  const price = Number(raw.price);
  const bid = Number(raw.bid);
  const ask = Number(raw.ask);
  const volume24h = Number(raw.volume24h);
  const change24hPct = Number(raw.change24hPct);
  const timestamp = new Date(raw.timestamp || 0).getTime();

  if (!productId || !finite(price) || price <= cfg.minPrice) return null;
  if (!finite(bid) || !finite(ask) || bid <= 0 || ask < bid) return null;
  if (!finite(volume24h) || volume24h < cfg.minVolume24hUsd) return null;
  if (!finite(change24hPct)) return null;
  if (!finite(timestamp) || timestamp > nowMs + 5000 || nowMs - timestamp > cfg.maxAgeMs) return null;

  const spreadPct = ((ask - bid) / price) * 100;
  if (!finite(spreadPct) || spreadPct < 0 || spreadPct > cfg.maxSpreadPct) return null;

  return {
    productId,
    symbol: productId.endsWith("-USD") ? productId.slice(0, -4) : productId,
    price,
    bid,
    ask,
    spreadPct,
    volume24h,
    change24hPct,
    timestamp
  };
}

function scoreCandidate(candidate, nowMs, cfg) {
  const freshness = Math.max(0, 1 - ((nowMs - candidate.timestamp) / cfg.maxAgeMs));
  const volumeScore = Math.min(1, Math.log10(candidate.volume24h + 1) / 10);
  const movementScore = Math.min(1, Math.abs(candidate.change24hPct) / 10);
  const spreadScore = Math.max(0, 1 - (candidate.spreadPct / cfg.maxSpreadPct));

  return (
    freshness * 25 +
    volumeScore * 30 +
    movementScore * 25 +
    spreadScore * 20
  );
}

/**
 * Broad, cheap market triage. This is deliberately NOT a safety gate and
 * never produces a trade decision. It exists to reduce an arbitrarily large
 * market universe to a small set that expensive research can inspect.
 */
export function createMultiCoinCandidateEngine(options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  if (!finite(cfg.maxCandidates) || Number(cfg.maxCandidates) < 1) {
    throw new TypeError("maxCandidates must be >= 1");
  }
  if (!finite(cfg.maxSpreadPct) || Number(cfg.maxSpreadPct) < 0) {
    throw new TypeError("maxSpreadPct must be >= 0");
  }
  if (!finite(cfg.maxAgeMs) || Number(cfg.maxAgeMs) <= 0) {
    throw new TypeError("maxAgeMs must be > 0");
  }

  function rank(records = [], nowMs = Date.now()) {
    if (!Array.isArray(records) || !finite(nowMs)) {
      return { candidates: [], rejected: 0, reasons: ["INVALID_MARKET_UNIVERSE"] };
    }

    const byProduct = new Map();
    let rejected = 0;

    for (const raw of records) {
      const candidate = normalizeTicker(raw, Number(nowMs), cfg);
      if (!candidate) {
        rejected += 1;
        continue;
      }

      const existing = byProduct.get(candidate.productId);
      if (!existing || candidate.timestamp > existing.timestamp) {
        byProduct.set(candidate.productId, candidate);
      } else {
        rejected += 1;
      }
    }

    const candidates = [...byProduct.values()]
      .map(candidate => ({
        ...candidate,
        triageScore: Number(scoreCandidate(candidate, Number(nowMs), cfg).toFixed(2))
      }))
      .sort((a, b) => b.triageScore - a.triageScore);

    return {
      candidates: candidates.slice(0, Math.max(1, Math.floor(Number(cfg.maxCandidates)))),
      rejected,
      universeSize: byProduct.size,
      reasons: candidates.length ? ["MULTI_COIN_TRIAGE_COMPLETE"] : ["NO_FRESH_MARKET_CANDIDATES"]
    };
  }

  return { rank, config: cfg };
}
