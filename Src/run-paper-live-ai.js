import { createPaperLiveResearchEngine } from "./PaperLiveResearchEngine.js";
import { createTradingAgentsAdapter } from "./TradingAgentsAdapter.js";

const durationMs = Math.max(60_000, Number(process.env.PAPER_LIVE_DURATION_MS || 10 * 60 * 1000));
const maxCandidates = Math.max(1, Number(process.env.PAPER_LIVE_MAX_CANDIDATES || 4));
const maxConcurrent = Math.max(1, Number(process.env.PAPER_LIVE_MAX_CONCURRENT || 2));

const adapter = createTradingAgentsAdapter();
const engine = createPaperLiveResearchEngine({
  durationMs,
  maxCandidates,
  maxConcurrent
});

const result = await engine.run({
  durationMs,
  products: String(process.env.MARKET_PRODUCTS || "BTC-USD,ETH-USD,SOL-USD,BNB-USD,XRP-USD,ADA-USD,DOGE-USD,AVAX-USD,LINK-USD,SUI-USD")
    .split(",")
    .map(value => value.trim().toUpperCase())
    .filter(Boolean),
  analyze: candidate => adapter.analyze({
    nowMs: Date.now(),
    snapshot: {
      symbol: candidate.symbol || candidate.productId.replace(/-USD$/, ""),
      price: Number(candidate.price),
      bid: Number(candidate.bid),
      ask: Number(candidate.ask),
      spreadPct: Number(candidate.spreadPct),
      volume24h: Number(candidate.volume24h),
      change24hPct: Number(candidate.change24hPct),
      timestamp: candidate.timestamp
    },
    context: {
      mode: "LIVE_MARKET_PAPER_RESEARCH",
      triageScore: candidate.triageScore
    }
  })
});

const results = Array.isArray(result.latestResearch?.results)
  ? result.latestResearch.results
  : [];
const successfulResults = results.filter(item => item?.ok === true && ["BUY", "SELL", "HOLD"].includes(String(item.action || "").toUpperCase()));
const failedResults = results.filter(item => item?.ok !== true);

const report = {
  mode: "PAPER_ONLY",
  realMoneyTrading: false,
  durationMs: result.elapsedMs,
  ticks: result.ticks,
  rejectedTicks: result.rejectedTicks,
  universeSize: result.universeSize,
  researchRuns: result.researchRuns,
  researchSelected: result.researchSelected,
  aiSuccessful: successfulResults.length,
  aiFailed: failedResults.length,
  actions: result.actions,
  errors: result.errors,
  latestResearch: result.latestResearch
};

console.log(JSON.stringify(report, null, 2));

// A green run must mean the AI actually executed and returned at least one
// valid directional decision. Zero successful AI calls is a failed validation,
// not a successful HOLD state.
if (result.researchRuns < 1 || result.researchSelected < 1 || successfulResults.length < 1) {
  console.error("PAPER_AI_VALIDATION_FAILED: no successful TradingAgents decision was produced");
  process.exitCode = 1;
}
