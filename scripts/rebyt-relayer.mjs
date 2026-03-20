import 'dotenv/config';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';

const requiredEnv = [
  'PRIVATE_KEY',
  'ESCROW_CONTRACT_ADDRESS',
  'GENLAYER_CONTRACT_ADDRESS',
  'BSC_TESTNET_RPC',
  'GENLAYER_RPC'
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing env var: ${key}`);
  }
}

const escrowAbi = parseAbi([
  'function release(bytes32 intentHash) external',
  'function refund(bytes32 intentHash) external',
  'function markValidating(bytes32 intentHash) external',
  'function getIntent(bytes32 intentHash) external view returns ((address recipient,uint256 amount,uint8 state,uint256 fundedAt,uint256 settledAt))'
]);

const account = privateKeyToAccount(process.env.PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: bscTestnet,
  transport: http(process.env.BSC_TESTNET_RPC)
});

const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(process.env.BSC_TESTNET_RPC)
});

function logStep(message, payload = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, payload);
}

async function getGenLayerValidation(intentHash) {
  const response = await fetch(`${process.env.GENLAYER_RPC}/contracts/${process.env.GENLAYER_CONTRACT_ADDRESS}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'getResult',
      params: [intentHash]
    })
  });

  if (!response.ok) {
    throw new Error(`GenLayer request failed: ${response.status}`);
  }

  const data = await response.json();
  return Boolean(data?.result);
}

async function settleIntent(intentHash) {
  logStep('Polling validation result', { intentHash });
  const result = await getGenLayerValidation(intentHash);
  logStep('Validation result fetched', { intentHash, result });

  await walletClient.writeContract({
    address: process.env.ESCROW_CONTRACT_ADDRESS,
    abi: escrowAbi,
    functionName: 'markValidating',
    args: [intentHash]
  });

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
