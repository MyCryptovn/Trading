export function decide({
  price,
  previousPrice,
  entryPrice,
  buyDropPct,
  sellRisePct
}) {
  // Chưa có dữ liệu trước đó
  if (!previousPrice) {
    return "HOLD";
  }

  const changePct =
    ((price - previousPrice) /
      previousPrice) *
    100;

  // Chưa mua và giá giảm đủ mức
  if (
    !entryPrice &&
    changePct <= -buyDropPct
  ) {
    return "BUY";
  }

  // Đã mua và giá tăng đủ mức
  if (
    entryPrice &&
    price >=
      entryPrice *
      (1 + sellRisePct / 100)
  ) {
    return "SELL";
  }

  return "HOLD";
}
