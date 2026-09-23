import { useEffect, useState } from 'react';
import { Database, Cpu, Layers, Archive, Sparkles, Zap, Info } from 'lucide-react';
import type { NodeView, OrganismState } from '../types';
import { healthColor, fmtMs, fmtPct } from '../ui';

interface Props {
  state: OrganismState;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onSplice: () => void;
}

const icons = [Database, Cpu, Layers, Archive];

/** Columns by pipeline depth, rows alternating so neighbouring cards never overlap horizontally. */
function layout(nodes: NodeView[]) {
  const depths = Math.max(...nodes.map((n) => n.depth)) + 1;
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) pos.set(n.id, { x: ((n.depth + 0.5) / depths) * 100, y: n.depth % 2 === 0 ? 34 : 66 });
  return pos;
}

export function LivingGraph({ state, selectedNodeId, onSelectNode, onSplice }: Props) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let id: number;
    const loop = () => { setTick((t) => (t + 0.006) % 1); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  const pos = layout(state.nodes);
  const cand = state.candidate;
  const targetPos = cand ? pos.get(cand.targetNodeId) : undefined;
  const candPos = targetPos ? { x: Math.min(88, targetPos.x + 6), y: targetPos.y === 34 ? 72 : 28 } : undefined;

  const banner = (() => {
    const t = state.targetNodeId ? state.nodes.find((n) => n.id === state.targetNodeId)?.name : null;
    switch (state.phase) {
      case 'synthesizing': return `Asking ${state.provider.active} for a patch to ${t}. Recorded failures and slow inputs are in the prompt.`;
      case 'candidate_ready': return cand ? `Candidate for ${t}: fitness ${cand.fitness.score} on ${cand.fitness.corpusSize} recorded inputs, ${cand.fitness.speedup}× faster at p99. ${cand.fitness.score >= state.spliceThreshold ? 'Meets' : 'Below'} the ${state.spliceThreshold} splice threshold.` : '';
      case 'observing': return `${t} was hot-swapped. The sentinel is watching error rate and p95 and will roll back on regression.`;
      default: {
        const bad = state.nodes.filter((n) => n.health !== 'healthy');
        if (bad.length) return `${bad.map((n) => n.name).join(', ')} ${bad.length > 1 ? 'are' : 'is'} ${bad[0].health}. ${state.autonomous ? 'Sentinel will trigger synthesis once it has enough samples.' : 'Synthesize to request a patch.'}`;
        return `All nodes healthy on live traffic. Inject a fault or a surge to exercise the loop.`;
      }
    }
  })();

  return (
    <div className="relative flex-1 min-w-0 min-h-[560px] bg-[#040711] border border-cyan-950/60 rounded-xl overflow-hidden shadow-2xl flex flex-col">
      <div className="absolute inset-0 pointer-events-none hud-grid z-0 opacity-70" />
      <div className="absolute inset-0 pointer-events-none hud-dots z-0 opacity-40" />

      <div className="relative z-10 flex items-center justify-between px-4 py-2 border-b border-cyan-900/30 bg-[#060a17]/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-mono tracking-widest text-cyan-300 font-bold uppercase">Pipeline</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400/80 border border-cyan-800/40">{state.vitals.packetsPerSec} pkt/s</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          {(['healthy', 'degraded', 'faulted'] as const).map((h) => (
            <span key={h} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${healthColor[h].dot}`} />{h}</span>
          ))}
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />candidate</span>
        </div>
      </div>

      <div className="relative flex-1 w-full overflow-hidden select-none">
        {candPos && (
          <div className="absolute rounded-2xl border-2 border-dashed border-emerald-500/40 bg-emerald-950/10 pointer-events-none z-0"
            style={{ left: `${candPos.x - 12}%`, top: `${candPos.y - 17}%`, width: '24%', height: '34%' }}>
            <div className="absolute -top-3 left-4 px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/50 text-[10px] font-mono text-emerald-400 uppercase tracking-wider">isolated vm · evaluated on recorded traffic</div>
          </div>
        )}

        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <defs>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feComposite in="SourceGraphic" in2="b" operator="over" /></filter>
          </defs>
          {state.edges.map((e) => {
            const a = pos.get(e.from)!; const b = pos.get(e.to)!;
            const color = e.degraded ? '#f59e0b' : '#06b6d4';
            const dots = Math.max(1, Math.min(6, Math.round(e.rate / 0.6)));
            return (
              <g key={`${e.from}-${e.to}`}>
                <line x1={`${a.x}%`} y1={`${a.y}%`} x2={`${b.x}%`} y2={`${b.y}%`} stroke={color} strokeWidth={2} strokeOpacity={0.45} filter="url(#glow)" />
                {Array.from({ length: dots }, (_, i) => {
                  const p = (tick + i / dots) % 1;
                  return <circle key={i} cx={`${a.x + (b.x - a.x) * p}%`} cy={`${a.y + (b.y - a.y) * p}%`} r={2.5} fill={color} opacity={0.9} />;
                })}
                <text x={`${(a.x + b.x) / 2}%`} y={`${(a.y + b.y) / 2 - 2}%`} fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle">{e.rate}/s</text>
              </g>
            );
          })}
          {cand && targetPos && candPos && (
            <line x1={`${targetPos.x}%`} y1={`${targetPos.y}%`} x2={`${candPos.x}%`} y2={`${candPos.y}%`} stroke="#10b981" strokeWidth={3} strokeDasharray="6 3" strokeOpacity={0.8} filter="url(#glow)" />
          )}
        </svg>

        {state.nodes.map((n, i) => {
          const p = pos.get(n.id)!;
          const c = healthColor[n.health];
          const Icon = icons[i % icons.length];
          const selected = selectedNodeId === n.id;
          const isTarget = state.targetNodeId === n.id;
          return (
            <div key={n.id} onClick={() => onSelectNode(n.id)} className="absolute cursor-pointer z-20 transition-transform duration-300"
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `translate(-50%, -50%) scale(${selected ? 1.05 : 1})` }}>
              {n.health === 'faulted' && <div className="absolute inset-0 -m-4 rounded-full border-2 border-rose-500/50 animate-ping pointer-events-none" />}
              {isTarget && state.phase === 'observing' && <div className="absolute inset-0 -m-3 rounded-xl bg-cyan-500/15 blur-lg pointer-events-none animate-pulse" />}
              <div className={`relative px-3 py-2.5 rounded-xl border backdrop-blur-md shadow-xl w-[168px] ${c.bg} ${selected ? 'border-white/60' : c.border}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${c.text}`} />
                    <span className={`text-xs font-bold font-mono truncate ${c.text}`}>{n.name}</span>
                  </div>
                  <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-900/80 text-slate-400 border border-slate-700/60">v{n.version}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono mb-1.5 truncate">{n.role}</div>
                <div className="space-y-1 pt-1.5 border-t border-slate-800/80 font-mono text-[10px]">
                  <Row k="p95" v={fmtMs(n.p95)} warn={n.p95 > 25} />
                  <Row k="errors" v={fmtPct(n.windowErrorRate)} warn={n.windowErrorRate > 0} />
                  <Row k="runs" v={String(n.executions)} />
                </div>
              </div>
            </div>
          );
        })}

        {cand && candPos && (
          <div className="absolute z-20" style={{ left: `${candPos.x}%`, top: `${candPos.y}%`, transform: 'translate(-50%, -50%)' }}>
            <div className="absolute inset-0 -m-3 rounded-xl bg-emerald-500/15 blur-lg pointer-events-none animate-pulse" />
            <div className="relative px-3 py-2.5 rounded-xl border border-emerald-500/80 bg-[#051410]/90 backdrop-blur-md shadow-[0_0_30px_rgba(16,185,129,0.3)] w-[176px]">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold font-mono text-emerald-300 truncate">{cand.name}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono mb-1.5 truncate">{cand.provider} / {cand.model}</div>
              <div className="space-y-1 pt-1.5 border-t border-emerald-900/50 font-mono text-[10px]">
                <Row k="fitness" v={String(cand.fitness.score)} good />
                <Row k="pass" v={fmtPct(cand.fitness.passRate)} good={cand.fitness.passRate === 1} warn={cand.fitness.passRate < 1} />
                <Row k="p99" v={fmtMs(cand.fitness.candidate.p99)} />
              </div>
              {state.phase === 'candidate_ready' && (
                <button onClick={(e) => { e.stopPropagation(); onSplice(); }} className="mt-2 w-full py-1 text-[10px] font-mono font-bold rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-1 cursor-pointer">
                  <Zap className="w-3 h-3 fill-current" /> splice into prod
                </button>
              )}
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-4 right-4 z-10">
          <div className="p-2.5 rounded-lg bg-[#060b17]/85 border border-cyan-900/40 backdrop-blur-md flex items-center gap-2 text-xs font-mono text-slate-300">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{banner}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, warn, good }: { k: string; v: string; warn?: boolean; good?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-500">{k}</span>
      <span className={`font-semibold ${warn ? 'text-rose-300' : good ? 'text-emerald-300' : 'text-slate-200'}`}>{v}</span>
    </div>
  );
}
