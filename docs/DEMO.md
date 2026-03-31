# Apolo — Public Demo Flow

Follow these exact steps to run a public demo of Apolo. The goal is to show a complete lifecycle: from the front-end SLA creation, to funds being locked in the BNB Chain escrow, to our Relayer node finally releasing the payment based on off-chain validation.

## 1. Local Requirements Configuration
1. Ensure all environment variables are properly set in the `.env` file (`PRIVATE_KEY`, `ESCROW_CONTRACT_ADDRESS`, `BSC_RPC`).
2. Have two terminal windows ready.
3. Open [BSCScan Explorer](https://bscscan.com/) tracking the escrow address: `0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d`.

## 2. Start the Local Demo

### Terminal 1 (Solver / Relayer Server)
We need our backend node constantly tracking our intent:
```bash
npm install
npm run solver
```

### Terminal 2 (Frontend Demo UI)
```bash
cd frontend
npm install
npm run dev
```

---

## 🎬 3. Live Demo Script (What to show on screen)

### A. Landing Page & Creation 
1. Open the UI at `http://localhost:5173`.
2. Connect your browser wallet (e.g. MetaMask on BNB Mainnet).
3. Fill out the **SLA Condition**: `"API returns HTTP 200"`.
4. Fill out the **Evidence URL**: `https://httpbin.org/get`.
5. Click **Lock Funds**. Explain that this step signs an EIP-712 intent and securely forwards the deposit to our ESCROW contract on BNB Mainnet.

### B. Verification On-Chain 
1. Switch your screen to the **Solver Terminal** output to see it register the intent (`FUNDED`).
2. Switch your screen to **BSCScan**. Open the newest transaction to the `ApoloEscrow` contract address. 
3. Explicitly point out to judges: *"The funds are now cryptographically locked on BNB Mainnet under our SLA intent."*

### C. Trigger Settlement (The Relayer)
Normally, an off-chain verifier network handles the SLA checking process. For the sake of testnet stability and speed in this demo, Apolo V1 uses a Trusted Relayer to execute the verification and trigger settlement.
1. Copy the `intentHash` logged in the Solver Terminal.
2. In a third terminal window, run the relayer in "manual approved" mode to execute settlement:
```bash
npm run relayer <INTENT_HASH> approved
```
*(Example: `npm run relayer 0x123...abc approved`)*

3. **Show the Relayer logs/metrics** correctly broadcasting the *Release* command and metric increment.

### D. Final BSCScan Proof
1. Switch your screen back to **BSCScan**. 
2. Show the newly processed internal transaction triggered by the Relayer.
3. Point out that the funds have automatically been released to the developer's address, perfectly completing our trust-minimized, outcome-based payment process!
