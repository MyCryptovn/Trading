import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULTS = Object.freeze({
  horizonMs: 15 * 60 * 1000,
  maxSamples: 5000,
  roundTripCostPct: 0.80,
  storagePath: "data/ai-performance-journal.jsonl"
});

function finite(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function normalizeAction(value) {
  const action = String(value || "").toUpperCase();
  return ["BUY", "SELL", "HOLD"].includes(action) ? action : null;
}

function normalizeObservation(input = {}) {
  const timestamp = Number(input.timestamp);
  const price = Number(input.price);
  const productId = input.productId ? String(input.productId) : "";
  const action = normalizeAction(input.action);
  if (!finite(timestamp) || !finite(price) || price <= 0 || !productId || !action) return null;
  return {
    timestamp,
    productId,
    action,
    price,
    horizonMs: finite(input.horizonMs) && Number(input.horizonMs) > 0 ? Number(input.horizonMs) : null
  };
}

function normalizeSample(input = {}) {
  const timestamp = Number(input.timestamp);
  const observedAtMs = Number(input.observedAtMs);
  const entryPrice = Number(input.entryPrice);
  const exitPrice = Number(input.exitPrice);
  const forwardReturnPct = Number(input.forwardReturnPct);
  const directionalReturnPct = Number(input.directionalReturnPct);
  if (!finite(timestamp) || !finite(observedAtMs) || !finite(entryPrice) ||
      !finite(exitPrice) || !finite(forwardReturnPct) || !finite(directionalReturnPct) ||
      !input.productId || !input.action) return null;
  return {
    timestamp,
    observedAtMs,
    productId: String(input.productId),
    action: String(input.action),
    entryPrice,
    exitPrice,
    forwardReturnPct,
    directionalReturnPct,
    correct: directionalReturnPct > 0,
    netReturnPct: directionalReturnPct - (finite(input.roundTripCostPct) ? Number(input.roundTripCostPct) : 0)
  };
}

export function createAIPerformanceJournal(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  if (!finite(cfg.horizonMs) || Number(cfg.horizonMs) <= 0) throw new TypeError("horizonMs must be > 0");
  if (!finite(cfg.maxSamples) || Number(cfg.maxSamples) < 1) throw new TypeError("maxSamples must be >= 1");
  if (!finite(cfg.roundTripCostPct) || Number(cfg.roundTripCostPct) < 0) throw new TypeError("roundTripCostPct must be >= 0");

  const storagePath = options.storagePath === null ? null : String(options.storagePath ?? DEFAULTS.storagePath);
  const pending = new Map();
  const samples = [];
  let initialized = false;

  function key(observation) {
    return observation.productId + "|" + observation.action;
  }

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
          if (event.type === "OBSERVE") {
            const observation = normalizeObservation(event);
            if (observation) pending.set(key(observation), observation);
          } else if (event.type === "RESOLVE") {
            const sample = normalizeSample(event);
            if (sample) {
              pending.delete(sample.productId + "|" + sample.action);
              samples.push(sample);
            }
          }
        } catch {
          // Ignore malformed history; preserve valid events.
        }
      }
      while (samples.length > Number(cfg.maxSamples)) samples.shift();
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async function observe(input = {}) {
    await initialize();
    const observation = normalizeObservation({ ...input, horizonMs: cfg.horizonMs });
    if (!observation) return { accepted: false, reason: "INVALID_OBSERVATION" };
    const observationKey = key(observation);
    if (pending.has(observationKey)) return { accepted: false, reason: "CONTEXT_ALREADY_PENDING" };
    pending.set(observationKey, observation);
    await persist({ type: "OBSERVE", ...observation });
    return { accepted: true, reason: "OBSERVATION_OPENED", observation };
  }

  async function resolveTick(ticker = {}) {
    await initialize();
    const timestamp = Number(ticker.timestamp);
    const price = Number(ticker.price);
    const productId = ticker.productId ? String(ticker.productId) : "";
    if (!finite(timestamp) || !finite(price) || price <= 0 || !productId) {
      return { resolved: false, reason: "INVALID_TICK" };
    }

    const resolved = [];
    for (const [observationKey, observation] of pending.entries()) {
      if (observation.productId !== productId) continue;
      const dueAtMs = observation.timestamp + Number(cfg.horizonMs);
      if (timestamp < dueAtMs) continue;

      const forwardReturnPct = ((price - observation.price) / observation.price) * 100;
      const directionalReturnPct = observation.action === "SELL" ? -forwardReturnPct : forwardReturnPct;
      if (!finite(forwardReturnPct) || !finite(directionalReturnPct)) continue;

      const sample = normalizeSample({
        timestamp: observation.timestamp,
        observedAtMs: timestamp,
        productId,
        action: observation.action,
        entryPrice: observation.price,
        exitPrice: price,
        forwardReturnPct,
        directionalReturnPct,
        roundTripCostPct: Number(cfg.roundTripCostPct)
      });
      if (!sample) continue;

      pending.delete(observationKey);
      samples.push(sample);
      while (samples.length > Number(cfg.maxSamples)) samples.shift();
      resolved.push(sample);
      await persist({ type: "RESOLVE", ...sample });
    }

    return {
      resolved: resolved.length > 0,
      reason: resolved.length ? "AI_OBSERVATIONS_RESOLVED" : "NO_AI_OBSERVATIONS_DUE",
      samples: resolved
    };
  }

  function getSamples(filters = {}) {
    return samples
      .filter(sample => !filters.productId || sample.productId === String(filters.productId))
      .filter(sample => !filters.action || sample.action === String(filters.action).toUpperCase())
      .map(sample => ({ ...sample }));
  }

  function getPending() {
    return [...pending.values()].map(observation => ({ ...observation }));
  }

  function summary(filters = {}) {
    const data = getSamples(filters);
    const directional = data.filter(sample => sample.action !== "HOLD");
    const wins = directional.filter(sample => sample.correct).length;
    const netReturns = directional.map(sample => sample.netReturnPct);
    const expectancyPct = netReturns.length
      ? netReturns.reduce((sum, value) => sum + value, 0) / netReturns.length
      : null;
    return {
      samples: data.length,
      directionalSamples: directional.length,
      wins,
      precision: directional.length ? wins / directional.length : null,
      expectancyPct,
      positiveNetReturnRate: directional.length
        ? directional.filter(sample => sample.netReturnPct > 0).length / directional.length
        : null,
      pending: getPending().length
    };
  }

  return {
    initialize,
    observe,
    resolveTick,
    getSamples,
    getPending,
    summary,
    limits: { horizonMs: Number(cfg.horizonMs), maxSamples: Number(cfg.maxSamples), roundTripCostPct: Number(cfg.roundTripCostPct), storagePath }
  };
}

export const AI_PERFORMANCE_JOURNAL_DEFAULTS = DEFAULTS;
