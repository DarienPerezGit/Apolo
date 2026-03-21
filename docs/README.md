# Rebyt — Intent Payments Verified by ZK Proofs and AI Consensus DEMO

![Rebyt Logo](assets/rebyt_logo_isometric_solo.svg)

This project demonstrates an intent-based payment flow on BNB Smart Chain with programmable settlement conditions.

![Rebyt Full Architecture Flow](assets/rebyt_full_architecture_sequence.svg)

Users sign a payment intent offchain.  
Funds are locked in escrow onchain.  
Settlement executes only after conditions are evaluated via GenLayer.

An optional ZK path verifies that the intent data matches the committed hash before funding.

---

## What this demo shows

- EIP-712 intent signing (offchain)
- Escrow funding on BSC Testnet
- ZK proof verification (Groth16)
- Conditional validation using GenLayer (Bradbury)
- Settlement execution (release / refund)

---

## Architecture

Intent → Escrow → Validation → Settlement  
    ↘ ZK verification

---

## How it works

1. User signs a PaymentIntent using EIP-712 typed data  
2. Solver submits a funding transaction to the escrow contract  
3. (Optional) A ZK proof verifies that the intent data matches the committed hash  
4. GenLayer validators evaluate the settlement condition  
5. Escrow releases or refunds funds based on the result  

---

## Contracts

- RebytEscrow.sol (ZK enabled):  
  0x5191Bca416e2De8dD7915bdD55bf625143ABB98C  

- Groth16Verifier:  
  0x5cBC63B27AF1427096C644DdC66B56cf01006A1e  

- DeliveryValidator (GenLayer Bradbury):  
  0xc84ef0aEC4A8b4e5241231296C4a201cb56380C6  

---

## ZK Proof System

The Solver generates a zero-knowledge proof that the intent data matches the committed hash before the escrow accepts funds.

- Circuit: Poseidon(recipient, amount, nonce) == intentHash  
- Proof system: Groth16  
- Verified onchain via: RebytEscrow.fundWithZK()

Example transaction (ZKProofVerified event):  
https://testnet.bscscan.com/tx/0x1bce644f6ac296bbd5a75ffa0b783987d8648355bb4dd912d6cbe8970995ab3e

---

## Demo Flow

Frontend: one-page demo interface

Flow:
- Sign intent (EIP-712)
- Fund escrow (BSC Testnet)
- Observe validation (GenLayer Bradbury)
- Execute settlement (release / refund)

All steps are observable via onchain transactions and explorer links.

---

## Tech Stack

- EIP-712 (intent signing)
- Solidity (escrow contract)
- BNB Smart Chain (testnet)
- GenLayer Bradbury (validation layer)
- Circom 2.2.3 + snarkjs (ZK circuit)
- Groth16 (proof system)
- Node.js (relayer / scripts)
- React (demo frontend)

---

## Bradbury Bug Report

During integration with GenLayer Bradbury, we documented reproducible issues with `gen_call` reliability.

Full report:  
docs/BRADBURY-BUG-REPORT.md

Submitted as part of the Bradbury Special Track.

---

## Tracks

- GenLayer Track  
  Intelligent contract using Optimistic Democracy and Equivalence Principle  

- Bradbury Special Track  
  Bug report with reproducible issues during validator integration  

- PL Genesis  
  Full payment lifecycle: intent → escrow → validation → settlement  

- BNB Chain  
  Deployed on BSC Testnet with ZK verification path  

---

## Demo Video

[fill Sunday morning]

---

## Notes

- Escrow enforces fund custody onchain  
- ZK proof ensures intent data integrity before funding  
- Validation is externalized via GenLayer consensus  
- System remains functional even if validation is asynchronous  

---

## License

MIT