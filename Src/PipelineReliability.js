function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function errorCode(error) {
  if (!error) return "UNKNOWN_ERROR";
  return error.code || error.name || "ERROR";
}

export function createPipelineReliability({
  timeoutMs = 15_000,
  retries = 2,
  retryDelayMs = 750,
  circuitFailureThreshold = 3,
  circuitCooldownMs = 30_000,
  onEvent = () => {}
} = {}) {
  const circuits = new Map();

  function emit(event) {
    try {
      onEvent(event);
    } catch {
      // Observability must never break the trading pipeline.
    }
  }

  function circuitFor(name) {
    if (!circuits.has(name)) {
      circuits.set(name, {
        failures: 0,
        openedAt: 0
      });
    }
    return circuits.get(name);
  }

  function circuitOpen(name, now = Date.now()) {
    const state = circuitFor(name);
    if (!state.openedAt) return false;

    if (now - state.openedAt >= circuitCooldownMs) {
      state.openedAt = 0;
      state.failures = 0;
      emit({ type: "CIRCUIT_HALF_OPEN", name, timestamp: now });
      return false;
    }

    return true;
  }

  function recordSuccess(name) {
    const state = circuitFor(name);
    state.failures = 0;
    state.openedAt = 0;
  }

  function recordFailure(name, error) {
    const state = circuitFor(name);
    state.failures += 1;

    if (state.failures >= circuitFailureThreshold && !state.openedAt) {
      state.openedAt = Date.now();
      emit({
        type: "CIRCUIT_OPEN",
        name,
        failures: state.failures,
        errorCode: errorCode(error),
        timestamp: state.openedAt
      });
    }
  }

  async function withTimeout(operation, ms, name) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error(`${name} timed out after ${ms}ms`);
            error.code = "PIPELINE_TIMEOUT";
            reject(error);
          }, ms);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function run(name, operation, options = {}) {
    const limit = Number.isInteger(options.retries)
      ? Math.max(0, options.retries)
      : retries;
    const timeout = Number.isFinite(options.timeoutMs)
      ? Math.max(1, options.timeoutMs)
      : timeoutMs;

    if (circuitOpen(name)) {
      const error = new Error(`${name} circuit is open`);
      error.code = "PIPELINE_CIRCUIT_OPEN";
      emit({ type: "BLOCKED", name, errorCode: error.code, timestamp: Date.now() });
      throw error;
    }

    let lastError;

    for (let attempt = 0; attempt <= limit; attempt += 1) {
      const startedAt = Date.now();
      emit({ type: "START", name, attempt: attempt + 1, timestamp: startedAt });

      try {
        const result = await withTimeout(operation, timeout, name);
        recordSuccess(name);
        emit({
          type: "SUCCESS",
          name,
          attempt: attempt + 1,
          durationMs: Date.now() - startedAt,
          timestamp: Date.now()
        });
        return result;
      } catch (error) {
        lastError = error;
        recordFailure(name, error);

        const retryable = attempt < limit && !["INVALID_DATA", "STALE_DATA"].includes(errorCode(error));
        emit({
          type: retryable ? "RETRY" : "FAILED",
          name,
          attempt: attempt + 1,
          retryable,
          errorCode: errorCode(error),
          durationMs: Date.now() - startedAt,
          timestamp: Date.now()
        });

        if (retryable) {
          await sleep(retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  function status(name) {
    const state = circuitFor(name);
    return {
      name,
      failures: state.failures,
      open: circuitOpen(name),
      openedAt: state.openedAt || null
    };
  }

  return { run, status };
}
