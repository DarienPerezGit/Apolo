# Apolo — Claude Code Context

## Project
Apolo is SLA-verified escrow infrastructure where 
clients define conditions ('pay when API returns 200'), 
AI validators verify them, and escrow settles automatically.
Tagline: Deploy. Get paid when it works.

## One-liner
"Deploy. Get paid when it works."

## Architecture
Four layers — implement in this order:
1. SLAValidator.py (GenLayer Bradbury)
2. ApoloEscrow.sol (BSC Testnet)
3. apolo-relayer.mjs (connects both)
4. frontend/index.html (demo UI)

## Reference repos (read, never copy)
Located at c:/Users/PC/Proyectos/
- conditional-payment-cross-border-trade/
  - base-sepolia/src/TradeFinanceEscrow.sol
  - base-sepolia/src/GenLayerForexOracle.sol
  - contracts/FxBenchmarkOracle.py
  - scripts/fx-settlement-relayer.mjs
- genlayer-project-boilerplate/
  - contracts/
  - tests/

## Non-negotiable constraints
- All code written from scratch in aleph-hackathon/
- No copy-paste from pre-hackathon/ or reference repos
- Solver is trusted in V1 — document this explicitly
- No overclaiming on GenLayer validation capabilities
- Every implemented feature must be verifiable onchain

## Tech stack
- viem (EIP-712 signing)
- Solidity + Foundry (ApoloEscrow.sol on BSC Testnet)
- GenLayer Python SDK (SLAValidator.py on Bradbury)
- Node.js (apolo-relayer.mjs)
- React (frontend demo)
- BSC Testnet Chain ID: 97
- GenLayer Bradbury testnet

## Wallet
Solver: 0xa2e036eD6f43baC9c67B6B098E8B006365b01464
- BNB on BNB Mainnet ✅
- GEN on GenLayer Bradbury ✅

## Hackathon deadline
Sunday March 22, 9AM Argentina time
Demo: 3-minute video in English

## Tracks
- GenLayer: Intelligent Contract with Optimistic Democracy 
  + Equivalence Principle on Bradbury
- PL Genesis: best overall project (double submission required)
- BNB Chain: BSC Testnet deployment

## Definition of done
1. ApoloEscrow.sol deployed on BSC Testnet — address recorded
2. DeliveryValidator.py deployed on GenLayer Bradbury — address recorded
3. apolo-relayer.mjs triggers release end-to-end
4. Frontend shows 4 steps with real explorer links
5. 3-minute video recorded in English
6. DoraHacks + DevSpot submissions complete

## Agents workflow
See .github/agents/ for orchestration workflow.
Start with: .github/prompts/run-apolo-hackathon-workflow.prompt.md
