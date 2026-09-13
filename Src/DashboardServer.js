import http from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)), "public");

export function createDashboardServer({ state, config, getEquity, getDailyPnlPct }) {
  const history = [];
  const market = new Map();
  const activity = [];
  let server;

  function pushActivity(message, type = "info") {
    activity.unshift({ time: new Date().toISOString(), type, message });
    if (activity.length > 100) activity.length = 100;
  }

  function update({ ticker = null, action = "HOLD", signal = null, scan = null, risk = null } = {}) {
    if (ticker) market.set(ticker.productId, ticker);

    const assetProduct = `${config.asset}-USD`;
    const price = ticker?.productId === assetProduct ? ticker.price : null;
    if (Number.isFinite(price)) {
      const equity = getEquity(state, price);
      history.push({ time: new Date().toISOString(), equity });
      if (history.length > 180) history.shift();
    }

    if (action !== "HOLD") pushActivity(`Strategy: ${action}`, action === "BUY" ? "buy" : "sell");
    if (signal && signal.action !== "HOLD") pushActivity(`Signal: ${signal.action} — ${signal.reason}`, "signal");
    if (risk && !risk.allowed) pushActivity(`Risk blocked: ${risk.reason}`, "risk");
  }

  function snapshot() {
    const latest = [...market.values()].sort((a, b) => a.productId.localeCompare(b.productId));
    const price = latest.find(t => t.productId === `${config.asset}-USD`)?.price ?? null;
    const equity = Number.isFinite(price) ? getEquity(state, price) : state.usd;

    return {
      mode: config.mode,
      realMoneyTrading: false,
      asset: config.asset,
      startingBalance: config.startBalance,
      equity,
      pnlUsd: equity - config.startBalance,
      pnlPct: getDailyPnlPct(price),
      cashUsd: state.usd,
      assetAmount: state.asset,
      entryPrice: state.entryPrice,
      trades: state.trades.slice(-50).reverse(),
      markets: latest,
      history,
      activity: activity.slice(0, 50),
      serverTime: new Date().toISOString()
    };
  }

  async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/status") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(snapshot()));
      return;
    }

    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, mode: config.mode, realMoneyTrading: false, time: new Date().toISOString() }));
      return;
    }

    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    if (path.includes("..")) {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    try {
      const body = await readFile(join(ROOT, path.slice(1)));
      const contentType = path.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
      res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  }

  function start({ port = Number(process.env.PORT) || 3000, host = "0.0.0.0" } = {}) {
    server = http.createServer(handler);
    server.listen(port, host, () => pushActivity(`Dashboard listening on ${host}:${port}`, "system"));
    return server;
  }

  function stop() {
    server?.close();
  }

  return { start, stop, update, snapshot, pushActivity };
}
