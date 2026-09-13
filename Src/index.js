import { config } from "./config.js";
import { getPrice } from "./maket.js";
import { decide } from "./Strategy.js";
import { startMarketFeed } from "./MarketFeed.js";
import { createMarketScanner } from "./MarketScanner.js";
import {
  createPaperTrader,
  buy,
  sell,
  getEquity
} from "./Papertrader.js";
import { log, logError } from "./logger.js";

const state = createPaperTrader(config.startBalance);
const scanner = createMarketScanner();
let previousPrice = null;

function showStatus(price, action) {
  const equity = getEquity(state, price);
  log(`${config.asset} | $${price.toFixed(2)} | ${action} | Paper equity: $${equity.toFixed(2)}`);
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

  if (action === "BUY" && buy(state, price)) {
    log(`PAPER BUY ${config.asset} at $${price.toFixed(2)}`);
  }

  if (action === "SELL" && sell(state, price)) {
    log(`PAPER SELL ${config.asset} at $${price.toFixed(2)}`);
  }

  showStatus(price, action);
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
  log("================================");

  // CI/smoke-test mode keeps one deterministic REST tick.
  if (process.env.RUN_ONCE === "1") {
    await tick();
    log("RUN_ONCE completed successfully");
    return;
  }

  startMarketFeed({
    onTicker: ticker => {
      const scan = scanner.update(ticker);

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
    },
    onError: error => logError(error)
  });

  // Keep the existing paper strategy alive for the configured asset.
  await tick();

  setInterval(async () => {
    try {
      await tick();
    } catch (error) {
      logError(error);
    }
  }, config.pollSeconds * 1000);
}

start().catch(error => {
  logError(error);
  process.exit(1);
});
