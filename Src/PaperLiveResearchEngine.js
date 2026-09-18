import { startMarketFeed } from "./MarketFeed.js";
import { createMarketDataQualityGate } from "./DataQualityGate.js";
import { createMultiCoinCandidateEngine } from "./MultiCoinCandidateEngine.js";
import { createMultiCoinResearchPipeline } from "./MultiCoinResearchPipeline.js";
import { createAIPerformanceJournal } from "./AIPerformanceJournal.js";
import { normalizeAction } from "./SignalContract.js";

const DEFAULTS = Object.freeze({
  durationMs: 10 * 60 * 1000,
  maxCandidates: 8,
  maxConcurrent: 2,
  researchIntervalMs: 5 * 60 * 1000,
  maxAgeMs: 120000,
  aiJournalHorizonMs: 15 * 60 * 1000
});

export function createPaperLiveResearchEngine(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const quality = options.qualityGate || createMarketDataQualityGate({ maxAgeMs: cfg.maxAgeMs });
  const candidateEngine = options.candidateEngine || createMultiCoinCandidateEngine({
    maxCandidates: Math.max(20, cfg.maxCandidates),
    maxAgeMs: cfg.maxAgeMs
  });
  const researchPipeline = options.researchPipeline || createMultiCoinResearchPipeline({
    maxCandidates: cfg.maxCandidates,
    maxConcurrent: cfg.maxConcurrent,
    maxAgeMs: cfg.maxAgeMs,
    minIntervalMs: cfg.researchIntervalMs
  });
  const aiJournal = options.aiJournal || createAIPerformanceJournal({
    storagePath: options.aiJournalStoragePath,
    horizonMs: cfg.aiJournalHorizonMs
  });
  const feedFactory = options.feedFactory || startMarketFeed;

  const universe = new Map();
  const stats = {
    startedAt: 0,
    endedAt: 0,
    ticks: 0,
    rejectedTicks: 0,
    universeSize: 0,
    researchRuns: 0,
    researchSelected: 0,
    aiObservationsOpened: 0,
    aiObservationsResolved: 0,
    actions: { BUY: 0, SELL: 0, HOLD: 0, UNKNOWN: 0 },
    errors: 0
  };

  async function run({ durationMs = cfg.durationMs, analyze, products } = {}) {
    if (typeof analyze !== "function") {
      throw new TypeError("analyze must be a function");
    }
    if (!Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) {
      throw new TypeError("durationMs must be > 0");
    }

    await aiJournal.initialize();
    stats.startedAt = Date.now();
    let resolveDone;
    const done = new Promise(resolve => { resolveDone = resolve; });
    let stopFeed = null;
    let timer = null;
    let researchInFlight = false;
    let researchScheduled = false;
    let activeResearch = null;

    const maybeResearch = async () => {
      researchScheduled = false;
      if (researchInFlight) return;
      const ranked = candidateEngine.rank([...universe.values()], Date.now());
      if (!ranked.candidates.length) return;

      researchInFlight = true;
      activeResearch = (async () => {
        try {
          const result = await researchPipeline.research(ranked.candidates, analyze, Date.now());
          if (!result.skipped) {
            stats.researchRuns += 1;
            stats.researchSelected += result.selected;
            for (const item of result.results || []) {
              const action = normalizeAction(item?.action);
              stats.actions[action] += 1;
              const observation = item?.observation;
              if (action && observation) {
                const opened = await aiJournal.observe({
                  productId: observation.productId,
                  action,
                  price: observation.price,
                  timestamp: observation.timestamp
                });
                if (opened.accepted) stats.aiObservationsOpened += 1;
              }
            }
          }
        } catch {
          stats.errors += 1;
        } finally {
          researchInFlight = false;
        }
      })();

      await activeResearch;
    };

    const scheduleResearch = () => {
      if (researchScheduled || researchInFlight) return;
      researchScheduled = true;
      queueMicrotask(() => { void maybeResearch(); });
    };

    const finish = async () => {
      if (timer) clearTimeout(timer);
      if (researchScheduled) await new Promise(resolve => queueMicrotask(resolve));
      if (activeResearch) await activeResearch;
      stopFeed?.();
      stats.endedAt = Date.now();
      stats.universeSize = universe.size;
      resolveDone({
        ...stats,
        elapsedMs: stats.endedAt - stats.startedAt,
        latestResearch: researchPipeline.getLatest(),
        aiPerformance: aiJournal.summary()
      });
    };

    stopFeed = feedFactory({
      products,
      onTicker: async ticker => {
        stats.ticks += 1;
        const check = quality.validate(ticker);
        if (!check.ok) {
          stats.rejectedTicks += 1;
          return;
        }
        universe.set(ticker.productId, ticker);
        const resolution = await aiJournal.resolveTick({
          productId: ticker.productId,
          price: ticker.price,
          timestamp: Date.now()
        });
        stats.aiObservationsResolved += resolution.samples?.length || 0;
        stats.universeSize = universe.size;
        scheduleResearch();
      },
      onError: () => {
        stats.errors += 1;
      }
    });

    timer = setTimeout(() => { void finish(); }, Number(durationMs));
    return done;
  }

  return { run, stats, config: cfg, aiJournal };
}

export const PAPER_LIVE_RESEARCH_DEFAULTS = DEFAULTS;
