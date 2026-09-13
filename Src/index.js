import { config } from "./config.js";
import { getPrice } from "./maket.js";
import { decide } from "./Strategy.js";
import { startMarketFeed } from "./MarketFeed.js";
import { createMarketScanner } from "./MarketScanner.js";
import { evaluateSignal } from "./SignalEngine.js";
import { createRiskEngine } from "./RiskEngine.js";
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
const startingEquity = config.startBalance;
let previousPrice = null;

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

function riskCheck(action, price) {
  const equity = getEquity(state, price);
  const expectedMovePct = action === "BUY"
    ? config.buyDropPct
    : config.sellRisePct;

  return risk.evaluate({
    action,
    equityUsd: equity,
    expectedMovePct,
    feePct: state.costs.feeRate * 100,
    slippagePct: state.costs.slippageRate * 100,
    dailyPnlPct: dailyPnlPct(price)
  });
}

function showStatus(price, action) {
  const equity = getEquity(state, price);
  log(`${config.asset} | $${price.toFixed(2)} | ${action} | Paper equity: $${equity.toFixed(2)} | PnL: ${dailyPnlPct(price).toFixed(2)}%`);
}

async function tick() {
  const price = await getPrice(config.asset);

  const action = decide({
    price,
    previousPrice,
    entryPrice: state.entryPrice,
    buyDropPct: config.buyDropPct,
    sellRisePct: config.sellRisePct
  });

  let riskResult = null;

  if (action === "BUY" || action === "SELL") {
    riskResult = riskCheck(action, price);

    if (!riskResult.allowed) {
      log(`RISK BLOCK ${action} ${riskResult.reason} | net edge: ${Number.isFinite(riskResult.netEdgePct) ? riskResult.netEdgePct.toFixed(2) : "n/a"}%`);
    } else if (action === "BUY" && buy(state, price, riskResult.maxTradeUsd)) {
      log(`PAPER BUY ${config.asset} at $${price.toFixed(2)} | size $${riskResult.maxTradeUsd.toFixed(2)}`);
    } else if (action === "SELL" && sell(state, price)) {
      log(`PAPER SELL ${config.asset} at $${price.toFixed(2)}`);
    }
  }

  showStatus(price, action);
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
    action,
    risk: riskResult
  });
  previousPrice = price;
}

async function start() {
  if (config.mode !== "paper") {
    throw new Error("This version only supports BOT_MODE=paper");
  }

  log("================================");
  log("DEX BOT - REAL-TIME PAPER ENGINE");
  log("REAL MONEY TRADING: DISABLED");
  log(`Asset: ${config.asset}`);
  log(`Starting balance: $${config.startBalance}`);
  log("Market feed: Coinbase WebSocket");
  log("Market scanner: multi-coin fast-move detection");
  log("Signal engine: spread + liquidity + movement filter");
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
      const scan = scanner.update(ticker);
      const signal = evaluateSignal({
        movePct: scan.movePct,
        spreadPct: scan.spreadPct,
        volume24h: scan.volume24h
      });

      dashboard.update({ ticker, signal, scan });

      log(
        `TICKER ${ticker.productId} | $${ticker.price.toFixed(6)} | ` +
        `24h ${ticker.change24hPct.toFixed(2)}% | ` +
        `bid ${ticker.bid.toFixed(6)} | ask ${ticker.ask.toFixed(6)}`
      );

      if (scan.signal === "MOMENTUM_UP" || scan.signal === "MOMENTUM_DOWN") {
        const spread = scan.spreadPct === null
          ? "n/a"
          : `${scan.spreadPct.toFixed(3)}%`;

        log(
          `SCAN ${scan.signal} ${scan.productId} | ` +
          `move ${scan.movePct.toFixed(3)}% | spread ${spread}`
        );
      }

      if (signal.action !== "HOLD") {
        log(
          `SIGNAL ${signal.action} ${signal.reason} ${ticker.productId} | ` +
          `move ${scan.movePct.toFixed(3)}%`
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
