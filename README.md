# Apolo — AI-Verified SLA Escrow on BNB Chain

> **Deploy. Get paid when it works.**

Apolo is an automated bounty and escrow system for API and operational work verification. It locks funds securely on the BNB Chain and automatically releases them when verifiable conditions are met. 

---

🔥 **[Live Demo on Vercel](https://project-apolo.vercel.app/)**  

💼 **[ApoloEscrow Contract (Mainnet)](https://bscscan.com/address/0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d)**

✅ **Mainnet Execution Proofs**  
- **Contract Deploy:** [0x1284c...](https://bscscan.com/tx/0x1284cda32301220a2bb94d75a7e5fe37ac5c55f89c3f8ab3ded366f2d1dd3cb8)
- **Fund & Release TXs:** *Pending — will be published after first mainnet execution.*

📜 **Testnet Proofs (Historical/Dev Mode)**  
- **Fund TX (Testnet Archive):** [0x98f5a...](https://testnet.bscscan.com/tx/0x98f5ae6cc8ba95e139d5b5c4ce54822c7c4074f0ff75bacb7774d7645cfec453)
- **Release TX (Testnet Archive):** [0x386de...](https://testnet.bscscan.com/tx/0x386dea5bda30cef5a651ef259af24a8bf358afb8cb2f2e9a7a3a6dc6cdd1b9bc)

---

## ⚡ Quick Demo (Local)

> [!CAUTION]
> Running the demo locally by default targets **BNB Mainnet** (requires actual BNB for gas). 
> 
> To test for free on **BSC Testnet**, update the following in your `.env`:
> ```bash
> BSC_RPC=https://data-seed-prebsc-1-s1.binance.org:8545
> BSC_CHAIN_ID=97
> ESCROW_CONTRACT_ADDRESS=0x5191Bca416e2De8dD7915bdD55bf625143ABB98C
> ```

1. `npm install && cd frontend && npm install`
2. **Terminal 1:** Run `npm run solver`
3. **Terminal 2:** Run `cd frontend && npm run dev`, open `http://localhost:5173`
4. Fill intent details, click **Lock Funds**.
5. Once the transaction confirms on-chain, simulate the relayer settlement in **Terminal 3**:
   `npm run relayer <INTENT_HASH> approved`
6. Done! Watch the terminal output and explorer to see your funds automatically released.

---

## 🏆 What It Is
Apolo is a verifiable bank-account layer for the Agentic Economy. It allows developers and clients to create SLAs (Service Level Agreements) backed by real funds. The client locks up funds, an external validation process checks the SLA, and if successful, the funds are automatically released. 

## 🧠 How It Works

![Apolo Architecture](docs/assets/Apolo%20SLA%20Escrow%20Flow.png)

```text
1. Client locks funds in escrow (BNB Mainnet)
      ↓
2. Off-chain verification checks the SLA condition (API uptime / response / evidence)
      ↓
3. Trusted relayer triggers settlement on-chain
      ↓
4. Funds are released or refunded automatically
```

## 🔒 Trust Model (V1)
In V1, **Apolo uses a Trusted Relayer model**. 
The relayer node is a critical component that acts as the bridge between off-chain consensus (or AI Validation) and on-chain execution. Instead of forcing heavy verification on-chain, the trusted relayer executes the outcome on the BNB Mainnet. This enables an immediate, simple, and reliable MVP for verifying operational work.

---

## 🤖 External Agent Integration (A2A)

Apolo V1.5 includes **ApoloSLAWatcherAgent** — an external autonomous agent built on the [A2A protocol](https://github.com/a2aproject/a2a-python) that monitors SLA conditions and triggers on-chain settlement without any manual step.

### Architecture

```
Client → POST /intent (defer=true) → ApoloEscrow (BNB Mainnet, locked)
                                              ↓
                                  ApoloSLAWatcherAgent (A2A Server)
                                    checks slaUrl × N times
                                    decision: approved / rejected
                                              ↓
                                    POST /settle → Apolo Solver
                                              ↓
                                    release() / refund() on-chain ✅
```

### Run the agent locally

```bash
# 1. Install deps
pip install -r agent-a2a/requirements.txt

# 2. Start the Apolo solver (Terminal 1)
node scripts/apolo-server.mjs

# 3. Start the A2A agent server (Terminal 2)
python agent-a2a/__main__.py
# → http://localhost:8080/.well-known/agent.json
```

Set `AGENT_API_KEY` in `.env` (both solver and agent) to authenticate agent→solver calls.

### Run the full case study

```bash
# Fund a new escrow + agent validates + settles on-chain
node scripts/qa-a2a-case-study.mjs

# Test rejection path (500 → refund)
node scripts/qa-a2a-case-study.mjs https://httpbin.org/status/500
```

Produces `agent-report.json` with:
- `intentHash`, `decision`, structured `evidence` (3 checks with timestamps)
- `fund` + `settle` BSCScan links
- Full on-chain proof

### Deploy to cloud (Render)

```bash
# render.yaml is included — connect repo to Render and set:
# SOLVER_URL=https://your-solver.onrender.com
# AGENT_API_KEY=<shared-secret>
```

### What this proves

> *"We already have an external A2A agent autonomously validating an SLA and triggering BNB Mainnet settlement."*

No UI button. No manual relayer run. The agent drives the full flow end-to-end.

---

## 🛠 Tech Stack

| Contract | Network | Address |
|---|---|---|
| `ApoloEscrow` | BNB Mainnet | `0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d` |
| Signing | viem + EIP-712 |
| Frontend | React + Vite |
| Relayer | Node.js (ESM) |

## 📄 License
MIT
