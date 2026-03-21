/**
 * deploy-validator.mjs
 *
 * Deploys a GenLayer validator contract (default: DeliveryValidator.py) to StudioNet.
 * Prints the new contract address and optionally writes it to .env.
 *
 * Usage:
 *   node scripts/deploy-validator.mjs
 *   GENLAYER_CONTRACT_FILE=DeliveryValidator.py node scripts/deploy-validator.mjs
 *
 * Reads: GENLAYER_RPC, SOLVER_PRIVATE_KEY from .env
 * Writes: GENLAYER_CONTRACT_ADDRESS to .env if deployment succeeds
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Config ──────────────────────────────────────────────────────────────────
const GENLAYER_RPC = process.env.GENLAYER_RPC || 'https://studio.genlayer.com/api';
const privateKey = process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const GENLAYER_CONTRACT_FILE = process.env.GENLAYER_CONTRACT_FILE || 'DeliveryValidator.py';

if (!privateKey) {
  console.error('Missing SOLVER_PRIVATE_KEY in .env');
  process.exit(1);
}

const contractPath = path.join(ROOT, 'genlayer', GENLAYER_CONTRACT_FILE);
if (!fs.existsSync(contractPath)) {
  console.error(`${GENLAYER_CONTRACT_FILE} not found at`, contractPath);
  process.exit(1);
}

// Read contract source
const contractCode = fs.readFileSync(contractPath, 'utf8');

const log = (msg) => console.log(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${msg}`);

// ── Client ──────────────────────────────────────────────────────────────────
log(`Connecting to GenLayer StudioNet at ${GENLAYER_RPC}`);
log(`Deploying as: ${createAccount(privateKey).address}`);

const client = createClient({
  chain: studionet,
  account: createAccount(privateKey),
});

// ── Deploy ──────────────────────────────────────────────────────────────────
async function main() {
  log('Submitting deployContract transaction...');
  log(`Contract size: ${contractCode.length} bytes`);

  let txHash;
  try {
    txHash = await client.deployContract({
      code: contractCode,
      args: [],
      kwargs: {},
      leaderOnly: false,
    });
  } catch (err) {
    console.error('deployContract failed:', err.message || err);
    process.exit(1);
  }

  log(`Deploy tx hash: ${txHash}`);
  log('Waiting for consensus (this may take 30-120s)...');

  // Poll for transaction receipt
  let receipt;
  const MAX_ATTEMPTS = 40;
  const POLL_INTERVAL_MS = 5000;

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const tx = await client.getTransaction({ hash: txHash });
      const statusStr = String(tx.status || tx.statusName || '');
      log(`[${i}/${MAX_ATTEMPTS}] status: ${statusStr}`);

      // GenLayer statuses: PENDING=0, ACTIVATED=1, FINALIZED=2+ or ACCEPTED
      const finalized = ['FINALIZED', 'ACCEPTED', 'COMMITTED'].some(
        (s) => statusStr.toUpperCase().includes(s)
      ) || Number(statusStr) >= 2;

      if (finalized) {
        receipt = tx;
        break;
      }
    } catch (err) {
      log(`[${i}/${MAX_ATTEMPTS}] poll error: ${err.message}`);
    }
  }

  if (!receipt) {
    console.error('Timed out waiting for deployment to finalize. Check the tx hash manually:');
    console.error(`  TX: ${txHash}`);
    console.error('  RPC:', GENLAYER_RPC);
    process.exit(1);
  }

  log('Transaction finalized. Extracting contract address...');

  // Try multiple fields where GenLayer SDK may put the contract address
  const contractAddress =
    receipt.to ||
    receipt.to_address ||
    receipt.data?.to ||
    receipt.data?.to_address ||
    receipt.contractAddress ||
    receipt.contract_address ||
    receipt.data?.contractAddress ||
    receipt.data?.contract_address;

  if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
    console.error('Could not extract contract address from receipt. Full receipt:');
    console.error(JSON.stringify(receipt, null, 2));
    console.error('\nCheck the tx on StudioNet explorer. TX hash:', txHash);
    process.exit(1);
  }

  log(`\n✅ ${GENLAYER_CONTRACT_FILE} deployed!`);
  log(`   Contract address: ${contractAddress}`);
  log(`   TX hash:          ${txHash}`);

  // ── Update .env ──────────────────────────────────────────────────────────
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    const oldMatch = envContent.match(/^GENLAYER_CONTRACT_ADDRESS=.*/m);
    if (oldMatch) {
      const oldAddress = oldMatch[0].replace('GENLAYER_CONTRACT_ADDRESS=', '');
      envContent = envContent.replace(
        /^GENLAYER_CONTRACT_ADDRESS=.*/m,
        `GENLAYER_CONTRACT_ADDRESS=${contractAddress}`
      );
      log(`   .env updated: ${oldAddress} → ${contractAddress}`);
    } else {
      envContent += `\nGENLAYER_CONTRACT_ADDRESS=${contractAddress}\n`;
      log('   GENLAYER_CONTRACT_ADDRESS added to .env');
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
  } else {
    log('   No .env file found — print address below and set manually:');
  }

  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`GENLAYER_CONTRACT_ADDRESS=${contractAddress}`);
  console.log('─────────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
