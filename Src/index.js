import { config } from "./config.js";
import { getPrice } from "./maket.js";
import { startMarketFeed } from "./MarketFeed.js";
import { createMarketScanner } from "./MarketScanner.js";
import { evaluateSignal } from "./SignalEngine.js";
import { createRiskEngine } from "./RiskEngine.js";
import { createDexFlowMonitor } from "./DexFlowMonitor.js";
import { decideTrade } from "./TradeDecisionGate.js";
import { createStatisticalJournal } from "./StatisticalJournal.js";
import { estimateStatisticalEdge } from "./StatisticalEdgeEngine.js";
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
const risk = createRiskEngine();
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
let previousPrice = null;
let latestDexFlow = null;
let latestStatisticalEdge = null;

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

async function refreshDexFlow() {
  if (!dexFlow.enabled) {
    latestDexFlow = null;
    return null;
  }

  const result = await dexFlow.evaluate();
  latestDexFlow = result;

  if (!result.ok) {
    dashboard.pushActivity(`DEX flow HOLD: ${result.reason}`, "risk");
    log(`DEX FLOW HOLD ${result.reason}`);
    return result;
  }

  log(`DEX FLOW ${result.action} | confidence ${result.confidence}% | ${result.reason}`);
  return result;
}

function signalCapitalFlow() {
  if (!dexFlow.enabled) return null;
  if (!latestDexFlow?.ok || !latestDexFlow.flow) {
    return { action: "HOLD", confidence: 0 };
  }
  return latestDexFlow.flow;
}

function buildStatisticalContext() {
  const direction = signalCapitalFlow()?.action === "BUY"
    ? "UP"
    : signalCapitalFlow()?.action === "SELL"
      ? "DOWN"
      : "UNKNOWN";
  return `${config.asset}|FLOW_${direction}`;
}

function buildTradeEvidence({ scan, signal, timestamp }) {
  const momentumDirection =
    previousPrice === null
      ? "UNKNOWN"
      : signal?.action === "BUY"
        ? "UP"
        : signal?.action === "SELL"
          ? "DOWN"
          : "UNKNOWN";

  const flow = signalCapitalFlow();

  return {
    timestamp,
    score: null,
    safetyScore: null,
    safetyApproved: false,
    statisticalEdgeConfirmed: latestStatisticalEdge?.eligible === true,
    statisticalDirection: latestStatisticalEdge?.direction || "NONE",
    statisticalExpectedValuePct: latestStatisticalEdge?.expectedValuePct ?? null,
    statisticalSampleSize: latestStatisticalEdge?.sampleSize ?? 0,
    statisticalLowerBound95: latestStatisticalEdge?.lowerBound95 ?? null,
    spreadPct: scan?.spreadPct ?? null,
    netEdgePct: latestStatisticalEdge?.expectedValuePct ?? null,
    flowConfidence: Number.isFinite(flow?.confidence) ? flow.confidence : null,
    flowDirection: flow?.action === "BUY"
      ? "UP"
      : flow?.action === "SELL"
        ? "DOWN"
        : "UNKNOWN",
    momentumDirection,
    newsRisk: "NONE",
    hasPosition: Boolean(state.asset && state.asset !== 0),
    opportunity: false,
    signalAction: signal?.action || "HOLD"
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

  latestStatisticalEdge = estimateStatisticalEdge(
    statisticalJournal.getSamples(contextKey),
    {
      contextKey,
      asOfMs: timestamp,
      horizonMs: config.statisticalHorizonMs,
      costPct: config.statisticalRoundTripCostPct,
      minSamples: config.statisticalMinSamples,
      minDirectionalProbability: config.statisticalMinDirectionalProbability,
      minLowerBound95: config.statisticalMinLowerBound95,
      minExpectedValuePct: config.statisticalMinExpectedValuePct
    }
  );

  return latestStatisticalEdge;
}

async function tick() {
  const price = await getPrice(config.asset);
  await refreshDexFlow();

  const now = Date.now();
  const scan = previousPrice === null
    ? {
        signal: "WARMUP",
        productId: `${config.asset}-USD`,
        movePct: 0,
        spreadPct: null,
        volume24h: null
      }
    : {
        signal: price > previousPrice ? "MOMENTUM_UP" : price < previousPrice ? "MOMENTUM_DOWN" : "HOLD",
        productId: `${config.asset}-USD`,
        movePct: ((price - previousPrice) / previousPrice) * 100,
        spreadPct: null,
        volume24h: null
      };

  const signal = evaluateSignal({
    movePct: scan.movePct,
    spreadPct: scan.spreadPct,
    volume24h: scan.volume24h,
    capitalFlow: signalCapitalFlow()
  });

  await updateStatistics(price, now);

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
    ticker: {
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
    scan,
    dexFlow: latestDexFlow
  });
  previousPrice = price;
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
  log("Signal engine: spread + liquidity + movement filter");
  log(`DEX flow monitor: ${dexFlow.enabled ? "ENABLED" : "DISABLED"}`);
  if (config.dexNetwork && config.dexPoolAddress && !dexFlow.enabled) {
    log("DEX flow monitor: HOLD until DEX_ASSET matches ASSET");
  }
  log("Trade decision: fail-closed TradeDecisionGate");
  log("BUY requires explicit token safety + empirical statistical edge");
  log("Statistical journal: empirical forward outcomes only");
  log(`Statistical horizon: ${config.statisticalHorizonMs / 60000} minutes`);
  log(`Statistical storage: ${config.statisticalJournalPath || "memory-only"}`);
  log("Unsafe/unknown trading evidence: REJECTED");
  log("Risk engine: trade-size + daily-loss + net-edge guard");
  log("Dashboard: live paper equity + trades + activity");
  log("================================");

  if (process.env.RUN_ONCE === "1") {
    await tick();
    log("RUN_ONCE completed successfully");
    return;
  }

  dashboard.start();

  startMarketFeed({
    onTicker: ticker => {
      const feedScan = scanner.update(ticker);
      const feedSignal = evaluateSignal({
        movePct: feedScan.movePct,
        spreadPct: feedScan.spreadPct,
        volume24h: feedScan.volume24h,
        capitalFlow: signalCapitalFlow()
      });

      dashboard.update({ ticker, signal: feedSignal, scan: feedScan, dexFlow: latestDexFlow });

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
