import 'dotenv/config';
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const privateKey = process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.GENLAYER_ANCHOR_CONTRACT_ADDRESS || process.env.GENLAYER_CONTRACT_ADDRESS;

if (!privateKey) {
  throw new Error('Missing SOLVER_PRIVATE_KEY (or PRIVATE_KEY fallback)');
}
if (!CONTRACT_ADDRESS) {
  throw new Error('Missing GENLAYER_CONTRACT_ADDRESS (or GENLAYER_ANCHOR_CONTRACT_ADDRESS)');
}

const intentHash = process.argv[2];
if (!intentHash) {
  throw new Error('Usage: node scripts/genlayer-read-record.mjs <intentHash>');
}

const client = createClient({
  chain: studionet,
  account: createAccount(privateKey)
});

const record = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: 'getRecord',
  args: [intentHash]
});

const [exists, approved, consensusStatus, finalityStatus, observedAt, finalizedAt, validationRef] = record;

console.log(JSON.stringify({
  contract: CONTRACT_ADDRESS,
  intentHash,
  exists,
  approved,
  consensusStatus,
  finalityStatus,
  observedAt: observedAt?.toString?.() ?? String(observedAt),
  finalizedAt: finalizedAt?.toString?.() ?? String(finalizedAt),
  validationRef,
  explorerContract: `https://explorer-bradbury.genlayer.com/address/${CONTRACT_ADDRESS}`
}, null, 2));
