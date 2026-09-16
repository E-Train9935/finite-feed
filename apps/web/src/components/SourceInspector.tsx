import { ExternalLink, MessageSquare, Radio } from 'lucide-react';
import type { RetrievedSource } from '../types';

const pct = (v: number) => `${Math.round((v || 0) * 100)}%`;

export function SourceInspector({ source }: { source: RetrievedSource | null }) {
  if (!source) return (
    <div className="sticky top-6 rounded-[24px] border border-white/10 bg-[#121624]/80 p-6 backdrop-blur-xl">
      <div className="text-[10px] font-mono uppercase tracking-[.18em] text-cyan-400">SOURCE INSPECTOR</div>
      <div className="mt-16 text-center text-xs font-mono text-slate-600">HOVER OR CLICK AN INSIGHT CITATION TO TRACE ITS RAW EVIDENCE.</div>
    </div>
  );

  return (
    <div className="sticky top-6 overflow-hidden rounded-[24px] border border-cyan-500/25 bg-[#121624]/90 p-6 shadow-hyper backdrop-blur-xl">
      <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-500/5 blur-3xl" />
      <div className="relative space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[.18em] text-cyan-400">TRACEABLE EVIDENCE</div>
            <div className="mt-2 text-sm font-semibold text-white">{source.subreddit}</div>
          </div>
          {source.url && <a href={source.url} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 p-2 text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-400"><ExternalLink className="h-4 w-4" /></a>}
        </div>
        <div>
          <h3 className="text-base font-semibold leading-snug text-slate-100">{source.title}</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono text-slate-500">
            <span className="rounded-full border border-white/10 px-2 py-1">▲ {source.upvotes.toLocaleString()}</span>
            <span className="rounded-full border border-white/10 px-2 py-1"><MessageSquare className="mr-1 inline h-3 w-3" />{source.comments.toLocaleString()}</span>
            <span className="rounded-full border border-white/10 px-2 py-1"><Radio className="mr-1 inline h-3 w-3" />RANK {pct(source.rankScore)}</span>
          </div>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-[#090C15] p-4">
          <div className="mb-2 text-[9px] font-mono uppercase tracking-widest text-fuchsia-400">EXACT RETRIEVED CHUNK</div>
          <p className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{source.text}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          {[['TF-IDF', source.lexicalScore], ['BM25', source.bm25Score], ['ENGAGE', source.engagementScore], ['FRESH', source.freshnessScore]].map(([label, value]) => (
            <div key={String(label)} className="rounded-[14px] border border-white/10 bg-white/[.02] p-3"><div className="text-slate-600">{String(label)}</div><div className="mt-1 text-slate-200">{pct(Number(value))}</div></div>
          ))}
        </div>
        <div className="break-all text-[9px] font-mono text-slate-700">{source.id}</div>
      </div>
    </div>
  );
}
