# Rebyt — AI-Validated Escrow

![Rebyt Logo](assets/rebyt_logo_isometric_solo.svg)

**AI proposes truth. A dispute window protects it. Smart contracts enforce it.**

Rebyt is intent-based payment infrastructure where users sign what they want, AI validators reach consensus on delivery conditions, and escrow settles automatically on BNB Smart Chain — but only after a finality window where results can be disputed.

---

## Demo Snapshot

> **No mocks. Real AI validation + on-chain settlement.**

| Scenario | AI Verdict | Escrow Outcome |
|----------|-----------|----------------|
| Delivery confirmed | ✅ YES | **Funds released** to recipient |
| Delivery failed | ❌ NO | **Funds refunded** to sender |

- **3/3 QA E2E cases passed** — reject → approve → reject
- GenLayer validators reach consensus via **Optimistic Democracy**
- Every result is verifiable on [BscScan](https://testnet.bscscan.com) + GenLayer explorer

---

## Architecture

![Rebyt Full Architecture Flow](assets/rebyt_full_architecture_sequence.svg)

```
User ──sign──▶ Intent ──fund──▶ Escrow (BSC)
                                    │
                              validate (AI)
                                    │
                           GenLayer Consensus
                                    │
                              ┌─ ACCEPTED ─┐
                              │             │
                         Dispute Window (30 min)
                              │             │
                              └─ FINALIZED ─┘
                             YES ─┘   └─ NO
                              │           │
                           release     refund
```

Four phases:

| Layer | What it does | Where |
|-------|-------------|-------|
| **Intent** | User signs a `PaymentIntent` via EIP-712 — no gas, no wallet popup | Offchain |
| **Validation** | 5 AI validators evaluate delivery condition → binary YES/NO | GenLayer Bradbury |
| **Finality** | Result marked ACCEPTED → 30-min dispute window → FINALIZED | GenLayer Bradbury |
| **Settlement** | Escrow executes `release()` or `refund()` after finality | BSC Testnet |

The **Relayer** bridges validation → settlement: reads the AI consensus from GenLayer, then calls the appropriate escrow function on BSC.

---

## Finality Model

> **We don't blindly trust AI. We give it a dispute window before money moves.**

GenLayer Bradbury uses **Optimistic Democracy** — a consensus mechanism where AI validators propose a result, and that result can be challenged during a finality window.

| Phase | What happens | Duration |
|-------|-------------|----------|
| **Consensus** | 5 validators run LLM evaluation → majority agrees | ~seconds (StudioNet) |
| **ACCEPTED** | Result posted on-chain, marked as accepted | Immediate |
| **Dispute Window** | Anyone can appeal the result | 30 min (Bradbury) |
| **FINALIZED** | No appeals → result becomes permanent | After window closes |
| **Settlement** | Relayer reads finalized result → executes on BSC | Immediate |

**For demo**: We use StudioNet (fast path) to avoid the 30-min wait. The dispute window is real on Bradbury — we show it in the UI and explain it clearly.

This model mirrors **optimistic rollups**: assume correctness, allow challenge, then finalize.

---

## Why It Matters

- **Removes trust from payments** — AI proposes truth, dispute window protects it, then value moves
- **Programmable commerce primitive** — any condition can gate any payment
- **Optimistic verification** — like rollups for payments: assume correctness, allow challenge, then finalize

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Python** 3.10+ (for GenLayer validator)
- **Foundry** (optional — only if redeploying contracts)
- A wallet with **tBNB** on BSC Testnet + **GEN** on GenLayer

### Install

```bash
git clone https://github.com/DarienPerezGit/aleph-hackathon.git
cd aleph-hackathon

# Root dependencies (relayer, solver, scripts)
npm install

# Frontend
cd frontend && npm install && cd ..
```

### Configure

Copy `.env.example` → `.env` and fill in:

```env
# Required
SOLVER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545

# Deployed contracts (already live — use these or deploy your own)
ESCROW_CONTRACT_ADDRESS=0x5191Bca416e2De8dD7915bdD55bf625143ABB98C
GENLAYER_CONTRACT_ADDRESS=0xc84ef0aEC4A8b4e5241231296C4a201cb56380C6
```

For the frontend, copy `frontend/.env.example` → `frontend/.env`:

```env
VITE_BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545
VITE_ESCROW_CONTRACT_ADDRESS=0x5191Bca416e2De8dD7915bdD55bf625143ABB98C
VITE_GENLAYER_CONTRACT_ADDRESS=0xc84ef0aEC4A8b4e5241231296C4a201cb56380C6
```

### Run

```bash
# 1. Start frontend
cd frontend && npm run dev

# 2. Start solver (handles funding)
npm run solver

# 3. Relayer runs per-intent (see Demo section below)
```

---

## Run the Demo

### Case 1 — APPROVE (funds released)

1. **Sign intent** in frontend → EIP-712 signature generated
2. **Solver funds escrow** → `fund()` tx on BSC
3. **AI validation** → run in GenLayer Studio UI (Full Consensus) → validators return **YES** → status: **ACCEPTED**
4. **Finality** → dispute window passes (instant in StudioNet, 30 min on Bradbury) → **FINALIZED**
5. **Settle**:
   ```bash
   node scripts/rebyt-relayer.mjs <intentHash> approved
   ```
5. **Result**: `release()` called on escrow → funds sent to recipient

### Case 2 — REJECT (funds refunded)

1. **Sign intent** in frontend → same flow
2. **Solver funds escrow** → `fund()` tx on BSC
3. **AI validation** → validators return **NO** (condition not met) → status: **ACCEPTED**
4. **Finality** → dispute window passes → **FINALIZED**
5. **Settle**:
   ```bash
   node scripts/rebyt-relayer.mjs <intentHash> rejected
   ```
6. **Result**: `refund()` called on escrow → funds returned to sender

### Expected logs

```
[timestamp] consensus.accepted — validators: MAJORITY_AGREE
[timestamp] finality.pending — dispute window active (30 min in production)
[timestamp] finality.confirmed — no appeals, result finalized
[timestamp] Settlement transaction sent { action: 'release', txHash: '0x...', bscScanUrl: '...' }
[timestamp] Settlement transaction confirmed { action: 'release', status: 'success' }
```

---

## Proof — Real Transactions

**QA E2E: 3/3 PASSED** (reject → approve → reject)

| Step | Transaction | Explorer |
|------|------------|---------|
| GenLayer validation (reject) | `0x7201...9c1a` | GenLayer explorer |
| GenLayer validation (approve) | `0x22ae...741d` | GenLayer explorer |
| GenLayer validation (reject) | `0xf9ed...0497` | GenLayer explorer |
| BSC refund | `0xdf72...0190` | [BscScan](https://testnet.bscscan.com/tx/0xdf72daa0b6c1d3a2d17cfbb02fbf8f72f3310f236e1fda8a9e4d4fd3f8ad0190) |
| BSC release | `0x386d...b9bc` | [BscScan](https://testnet.bscscan.com/tx/0x386dea5bda30cef5a651ef259af24a8bf358afb8cb2f2e9a7a3a6dc6cdd1b9bc) |
| BSC refund | `0xbe2f...6fa9` | [BscScan](https://testnet.bscscan.com/tx/0xbe2f9e5f2c84ab9d2dbf3f85e5ae08be8c6e1e5a6a15c16ab8c65a0c61f66fa9) |
| ZK proof verified | `0x1bce...ab3e` | [BscScan](https://testnet.bscscan.com/tx/0x1bce644f6ac296bbd5a75ffa0b783987d8648355bb4dd912d6cbe8970995ab3e) |

All validators reached consensus with status **ACCEPTED / MAJORITY_AGREE**.

GenLayer onchain anchoring is now integrated:
- `recordConsensus(intentHash, approved, ACCEPTED, PENDING, validationRef, observedAt)`
- `recordFinality(intentHash, CONFIRMED, finalizedAt)`

This creates explicit onchain evidence on GenLayer for:
- consensus phase
- finality phase
- timestamps and validation references

---

## Deployed Contracts

| Contract | Address | Network |
|----------|---------|---------|
| **RebytEscrow.sol** | `0x5191Bca416e2De8dD7915bdD55bf625143ABB98C` | BSC Testnet |
| **Groth16Verifier** | `0x5cBC63B27AF1427096C644DdC66B56cf01006A1e` | BSC Testnet |
| **DeliveryValidator.py** | `0x619d0b8f1b6C0F09118314c73Cbc45552D38E6BB` | GenLayer Bradbury |

GenExplorer links:
- Contract: https://explorer-bradbury.genlayer.com/address/0x619d0b8f1b6C0F09118314c73Cbc45552D38E6BB
- Deploy tx: https://explorer-bradbury.genlayer.com/transactions/0xdc93fec50236e0e41a20b75779dbb73ff60cc17ca37dd69358d173c5b4156c9c
- Validators: https://explorer-bradbury.genlayer.com/validators

---

## ZK Proof System

Optional ZK path that verifies intent data integrity **before** escrow accepts funds.

- **Circuit**: `Poseidon(recipient, amount, nonce) == intentHash`
- **Proof system**: Groth16 (Circom 2.2.3 + snarkjs)
- **Onchain verifier**: `RebytEscrow.fundWithZK()`
- **Role**: AI decides **IF** to pay; ZK guarantees **WHAT** is being paid and that nobody changed it

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Intent signing | EIP-712 / viem |
| Smart contracts | Solidity / Foundry |
| Blockchain | BNB Smart Chain (Testnet, Chain 97) |
| AI validation | GenLayer Bradbury (Optimistic Democracy) |
| ZK proofs | Circom + Groth16 + snarkjs |
| Relayer | Node.js |
| Frontend | React + Vite + Tailwind |

---

## Limitations (V1)

- **Binary classification only** — AI returns YES or NO, no partial outcomes
- **Trusted Solver model** — the Solver funds escrow and initiates execution without onchain signature verification. Full trust minimization is a V2 goal.
- **Demo uses StudioNet fast path** — 30-min dispute window is real on Bradbury but abbreviated in demo for speed. Explained clearly in UI.

---

## Future Work

- **ZK proofs integration** into main payment flow (currently optional path)
- **Multi-validator weighting** — confidence scores beyond binary consensus
- **EIP-7702 session wallets** — BNB Pascal upgrade path for gasless UX
- **Multi-solver competitive network** — decentralized solver marketplace

---

## Bradbury Bug Report

During integration with GenLayer Bradbury, we documented reproducible issues with `gen_call` reliability.  
Full report: [BRADBURY-BUG-REPORT.md](BRADBURY-BUG-REPORT.md)

---

## Hackathon Tracks

| Track | Fit |
|-------|-----|
| **GenLayer** | Intelligent contract using Optimistic Democracy + Equivalence Principle + Finality Window on Bradbury |
| **Bradbury Special** | Bug report with reproducible issues during validator integration |
| **PL Genesis** | Full payment lifecycle: intent → escrow → validation → settlement |
| **BNB Chain** | Deployed on BSC Testnet with ZK verification path |

---

## Demo Video

[Coming soon]

---

## License

MIT