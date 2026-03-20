export default function PipelineStep({ step, badgeClass }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950 p-4">
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
  );
}
