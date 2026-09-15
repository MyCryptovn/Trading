import { spawn } from "node:child_process";
import { createMultiCoinCandidateEngine } from "./MultiCoinCandidateEngine.js";

const UNIVERSE_SIZE = 10_000;
const GROQ_MAX = Math.max(1, Number(process.env.REPLAY_GROQ_MAX || 8));
const GEMINI_MAX = Math.max(1, Number(process.env.REPLAY_GEMINI_MAX || 4));
const CONCURRENCY = Math.max(1, Number(process.env.REPLAY_AI_CONCURRENCY || 2));
const NOW = Date.now();

function makeUniverse(nowMs) {
  return Array.from({ length: UNIVERSE_SIZE }, (_, index) => {
    const n = index + 1;
    const base = 1 + (n % 997) / 100;
    return {
      productId: `COIN${String(n).padStart(5, "0")}-USD`,
      price: base,
      bid: base,
      ask: base + 0.0005,
      volume24h: 100_000 + ((UNIVERSE_SIZE - n) * 25_000),
      change24hPct: ((n % 31) - 15) / 2,
      timestamp: new Date(nowMs).toISOString()
    };
  });
}

function runAgent(candidate, provider) {
  return new Promise(resolve => {
    const executable = process.env.TRADINGAGENTS_PYTHON || "python3";
    const script = process.env.TRADINGAGENTS_RUNNER_SCRIPT || "Python/tradingagents_runner.py";
    const timeoutMs = Number(process.env.TRADINGAGENTS_TIMEOUT_MS || 300_000);
    const child = spawn(executable, [script], {
      env: { ...process.env, TRADINGAGENTS_LLM_PROVIDER: provider, TRADINGAGENTS_ENABLED: "1" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    const chunks = [];
    const errors = [];
    const started = Date.now();
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, productId: candidate.productId, decision: "REVIEW", provider, reason: "AI_TIMEOUT", triageScore: candidate.triageScore, latencyMs: Date.now() - started });
    }, timeoutMs);

    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => errors.push(chunk));
    child.on("error", error => finish({ ok: false, productId: candidate.productId, decision: "REVIEW", provider, reason: "AI_PROCESS_ERROR", error: String(error.message).slice(0, 300), triageScore: candidate.triageScore, latencyMs: Date.now() - started }));
    child.on("close", code => {
      if (settled) return;
      try {
        const output = Buffer.concat(chunks).toString("utf8").trim();
        const result = JSON.parse(output.split("\n").at(-1));
        finish({ ...result, productId: candidate.productId, provider, triageScore: candidate.triageScore, latencyMs: Date.now() - started, processCode: code });
      } catch {
        finish({ ok: false, productId: candidate.productId, decision: "REVIEW", provider, reason: "AI_INVALID_OUTPUT", stderr: Buffer.concat(errors).toString("utf8").slice(0, 300), triageScore: candidate.triageScore, latencyMs: Date.now() - started, processCode: code });
      }
    });

    child.stdin.end(JSON.stringify({ symbol: candidate.symbol, asOf: new Date(candidate.timestamp).toISOString() }));
  });
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

function actionOf(result) {
  return String(result?.decision || result?.action || "UNKNOWN").toUpperCase();
}

function countActions(results) {
  return results.reduce((counts, result) => {
    const action = actionOf(result);
    counts[action] = (counts[action] || 0) + 1;
    return counts;
  }, {});
}

const engine = createMultiCoinCandidateEngine({ maxCandidates: GROQ_MAX });
const universe = makeUniverse(NOW);
const triageStarted = Date.now();
const triage = engine.rank(universe, NOW);
const triageMs = Date.now() - triageStarted;

const groq = await boundedMap(triage.candidates.slice(0, GROQ_MAX), CONCURRENCY, candidate => runAgent(candidate, "groq"));
const geminiCandidates = groq
  .filter(result => result?.productId && actionOf(result) !== "UNKNOWN" && actionOf(result) !== "REVIEW")
  .slice(0, GEMINI_MAX)
  .map(result => triage.candidates.find(candidate => candidate.productId === result.productId))
  .filter(Boolean);
const gemini = await boundedMap(geminiCandidates, CONCURRENCY, candidate => runAgent(candidate, "google"));

const groqById = new Map(groq.map(result => [result.productId, result]));
const finalPaper = gemini.map((result, index) => ({
  productId: result.productId,
  action: actionOf(result),
  groqAction: actionOf(groqById.get(result.productId)),
  geminiAction: actionOf(result),
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
  triage: { elapsedMs: triageMs, universeSize: triage.universeSize, rejected: triage.rejected, selectedForGroq: triage.candidates.length },
  groq: { calls: groq.length, actions: countActions(groq), results: groq },
  gemini: { calls: gemini.length, actions: countActions(gemini), results: gemini },
  finalPaper,
  safetyAssertion: finalPaper.every(item => item.paperOnly && !item.executionAllowed)
}, null, 2));

if (triage.universeSize !== UNIVERSE_SIZE) process.exitCode = 1;
if (!finalPaper.every(item => item.paperOnly && !item.executionAllowed)) process.exitCode = 1;
