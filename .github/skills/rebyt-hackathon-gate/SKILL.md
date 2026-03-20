---
name: rebyt-hackathon-gate
description: 'Run a final compliance gate for Rebyt hackathon delivery. Use before demo/submission to verify constraints, track requirements, and definition of done evidence.'
argument-hint: 'Current status + deployed addresses + pending blockers'
user-invocable: true
---

# Rebyt Hackathon Gate

## When to Use
- Before recording final demo.
- Before DoraHacks and DevSpot submission.
- After major implementation changes.

## Required Project Context
Read first:
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/README.md`
- `docs/DEMO-SCRIPT.md`
- `.env.example`

## Gate Checklist
1. Fresh implementation constraint respected.
2. Trusted solver in V1 explicitly documented.
3. No overclaiming on GenLayer validation guarantees.
4. Required components present:
   - `genlayer/DeliveryValidator.py`
   - `contracts/RebytEscrow.sol`
   - `scripts/rebyt-relayer.mjs`
5. Definition of done evidence collected (addresses, tx links, demo proof).

## Output Format
Return exactly:
- Gate Status: PASS or FAIL
- Blocking Gaps (numbered)
- Evidence Collected (numbered)
- Next 3 Actions
