import { GitBranch, Save, ShieldCheck } from 'lucide-react';
import type { OrganismState } from '../types';

export function LineageBar({ state, onExport }: { state: OrganismState; onExport: () => void }) {
  const active = state.lineage.filter((e) => !e.rolledBack).length;
  return (
    <div className="border-t border-cyan-900/40 bg-[#070b14]/95 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 relative z-20 font-mono">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/70 border border-cyan-500/40">
          <GitBranch className="w-4 h-4 text-cyan-400" />
          <div className="flex flex-col">
            <span className="text-[9px] text-cyan-400/80 uppercase tracking-widest leading-none">lineage</span>
            <span className="text-sm font-bold text-white leading-tight">gen {state.generation}</span>
          </div>
        </div>
        <div className="hidden sm:flex flex-col text-[11px] text-slate-400">
          <span>{active} active splice{active === 1 ? '' : 's'}, {state.lineage.length - active} rolled back</span>
          <span className="text-[10px] text-slate-500">state hash {state.stateHash.slice(0, 16)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/60 text-xs" title={state.spend.priceKnown ? 'Estimated at list price from provider-reported tokens' : `No price table entry for ${state.provider.model}; tokens are counted but cost reads $0`}>
        <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
        <span className="text-slate-300">
          model spend today <span className="text-white font-semibold">${state.spend.today.estUsd.toFixed(3)}</span>
          <span className="text-slate-500"> · {state.spend.today.calls} calls · {(state.spend.today.inputTokens / 1000).toFixed(1)}k in / {(state.spend.today.outputTokens / 1000).toFixed(1)}k out</span>
          {state.spend.dailyBudgetUsd != null && <span className={state.spend.today.estUsd >= state.spend.dailyBudgetUsd ? 'text-rose-300' : 'text-slate-400'}> · cap ${state.spend.dailyBudgetUsd.toFixed(2)}</span>}
        </span>
      </div>
      <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer" title="Write the live pipeline as a runnable .mjs with the lineage table in its header">
        <Save className="w-3.5 h-3.5" /> export snapshot
      </button>
    </div>
  );
}
