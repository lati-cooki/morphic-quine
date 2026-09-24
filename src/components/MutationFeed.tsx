import { useState } from 'react';
import { Brain, GitCompare, Terminal, ListChecks, GitBranch, Zap, X, Copy, Target, Sparkles } from 'lucide-react';
import type { OrganismState } from '../types';
import { levelTone, fmtTime, fmtPct, fmtMs } from '../ui';

interface Props {
  state: OrganismState;
  onSplice: () => void;
  onDiscard: () => void;
  onSynthesizeGoal: (nodeId: string, goal: string) => void;
}

type Tab = 'diff' | 'fitness' | 'log' | 'lineage' | 'goals';

export function MutationFeed({ state, onSplice, onDiscard, onSynthesizeGoal }: Props) {
  const [tab, setTab] = useState<Tab>('log');
  const [copied, setCopied] = useState(false);
  const live = state.candidate;
  const cand = live ?? state.lastCandidate;
  const outcome = live ? null : state.lastCandidate?.outcome ?? null;

  const tabs: Array<{ id: Tab; label: string; Icon: typeof Brain }> = [
    { id: 'diff', label: 'Diff', Icon: GitCompare },
    { id: 'fitness', label: 'Fitness', Icon: ListChecks },
    { id: 'log', label: 'Log', Icon: Terminal },
    { id: 'lineage', label: 'Lineage', Icon: GitBranch },
    { id: 'goals', label: 'Goals', Icon: Target },
  ];
  const unmetGoals = state.goals.filter((g) => !g.met).length;

  const copy = () => {
    if (!cand) return;
    navigator.clipboard.writeText(cand.source);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="w-full xl:w-[26rem] shrink-0 flex flex-col bg-[#060a16]/90 border border-cyan-950/60 rounded-xl p-3.5 backdrop-blur-md shadow-xl max-h-[calc(100vh-11rem)] min-h-[560px]">
      <div className="flex items-center justify-between pb-2.5 border-b border-cyan-900/30 mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <h2 className="text-xs font-bold font-mono tracking-widest uppercase text-purple-300">Mutation</h2>
        </div>
        <span className="text-[10px] font-mono text-slate-500">threshold {state.spliceThreshold} · red team {state.attacker.name}</span>
      </div>

      <div className="flex rounded-lg bg-slate-950/80 p-1 border border-slate-800/80 mb-3 font-mono text-xs">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md transition cursor-pointer ${tab === id ? 'bg-purple-950/80 text-purple-200 font-semibold border border-purple-700/50' : 'text-slate-400 hover:text-slate-200'}`}>
            <Icon className="w-3.5 h-3.5" /><span>{label}</span>
            {id === 'diff' && live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            {id === 'goals' && unmetGoals > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
          </button>
        ))}
      </div>

      {tab === 'diff' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-2.5">
          {!cand ? <Empty text={state.phase === 'synthesizing' ? 'Waiting on the provider…' : 'No candidate. Inject a fault and synthesize.'} /> : (
            <>
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-purple-900/40 font-mono text-[11px] space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">target</span><span className="text-amber-300 font-bold">{cand.name}{outcome && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border ${outcome === 'spliced' ? 'border-emerald-700 text-emerald-300' : 'border-slate-600 text-slate-400'}`}>{outcome}</span>}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">provider</span><span className="text-purple-300">{cand.provider} / {cand.model} · attempt {cand.attempt}</span></div>
                {cand.spend && <div className="flex justify-between"><span className="text-slate-500">spend</span><span className="text-slate-300">{cand.spend.calls} call{cand.spend.calls === 1 ? '' : 's'} · {cand.spend.inputTokens} in / {cand.spend.outputTokens} out · ${cand.spend.estUsd.toFixed(4)}</span></div>}
                <div className="flex justify-between"><span className="text-slate-500">lines</span><span className="text-slate-300"><span className="text-emerald-400">+{cand.diff.filter((d) => d.type === 'add').length}</span> <span className="text-rose-400">−{cand.diff.filter((d) => d.type === 'remove').length}</span></span></div>
                {cand.rationale && <div className="text-slate-400 pt-1 border-t border-slate-800">{cand.rationale}</div>}
              </div>
              <div className="flex-1 flex flex-col min-h-0 rounded-lg bg-[#04060c] border border-slate-800 overflow-hidden font-mono text-[11px]">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/70 border-b border-slate-800 text-slate-400 text-[10px]">
                  <span>{cand.targetNodeId}.js · {outcome === 'spliced' ? `v${(state.nodes.find((n) => n.id === cand.targetNodeId)?.version ?? 1) - 1} → v${state.nodes.find((n) => n.id === cand.targetNodeId)?.version}` : `v${state.nodes.find((n) => n.id === cand.targetNodeId)?.version} → candidate`}</span>
                  <button onClick={copy} className="hover:text-white flex items-center gap-1 cursor-pointer"><Copy className="w-3 h-3" />{copied ? 'copied' : 'copy source'}</button>
                </div>
                <div className="flex-1 overflow-auto p-2 leading-relaxed">
                  {cand.diff.map((d, i) => (
                    <div key={i} className={`flex px-1.5 rounded ${d.type === 'add' ? 'bg-emerald-950/50 text-emerald-300' : d.type === 'remove' ? 'bg-rose-950/40 text-rose-400/80' : 'text-slate-400'}`}>
                      <span className="w-7 text-[9px] text-slate-600 select-none shrink-0 text-right pr-2">{d.oldLine ?? ''}</span>
                      <span className="w-7 text-[9px] text-slate-600 select-none shrink-0 text-right pr-2">{d.newLine ?? ''}</span>
                      <span className="w-3 select-none shrink-0">{d.type === 'add' ? '+' : d.type === 'remove' ? '−' : ' '}</span>
                      <span className="whitespace-pre">{d.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              {state.phase === 'candidate_ready' && (
                <div className="flex gap-2 pt-1">
                  <button onClick={onSplice} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-emerald-400 text-slate-950 font-mono text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
                    <Zap className="w-4 h-4 fill-current" /> splice into production
                  </button>
                  <button onClick={onDiscard} className="px-3 rounded-lg bg-slate-800 text-slate-300 border border-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'fitness' && (
        <div className="flex-1 overflow-auto min-h-0 font-mono text-[11px] space-y-2.5">
          {!cand ? <Empty text="Fitness is measured when a candidate exists." /> : (
            <>
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 grid grid-cols-3 gap-2 text-center">
                <Stat label="fitness" v={String(cand.fitness.score)} tone={cand.fitness.score >= state.spliceThreshold ? 'text-emerald-300' : 'text-amber-300'} />
                <Stat label="pass" v={fmtPct(cand.fitness.passRate)} tone={cand.fitness.passRate === 1 ? 'text-emerald-300' : 'text-rose-300'} />
                <Stat label="contract" v={fmtPct(cand.fitness.contractRate)} tone={cand.fitness.contractRate === 1 ? 'text-emerald-300' : 'text-rose-300'} />
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">corpus: {cand.fitness.corpusSize} recorded inputs</div>
                <table className="w-full text-right">
                  <thead><tr className="text-slate-500"><th className="text-left font-normal">latency</th><th className="font-normal">p50</th><th className="font-normal">p99</th><th className="font-normal">max</th><th className="font-normal">pass</th></tr></thead>
                  <tbody>
                    <tr className="text-slate-300"><td className="text-left">incumbent</td><td>{fmtMs(cand.fitness.incumbent.p50)}</td><td>{fmtMs(cand.fitness.incumbent.p99)}</td><td>{fmtMs(cand.fitness.incumbent.max)}</td><td>{fmtPct(cand.fitness.incumbent.passRate)}</td></tr>
                    <tr className="text-emerald-300"><td className="text-left">candidate</td><td>{fmtMs(cand.fitness.candidate.p50)}</td><td>{fmtMs(cand.fitness.candidate.p99)}</td><td>{fmtMs(cand.fitness.candidate.max)}</td><td>{fmtPct(cand.fitness.passRate)}</td></tr>
                  </tbody>
                </table>
                <div className="flex justify-between pt-1 border-t border-slate-800"><span className="text-slate-500">speedup at p99</span><span className="text-emerald-300 font-bold">{cand.fitness.speedup}×</span></div>
                <div className="flex justify-between"><span className="text-slate-500">latency score</span><span className="text-slate-300">{cand.fitness.latencyScore}</span></div>
              </div>
              {cand.hardening && (
                <div className={`p-2.5 rounded-lg border space-y-1 ${cand.hardening.survived ? 'bg-emerald-950/20 border-emerald-800/50' : 'bg-red-950/30 border-red-800/50'}`}>
                  <div className="flex justify-between"><span className={`font-bold ${cand.hardening.survived ? 'text-emerald-300' : 'text-red-300'}`}>red team · {cand.hardening.attacker}</span><span className="text-slate-400">{cand.hardening.rounds} round{cand.hardening.rounds === 1 ? '' : 's'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">inputs tried</span><span className="text-slate-300">{cand.hardening.tried}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">hits</span><span className={cand.hardening.hits ? 'text-red-300 font-bold' : cand.hardening.error ? 'text-amber-300' : 'text-emerald-300 font-bold'}>{cand.hardening.error ? 'not run' : cand.hardening.hits}{cand.hardening.survived ? ' · survived' : ''}</span></div>
                  {cand.hardening.error && <div className="text-[10px] text-amber-200/80 pt-1 border-t border-red-900/40">{cand.hardening.error}</div>}
                  {cand.hardening.sample.map((h, i) => <div key={i} className="text-[10px] text-red-200/80 pt-1 border-t border-red-900/40"><span className="text-slate-500">{h.input}</span> → {h.error}</div>)}
                </div>
              )}
              {cand.fitness.goal && (
                <div className="p-2.5 rounded-lg bg-teal-950/30 border border-teal-800/50 space-y-1">
                  <div className="flex justify-between"><span className="text-teal-300 font-bold">goal · {cand.fitness.goal.name}</span><span className="text-slate-400">target {cand.fitness.goal.target}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">train (shown to model)</span><span className="text-slate-300">{cand.fitness.goal.train}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">holdout ({cand.fitness.goal.holdoutCount} hidden)</span><span className={cand.fitness.goal.holdout >= cand.fitness.goal.target ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold'}>{cand.fitness.goal.holdout}</span></div>
                  {cand.fitness.goal.train - cand.fitness.goal.holdout > 0.25 && <div className="text-[10px] text-amber-300 pt-1 border-t border-teal-900">train/holdout gap suggests the candidate hardcoded the examples</div>}
                </div>
              )}
              <div className="text-[10px] text-slate-500 leading-relaxed">{cand.fitness.goal ? 'score = 25% pass + 15% contract + 10% latency + 50% goal holdout.' : 'score = 55% pass + 30% contract + 15% latency.'} Contract: every key the incumbent emitted must be present, and downstream nodes must accept the output.</div>
              {cand.fitness.failures.length > 0 && (
                <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/50 space-y-1">
                  <div className="text-rose-300 font-bold">still throws</div>
                  {cand.fitness.failures.map((f, i) => <div key={i} className="text-rose-200/80"><span className="text-slate-500">{f.input}</span> → {f.error}</div>)}
                </div>
              )}
              {cand.fitness.contractViolations.length > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/50 space-y-1">
                  <div className="text-amber-300 font-bold">contract violations</div>
                  {cand.fitness.contractViolations.map((f, i) => <div key={i} className="text-amber-200/80"><span className="text-slate-500">{f.input}</span> → {f.reason}</div>)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'log' && (
        <div className="flex-1 overflow-auto min-h-0 space-y-1.5 pr-1 font-mono text-xs">
          {state.logs.slice().reverse().map((l) => (
            <div key={l.id} className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <div className="flex items-center justify-between text-[10px]">
                <span className={`px-1.5 rounded font-semibold border ${levelTone[l.level]}`}>{l.level}</span>
                <span className="text-slate-500">{fmtTime(l.ts)}</span>
              </div>
              <p className="text-slate-200 text-[11px] leading-relaxed mt-1">{l.message}</p>
              {l.details && <p className="text-[10px] text-slate-500 border-t border-slate-900 pt-1 mt-1 break-all">{l.details}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'lineage' && (
        <div className="flex-1 overflow-auto min-h-0 space-y-1.5 font-mono text-[11px]">
          {state.lineage.length === 0 ? <Empty text="No splices yet. Lineage is written to ./lineage/ as one JSON per generation." /> :
            state.lineage.slice().reverse().map((e) => (
              <div key={e.generation} className={`p-2.5 rounded-lg border ${e.rolledBack ? 'bg-slate-950/60 border-slate-800 opacity-60' : 'bg-emerald-950/20 border-emerald-800/50'}`}>
                <div className="flex justify-between"><span className="font-bold text-slate-200">gen {e.generation} · {e.nodeId}</span><span className="text-slate-500">{fmtTime(e.ts)}</span></div>
                <div className="flex justify-between text-slate-400"><span>{e.provider} / {e.model}</span><span>fitness {e.fitnessScore} · {e.speedup}×{e.estUsd != null && <span className="text-slate-500"> · ${e.estUsd.toFixed(4)}</span>}</span></div>
                <div className="text-slate-500 text-[10px]">{e.parentHash.slice(0, 10)} → {e.hash.slice(0, 10)}{e.rolledBack && <span className="text-orange-400 ml-2">rolled back</span>}</div>
              </div>
            ))}
        </div>
      )}

      {tab === 'goals' && (
        <div className="flex-1 overflow-auto min-h-0 space-y-2.5 font-mono text-[11px]">
          {state.goals.length === 0 ? <Empty text="No goals. Drop a JSON file in ./goals/ with a description, a target node, and input/expected examples. A third are held out from the model." /> :
            state.goals.map((g) => (
              <div key={g.name} className={`p-3 rounded-lg border space-y-2 ${g.met ? 'bg-emerald-950/20 border-emerald-800/50' : 'bg-amber-950/15 border-amber-800/50'}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-bold text-slate-100 flex items-center gap-2">{g.name}<span className={`text-[9px] px-1.5 py-0.5 rounded border ${g.met ? 'border-emerald-700 text-emerald-300' : 'border-amber-700 text-amber-300'}`}>{g.met ? 'met' : 'unmet'}</span>{state.activeGoal === g.name && <span className="text-[9px] px-1.5 py-0.5 rounded border border-purple-700 text-purple-300">active</span>}</div>
                    <div className="text-slate-400 leading-relaxed mt-0.5">{g.description}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-slate-800/60">
                  <Stat label={`train · ${g.trainCount}`} v={String(g.train)} tone="text-slate-300" />
                  <Stat label={`holdout · ${g.holdoutCount}`} v={String(g.holdout)} tone={g.met ? 'text-emerald-300' : 'text-amber-300'} />
                  <Stat label="target" v={String(g.target)} tone="text-slate-400" />
                </div>
                {g.worstMisses.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-800/60">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">worst misses</div>
                    {g.worstMisses.map((m, i) => (
                      <div key={i} className="text-[10px] leading-relaxed">
                        <span className="text-slate-500">{m.input}</span> <span className="text-slate-600">[{m.split}]</span>
                        <div className="pl-2"><span className="text-emerald-400/80">want</span> {m.expected} <span className="text-rose-400/80 ml-2">got</span> {m.actual}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span className="text-[10px] text-slate-500">rewrites {g.nodeId}</span>
                  <button onClick={() => onSynthesizeGoal(g.nodeId, g.name)} disabled={state.phase !== 'idle'} className="px-2.5 py-1 rounded bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 border border-purple-500/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-[10px]">
                    <Sparkles className="w-3 h-3" /> synthesize toward goal
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex-1 flex items-center justify-center text-center text-slate-500 font-mono text-xs p-6">{text}</div>;
}
function Stat({ label, v, tone }: { label: string; v: string; tone: string }) {
  return <div><div className={`text-lg font-bold ${tone}`}>{v}</div><div className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</div></div>;
}
