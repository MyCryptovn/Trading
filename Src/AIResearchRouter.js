const DEFAULTS = Object.freeze({
  maxCandidates: 8,
  maxConcurrent: 2,
  maxAgeMs: 120000
});

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizeCandidate(candidate, nowMs, maxAgeMs) {
  if (!candidate || typeof candidate !== "object") return null;
  const timestamp = new Date(candidate.timestamp || 0).getTime();
  if (!finite(timestamp) || timestamp > nowMs + 5000 || nowMs - timestamp > maxAgeMs) return null;
  if (!candidate.productId || !finite(candidate.price) || Number(candidate.price) <= 0) return null;
  return { ...candidate, timestamp };
}

/**
 * Bounded AI research fan-out. It deliberately limits expensive model calls
 * after cheap market triage. Research results remain observational: this
 * router has no wallet, signing, or execution capability.
 */
export function createAIResearchRouter(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  if (!finite(cfg.maxCandidates) || Number(cfg.maxCandidates) < 1) {
    throw new TypeError("maxCandidates must be >= 1");
  }
  if (!finite(cfg.maxConcurrent) || Number(cfg.maxConcurrent) < 1) {
    throw new TypeError("maxConcurrent must be >= 1");
  }
  if (!finite(cfg.maxAgeMs) || Number(cfg.maxAgeMs) <= 0) {
    throw new TypeError("maxAgeMs must be > 0");
  }

  async function research(candidates = [], analyze, nowMs = Date.now()) {
    if (!Array.isArray(candidates) || typeof analyze !== "function" || !finite(nowMs)) {
      return { results: [], selected: 0, rejected: 0, reason: "INVALID_AI_RESEARCH_INPUT" };
    }

    const selected = candidates
      .map(candidate => normalizeCandidate(candidate, Number(nowMs), cfg.maxAgeMs))
      .filter(Boolean)
      .slice(0, Math.floor(Number(cfg.maxCandidates)));

    const results = new Array(selected.length);
    let cursor = 0;
    const workerCount = Math.min(Math.floor(Number(cfg.maxConcurrent)), selected.length);

    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= selected.length) return;
        const candidate = selected[index];
        try {
          results[index] = await analyze(candidate);
        } catch (error) {
          results[index] = {
            ok: false,
            productId: candidate.productId,
            action: "UNKNOWN",
            confidence: null,
            reason: error instanceof Error ? error.message : "AI_RESEARCH_ERROR"
          };
        }
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return {
      results,
      selected: selected.length,
      rejected: candidates.length - selected.length,
      reason: selected.length ? "AI_RESEARCH_COMPLETE" : "NO_FRESH_AI_CANDIDATES"
    };
  }

  return { research, config: cfg };
}

export const AI_RESEARCH_ROUTER_DEFAULTS = DEFAULTS;
