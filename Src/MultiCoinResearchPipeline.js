import { createAIResearchRouter } from "./AIResearchRouter.js";

const DEFAULTS = Object.freeze({
  maxCandidates: 8,
  maxConcurrent: 2,
  maxAgeMs: 120000,
  minIntervalMs: 300000
});

export function createMultiCoinResearchPipeline(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const router = options.router || createAIResearchRouter({
    maxCandidates: cfg.maxCandidates,
    maxConcurrent: cfg.maxConcurrent,
    maxAgeMs: cfg.maxAgeMs
  });

  if (!Number.isFinite(Number(cfg.minIntervalMs)) || Number(cfg.minIntervalMs) < 0) {
    throw new TypeError("minIntervalMs must be >= 0");
  }

  let lastRunAt = 0;
  let inFlight = false;
  let latest = {
    ok: false,
    results: [],
    selected: 0,
    rejected: 0,
    reason: "NOT_RUN"
  };

  async function research(candidates = [], analyze, nowMs = Date.now()) {
    if (inFlight) {
      return { ...latest, skipped: true, reason: "RESEARCH_IN_FLIGHT" };
    }

    if (Number(nowMs) - lastRunAt < Number(cfg.minIntervalMs)) {
      return { ...latest, skipped: true, reason: "RESEARCH_COOLDOWN" };
    }

    inFlight = true;
    try {
      const result = await router.research(candidates, analyze, nowMs);
      lastRunAt = Number(nowMs);
      latest = {
        ok: result.reason === "AI_RESEARCH_COMPLETE",
        ...result,
        timestamp: Number(nowMs)
      };
      return latest;
    } finally {
      inFlight = false;
    }
  }

  function getLatest() {
    return latest;
  }

  return { research, getLatest, config: cfg };
}

export const MULTI_COIN_RESEARCH_PIPELINE_DEFAULTS = DEFAULTS;
