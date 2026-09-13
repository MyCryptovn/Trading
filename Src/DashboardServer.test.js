import assert from "node:assert/strict";
import http from "node:http";
import { createPaperTrader, getEquity } from "./Papertrader.js";
import { createDashboardServer } from "./DashboardServer.js";

const state = createPaperTrader(1000);
const config = {
  mode: "paper",
  asset: "BTC",
  startBalance: 1000
};

const dashboard = createDashboardServer({
  state,
  config,
  getEquity,
  getDailyPnlPct: price => {
    const equity = getEquity(state, price);
    return ((equity - config.startBalance) / config.startBalance) * 100;
  }
});

const server = dashboard.start({ port: 0, host: "127.0.0.1" });

function request(path) {
  return new Promise((resolve, reject) => {
    server.once("listening", () => {
      const { port } = server.address();
      http.get(`http://127.0.0.1:${port}${path}`, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("end", () => resolve({ statusCode: response.statusCode, body }));
      }).on("error", reject);
    });
  });
}

try {
  const health = await request("/health");
  assert.equal(health.statusCode, 200);
  const healthData = JSON.parse(health.body);
  assert.equal(healthData.ok, true);
  assert.equal(healthData.mode, "paper");
  assert.equal(healthData.realMoneyTrading, false);

  const status = await request("/api/status");
  assert.equal(status.statusCode, 200);
  const statusData = JSON.parse(status.body);
  assert.equal(statusData.mode, "paper");
  assert.equal(statusData.realMoneyTrading, false);
  assert.equal(statusData.startingBalance, 1000);
  assert.equal(statusData.equity, 1000);
  assert.ok(Array.isArray(statusData.markets));
  assert.ok(Array.isArray(statusData.trades));
  assert.ok(Array.isArray(statusData.history));
  assert.ok(Array.isArray(statusData.activity));

  console.log("Dashboard smoke test passed");
} finally {
  dashboard.stop();
}
