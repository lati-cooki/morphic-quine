import type { NodeHealth, Phase, LogLevel } from './types';

export const healthColor: Record<NodeHealth, { text: string; border: string; dot: string; bg: string }> = {
  healthy: { text: 'text-cyan-300', border: 'border-cyan-800/70', dot: 'bg-cyan-400', bg: 'bg-[#070c18]/90' },
  degraded: { text: 'text-amber-300', border: 'border-amber-500/80', dot: 'bg-amber-400', bg: 'bg-[#150e05]/90' },
  faulted: { text: 'text-rose-300', border: 'border-rose-500/80', dot: 'bg-rose-400', bg: 'bg-[#170608]/90' },
};

export const phaseLabel: Record<Phase, string> = {
  idle: 'IDLE',
  synthesizing: 'SYNTHESIZING PATCH',
  candidate_ready: 'CANDIDATE READY',
  observing: 'OBSERVING SPLICE',
};

export const phaseTone: Record<Phase, string> = {
  idle: 'bg-slate-800/70 border-slate-600 text-slate-300',
  synthesizing: 'bg-purple-500/10 border-purple-500/50 text-purple-200 animate-pulse',
  candidate_ready: 'bg-emerald-500/10 border-emerald-500/50 text-emerald-200',
  observing: 'bg-cyan-500/10 border-cyan-500/50 text-cyan-200',
};

export const levelTone: Record<LogLevel, string> = {
  INFO: 'bg-slate-800 text-slate-300 border-slate-700',
  FAULT: 'bg-rose-950 text-rose-300 border-rose-800/60',
  SENTINEL: 'bg-amber-950 text-amber-300 border-amber-800/60',
  SYNTH: 'bg-purple-950 text-purple-300 border-purple-800/60',
  EVAL: 'bg-indigo-950 text-indigo-300 border-indigo-800/60',
  SPLICE: 'bg-emerald-950 text-emerald-300 border-emerald-800/60',
  ROLLBACK: 'bg-orange-950 text-orange-300 border-orange-800/60',
  GOAL: 'bg-teal-950 text-teal-300 border-teal-800/60',
};

export const fmtMs = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ms';
export const fmtPct = (n: number) => (n * 100).toFixed(n * 100 >= 10 ? 0 : 1) + '%';
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour12: false });
