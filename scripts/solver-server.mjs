import 'dotenv/config';
import express from 'express';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';
import { settleIntent } from './rebyt-relayer.mjs';

const PORT = Number(process.env.SOLVER_PORT || 3001);
const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS || '0xc065d530eAb19955EedC11BD51920625100B3a6A';
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545';
const privateKey = process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!privateKey) {
  throw new Error('Missing env var: SOLVER_PRIVATE_KEY (or PRIVATE_KEY)');
}

const escrowAbi = parseAbi([
  'function fund(bytes32 intentHash, uint256 amount) external payable',
  'function getIntent(bytes32 intentHash) external view returns ((address recipient,uint256 amount,uint8 state,uint256 fundedAt,uint256 settledAt))'
]);

const intentStateLabels = ['PENDING', 'FUNDED', 'VALIDATING', 'RELEASED', 'REFUNDED'];
const intentRuntime = new Map();
const GENLAYER_EXPLORER_BASE_URL = process.env.GENLAYER_EXPLORER_BASE_URL || 'https://explorer-bradbury.genlayer.com';

function normalizeIntentHash(intentHash) {
  if (!intentHash || typeof intentHash !== 'string') return '';
  const normalized = intentHash.startsWith('0x') ? intentHash : `0x${intentHash}`;
  return /^0x[a-fA-F0-9]{64}$/.test(normalized) ? normalized : '';
}

function mapOnchainStatus(stateCode) {
  return intentStateLabels[stateCode] || 'UNKNOWN';
}

async function readOnchainIntentStatus(intentHash) {
  const data = await publicClient.readContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName: 'getIntent',
    args: [intentHash]
  });

  const stateCode = Number(data.state ?? data[2]);
  const status = mapOnchainStatus(stateCode);

  return { stateCode, status };
}

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
    const { intentHash, intent, signer, setupMode } = req.body || {};
    const amountWei = intent?.amountWei;
    const deliveryCondition = intent?.condition || '';
    const evidenceUrl = intent?.evidenceUrl || process.env.GENLAYER_EVIDENCE_URL || 'https://example.com';

    if (!intentHash || typeof intentHash !== 'string') {
      return res.status(400).json({ error: 'intentHash is required' });
    }
    if (!amountWei) {
      return res.status(400).json({ error: 'intent.amountWei is required' });
    }

    const normalizedIntentHash = normalizeIntentHash(intentHash);
    if (!normalizedIntentHash) {
      return res.status(400).json({ error: 'intentHash must be bytes32 hex string' });
    }

    const parsedAmount = BigInt(amountWei);
    console.log('[solver] funding intent', {
      intentHash: normalizedIntentHash,
      signer,
      setupMode
    });

    const txHash = await walletClient.writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: escrowAbi,
      functionName: 'fund',
      args: [normalizedIntentHash, parsedAmount],
      value: parsedAmount
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    intentRuntime.set(normalizedIntentHash, {
      status: 'FUNDED',
      escrowTxHash: txHash,
      settlementTxHash: '',
      updatedAt: Date.now(),
      error: ''
    });

    void (async () => {
      try {
        intentRuntime.set(normalizedIntentHash, {
          ...intentRuntime.get(normalizedIntentHash),
          status: 'VALIDATING',
          updatedAt: Date.now()
        });

        const settlement = await settleIntent(normalizedIntentHash, {
          condition: deliveryCondition,
          evidenceUrl
        });
        intentRuntime.set(normalizedIntentHash, {
          ...intentRuntime.get(normalizedIntentHash),
          status: settlement.action === 'release' ? 'RELEASED' : 'REFUNDED',
          settlementTxHash: settlement.txHash || '',
          anchorConsensusTxHash: settlement.anchorConsensusTxHash || '',
          anchorFinalityTxHash: settlement.anchorFinalityTxHash || '',
          updatedAt: Date.now(),
          error: ''
        });
      } catch (error) {
        intentRuntime.set(normalizedIntentHash, {
          ...intentRuntime.get(normalizedIntentHash),
          status: 'ERROR',
          updatedAt: Date.now(),
          error: error.message
        });
      }
    })();

    return res.json({
      txHash,
      status: receipt.status,
      bscScanUrl: `https://testnet.bscscan.com/tx/${txHash}`
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/intent/:hash/status', async (req, res) => {
  try {
    const normalizedIntentHash = normalizeIntentHash(req.params.hash);
    if (!normalizedIntentHash) {
      return res.status(400).json({ error: 'intentHash must be bytes32 hex string' });
    }

    const runtime = intentRuntime.get(normalizedIntentHash) || {
      status: 'UNKNOWN',
      escrowTxHash: '',
      settlementTxHash: '',
      anchorConsensusTxHash: '',
      anchorFinalityTxHash: '',
      error: ''
    };

    const onchain = await readOnchainIntentStatus(normalizedIntentHash);
    const effectiveStatus = runtime.status === 'VALIDATING' ? 'VALIDATING' : onchain.status;

    return res.json({
      intentHash: normalizedIntentHash,
      status: effectiveStatus,
      stateCode: onchain.stateCode,
      escrowTxHash: runtime.escrowTxHash,
      settlementTxHash: runtime.settlementTxHash,
      anchorConsensusTxHash: runtime.anchorConsensusTxHash,
      anchorFinalityTxHash: runtime.anchorFinalityTxHash,
      error: runtime.error,
      links: {
        escrow: runtime.escrowTxHash ? `https://testnet.bscscan.com/tx/${runtime.escrowTxHash}` : '',
        settlement: runtime.settlementTxHash ? `https://testnet.bscscan.com/tx/${runtime.settlementTxHash}` : '',
        genlayerConsensus: runtime.anchorConsensusTxHash ? `${GENLAYER_EXPLORER_BASE_URL}/transactions/${runtime.anchorConsensusTxHash}` : '',
        genlayerFinality: runtime.anchorFinalityTxHash ? `${GENLAYER_EXPLORER_BASE_URL}/transactions/${runtime.anchorFinalityTxHash}` : '',
        genlayer: process.env.GENLAYER_CONTRACT_ADDRESS
          ? `${GENLAYER_EXPLORER_BASE_URL}/address/${process.env.GENLAYER_CONTRACT_ADDRESS}`
          : ''
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Solver server listening on http://localhost:${PORT}`);
});
