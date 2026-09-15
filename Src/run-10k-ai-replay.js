import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createMultiCoinCandidateEngine } from "./MultiCoinCandidateEngine.js";

const execFileAsync = promisify(execFile);

const UNIVERSE_SIZE = 10_000;
const GROQ_MAX = Math.max(1, Number(process.env.REPLAY_GROQ_MAX || 8));
const GEMINI_MAX = Math.max(1, Number(process.env.REPLAY_GEMINI_MAX || 4));
const CONCURRENCY = Math.max(1, Number(process.env.REPLAY_AI_CONCURRENCY || 2));
const NOW = Date.now();

function makeUniverse(nowMs) {
  return Array.from({ length: UNIVERSE_SIZE }, (_, index) => {
    const n = index + 1;
    return {
      productId: `COIN${String(n).padStart(5, "0")}-USD`,
      price: 1 + (n % 997) / 100,
      bid: 1 + (n % 997) / 100,
      ask: 1 + (n % 997) / 100 + 0.0005,
      volume24h: 100_000 + ((UNIVERSE_SIZE - n) * 25_000),
      change24hPct: ((n % 31) - 15) / 2,
      timestamp: new Date(nowMs).toISOString()
    };
  });
}

async function runAgent(candidate, provider) {
  const payload = JSON.stringify({
    symbol: candidate.symbol,
    asOf: new Date(candidate.timestamp).toISOString()
  });

  const env = {
    ...process.env,
    TRADINGAGENTS_LLM_PROVIDER: provider,
    TRADINGAGENTS_ENABLED: "1"
  };

  const started = Date.now();
  try {
    const { stdout } = await execFileAsync(
      process.env.TRADINGAGENTS_PYTHON || "python3",
      [process.env.TRADINGAGENTS_RUNNER_SCRIPT || "Python/tradingagents_runner.py"],
      { input: payload, env, timeout: Number(process.env.TRADINGAGENTS_TIMEOUT_MS || 300_000), maxBuffer: 2 * 1024 * 1024 }
    );
    const result = JSON.parse(stdout.trim().split("\n").at(-1));
    return {
      ...result,
      productId: candidate.productId,
      triageScore: candidate.triageScore,
      provider,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      productId: candidate.productId,
      action: "UNKNOWN",
      confidence: 0,
      reason: "AI_RUNTIME_ERROR",
      provider,
      triageScore: candidate.triageScore,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message.slice(0, 300) : "UNKNOWN_ERROR"
    };
  }
}

async function boundedMap(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

function countActions(results) {
  return results.reduce((counts, result) => {
    const action = String(result?.decision || result?.action || "UNKNOWN").toUpperCase();
    counts[action] = (counts[action] || 0) + 1;
    return counts;
  }, {});
}

const engine = createMultiCoinCandidateEngine({ maxCandidates: GROQ_MAX });
const universe = makeUniverse(NOW);
const triageStarted = Date.now();
const triage = engine.rank(universe, NOW);
const triageMs = Date.now() - triageStarted;

const groq = await boundedMap(
  triage.candidates.slice(0, GROQ_MAX),
  CONCURRENCY,
  candidate => runAgent(candidate, "groq")
);

const geminiCandidates = groq
  .filter(result => result && result.productId && String(result.decision || result.action || "UNKNOWN").toUpperCase() !== "UNKNOWN")
  .slice(0, GEMINI_MAX)
  .map(result => triage.candidates.find(candidate => candidate.productId === result.productId))
  .filter(Boolean);

const gemini = await boundedMap(
  geminiCandidates,
  CONCURRENCY,
  candidate => runAgent(candidate, "google")
);

const finalPaper = gemini.map((result, index) => ({
  productId: result.productId,
  action: String(result.decision || result.action || "UNKNOWN").toUpperCase(),
  groqAction: String(groq.find(item => item.productId === result.productId)?.decision || "UNKNOWN").toUpperCase(),
  geminiAction: String(result.decision || "UNKNOWN").toUpperCase(),
  triageScore: result.triageScore,
  paperOnly: true,
  executionAllowed: false,
  rank: index + 1
}));

console.log(JSON.stringify({
  mode: "PAPER_ONLY_AI_REPLAY",
  realMoneyTrading: false,
  walletSigning: false,
  liveExecution: false,
  universeInput: UNIVERSE_SIZE,
  triage: {
    elapsedMs: triageMs,
    universeSize: triage.universeSize,
    rejected: triage.rejected,
    selectedForGroq: triage.candidates.length
  },
  groq: {
    calls: groq.length,
    actions: countActions(groq),
    results: groq.map(({ error, ...result }) => result)
  },
  gemini: {
    calls: gemini.length,
    actions: countActions(gemini),
    results: gemini.map(({ error, ...result }) => result)
  },
  finalPaper,
  safetyAssertion: finalPaper.every(item => item.paperOnly && !item.executionAllowed)
}, null, 2));

if (triage.universeSize !== UNIVERSE_SIZE) process.exitCode = 1;
if (!finalPaper.every(item => item.paperOnly && !item.executionAllowed)) process.exitCode = 1;
