import 'dotenv/config';
import express from 'express';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';
import { settleIntent } from './apolo-relayer.mjs';
import { trackMetric } from './metrics.mjs';

const PORT = Number(process.env.SOLVER_PORT || 3001);
const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS || '0xc065d530eAb19955EedC11BD51920625100B3a6A';
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545';
const privateKey = process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!privateKey) {
  throw new Error('Missing env var: SOLVER_PRIVATE_KEY (or PRIVATE_KEY)');
}

if (!process.env.GENLAYER_EVIDENCE_URL && !process.env.MANUAL_VALIDATION_RESULT) {
  console.warn('[solver] WARNING: GENLAYER_EVIDENCE_URL not set and MANUAL_VALIDATION_RESULT not set.');
  console.warn('[solver] GenLayer will receive https://example.com as evidence — likely result: REFUND');
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

function normalizeTxHash(txHash) {
  if (!txHash || typeof txHash !== 'string') return '';
  const normalized = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  return /^0x[a-fA-F0-9]{64}$/.test(normalized) ? normalized : '';
}

function parseManualValidationResult(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (['true', 'yes', 'approved', 'approve', 'release', '1'].includes(normalized)) return true;
  if (['false', 'no', 'rejected', 'reject', 'refund', '0'].includes(normalized)) return false;
  throw new Error(
    `Invalid MANUAL_VALIDATION_RESULT: ${value}. Use one of: approved|rejected|true|false|release|refund`
  );
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
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
      validateTxHash: '',
      updatedAt: Date.now(),
      error: ''
    });

    trackMetric('created', amountWei.toString());

    void (async () => {
      try {
        intentRuntime.set(normalizedIntentHash, {
          ...intentRuntime.get(normalizedIntentHash),
          status: 'VALIDATING',
          updatedAt: Date.now()
        });

        // manualResult: read from env at call time (not module-load time)
        // so restart is not required when .env changes
        const envManual = process.env.MANUAL_VALIDATION_RESULT ?? '';
        const manualResult = parseManualValidationResult(envManual);

        const settlement = await settleIntent(normalizedIntentHash, {
          condition: deliveryCondition,
          evidenceUrl,
          manualResult
        });

        const validateTxHash = normalizeTxHash(settlement.validateTxHash);
        const settlementTxHash = normalizeTxHash(settlement.txHash);
        const anchorConsensusTxHash = normalizeTxHash(settlement.anchorConsensusTxHash);
        const anchorFinalityTxHash = normalizeTxHash(settlement.anchorFinalityTxHash);

        intentRuntime.set(normalizedIntentHash, {
          ...intentRuntime.get(normalizedIntentHash),
          status: settlement.action === 'release' ? 'RELEASED' : 'REFUNDED',
          validateTxHash,
          settlementTxHash,
          anchorConsensusTxHash,
          anchorFinalityTxHash,
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
      validateTxHash: '',
      anchorConsensusTxHash: '',
      anchorFinalityTxHash: '',
      error: ''
    };

    const onchain = await readOnchainIntentStatus(normalizedIntentHash);
    const effectiveStatus = runtime.status === 'VALIDATING' ? 'VALIDATING' : onchain.status;

    const runtimeEscrowTx = normalizeTxHash(runtime.escrowTxHash);
    const runtimeSettlementTx = normalizeTxHash(runtime.settlementTxHash);
    const runtimeValidateTx = normalizeTxHash(runtime.validateTxHash);
    const runtimeConsensusTx = normalizeTxHash(runtime.anchorConsensusTxHash);
    const runtimeFinalityTx = normalizeTxHash(runtime.anchorFinalityTxHash);

    return res.json({
      intentHash: normalizedIntentHash,
      status: effectiveStatus,
      stateCode: onchain.stateCode,
      escrowTxHash: runtimeEscrowTx,
      settlementTxHash: runtimeSettlementTx,
      validateTxHash: runtimeValidateTx,
      anchorConsensusTxHash: runtimeConsensusTx,
      anchorFinalityTxHash: runtimeFinalityTx,
      error: runtime.error,
      links: {
        escrow: runtimeEscrowTx ? `https://testnet.bscscan.com/tx/${runtimeEscrowTx}` : '',
        settlement: runtimeSettlementTx ? `https://testnet.bscscan.com/tx/${runtimeSettlementTx}` : '',
        genlayerValidation: runtimeValidateTx ? `${GENLAYER_EXPLORER_BASE_URL}/tx/${runtimeValidateTx}` : '',
        genlayerConsensus: runtimeConsensusTx ? `${GENLAYER_EXPLORER_BASE_URL}/tx/${runtimeConsensusTx}` : '',
        genlayerFinality: runtimeFinalityTx ? `${GENLAYER_EXPLORER_BASE_URL}/tx/${runtimeFinalityTx}` : '',
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
