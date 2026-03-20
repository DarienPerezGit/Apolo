---
name: Run Rebyt Hackathon Workflow
description: "Run orchestrated hackathon workflow (coder → validator → tester → merger) for Rebyt with strict constraints."
agent: Rebyt Orchestrator
argument-hint: "Paste objective and reference repository paths"
---
Use the Rebyt Orchestrator workflow for this task.

## Mandatory Context
Read first:
- [Architecture](../../docs/ARCHITECTURE.md)
- [Project Scope](../../docs/README.md)
- [Environment](../../.env.example)

Then read these reference files (provided by user paths):
- conditional-payment-cross-border-trade/base-sepolia/src/TradeFinanceEscrow.sol
- conditional-payment-cross-border-trade/base-sepolia/src/GenLayerForexOracle.sol
- conditional-payment-cross-border-trade/contracts/FxBenchmarkOracle.py
- conditional-payment-cross-border-trade/scripts/fx-settlement-relayer.mjs

## Mandatory Constraints
- Fresh implementation only. No copy from pre-hackathon or references.
- Keep architecture exactly as documented in Rebyt docs.
- Build in this order:
  1) DeliveryValidator.py
  2) RebytEscrow.sol
  3) rebyt-relayer.mjs
  4) frontend

## Required Acceptance
Only finish when:
- Validator decision is PASS
- Tester decision is PASS
- Merger decision is ACCEPTED

If not accepted, continue loop with concrete fixes.
