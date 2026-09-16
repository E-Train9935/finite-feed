import { Gauge, Link2, ShieldCheck, Timer } from 'lucide-react';
import type { ModelOutput, RetrievedSource } from '../types';

export function ModelReport({ output, sources, selectedSourceId, onInspect }: { output: ModelOutput; sources: RetrievedSource[]; selectedSourceId?: string | null; onInspect: (source: RetrievedSource) => void }) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const coverage = Math.round((output.metrics.citationCoverage || 0) * 100);
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#121624]/80 p-6 md:p-7 backdrop-blur-xl shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[.18em] text-fuchsia-400">MODEL OUTPUT</div>
          <h2 className="mt-2 text-xl font-bold text-white">{output.model}</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] font-mono text-slate-400">
          <span className="rounded-full border border-white/10 px-2 py-1"><Timer className="mr-1 inline h-3 w-3" />{output.metrics.latencyMs}ms</span>
          <span className="rounded-full border border-white/10 px-2 py-1"><Link2 className="mr-1 inline h-3 w-3" />{coverage}% cited</span>
          <span className={`rounded-full border px-2 py-1 ${output.metrics.fallback ? 'border-amber-500/30 text-amber-300' : 'border-emerald-500/30 text-emerald-300'}`}><ShieldCheck className="mr-1 inline h-3 w-3" />{output.metrics.fallback ? 'fallback' : 'model'}</span>
        </div>
      </div>

      <div className="mt-6 rounded-[18px] border border-white/10 bg-[#090C15] p-5">
        <div className="text-[9px] font-mono uppercase tracking-widest text-cyan-400">{output.title}</div>
        <p className="mt-3 text-sm leading-7 text-slate-300">{output.executiveSummary}</p>
      </div>

      <div className="mt-5 space-y-4">
        {output.insights.map((insight, index) => (
          <div key={`${output.model}-${index}`} className="group rounded-[18px] border border-white/10 bg-white/[.018] p-5 transition hover:border-cyan-500/25">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[9px] font-mono uppercase tracking-widest text-slate-600">INSIGHT {String(index + 1).padStart(2, '0')}</span>
              <span className={`text-[9px] font-mono ${insight.sourceIds.length ? 'text-emerald-400' : 'text-amber-400'}`}>{insight.sourceIds.length ? `${insight.sourceIds.length} VERIFIED SOURCE${insight.sourceIds.length === 1 ? '' : 'S'}` : 'UNVERIFIED'}</span>
            </div>
            <p className="text-sm leading-7 text-slate-200">{insight.text}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {insight.sourceIds.map((id) => {
                const source = sourceMap.get(id);
                if (!source) return null;
                const active = selectedSourceId === id;
                return (
                  <button key={id} onMouseEnter={() => onInspect(source)} onFocus={() => onInspect(source)} onClick={() => onInspect(source)} className={`rounded-full border px-3 py-1.5 text-[10px] font-mono transition ${active ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-white/10 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300'}`}>
                    {source.subreddit} · {source.title.slice(0, 44)}{source.title.length > 44 ? '…' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2 text-[9px] font-mono text-slate-600"><Gauge className="h-3 w-3" /> structured output · server-validated source ids</div>
    </div>
  );
}
