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

console.log(JSON.stringify({
  mode: "PAPER_ONLY",
  realMoneyTrading: false,
  durationMs: result.elapsedMs,
  ticks: result.ticks,
  rejectedTicks: result.rejectedTicks,
  universeSize: result.universeSize,
  researchRuns: result.researchRuns,
  researchSelected: result.researchSelected,
  actions: result.actions,
  errors: result.errors,
  latestResearch: result.latestResearch
}, null, 2));
