import { config } from "./config.js";
import { getPrice } from "./market.js";
import { decide } from "./strategy.js";
import {
  createPaperTrader,
  buy,
  sell,
  getEquity
} from "./paperTrader.js";
import {
  log,
  logError
} from "./logger.js";

const state =
  createPaperTrader(
    config.startBalance
  );

let previousPrice = null;

function showStatus(price, action) {
  const equity =
    getEquity(state, price);

  log(
    `${config.asset} | ` +
    `$${price.toFixed(2)} | ` +
    `${action} | ` +
    `Paper equity: $${equity.toFixed(2)}`
  );
}

async function tick() {
  try {
    const price =
      await getPrice(
        config.asset
      );

    const action =
      decide({
        price,
        previousPrice,
        entryPrice:
          state.entryPrice,
        buyDropPct:
          config.buyDropPct,
        sellRisePct:
          config.sellRisePct
      });

    if (action === "BUY") {
      const success =
        buy(state, price);

      if (success) {
        log(
          `PAPER BUY ${config.asset} ` +
          `at $${price.toFixed(2)}`
        );
      }
    }

    if (action === "SELL") {
      const success =
        sell(state, price);

      if (success) {
        log(
          `PAPER SELL ${config.asset} ` +
          `at $${price.toFixed(2)}`
        );
      }
    }

    showStatus(
      price,
      action
    );

    previousPrice = price;

  } catch (error) {
    logError(error);
  }
}

async function start() {
  // Tuyệt đối không cho bản này chạy live
  if (config.mode !== "paper") {
    throw new Error(
      "This version only supports BOT_MODE=paper"
    );
  }

  log(
    "================================"
  );

  log(
    "DEX BOT - FREE PAPER MODE"
  );

  log(
    "REAL MONEY TRADING: DISABLED"
  );

  log(
    `Asset: ${config.asset}`
  );

  log(
    `Starting balance: $${config.startBalance}`
  );

  log(
    `Polling: every ${config.pollSeconds}s`
  );

  log(
    "================================"
  );

  await tick();

  setInterval(
    tick,
    config.pollSeconds * 1000
  );
}

start().catch((error) => {
  logError(error);
  process.exit(1);
});
