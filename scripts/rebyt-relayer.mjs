import 'dotenv/config';
import { createClient as createGenLayerClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';

const requiredEnv = [
  'ESCROW_CONTRACT_ADDRESS',
  'GENLAYER_CONTRACT_ADDRESS',
  'BSC_TESTNET_RPC'
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

const escrowAbi = parseAbi([
  'function release(bytes32 intentHash) external',
  'function refund(bytes32 intentHash) external',
  'function markValidating(bytes32 intentHash) external',
  'function getIntent(bytes32 intentHash) external view returns ((address recipient,uint256 amount,uint8 state,uint256 fundedAt,uint256 settledAt))'
]);

const account = privateKeyToAccount(privateKey);

const walletClient = createWalletClient({
  account,
  chain: bscTestnet,
  transport: http(process.env.BSC_TESTNET_RPC)
});

const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(process.env.BSC_TESTNET_RPC)
});

const genlayerClient = createGenLayerClient({
  chain: testnetBradbury,
  endpoint: process.env.GENLAYER_RPC
});

function logStep(message, payload = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, payload);
}

async function getGenLayerValidation(intentHash) {
  try {
    const rawResult = await genlayerClient.readContract({
      address: process.env.GENLAYER_CONTRACT_ADDRESS,
      functionName: 'getResult',
      args: [intentHash]
    });
    if (typeof rawResult === 'boolean') {
      return rawResult;
    }

    if (typeof rawResult === 'string') {
      const normalized = rawResult.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }

    throw new Error(`Unexpected getResult response type: ${JSON.stringify(rawResult)}`);
  } catch (error) {
    if (process.env.RELAYER_VALIDATION_RESULT_FALLBACK) {
      const fallback = process.env.RELAYER_VALIDATION_RESULT_FALLBACK.toLowerCase() === 'true';
      logStep('Using RELAYER_VALIDATION_RESULT_FALLBACK due to GenLayer read error', {
        intentHash,
        fallback,
        reason: error.message
      });
      return fallback;
    }

    throw new Error(`GenLayer getResult failed: ${error.message}`);
  }
}

async function settleIntent(intentHash) {
  const intent = await publicClient.readContract({
    address: process.env.ESCROW_CONTRACT_ADDRESS,
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

  logStep('Polling validation result', { intentHash });
  const result = await getGenLayerValidation(intentHash);
  logStep('Validation result fetched', { intentHash, result });

  if (state === 1) {
    await walletClient.writeContract({
      address: process.env.ESCROW_CONTRACT_ADDRESS,
      abi: escrowAbi,
      functionName: 'markValidating',
      args: [intentHash]
    });
  }

  const functionName = result ? 'release' : 'refund';

  const txHash = await walletClient.writeContract({
    address: process.env.ESCROW_CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName,
    args: [intentHash]
  });

  logStep('Settlement transaction sent', {
    intentHash,
    action: functionName,
    txHash,
    bscScanUrl: `https://testnet.bscscan.com/tx/${txHash}`
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  logStep('Settlement transaction confirmed', {
    intentHash,
    action: functionName,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status
  });

  return {
    intentHash,
    result,
    action: functionName,
    txHash,
    status: receipt.status
  };
}

const intentHash = process.argv[2];

if (!intentHash) {
  throw new Error('Usage: node scripts/rebyt-relayer.mjs <intentHash>');
}

settleIntent(intentHash)
  .then((output) => {
    logStep('Relayer completed', output);
  })
  .catch((error) => {
    logStep('Relayer failed', { error: error.message });
    process.exit(1);
  });
