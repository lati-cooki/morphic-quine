import { Cpu, Flame, Gauge, Zap, RotateCcw, Sparkles, Bot, Hand, X } from 'lucide-react';
import type { OrganismState } from '../types';
import { phaseLabel, phaseTone } from '../ui';

interface Props {
  state: OrganismState;
  connected: boolean;
  onInject: (kind: 'MALFORMED' | 'SURGE' | 'NORMAL', count?: number) => void;
  onSynthesize: () => void;
  onSplice: () => void;
  onDiscard: () => void;
  onRollback: () => void;
  onToggleAutonomous: () => void;
}

const btn = 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded border transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed';

export function HudHeader({ state, connected, onInject, onSynthesize, onSplice, onDiscard, onRollback, onToggleAutonomous }: Props) {
  const canSynth = state.phase === 'idle';
  const canSplice = state.phase === 'candidate_ready';
  const target = state.targetNodeId ? state.nodes.find((n) => n.id === state.targetNodeId)?.name : null;

  return (
    <header className="border-b border-cyan-900/40 bg-[#070b14]/90 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 relative z-30">
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
          <Cpu className="w-5 h-5 text-cyan-400" />
          <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-wider font-display uppercase text-white flex items-center gap-2">
            Morphic
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">gen {state.generation}</span>
          </h1>
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
            <span title={state.pipeline.description}>pipeline: {state.pipeline.name}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-500">{state.stateHash.slice(0, 12)}</span>
            <span className="text-slate-600">·</span>
            <span className={connected ? 'text-emerald-400' : 'text-rose-400'}>{connected ? 'live' : 'disconnected'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 font-mono text-xs">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${phaseTone[state.phase]}`}>
          <span className="font-bold tracking-wide">{phaseLabel[state.phase]}</span>
          {target && <span className="text-[10px] opacity-70 border-l border-current/30 pl-2">{target}</span>}
          {state.activeGoal && <span className="text-[10px] opacity-70 border-l border-current/30 pl-2">goal {state.activeGoal}</span>}
          {state.phase === 'candidate_ready' && state.candidate && (
            <span className="text-[10px] opacity-70 border-l border-current/30 pl-2">fitness {state.candidate.fitness.score}</span>
          )}
        </div>
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700/60 text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>{state.provider.active}</span>
          <span className="text-slate-500">/ {state.provider.model}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => onInject('MALFORMED', 3)} className={`${btn} bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30`} title="Send 3 packets with no usable payload">
          <Flame className="w-3.5 h-3.5" /> Inject fault
        </button>
        <button onClick={() => onInject('SURGE', 2)} className={`${btn} bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30`} title="Send 2 packets with an oversized payload">
          <Gauge className="w-3.5 h-3.5" /> Inject surge
        </button>
        <button onClick={onToggleAutonomous} className={`${btn} ${state.autonomous ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40' : 'bg-slate-800 text-slate-300 border-slate-600'}`} title="When on, the sentinel synthesizes on breach and splices above the fitness threshold">
          {state.autonomous ? <Bot className="w-3.5 h-3.5" /> : <Hand className="w-3.5 h-3.5" />} {state.autonomous ? 'autonomous' : 'manual'}
        </button>
        <button onClick={onSynthesize} disabled={!canSynth} className={`${btn} bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border-purple-500/40`} title="Ask the provider for a patch to the worst node">
          <Sparkles className="w-3.5 h-3.5" /> Synthesize
        </button>
        {canSplice ? (
          <>
            <button onClick={onSplice} className={`${btn} bg-gradient-to-r from-amber-500 to-emerald-500 text-slate-950 border-transparent font-semibold shadow-[0_0_18px_rgba(16,185,129,0.35)]`}>
              <Zap className="w-3.5 h-3.5 fill-current" /> Splice
            </button>
            <button onClick={onDiscard} className={`${btn} bg-slate-800 text-slate-300 border-slate-600`} title="Throw the candidate away">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button onClick={onRollback} disabled={!state.canRollback} className={`${btn} bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600`} title="Revert the most recent splice">
            <RotateCcw className="w-3.5 h-3.5" /> Rollback
          </button>
        )}
      </div>
    </header>
  );
}
