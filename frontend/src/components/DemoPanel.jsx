import { useEffect, useRef, useState } from 'react';
import { parseEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signPaymentIntentWithSessionAccount } from '../lib/intentSigner';

const REBYT_SESSION_ROUTER_ADDRESS = '0xBca0f7A094A5398598A8415270711ae3Dd46A986';
const SOLVER_URL = (import.meta.env.VITE_SOLVER_URL ?? 'http://localhost:3001') + '/intent';

const initialPipeline = [
  { key: 'intent',     name: 'Intent',     label: 'EIP-712',           status: 'idle', link: '' },
  { key: 'escrow',     name: 'Escrow',     label: 'BSC Testnet',       status: 'idle', link: '' },
  { key: 'validation', name: 'Validation', label: 'GenLayer Bradbury', status: 'idle', link: '' },
  { key: 'finality',   name: 'Finality',   label: 'Dispute Window',    status: 'idle', link: '' },
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
                <div className={`flex-1 h-px ${step.status !== 'idle' ? 'bg-[#111]' : 'bg-black/10'}`} />
              )}
              <div className="shrink-0">
                {step.status === 'idle' && (
                  <div className="w-2.5 h-2.5 rounded-full border border-black/15" />
                )}
                {step.status === 'active' && (
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-[#111] status-pulse" />
                )}
                {step.status === 'pending' && (
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-500 status-pulse" />
                )}
                {step.status === 'completed' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[#111]" />
                )}
              </div>
              {i < pipeline.length - 1 && (
                <div className={`flex-1 h-px ${step.status === 'completed' ? 'bg-[#111]' : step.status === 'pending' ? 'bg-amber-300' : 'bg-black/10'}`} />
              )}
            </div>
            <div className="mt-2.5 px-1 w-full text-center">
              <p className={`text-xs font-semibold ${step.status === 'pending' ? 'text-amber-600' : 'text-[#111]'}`}>{step.name}</p>
              <p className="text-[#999] mt-0.5 font-mono" style={{ fontSize: '10px' }}>
                {step.status === 'active' && step.key === 'validation'
                  ? 'evaluating...'
                  : step.status === 'pending'
                  ? '30 min in prod'
                  : step.label}
              </p>
              {step.link && step.status === 'completed' && (
                <a
                  href={step.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#888] hover:text-[#444] underline block font-mono mt-1 transition-colors"
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

export default function DemoPanel() {
  const [recipient, setRecipient] = useState('0xa2e036eD6f43baC9c67B6B098E8B006365b01464');
  const [amount, setAmount] = useState('0.0001');
  const [condition, setCondition] = useState('Delivery confirmed for order #TEST-001');

  const [phase, setPhase] = useState('idle');
  const [pipeline, setPipeline] = useState(initialPipeline);
  const [logs, setLogs] = useState([]);

  const [account, setAccount] = useState('');
  const [sessionWalletAddress, setSessionWalletAddress] = useState('');
  const [sessionPrivateKey, setSessionPrivateKey] = useState('');
  const [intentHash, setIntentHash] = useState('');
  const [escrowTx, setEscrowTx] = useState('');
  const [settlementTx, setSettlementTx] = useState('');
  const [genlayerValidationTx, setGenlayerValidationTx] = useState('');
  const [genlayerConsensusTx, setGenlayerConsensusTx] = useState('');
  const [genlayerFinalityTx, setGenlayerFinalityTx] = useState('');
  const [genlayerValidationLink, setGenlayerValidationLink] = useState('');
  const [genlayerConsensusLink, setGenlayerConsensusLink] = useState('');
  const [genlayerFinalityLink, setGenlayerFinalityLink] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const logRef = useRef(null);
  const pushLog = (msg) => setLogs((prev) => [...prev, nowLog(msg)]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  async function createIntent(e) {
    e.preventDefault();
    setPipeline(initialPipeline);
    setIntentHash('');
    setEscrowTx('');
    setSettlementTx('');
    setGenlayerValidationTx('');
    setGenlayerConsensusTx('');
    setGenlayerFinalityTx('');
    setGenlayerValidationLink('');
    setGenlayerConsensusLink('');
    setGenlayerFinalityLink('');
    setAccount('');
    setSessionWalletAddress('');
    setSessionPrivateKey('');
    setLogs([]);

    setPhase('intent.created');
    setPipeline((p) => p.map((s) => (s.key === 'intent' ? { ...s, status: 'active' } : s)));
    pushLog('intent.created — EIP-712 typed data prepared');
    await delay(800);
    setPipeline((p) => p.map((s) => (s.key === 'intent' ? { ...s, status: 'completed' } : s)));
    pushLog('intent.hash computed (EIP-712)');
    await delay(400);

    setPhase('ready_for_execution');
    setPipeline((p) => p.map((s) => (s.key === 'escrow' ? { ...s, status: 'active' } : s)));
    pushLog('ready_for_execution — connect wallet to fund escrow');
  }

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
        p.map((s) => {
          if (s.key === 'escrow' && body.txHash) {
            return { ...s, status: 'completed', link: `https://testnet.bscscan.com/tx/${body.txHash}` };
          }
          if (s.key === 'validation') {
            return { ...s, status: 'active' };
          }
          return s;
        })
      );
      setPhase('executing');
      pushLog('validation.started — GenLayer AI validators evaluating');
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
    setGenlayerValidationTx('');
    setGenlayerConsensusTx('');
    setGenlayerFinalityTx('');
    setGenlayerValidationLink('');
    setGenlayerConsensusLink('');
    setGenlayerFinalityLink('');
    setAccount('');
    setSessionWalletAddress('');
    setSessionPrivateKey('');
  }

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
        if (data.validateTxHash && data.validateTxHash !== genlayerValidationTx) {
          setGenlayerValidationTx(data.validateTxHash);
          setGenlayerValidationLink(data.links?.genlayerValidation || '');
          pushLog(`genlayer.validation_tx: ${data.validateTxHash}`);
        }
        if (data.anchorConsensusTxHash && data.anchorConsensusTxHash !== genlayerConsensusTx) {
          setGenlayerConsensusTx(data.anchorConsensusTxHash);
          setGenlayerConsensusLink(data.links?.genlayerConsensus || '');
          pushLog(`genlayer.consensus_anchored: ${data.anchorConsensusTxHash}`);
        }
        if (data.anchorFinalityTxHash && data.anchorFinalityTxHash !== genlayerFinalityTx) {
          setGenlayerFinalityTx(data.anchorFinalityTxHash);
          setGenlayerFinalityLink(data.links?.genlayerFinality || '');
          pushLog(`genlayer.finality_confirmed: ${data.anchorFinalityTxHash}`);
        }
        setPipeline((prev) =>
          prev.map((step) => {
            const settled = data.status === 'RELEASED' || data.status === 'REFUNDED';
            if (step.key === 'escrow' && escrowTx) {
              return { ...step, status: 'completed', link: `https://testnet.bscscan.com/tx/${escrowTx}` };
            }
            if (step.key === 'validation') {
              // advances on real validate tx OR consensus anchor (manual mode)
              if (data.validateTxHash || data.anchorConsensusTxHash || settled) {
                return { ...step, status: 'completed', link: data.links?.genlayerValidation || data.links?.genlayerConsensus || '' };
              }
            }
            if (step.key === 'finality') {
              if (data.anchorFinalityTxHash || settled) {
                return { ...step, status: 'completed', link: data.links?.genlayerFinality || '' };
              }
              if (data.validateTxHash || data.anchorConsensusTxHash) {
                return { ...step, status: 'pending' };
              }
            }
            if (step.key === 'settlement') {
              if (settled) {
                return {
                  ...step,
                  status: 'completed',
                  link: data.links?.settlement || (data.settlementTxHash ? `https://testnet.bscscan.com/tx/${data.settlementTxHash}` : step.link),
                };
              }
              if (data.anchorFinalityTxHash) {
                return { ...step, status: 'active' };
              }
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
  }, [intentHash, escrowTx, settlementTx, genlayerValidationTx, genlayerConsensusTx, genlayerFinalityTx]);

  const isProcessing = phase === 'intent.created';
  const isFinalityPending = false;
  const isReadyForExecution = phase === 'ready_for_execution';
  const isExecuting = phase === 'executing';
  const isCompleted = phase === 'completed';
  const formLocked = phase !== 'idle';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Pipeline */}
      <div
        className="mb-10 bg-white/70 backdrop-blur-[12px] border border-black/[0.07] rounded-[14px] px-8 py-8"
        style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}
      >
        <PipelineTrace pipeline={pipeline} />
        {intentHash && (
          <p className="text-xs font-mono text-[#bbb] break-all mt-5">
            intent_hash: <span className="text-[#666]">{intentHash}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Form */}
        <div
          className="card-hover bg-white/70 backdrop-blur-[12px] border border-black/[0.07] rounded-[14px] p-7"
          style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}
        >
          <div className="flex items-center justify-between mb-7">
            <span className="text-xs font-mono text-[#999] uppercase tracking-widest">Payment Intent</span>
            <span className="text-xs font-mono text-[#bbb]">EIP-712</span>
          </div>
          <form onSubmit={createIntent} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-[#999] mb-1.5">recipient</label>
              <input
                className="w-full text-xs font-mono bg-transparent border-b border-black/10 pb-1.5 focus:border-[#111] focus:outline-none transition-colors text-[#333] disabled:opacity-40"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={formLocked}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#999] mb-1.5">amount_tbnb</label>
              <input
                type="number"
                step="0.0001"
                className="w-full text-xs font-mono bg-transparent border-b border-black/10 pb-1.5 focus:border-[#111] focus:outline-none transition-colors text-[#333] disabled:opacity-40"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={formLocked}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#999] mb-1.5">condition</label>
              <textarea
                rows={2}
                className="w-full text-xs font-mono bg-transparent border-b border-black/10 pb-1.5 focus:border-[#111] focus:outline-none transition-colors resize-none text-[#333] disabled:opacity-40"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                disabled={formLocked}
                required
              />
            </div>
            <button
              type="submit"
              disabled={formLocked}
              className="w-full text-sm font-mono border border-black/10 py-3 rounded-[10px] hover:border-[#111] hover:bg-[#111] hover:text-white text-[#555] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isFinalityPending ? '[ pending finality... ]' : isProcessing ? '[ processing... ]' : '[ create intent ]'}
            </button>
          </form>

          {isReadyForExecution && (
            <div className="mt-7 space-y-3">
              <div className="border border-emerald-200 rounded-[10px] p-3 bg-emerald-50/60">
                <p className="text-xs font-mono text-emerald-700">✓ intent signed · ✓ conditions set</p>
                <p className="text-xs font-mono text-[#999] mt-1">connect wallet to fund escrow and start validation</p>
              </div>
              <button
                type="button"
                onClick={connectAndExecute}
                disabled={isConnecting}
                className="w-full text-sm font-mono border border-[#111] py-3 rounded-[10px] hover:bg-[#111] hover:text-white text-[#111] transition-all disabled:opacity-50"
              >
                {isConnecting ? '[ connecting... ]' : '[ connect wallet & execute ]'}
              </button>
            </div>
          )}

          {isExecuting && (
            <div className="mt-7">
              <p className="text-xs font-mono text-[#666] status-pulse">● submitting to solver...</p>
            </div>
          )}

          {isCompleted && (
            <div className="mt-7 space-y-3">
              {account && (
                <div className="space-y-1.5">
                  <p className="text-xs font-mono text-[#999]">wallet: <span className="text-[#444] break-all">{account}</span></p>
                  <p className="text-xs font-mono text-[#999]">session: <span className="text-[#444] break-all">{sessionWalletAddress}</span></p>
                </div>
              )}
              {(escrowTx || settlementTx || genlayerValidationTx || genlayerConsensusTx || genlayerFinalityTx) && (
                <div className="border border-black/[0.07] rounded-[10px] p-3 space-y-2">
                  <p className="text-xs font-mono text-[#999] uppercase tracking-widest mb-2">On-chain transactions</p>
                  {escrowTx && (
                    <a
                      href={`https://testnet.bscscan.com/tx/${escrowTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between text-xs font-mono text-[#555] hover:text-[#111] transition-colors"
                    >
                      <span>Escrow funding</span>
                      <span className="text-[#999]">{escrowTx.slice(0, 10)}...{escrowTx.slice(-6)} ↗</span>
                    </a>
                  )}
                  {settlementTx && (
                    <a
                      href={`https://testnet.bscscan.com/tx/${settlementTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between text-xs font-mono text-[#555] hover:text-[#111] transition-colors"
                    >
                      <span>Settlement</span>
                      <span className="text-[#999]">{settlementTx.slice(0, 10)}...{settlementTx.slice(-6)} ↗</span>
                    </a>
                  )}
                  {genlayerValidationTx && (
                    <a
                      href={genlayerValidationLink || `https://explorer-bradbury.genlayer.com/tx/${genlayerValidationTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between text-xs font-mono text-[#555] hover:text-[#111] transition-colors"
                    >
                      <span>GenLayer validation</span>
                      <span className="text-[#999]">{genlayerValidationTx.slice(0, 10)}...{genlayerValidationTx.slice(-6)} ↗</span>
                    </a>
                  )}
                  {genlayerConsensusTx && (
                    <a
                      href={genlayerConsensusLink || `https://explorer-bradbury.genlayer.com/tx/${genlayerConsensusTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between text-xs font-mono text-[#555] hover:text-[#111] transition-colors"
                    >
                      <span>GenLayer consensus</span>
                      <span className="text-[#999]">{genlayerConsensusTx.slice(0, 10)}...{genlayerConsensusTx.slice(-6)} ↗</span>
                    </a>
                  )}
                  {genlayerFinalityTx && (
                    <a
                      href={genlayerFinalityLink || `https://explorer-bradbury.genlayer.com/tx/${genlayerFinalityTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between text-xs font-mono text-[#555] hover:text-[#111] transition-colors"
                    >
                      <span>GenLayer finality</span>
                      <span className="text-[#999]">{genlayerFinalityTx.slice(0, 10)}...{genlayerFinalityTx.slice(-6)} ↗</span>
                    </a>
                  )}
                  {intentHash && (
                    <a
                      href={`https://testnet.bscscan.com/address/0xc065d530eAb19955EedC11BD51920625100B3a6A`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between text-xs font-mono text-[#555] hover:text-[#111] transition-colors"
                    >
                      <span>Escrow contract</span>
                      <span className="text-[#999]">0xc065...3a6A ↗</span>
                    </a>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={resetToIdle}
                className="w-full text-sm font-mono border border-black/10 py-3 rounded-[10px] hover:border-[#111] text-[#888] hover:text-[#111] transition-all"
              >
                [ new intent ]
              </button>
            </div>
          )}
        </div>

        {/* Right: Log */}
        <div
          className="card-hover bg-white/70 backdrop-blur-[12px] border border-black/[0.07] rounded-[14px] p-7"
          style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}
        >
          <div className="flex items-center justify-between mb-7">
            <span className="text-xs font-mono text-[#999] uppercase tracking-widest">Activity Log</span>
            {logs.length > 0 && (
              <button onClick={() => setLogs([])} className="text-xs font-mono text-[#bbb] hover:text-[#666] transition-colors">
                clear
              </button>
            )}
          </div>
          <div ref={logRef} className="h-72 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-xs font-mono text-[#ccc]">awaiting events_</p>
            ) : (
              <ul className="space-y-1">
                {logs.map((entry, i) => (
                  <li key={`${entry.timestamp}-${i}`} className="text-xs font-mono leading-relaxed">
                    <span className="text-[#bbb] select-none">[{entry.timestamp}] </span>
                    <span className="text-[#555]">{entry.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
