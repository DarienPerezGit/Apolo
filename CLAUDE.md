# Rebyt — Claude Code Context

## Project
Intent-based payment infrastructure where users sign what they 
want, AI validators evaluate delivery conditions, and escrow 
settles automatically.

## One-liner
"Blockchains execute transactions. Rebyt validates outcomes 
before value moves."

## Architecture
Four layers — implement in this order:
1. DeliveryValidator.py (GenLayer Bradbury)
2. RebytEscrow.sol (BSC Testnet)
3. rebyt-relayer.mjs (connects both)
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
- Solidity + Foundry (RebytEscrow.sol on BSC Testnet)
- GenLayer Python SDK (DeliveryValidator.py on Bradbury)
- Node.js (rebyt-relayer.mjs)
- React (frontend demo)
- BSC Testnet Chain ID: 97
- GenLayer Bradbury testnet

## Wallet
Solver: 0xa2e036eD6f43baC9c67B6B098E8B006365b01464
- tBNB on BSC Testnet ✅
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
1. RebytEscrow.sol deployed on BSC Testnet — address recorded
2. DeliveryValidator.py deployed on GenLayer Bradbury — address recorded
3. rebyt-relayer.mjs triggers release end-to-end
4. Frontend shows 4 steps with real explorer links
5. 3-minute video recorded in English
6. DoraHacks + DevSpot submissions complete

## Agents workflow
See .github/agents/ for orchestration workflow.
Start with: .github/prompts/run-rebyt-hackathon-workflow.prompt.md
