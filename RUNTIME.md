# DEX Trading Runtime

## Purpose

GitHub Actions is the CI/test layer. It is not the production 24/7 trading process. GitHub-hosted runners are provisioned for individual jobs and are decommissioned after the job ends, so the bot must run in a persistent VM/container for continuous Paper monitoring.

This repository now contains a containerized runtime for that purpose.

## Safety state

The runtime is explicitly PAPER only.

- `BOT_MODE=paper`
- Real-money execution is disabled in the current code.
- No private key or wallet signer is required.
- Do not add private keys to this repository or to the example environment file.
- GoPlus bypass is only for Paper testing.

## Run on a persistent Linux/VPS host

1. Install Docker and Docker Compose.
2. Clone the repository.
3. Copy `runtime.env.example` to `.env`.
4. Fill only the public/read-only data configuration that you actually have.
5. Keep `BOT_MODE=paper`.
6. Start:

```bash
docker compose up -d --build
```

7. Check health:

```bash
curl http://127.0.0.1:3000/health
```

8. Open the dashboard on port 3000.
9. Inspect logs:

```bash
docker compose logs -f dex-bot-paper
```

10. Stop:

```bash
docker compose down
```

## What proves that the runtime is actually alive

The dashboard must show changing:

- server time
- market prices
- market count
- activity entries
- equity history
- Paper journal ticks

The container health endpoint must return:

```json
{"ok":true,"mode":"paper","realMoneyTrading":false}
```

A green GitHub Actions run alone does not prove runtime activity.

## Data validation gate

Before any live-trading work, the Paper runtime must accumulate real observations and demonstrate:

`market data -> DEX data -> safety -> liquidity/spread -> flow -> statistical evidence -> decision gate -> Paper execution -> equity/P&L -> journal`

Missing, stale, conflicting, or unverified trading evidence must remain fail-closed.

## Live trading

There is intentionally no live deployment procedure here yet. Live trading is a separate phase that requires:

- long enough real-data Paper history
- out-of-sample validation
- measured slippage and costs
- drawdown/risk validation
- reliable token safety
- monitoring and kill switch
- explicit human review

Do not switch `BOT_MODE` to live as a shortcut.
