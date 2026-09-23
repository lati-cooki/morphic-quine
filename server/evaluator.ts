import { performance } from 'node:perf_hooks';
import type { CompiledFn } from './sandbox';
import type { FitnessReport, LatencyStats } from '../src/types';
import type { Goal, GoalScore } from './goals';
import { scoreGoal } from './goals';

export interface EvaluateInput {
  candidate: CompiledFn;
  incumbent: CompiledFn;
  corpus: unknown[];
  /** Nodes that consume this node's output, in order. Used to check the candidate's output still flows. */
  downstream: CompiledFn[];
  /** p99 at or under this scores 1.0 on latency. */
  latencyBudgetMs?: number;
  /** When set, the candidate is also scored on the goal's holdout examples via a full pipeline run. */
  goal?: { goal: Goal; run: (input: unknown) => unknown };
}

const WEIGHTS = { pass: 0.55, contract: 0.30, latency: 0.15 };
/** With a goal active the goal term dominates; contract stays as a floor via downstream acceptance. */
const GOAL_WEIGHTS = { pass: 0.25, contract: 0.15, latency: 0.10, goal: 0.50 };

function quantiles(values: number[]): LatencyStats {
  const s = values.slice().sort((a, b) => a - b);
  const q = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0);
  return { p50: round(q(0.5)), p99: round(q(0.99)), max: round(s[s.length - 1] ?? 0) };
}

function round(n: number) { return Math.round(n * 1000) / 1000; }

function preview(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s.length > 160 ? s.slice(0, 157) + '...' : s;
  } catch { return String(v); }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Measure a candidate against the incumbent on recorded traffic.
 * Pass: no throw and returns an object.
 * Contract: for inputs the incumbent handled, candidate output must carry every key the incumbent produced;
 *           for every input, downstream nodes must accept the candidate's output without throwing.
 */
export function evaluateCandidate(args: EvaluateInput): FitnessReport {
  const { candidate, incumbent, corpus, downstream } = args;
  const budget = args.latencyBudgetMs ?? 5;

  const incumbentLat: number[] = [];
  const candidateLat: number[] = [];
  let incumbentPasses = 0;
  let passes = 0;
  let contractOk = 0;
  const failures: FitnessReport['failures'] = [];
  const violations: FitnessReport['contractViolations'] = [];

  // Warm up so JIT tiering does not dominate the timings.
  for (const input of corpus.slice(0, 3)) {
    try { candidate.call(input); } catch { /* measured below */ }
    try { incumbent.call(input); } catch { /* measured below */ }
  }

  for (const input of corpus) {
    let incumbentOut: unknown;
    let incumbentOk = false;
    const t0 = performance.now();
    try { incumbentOut = incumbent.call(input); incumbentOk = true; } catch { /* baseline failure */ }
    incumbentLat.push(performance.now() - t0);
    if (incumbentOk) incumbentPasses++;

    let out: unknown;
    const t1 = performance.now();
    try {
      out = candidate.call(input);
    } catch (err) {
      candidateLat.push(performance.now() - t1);
      failures.push({ input: preview(input), error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
      continue;
    }
    candidateLat.push(performance.now() - t1);

    if (!isPlainObject(out)) {
      failures.push({ input: preview(input), error: `Returned ${out === null ? 'null' : typeof out}, expected object` });
      continue;
    }
    passes++;

    let ok = true;
    if (incumbentOk && isPlainObject(incumbentOut)) {
      const missing = Object.keys(incumbentOut).filter((k) => !(k in out));
      if (missing.length) { ok = false; violations.push({ input: preview(input), reason: `Missing keys: ${missing.join(', ')}` }); }
    }
    if (ok) {
      let cur: unknown = out;
      for (const d of downstream) {
        try { cur = d.call(cur); } catch (err) {
          ok = false;
          violations.push({ input: preview(input), reason: `Downstream ${d.name} threw: ${err instanceof Error ? err.message : String(err)}` });
          break;
        }
      }
    }
    if (ok) contractOk++;
  }

  const n = corpus.length || 1;
  const passRate = passes / n;
  const contractRate = contractOk / n;
  const cand = quantiles(candidateLat);
  const inc = quantiles(incumbentLat);
  const latencyScore = cand.p99 <= budget ? 1 : Math.max(0, Math.min(1, budget / cand.p99));

  let goalScore: GoalScore | undefined;
  let score: number;
  if (args.goal) {
    goalScore = scoreGoal(args.goal.goal, args.goal.run);
    score = 100 * (GOAL_WEIGHTS.pass * passRate + GOAL_WEIGHTS.contract * contractRate + GOAL_WEIGHTS.latency * latencyScore + GOAL_WEIGHTS.goal * goalScore.holdout);
  } else {
    score = 100 * (WEIGHTS.pass * passRate + WEIGHTS.contract * contractRate + WEIGHTS.latency * latencyScore);
  }
  score = Math.round(score * 10) / 10;

  return {
    score,
    corpusSize: corpus.length,
    passRate: round(passRate),
    contractRate: round(contractRate),
    latencyScore: round(latencyScore),
    incumbent: { ...inc, passRate: round(incumbentPasses / n) },
    candidate: cand,
    speedup: round(cand.p99 > 0 ? inc.p99 / cand.p99 : 1),
    failures: failures.slice(0, 8),
    contractViolations: violations.slice(0, 8),
    goal: goalScore ? { name: args.goal!.goal.name, train: goalScore.train, holdout: goalScore.holdout, holdoutCount: goalScore.holdoutCount, target: args.goal!.goal.target } : undefined,
  };
}
