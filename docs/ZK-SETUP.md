# ZK Intent Verification Layer — Setup Guide

## What This Is

A Groth16 ZK proof layer added to Rebyt's escrow. The solver proves:

```
Poseidon(recipient, amount, nonce) == zkHash
```

without revealing the raw inputs on-chain.

**Two-hash architecture:**

| Hash | Algorithm | Used for |
|------|-----------|----------|
| `intentHash` | EIP-712 keccak256 | Main escrow logic (existing) |
| `zkHash` | Poseidon(recipient, amount, nonce) | ZK circuit commitment |

The existing `fund()` function is **untouched**. `fundWithZK()` is the new ZK-aware entry point.

---

## Prerequisites

```bash
# Node.js 18+
npm install                        # installs snarkjs, circomlibjs

# circom compiler (one of these)
npm install -g circom              # via npm
# OR
cargo install --git https://github.com/iden3/circom  # via Rust

# snarkjs CLI
npm install -g snarkjs
```

---

## Step 1: Compile Circuit & Generate Proving Key

```bash
bash circuits/setup.sh
```

This script:
1. Compiles `circuits/intent_hash.circom` → R1CS + WASM
2. Downloads `pot12_final.ptau` from Hermez (pre-trusted, no ceremony)
3. Runs Groth16 setup and one contribution pass
4. Exports `circuits/verification_key.json`
5. Exports `contracts/ZKVerifier.sol` (Solidity verifier, pragma patched to `^0.8.20`)

**Artifacts produced:**
```
circuits/
  intent_hash.r1cs
  intent_hash_js/intent_hash.wasm
  intent_hash_final.zkey
  verification_key.json
contracts/
  ZKVerifier.sol               ← auto-generated, do not edit manually
```

---

## Step 2: Build Contracts

```bash
forge build
```

All four contracts must compile:
- `RebytEscrow.sol`
- `IZKVerifier.sol`
- `MockZKVerifier.sol`
- `ZKVerifier.sol` (after step 1)

---

## Step 3: Generate a Proof

```bash
node scripts/generate-proof.mjs \
  0xa2e036eD6f43baC9c67B6B098E8B006365b01464 \
  100000000000000 \
  1234567890
```

Output:
- `zkHash` (decimal + hex)
- Proof `a`, `b`, `c`
- `publicSignals`
- Copy-paste `cast send` command for `fundWithZK()`

The script sanity-checks that `publicSignals[0] === zkHash` before outputting.

---

## Step 4: Deploy Contracts

```bash
forge script script/DeployRebytEscrow.s.sol \
  --rpc-url $BSC_TESTNET_RPC \
  --broadcast \
  --verify
```

This deploys:
1. `RebytEscrow` with `zkEnabled = false` (backward-compatible mode)
2. `MockZKVerifier` wired as the initial verifier

Update `ESCROW_CONTRACT_ADDRESS` in your `.env` and in `scripts/solver-server.mjs`.

---

## Step 5: Enable ZK (Demo Mode)

### Option A — MockZKVerifier (always-valid, demo fallback)

ZK is already wired. Just flip the flag:

```bash
cast send $ESCROW_ADDRESS \
  "setZKEnabled(bool)" true \
  --rpc-url $BSC_TESTNET_RPC \
  --private-key $PRIVATE_KEY
```

### Option B — Real Groth16 Verifier

Deploy `ZKVerifier.sol` (generated in Step 1):

```bash
forge create contracts/ZKVerifier.sol:Verifier \
  --rpc-url $BSC_TESTNET_RPC \
  --private-key $PRIVATE_KEY
```

Wire it:

```bash
cast send $ESCROW_ADDRESS \
  "setZKVerifier(address)" $ZK_VERIFIER_ADDRESS \
  --rpc-url $BSC_TESTNET_RPC \
  --private-key $PRIVATE_KEY

cast send $ESCROW_ADDRESS \
  "setZKEnabled(bool)" true \
  --rpc-url $BSC_TESTNET_RPC \
  --private-key $PRIVATE_KEY
```

---

## Step 6: Call fundWithZK()

Use the `cast send` command printed by `generate-proof.mjs`. Example:

```bash
cast send $ESCROW_ADDRESS \
  "fundWithZK(bytes32,bytes32,uint256,uint256[2],uint256[2][2],uint256[2],uint256[1])" \
  $INTENT_HASH \
  $ZK_HASH \
  100000000000000 \
  "[a0,a1]" \
  "[[b00,b01],[b10,b11]]" \
  "[c0,c1]" \
  "[publicSignal0]" \
  --value 100000000000000 \
  --rpc-url $BSC_TESTNET_RPC \
  --private-key $PRIVATE_KEY
```

---

## Events to Watch on BSCScan

| Event | When emitted |
|-------|-------------|
| `ZKProofVerified(intentHash, zkHash)` | Proof valid, intent funded |
| `ZKProofFailed(zkHash)` | Proof invalid (revert follows) |
| `Funded(intentHash, amount, timestamp)` | After successful funding |

---

## Backward Compatibility

- `fund()` is **completely unchanged** — solver-server.mjs calls it as before
- `zkEnabled = false` at deploy — ZK layer is opt-in
- If `zkEnabled = false`: `fundWithZK()` skips all proof logic, behaves like `fund()`
- Existing `qa-e2e-intent.mjs` tests pass without modification

---

## Demo Script

```
"We introduce a second cryptographic layer where the solver proves 
correctness of the intent data using zero-knowledge proofs,
without revealing the raw recipient, amount, or nonce on-chain."
```

Demo flow:
1. Show `zkHash` computed from intent inputs
2. Run `generate-proof.mjs` in terminal — proof appears
3. Call `fundWithZK()` with proof 
4. Show `ZKProofVerified` event on BSCScan

---

## Failure Point Reference

| Failure | Mitigation |
|---------|-----------|
| `circom` not found | Run `npm install -g circom` or `cargo install --git ...` |
| ptau download fails | Use fallback URL in setup.sh or download manually from Hermez |
| `ZKVerifier.sol` pragma mismatch | setup.sh patches `^0.6.11` → `^0.8.20` automatically |
| Proof generation slow | ~10–30s is normal for pot12 circuits |
| `publicSignals[0] !== zkHash` | Address conversion bug — script will error and stop |
| Real verifier broken | Deploy `MockZKVerifier` instead; say "in production this is a Groth16 verifier" |
