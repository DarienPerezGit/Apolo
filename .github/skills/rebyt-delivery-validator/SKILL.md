---
name: rebyt-delivery-validator
description: 'Build or refine DeliveryValidator.py for GenLayer Bradbury. Use when implementing validation logic, equivalence principle, and binary approve/reject outcomes for Rebyt.'
argument-hint: 'Goal + validation condition + expected output fields'
user-invocable: true
---

# Rebyt Delivery Validator

## When to Use
- Implement `genlayer/DeliveryValidator.py` from scratch.
- Refactor validator behavior to align with Rebyt architecture.
- Enforce binary decision output for settlement gating.

## Required Project Context
Read first:
- `docs/ARCHITECTURE.md`
- `docs/README.md`
- `.env.example`
- `CLAUDE.md`

## Constraints
- Fresh implementation only.
- No copy-paste from `pre-hackathon/` or reference repos.
- Do not overclaim GenLayer capabilities.
- Keep decision compatible with relayer and onchain settlement.

## Procedure
1. Define expected validator input shape (intent context + delivery evidence).
2. Implement deterministic output contract: approve or reject.
3. Apply Rebyt equivalence principle: different reasoning, same binary outcome.
4. Keep output minimal for relayer consumption.
5. Document trusted-solver assumption in V1 where relevant.

## Done Criteria
- Validator returns binary decision consistently.
- Logic is compatible with `scripts/rebyt-relayer.mjs` consumption.
- Behavior matches architecture notes in docs.
