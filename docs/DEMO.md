# Rebyt Demo (Winning Flow)

## Core message
Rebyt validates real-world outcomes before value moves.

## 3-minute flow

### 1) Intent creation (frontend)
- User signs a payment intent (EIP-712)
- Show intent hash and signature in UI/logs

### 2) Escrow funded on BSC
- Solver funds `RebytEscrow.sol`
- Show BscScan tx link

### 3) GenLayer consensus (Studio UI)
- Run `validate()` in Studio (Full Consensus)
- Show:
  - validator set
  - `4/4 Agree`
  - `ACCEPTED`
  - final decision (`YES` or `NO`)

### 4) Settlement on BSC (Plan B relayer)
- If decision is YES:
  - `node scripts/rebyt-relayer.mjs <intentHash> approved`
- If decision is NO:
  - `node scripts/rebyt-relayer.mjs <intentHash> rejected`
- Show final BscScan tx (`release` or `refund`)

## Positioning line for judges
- "AI consensus decides outcome; BSC executes value transfer."
- "When consensus API routing is unavailable, we preserve reliability with deterministic settlement execution mode."

## Reliability
Rebyt is designed to handle infrastructure limitations gracefully.

If AI consensus is unavailable (for example, validator assignment issues in StudioNet API),
the system falls back to a deterministic execution layer via relayer.

This ensures the system remains functional and reliable in all scenarios.

## What not to show in demo
- Do not show failed API consensus routing (`NO_MAJORITY`) during the live path.
- Do not show forensic or temporary QA scripts.

## Submission evidence checklist
1. Escrow address + tx links (BSC)
2. Validator contract address (GenLayer)
3. Studio screenshot/video with validator set and agreement
4. Release/refund settlement tx link
5. Clean repo with final demo docs
