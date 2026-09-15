function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizeAction(value) {
  const action = String(value || "").trim().toUpperCase();
  return ["BUY", "SELL", "HOLD", "UNKNOWN"].includes(action) ? action : "UNKNOWN";
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function createDecisionMemory(options = {}) {
  const maxEntries = Math.max(1, Number(options.maxEntries) || 1000);
  const entries = [];

  function record(input = {}) {
    const timestamp = input.timestamp || new Date().toISOString();
    const timestampMs = Date.parse(timestamp);

    if (!Number.isFinite(timestampMs)) {
      return { ok: false, reason: "INVALID_TIMESTAMP" };
    }

    const entry = {
      id: String(input.id || `${timestampMs}-${entries.length + 1}`),
      timestamp: new Date(timestampMs).toISOString(),
      symbol: input.symbol ? String(input.symbol) : null,
      action: normalizeAction(input.action),
      confidence: finite(input.confidence)
        ? Math.max(0, Math.min(1, Number(input.confidence)))
        : null,
      regime: input.regime ? String(input.regime) : "UNKNOWN",
      evidence: clone(input.evidence || {}),
      risk: clone(input.risk || {}),
      execution: clone(input.execution || null),
      outcome: clone(input.outcome || null),
      source: input.source ? String(input.source) : "unknown"
    };

    entries.push(entry);
    if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);

    return { ok: true, entry: clone(entry) };
  }

  function list(limit = 50) {
    const safeLimit = Math.max(1, Math.min(maxEntries, Number(limit) || 50));
    return clone(entries.slice(-safeLimit).reverse());
  }

  function get(id) {
    const entry = entries.find((item) => item.id === String(id));
    return entry ? clone(entry) : null;
  }

  function attachOutcome(id, outcome = {}) {
    const entry = entries.find((item) => item.id === String(id));
    if (!entry) return { ok: false, reason: "DECISION_NOT_FOUND" };
    entry.outcome = clone(outcome);
    return { ok: true, entry: clone(entry) };
  }

  function stats() {
    const counts = { BUY: 0, SELL: 0, HOLD: 0, UNKNOWN: 0 };
    for (const entry of entries) counts[entry.action] += 1;
    return { size: entries.length, counts };
  }

  return { record, list, get, attachOutcome, stats };
}
