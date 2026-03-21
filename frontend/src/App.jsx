import { useEffect, useState } from 'react';
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

function nowLog(message) {
  return { message, timestamp: new Date().toLocaleTimeString() };
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
                {step.status === 'processing' && (
                  <div className="w-2.5 h-2.5 rounded-full border border-gray-900 animate-pulse" />
                )}
                {step.status === 'confirmed' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-900" />
                )}
              </div>
              {i < pipeline.length - 1 && (
                <div className={`flex-1 h-px ${step.status === 'confirmed' ? 'bg-gray-900' : 'bg-gray-200'}`} />
              )}
            </div>
            <div className="mt-2.5 px-1 w-full text-center">
              <p className="text-xs font-semibold text-gray-900">{step.name}</p>
              <p className="text-gray-400 mt-0.5 font-mono" style={{ fontSize: '10px' }}>{step.label}</p>
              {step.link && step.status === 'confirmed' && (
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
  const [intentHash, setIntentHash] = useState('');
  const [escrowTx, setEscrowTx] = useState('');
  const [settlementTx, setSettlementTx] = useState('');
  const [pipeline, setPipeline] = useState(initialPipeline);
  const [logs, setLogs] = useState([]);
  const [account, setAccount] = useState('');
  const [sessionWalletAddress, setSessionWalletAddress] = useState('');
  const [sessionPrivateKey, setSessionPrivateKey] = useState('');
  const [isWalletUpgraded, setIsWalletUpgraded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pushLog = (message) => setLogs((prev) => [nowLog(message), ...prev]);

  async function setupSessionWallet() {
    try {
      if (!window.ethereum) {
        pushLog('error: no wallet detected (install MetaMask)');
        return;
      }
      pushLog('requesting wallet access...');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const selected = accounts[0];
      const generatedPrivateKey = generatePrivateKey();
      const sessionAccount = privateKeyToAccount(generatedPrivateKey);
      setAccount(selected);
      setSessionPrivateKey(generatedPrivateKey);
      setSessionWalletAddress(sessionAccount.address);
      setIsWalletUpgraded(true);
      pushLog(`main_wallet: ${selected}`);
      pushLog(`session_wallet: ${sessionAccount.address}`);
    } catch (error) {
      pushLog(`error: ${error.message}`);
    }
  }

  async function submitIntent(event) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (!isWalletUpgraded || !sessionPrivateKey) {
        throw new Error('Initialize session wallet first');
      }
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = BigInt(Date.now());
      const parsedAmount = parseEther(amount || '0');
      const intent = { recipient, amount: parsedAmount, condition, deadline: BigInt(deadline), nonce };
      const sessionAccount = privateKeyToAccount(sessionPrivateKey);
      const signed = await signPaymentIntentWithSessionAccount(sessionAccount, intent);
      setIntentHash(signed.intentHash);
      setEscrowTx('');
      setSettlementTx('');
      setPipeline(initialPipeline);
      setPipeline((prev) => prev.map((s) => s.key === 'intent' ? { ...s, status: 'confirmed' } : s));
      pushLog(`intent_hash: ${signed.intentHash}`);

      const response = await fetch(SOLVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentHash: signed.intentHash,
          signature: signed.signature,
          signer: sessionAccount.address,
          intent: { recipient, amountWei: parsedAmount.toString(), condition, deadline, nonce: nonce.toString() },
          setupMode: 'fallback-session-wallet',
          mainWallet: account,
          routerAddress: REBYT_SESSION_ROUTER_ADDRESS,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `solver_http_${response.status}`);
      }
      const body = await response.json();
      const fundTx = body.txHash;
      setEscrowTx(fundTx);
      setPipeline((prev) =>
        prev.map((s) =>
          s.key === 'escrow'
            ? { ...s, status: 'confirmed', link: fundTx ? `https://testnet.bscscan.com/tx/${fundTx}` : '' }
            : s
        )
      );
      pushLog(`escrow_tx: ${fundTx}`);
    } catch (error) {
      pushLog(`error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!intentHash) return;
    let consecutiveErrors = 0;
    let pollAttempts = 0;
    const timer = setInterval(async () => {
      pollAttempts += 1;
      if (pollAttempts > 120) { clearInterval(timer); return; }
      try {
        const response = await fetch(`${SOLVER_URL}/${intentHash}/status`);
        if (!response.ok) { const b = await response.json().catch(() => ({})); throw new Error(b.error || `status_http_${response.status}`); }
        consecutiveErrors = 0;
        const statusData = await response.json();
        const status = statusData.status;
        const settlementHash = statusData.settlementTxHash || '';
        const links = statusData.links || {};
        if (settlementHash && settlementHash !== settlementTx) {
          setSettlementTx(settlementHash);
          pushLog(`settlement_tx: ${settlementHash}`);
        }
        setPipeline((prev) =>
          prev.map((step) => {
            if (step.key === 'escrow') return { ...step, status: escrowTx ? 'confirmed' : step.status, link: escrowTx ? `https://testnet.bscscan.com/tx/${escrowTx}` : '' };
            if (step.key === 'validation') {
              const vp = status === 'VALIDATING';
              const vc = status === 'RELEASED' || status === 'REFUNDED';
              return { ...step, status: vp ? 'processing' : vc ? 'confirmed' : step.status, link: links.genlayer || step.link };
            }
            if (step.key === 'settlement') {
              const settled = status === 'RELEASED' || status === 'REFUNDED';
              return { ...step, status: settled ? 'confirmed' : step.status, link: settled ? (links.settlement || (settlementHash ? `https://testnet.bscscan.com/tx/${settlementHash}` : '')) : '' };
            }
            return step;
          })
        );
        if (status === 'RELEASED' || status === 'REFUNDED') clearInterval(timer);
        if (statusData.error) { pushLog(`solver_error: ${statusData.error}`); clearInterval(timer); }
      } catch (error) {
        consecutiveErrors += 1;
        pushLog(`poll_error(${consecutiveErrors}/5): ${error.message}`);
        if (consecutiveErrors >= 5) clearInterval(timer);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [intentHash, escrowTx, settlementTx]);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">

      {/* Top bar */}
      <header className="border-b border-gray-200 px-6 h-11 flex items-center justify-between">
        <span className="text-xs font-bold tracking-widest uppercase text-gray-900">Rebyt</span>
        <div className="flex items-center gap-4">
          <span className={`inline-flex items-center gap-1.5 text-xs font-mono text-gray-500`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isWalletUpgraded ? 'bg-gray-900' : 'bg-gray-300'}`} />
            {isWalletUpgraded ? 'session active' : 'not connected'}
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
            <div className="px-6 py-4 h-52 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-xs font-mono text-gray-300">awaiting events_</p>
              ) : (
                <ul className="space-y-1">
                  {logs.map((entry, index) => (
                    <li key={`${entry.timestamp}-${index}`} className="text-xs font-mono leading-relaxed">
                      <span className="text-gray-400 select-none">{entry.timestamp} </span>
                      <span className="text-gray-700">{entry.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Controls */}
        <div className="flex flex-col divide-y divide-gray-100">

          {/* Session Wallet */}
          <div>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Session Wallet</span>
              <span className="text-xs font-mono text-gray-400">EIP-7702</span>
            </div>
            <div className="px-5 py-4">
              {!isWalletUpgraded ? (
                <button
                  type="button"
                  onClick={setupSessionWallet}
                  className="w-full text-xs font-mono border border-gray-200 py-2.5 hover:border-gray-900 hover:text-gray-900 text-gray-600 transition-colors"
                >
                  [ initialize session ]
                </button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-mono text-gray-400 mb-1">main_wallet</p>
                    <p className="text-xs font-mono text-gray-700 break-all">{account}</p>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-gray-400 mb-1">session_wallet</p>
                    <p className="text-xs font-mono text-gray-700 break-all">{sessionWalletAddress}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Intent */}
          <div className="flex-1">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Payment Intent</span>
              <span className="text-xs font-mono text-gray-400">EIP-712</span>
            </div>
            <form onSubmit={submitIntent} className="px-5 py-4 space-y-5">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5">recipient</label>
                <input
                  className="w-full text-xs font-mono bg-transparent border-b border-gray-200 pb-1.5 focus:border-gray-900 focus:outline-none transition-colors text-gray-800"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5">amount_tbnb</label>
                <input
                  type="number"
                  step="0.0001"
                  className="w-full text-xs font-mono bg-transparent border-b border-gray-200 pb-1.5 focus:border-gray-900 focus:outline-none transition-colors text-gray-800"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5">condition</label>
                <textarea
                  rows={3}
                  className="w-full text-xs font-mono bg-transparent border-b border-gray-200 pb-1.5 focus:border-gray-900 focus:outline-none transition-colors resize-none text-gray-800"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={!isWalletUpgraded || isSubmitting}
                className="w-full text-xs font-mono border border-gray-200 py-2.5 hover:border-gray-900 hover:text-gray-900 text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '[ submitting... ]' : '[ sign & submit intent ]'}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-5 py-3">
            <p className="text-xs font-mono text-gray-300">0x5191...BB98C · 0x5cBC...1A1e</p>
          </div>
        </div>
      </div>
    </div>
  );
}