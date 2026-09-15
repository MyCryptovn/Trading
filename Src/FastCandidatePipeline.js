import { createFastDiscoveryEngine } from "./FastDiscoveryEngine.js";
import { scoreCandidate } from "./FastCandidateScorer.js";

const DEFAULTS = Object.freeze({
  minLiquidityUsd: 25000,
  maxSpreadPct: 0.4,
  maxDataAgeMs: 120000,
  maxCandidates: 10
});

function finite(value) {
  return Number.isFinite(Number(value));
}

/**
 * Fail-closed bridge between broad market discovery and the deeper decision
 * pipeline. It only admits candidates that pass discovery and every scorer
 * hard gate. It never executes trades.
 */
export function createFastCandidatePipeline(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const discovery = createFastDiscoveryEngine(cfg);

  function evaluate(records = [], nowMs = Date.now()) {
    if (!Array.isArray(records) || !finite(nowMs)) {
      return {
        candidates: [],
        rejected: 0,
        reasons: ["INVALID_CANDIDATE_INPUT"]
      };
    }

    const discovered = discovery.discover(records, Number(nowMs));
    const candidates = [];
    let rejected = discovered.rejected;

    for (const candidate of discovered.candidates) {
      const raw = candidate.raw || {};
      const score = scoreCandidate({
        ...raw,
        id: candidate.id,
        address: candidate.address,
        symbol: candidate.symbol,
        chain: candidate.chain,
        liquidityUsd: candidate.liquidityUsd,
        spreadPct: candidate.spreadPct,
        timestamp: candidate.timestamp,
        nowMs: Number(nowMs)
      }, cfg);

      if (score.gates && Object.values(score.gates).every(Boolean)) {
        candidates.push({
          ...candidate,
          score: score.score,
          scoreAction: score.action,
          scoreReasons: score.reasons,
          scoreComponents: score.components,
          gates: score.gates
        });
      } else {
        rejected += 1;
      }
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.liquidityUsd !== a.liquidityUsd) return b.liquidityUsd - a.liquidityUsd;
      return b.timestamp - a.timestamp;
    });

    return {
      candidates: candidates.slice(0, Math.max(1, Number(cfg.maxCandidates) || 10)),
      rejected,
      discovered: discovered.candidates.length,
      reasons: candidates.length ? ["FAST_CANDIDATE_PIPELINE_READY"] : ["NO_SAFE_CANDIDATES"]
    };
  }

  return { evaluate, config: cfg };
}
