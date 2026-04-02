/**
 * qa-a2a-case-study.mjs
 *
 * End-to-end case study runner for Apolo V1.5 External Agent.
 * Orchestrates: fund → A2A agent task → settlement → proof report.
 *
 * Prerequisites:
 *   node scripts/apolo-server.mjs     (port 3001)
 *   python agent-a2a/__main__.py      (port 8080)
 *
 * Usage:
 *   node scripts/qa-a2a-case-study.mjs
 *   node scripts/qa-a2a-case-study.mjs https://custom-sla-url.com/health
 */

import 'dotenv/config';
import crypto from 'node:crypto';

const SOLVER_URL = process.env.SOLVER_URL || 'http://localhost:3001';
const AGENT_URL  = process.env.AGENT_URL  || 'http://localhost:8080';
const SLA_URL    = process.argv[2]        || 'https://httpbin.org/status/200';
const AMOUNT_WEI = '100000000000000'; // 0.0001 BNB

function requestHeaders(url) {
  const headers = { 'Content-Type': 'application/json' };
  if (url.includes('ngrok-free.dev') || url.includes('ngrok-free.app')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  return headers;
}

function randomIntentHash() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

function line(char = '─', n = 62) {
  return char.repeat(n);
}

function printSection(title) {
  console.log('\n' + line('='));
  console.log(`  ${title}`);
  console.log(line('='));
}

async function checkServiceReady(url, name) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.ok || resp.status < 500) return true;
  } catch (_) {}
  console.error(`❌ ${name} not reachable at ${url}`);
  console.error(`   Start it first, then re-run this script.`);
  return false;
}

async function fundEscrow(intentHash) {
  const resp = await fetch(`${SOLVER_URL}/intent`, {
    method: 'POST',
    headers: requestHeaders(SOLVER_URL),
    body: JSON.stringify({
      intentHash,
      defer: true, // skip auto-settlement — agent will settle
      intent: {
        amountWei: AMOUNT_WEI,
        condition: 'HTTP endpoint returns 200',
        evidenceUrl: SLA_URL,
      },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Fund failed (${resp.status}): ${err}`);
  }
  return resp.json();
}

async function sendTaskToAgent(intentHash) {
  const messageId = `msg-${Date.now()}`;
  const taskId    = `task-${Date.now()}`;

  const payload = {
    jsonrpc: '2.0',
    id: taskId,
    method: 'message/send',
    params: {
      message: {
        role: 'user',
        messageId,
        parts: [
          {
            kind: 'data',
            data: {
              intentHash,
              slaUrl: SLA_URL,
              expectedStatus: 200,
              checksRequired: 3,
              solverUrl: SOLVER_URL,
            },
          },
        ],
      },
    },
  };

  const resp = await fetch(AGENT_URL, {
    method: 'POST',
    headers: requestHeaders(AGENT_URL),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Agent task failed (${resp.status}): ${err}`);
  }

  const body = await resp.json();
  return parseAgentResponse(body);
}

function parseAgentResponse(body) {
  const report = { text: [], data: null };
  try {
    const task = body?.result || {};

    if (task.kind === 'message') {
      for (const part of task.parts || []) {
        if (part.kind === 'text' && part.text) report.text.push(part.text);
        if (part.kind === 'data' && part.data) report.data = part.data;
      }
      return report;
    }

    const allMessages = [
      ...(task.history || []),
      ...(task.status?.message ? [task.status.message] : []),
    ];
    for (const msg of allMessages) {
      for (const part of msg.parts || []) {
        if (part.kind === 'text' && part.text) report.text.push(part.text);
        if (part.kind === 'data' && part.data) report.data = part.data;
      }
    }
    for (const artifact of task.artifacts || []) {
      for (const part of artifact.parts || []) {
        if (part.kind === 'data') report.data = part.data;
      }
    }
  } catch (_) {}
  return report;
}

// ── Main ──────────────────────────────────────────────────────────────────

printSection('APOLO V1.5 — EXTERNAL AGENT CASE STUDY');
console.log(`  Contract:    0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d`);
console.log(`  Chain:       BNB Mainnet (56)`);
console.log(`  Solver:      ${SOLVER_URL}`);
console.log(`  Agent:       ${AGENT_URL}`);
console.log(`  SLA URL:     ${SLA_URL}`);

const solverOk = await checkServiceReady(`${SOLVER_URL}/metrics`, 'Apolo Solver');
const agentOk  = await checkServiceReady(`${AGENT_URL}/.well-known/agent.json`, 'ApoloSLAWatcherAgent');

if (!solverOk || !agentOk) process.exit(1);

const intentHash = randomIntentHash();
console.log(`\n  intentHash:  ${intentHash}`);

// ── Step 1: Fund ─────────────────────────────────────────────────────────
printSection('STEP 1 — FUND ESCROW (defer=true, agent will settle)');

let fundTx = '';
try {
  const fundResult = await fundEscrow(intentHash);
  fundTx = fundResult.txHash || '';
  console.log(`  Fund TX:    ${fundTx}`);
  console.log(`  BSCScan:    https://bscscan.com/tx/${fundTx}`);
  console.log(`  Status:     ✅ confirmed`);
  // wait for confirmation
  await new Promise(r => setTimeout(r, 3000));
} catch (err) {
  console.error(`  ❌ ${err.message}`);
  process.exit(1);
}

// ── Step 2: Agent task ───────────────────────────────────────────────────
printSection('STEP 2 — AGENT TASK (ApoloSLAWatcherAgent)');
console.log(`  Sending task to agent...`);
console.log();

let agentReport = null;
try {
  const { text, data } = await sendTaskToAgent(intentHash);
  for (const t of text) console.log(t);
  agentReport = data;
} catch (err) {
  console.error(`  ❌ Agent task failed: ${err.message}`);
  process.exit(1);
}

// ── Step 3: Proof report ─────────────────────────────────────────────────
printSection('PROOF REPORT — APOLO V1.5 EXTERNAL AGENT CASE STUDY');

const settlement = agentReport?.settlement || {};
const settleTx   = settlement.txHash || '';
const decision   = agentReport?.decision || 'unknown';
const evidence   = agentReport?.evidence || {};
const checks     = evidence.checks || [];

console.log(`  Contract:      0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d`);
console.log(`  Chain:         BNB Mainnet (56)`);
console.log(`  intentHash:    ${intentHash}`);
console.log(`  SLA URL:       ${SLA_URL}`);
console.log(`  Decision:      ${decision.toUpperCase()}`);
console.log(`  Checks:        ${evidence.passed ?? '?'}/${evidence.total ?? '?'} passed`);
if (checks.length) {
  for (const [i, c] of checks.entries()) {
    const icon = c.passed ? '✅' : '❌';
    console.log(`    ${icon} Check ${i+1}: HTTP ${c.status_code} — ${c.latency_ms}ms — ${c.ts}`);
  }
}
console.log();
console.log(`  Action:        ${settlement.action || '?'}`);
console.log(`  Fund TX:       ${fundTx}`);
console.log(`  Settle TX:     ${settleTx}`);
console.log();
if (fundTx)   console.log(`  Fund link:     https://bscscan.com/tx/${fundTx}`);
if (settleTx) console.log(`  Settle link:   https://bscscan.com/tx/${settleTx}`);
console.log(`  Contract:      https://bscscan.com/address/0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d`);

// Write full report to disk
const { writeFileSync } = await import('node:fs');
const reportPath = 'agent-report.json';
writeFileSync(reportPath, JSON.stringify({
  intentHash,
  contractAddress: '0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d',
  chainId: 56,
  slaUrl: SLA_URL,
  decision,
  evidence,
  settlement: {
    action: settlement.action || '',
    txHash: settleTx,
    bscScanUrl: settleTx ? `https://bscscan.com/tx/${settleTx}` : '',
  },
  links: {
    fund:     fundTx   ? `https://bscscan.com/tx/${fundTx}`   : '',
    settle:   settleTx ? `https://bscscan.com/tx/${settleTx}` : '',
    contract: `https://bscscan.com/address/0x055ad3F93Cca3B7df30a9C11AD37EBBe8b41cd4d`,
  },
  generatedAt: new Date().toISOString(),
}, null, 2));
console.log();
console.log(`  Full report:   ${reportPath}`);

printSection('DONE — Apolo V1.5 External Agent Case Study Complete');

if (!settleTx) {
  console.log('  ⚠️  No settlement TX captured. Check agent and solver logs.');
  process.exit(1);
}
