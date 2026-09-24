import { X, Sparkles, Crosshair } from 'lucide-react';
import type { NodeView, OrganismState } from '../types';
import { healthColor, fmtMs, fmtPct } from '../ui';

interface Props { node: NodeView | null; state: OrganismState; onClose: () => void; onSynthesize: (id: string) => void; onProbe: (id: string) => void }

export function NodeDetailModal({ node, state, onClose, onSynthesize, onProbe }: Props) {
  if (!node) return null;
  const c = healthColor[node.health];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl bg-[#080d1a] border border-cyan-500/50 rounded-2xl shadow-2xl p-5 font-mono max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between pb-3 border-b border-cyan-900/50 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-wider">{node.name}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${c.text} ${c.border}`}>{node.health}</span>
              <span className="text-[10px] px-2 py-0.5 rounded border border-slate-700 text-slate-400">v{node.version}</span>
            </div>
            <p className="text-xs text-slate-400">{node.role}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 text-xs">
          <Stat l="p50 / p95" v={`${fmtMs(node.p50)} / ${fmtMs(node.p95)}`} />
          <Stat l="window errors" v={fmtPct(node.windowErrorRate)} tone={node.windowErrorRate > 0 ? 'text-rose-300' : undefined} />
          <Stat l="lifetime" v={`${node.executions} runs · ${node.errors} err`} />
          <Stat l="recorded" v={`${node.recordedInputs} inputs · ${node.recordedFailures} fail · ${node.adversarialInputs} adversarial`} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3 text-[11px]">
          <ContractBox label="may assume (input)" c={node.inputContract} />
          <ContractBox label="must emit (output)" c={node.emits} />
        </div>

        {node.lastError && <div className="mb-3 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs break-all">{node.lastError}</div>}

        <div className="flex-1 min-h-0 rounded-lg bg-[#03050a] border border-slate-800 overflow-auto">
          <pre className="p-3 text-[11px] leading-relaxed text-slate-300 whitespace-pre">{node.source}</pre>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-800 text-xs">
          <span className="text-slate-500">recorded and adversarial inputs form the verification corpus</span>
          <div className="flex items-center gap-2">
          <button onClick={() => onProbe(node.id)} disabled={state.phase !== 'idle'} className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" title={`Ask ${state.attacker.name} to find inputs that break this node's live code`}>
            <Crosshair className="w-3.5 h-3.5" /> probe with {state.attacker.name}
          </button>
          <button onClick={() => onSynthesize(node.id)} disabled={state.phase !== 'idle'} className="px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 border border-purple-500/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            <Sparkles className="w-3.5 h-3.5" /> synthesize patch
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContractBox({ label, c }: { label: string; c: Record<string, string> | null }) {
  return (
    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      {c && Object.keys(c).length ? (
        <div className="flex flex-wrap gap-1">
          {Object.entries(c).map(([k, v]) => <span key={k} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300"><span className="text-cyan-300">{k}</span><span className="text-slate-500">: </span>{v}</span>)}
        </div>
      ) : <span className="text-slate-500">none declared · any object</span>}
    </div>
  );
}

function Stat({ l, v, tone }: { l: string; v: string; tone?: string }) {
  return <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800"><span className="text-[10px] text-slate-500 block">{l}</span><span className={`font-bold ${tone ?? 'text-slate-200'}`}>{v}</span></div>;
}
