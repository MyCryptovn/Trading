import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULTS = Object.freeze({
  horizonMs: 15 * 60 * 1000,
  maxSamples: 5000
});

function finite(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function normalizeObservation(input = {}) {
  const timestamp = Number(input.timestamp);
  const price = Number(input.price);
  const contextKey = input.contextKey === undefined || input.contextKey === null
    ? null
    : String(input.contextKey);

  if (!finite(timestamp) || !finite(price) || price <= 0 || !contextKey) return null;

  return {
    timestamp,
    price,
    contextKey,
    horizonMs: finite(input.horizonMs) && Number(input.horizonMs) > 0
      ? Number(input.horizonMs)
      : null
  };
}

function normalizeSample(input = {}) {
  const timestamp = Number(input.timestamp);
  const forwardReturnPct = Number(input.forwardReturnPct);
  if (!finite(timestamp) || !finite(forwardReturnPct) || !input.contextKey) return null;

  return {
    timestamp,
    contextKey: String(input.contextKey),
    forwardReturnPct,
    observedAtMs: finite(input.observedAtMs) ? Number(input.observedAtMs) : null
  };
}

/**
 * Append-only empirical journal for forward market outcomes.
 *
 * A new observation is opened only when a context has no pending observation.
 * This avoids creating overlapping 15-minute samples every polling tick and
 * makes the effective sample count more conservative.
 *
 * No synthetic outcomes are generated. A sample exists only after its future
 * price has actually been observed.
 */
export function createStatisticalJournal(options = {}) {
  const cfg = {
    ...DEFAULTS,
    ...options
  };

  if (!finite(cfg.horizonMs) || Number(cfg.horizonMs) <= 0) {
    throw new TypeError("horizonMs must be a positive number");
  }
  if (!finite(cfg.maxSamples) || Number(cfg.maxSamples) < 1) {
    throw new TypeError("maxSamples must be at least 1");
  }

  const pending = new Map();
  const samples = [];
  const storagePath = options.storagePath ? String(options.storagePath) : null;
  let initialized = false;

  async function persist(event) {
    if (!storagePath) return;
    await mkdir(dirname(storagePath), { recursive: true });
    await appendFile(storagePath, `${JSON.stringify(event)}\n`, "utf8");
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
            if (observation) pending.set(observation.contextKey, observation);
          } else if (event.type === "RESOLVE") {
            const sample = normalizeSample(event);
            if (sample) {
              pending.delete(sample.contextKey);
              samples.push(sample);
            }
          }
        } catch {
          // Ignore one malformed journal line; preserve all valid history.
        }
      }

      if (samples.length > Number(cfg.maxSamples)) {
        samples.splice(0, samples.length - Number(cfg.maxSamples));
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async function observe(input = {}) {
    await initialize();
    const observation = normalizeObservation({ ...input, horizonMs: cfg.horizonMs });
    if (!observation) return { accepted: false, reason: "INVALID_OBSERVATION" };

    const existing = pending.get(observation.contextKey);
    if (existing) {
      return { accepted: false, reason: "CONTEXT_ALREADY_PENDING", observation: existing };
    }

    pending.set(observation.contextKey, observation);
    await persist({ type: "OBSERVE", ...observation });
    return { accepted: true, reason: "OBSERVATION_OPENED", observation };
  }

  async function resolve(input = {}) {
    await initialize();
    const timestamp = Number(input.timestamp);
    const price = Number(input.price);
    if (!finite(timestamp) || !finite(price) || price <= 0) {
      return { resolved: false, reason: "INVALID_RESOLUTION" };
    }

    const resolved = [];
    for (const [contextKey, observation] of pending.entries()) {
      const dueAtMs = observation.timestamp + cfg.horizonMs;
      if (timestamp < dueAtMs) continue;

      const forwardReturnPct = ((price - observation.price) / observation.price) * 100;
      if (!finite(forwardReturnPct)) continue;

      const sample = {
        timestamp: observation.timestamp,
        contextKey,
        forwardReturnPct,
        observedAtMs: timestamp
      };

      pending.delete(contextKey);
      samples.push(sample);
      if (samples.length > Number(cfg.maxSamples)) samples.shift();
      resolved.push(sample);
      await persist({ type: "RESOLVE", ...sample });
    }

    return {
      resolved: resolved.length > 0,
      reason: resolved.length ? "OBSERVATIONS_RESOLVED" : "NO_OBSERVATIONS_DUE",
      samples: resolved
    };
  }

  function getSamples(contextKey = null) {
    const filtered = contextKey === null
      ? samples
      : samples.filter((sample) => sample.contextKey === String(contextKey));
    return filtered.map((sample) => ({ ...sample }));
  }

  function getPending() {
    return [...pending.values()].map((observation) => ({ ...observation }));
  }

  return {
    initialize,
    observe,
    resolve,
    getSamples,
    getPending,
    limits: {
      horizonMs: Number(cfg.horizonMs),
      maxSamples: Number(cfg.maxSamples),
      storagePath
    }
  };
}

export const STATISTICAL_JOURNAL_DEFAULTS = DEFAULTS;
