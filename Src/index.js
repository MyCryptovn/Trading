import { config } from "./config.js";
import { getPrice } from "./maket.js";
import { startMarketFeed } from "./MarketFeed.js";
import { createMarketScanner } from "./MarketScanner.js";
import { createMarketDataQualityGate } from "./DataQualityGate.js";
import { evaluateSignal } from "./SignalEngine.js";
import { createRiskEngine } from "./RiskEngine.js";
import { createDexFlowMonitor } from "./DexFlowMonitor.js";
import { decideTrade } from "./TradeDecisionGate.js";
import { createStatisticalJournal } from "./StatisticalJournal.js";
import { estimateStatisticalEdge, walkForwardValidate } from "./StatisticalEdgeEngine.js";
import { createPipelineReliability } from "./PipelineReliability.js";
import { createTradingAgentsAdapter } from "./TradingAgentsAdapter.js";
import { createSignalFusion } from "./SignalFusion.js";
import { createMultiCoinCandidateEngine } from "./MultiCoinCandidateEngine.js";
import { actionToDirection, normalizeAction } from "./SignalContract.js";
import {
  createPaperTrader,
  buy,
  sell,
  getEquity
} from "./Papertrader.js";
import { createDashboardServer } from "./DashboardServer.js";
import { log, logError } from "./logger.js";

const state = createPaperTrader(config.startBalance);
const scanner = createMarketScanner();
const dataQuality = createMarketDataQualityGate();
const risk = createRiskEngine();
const tradingAgents = createTradingAgentsAdapter();
const signalFusion = createSignalFusion();
const multiCoinCandidates = createMultiCoinCandidateEngine({ maxCandidates: 20 });
const marketUniverse = new Map();
const reliability = createPipelineReliability({
  timeoutMs: config.pipelineTimeoutMs,
  retries: config.pipelineRetries,
  retryDelayMs: config.pipelineRetryDelayMs,
  circuitFailureThreshold: config.pipelineCircuitFailureThreshold,
  circuitCooldownMs: config.pipelineCircuitCooldownMs,
  onEvent: event => {
    if (["RETRY", "FAILED", "BLOCKED", "CIRCUIT_OPEN"].includes(event.type)) {
      dashboard?.pushActivity(`${event.type} ${event.name}${event.errorCode ? `: ${event.errorCode}` : ""}`, "risk");
    }
  }
});
const statisticalJournal = createStatisticalJournal({
  horizonMs: config.statisticalHorizonMs,
  maxSamples: config.statisticalMaxSamples,
  storagePath: config.statisticalJournalPath
});
const dexFlow = createDexFlowMonitor({
  network: config.dexNetwork,
  poolAddress: config.dexPoolAddress,
  asset: config.asset,
  dexAsset: config.dexAsset
});
const startingEquity = config.startBalance;
let latestDexFlow = null;
let latestStatisticalEdge = null;
let latestWalkForward = null;
let latestTicker = null;
let latestScan = null;
let latestScanAt = 0;
let latestResearch = null;
let latestFusedSignal = null;
let latestCandidates = null;
let tickInFlight = false;

function dailyPnlPct(price) {
  const equity = getEquity(state, price);
  return ((equity - startingEquity) / startingEquity) * 100;
}

const dashboard = createDashboardServer({
  state,
  config,
  getEquity,
  getDailyPnlPct: price => dailyPnlPct(price)
});

function riskCheck(netEdgePct, price) {
  const equity = getEquity(state, price);
  return risk.evaluate({
    action: "BUY",
    equityUsd: equity,
    netEdgePct,
    dailyPnlPct: dailyPnlPct(price)
  });
}

function showStatus(price, action) {
  const equity = getEquity(state, price);
  log(`${config.asset} | $${price.toFixed(2)} | ${action} | Paper equity: $${equity.toFixed(2)} | PnL: ${dailyPnlPct(price).toFixed(2)}%`);
}

function refreshMultiCoinCandidates(now = Date.now()) {
  latestCandidates = multiCoinCandidates.rank([...marketUniverse.values()], now);
  return latestCandidates;
}

function updateUniverse(ticker) {
  if (!ticker?.productId) return null;
  marketUniverse.set(ticker.productId, ticker);
  return refreshMultiCoinCandidates(Date.now());
}

function riskCheck(netEdgePct, price) {
  const equity = getEquity(state, price);
  return risk.evaluate({
    action: "BUY",
    equityUsd: equity,
    netEdgePct,
    dailyPnlPct: dailyPnlPct(price)
  });
}

function buildStatisticalContext() {
  const action = normalizeAction(signalCapitalFlow()?.action);
  const direction = actionToDirection(action);
  return `${config.asset}|${direction}`;
}

function buildTradeEvidence({ scan, signal, timestamp }) {
  const flow = signalCapitalFlow();
  const flowDirection = actionToDirection(flow?.action);
  const momentumDirection = actionToDirection(signal?.action);

  return {
    timestamp,
    score: null,
    safetyScore: null,
    safetyApproved: false,
    statisticalEdgeConfirmed: latestStatisticalEdge?.eligible === true,
    statisticalOutOfSampleValidated: latestWalkForward?.eligible === true,
    statisticalDirection: latestStatisticalEdge?.direction || "NONE",
    statisticalExpectedValuePct: latestStatisticalEdge?.expectedValuePct ?? null,
    statisticalSampleSize: latestStatisticalEdge?.sampleSize ?? 0,
    statisticalLowerBound95: latestStatisticalEdge?.lowerBound95 ?? null,
    statisticalWalkForwardAccuracy: latestWalkForward?.directionalAccuracy ?? null,
    spreadPct: scan?.spreadPct ?? null,
    netEdgePct: latestStatisticalEdge?.expectedValuePct ?? null,
    flowConfidence: Number.isFinite(flow?.confidence) ? flow.confidence : null,
    flowDirection,
    momentumDirection,
    newsRisk: "NONE",
    hasPosition: Boolean(state.asset && state.asset !== 0),
    opportunity: false,
    signalAction: normalizeAction(signal?.action)
  };
}

function statisticalOptions(contextKey, asOfMs) {
  return {
    contextKey,
    asOfMs,
    horizonMs: config.statisticalHorizonMs,
    costPct: config.statisticalRoundTripCostPct,
    minSamples: config.statisticalMinSamples,
    minDirectionalProbability: config.statisticalMinDirectionalProbability,
    minLowerBound95: config.statisticalMinLowerBound95,
    minExpectedValuePct: config.statisticalMinExpectedValuePct
  };
}

async function updateStatistics(price, timestamp) {
  const resolved = await statisticalJournal.resolve({ timestamp, price });
  if (resolved.resolved) {
    for (const sample of resolved.samples) {
      log(`STAT SAMPLE RESOLVED ${sample.contextKey} | forward ${sample.forwardReturnPct.toFixed(4)}%`);
    }
  }

  const contextKey = buildStatisticalContext();
  await statisticalJournal.observe({ timestamp, price, contextKey });

  const samples = statisticalJournal.getSamples(contextKey);
  latestStatisticalEdge = estimateStatisticalEdge(
    samples,
    statisticalOptions(contextKey, timestamp)
  );

  latestWalkForward = walkForwardValidate(samples, {
    ...statisticalOptions(contextKey, timestamp),
    trainMinSamples: config.statisticalMinSamples,
    testWindow: config.statisticalTestWindow
  });

  return { edge: latestStatisticalEdge, walkForward: latestWalkForward };
}

async function updateTradingAgents(price, marketTicker, scan, signal, now) {
  if (!marketTicker || !Number.isFinite(Number(marketTicker.price))) {
    latestResearch = { ok: false, action: "UNKNOWN", confidence: null, reason: "NO_FRESH_MARKET_TICKER" };
    latestFusedSignal = signalFusion.fuse({
      quant: signal,
      flow: signalCapitalFlow(),
      research: latestResearch
    });
    return latestResearch;
  }

  latestResearch = await tradingAgents.analyze({
    nowMs: now,
    snapshot: {
      symbol: config.asset,
      price: Number(marketTicker.price),
      bid: Number(marketTicker.bid),
      ask: Number(marketTicker.ask),
      spreadPct: scan?.spreadPct ?? marketTicker.spreadPct ?? null,
      volume24h: Number(marketTicker.volume24h),
      change24hPct: Number(marketTicker.change24hPct),
      timestamp: marketTicker.timestamp
    },
    context: {
      quantSignal: signal?.action || "HOLD",
      capitalFlow: signalCapitalFlow()?.action || "HOLD",
      price
    }
  });

  latestFusedSignal = signalFusion.fuse({
    quant: signal,
    flow: signalCapitalFlow(),
    research: latestResearch
  });

  if (latestResearch.ok) {
    log(`TRADINGAGENTS ${latestResearch.action} | confidence ${Math.round(latestResearch.confidence * 100)}%`);
  } else if (latestResearch.reason !== "TRADINGAGENTS_NOT_CONFIGURED") {
    log(`TRADINGAGENTS HOLD/UNKNOWN | ${latestResearch.reason}`);
  }

  return latestResearch;
}

async function tick() {
  if (tickInFlight) {
    log("TICK SKIPPED: previous tick still running");
    return;
  }

  tickInFlight = true;
  try {
    const price = await reliability.run("market-price", () => getPrice(config.asset));
    await refreshDexFlow();

    const now = Date.now();
    refreshMultiCoinCandidates(now);

    const marketTicker = latestTicker?.productId === `${config.asset}-USD`
      ? latestTicker
      : null;
    const scan = latestScan?.productId === `${config.asset}-USD` &&
      now - latestScanAt <= 120000
      ? latestScan
      : {
        signal: "HOLD",
        productId: `${config.asset}-USD`,
        movePct: 0,
        spreadPct: null,
        volume24h: marketTicker?.volume24h ?? null
      };

    const signal = evaluateSignal({
      movePct: scan.movePct,
      spreadPct: scan.spreadPct,
      volume24h: scan.volume24h,
      capitalFlow: signalCapitalFlow()
    });

    await updateStatistics(price, now);
    await updateTradingAgents(price, marketTicker, scan, signal, now);

    const evidence = buildTradeEvidence({
      scan,
      signal,
      timestamp: now
    });

    const decision = decideTrade(evidence);
    let riskResult = null;

    if (decision.action === "BUY") {
      riskResult = riskCheck(evidence.netEdgePct, price);

      if (!riskResult.allowed) {
        log(`RISK BLOCK BUY ${riskResult.reason} | net edge: ${Number.isFinite(riskResult.netEdgePct) ? riskResult.netEdgePct.toFixed(2) : "n/a"}%`);
      } else if (buy(state, price, riskResult.maxTradeUsd)) {
        log(`PAPER BUY ${config.asset} at $${price.toFixed(2)} | size $${riskResult.maxTradeUsd.toFixed(2)}`);
      }
    } else if (decision.action === "SELL") {
      if (sell(state, price)) {
        log(`PAPER SELL ${config.asset} at $${price.toFixed(2)} | ${decision.reasons.join(",")}`);
      }
    } else if (decision.reasons?.length) {
      log(`TRADE GATE HOLD | ${decision.reasons.join(",")}`);
    }

    showStatus(price, decision.action);
    dashboard.update({
      ticker: marketTicker || {
        productId: `${config.asset}-USD`,
        price,
        bid: null,
        ask: null,
        volume24h: null,
        change24hPct: 0,
        timestamp: new Date().toISOString()
      },
      action: decision.action,
      decision,
      evidence,
      risk: riskResult,
      signal,
      fusedSignal: latestFusedSignal,
      research: latestResearch,
      scan,
      dexFlow: latestDexFlow,
      multiCoinCandidates: latestCandidates
    });
  } finally {
    tickInFlight = false;
  }
}

async function start() {
  if (config.mode !== "paper") {
    throw new Error("This version only supports BOT_MODE=paper");
  }

  await statisticalJournal.initialize();

  log("================================");
  log("DEX BOT - REAL-TIME PAPER ENGINE");
  log("REAL MONEY TRADING: DISABLED");
  log(`Asset: ${config.asset}`);
  log(`Starting balance: $${config.startBalance}`);
  log("Market feed: Coinbase WebSocket");
  log("Market scanner: multi-coin fast-move detection");
  log("Multi-coin triage: cheap broad-universe ranking before expensive AI");
  log("Signal engine: spread + liquidity + movement filter");
  log(`DEX flow monitor: ${dexFlow.enabled ? "ENABLED" : "DISABLED"}`);
  if (config.dexNetwork && config.dexPoolAddress && !dexFlow.enabled) {
    log("DEX flow monitor: HOLD until DEX_ASSET matches ASSET");
  }
  log("TradingAgents: research-only integration (execution disabled)");
  log("Trade decision: fail-closed TradeDecisionGate");
  log("BUY requires explicit token safety + empirical statistical edge");
  log("Out-of-sample validation: REQUIRED before BUY");
  log("Statistical journal: empirical forward outcomes only");
  log(`Statistical horizon: ${config.statisticalHorizonMs / 60000} minutes`);
  log(`Statistical storage: ${config.statisticalJournalPath || "memory-only"}`);
  log("Unsafe/unknown trading evidence: REJECTED");
  log("Risk engine: trade-size + daily-loss + net-edge guard");
  log("Pipeline reliability: timeout + bounded retry + circuit breaker");
  log("Signal contract: BUY / SELL / HOLD / UNKNOWN");
  log("Data quality gate: stale/invalid market evidence rejected");
  log("================================");

  if (process.env.RUN_ONCE === "1") {
    await tick();
    log("RUN_ONCE completed successfully");
    return;
  }

  dashboard.start();

  startMarketFeed({
    onTicker: ticker => {
      const quality = dataQuality.validate(ticker);
      if (!quality.ok) {
        dashboard.pushActivity(`Market data rejected: ${quality.reason}`, "risk");
        log(`MARKET DATA REJECTED ${ticker?.productId || "UNKNOWN"} | ${quality.reason}`);
        return;
      }

      latestTicker = ticker;
      const universe = updateUniverse(ticker);
      const feedScan = scanner.update(ticker);
      latestScan = feedScan;
      latestScanAt = Date.now();

      const feedSignal = evaluateSignal({
        movePct: feedScan.movePct,
        spreadPct: feedScan.spreadPct,
        volume24h: feedScan.volume24h,
        capitalFlow: signalCapitalFlow()
      });

      dashboard.update({ ticker, signal: feedSignal, scan: feedScan, dexFlow: latestDexFlow, multiCoinCandidates: universe });

      log(
        `TICKER ${ticker.productId} | $${ticker.price.toFixed(6)} | ` +
        `24h ${ticker.change24hPct.toFixed(2)}% | ` +
        `bid ${ticker.bid.toFixed(6)} | ask ${ticker.ask.toFixed(6)}`
      );

      if (feedScan.signal === "MOMENTUM_UP" || feedScan.signal === "MOMENTUM_DOWN") {
        const spread = feedScan.spreadPct === null
          ? "n/a"
          : `${feedScan.spreadPct.toFixed(3)}%`;

        log(
          `SCAN ${feedScan.signal} ${feedScan.productId} | ` +
          `move ${feedScan.movePct.toFixed(3)}% | spread ${spread}`
        );
      }

      if (feedSignal.action !== "HOLD") {
        log(
          `SIGNAL ${feedSignal.action} ${feedSignal.reason} ${ticker.productId} | ` +
          `move ${feedScan.movePct.toFixed(3)}%`
        );
      }
    },
    onError: error => {
      dashboard.pushActivity(`Market feed error: ${error.message}`, "error");
      logError(error);
    }
  });

  await tick();

  setInterval(async () => {
    try {
      await tick();
    } catch (error) {
      dashboard.pushActivity(`Tick error: ${error.message}`, "error");
      logError(error);
    }
  }, config.pollSeconds * 1000);
}

start().catch(error => {
  logError(error);
  process.exit(1);
});