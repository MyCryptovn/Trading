import { config } from "./config.js";
import { getPrice } from "./maket.js";
import { decide } from "./Strategy.js";
import {
  createPaperTrader,
  buy,
  sell,
  getEquity
} from "./Papertrader.js";
import { log, logError } from "./logger.js";

const state = createPaperTrader(config.startBalance);
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
  log("DEX BOT - FREE PAPER MODE");
  log("REAL MONEY TRADING: DISABLED");
  log(`Asset: ${config.asset}`);
  log(`Starting balance: $${config.startBalance}`);
  log(`Polling: every ${config.pollSeconds}s`);
  log("================================");

  await tick();

  // CI/smoke-test mode: run exactly one successful tick and exit.
  if (process.env.RUN_ONCE === "1") {
    log("RUN_ONCE completed successfully");
    return;
  }

  setInterval(async () => {
    try {
      await tick();
    } catch (error) {
      logError(error);
    }
  }, config.pollSeconds * 1000);
}

start().catch((error) => {
  logError(error);
  process.exit(1);
});
