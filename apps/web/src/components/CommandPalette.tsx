import { useEffect, useMemo, useState } from 'react';
import { Command, Search } from 'lucide-react';

type PaletteCommand = { id: string; label: string; hint?: string; keywords?: string; action: () => void; disabled?: boolean };

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: PaletteCommand[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const filtered = useMemo(() => commands.filter((cmd) => !cmd.disabled && `${cmd.label} ${cmd.keywords || ''}`.toLowerCase().includes(query.toLowerCase())), [commands, query]);

  useEffect(() => { if (open) { setQuery(''); setSelected(0); } }, [open]);
  useEffect(() => { setSelected((current) => Math.min(current, Math.max(0, filtered.length - 1))); }, [filtered.length]);
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((value) => Math.min(value + 1, filtered.length - 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((value) => Math.max(value - 1, 0)); }
      if (event.key === 'Enter' && filtered[selected]) { event.preventDefault(); filtered[selected]!.action(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selected, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 md:p-20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mx-auto max-w-2xl overflow-hidden rounded-[24px] border border-white/10 bg-[#0D1220] shadow-2xl animate-pop">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <Search className="h-4 w-4 text-cyan-400" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search commands..." className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
          <span className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-mono text-slate-500">ESC</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {filtered.map((cmd, index) => (
            <button key={cmd.id} onMouseEnter={() => setSelected(index)} onClick={() => { cmd.action(); onClose(); }} className={`flex w-full items-center justify-between rounded-[16px] px-4 py-3 text-left transition ${selected === index ? 'bg-gradient-to-r from-fuchsia-500/15 to-cyan-500/15 text-white' : 'text-slate-400 hover:text-white'}`}>
              <span className="text-sm">{cmd.label}</span><span className="text-[10px] font-mono text-cyan-400">{cmd.hint}</span>
            </button>
          ))}
          {!filtered.length && <div className="p-8 text-center text-xs font-mono text-slate-600">NO COMMAND MATCH</div>}
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 px-5 py-3 text-[10px] font-mono text-slate-600"><Command className="h-3 w-3" /> FINITE_FEED COMMAND CORE</div>
      </div>
    </div>
  );
}
