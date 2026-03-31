<!-- markdownlint-disable MD013 MD034 MD060 -->


# Apolo: Automated API Bounties

**Verify production before you pay.**

Contratá a un dev, definí la condición de éxito de tu API, y Apolo paga automáticamente sólo si la entrega funciona en producción.

```text
Client (Set Bounty)
   |
   v
Escrow (Lock Funds)
   |
   v
GenLayer Judge (Verify API)
   |
   v
Payout (Release or Refund)
```


## What is Apolo?

Apolo es una herramienta de bounties para APIs: el cliente define una condición ("pagar cuando la API responda HTTP 200"), los fondos quedan bloqueados en escrow, y sólo se pagan si la API pasa la verificación automática en producción.

**V1 trust model:** El Solver/Relayer es un componente offchain confiable que financia el escrow, solicita validación y ejecuta el pago según el resultado observado.


## How it works

### Product Architecture

| Component | Chain | Description |
|---|---|---|
| SLA Intent (EIP-712) | Offchain | El cliente firma condición + endpoint sin gas. |
| ApoloEscrow.sol | BSC Testnet (97) | Bloquea fondos y expone `release()` / `refund()` por intent. |
| SLAValidator.py | GenLayer Bradbury | Evalúa evidencia del endpoint y devuelve decisión binaria. |
| apolo-relayer.mjs | Offchain + BSC Testnet | Lee resultado de validación y ejecuta settlement onchain. |
| Frontend (React/Vite) | Offchain UI | Flujo demo de 4 pasos con links a explorers. |

### Runtime Sequence

| Step | Component | Result |
|---|---|---|
| 1 | Client + Frontend | Firma de intent con condición SLA. |
| 2 | Solver + Escrow | Fondos bloqueados en BSC Testnet. |
| 3 | GenLayer Judge | Verificación automática del endpoint y decisión approve/reject. |
| 4 | Relayer + Escrow | `release()` si cumple, `refund()` si no cumple. |

### Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Signing | viem + EIP-712 | Typed-data intent signing. |
| Escrow | Solidity ^0.8.20 + Foundry | Contrato de settlement en BSC Testnet. |
| Validation | GenLayer Python SDK | Validación SLA en Bradbury/StudioNet-compatible. |
| Relayer | Node.js ESM | Puente entre resultado de validación y escrow. |
| Frontend | React + Vite + Tailwind | Demo UI para jueces y operadores. |
| Integrity | Circom + snarkjs + Groth16 | Prueba de integridad de intent (fundWithZK). |


## Setup (run it locally)

### Prerequisites

- Node.js 18+
- npm 9+
- Python 3.10+
- Foundry (`forge`, `cast`)
- GenLayer CLI (para `init` / `up`)
- Wallet con BNB para BNB Mainnet
- Variables configuradas en `.env` (basado en `.env.example`)

### 1) GenLayer (init, up, deploy Python validator)

```bash
# Initialize local GenLayer project context

genlayer init

genlayer up

# Install Python requirements for validator
python -m pip install -r genlayer/requirements.txt

# Deploy validator contract (repo-native deploy script)
GENLAYER_CONTRACT_FILE=SLAValidator.py node scripts/deploy-validator.mjs
```

### 2) BNB Chain (build + deploy Escrow)

```bash
# Compile contracts
forge build

# Deploy ApoloEscrow directly
forge create contracts/ApoloEscrow.sol:ApoloEscrow \
  --rpc-url $BSC_TESTNET_RPC \
  --private-key $PRIVATE_KEY \
  --constructor-args $SOLVER_ADDRESS
```

### 3) Relayer bridge (Node.js)

```bash
# From repository root
npm install

# Run relayer flow
npm run relayer -- <SLA_INTENT_HASH> approved
# or
npm run relayer -- <SLA_INTENT_HASH> rejected
```

### 4) Frontend (React/Vite)

```bash
cd frontend
npm install
npm run dev
```


## Real onchain transparency

### Deployed Contracts

#### BSC Testnet

| Contract | Address |
|---|---|
| ApoloEscrow (ZK enabled) | 0x5191Bca416e2De8dD7915bdD55bf625143ABB98C |
| Groth16Verifier | 0x5cBC63B27AF1427096C644DdC66B56cf01006A1e |

#### GenLayer Bradbury

| Contract | Address |
|---|---|
| SLAValidator.py | 0xc84ef0aEC4A8b4e5241231296C4a201cb56380C6 |

### Key Proofs

- ZK fund (`fundWithZK`):
  https://testnet.bscscan.com/tx/0x1bce644f6ac296bbd5a75ffa0b783987d8648355bb4dd912d6cbe8970995ab3e
- Settlement release:
  https://testnet.bscscan.com/tx/0x98f5ae6cc8ba95e139d5b5c4ce54822c7c4074f0ff75bacb7774d7645cfec453


## Bradbury Bug Report

Durante la integración documentamos 6 issues reproducibles sobre `gen_call` en Bradbury.

- Reporte completo: `docs/BRADBURY-BUG-REPORT.md`
- Estado: enviado para Bradbury Special Track


## Demo Video

- Estado: pendiente de adjuntar enlace final de entrega


## Tracks

- GenLayer Future of Work: AI-verified SLA payments on Bradbury
- Bradbury Special Track: 6 reproducible bug reports
- PL Genesis: best overall project
- BNB Chain: BSC Testnet deployment, EIP-7702 roadmap

---

*"AI agents are the smart glue between APIs." — Karpathy*
