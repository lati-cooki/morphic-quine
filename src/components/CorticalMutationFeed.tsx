import React, { useState } from 'react';
import { AstDiffSnippet, ReflectionLog } from '../types';
import { 
  GitCompare, 
  Terminal, 
  Brain, 
  CheckCircle2, 
  Copy, 
  Sparkles,
  Zap,
  Code,
  ShieldCheck,
  Filter
} from 'lucide-react';

interface CorticalMutationFeedProps {
  astDiff: AstDiffSnippet;
  reflectionLogs: ReflectionLog[];
  isSpliceComplete: boolean;
  onHotSplice: () => void;
  onAddReflectionThought: (text: string) => void;
}

export const CorticalMutationFeed: React.FC<CorticalMutationFeedProps> = ({
  astDiff,
  reflectionLogs,
  isSpliceComplete,
  onHotSplice,
  onAddReflectionThought,
}) => {
  const [activeTab, setActiveTab] = useState<'diff' | 'logs'>('diff');
  const [logFilter, setLogFilter] = useState<'ALL' | 'THOUGHT' | 'MITOSIS' | 'REFLEX'>('ALL');
  const [copied, setCopied] = useState(false);

  const filteredLogs = reflectionLogs.filter((log) => {
    if (logFilter === 'ALL') return true;
    return log.level === logFilter;
  });

  const handleCopyDiff = () => {
    const text = astDiff.changes.map((c) => c.text).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full lg:w-96 flex flex-col bg-[#060a16]/90 border border-cyan-950/60 rounded-xl p-3.5 backdrop-blur-md shadow-xl max-h-[850px] overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-cyan-900/30 mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <h2 className="text-xs font-bold font-mono tracking-widest uppercase text-purple-300">
            Cortical Mutation Feed
          </h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/40">
          HOT-SPLICING RUNTIME
        </span>
      </div>

      {/* Segmented Control Tabs */}
      <div className="flex rounded-lg bg-slate-950/80 p-1 border border-slate-800/80 mb-3 font-mono text-xs">
        <button
          onClick={() => setActiveTab('diff')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition cursor-pointer ${
            activeTab === 'diff'
              ? 'bg-purple-950/80 text-purple-200 font-semibold border border-purple-700/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitCompare className="w-3.5 h-3.5 text-purple-400" />
          <span>Live AST Diff</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-purple-950/80 text-purple-200 font-semibold border border-purple-700/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span>Self-Reflection Log</span>
        </button>
      </div>

      {/* Tab 1: Live AST Diff */}
      {activeTab === 'diff' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-2.5">
          {/* Metadata Banner */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-purple-900/40 font-mono text-xs">
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-400 text-[10px]">TARGET NODE:</span>
              <span className="font-bold text-amber-300">{astDiff.nodeTarget}</span>
            </div>
            <div className="text-[11px] text-purple-300 mb-2">
              Strategy: {astDiff.strategy}
            </div>

            {/* Fitness Differential */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
              <div>
                <span className="text-slate-500 text-[10px] block">PREVIOUS FITNESS</span>
                <span className="font-bold text-amber-400">{astDiff.previousFitness}%</span>
              </div>
              <div>
                <span className="text-emerald-400/80 text-[10px] block">CANDIDATE FITNESS</span>
                <span className="font-bold text-emerald-300 flex items-center gap-1">
                  {astDiff.candidateFitness}%
                  <span className="text-[9px] text-emerald-400 bg-emerald-950/80 px-1 py-0.2 rounded">
                    +31.2%
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Syntax Diff Code Viewer */}
          <div className="flex-1 flex flex-col min-h-0 rounded-lg bg-[#04060c] border border-slate-800 overflow-hidden font-mono text-[11px]">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/70 border-b border-slate-800 text-slate-400 text-[10px]">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Code className="w-3 h-3 text-purple-400" />
                <span>memory://candidate_ast_v3.ir</span>
              </span>
              <button
                onClick={handleCopyDiff}
                className="hover:text-white transition flex items-center gap-1 cursor-pointer"
                title="Copy Diff Snippet"
              >
                <Copy className="w-3 h-3" />
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5 select-text font-mono text-[11px] leading-relaxed">
              {astDiff.changes.map((change, idx) => (
                <div
                  key={idx}
                  className={`flex items-start px-1.5 py-0.5 rounded font-mono ${
                    change.type === 'add'
                      ? 'bg-emerald-950/50 text-emerald-300 border-l-2 border-emerald-500'
                      : change.type === 'remove'
                      ? 'bg-rose-950/40 text-rose-400/80 border-l-2 border-rose-500/80 line-through opacity-75'
                      : 'text-slate-400'
                  }`}
                >
                  <span className="w-6 text-[9px] text-slate-600 select-none shrink-0 font-mono">
                    {change.line}
                  </span>
                  <span className="whitespace-pre overflow-x-auto">{change.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hot-Splice Action Bar */}
          <div className="pt-2">
            {!isSpliceComplete ? (
              <button
                onClick={onHotSplice}
                className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 hover:from-amber-400 hover:to-emerald-300 text-slate-950 font-mono text-xs font-bold transition flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>HOT-SPLICE MUTATION INTO PRODUCTION</span>
              </button>
            ) : (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 font-mono text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>HOT-SPLICED: RUNNING IN PROD</span>
                </span>
                <span className="text-[10px] bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-200">
                  GEN 15.0 ACTIVE
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Self-Reflection Log */}
      {activeTab === 'logs' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-2.5">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 overflow-x-auto pb-1">
            <Filter className="w-3 h-3 text-slate-500 shrink-0" />
            {(['ALL', 'THOUGHT', 'MITOSIS', 'REFLEX'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setLogFilter(filter)}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  logFilter === filter
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Monologue Feed Container */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 font-mono text-xs">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1 hover:border-purple-900/50 transition"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className={`px-1.5 py-0.2 rounded font-semibold ${
                    log.level === 'THOUGHT'
                      ? 'bg-purple-950 text-purple-300 border border-purple-800/50'
                      : log.level === 'MITOSIS'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                      : log.level === 'REFLEX'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800/50'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-800/50'
                  }`}>
                    [{log.level}]
                  </span>
                  <span className="text-slate-500">{log.time}</span>
                </div>

                <p className="text-slate-200 text-[11px] leading-relaxed font-mono">
                  “{log.message}”
                </p>

                {log.details && (
                  <p className="text-[10px] text-slate-400 border-t border-slate-900 pt-1">
                    {log.details}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Quick Monologue Trigger */}
          <div className="pt-1">
            <button
              onClick={() =>
                onAddReflectionThought(
                  'Bottleneck isolated in core loop #12. Generating optimized vectorized branch... Hot-swap simulation successful.'
                )
              }
              className="w-full py-1.5 px-2 text-[10px] font-mono rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Simulate Cognitive Monologue Cycle</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
