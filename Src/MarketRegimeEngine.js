const REGIMES = Object.freeze([
  "TREND_UP",
  "TREND_DOWN",
  "SIDEWAYS",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "LIQUIDITY_STRESS",
  "PANIC",
  "UNKNOWN"
]);

function finite(value) {
  return Number.isFinite(Number(value));
}

export function createMarketRegimeEngine(options = {}) {
  const trendPct = finite(options.trendPct) ? Math.max(0, Number(options.trendPct)) : 0.5;
  const highVolatilityPct = finite(options.highVolatilityPct) ? Math.max(trendPct, Number(options.highVolatilityPct)) : 2.0;
  const panicMovePct = finite(options.panicMovePct) ? Math.max(highVolatilityPct, Number(options.panicMovePct)) : 5.0;
  const maxSpreadPct = finite(options.maxSpreadPct) ? Math.max(0, Number(options.maxSpreadPct)) : 0.4;
  const minLiquidityUsd = finite(options.minLiquidityUsd) ? Math.max(0, Number(options.minLiquidityUsd)) : 25000;

  function classify(input = {}) {
    const movePct = Number(input.movePct);
    const spreadPct = Number(input.spreadPct);
    const liquidityUsd = Number(input.liquidityUsd);
    const volume24h = Number(input.volume24h);

    if (!finite(movePct)) return { regime: "UNKNOWN", confidence: 0, reasons: ["MOVE_UNKNOWN"] };

    const absMove = Math.abs(movePct);
    const reasons = [];

    if (finite(spreadPct) && spreadPct > maxSpreadPct) {
      reasons.push("SPREAD_STRESS");
      if (finite(liquidityUsd) && liquidityUsd < minLiquidityUsd) {
        return { regime: "LIQUIDITY_STRESS", confidence: 95, reasons: [...reasons, "LIQUIDITY_LOW"] };
      }
    }

    if (absMove >= panicMovePct) {
      return { regime: "PANIC", confidence: Math.min(100, 80 + absMove), reasons: [...reasons, "EXTREME_MOVE"] };
    }

    if (absMove >= highVolatilityPct) {
      return { regime: "HIGH_VOLATILITY", confidence: Math.min(100, 70 + absMove * 5), reasons: [...reasons, "VOLATILITY_ELEVATED"] };
    }

    if (absMove <= trendPct) {
      return { regime: "SIDEWAYS", confidence: 65, reasons: [...reasons, "DIRECTIONAL_MOVE_WEAK"] };
    }

    if (movePct > 0) {
      return { regime: "TREND_UP", confidence: Math.min(100, 65 + absMove * 10), reasons: [...reasons, "POSITIVE_MOMENTUM"] };
    }

    if (movePct < 0) {
      return { regime: "TREND_DOWN", confidence: Math.min(100, 65 + absMove * 10), reasons: [...reasons, "NEGATIVE_MOMENTUM"] };
    }

    if (finite(volume24h) && volume24h <= 0) {
      return { regime: "LIQUIDITY_STRESS", confidence: 80, reasons: [...reasons, "NO_VOLUME"] };
    }

    return { regime: "UNKNOWN", confidence: 0, reasons: [...reasons, "UNCLASSIFIED"] };
  }

  return { classify, regimes: REGIMES };
}

export { REGIMES };
