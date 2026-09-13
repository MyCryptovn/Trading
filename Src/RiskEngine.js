const DEFAULT_MAX_TRADE_PCT = 10;
const DEFAULT_MAX_DAILY_LOSS_PCT = 3;
const DEFAULT_MIN_NET_EDGE_PCT = 0.50;

function finitePct(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function createRiskEngine({
  maxTradePct = DEFAULT_MAX_TRADE_PCT,
  maxDailyLossPct = DEFAULT_MAX_DAILY_LOSS_PCT,
  minNetEdgePct = DEFAULT_MIN_NET_EDGE_PCT
} = {}) {
  const limits = {
    maxTradePct: finitePct(maxTradePct, DEFAULT_MAX_TRADE_PCT),
    maxDailyLossPct: finitePct(maxDailyLossPct, DEFAULT_MAX_DAILY_LOSS_PCT),
    minNetEdgePct: finitePct(minNetEdgePct, DEFAULT_MIN_NET_EDGE_PCT)
  };

  function evaluate({
    action = "HOLD",
    equityUsd,
    expectedMovePct = 0,
    feePct = 0,
    slippagePct = 0,
    dailyPnlPct = 0
  } = {}) {
    if (action !== "BUY" && action !== "SELL") {
      return { allowed: false, action: "HOLD", reason: "NO_TRADE_ACTION" };
    }

    if (!Number.isFinite(equityUsd) || equityUsd <= 0) {
      return { allowed: false, action: "HOLD", reason: "INVALID_EQUITY" };
    }

    if (!Number.isFinite(expectedMovePct) || expectedMovePct <= 0) {
      return { allowed: false, action: "HOLD", reason: "INVALID_EXPECTED_MOVE" };
    }

    const costsPct = finitePct(feePct, 0) + finitePct(slippagePct, 0);
    const netEdgePct = expectedMovePct - costsPct;

    if (netEdgePct < limits.minNetEdgePct) {
      return { allowed: false, action: "HOLD", reason: "NET_EDGE_TOO_SMALL", netEdgePct };
    }

    if (!Number.isFinite(dailyPnlPct)) {
      return { allowed: false, action: "HOLD", reason: "INVALID_DAILY_PNL" };
    }

    if (dailyPnlPct <= -limits.maxDailyLossPct) {
      return { allowed: false, action: "HOLD", reason: "DAILY_LOSS_LIMIT" };
    }

    const maxTradeUsd = equityUsd * (limits.maxTradePct / 100);

    return {
      allowed: true,
      action,
      reason: "RISK_CHECK_PASSED",
      netEdgePct,
      maxTradeUsd,
      maxTradePct: limits.maxTradePct
    };
  }

  return { evaluate, limits };
}

export const DEFAULT_RISK_LIMITS = Object.freeze({
  maxTradePct: DEFAULT_MAX_TRADE_PCT,
  maxDailyLossPct: DEFAULT_MAX_DAILY_LOSS_PCT,
  minNetEdgePct: DEFAULT_MIN_NET_EDGE_PCT
});
