import 'dotenv/config';
import crypto from 'node:crypto';
import { createWalletClient, createPublicClient, http, parseAbi, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { settleIntent } from './apolo-relayer.mjs';
import { trackMetric } from './metrics.mjs';

const privateKey = process.env.SOLVER_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error('Missing SOLVER_PRIVATE_KEY/PRIVATE_KEY');
}

const escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS || '0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d';
const bscRpc = process.env.BSC_RPC || 'https://bsc-dataseed.binance.org';

const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({ account, chain: bsc, transport: http(bscRpc) });
const publicClient = createPublicClient({ chain: bsc, transport: http(bscRpc) });

const escrowAbi = parseAbi([
  'function fund(bytes32 intentHash, uint256 amount) external payable'
]);

const BSCSCAN = 'https://bscscan.com';
const SEP = '='.repeat(64);
function banner(msg) { console.log('\n' + SEP + '\n  ' + msg + '\n' + SEP); }
function row(k, v) { console.log('  ' + (k + ':').padEnd(26) + v); }

async function runCycle(num, outcome) {
  banner(`CYCLE ${num} — ${outcome.toUpperCase()} — BNB MAINNET`);

  const intentHash = `0x${crypto.randomBytes(32).toString('hex')}`;
  const amountWei = BigInt(process.env.QA_AMOUNT_WEI || '100000000000000'); // 0.0001 BNB

  row('Intent Hash', intentHash);
  row('Amount',      formatEther(amountWei) + ' BNB');
  row('Relayer',     account.address);
  row('Contract',    escrowAddress);
  row('Network',     'BNB Mainnet (56)');

  banner(`CYCLE ${num} — FUNDING ESCROW`);
  const fundTxHash = await walletClient.writeContract({
    address: escrowAddress, abi: escrowAbi,
    functionName: 'fund', args: [intentHash, amountWei], value: amountWei
  });
  row('Fund TX',  fundTxHash);
  row('BSCScan',  `${BSCSCAN}/tx/${fundTxHash}`);

  const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundTxHash });
  row('Block',  fundReceipt.blockNumber.toString());
  row('Status', fundReceipt.status === 'success' ? '✅ confirmed' : '❌ FAILED');
  if (fundReceipt.status !== 'success') throw new Error(`Fund tx failed on cycle ${num}`);
  trackMetric('created', amountWei.toString());

  banner(`CYCLE ${num} — SETTLING (${outcome})`);
  const settlement = await settleIntent(intentHash, { manualResult: outcome === 'approved' });
  row('Action',    settlement.action);
  row('Settle TX', settlement.txHash || '—');
  if (settlement.txHash) row('BSCScan', `${BSCSCAN}/tx/${settlement.txHash}`);

  return { num, intentHash, fundTxHash, settleTxHash: settlement.txHash, action: settlement.action };
}

async function main() {
  banner('APOLO — 2x BNB MAINNET PROOF RUN');
  row('Contract', escrowAddress);
  row('Relayer',  account.address);
  row('Chain',    'BNB Mainnet (56)');
  const balance = await publicClient.getBalance({ address: account.address });
  row('Balance',  formatEther(balance) + ' BNB');

  // Cycle 1: fund → release (approved)
  const r1 = await runCycle(1, 'approved');

  await new Promise(r => setTimeout(r, 4000));

  // Cycle 2: fund → refund (rejected)
  const r2 = await runCycle(2, 'rejected');

  // ── Final proof report ──────────────────────────────────────────────────
  banner('PROOF REPORT — 2/2 MAINNET CYCLES COMPLETE ✅');
  row('Contract', escrowAddress);
  row('BSCScan',  `${BSCSCAN}/address/${escrowAddress}`);
  row('Relayer',  account.address);
  console.log('');

  for (const r of [r1, r2]) {
    console.log(`  ── Cycle ${r.num} (${r.action.toUpperCase()}) ${'─'.repeat(38)}`);
    row('  intentHash',  r.intentHash);
    row('  Fund TX',     r.fundTxHash);
    row('  Fund link',   `${BSCSCAN}/tx/${r.fundTxHash}`);
    row('  Settle TX',   r.settleTxHash || '—');
    row('  Settle link', r.settleTxHash ? `${BSCSCAN}/tx/${r.settleTxHash}` : '—');
    console.log('');
  }

  const contractBal = await publicClient.getBalance({ address: escrowAddress });
  row('Contract balance', formatEther(contractBal) + ' BNB');

  try {
    const m = await (await fetch('http://localhost:3001/metrics')).json();
    console.log('\n  /metrics:');
    row('  created',         String(m.created));
    row('  settled',         String(m.settled));
    row('  refunded',        String(m.refunded));
    row('  volumeBNB',       m.volumeBNB + ' BNB');
    row('  contractBalance', m.contractBalanceBNB + ' BNB');
  } catch (_) {
    row('  /metrics', 'server not running — start with: node scripts/apolo-server.mjs');
  }

  banner('DONE — Apolo V1 Mainnet Proofs Collected');
}

main().catch(e => { console.error('\n❌ FAILED:', e.message || String(e)); process.exit(1); });
