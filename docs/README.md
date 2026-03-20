# Rebyt — Intent-Based Payment Infrastructure

Intent-based payment infrastructure where users sign what they want, AI validators evaluate whether delivery conditions were met, and escrow settles automatically.

## Problem
Crypto payments require choosing a network, paying gas fees, and exposing your wallet. The average user can't do this.
Almost the entire market lives on Web2 — not because the tech isn't ready, but because nobody removed the friction.

## Solution
Rebyt turns user intent into verifiable on-chain settlement through four layers:
- Intent: user signs EIP-712 typed data via a session wallet (no direct transaction required)
- Escrow: Solver deposits funds on BSC Testnet
- Validation: GenLayer Bradbury AI validators evaluate whether delivery conditions were met
- Settlement: escrow releases automatically after consensus

## Tech Stack
- EIP-712 intent signing (viem)
- RebytEscrow.sol (Solidity, BSC Testnet)
- DeliveryValidator.py (GenLayer Python SDK, Bradbury)
- rebyt-relayer.mjs (Node.js bridge)
- Demo frontend (React, one page)

## Contract Addresses
- RebytEscrow.sol: [fill after deploy]
- DeliveryValidator.py: [fill after deploy]

## Demo Video
[fill Sunday morning]

## Tracks
- GenLayer track: Intelligent Contract with Optimistic Democracy + Equivalence Principle deployed on Bradbury
- PL Genesis: best overall project
- BNB Chain: deployed on BSC Testnet, EIP-7702 roadmap
