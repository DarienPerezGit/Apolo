import { useEffect, useMemo, useState } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  parseAbi,
  parseEther
} from 'viem';
import { bscTestnet } from 'viem/chains';
import { signPaymentIntent } from './lib/intentSigner';

const escrowAbi = parseAbi([
  'function fund(bytes32 intentHash, uint256 amount) external payable',
  'function getIntent(bytes32 intentHash) external view returns ((address recipient,uint256 amount,uint8 state,uint256 fundedAt,uint256 settledAt))'
]);

const stateLabels = ['PENDING', 'FUNDED', 'VALIDATING', 'RELEASED', 'REFUNDED'];

const initialPipeline = [
  { key: 'intent', name: 'Intent', network: 'Wallet + viem', status: 'idle', link: '' },
  { key: 'escrow', name: 'Escrow', network: 'BSC Testnet', status: 'idle', link: '' },
  { key: 'validation', name: 'Validation', network: 'GenLayer Bradbury', status: 'idle', link: '' },
  { key: 'settlement', name: 'Settlement', network: 'BSC Testnet', status: 'idle', link: '' }
];

function badgeClass(status) {
  if (status === 'confirmed') return 'bg-emerald-500/20 text-emerald-300';
  if (status === 'processing') return 'bg-amber-500/20 text-amber-200';
  return 'bg-slate-700 text-slate-200';
}

function nowLog(message) {
  return { message, timestamp: new Date().toLocaleTimeString() };
}

export default function App() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('0.001');
  const [condition, setCondition] = useState('order #4821 marked delivered');
  const [intentHash, setIntentHash] = useState('');
  const [signature, setSignature] = useState('');
  const [escrowTx, setEscrowTx] = useState('');
  const [genlayerId, setGenlayerId] = useState('pending');
  const [settlementResult, setSettlementResult] = useState('pending');
  const [pipeline, setPipeline] = useState(initialPipeline);
  const [logs, setLogs] = useState([]);
  const [account, setAccount] = useState('');

  const escrowAddress = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS;
  const genlayerAddress = import.meta.env.VITE_GENLAYER_CONTRACT_ADDRESS;
  const bscRpc = import.meta.env.VITE_BSC_TESTNET_RPC || 'https://data-seed-prebsc-1-s1.binance.org:8545';

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: bscTestnet,
        transport: http(bscRpc)
      }),
    [bscRpc]
  );

  const pushLog = (message) => setLogs((prev) => [nowLog(message), ...prev]);

  async function connect() {
    if (!window.ethereum) throw new Error('No wallet found');
    const walletClient = createWalletClient({
      chain: bscTestnet,
      transport: custom(window.ethereum)
    });
    const [selected] = await walletClient.requestAddresses();
    setAccount(selected);
    pushLog(`Wallet connected: ${selected}`);
    return { walletClient, selected };
  }

  async function submitIntent(event) {
    event.preventDefault();
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const nonce = BigInt(Date.now());
    const parsedAmount = parseEther(amount || '0');

    const intent = {
      recipient,
      amount: parsedAmount,
      condition,
      deadline: BigInt(deadline),
      nonce
    };

    const { walletClient, selected } = account
      ? {
          walletClient: createWalletClient({
            chain: bscTestnet,
            transport: custom(window.ethereum)
          }),
          selected: account
        }
      : await connect();

    const signed = await signPaymentIntent(walletClient, selected, intent);
    setSignature(signed.signature);
    setIntentHash(signed.intentHash);

    setPipeline((prev) =>
      prev.map((step) =>
        step.key === 'intent'
          ? { ...step, status: 'confirmed' }
          : step
      )
    );
    pushLog(`Intent signed: ${signed.intentHash}`);

    if (!escrowAddress) {
      pushLog('Escrow address missing in VITE_ESCROW_CONTRACT_ADDRESS');
      return;
    }

    const fundTx = await walletClient.writeContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: 'fund',
      args: [signed.intentHash, parsedAmount],
      value: parsedAmount,
      account: selected
    });

    setEscrowTx(fundTx);
    setPipeline((prev) =>
      prev.map((step) => {
        if (step.key === 'escrow') {
          return {
            ...step,
            status: 'processing',
            link: `https://testnet.bscscan.com/tx/${fundTx}`
          };
        }
        return step;
      })
    );
    pushLog(`Escrow funded tx: ${fundTx}`);
  }

  useEffect(() => {
    if (!intentHash || !escrowAddress) return;

    const timer = setInterval(async () => {
      try {
        const data = await publicClient.readContract({
          address: escrowAddress,
          abi: escrowAbi,
          functionName: 'getIntent',
          args: [intentHash]
        });

        const state = Number(data.state ?? data[2]);
        const stateName = stateLabels[state] || 'UNKNOWN';

        setPipeline((prev) =>
          prev.map((step) => {
            if (step.key === 'escrow') {
              const status = state >= 1 ? 'confirmed' : 'processing';
              return { ...step, status };
            }
            if (step.key === 'validation') {
              const status = state >= 2 ? 'processing' : 'idle';
              return {
                ...step,
                status,
                link: genlayerAddress ? `https://studio.genlayer.com/contract/${genlayerAddress}` : ''
              };
            }
            if (step.key === 'settlement') {
              if (state === 3 || state === 4) {
                return { ...step, status: 'confirmed' };
              }
              return step;
            }
            return step;
          })
        );

        if (state === 3) {
          setSettlementResult('released');
          pushLog(`Settlement confirmed: ${stateName}`);
        }
        if (state === 4) {
          setSettlementResult('refunded');
          pushLog(`Settlement confirmed: ${stateName}`);
        }
      } catch (error) {
        pushLog(`Polling error: ${error.message}`);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [intentHash, escrowAddress, genlayerAddress, publicClient]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-3xl font-bold">Rebyt</h1>
          <p className="mt-2 text-slate-300">Blockchains execute transactions. Rebyt validates outcomes before value moves.</p>
        </header>

        <form onSubmit={submitIntent} className="mb-8 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Recipient Address</label>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-300">Amount (tBNB)</label>
            <input
              type="number"
              step="0.0001"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-300">Condition</label>
            <textarea
              className="h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              required
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={connect} className="rounded-lg bg-slate-700 px-4 py-2 hover:bg-slate-600">
              Connect Wallet
            </button>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 hover:bg-indigo-500">
              Sign Intent + Fund Escrow
            </button>
          </div>
        </form>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 h-2 w-full rounded-full bg-slate-800">
            <div
              className="h-2 rounded-full bg-indigo-500 transition-all"
              style={{ width: `${(pipeline.filter((step) => step.status === 'confirmed').length / pipeline.length) * 100}%` }}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {pipeline.map((step) => (
              <article key={step.key} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="text-lg font-semibold">{step.name}</h3>
                <p className="text-sm text-slate-400">{step.network}</p>
                <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs ${badgeClass(step.status)}`}>
                  {step.status}
                </span>
                {step.link ? (
                  <a className="mt-3 block text-sm text-indigo-300 underline" href={step.link} target="_blank" rel="noreferrer">
                    Explorer link
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-2 text-lg font-semibold">Intent</h3>
            <p className="text-xs text-slate-300 break-all">intentHash: {intentHash || '-'}</p>
            <p className="text-xs text-slate-300 break-all">signature: {signature || '-'}</p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-2 text-lg font-semibold">Escrow</h3>
            <p className="text-xs text-slate-300 break-all">tx: {escrowTx || '-'}</p>
            {escrowTx ? (
              <a className="text-sm text-indigo-300 underline" href={`https://testnet.bscscan.com/tx/${escrowTx}`} target="_blank" rel="noreferrer">
                Open BscScan
              </a>
            ) : null}
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-2 text-lg font-semibold">Validation</h3>
            <p className="text-xs text-slate-300 break-all">GenLayer contract: {genlayerAddress || '-'}</p>
            <p className="text-xs text-slate-300 break-all">validationId: {genlayerId}</p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-2 text-lg font-semibold">Settlement</h3>
            <p className="text-xs text-slate-300 break-all">result: {settlementResult}</p>
            <p className="text-xs text-slate-300 break-all">human amount: {amount ? formatEther(parseEther(amount)).toString() : '-'}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-3 text-lg font-semibold">Activity Log</h3>
          <ul className="space-y-2 text-sm">
            {logs.length === 0 ? <li className="text-slate-400">No events yet.</li> : null}
            {logs.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <span className="text-slate-400">[{entry.timestamp}] </span>
                {entry.message}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
