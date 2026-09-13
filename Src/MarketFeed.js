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

export function startMarketFeed({
  products = DEFAULT_PRODUCTS,
  onTicker,
  onError
} = {}) {
  let closedByUser = false;
  let reconnectTimer = null;

  function connect() {
    const ws = new WebSocket(URL);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "subscribe",
        channel: "ticker",
        product_ids: products
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
            if (!Number.isFinite(price)) continue;

            onTicker?.({
              productId: ticker.product_id,
              price,
              bid: Number(ticker.best_bid),
              ask: Number(ticker.best_ask),
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
