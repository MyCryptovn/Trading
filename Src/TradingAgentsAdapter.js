import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeAction } from "./SignalContract.js";

const execFileAsync = promisify(execFile);

const DECISION_MAP = new Map([
  ["BUY", "BUY"],
  ["OVERWEIGHT", "BUY"],
  ["HOLD", "HOLD"],
  ["UNDERWEIGHT", "SELL"],
  ["SELL", "SELL"],
  ["REVIEW", "UNKNOWN"]
]);

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizeDecision(value) {
  const key = String(value || "").trim().toUpperCase();
  return DECISION_MAP.get(key) || normalizeAction(key);
}

function normalizeConfidence(value) {
  if (!finite(value)) return null;
  const number = Number(value);
  if (number > 1) return Math.max(0, Math.min(1, number / 100));
  return Math.max(0, Math.min(1, number));
}

function stale(timestamp, nowMs, maxAgeMs, maxFutureMs) {
  const parsed = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return true;
  return parsed > nowMs + maxFutureMs || nowMs - parsed > maxAgeMs;
}

export function createTradingAgentsProcessRunner(options = {}) {
  const python = String(options.python || process.env.TRADINGAGENTS_PYTHON || "python3");
  const script = String(options.script || process.env.TRADINGAGENTS_RUNNER_SCRIPT || "Python/tradingagents_runner.py");
  const timeoutMs = Number(options.timeoutMs ?? process.env.TRADINGAGENTS_TIMEOUT_MS ?? 120000);

  if (!python) throw new TypeError("python must be configured");
  if (!script) throw new TypeError("script must be configured");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive number");
  }

  return async payload => {
    const { stdout } = await execFileAsync(python, [script], {
      input: JSON.stringify(payload),
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: process.env
    });

    const text = String(stdout || "").trim();
    if (!text) throw new Error("TRADINGAGENTS_EMPTY_OUTPUT");

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("TRADINGAGENTS_INVALID_JSON");
    }
  };
}

export function createTradingAgentsAdapter(options = {}) {
  const maxAgeMs = Number(options.maxAgeMs ?? 120000);
  const maxFutureMs = Number(options.maxFutureMs ?? 5000);
  const runner = options.runner ?? (
    process.env.TRADINGAGENTS_ENABLED === "1"
      ? createTradingAgentsProcessRunner()
      : undefined
  );

  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new TypeError("maxAgeMs must be a positive number");
  }
  if (!Number.isFinite(maxFutureMs) || maxFutureMs < 0) {
    throw new TypeError("maxFutureMs must be a non-negative number");
  }
  if (runner !== undefined && typeof runner !== "function") {
    throw new TypeError("runner must be a function when provided");
  }

  async function analyze(input = {}) {
    const nowMs = Number(input.nowMs ?? Date.now());
    const snapshot = input.snapshot || {};

    if (!Number.isFinite(nowMs)) {
      return { ok: false, action: "UNKNOWN", confidence: null, reason: "INVALID_NOW" };
    }
    if (!snapshot.symbol || !finite(snapshot.price)) {
      return { ok: false, action: "UNKNOWN", confidence: null, reason: "INVALID_SNAPSHOT" };
    }
    if (stale(snapshot.timestamp, nowMs, maxAgeMs, maxFutureMs)) {
      return { ok: false, action: "UNKNOWN", confidence: null, reason: "STALE_SNAPSHOT" };
    }
    if (!runner) {
      return { ok: false, action: "UNKNOWN", confidence: null, reason: "TRADINGAGENTS_NOT_CONFIGURED" };
    }

    let raw;
    try {
      raw = await runner({
        symbol: String(snapshot.symbol),
        snapshot: { ...snapshot },
        context: input.context || {},
        asOf: new Date(nowMs).toISOString()
      });
    } catch (error) {
      return {
        ok: false,
        action: "UNKNOWN",
        confidence: null,
        reason: "TRADINGAGENTS_ERROR",
        error: error?.message ? String(error.message) : "UNKNOWN_ERROR"
      };
    }

    const action = normalizeDecision(raw?.action ?? raw?.decision ?? raw?.signal);
    const confidence = normalizeConfidence(raw?.confidence);

    if (!["BUY", "SELL", "HOLD"].includes(action)) {
      return { ok: false, action: "UNKNOWN", confidence, reason: "INVALID_DECISION" };
    }

    // TradingAgents v0.4.0 exposes a five-tier rating, not a calibrated
    // probability. Preserve the validated action for observation, but give
    // it zero fusion weight until empirical confidence calibration exists.
    if (confidence === null) {
      return {
        ok: true,
        action,
        confidence: 0,
        confidenceCalibrated: false,
        reason: "TRADINGAGENTS_UNCALIBRATED_DECISION",
        source: "tradingagents",
        timestamp: new Date(nowMs).toISOString(),
        raw: raw && typeof raw === "object" ? { ...raw } : raw
      };
    }

    return {
      ok: true,
      action,
      confidence,
      confidenceCalibrated: true,
      reason: "TRADINGAGENTS_RESEARCH_COMPLETE",
      source: "tradingagents",
      timestamp: new Date(nowMs).toISOString(),
      raw: raw && typeof raw === "object" ? { ...raw } : raw
    };
  }

  return { analyze };
}
