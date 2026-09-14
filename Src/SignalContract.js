const ACTIONS = new Set(["BUY", "SELL", "HOLD", "UNKNOWN"]);
const DIRECTIONS = new Set(["UP", "DOWN", "NEUTRAL", "UNKNOWN"]);

export function normalizeAction(value) {
  const action = String(value || "").trim().toUpperCase();
  if (action === "UP") return "BUY";
  if (action === "DOWN") return "SELL";
  if (action === "FLOW_UP") return "BUY";
  if (action === "FLOW_DOWN") return "SELL";
  return ACTIONS.has(action) ? action : "UNKNOWN";
}

export function normalizeDirection(value) {
  const direction = String(value || "").trim().toUpperCase();
  return DIRECTIONS.has(direction) ? direction : "UNKNOWN";
}

export function actionToDirection(action) {
  const normalized = normalizeAction(action);
  if (normalized === "BUY") return "UP";
  if (normalized === "SELL") return "DOWN";
  if (normalized === "HOLD") return "NEUTRAL";
  return "UNKNOWN";
}

export { ACTIONS, DIRECTIONS };
