import 'dotenv/config';
import express from 'express';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';

const PORT = Number(process.env.SOLVER_PORT || 3001);
const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS || '0xc065d530eAb19955EedC11BD51920625100B3a6A';
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545';
const privateKey = process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!privateKey) {
  throw new Error('Missing env var: SOLVER_PRIVATE_KEY (or PRIVATE_KEY)');
}

const escrowAbi = parseAbi([
  'function fund(bytes32 intentHash, uint256 amount) external payable'
]);

const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({
  account,
  chain: bscTestnet,
  transport: http(BSC_TESTNET_RPC)
});
const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(BSC_TESTNET_RPC)
});

const app = express();
app.use(express.json());
app.use((_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options('/intent', (_, res) => res.sendStatus(204));

app.post('/intent', async (req, res) => {
  try {
    const { intentHash, intent } = req.body || {};
    const amountWei = intent?.amountWei;

    if (!intentHash || typeof intentHash !== 'string') {
      return res.status(400).json({ error: 'intentHash is required' });
    }

    if (!amountWei) {
      return res.status(400).json({ error: 'intent.amountWei is required' });
    }

    const normalizedIntentHash = intentHash.startsWith('0x') ? intentHash : `0x${intentHash}`;
    if (!/^0x[a-fA-F0-9]{64}$/.test(normalizedIntentHash)) {
      return res.status(400).json({ error: 'intentHash must be bytes32 hex string' });
    }

    const parsedAmount = BigInt(amountWei);
    const txHash = await walletClient.writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: escrowAbi,
      functionName: 'fund',
      args: [normalizedIntentHash, parsedAmount],
      value: parsedAmount
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return res.json({
      txHash,
      status: receipt.status,
      bscScanUrl: `https://testnet.bscscan.com/tx/${txHash}`
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Solver server listening on http://localhost:${PORT}`);
});
