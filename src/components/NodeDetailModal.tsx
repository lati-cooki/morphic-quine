import React from 'react';
import { GraphNode } from '../types';
import { 
  X, 
  Cpu, 
  Flame, 
  Sparkles, 
  Database, 
  Activity, 
  ShieldCheck, 
  Zap,
  Code
} from 'lucide-react';

interface NodeDetailModalProps {
  node: GraphNode | null;
  onClose: () => void;
  onHotSplice: () => void;
  isSpliceComplete: boolean;
}

export const NodeDetailModal: React.FC<NodeDetailModalProps> = ({
  node,
  onClose,
  onHotSplice,
  isSpliceComplete,
}) => {
  if (!node) return null;

  const isJit = node.id === 'jit_cache';
  const isCandidate = node.id === 'candidate_ast';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#080d1a] border border-cyan-500/50 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.25)] p-5 font-mono">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-cyan-900/50 mb-4">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg border ${
              isJit
                ? 'bg-amber-950/60 border-amber-500/50 text-amber-400'
                : isCandidate
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400'
                : 'bg-cyan-950/60 border-cyan-500/50 text-cyan-400'
            }`}>
              {isJit ? <Flame className="w-5 h-5 animate-pulse" /> : isCandidate ? <Sparkles className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wider">{node.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                  isJit ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                  isCandidate ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                  'bg-cyan-950 text-cyan-300 border border-cyan-800/40'
                }`}>
                  {node.tag}
                </span>
              </div>
              <p className="text-xs text-slate-400">{node.role}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Telemetry Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 block">LATENCY</span>
            <span className={`text-sm font-bold ${node.latency > 10 ? 'text-amber-400' : 'text-cyan-300'}`}>
              {node.latency} ms
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 block">THROUGHPUT</span>
            <span className="text-sm font-bold text-slate-200">{node.throughput}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 block">MEMORY HEAP</span>
            <span className="text-sm font-bold text-slate-200">{node.memory}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 block">EXEC LOAD</span>
            <span className={`text-sm font-bold ${node.load > 85 ? 'text-amber-400' : 'text-cyan-300'}`}>
              {node.load}%
            </span>
          </div>
        </div>

        {/* Architectural Context & Mitotic status */}
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 mb-4 text-xs space-y-2">
          <div className="text-cyan-400 font-semibold flex items-center gap-1.5">
            <Activity className="w-4 h-4" />
            <span>Topological Node State</span>
          </div>
          <p className="text-slate-300 text-xs leading-relaxed">
            {isJit
              ? 'JIT_Cache is exhibiting autonomous mitotic behavior. Upon encountering heavy hash bucket contention and 18.7ms execution spikes, it cloned its internal state to Candidate_AST_v3 in an isolated sandbox for evolutionary compilation.'
              : isCandidate
              ? 'Candidate_AST_v3 is undergoing live fire mirror testing inside an isolated sandbox containment field. Achieving 99.4% fitness and 14.2x vector acceleration over the scalar bottleneck.'
              : `${node.name} is currently running at optimal capacity inside the active data synapse mesh.`}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition cursor-pointer"
          >
            Close
          </button>

          {(isCandidate || isJit) && !isSpliceComplete && (
            <button
              onClick={() => {
                onHotSplice();
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-emerald-400 hover:from-amber-400 hover:to-emerald-300 text-slate-950 text-xs font-bold font-mono transition flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Hot-Splice Candidate AST</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
