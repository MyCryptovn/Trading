export async function getPrice(symbol = "BTC") {
  const url =
    `https://api.coinbase.com/v2/prices/` +
    `${encodeURIComponent(symbol)}-USD/spot`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Market API HTTP ${response.status}`
    );
  }

  const data = await response.json();

  const price = Number(
    data?.data?.amount
  );

  if (!Number.isFinite(price)) {
    throw new Error(
      "Market API returned an invalid price"
    );
  }

  return price;
}
