# Rebyt Custom Skills

These skills are tailored for the Rebyt hackathon workflow.
Use them as slash commands in chat (`/`).

## Skills

- `rebyt-delivery-validator`  
  Build/refine `genlayer/DeliveryValidator.py` with binary approve/reject logic.

- `rebyt-escrow-contract`  
  Implement/review `contracts/RebytEscrow.sol` with intentHash-linked escrow flow.

- `rebyt-relayer-bridge`  
  Build `scripts/rebyt-relayer.mjs` to map validation decision into release/refund.

- `rebyt-hackathon-gate`  
  Run final compliance check against constraints, tracks, and definition of done.

## Notes

- All skills enforce fresh implementation constraints.
- All skills assume `docs/ARCHITECTURE.md`, `docs/README.md`, `.env.example`, and `CLAUDE.md` as primary context.
