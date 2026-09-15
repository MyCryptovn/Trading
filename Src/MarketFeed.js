import WebSocket from "ws";

const URL = "wss://advanced-trade-ws.coinbase.com";

const DEFAULT_PRODUCTS = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "BNB-USD",
  "XRP-USD",
  "ADA-USD",
  "DOGE-USD",
  "AVAX-USD",
  "LINK-USD",
  "SUI-USD"
];

function resolveProducts(products) {
  if (Array.isArray(products) && products.length) return products;

  const configured = String(process.env.MARKET_PRODUCTS || "")
    .split(",")
    .map(value => value.trim().toUpperCase())
    .filter(Boolean);

  return configured.length ? [...new Set(configured)] : DEFAULT_PRODUCTS;
}

export function startMarketFeed({
  products,
  onTicker,
  onError
} = {}) {
  const subscribedProducts = resolveProducts(products);
  let closedByUser = false;
  let reconnectTimer = null;

  function connect() {
    const ws = new WebSocket(URL);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "subscribe",
        channel: "ticker",
        product_ids: subscribedProducts
      }));

      ws.send(JSON.stringify({
        type: "subscribe",
        channel: "heartbeats"
      }));
    });

    ws.on("message", raw => {
      try {
        const message = JSON.parse(raw.toString());

        if (message.channel !== "ticker") {
          return;
        }

        for (const event of message.events || []) {
          for (const ticker of event.tickers || []) {
            const price = Number(ticker.price);
            const bid = Number(ticker.best_bid);
            const ask = Number(ticker.best_ask);

            if (!Number.isFinite(price) || price <= 0) continue;

            const hasValidQuote =
              Number.isFinite(bid) &&
              Number.isFinite(ask) &&
              bid > 0 &&
              ask >= bid;

            const spreadPct = hasValidQuote
              ? ((ask - bid) / price) * 100
              : null;

            onTicker?.({
              productId: ticker.product_id,
              price,
              bid,
              ask,
              spreadPct,
              volume24h: Number(ticker.volume_24_h),
              change24hPct: Number(ticker.price_percent_chg_24_h),
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        onError?.(error);
      }
    });

    ws.on("error", error => {
      onError?.(error);
    });

    ws.on("close", () => {
      if (closedByUser) return;

      reconnectTimer = setTimeout(connect, 2000);
    });

    return ws;
  }

  const socket = connect();

  return () => {
    closedByUser = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket.close();
  };
}

export { DEFAULT_PRODUCTS };