import 'dotenv/config';
import { createAccount as createGenLayerAccount, createClient as createGenLayerClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { trackMetric } from './metrics.mjs';

const requiredEnv = [
  'ESCROW_CONTRACT_ADDRESS',
  'BSC_RPC'
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing env var: ${key}`);
  }
}

const privateKey = process.env.PRIVATE_KEY || process.env.SOLVER_PRIVATE_KEY;
if (!privateKey) {
  throw new Error('Missing env var: PRIVATE_KEY (or SOLVER_PRIVATE_KEY fallback)');
}

const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS;
const BSC_RPC = process.env.BSC_RPC;
const DEFAULT_EVIDENCE_URL = process.env.GENLAYER_EVIDENCE_URL ?? '';
const MANUAL_VALIDATION_RESULT = process.env.MANUAL_VALIDATION_RESULT ?? '';
const MANUAL_VALIDATION_TX_HASH = process.env.MANUAL_VALIDATION_TX_HASH ?? '';
const ENABLE_GENLAYER_ANCHORING = (process.env.ENABLE_GENLAYER_ANCHORING ?? 'true').toLowerCase() !== 'false';

const escrowAbi = parseAbi([
  'function release(bytes32 intentHash) external',
  'function refund(bytes32 intentHash) external',
  'function markValidating(bytes32 intentHash) external',
  'function getIntent(bytes32 intentHash) external view returns ((address recipient,uint256 amount,uint8 state,uint256 fundedAt,uint256 settledAt))'
]);

const account = privateKeyToAccount(privateKey);

const walletClient = createWalletClient({
  account,
  chain: bsc,
  transport: http(BSC_RPC)
});

const publicClient = createPublicClient({
  chain: bsc,
  transport: http(BSC_RPC)
});

const genlayerClient = createGenLayerClient({
  chain: studionet,
  account: createGenLayerAccount(privateKey)
});

function logStep(message, payload = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, payload);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function unixTimestamp() {
  return Math.floor(Date.now() / 1000);
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

async function getGenLayerValidation(intentHash, condition = '') {
  let lastError;
  let sawFalse = false;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    logStep(`getResult attempt ${attempt}/30...`, { intentHash, condition });

    try {
      const rawResult = await genlayerClient.readContract({
        address: GENLAYER_CONTRACT_ADDRESS,
        functionName: 'getResult',
        args: [intentHash]
      });

      if (typeof rawResult === 'boolean') {
        if (rawResult === true) {
          return true;
        }
        sawFalse = true;
        if (attempt < 30) {
          logStep('getResult returned false; waiting for potential final consensus...', {
            intentHash,
            condition,
            attempt
          });
          await sleep(5000);
          continue;
        }
        return false;
      }

      if (typeof rawResult === 'string') {
        const normalized = rawResult.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') {
          sawFalse = true;
          if (attempt < 30) {
            logStep('getResult returned "false"; waiting for potential final consensus...', {
              intentHash,
              condition,
              attempt
            });
            await sleep(5000);
            continue;
          }
          return false;
        }
      }

      throw new Error(`Unexpected getResult response type: ${JSON.stringify(rawResult)}`);
    } catch (error) {
      lastError = error;
      if (attempt < 30) {
        await sleep(5000);
      }
    }
  }

  if (sawFalse) {
    return false;
  }

  throw new Error(`GenLayer getResult failed after 30 attempts: ${lastError?.message ?? 'unknown error'}`);
}

async function triggerGenLayerValidation(intentHash, condition, evidenceUrl) {
  if (!condition || typeof condition !== 'string') {
    throw new Error('Missing SLA condition for GenLayer validate()');
  }

  if (typeof evidenceUrl !== 'string') {
    throw new Error('Invalid evidenceUrl for GenLayer validate()');
  }

  logStep('Submitting SLA verification request to GenLayer', {
    intentHash,
    condition,
    evidenceUrl,
    contract: GENLAYER_CONTRACT_ADDRESS
  });

  const validateTxHash = await genlayerClient.writeContract({
    address: GENLAYER_CONTRACT_ADDRESS,
    functionName: 'validate',
    args: [intentHash, condition, evidenceUrl]
  });

  logStep('GenLayer validate transaction sent', {
    intentHash,
    validateTxHash
  });

  return validateTxHash;
}

async function anchorConsensusOnGenLayer({ intentHash, approved, validateTxHash }) {
  if (!ENABLE_GENLAYER_ANCHORING) {
    return '';
  }

  const anchorTxHash = await genlayerClient.writeContract({
    address: GENLAYER_ANCHOR_CONTRACT_ADDRESS,
    functionName: 'recordConsensus',
    args: [
      intentHash,
      approved,
      'ACCEPTED',
      'PENDING',
      validateTxHash || '',
      BigInt(unixTimestamp())
    ]
  });

  logStep('GenLayer consensus anchored', {
    intentHash,
    approved,
    anchorTxHash,
    contract: GENLAYER_ANCHOR_CONTRACT_ADDRESS,
    genExplorerUrl: `https://explorer-bradbury.genlayer.com/tx/${anchorTxHash}`
  });

  return anchorTxHash;
}

async function anchorFinalityOnGenLayer({ intentHash }) {
  if (!ENABLE_GENLAYER_ANCHORING) {
    return '';
  }

  const finalityTxHash = await genlayerClient.writeContract({
    address: GENLAYER_ANCHOR_CONTRACT_ADDRESS,
    functionName: 'recordFinality',
    args: [intentHash, 'CONFIRMED', BigInt(unixTimestamp())]
  });

  logStep('GenLayer finality confirmed', {
    intentHash,
    finalityTxHash,
    contract: GENLAYER_ANCHOR_CONTRACT_ADDRESS,
    genExplorerUrl: `https://explorer-bradbury.genlayer.com/tx/${finalityTxHash}`
  });

  return finalityTxHash;
}

export async function settleIntent(intentHash, validationContext = {}) {
  const {
    condition = '',
    evidenceUrl = DEFAULT_EVIDENCE_URL,
    manualResult = parseManualValidationResult(MANUAL_VALIDATION_RESULT),
    manualValidateTxHash = MANUAL_VALIDATION_TX_HASH
  } = validationContext;

  const intent = await publicClient.readContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName: 'getIntent',
    args: [intentHash]
  });

  const state = Number(intent.state ?? intent[2]);
  if (state === 0) {
    throw new Error('Intent not funded (state=PENDING)');
  }
  if (state === 3 || state === 4) {
    logStep('Intent already settled, skipping settlement', { intentHash, state });
    return {
      intentHash,
      action: state === 3 ? 'release' : 'refund',
      status: 'already-settled'
    };
  }

  let validateTxHash = '';
  let anchorConsensusTxHash = '';
  let anchorFinalityTxHash = '';
  let result;

  if (typeof manualResult === 'boolean') {
    result = manualResult;
    validateTxHash = manualValidateTxHash || '';
    logStep('Using GenLayer-Consensus-Validated result (manual anchor mode)', {
      intentHash,
      result,
      validateTxHash,
      source: 'studio-ui-consensus'
    });
  } else {
    validateTxHash = await triggerGenLayerValidation(intentHash, condition, evidenceUrl);
    logStep('Polling SLA verification result', { intentHash, condition, evidenceUrl, validateTxHash });
    result = await getGenLayerValidation(intentHash, condition);
    logStep('SLA condition verified', { intentHash, condition, evidenceUrl, result });
  }

  try {
    anchorConsensusTxHash = await anchorConsensusOnGenLayer({
      intentHash,
      approved: result,
      validateTxHash
    });
  } catch (error) {
    logStep('GenLayer consensus anchoring skipped (non-blocking)', {
      intentHash,
      error: error.message
    });
  }

  try {
    anchorFinalityTxHash = await anchorFinalityOnGenLayer({ intentHash });
  } catch (error) {
    logStep('GenLayer finality anchoring skipped (non-blocking)', {
      intentHash,
      error: error.message
    });
  }

  if (state === 1) {
    await walletClient.writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
      abi: escrowAbi,
      functionName: 'markValidating',
      args: [intentHash]
    });
  }

  const functionName = result ? 'release' : 'refund';

  const txHash = await walletClient.writeContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName,
    args: [intentHash]
  });

  logStep(`SLA payment ${functionName === 'release' ? 'release' : 'refund'} transaction sent`, {
    intentHash,
    action: functionName,
    txHash,
    bscScanUrl: `https://bscscan.com/tx/${txHash}`
  });

  if (functionName === 'release') {
    trackMetric('settled', intent[1].toString());
  } else {
    trackMetric('refunded', intent[1].toString());
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  logStep('SLA payment settlement confirmed', {
    intentHash,
    action: functionName,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status
  });

  return {
    intentHash,
    validateTxHash,
    anchorConsensusTxHash,
    anchorFinalityTxHash,
    result,
    action: functionName,
    txHash,
    status: receipt.status
  };
}

if (process.argv[1] && process.argv[1].includes('apolo-relayer.mjs')) {
  const intentHash = process.argv[2];
  const cliDecision = process.argv[3];

  if (!intentHash) {
    throw new Error('Usage: node scripts/apolo-relayer.mjs <SLAIntentHash> [approved|rejected]');
  }

  const manualResultFromCli = cliDecision ? parseManualValidationResult(cliDecision) : null;

  settleIntent(intentHash, { manualResult: manualResultFromCli })
    .then((output) => {
      logStep('Relayer completed', output);
    })
    .catch((error) => {
      logStep('Relayer failed', { error: error.message });
      process.exit(1);
    });
}
