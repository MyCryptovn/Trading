const ACTIONS = ["BUY", "SELL", "HOLD", "UNKNOWN"];

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizeAction(value) {
  const action = String(value || "").trim().toUpperCase();
  return ACTIONS.includes(action) ? action : "UNKNOWN";
}

function clamp01(value) {
  if (!finite(value)) return null;
  return Math.max(0, Math.min(1, Number(value)));
}

export function createAgentPerformance(options = {}) {
  const maxRecords = Math.max(1, Number(options.maxRecords) || 5000);
  const records = [];

  function record(input = {}) {
    const agent = String(input.agent || "unknown").trim() || "unknown";
    const action = normalizeAction(input.action);
    const timestamp = input.timestamp || new Date().toISOString();
    const timestampMs = Date.parse(timestamp);

    if (!Number.isFinite(timestampMs)) {
      return { ok: false, reason: "INVALID_TIMESTAMP" };
    }

    const item = {
      id: String(input.id || `${timestampMs}-${records.length + 1}`),
      agent,
      symbol: input.symbol ? String(input.symbol) : null,
      action,
      confidence: clamp01(input.confidence),
      correct: typeof input.correct === "boolean" ? input.correct : null,
      pnlUsd: finite(input.pnlUsd) ? Number(input.pnlUsd) : null,
      timestamp: new Date(timestampMs).toISOString()
    };

    records.push(item);
    if (records.length > maxRecords) records.splice(0, records.length - maxRecords);
    return { ok: true, record: { ...item } };
  }

  function summarize(agent = null) {
    const filtered = agent
      ? records.filter((item) => item.agent === String(agent))
      : records;

    const resolved = filtered.filter((item) => typeof item.correct === "boolean");
    const correct = resolved.filter((item) => item.correct).length;
    const pnlValues = filtered.filter((item) => finite(item.pnlUsd)).map((item) => item.pnlUsd);
    const avgConfidenceValues = filtered
      .filter((item) => finite(item.confidence))
      .map((item) => item.confidence);

    return {
      agent: agent ? String(agent) : "ALL",
      records: filtered.length,
      resolved: resolved.length,
      accuracy: resolved.length ? correct / resolved.length : null,
      totalPnlUsd: pnlValues.length ? pnlValues.reduce((sum, value) => sum + value, 0) : null,
      averageConfidence: avgConfidenceValues.length
        ? avgConfidenceValues.reduce((sum, value) => sum + value, 0) / avgConfidenceValues.length
        : null
    };
  }

  function allAgents() {
    return [...new Set(records.map((item) => item.agent))].map((agent) => summarize(agent));
  }

  function list(limit = 100) {
    const safeLimit = Math.max(1, Math.min(maxRecords, Number(limit) || 100));
    return records.slice(-safeLimit).reverse().map((item) => ({ ...item }));
  }

  return { record, summarize, allAgents, list };
}
