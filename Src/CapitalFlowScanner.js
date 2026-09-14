const DEFAULTS = Object.freeze({
  minConfidence: 60,
  minImbalancePct: 15,
  minVolumeAccelerationPct: 20,
  minLiquidityGrowthPct: 5,
  maxWashTradeRiskPct: 40
});

function finite(value) {
  return Number.isFinite(value);
}

function pctChange(current, previous) {
  if (!finite(current) || !finite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function imbalancePct(buy, sell) {
  if (!finite(buy) || !finite(sell) || buy < 0 || sell < 0) return null;
  const total = buy + sell;
  if (total <= 0) return null;
  return ((buy - sell) / total) * 100;
}

export function createCapitalFlowScanner(options = {}) {
  const limits = {
    minConfidence: finite(options.minConfidence) ? Math.max(0, Math.min(100, options.minConfidence)) : DEFAULTS.minConfidence,
    minImbalancePct: finite(options.minImbalancePct) ? Math.max(0, options.minImbalancePct) : DEFAULTS.minImbalancePct,
    minVolumeAccelerationPct: finite(options.minVolumeAccelerationPct) ? Math.max(0, options.minVolumeAccelerationPct) : DEFAULTS.minVolumeAccelerationPct,
    minLiquidityGrowthPct: finite(options.minLiquidityGrowthPct) ? Math.max(0, options.minLiquidityGrowthPct) : DEFAULTS.minLiquidityGrowthPct,
    maxWashTradeRiskPct: finite(options.maxWashTradeRiskPct) ? Math.max(0, Math.min(100, options.maxWashTradeRiskPct)) : DEFAULTS.maxWashTradeRiskPct
  };

  function scan(flow = {}) {
    const reasons = [];
    const warnings = [];
    let confidence = 0;

    const imbalance = imbalancePct(flow.buyVolumeUsd, flow.sellVolumeUsd);
    const volumeAccelerationPct = pctChange(flow.volumeUsd, flow.previousVolumeUsd);
    const liquidityGrowthPct = pctChange(flow.liquidityUsd, flow.previousLiquidityUsd);
    const tradeAccelerationPct = pctChange(flow.tradeCount, flow.previousTradeCount);
    const largeOrderImbalancePct = imbalancePct(flow.largeBuyUsd, flow.largeSellUsd);
    const washTradeRiskPct = finite(flow.washTradeRisk) ? Math.max(0, Math.min(100, flow.washTradeRisk)) : null;

    if (imbalance !== null) {
      const absImbalance = Math.abs(imbalance);
      if (absImbalance >= limits.minImbalancePct) confidence += 35;
      else confidence += 15;
    } else {
      warnings.push("BUY_SELL_FLOW_UNKNOWN");
    }

    if (volumeAccelerationPct !== null) {
      if (Math.abs(volumeAccelerationPct) >= limits.minVolumeAccelerationPct) confidence += 20;
      else confidence += 8;
    } else {
      warnings.push("VOLUME_ACCELERATION_UNKNOWN");
    }

    if (liquidityGrowthPct !== null) {
      if (liquidityGrowthPct >= limits.minLiquidityGrowthPct) confidence += 15;
      else if (liquidityGrowthPct >= 0) confidence += 5;
    } else {
      warnings.push("LIQUIDITY_GROWTH_UNKNOWN");
    }

    if (tradeAccelerationPct !== null && tradeAccelerationPct > 0) confidence += 10;
    else if (tradeAccelerationPct === null) warnings.push("TRADE_ACCELERATION_UNKNOWN");

    if (largeOrderImbalancePct !== null) {
      if (Math.abs(largeOrderImbalancePct) >= limits.minImbalancePct) confidence += 20;
      else confidence += 5;
    } else {
      warnings.push("LARGE_ORDER_FLOW_UNKNOWN");
    }

    if (washTradeRiskPct !== null) {
      if (washTradeRiskPct > limits.maxWashTradeRiskPct) {
        confidence -= 35;
        warnings.push("WASH_TRADE_RISK_HIGH");
      } else if (washTradeRiskPct > 0) {
        confidence -= Math.round(washTradeRiskPct * 0.25);
      }
    } else {
      warnings.push("WASH_TRADE_RISK_UNKNOWN");
    }

    confidence = Math.max(0, Math.min(100, confidence));

    let action = "HOLD";
    if (washTradeRiskPct !== null && washTradeRiskPct > limits.maxWashTradeRiskPct) {
      reasons.push("WASH_TRADE_RISK_HIGH");
    } else if (imbalance === null) {
      reasons.push("INSUFFICIENT_FLOW_DATA");
    } else if (confidence < limits.minConfidence) {
      reasons.push("FLOW_CONFIDENCE_TOO_LOW");
    } else if (imbalance >= limits.minImbalancePct) {
      action = "BUY";
      reasons.push("BUY_FLOW_DOMINANT");
    } else if (imbalance <= -limits.minImbalancePct) {
      action = "SELL";
      reasons.push("SELL_FLOW_DOMINANT");
    } else {
      reasons.push("FLOW_BALANCED");
    }

    return {
      action,
      confidence,
      imbalancePct: imbalance,
      volumeAccelerationPct,
      liquidityGrowthPct,
      tradeAccelerationPct,
      largeOrderImbalancePct,
      washTradeRiskPct,
      reasons,
      warnings,
      token: flow.address || flow.symbol || "UNKNOWN"
    };
  }

  return { scan, limits };
}

export const DEFAULT_CAPITAL_FLOW_LIMITS = DEFAULTS;
