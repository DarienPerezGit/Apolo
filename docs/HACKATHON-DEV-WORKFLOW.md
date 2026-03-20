# Rebyt Hackathon Dev Workflow (Multi-Agent Gate)

This workflow adds a practical orchestrator gate for development during the hackathon:

1. **Coder Agent** writes implementation.
2. **Validator Agent** checks constraints and originality.
3. **Tester Agent** runs available checks.
4. **Merger Agent** accepts/rejects.
5. If rejected, it loops back to Coder with actionable fixes.

## Files Added

- `.github/agents/rebyt-orchestrator.agent.md`
- `.github/agents/rebyt-coder.agent.md`
- `.github/agents/rebyt-validator.agent.md`
- `.github/agents/rebyt-tester.agent.md`
- `.github/agents/rebyt-merger.agent.md`
- `.github/prompts/run-rebyt-hackathon-workflow.prompt.md`

## How to Run in VS Code

1. Open Chat and type `/`.
2. Select **Run Rebyt Hackathon Workflow**.
3. Paste objective + external reference paths.
4. Let the orchestrator run the loop until `ACCEPTED`.

## Recommended Kickoff Input

Use this as input argument for the prompt:

```
Read these reference files first:
- C:/Users/PC/Proyectos/refs/conditional-payment-cross-border-trade/base-sepolia/src/TradeFinanceEscrow.sol
- C:/Users/PC/Proyectos/refs/conditional-payment-cross-border-trade/base-sepolia/src/GenLayerForexOracle.sol
- C:/Users/PC/Proyectos/refs/conditional-payment-cross-border-trade/contracts/FxBenchmarkOracle.py
- C:/Users/PC/Proyectos/refs/conditional-payment-cross-border-trade/scripts/fx-settlement-relayer.mjs

Then adapt them for Rebyt with fresh implementation only:
- contracts/RebytEscrow.sol on BSC Testnet
- genlayer/DeliveryValidator.py on GenLayer Bradbury
- scripts/rebyt-relayer.mjs connecting both

No copy from pre-hackathon. Keep architecture exactly as documented.
```

## Notes

- This is a **development workflow**, not product runtime behavior.
- The validator catches architectural and policy issues; tester catches execution/tooling failures.
- If tooling is missing (e.g., no `package.json` yet), tester reports gaps and the loop can continue after setup.
