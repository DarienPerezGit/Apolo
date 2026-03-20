# Rebyt

Intent-based payment infrastructure where users sign what they want, AI validators evaluate whether delivery conditions were met, and escrow settles automatically.

## Four Layers

### 1) Intent Layer
- User signs a `PaymentIntent` using EIP-712 typed data.
- Session wallet signs — never sends transactions.
- No direct wallet interaction required.
- No wallet interaction required.

### 2) Escrow Layer
- Solver deposits funds into `RebytEscrow.sol` on BSC Testnet.
- Funds are locked with `intentHash` as reference.
- State machine: `PENDING -> FUNDED -> VALIDATING -> RELEASED`.

The Solver is a trusted off-chain component in this version, responsible for funding escrow and initiating execution. Full signature verification and trust minimization are part of future iterations.

### 3) Validation Layer
The Validation Layer evaluates whether a value transfer request should be executed based on predefined conditions.

In the current implementation, this corresponds to evaluating delivery-related conditions. However, the validation model is intentionally generalized: it determines whether a request to move funds is legitimate.

This evaluation is executed on GenLayer Bradbury testnet using Optimistic Democracy consensus (5 validators running LLM-based evaluation).

The system relies on a developer-defined Equivalence Principle:
- "Two outputs are equivalent if they both agree on whether the value transfer should be approved or rejected, regardless of reasoning."

This ensures convergence on a binary decision while allowing flexible reasoning across validators.

This validation pattern generalizes beyond payment settlement.

Any operation that transfers value — such as releasing escrow funds, distributing tokens from a faucet, or executing automated payouts — can be gated by the same intelligent validation mechanism.

Instead of hardcoding rules, the system evaluates whether each request is legitimate before value is transferred.

This positions the Validation Layer as a reusable primitive for secure value transfer, not just a payment-specific component.

### 4) Settlement Layer
- The Settlement Layer executes the final state transition after validation approval.
- `rebyt-relayer.mjs` reads the validation outcome from GenLayer and triggers the corresponding action on `RebytEscrow.sol` (release or refund).
- All state transitions are conditional on validation approval, ensuring that value transfer is gated by the Validation Layer.
- Every step is verifiable on BscScan + GenLayer explorer.

## Implemented in this submission
- EIP-712 intent signing (reimplemented from scratch)
- `RebytEscrow.sol` on BSC Testnet
- `DeliveryValidator.py` on GenLayer Bradbury
- `rebyt-relayer.mjs` connecting both
- Demo frontend (one page, four status steps)

Full signature verification and trust minimization are part of future iterations.

## Roadmap (not in this submission)
- V2: EIP-7702 session wallet upgrade (BNB Chain Pascal ready)
- V3: Multi-solver competitive network
- V4: GenLayer bot detection layer (anti-drain protection)

## Reference repos studied (not copied)
- github.com/acastellana/conditional-payment-cross-border-trade
- github.com/genlayerlabs/genlayer-project-boilerplate
