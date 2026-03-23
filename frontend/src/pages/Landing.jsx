import { Link } from 'react-router-dom';

const ESCROW_ADDRESS = '0xc065d530eAb19955EedC11BD51920625100B3a6A';

/* ── Proof / status strip ── */
function ProofStrip() {
  return (
    <section className="border-t border-black/[0.06] bg-white/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="w-[7px] h-[7px] rounded-full bg-emerald-500 status-pulse" />
          <span className="text-xs font-mono font-medium text-[#111] uppercase tracking-wider">Live</span>
        </div>
        <span className="w-px h-4 bg-black/10" />
        <span className="text-xs font-mono text-[#666]">Consensus: <span className="text-[#111] font-semibold">4/4</span> validators</span>
        <span className="w-px h-4 bg-black/10" />
        <span className="text-xs font-mono text-[#666]">Dispute window: <span className="text-[#111] font-semibold">30 min</span></span>
        <span className="ml-auto">
          <a
            href={`https://testnet.bscscan.com/address/${ESCROW_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-[#999] hover:text-[#444] transition-colors"
          >
            {ESCROW_ADDRESS.slice(0, 6)}...{ESCROW_ADDRESS.slice(-4)} ↗
          </a>
        </span>
      </div>
    </section>
  );
}

/* ── Layer module cards ── */
const MODULES = [
  {
    index: '01',
    label: 'Intent',
    body: "Users express outcomes.\nNot transactions.",
  },
  {
    index: '02',
    label: 'Consensus',
    body: 'AI validators agree\non reality.',
  },
  {
    index: '03',
    label: 'Settlement',
    body: 'Funds move when\ntruth is verified.',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#FAFAFB] text-[#111] antialiased noise-bg">

      {/* ══════════════ HERO ══════════════ */}
      <section className="relative min-h-screen flex flex-col grid-bg">
        {/* Video background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-30"
          style={{ filter: 'saturate(0.5)' }}
        >
          <source src="/hero-bg.mp4" type="video/mp4" />
        </video>

        {/* Soft depth */}
        <div
          className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.04) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />

        {/* Nav */}
        <nav className="relative z-10 px-8 py-6 flex items-center justify-between">
          <span className="text-sm font-bold tracking-[0.25em] uppercase text-[#111]">Apolo</span>
          <div className="flex items-center gap-5">
            <span className="hidden md:inline text-xs font-mono text-[#999]">BSC Testnet · GenLayer Bradbury</span>
            <span className="w-[7px] h-[7px] rounded-full bg-emerald-500 status-pulse" />
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex items-center px-8 md:px-16 lg:px-24">
          <div className="max-w-3xl">
            <p className="text-xs font-mono text-[#999] uppercase tracking-widest mb-6">
              SLA-verified escrow
            </p>

            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-extrabold tracking-[-0.035em] leading-[0.95] text-[#111] mb-7">
              Deploy. Get paid<br />when it works.
            </h1>

            <p className="text-lg md:text-xl text-[#555] max-w-lg leading-relaxed mb-14">
              SLA-verified escrow for developers. Ship your API, get paid automatically when it's live.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/demo"
                className="group inline-flex items-center gap-2.5 bg-[#111] text-white px-7 py-3 text-sm font-semibold tracking-wide rounded-[12px] transition-all hover:bg-[#222] card-hover"
              >
                <span className="text-[13px] transition-transform group-hover:translate-x-0.5">→</span>
                Execute intent
              </Link>
              <a
                href={`https://testnet.bscscan.com/address/${ESCROW_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2.5 border border-black/10 bg-white/70 backdrop-blur-sm px-7 py-3 text-sm font-medium text-[#444] tracking-wide rounded-[12px] transition-all hover:border-black/20 hover:text-[#111] card-hover"
              >
                <span className="text-[13px] transition-transform group-hover:translate-x-0.5">→</span>
                Inspect on-chain proof
              </a>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="relative z-10 pb-8 flex justify-center">
          <div className="w-px h-10 bg-gradient-to-b from-transparent to-black/15" />
        </div>
      </section>

      {/* ══════════════ PROOF STRIP ══════════════ */}
      <ProofStrip />

      {/* ══════════════ MODULE CARDS ══════════════ */}
      <section className="relative py-24 px-6 md:px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
          {MODULES.map((mod) => (
            <div
              key={mod.index}
              className="card-hover bg-white/70 backdrop-blur-[12px] border border-black/[0.07] rounded-[14px] p-8"
              style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}
            >
              <div className="flex items-center gap-3 mb-6">
                <span className="text-xs font-mono text-[#bbb]">{mod.index}</span>
                <span className="text-xs font-mono font-semibold uppercase tracking-widest text-[#111]">{mod.label}</span>
              </div>
              <p className="text-[15px] text-[#555] leading-relaxed whitespace-pre-line">{mod.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="border-t border-black/[0.06] py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs font-mono text-[#bbb]">
            Apolo Protocol · BSC Testnet · GenLayer Bradbury
          </span>
          <div className="flex items-center gap-6">
            <a
              href={`https://testnet.bscscan.com/address/${ESCROW_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-[#999] hover:text-[#444] transition-colors"
            >
              Escrow ↗
            </a>
            <span className="text-xs font-mono text-[#ccc]">
              {ESCROW_ADDRESS.slice(0, 6)}...{ESCROW_ADDRESS.slice(-4)}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
