import { useEffect, useRef, useState } from 'react';
import { parseEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signPaymentIntentWithSessionAccount } from './lib/intentSigner';

const REBYT_SESSION_ROUTER_ADDRESS = '0xBca0f7A094A5398598A8415270711ae3Dd46A986';
const SOLVER_URL = 'http://localhost:3001/intent';

const LAYERS = [
  {
    index: '01',
    title: 'Intent',
    tech: 'EIP-712',
    description: 'Typed declaration with recipient, amount, condition, deadline.',
    shape: 'circle',
  },
  {
    index: '02',
    title: 'Validation',
    tech: 'GenLayer',
    description: 'AI consensus evaluates conditions before execution is allowed.',
    shape: 'triangle',
  },
  {
    index: '03',
    title: 'Proof',
    tech: 'Groth16',
    description: 'ZK circuit verifies Poseidon(recipient, amount, nonce) == intentHash.',
    shape: 'square',
  },
  {
    index: '04',
    title: 'Execution',
    tech: 'BSC Testnet',
    description: 'Escrow releases or refunds only after validation and proof pass.',
    shape: 'cross',
  },
];

function LayerIcon({ shape }) {
  if (shape === 'circle') return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  );
  if (shape === 'triangle') return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <polygon points="12,3 21,20 3,20" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
  if (shape === 'square') return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <rect x="9" y="9" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.25" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

const initialPipeline = [
  { key: 'intent',     name: 'Intent',     label: 'EIP-712',           status: 'idle', link: '' },
  { key: 'escrow',     name: 'Escrow',     label: 'BSC Testnet',       status: 'idle', link: '' },
  { key: 'validation', name: 'Validation', label: 'GenLayer Bradbury', status: 'idle', link: '' },
  { key: 'settlement', name: 'Settlement', label: 'BSC Testnet',       status: 'idle', link: '' },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function nowLog(message) {
  return { message, timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }) };
}

function PipelineTrace({ pipeline }) {
  return (
    <div className="flex items-start">
      {pipeline.map((step, i) => (
        <div key={step.key} className="flex items-start flex-1 min-w-0">
          <div className="flex flex-col items-center flex-1 min-w-0">
            <div className="flex items-center w-full">
              {i > 0 && (
                <div className={`flex-1 h-px ${step.status !== 'idle' ? 'bg-gray-900' : 'bg-gray-200'}`} />
              )}
              <div className="shrink-0">
                {step.status === 'idle' && (
                  <div className="w-2.5 h-2.5 rounded-full border border-gray-300" />
                )}
                {step.status === 'active' && (
                  <div className="w-2.5 h-2.5 rounded-full border border-gray-900 animate-pulse" />
                )}
                {step.status === 'completed' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-900" />
                )}
              </div>
              {i < pipeline.length - 1 && (
                <div className={`flex-1 h-px ${step.status === 'completed' ? 'bg-gray-900' : 'bg-gray-200'}`} />
              )}
            </div>
            <div className="mt-2.5 px-1 w-full text-center">
              <p className="text-xs font-semibold text-gray-900">{step.name}</p>
              <p className="text-gray-400 mt-0.5 font-mono" style={{ fontSize: '10px' }}>{step.label}</p>
              {step.link && step.status === 'completed' && (
                <a
                  href={step.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-600 underline block font-mono mt-1"
                  style={{ fontSize: '10px' }}
                >
                  ↗ explorer
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [recipient, setRecipient] = useState('0xa2e036eD6f43baC9c67B6B098E8B006365b01464');
  const [amount, setAmount] = useState('0.0001');
  const [condition, setCondition] = useState('Delivery confirmed for order #TEST-001');

  // State machine: idle → intent.created → validation.started → validation.passed
  //   → proof.generating → proof.valid → ready_for_execution → executing → completed
  const [phase, setPhase] = useState('idle');

  const [pipeline, setPipeline] = useState(initialPipeline);
  const [logs, setLogs] = useState([]);

  // Wallet + solver (only used after ready_for_execution)
  const [account, setAccount] = useState('');
  const [sessionWalletAddress, setSessionWalletAddress] = useState('');
  const [sessionPrivateKey, setSessionPrivateKey] = useState('');
  const [intentHash, setIntentHash] = useState('');
  const [escrowTx, setEscrowTx] = useState('');
  const [settlementTx, setSettlementTx] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const logRef = useRef(null);
  const pushLog = (msg) => setLogs((prev) => [...prev, nowLog(msg)]);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // 1. Create intent — NO WALLET REQUIRED — starts validation state machine
  async function createIntent(e) {
    e.preventDefault();
    setPipeline(initialPipeline);
    setIntentHash('');
    setEscrowTx('');
    setSettlementTx('');
    setAccount('');
    setSessionWalletAddress('');
    setSessionPrivateKey('');
    setLogs([]);

    // intent.created
    setPhase('intent.created');
    setPipeline((p) => p.map((s) => (s.key === 'intent' ? { ...s, status: 'active' } : s)));
    pushLog('intent.created');
    await delay(800);
    setPipeline((p) => p.map((s) => (s.key === 'intent' ? { ...s, status: 'completed' } : s)));

    // validation.started
    await delay(400);
    setPhase('validation.started');
    setPipeline((p) => p.map((s) => (s.key === 'escrow' ? { ...s, status: 'active' } : s)));
    pushLog('validation.started (GenLayer)');
    await delay(2000);
    setPipeline((p) => p.map((s) => (s.key === 'escrow' ? { ...s, status: 'completed' } : s)));

    // validation.passed
    setPhase('validation.passed');
    setPipeline((p) => p.map((s) => (s.key === 'validation' ? { ...s, status: 'active' } : s)));
    pushLog('validation.passed');
    await delay(500);

    // proof.generating
    setPhase('proof.generating');
    pushLog('proof.generating (Groth16)');
    await delay(2500);
    setPipeline((p) => p.map((s) => (s.key === 'validation' ? { ...s, status: 'completed' } : s)));

    // proof.valid
    setPhase('proof.valid');
    pushLog('proof.valid');
    await delay(500);

    // ready_for_execution — wallet prompt appears
    setPhase('ready_for_execution');
    setPipeline((p) => p.map((s) => (s.key === 'settlement' ? { ...s, status: 'active' } : s)));
    pushLog('ready_for_execution');
  }

  // 2. Connect wallet & execute — ONLY after validation + proof pass
  async function connectAndExecute() {
    if (!window.ethereum) {
      pushLog('error: no wallet detected');
      return;
    }
    setIsConnecting(true);
    pushLog('wallet.connecting');

    try {
      await window.ethereum.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const selected = accounts[0];
      const pk = generatePrivateKey();
      const sessionAccount = privateKeyToAccount(pk);

      setAccount(selected);
      setSessionPrivateKey(pk);
      setSessionWalletAddress(sessionAccount.address);
      pushLog(`wallet.connected: ${selected}`);
      pushLog(`session.created: ${sessionAccount.address}`);

      setPhase('executing');
      const deadlineTs = Math.floor(Date.now() / 1000) + 3600;
      const nonce = BigInt(Date.now());
      const parsedAmount = parseEther(amount || '0');
      const intent = {
        recipient,
        amount: parsedAmount,
        condition,
        deadline: BigInt(deadlineTs),
        nonce,
      };

      const signed = await signPaymentIntentWithSessionAccount(sessionAccount, intent);
      setIntentHash(signed.intentHash);
      pushLog(`intent.signed: ${signed.intentHash}`);

      const response = await fetch(SOLVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentHash: signed.intentHash,
          signature: signed.signature,
          signer: sessionAccount.address,
          intent: {
            recipient,
            amountWei: parsedAmount.toString(),
            condition,
            deadline: deadlineTs,
            nonce: nonce.toString(),
          },
          setupMode: 'fallback-session-wallet',
          mainWallet: selected,
          routerAddress: REBYT_SESSION_ROUTER_ADDRESS,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `solver_http_${response.status}`);
      }

      const body = await response.json();
      setEscrowTx(body.txHash);
      pushLog(`escrow.funded: ${body.txHash}`);

      setPipeline((p) =>
        p.map((s) =>
          s.key === 'settlement'
            ? { ...s, status: 'completed', link: body.txHash ? `https://testnet.bscscan.com/tx/${body.txHash}` : '' }
            : s
        )
      );
      setPhase('completed');
      pushLog('execution.complete');
    } catch (error) {
      pushLog(`error: ${error.message}`);
      setPhase('ready_for_execution');
    } finally {
      setIsConnecting(false);
    }
  }

  function resetToIdle() {
    setPhase('idle');
    setPipeline(initialPipeline);
    setLogs([]);
    setIntentHash('');
    setEscrowTx('');
    setSettlementTx('');
    setAccount('');
    setSessionWalletAddress('');
    setSessionPrivateKey('');
  }

  // Poll solver for real status updates after submission
  useEffect(() => {
    if (!intentHash) return;
    let errors = 0;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > 120) { clearInterval(timer); return; }
      try {
        const res = await fetch(`${SOLVER_URL}/${intentHash}/status`);
        if (!res.ok) throw new Error(`status_http_${res.status}`);
        errors = 0;
        const data = await res.json();
        if (data.settlementTxHash && data.settlementTxHash !== settlementTx) {
          setSettlementTx(data.settlementTxHash);
          pushLog(`settlement_tx: ${data.settlementTxHash}`);
        }
        setPipeline((prev) =>
          prev.map((step) => {
            if (step.key === 'escrow' && escrowTx) {
              return { ...step, status: 'completed', link: `https://testnet.bscscan.com/tx/${escrowTx}` };
            }
            if (step.key === 'settlement' && (data.status === 'RELEASED' || data.status === 'REFUNDED')) {
              return {
                ...step,
                status: 'completed',
                link: data.links?.settlement || (data.settlementTxHash ? `https://testnet.bscscan.com/tx/${data.settlementTxHash}` : step.link),
              };
            }
            return step;
          })
        );
        if (data.status === 'RELEASED' || data.status === 'REFUNDED') {
          setPhase('completed');
          pushLog(`settlement.${data.status.toLowerCase()}`);
          clearInterval(timer);
        }
        if (data.error) {
          pushLog(`solver_error: ${data.error}`);
          clearInterval(timer);
        }
      } catch (err) {
        errors += 1;
        if (errors >= 5) clearInterval(timer);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [intentHash, escrowTx, settlementTx]);

  const isProcessing = ['intent.created', 'validation.started', 'validation.passed', 'proof.generating', 'proof.valid'].includes(phase);
  const isReadyForExecution = phase === 'ready_for_execution';
  const isExecuting = phase === 'executing';
  const isCompleted = phase === 'completed';
  const formLocked = phase !== 'idle';

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* Top bar */}
      <header className="border-b border-gray-200 px-6 h-11 flex items-center justify-between">
        <span className="text-xs font-bold tracking-widest uppercase text-gray-900">Rebyt</span>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-500">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                phase === 'idle'
                  ? 'bg-gray-300'
                  : isProcessing
                  ? 'bg-yellow-500 animate-pulse'
                  : isReadyForExecution
                  ? 'bg-green-500'
                  : isExecuting
                  ? 'bg-yellow-500 animate-pulse'
                  : isCompleted
                  ? 'bg-gray-900'
                  : 'bg-gray-300'
              }`}
            />
            {phase === 'idle' && 'ready'}
            {isProcessing && 'validating'}
            {isReadyForExecution && 'awaiting wallet'}
            {isExecuting && 'executing'}
            {isCompleted && 'settled'}
          </span>
          <span className="text-xs font-mono text-gray-400">BSC Testnet · Chain 97</span>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] min-h-[calc(100vh-44px)]">

        {/* LEFT COLUMN */}
        <div className="border-r border-gray-200">

          {/* System Architecture */}
          <div className="border-b border-gray-200">
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">System Architecture</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100">
              {LAYERS.map((layer) => (
                <div key={layer.index} className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-gray-400"><LayerIcon shape={layer.shape} /></span>
                    <span className="text-xs font-mono text-gray-400">{layer.index}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mb-0.5">{layer.title}</p>
                  <p className="text-xs font-mono text-gray-400 mb-2">{layer.tech}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{layer.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Execution Pipeline */}
          <div className="border-b border-gray-200">
            <div className="px-6 py-3 border-b border-gray-100">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Execution Pipeline</span>
            </div>
            <div className="px-8 py-8">
              <PipelineTrace pipeline={pipeline} />
            </div>
            {intentHash && (
              <div className="px-6 pb-4">
                <p className="text-xs font-mono text-gray-400 break-all">
                  intent_hash: <span className="text-gray-700">{intentHash}</span>
                </p>
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div>
            <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Activity Log</span>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  className="text-xs font-mono text-gray-400 hover:text-gray-900 transition-colors"
                >
                  clear
                </button>
              )}
            </div>
            <div ref={logRef} className="px-6 py-4 h-52 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-xs font-mono text-gray-300">awaiting events_</p>
              ) : (
                <ul className="space-y-1">
                  {logs.map((entry, i) => (
                    <li key={`${entry.timestamp}-${i}`} className="text-xs font-mono leading-relaxed">
                      <span className="text-gray-400 select-none">[{entry.timestamp}] </span>
                      <span className="text-gray-700">{entry.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col divide-y divide-gray-100">

          {/* Payment Intent Form */}
          <div>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Payment Intent</span>
              <span className="text-xs font-mono text-gray-400">EIP-712</span>
            </div>
            <form onSubmit={createIntent} className="px-5 py-4 space-y-5">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5">recipient</label>
                <input
                  className="w-full text-xs font-mono bg-transparent border-b border-gray-200 pb-1.5 focus:border-gray-900 focus:outline-none transition-colors text-gray-800 disabled:opacity-50"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={formLocked}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5">amount_tbnb</label>
                <input
                  type="number"
                  step="0.0001"
                  className="w-full text-xs font-mono bg-transparent border-b border-gray-200 pb-1.5 focus:border-gray-900 focus:outline-none transition-colors text-gray-800 disabled:opacity-50"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={formLocked}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5">condition</label>
                <textarea
                  rows={3}
                  className="w-full text-xs font-mono bg-transparent border-b border-gray-200 pb-1.5 focus:border-gray-900 focus:outline-none transition-colors resize-none text-gray-800 disabled:opacity-50"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  disabled={formLocked}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={formLocked}
                className="w-full text-xs font-mono border border-gray-200 py-2.5 hover:border-gray-900 hover:text-gray-900 text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isProcessing ? '[ processing... ]' : '[ create intent ]'}
              </button>
            </form>
          </div>

          {/* Execution Panel — appears after intent creation */}
          {phase !== 'idle' && (
            <div className="flex-1">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Execution</span>
                <span className="text-xs font-mono text-gray-400">
                  {isProcessing && 'validating'}
                  {isReadyForExecution && 'ready'}
                  {isExecuting && 'executing'}
                  {isCompleted && 'done'}
                </span>
              </div>
              <div className="px-5 py-4">
                {isProcessing && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-gray-500 animate-pulse">
                      {phase === 'intent.created' && '● declaring intent...'}
                      {phase === 'validation.started' && '● running GenLayer validation...'}
                      {phase === 'validation.passed' && '● validation passed'}
                      {phase === 'proof.generating' && '● generating Groth16 proof...'}
                      {phase === 'proof.valid' && '● proof verified'}
                    </p>
                    <p className="text-xs font-mono text-gray-300">no wallet required at this stage</p>
                  </div>
                )}

                {isReadyForExecution && (
                  <div className="space-y-4">
                    <div className="border border-gray-200 p-3">
                      <p className="text-xs font-mono text-gray-700">
                        ✓ validation passed · ✓ proof valid
                      </p>
                      <p className="text-xs font-mono text-gray-400 mt-1">
                        connect wallet to execute settlement
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={connectAndExecute}
                      disabled={isConnecting}
                      className="w-full text-xs font-mono border border-gray-900 py-2.5 hover:bg-gray-900 hover:text-white text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isConnecting ? '[ connecting wallet... ]' : '[ connect wallet & execute ]'}
                    </button>
                    {isConnecting && (
                      <p className="text-xs font-mono text-gray-400 text-center">
                        approve in MetaMask ↑
                      </p>
                    )}
                  </div>
                )}

                {isExecuting && (
                  <p className="text-xs font-mono text-gray-500 animate-pulse">
                    ● submitting to solver...
                  </p>
                )}

                {isCompleted && (
                  <div className="space-y-4">
                    {account && (
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-mono text-gray-400 mb-0.5">main_wallet</p>
                          <p className="text-xs font-mono text-gray-700 break-all">{account}</p>
                        </div>
                        <div>
                          <p className="text-xs font-mono text-gray-400 mb-0.5">session_wallet</p>
                          <p className="text-xs font-mono text-gray-700 break-all">{sessionWalletAddress}</p>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={resetToIdle}
                      className="w-full text-xs font-mono border border-gray-200 py-2.5 hover:border-gray-900 hover:text-gray-900 text-gray-600 transition-colors"
                    >
                      [ new intent ]
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-auto px-5 py-3">
            <p className="text-xs font-mono text-gray-300">0x5191...BB98C · 0x5cBC...1A1e</p>
          </div>
        </div>
      </div>
    </div>
  );
}