---
name: rebyt-relayer-bridge
description: 'Build rebyt-relayer.mjs that connects GenLayer validation outcome with RebytEscrow settlement on BSC Testnet. Use for release/refund execution flows.'
argument-hint: 'Input sources + mapping rules + settlement action'
user-invocable: true
---

# Rebyt Relayer Bridge

## When to Use
- Implement `scripts/rebyt-relayer.mjs`.
- Wire validator output to escrow release/refund actions.
- Add reliability checks for cross-layer settlement execution.

## Required Project Context
Read first:
- `docs/ARCHITECTURE.md`
- `.env.example`
- `CLAUDE.md`

## Constraints
- Fresh implementation only.
- Use configured env variables for addresses and RPC endpoints.
- Do not settle without explicit validation result.
- Keep traces verifiable on explorers.

## Procedure
1. Load and validate required env vars.
2. Read validation decision from GenLayer source.
3. Map decision to escrow action (`release` or `refund`).
4. Send settlement tx to BSC Testnet.
5. Return tx hash + status for observability.

## Done Criteria
- Relayer performs deterministic action from validator output.
- Missing config fails fast with clear error.
- Output includes explorer-friendly transaction identifiers.
