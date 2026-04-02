# ApoloSLAWatcherAgent

External A2A agent for Apolo V1.5. Monitors SLA conditions and triggers on-chain escrow settlement autonomously — no manual step required.

## Architecture

```
Client → POST /intent (defer=true) → ApoloEscrow (BNB Mainnet)
                                            ↓
                                  ApoloSLAWatcherAgent (A2A)
                                    - HTTP SLA checks × N
                                    - decision: approved/rejected
                                            ↓
                                  POST /settle → apolo-solver
                                            ↓
                                  release() / refund() on-chain
```

## Install

```bash
# With uv (recommended)
uv venv
uv pip install -r requirements.txt

# Or pip
pip install -r requirements.txt
```

## Run the agent server

```bash
# From repo root
cd agent-a2a
python __main__.py

# Agent card available at:
# http://localhost:8080/.well-known/agent.json
```

Set `AGENT_PORT` (default `8080`) and `SOLVER_URL` (default `http://localhost:3001`) via env.

## Run the sample client

Make sure the Apolo solver is running first:
```bash
node scripts/apolo-server.mjs
```

Then trigger a full case study:
```bash
# Fund + watch + settle (auto-generates intentHash)
python agent-a2a/client.py https://httpbin.org/status/200 --fund

# Use existing funded intentHash
python agent-a2a/client.py https://httpbin.org/status/200 0xYOUR_INTENT_HASH

# Test rejection (500 response → refund)
python agent-a2a/client.py https://httpbin.org/status/500 --fund
```

## Task input schema

```json
{
  "intentHash":     "0x...",
  "slaUrl":         "https://api.example.com/health",
  "expectedStatus": 200,
  "checksRequired": 3,
  "solverUrl":      "http://localhost:3001"
}
```

## Output

- Streaming text logs during execution
- Final `DataPart` with full proof report:

```json
{
  "intentHash": "0x...",
  "contractAddress": "0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d",
  "chainId": 56,
  "decision": "approved",
  "evidence": { "slaUrl": "...", "checks": [...], "passed": 3, "total": 3 },
  "settlement": {
    "action": "release",
    "txHash": "0x...",
    "bscScanUrl": "https://bscscan.com/tx/0x..."
  }
}
```

- `agent-report.json` written to disk with full artifact

## Trust model

Solver/relayer is trusted in V1 (explicitly documented). GenLayer validation is the target for V2 — the agent is designed to attach GenLayer evidence when available.
