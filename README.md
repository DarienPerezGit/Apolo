# Apolo — AI-Verified SLA Escrow on BNB Chain

> **Deploy. Get paid when it works.**

Apolo is an automated bounty and escrow system for API and operational work verification. It locks funds securely on the BNB Chain and automatically releases them when verifiable conditions are met. 

---

🔥 **[Live Demo on Vercel](https://project-apolo.vercel.app/)**  

💼 **[ApoloEscrow Contract on BSCScan](https://testnet.bscscan.com/address/0x5191bca416e2de8dd7915bdd55bf625143abb98c)**

✅ **Real Transaction Proofs (BSC Testnet)**  
- **Fund TX (Funds Locked):** [0x98f5ae6cc8ba...](https://testnet.bscscan.com/tx/0x98f5ae6cc8ba95e139d5b5c4ce54822c7c4074f0ff75bacb7774d7645cfec453)
- **Release TX (Settlement):** [0x386dea5bda30...](https://testnet.bscscan.com/tx/0x386dea5bda30cef5a651ef259af24a8bf358afb8cb2f2e9a7a3a6dc6cdd1b9bc)
- *Refund TX (Example): [0xdf72daa0...](https://testnet.bscscan.com/tx/0xdf72daa0b6c1d3a2d17cfbb02fbf8f72f3310f236e1fda8a9e4d4fd3f8ad0190)*

---

## ⏱️ Quick Demo (2 min)

To see Apolo working locally:
1. `npm install && cd frontend && npm install`
2. **Terminal 1:** Run `npm run solver`
3. **Terminal 2:** Run `cd frontend && npm run dev`, open `http://localhost:5173`
4. Fill intent details, click **Lock Funds**.
5. Once BSC testnet locks the funds, simulate relayer settlement in **Terminal 3**:
   `npm run relayer <INTENT_HASH> approved`
6. Done! Watch the terminal output and BSCScan to see your funds automatically released.

---

## 🏆 What It Is
Apolo is a verifiable bank-account layer for the Agentic Economy. It allows developers and clients to create SLAs (Service Level Agreements) backed by real funds. The client locks up funds, an external validation process checks the SLA, and if successful, the funds are automatically released. 

## 🧠 How It Works

![Apolo Architecture](docs/assets/Apolo%20SLA%20Escrow%20Flow.png)

```text
1. Client locks funds in escrow (BSC Testnet)
      ↓
2. Off-chain verification checks the SLA condition (API uptime / response / evidence)
      ↓
3. Trusted relayer triggers settlement on-chain
      ↓
4. Funds are released or refunded automatically
```

## 🔒 Trust Model (V1)
In V1, **Apolo uses a Trusted Relayer model**. 
The relayer node is a critical component that acts as the bridge between off-chain consensus (or AI Validation) and on-chain execution. Instead of forcing heavy verification on-chain, the trusted relayer executes the outcome on the BSC Testnet. This enables an immediate, simple, and reliable MVP for verifying operational work.

## 🛠 Tech Stack

| Layer | Tech |
|---|---|
| Smart Contracts | Solidity 0.8.20 + Foundry |
| Chain | BSC Testnet (Chain ID: 97) |
| Signing | viem + EIP-712 |
| Frontend | React + Vite |
| Relayer | Node.js (ESM) |

## 📄 License
MIT
