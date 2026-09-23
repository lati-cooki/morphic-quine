import { Activity, Flame, Gauge, Zap } from 'lucide-react';
import type { NodeView, Vitals as VitalsT } from '../types';
import { fmtMs, fmtPct } from '../ui';

interface Props {
  vitals: VitalsT;
  nodes: NodeView[];
  onInject: (kind: 'MALFORMED' | 'SURGE' | 'NORMAL', count?: number) => void;
}

function Dial({ value, max, label, sub, color }: { value: number; max: number; label: string; sub: string; color: string }) {
  const r = 38; const c = 2 * Math.PI * r;
  const frac = Math.min(1, value / max);
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 relative">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="text-slate-800" strokeWidth="7" stroke="currentColor" fill="transparent" />
        <circle cx="50" cy="50" r={r} stroke={color} strokeWidth="7" strokeDasharray={c} strokeDashoffset={c - frac * c} strokeLinecap="round" fill="transparent" className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold font-mono text-white leading-none">{sub}</span>
        <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mt-1">{label}</span>
      </div>
    </div>
  );
}

export function Vitals({ vitals: v, nodes, onInject }: Props) {
  const heapFrac = v.heapTotalMB ? v.heapUsedMB / v.heapTotalMB : 0;
  const maxCount = Math.max(1, ...v.histogram.map((h) => h.count));
  const unhealthy = nodes.filter((n) => n.health !== 'healthy');

  return (
    <div className="w-full xl:w-72 shrink-0 flex flex-col gap-3.5 bg-[#060a16]/90 border border-cyan-950/60 rounded-xl p-3.5 backdrop-blur-md shadow-xl">
      <div className="flex items-center justify-between pb-2.5 border-b border-cyan-900/30">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold font-mono tracking-widest uppercase text-cyan-300">Process vitals</h2>
        </div>
        <span className="text-[10px] font-mono text-slate-500">up {Math.floor(v.uptimeSec / 60)}m{v.uptimeSec % 60}s</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Dial value={v.eventLoopLagMs} max={100} label="loop lag" sub={`${v.eventLoopLagMs}ms`} color={v.eventLoopLagMs > 30 ? '#f59e0b' : '#06b6d4'} />
        <Dial value={heapFrac} max={1} label="heap used" sub={`${Math.round(heapFrac * 100)}%`} color={heapFrac > 0.85 ? '#ec4899' : '#38bdf8'} />
      </div>

      <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-[11px]">
        <KV k="heap" v={`${v.heapUsedMB} / ${v.heapTotalMB} MB`} />
        <KV k="rss" v={`${v.rssMB} MB`} />
        <KV k="gc churn" v={`${v.gcChurnMBs} MB/s`} />
        <KV k="throughput" v={`${v.packetsPerSec} pkt/s`} />
        <KV k="error rate" v={fmtPct(v.errorRate)} tone={v.errorRate > 0 ? 'text-rose-300' : 'text-emerald-300'} />
        <KV k="p50 / p95 / p99" v={`${v.p50} / ${v.p95} / ${v.p99} ms`} tone={v.p99 > 25 ? 'text-amber-300' : undefined} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">Latency, last 10 s</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">{v.histogram.reduce((a, b) => a + b.count, 0)} pkts</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
          <div className="grid grid-cols-6 gap-1 h-16 items-end">
            {v.histogram.map((h, i) => (
              <div key={h.range} className="flex flex-col items-center h-full justify-end group relative">
                <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-slate-700 text-[9px] font-mono px-1 rounded whitespace-nowrap z-30 text-white">{h.count}</div>
                <div className={`w-full rounded-t transition-all duration-500 ${i >= 3 && h.count > 0 ? 'bg-gradient-to-t from-amber-600 to-red-500' : 'bg-gradient-to-t from-cyan-900 to-cyan-500 opacity-80'}`}
                  style={{ height: `${h.count ? Math.max(6, (h.count / maxCount) * 100) : 2}%` }} />
                <span className="text-[8px] font-mono text-slate-400 mt-1 truncate w-full text-center">{h.range}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`p-3 rounded-lg border ${unhealthy.length ? 'bg-rose-950/20 border-rose-500/50' : 'bg-slate-950/40 border-slate-800/60'}`}>
        <div className="font-mono text-xs">
          <div className={`font-bold uppercase tracking-wider ${unhealthy.length ? 'text-rose-300' : 'text-slate-400'}`}>Node health</div>
          <ul className="mt-1.5 space-y-1 text-[11px]">
            {nodes.map((n) => (
              <li key={n.id} className="flex justify-between">
                <span className="text-slate-300">{n.name}</span>
                <span className={n.health === 'healthy' ? 'text-cyan-300' : n.health === 'degraded' ? 'text-amber-300' : 'text-rose-300'}>
                  {n.health}{n.health !== 'healthy' ? ` · ${n.health === 'faulted' ? fmtPct(n.windowErrorRate) + ' err' : fmtMs(n.p95) + ' p95'}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center gap-2">
          <button onClick={() => onInject('MALFORMED', 3)} className="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 cursor-pointer flex items-center justify-center gap-1">
            <Flame className="w-3 h-3" /> malformed ×3
          </button>
          <button onClick={() => onInject('SURGE', 2)} className="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer flex items-center justify-center gap-1">
            <Zap className="w-3 h-3" /> oversized ×2
          </button>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{k}</span>
      <span className={`font-semibold ${tone ?? 'text-slate-200'}`}>{v}</span>
    </div>
  );
}
