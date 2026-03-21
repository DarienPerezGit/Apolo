import { useEffect, useMemo, useState } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
  parseAbiItem,
  parseEther
} from 'viem';
import { bscTestnet } from 'viem/chains';
import { signPaymentIntent } from './lib/intentSigner';

const escrowAbi = parseAbi([
  'function fund(bytes32 intentHash, uint256 amount) external payable',
  'function getIntent(bytes32 intentHash) external view returns ((address recipient,uint256 amount,uint8 state,uint256 fundedAt,uint256 settledAt))'
]);

const releasedEvent = parseAbiItem('event Released(bytes32 indexed intentHash, address indexed recipient, uint256 amount)');
const refundedEvent = parseAbiItem('event Refunded(bytes32 indexed intentHash, uint256 amount)');

const ESCROW_CONTRACT_ADDRESS = '0xc065d530eAb19955EedC11BD51920625100B3a6A';
const GENLAYER_CONTRACT_ADDRESS = '0x023b48B9c8C4805c4c4dAB50247e78d4a082C46E';
const BSC_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545';

const initialPipeline = [
  { key: 'intent', name: 'Intent signed', network: 'offchain', status: 'idle', link: '' },
  { key: 'escrow', name: 'Escrow funded', network: 'BSC Testnet', status: 'idle', link: '' },
  { key: 'validation', name: 'AI validating', network: 'GenLayer Bradbury', status: 'idle', link: '' },
  { key: 'settlement', name: 'Settlement done', network: 'BSC Testnet', status: 'idle', link: '' }
];

function statusCircleClass(status) {
  if (status === 'confirmed') return 'bg-emerald-400';
  if (status === 'processing') return 'bg-amber-300';
  return 'bg-slate-500';
}

function nowLog(message) {
  return { message, timestamp: new Date().toLocaleTimeString() };
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

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: bscTestnet,
        transport: http(BSC_RPC)
      }),
    []
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
    setIntentHash(signed.intentHash);
    setEscrowTx('');
    setSettlementTx('');
    setPipeline(initialPipeline);

    setPipeline((prev) =>
      prev.map((step) =>
        step.key === 'intent'
          ? { ...step, status: 'confirmed' }
          : step
      )
    );
    pushLog(`Intent signed: ${signed.intentHash}`);

    const fundTx = await walletClient.writeContract({
      address: ESCROW_CONTRACT_ADDRESS,
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
            link: ''
          };
        }
        return step;
      })
    );
    pushLog(`Escrow funded tx: ${fundTx}`);
  }

  async function findSettlementTx(hash) {
    try {
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > 20000n ? latestBlock - 20000n : 0n;

      const releasedLogs = await publicClient.getLogs({
        address: ESCROW_CONTRACT_ADDRESS,
        event: releasedEvent,
        args: { intentHash: hash },
        fromBlock,
        toBlock: latestBlock
      });

      if (releasedLogs.length > 0) {
        return releasedLogs[releasedLogs.length - 1].transactionHash;
      }

      const refundedLogs = await publicClient.getLogs({
        address: ESCROW_CONTRACT_ADDRESS,
        event: refundedEvent,
        args: { intentHash: hash },
        fromBlock,
        toBlock: latestBlock
      });

      if (refundedLogs.length > 0) {
        return refundedLogs[refundedLogs.length - 1].transactionHash;
      }
    } catch {
      return '';
    }

    return '';
  }

  useEffect(() => {
    if (!intentHash) return;

    const timer = setInterval(async () => {
      try {
        const data = await publicClient.readContract({
          address: ESCROW_CONTRACT_ADDRESS,
          abi: escrowAbi,
          functionName: 'getIntent',
          args: [intentHash]
        });

        const state = Number(data.state ?? data[2]);
        let settledTx = settlementTx;

        if ((state === 3 || state === 4) && !settledTx) {
          settledTx = await findSettlementTx(intentHash);
          if (settledTx) {
            setSettlementTx(settledTx);
            pushLog(`Settlement transaction detected: ${settledTx}`);
          }
        }

        setPipeline((prev) =>
          prev.map((step) => {
            if (step.key === 'escrow') {
              const status = state >= 1 ? 'confirmed' : step.status;
              return {
                ...step,
                status,
                link: status === 'confirmed' && escrowTx ? `https://testnet.bscscan.com/tx/${escrowTx}` : ''
              };
            }
            if (step.key === 'validation') {
              const status = state >= 3 ? 'confirmed' : state === 2 ? 'processing' : step.status;
              return {
                ...step,
                status,
                link: status === 'confirmed' ? `https://studio.genlayer.com/contract/${GENLAYER_CONTRACT_ADDRESS}` : ''
              };
            }
            if (step.key === 'settlement') {
              const status = state === 3 || state === 4 ? 'confirmed' : step.status;
              return {
                ...step,
                status,
                link: status === 'confirmed' && settledTx ? `https://testnet.bscscan.com/tx/${settledTx}` : ''
              };
            }
            return step;
          })
        );
      } catch (error) {
        pushLog(`Polling error: ${error.message}`);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [intentHash, escrowTx, settlementTx, publicClient]);

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
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 hover:bg-indigo-500">
              Sign Intent &amp; Pay
            </button>
          </div>
        </form>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid gap-4 md:grid-cols-4">
            {pipeline.map((step) => (
              <article key={step.key} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${statusCircleClass(step.status)}`} />
                  <h3 className="text-base font-semibold">{step.name}</h3>
                </div>
                <span className="inline-block rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-200">
                  {step.network}
                </span>
                {step.link && step.status === 'confirmed' ? (
                  <a className="mt-3 block text-sm text-indigo-300 underline" href={step.link} target="_blank" rel="noreferrer">
                    Explorer link
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-2 text-lg font-semibold">Intent details</h3>
          <p className="text-xs text-slate-300 break-all">intentHash: {intentHash || '-'}</p>
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
