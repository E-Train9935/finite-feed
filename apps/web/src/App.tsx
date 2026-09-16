import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, BrainCircuit, CheckCircle2, ChevronRight, Clipboard, Command, Cpu, Database,
  Download, FileText, Gauge, History, Home, Keyboard, Layers3, LoaderCircle, MessageSquare, Network,
  Plus, Radio, RefreshCw, Search, Send, Settings2, Share2, Sparkles, Trash2, TriangleAlert, X, Zap,
} from 'lucide-react';
import { api } from './lib/api';
import { firebaseConfigured, initializeClientAuth } from './lib/firebase';
import type { Briefing, BriefingSummary, RetrievedSource, SessionInfo } from './types';
import { CommandPalette } from './components/CommandPalette';
import { SourceInspector } from './components/SourceInspector';
import { ModelReport } from './components/ModelReport';

type View = 'dashboard' | 'results' | 'history' | 'system';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Toast = { id: number; kind: 'success' | 'warning' | 'error'; text: string };

const card = 'rounded-[24px] border border-white/10 bg-[#121624]/80 backdrop-blur-xl shadow-2xl';
const input = 'w-full rounded-[16px] border border-white/10 bg-[#090C15] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-500/50';

function formatMs(ms = 0) { return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`; }
function compact(value = 0) { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }

function buildMarkdown(briefing: Briefing) {
  const sourceMap = new Map(briefing.sources.map((source) => [source.id, source]));
  const lines = [
    '# FINITE_FEED Briefing', '',
    `- Generated: ${new Date(briefing.timestamp).toLocaleString()}`,
    `- Targets: ${briefing.subreddits}`,
    `- Source mode: ${briefing.sourceMode}`,
    `- Models: ${briefing.models.join(' vs ')}`,
    `- Retrieved chunks: ${briefing.sources.length}`, '',
  ];
  Object.values(briefing.modelOutputs).forEach((output) => {
    lines.push(`## ${output.model}`, '', `### ${output.title}`, '', output.executiveSummary, '');
    output.insights.forEach((insight, index) => {
      lines.push(`#### Insight ${index + 1}`, '', insight.text, '');
      if (insight.sourceIds.length) {
        lines.push('Sources:');
        insight.sourceIds.forEach((id) => {
          const source = sourceMap.get(id);
          lines.push(`- [${id}] ${source ? `${source.subreddit} — ${source.title}` : id}`);
        });
        lines.push('');
      }
    });
  });
  lines.push('## Evidence ledger', '');
  briefing.sources.forEach((source) => lines.push(`### ${source.subreddit} — ${source.title}`, '', `- Upvotes: ${source.upvotes}`, `- Comments: ${source.comments}`, `- Rank: ${(source.rankScore * 100).toFixed(1)}%`, source.url ? `- URL: ${source.url}` : '', '', source.text, ''));
  return lines.filter((line) => line !== undefined).join('\n');
}

function Stat({ label, value, accent = 'text-cyan-400' }: { label: string; value: string; accent?: string }) {
  return <div className="rounded-[16px] border border-white/10 bg-[#090C15]/70 p-4"><div className="text-[9px] font-mono uppercase tracking-widest text-slate-600">{label}</div><div className={`mt-2 text-lg font-semibold ${accent}`}>{value}</div></div>;
}

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [history, setHistory] = useState<BriefingSummary[]>([]);
  const [active, setActive] = useState<Briefing | null>(null);
  const [selectedSource, setSelectedSource] = useState<RetrievedSource | null>(null);
  const [subreddits, setSubreddits] = useState('technology, MachineLearning, LocalLLaMA');
  const [focusQuery, setFocusQuery] = useState('What actually changed today, what matters, and what is just noise?');
  const [mode, setMode] = useState<'single' | 'compare'>('compare');
  const [primaryModel, setPrimaryModel] = useState('');
  const [comparisonModel, setComparisonModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const pushToast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 5000);
  }, []);

  const refreshHistory = useCallback(async () => {
    const { briefings } = await api.listBriefings();
    setHistory(briefings);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initializeClientAuth();
        const info = await api.session();
        setSession(info);
        setPrimaryModel(info.inference.defaults.primary || info.inference.models[0] || 'llama3.2:3b');
        setComparisonModel(info.inference.defaults.comparison || info.inference.models[1] || info.inference.models[0] || 'mistral:7b');
        if (info.inference.models.length < 2) setMode('single');
        await refreshHistory();
      } catch (error) {
        pushToast('error', error instanceof Error ? error.message : 'Unable to initialize FINITE_FEED.');
      } finally { setLoading(false); }
    })();
  }, [pushToast, refreshHistory]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((value) => !value); }
      if (mod && event.key === 'Enter') {
        event.preventDefault();
        if (view === 'results' && chatInput.trim()) void handleChat();
        else if (view === 'dashboard') void handleSynthesize();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  useEffect(() => { setChat([]); setChatInput(''); setSelectedSource(active?.sources?.[0] || null); }, [active?.id]);

  const availableModels = session?.inference.models?.length ? session.inference.models : [primaryModel, comparisonModel].filter(Boolean);

  function summarize(briefing: Briefing): BriefingSummary {
    return {
      id: briefing.id, createdAt: briefing.createdAt, timestamp: briefing.timestamp, subreddits: briefing.subreddits,
      targets: briefing.targets, focusQuery: briefing.focusQuery, mode: briefing.mode, models: briefing.models, sourceMode: briefing.sourceMode,
      timings: briefing.timings, retrieval: { chunkCount: briefing.retrieval.chunkCount, selectedCount: briefing.retrieval.selectedCount },
    };
  }

  async function openBriefing(id: string) {
    try {
      const { briefing } = await api.getBriefing(id);
      setActive(briefing);
      setSelectedSource(briefing.sources[0] || null);
      setView('results');
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Unable to load briefing.');
    }
  }

  async function handleSynthesize() {
    if (busy) return;
    const targets = subreddits.split(',').map((part) => part.trim().replace(/^r\//i, '')).filter(Boolean);
    if (!targets.length) return pushToast('warning', 'Add at least one subreddit.');
    const models = mode === 'compare' ? [primaryModel, comparisonModel].filter(Boolean) : [primaryModel].filter(Boolean);
    if (!models.length) return pushToast('warning', 'Choose an inference model.');
    setBusy(true);
    try {
      const { briefing, warnings } = await api.synthesize({ subreddits: targets, focusQuery, mode, models });
      setActive(briefing);
      setSelectedSource(briefing.sources[0] || null);
      setView('results');
      setHistory((prev) => [summarize(briefing), ...prev.filter((item) => item.id !== briefing.id)]);
      if (warnings.length) pushToast('warning', warnings[0]!);
      else pushToast('success', 'Briefing synthesized and archived.');
    } catch (error) { pushToast('error', error instanceof Error ? error.message : 'Synthesis failed.'); }
    finally { setBusy(false); }
  }

  async function handleChat() {
    if (!active || !chatInput.trim() || chatBusy) return;
    const message = chatInput.trim();
    const next = [...chat, { role: 'user', content: message } as ChatMessage];
    setChat(next); setChatInput(''); setChatBusy(true);
    try {
      const { reply } = await api.chat({ briefingId: active.id, model: active.models[0] || primaryModel, message, history: next });
      setChat((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) { pushToast('error', error instanceof Error ? error.message : 'Deep-dive inference failed.'); }
    finally { setChatBusy(false); }
  }

  async function deleteOne(id: string) {
    try {
      await api.deleteBriefing(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (active?.id === id) { setActive(null); setView('history'); }
      pushToast('success', 'Archived run deleted.');
    } catch (error) { pushToast('error', error instanceof Error ? error.message : 'Delete failed.'); }
  }

  async function clearAll() {
    try {
      const { deleted } = await api.clearBriefings();
      setHistory([]); setActive(null); setView('dashboard');
      pushToast('success', `Cleared ${deleted} archived run${deleted === 1 ? '' : 's'}.`);
    } catch (error) { pushToast('error', error instanceof Error ? error.message : 'Unable to clear history.'); }
  }

  async function copyReport() {
    if (!active) return;
    await navigator.clipboard.writeText(buildMarkdown(active));
    pushToast('success', 'Markdown report copied.');
  }

  function downloadReport() {
    if (!active) return;
    const blob = new Blob([buildMarkdown(active)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `finite-feed-${new Date(active.timestamp).toISOString().slice(0, 10)}.md`; anchor.click();
    URL.revokeObjectURL(url);
  }

  async function shareReport() {
    if (!active) return;
    const text = buildMarkdown(active);
    if (navigator.share) {
      try { await navigator.share({ title: 'FINITE_FEED Briefing', text }); return; } catch { return; }
    }
    await navigator.clipboard.writeText(text);
    pushToast('success', 'Native sharing unavailable; report copied instead.');
  }

  const commands = useMemo(() => [
    { id: 'dashboard', label: 'Open synthesis hub', hint: 'G D', keywords: 'home new', action: () => setView('dashboard') },
    { id: 'history', label: 'Open archives', hint: 'G H', keywords: 'history runs', action: () => setView('history') },
    { id: 'results', label: 'Open active briefing', hint: 'G R', keywords: 'report result', disabled: !active, action: () => setView('results') },
    { id: 'run', label: 'Run RAG synthesis', hint: '⌘↵', keywords: 'execute generate', action: () => { setView('dashboard'); setTimeout(() => void handleSynthesize(), 0); } },
    { id: 'copy', label: 'Copy active report as Markdown', keywords: 'export markdown clipboard', disabled: !active, action: () => void copyReport() },
    { id: 'system', label: 'Open system architecture status', keywords: 'health provider storage', action: () => setView('system') },
    { id: 'clear', label: 'Clear archived history', keywords: 'delete reset', disabled: history.length === 0, action: () => void clearAll() },
  ], [active, history.length, busy, subreddits, focusQuery, mode, primaryModel, comparisonModel]);

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#090C15] text-slate-200"><div className="flex items-center gap-3 text-xs font-mono tracking-widest text-cyan-400"><LoaderCircle className="h-4 w-4 animate-spin" /> INITIALIZING FINITE_FEED CORE</div></div>;

  return (
    <div className="min-h-screen bg-[#090C15] text-slate-100 grid-noise selection:bg-cyan-400 selection:text-slate-950">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <div className="fixed right-4 top-4 z-40 flex w-[min(92vw,420px)] flex-col gap-2">
        {toasts.map((toast) => <div key={toast.id} className={`animate-pop rounded-[16px] border p-4 text-xs font-mono backdrop-blur-xl ${toast.kind === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : toast.kind === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>{toast.text}</div>)}
      </div>

      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-white/10 bg-[#090C15]/90 p-5 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:p-7">
          <div className="flex h-full flex-col justify-between gap-8">
            <div>
              <div className="flex items-center justify-between lg:block">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-[9px] font-mono uppercase tracking-widest text-fuchsia-300"><Sparkles className="h-3 w-3" /> FINITE // HYPERCOLOR</div>
                  <div className="mt-3 text-lg font-black tracking-tight text-white">FINITE_FEED</div>
                  <div className="mt-1 text-[10px] font-mono text-slate-600">NO INFINITE SCROLL. JUST SIGNAL.</div>
                </div>
                <button onClick={() => setPaletteOpen(true)} className="rounded-[14px] border border-white/10 p-3 text-slate-400 transition hover:text-cyan-300 lg:mt-5 lg:flex lg:w-full lg:items-center lg:justify-between"><span className="hidden text-[10px] font-mono lg:inline">COMMAND PALETTE</span><Command className="h-4 w-4" /></button>
              </div>

              <nav className="mt-7 grid grid-cols-4 gap-2 lg:grid-cols-1">
                {[
                  { key: 'dashboard' as View, Icon: Home, label: '01 // SYNTHESIS' },
                  { key: 'history' as View, Icon: History, label: '02 // ARCHIVES' },
                  { key: 'results' as View, Icon: FileText, label: '03 // REPORT' },
                  { key: 'system' as View, Icon: Network, label: '04 // SYSTEM' },
                ].map(({ key, Icon, label }) => {
                  const disabled = key === 'results' && !active;
                  return <button key={key} disabled={disabled} onClick={() => setView(key)} className={`flex items-center justify-center gap-3 rounded-[16px] px-3 py-3 text-left text-[10px] font-mono transition lg:justify-start ${view === key ? 'border border-cyan-500/30 bg-gradient-to-r from-fuchsia-500/10 to-cyan-500/10 text-white' : 'border border-transparent text-slate-500 hover:bg-white/[.03] hover:text-slate-200'} disabled:opacity-30`}><Icon className="h-4 w-4" /><span className="hidden lg:inline">{label}</span></button>;
                })}
              </nav>
            </div>

            <div className="hidden space-y-3 border-t border-white/10 pt-5 lg:block">
              <div className="flex items-center justify-between text-[9px] font-mono text-slate-600"><span>IDENTITY</span><span className="text-slate-300">{session?.identity.mode.toUpperCase()}</span></div>
              <div className="flex items-center justify-between text-[9px] font-mono text-slate-600"><span>STORE</span><span className="text-slate-300">{session?.storage.toUpperCase()}</span></div>
              <div className="flex items-center justify-between text-[9px] font-mono text-slate-600"><span>PROVIDER</span><span className="max-w-[130px] truncate text-cyan-400">{session?.inference.provider.toUpperCase()}</span></div>
            </div>
          </div>
        </aside>

        <main className="flex-1 p-5 md:p-8 xl:p-12">
          <div className="mx-auto max-w-[1500px]">
            {view === 'dashboard' && <section className="space-y-7 animate-pop">
              <header className="flex flex-col justify-between gap-5 border-b border-white/10 pb-6 md:flex-row md:items-end">
                <div><div className="text-[10px] font-mono uppercase tracking-[.2em] text-cyan-400">PRODUCTION RAG ORCHESTRATOR</div><h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">Turn noisy feeds into a finite brief.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Server-side ingestion, hybrid retrieval, schema-constrained synthesis, and source-validated evidence in one bounded workflow.</p></div>
                <button onClick={() => setPaletteOpen(true)} className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[.03] px-3 py-2 text-[10px] font-mono text-slate-400"><Keyboard className="h-3.5 w-3.5" />⌘/CTRL + K</button>
              </header>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                <div className={`${card} relative overflow-hidden p-6 md:p-8 xl:col-span-7`}>
                  <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-cyan-500/5 blur-3xl" />
                  <div className="relative"><div className="flex items-center justify-between"><div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">SOURCE TOPOLOGY</div><Radio className="h-4 w-4 text-slate-600" /></div><h2 className="mt-3 text-lg font-semibold">Target communities</h2><p className="mt-2 text-xs leading-5 text-slate-500">Comma-separated subreddit names. Credentials stay on the API server.</p><input value={subreddits} onChange={(e) => setSubreddits(e.target.value)} className={`${input} mt-5`} placeholder="technology, MachineLearning" /></div>
                </div>

                <div className={`${card} p-6 md:p-8 xl:col-span-5`}>
                  <div className="flex items-center justify-between"><div className="text-[10px] font-mono uppercase tracking-widest text-fuchsia-400">INFERENCE ROUTER</div><Cpu className="h-4 w-4 text-slate-600" /></div>
                  <div className="mt-5 grid grid-cols-2 rounded-[14px] border border-white/10 bg-[#090C15] p-1 text-[10px] font-mono"><button onClick={() => setMode('single')} className={`rounded-[11px] py-2 ${mode === 'single' ? 'bg-white/10 text-white' : 'text-slate-600'}`}>SINGLE</button><button disabled={availableModels.length < 2} onClick={() => setMode('compare')} className={`rounded-[11px] py-2 disabled:opacity-30 ${mode === 'compare' ? 'bg-gradient-to-r from-fuchsia-500/20 to-cyan-500/20 text-white' : 'text-slate-600'}`}>COMPARE</button></div>
                  <div className="mt-4 space-y-3"><select value={primaryModel} onChange={(e) => setPrimaryModel(e.target.value)} className={input}>{availableModels.map((modelName) => <option key={modelName}>{modelName}</option>)}</select>{mode === 'compare' && <select value={comparisonModel} onChange={(e) => setComparisonModel(e.target.value)} className={input}>{availableModels.map((modelName) => <option key={modelName}>{modelName}</option>)}</select>}</div>
                </div>

                <div className={`${card} p-6 md:p-8 xl:col-span-8`}>
                  <div className="flex items-center justify-between"><div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">ANALYST INTENT</div><Search className="h-4 w-4 text-slate-600" /></div><textarea value={focusQuery} onChange={(e) => setFocusQuery(e.target.value)} className={`${input} mt-5 min-h-32 resize-none leading-6`} /><div className="mt-3 text-[9px] font-mono text-slate-700">THIS INTENT BECOMES PART OF THE SERVER-SIDE RETRIEVAL QUERY SET.</div>
                </div>

                <div className={`${card} overflow-hidden p-6 md:p-8 xl:col-span-4`}>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">EXECUTION CONTRACT</div><div className="mt-5 space-y-3 text-xs text-slate-400">{['Ingest on server', 'Rank evidence', 'Generate structured JSON', 'Validate source IDs', 'Archive run + telemetry'].map((item, idx) => <div key={item} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-[#090C15] text-[9px] font-mono text-cyan-400">{idx + 1}</span>{item}</div>)}</div>
                </div>

                <div className={`${card} flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:p-8 xl:col-span-12`}>
                  <div><div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">PIPELINE EXECUTION</div><div className="mt-2 text-sm text-slate-300">{busy ? 'Running authenticated server-side RAG pipeline…' : 'Ready. Cmd/Ctrl + Enter also executes.'}</div>{busy && <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-fuchsia-300"><LoaderCircle className="h-4 w-4 animate-spin" /> INGEST → RETRIEVE → INFER → VALIDATE → ARCHIVE</div>}</div>
                  <button disabled={busy} onClick={() => void handleSynthesize()} className="inline-flex min-h-14 items-center justify-center gap-3 rounded-[20px] bg-gradient-to-r from-fuchsia-600 via-violet-600 to-cyan-500 px-8 text-xs font-bold uppercase tracking-[.14em] text-white shadow-lg shadow-cyan-500/15 transition hover:scale-[1.01] disabled:opacity-40"><span>{busy ? 'SYNTHESIZING' : 'RUN FINITE BRIEF'}</span>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}</button>
                </div>

                <div className={`${card} p-6 md:p-8 xl:col-span-12`}>
                  <div className="flex items-center justify-between border-b border-white/10 pb-4"><div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">RECENT RUNS</div><button onClick={() => setView('history')} className="text-[10px] font-mono text-cyan-400">VIEW ALL →</button></div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">{history.slice(0, 3).map((item) => <button key={item.id} onClick={() => void openBriefing(item.id)} className="rounded-[18px] border border-white/10 bg-[#090C15] p-4 text-left transition hover:border-cyan-500/30"><div className="truncate text-xs font-medium text-slate-200">{item.subreddits}</div><div className="mt-2 flex items-center justify-between text-[9px] font-mono text-slate-600"><span>{new Date(item.timestamp).toLocaleDateString()}</span><span>{item.models.length > 1 ? 'COMPARE' : item.models[0]}</span></div></button>)}{!history.length && <div className="text-xs font-mono text-slate-700">NO ARCHIVED RUNS YET.</div>}</div>
                </div>
              </div>
            </section>}

            {view === 'results' && active && <section className="space-y-6 animate-pop">
              <header className="flex flex-col justify-between gap-5 border-b border-white/10 pb-6 md:flex-row md:items-end"><div><button onClick={() => setView('dashboard')} className="mb-3 text-[10px] font-mono text-cyan-400">← NEW SYNTHESIS</button><div className="text-[10px] font-mono uppercase tracking-[.2em] text-fuchsia-400">VALIDATED BRIEFING // {active.sourceMode.toUpperCase()}</div><h1 className="mt-2 text-3xl font-black text-white">{active.subreddits}</h1></div><div className="flex flex-wrap gap-2"><button onClick={() => void copyReport()} className="rounded-[14px] border border-white/10 p-3 text-slate-400 hover:text-white" title="Copy Markdown"><Clipboard className="h-4 w-4" /></button><button onClick={downloadReport} className="rounded-[14px] border border-white/10 p-3 text-slate-400 hover:text-white" title="Download Markdown"><Download className="h-4 w-4" /></button><button onClick={() => void shareReport()} className="rounded-[14px] border border-white/10 p-3 text-slate-400 hover:text-white" title="Share"><Share2 className="h-4 w-4" /></button></div></header>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Stat label="TOTAL" value={formatMs(active.timings.totalMs)} /><Stat label="SOURCE FETCH" value={formatMs(active.timings.sourceFetchMs)} accent="text-fuchsia-400" /><Stat label="RETRIEVAL" value={formatMs(active.timings.retrievalMs)} /><Stat label="INFERENCE" value={formatMs(active.timings.inferenceMs)} accent="text-violet-400" /><Stat label="CHUNKS" value={`${active.retrieval.selectedCount}/${active.retrieval.chunkCount}`} accent="text-emerald-400" /></div>

              <div className="grid gap-5 xl:grid-cols-12"><div className="space-y-5 xl:col-span-8">{Object.values(active.modelOutputs).map((output) => <ModelReport key={output.model} output={output} sources={active.sources} selectedSourceId={selectedSource?.id} onInspect={setSelectedSource} />)}</div><div className="xl:col-span-4"><SourceInspector source={selectedSource} /></div></div>

              <div className={`${card} p-6 md:p-8`}>
                <div className="flex items-center justify-between"><div><div className="text-[10px] font-mono uppercase tracking-widest text-fuchsia-400">CONTEXTUAL DEEP-DIVE</div><div className="mt-2 text-sm text-slate-400">Answers are constrained to this briefing's archived evidence ledger.</div></div><MessageSquare className="h-4 w-4 text-slate-600" /></div>
                <div className="mt-5 max-h-[420px] min-h-52 space-y-3 overflow-y-auto rounded-[18px] border border-white/10 bg-[#090C15] p-4">{!chat.length && <div className="py-16 text-center text-[10px] font-mono text-slate-700">ASK WHY A SIGNAL MATTERS, WHAT SUPPORTS IT, OR WHAT EVIDENCE IS MISSING.</div>}{chat.map((message, index) => <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] whitespace-pre-wrap rounded-[16px] px-4 py-3 text-xs leading-6 ${message.role === 'user' ? 'bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-white' : 'border border-white/10 bg-[#121624] text-slate-300'}`}>{message.content}</div></div>)}{chatBusy && <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400"><LoaderCircle className="h-3 w-3 animate-spin" /> INFERENCING AGAINST ARCHIVED EVIDENCE…</div>}</div>
                <div className="mt-4 flex gap-3"><input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleChat(); } }} placeholder="Ask a bounded follow-up…" className={input} /><button onClick={() => void handleChat()} disabled={chatBusy || !chatInput.trim()} className="rounded-[16px] bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button></div>
              </div>
            </section>}

            {view === 'history' && <section className="space-y-6 animate-pop"><header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end"><div><div className="text-[10px] font-mono uppercase tracking-[.2em] text-fuchsia-400">PERSISTED RUN HISTORY</div><h1 className="mt-2 text-3xl font-black text-white">Archives</h1></div>{history.length > 0 && <button onClick={() => void clearAll()} className="self-start rounded-[14px] border border-rose-500/20 px-4 py-2 text-[10px] font-mono text-rose-300 transition hover:bg-rose-500/10">CLEAR ALL</button>}</header><div className="space-y-3">{history.map((item) => <div key={item.id} className={`${card} flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between`}><button onClick={() => void openBriefing(item.id)} className="flex-1 text-left"><div className="text-sm font-semibold text-white">{item.subreddits}</div><div className="mt-2 flex flex-wrap gap-3 text-[9px] font-mono text-slate-600"><span>{new Date(item.timestamp).toLocaleString()}</span><span>{item.sourceMode.toUpperCase()}</span><span>{item.models.join(' VS ')}</span><span>{formatMs(item.timings.totalMs)}</span></div></button><div className="flex items-center gap-2"><button onClick={() => void openBriefing(item.id)} className="rounded-[14px] border border-white/10 px-4 py-2 text-[10px] font-mono text-cyan-400">OPEN</button><button onClick={() => void deleteOne(item.id)} className="rounded-[14px] border border-white/10 p-2.5 text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button></div></div>)}{!history.length && <div className={`${card} p-14 text-center text-xs font-mono text-slate-700`}>NO ARCHIVED BRIEFINGS.</div>}</div></section>}

            {view === 'system' && <section className="space-y-6 animate-pop"><header className="border-b border-white/10 pb-6"><div className="text-[10px] font-mono uppercase tracking-[.2em] text-cyan-400">DEPLOYMENT + CAPABILITIES</div><h1 className="mt-2 text-3xl font-black text-white">System Core</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">This view exposes what a reviewer should care about: where trust boundaries live, which provider is active, and whether this deployment is running on production adapters or zero-config fallbacks.</p></header><div className="grid gap-5 lg:grid-cols-12"><div className={`${card} p-6 lg:col-span-7`}><div className="text-[10px] font-mono text-fuchsia-400">TRUST BOUNDARIES</div><div className="mt-6 space-y-4">{[
              ['BROWSER', 'React UI + public Firebase client config only'], ['API', 'Auth verification, validation, rate limits, orchestration'], ['SOURCES', 'Reddit OAuth credentials remain server-side'], ['RETRIEVAL', 'Hybrid TF-IDF/BM25 + engagement + freshness + diversity'], ['INFERENCE', 'Server-only provider interface; no browser-to-localhost calls'], ['PERSISTENCE', 'Storage adapter isolates Firestore from UI'],
            ].map(([name, desc], idx) => <div key={name} className="flex gap-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-[#090C15] text-[9px] font-mono text-cyan-400">{idx + 1}</div><div><div className="text-xs font-semibold text-white">{name}</div><div className="mt-1 text-xs leading-5 text-slate-500">{desc}</div></div></div>)}</div></div><div className="space-y-5 lg:col-span-5"><div className={`${card} p-6`}><div className="text-[10px] font-mono text-cyan-400">LIVE CAPABILITIES</div><div className="mt-5 grid grid-cols-2 gap-3"><Stat label="AUTH" value={session?.identity.mode.toUpperCase() || '—'} /><Stat label="FIREBASE WEB" value={firebaseConfigured() ? 'ON' : 'OFF'} accent={firebaseConfigured() ? 'text-emerald-400' : 'text-amber-400'} /><Stat label="STORE" value={session?.storage.toUpperCase() || '—'} /><Stat label="AI" value={session?.inference.provider.toUpperCase() || '—'} accent={session?.inference.available ? 'text-emerald-400' : 'text-amber-400'} /></div></div><div className={`${card} p-6`}><div className="text-[10px] font-mono text-fuchsia-400">AVAILABLE MODELS</div><div className="mt-4 space-y-2">{availableModels.map((modelName) => <div key={modelName} className="flex items-center justify-between rounded-[14px] border border-white/10 bg-[#090C15] px-4 py-3 text-xs"><span className="text-slate-300">{modelName}</span><span className="h-2 w-2 rounded-full bg-cyan-400" /></div>)}</div></div></div></div></section>}

            {view === 'results' && !active && <div className={`${card} p-12 text-center`}><TriangleAlert className="mx-auto h-6 w-6 text-amber-400" /><div className="mt-4 text-sm text-slate-300">No active briefing is loaded.</div><button onClick={() => setView('dashboard')} className="mt-5 text-xs font-mono text-cyan-400">RETURN TO SYNTHESIS</button></div>}
          </div>
        </main>
      </div>
    </div>
  );
}
