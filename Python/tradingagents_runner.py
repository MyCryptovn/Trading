#!/usr/bin/env python3
"""Small fail-closed bridge from the Node paper bot to TradingAgents.

Input: one JSON object on stdin.
Output: one JSON object on stdout.
No wallet, signing, order, or execution capability is exposed here.
"""

import json
import os
import sys
from datetime import datetime, timezone


def emit(payload):
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def main():
    try:
        payload = json.load(sys.stdin)
        symbol = str(payload.get("symbol") or "").strip().upper()
        as_of = str(payload.get("asOf") or "").strip()
        if not symbol or not as_of:
            emit({"decision": "REVIEW", "confidence": 0, "reason": "INVALID_INPUT"})
            return 0

        from tradingagents.graph.trading_graph import TradingAgentsGraph
        from tradingagents.default_config import DEFAULT_CONFIG

        config = DEFAULT_CONFIG.copy()
        config["llm_provider"] = os.getenv("TRADINGAGENTS_LLM_PROVIDER", config.get("llm_provider", "openai"))
        if os.getenv("TRADINGAGENTS_DEEP_MODEL"):
            config["deep_think_llm"] = os.environ["TRADINGAGENTS_DEEP_MODEL"]
        if os.getenv("TRADINGAGENTS_QUICK_MODEL"):
            config["quick_think_llm"] = os.environ["TRADINGAGENTS_QUICK_MODEL"]
        if os.getenv("TRADINGAGENTS_MAX_DEBATE_ROUNDS"):
            config["max_debate_rounds"] = int(os.environ["TRADINGAGENTS_MAX_DEBATE_ROUNDS"])
        if os.getenv("TRADINGAGENTS_MAX_RISK_ROUNDS"):
            config["max_risk_discuss_rounds"] = int(os.environ["TRADINGAGENTS_MAX_RISK_ROUNDS"])
        config["temperature"] = 0.0

        graph = TradingAgentsGraph(debug=False, config=config)
        trade_date = datetime.fromisoformat(as_of.replace("Z", "+00:00")).date().isoformat()
        final_state, decision = graph.propagate(symbol, trade_date, asset_type="crypto")

        normalized = str(decision or "REVIEW").strip().upper()
        if normalized not in {"BUY", "OVERWEIGHT", "HOLD", "UNDERWEIGHT", "SELL", "REVIEW"}:
            normalized = "REVIEW"

        emit({
            "decision": normalized,
            "confidence": None,
            "tradeDate": trade_date,
            "source": "TradingAgents-v0.4.0",
            "hasFinalState": bool(final_state),
        })
        return 0
    except Exception as exc:
        emit({
            "decision": "REVIEW",
            "confidence": 0,
            "reason": "TRADINGAGENTS_RUNTIME_ERROR",
            "error": str(exc)[:500],
        })
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
