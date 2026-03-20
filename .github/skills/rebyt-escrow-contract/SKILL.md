---
name: rebyt-escrow-contract
description: 'Implement or review RebytEscrow.sol on BSC Testnet. Use when building escrow state machine, settlement functions, and intentHash-linked funds flow.'
argument-hint: 'State transitions + required methods + funding/release policy'
user-invocable: true
---

# Rebyt Escrow Contract

## When to Use
- Create `contracts/RebytEscrow.sol` from zero.
- Validate escrow state machine and transitions.
- Align contract behavior with validator/relayer integration.

## Required Project Context
Read first:
- `docs/ARCHITECTURE.md`
- `docs/README.md`
- `.env.example`
- `CLAUDE.md`

## Constraints
- BSC Testnet oriented (chain id 97 context).
- No direct copy from reference repositories.
- Every critical transition must be onchain-verifiable.
- Solver is trusted in V1; reflect this in behavior or docs.

## Procedure
1. Define storage keyed by `intentHash`.
2. Enforce state machine: `PENDING -> FUNDED -> VALIDATING -> RELEASED` and refund path if rejected.
3. Restrict settlement actions to intended authority model for V1.
4. Emit events for funding, validation start, release/refund.
5. Keep external interface simple for relayer calls.

## Done Criteria
- Contract compiles.
- Intent-linked funds flow is explicit.
- State transitions are auditable through events and storage.
