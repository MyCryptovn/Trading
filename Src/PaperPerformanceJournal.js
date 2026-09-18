import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULTS = Object.freeze({
  storagePath: "data/paper-performance.jsonl",
  initialBalanceUsd: 1000,
  maxEvents: 20000
});

function finite(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function normalizeSide(value) {
  const side = String(value || "").toUpperCase();
  return ["BUY", "SELL", "HOLD"].includes(side) ? side : null;
}

function normalizeEvent(input = {}) {
  const timestamp = Number(input.timestamp);
  const price = Number(input.price);
  const equityUsd = Number(input.equityUsd);
  const action = normalizeSide(input.action);
  if (!finite(timestamp) || !finite(price) || price <= 0 || !finite(equityUsd) || !action) return null;
  return {
    timestamp,
    price,
    equityUsd,
    action,
    decisionMode: input.decisionMode ? String(input.decisionMode) : null,
    executionAction: normalizeSide(input.executionAction) || "NONE",
    reasons: Array.isArray(input.reasons) ? input.reasons.map(String).slice(0, 20) : [],
    hasPosition: input.hasPosition === true,
    evidence: input.evidence && typeof input.evidence === "object"
      ? {
          score: finite(input.evidence.score) ? Number(input.evidence.score) : null,
          safetyScore: finite(input.evidence.safetyScore) ? Number(input.evidence.safetyScore) : null,
          netEdgePct: finite(input.evidence.netEdgePct) ? Number(input.evidence.netEdgePct) : null,
          flowConfidence: finite(input.evidence.flowConfidence) ? Number(input.evidence.flowConfidence) : null,
          statisticalExpectedValuePct: finite(input.evidence.statisticalExpectedValuePct)
            ? Number(input.evidence.statisticalExpectedValuePct)
            : null,
          statisticalSampleSize: finite(input.evidence.statisticalSampleSize)
            ? Number(input.evidence.statisticalSampleSize)
            : 0
        }
      : null
  };
}

export function createPaperPerformanceJournal(options = {}) {
  const cfg = {
    ...DEFAULTS,
    ...options
  };
  if (!finite(cfg.initialBalanceUsd) || Number(cfg.initialBalanceUsd) <= 0) {
    throw new TypeError("initialBalanceUsd must be > 0");
  }
  if (!finite(cfg.maxEvents) || Number(cfg.maxEvents) < 1) {
    throw new TypeError("maxEvents must be >= 1");
  }

  const storagePath = options.storagePath === null
    ? null
    : String(options.storagePath ?? DEFAULTS.storagePath);

  const events = [];
  let initialized = false;

  async function persist(event) {
    if (!storagePath) return;
    await mkdir(dirname(storagePath), { recursive: true });
    await appendFile(storagePath, JSON.stringify(event) + "\n", "utf8");
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;
    if (!storagePath) return;

    try {
      const text = await readFile(storagePath, "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "TICK") {
            const normalized = normalizeEvent(event);
            if (normalized) events.push(normalized);
          }
        } catch {
          // Preserve valid history even if one line is malformed.
        }
      }
      while (events.length > Number(cfg.maxEvents)) events.shift();
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async function record(input = {}) {
    await initialize();
    const event = normalizeEvent(input);
    if (!event) return { accepted: false, reason: "INVALID_EVENT" };

    events.push(event);
    while (events.length > Number(cfg.maxEvents)) events.shift();
    await persist({ type: "TICK", ...event });
    return { accepted: true, reason: "RECORDED" };
  }

  function summary() {
    if (!events.length) {
      return {
        ticks: 0,
        buys: 0,
        sells: 0,
        executedBuys: 0,
        executedSells: 0,
        holds: 0,
        firstTimestamp: null,
        lastTimestamp: null,
        latestEquityUsd: Number(cfg.initialBalanceUsd),
        totalReturnPct: 0,
        maxDrawdownPct: 0,
        profitable: null
      };
    }

    let peak = Number(events[0].equityUsd);
    let maxDrawdownPct = 0;
    for (const event of events) {
      if (event.equityUsd > peak) peak = event.equityUsd;
      const drawdown = peak > 0 ? ((event.equityUsd - peak) / peak) * 100 : 0;
      if (drawdown < maxDrawdownPct) maxDrawdownPct = drawdown;
    }

    const latestEquityUsd = Number(events[events.length - 1].equityUsd);
    const totalReturnPct = ((latestEquityUsd - Number(cfg.initialBalanceUsd)) / Number(cfg.initialBalanceUsd)) * 100;
    const buys = events.filter(event => event.action === "BUY").length;
    const sells = events.filter(event => event.action === "SELL").length;
    const executedBuys = events.filter(event => event.executionAction === "BUY").length;
    const executedSells = events.filter(event => event.executionAction === "SELL").length;

    return {
      ticks: events.length,
      buys,
      sells,
      executedBuys,
      executedSells,
      holds: events.length - buys - sells,
      firstTimestamp: events[0].timestamp,
      lastTimestamp: events[events.length - 1].timestamp,
      latestEquityUsd,
      totalReturnPct,
      maxDrawdownPct,
      profitable: totalReturnPct > 0
    };
  }

  function getEvents(limit = 100) {
    const count = Math.max(0, Math.floor(Number(limit)));
    return events.slice(Math.max(0, events.length - count)).map(event => ({ ...event }));
  }

  return {
    initialize,
    record,
    summary,
    getEvents,
    limits: {
      storagePath,
      initialBalanceUsd: Number(cfg.initialBalanceUsd),
      maxEvents: Number(cfg.maxEvents)
    }
  };
}

export const PAPER_PERFORMANCE_DEFAULTS = DEFAULTS;
