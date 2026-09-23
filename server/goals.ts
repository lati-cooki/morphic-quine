import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type Scorer = 'fields' | 'numeric' | 'text';

export interface GoalExample {
  input: unknown;
  /** Partial expected output: only the keys present are scored. */
  expected: Record<string, unknown>;
}

export interface Goal {
  name: string;
  description: string;
  /** Node to rewrite when this goal is breached. Defaults to the last node in the pipeline. */
  nodeId?: string;
  /** Holdout score at or above this means the goal is met. 0-1. */
  target: number;
  scorer: Scorer;
  /** For the numeric scorer: absolute tolerance per field. */
  tolerance?: number;
  examples: GoalExample[];
}

export interface GoalMiss {
  input: unknown;
  expected: Record<string, unknown>;
  actual: unknown;
  score: number;
  split: 'train' | 'holdout';
}

export interface GoalScore {
  train: number;
  holdout: number;
  trainCount: number;
  holdoutCount: number;
  misses: GoalMiss[];
}

export function loadGoals(dir: string): Goal[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const g = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Goal;
    if (!g.name) g.name = f.replace(/\.json$/, '');
    if (!g.scorer) g.scorer = 'fields';
    if (typeof g.target !== 'number') g.target = 0.95;
    if (!Array.isArray(g.examples) || g.examples.length < 3) throw new Error(`Goal ${g.name} needs at least 3 examples`);
    return g;
  });
}

/** Deterministic split: a third of examples are held out and never shown to the model. */
export function splitOf(example: GoalExample): 'train' | 'holdout' {
  const h = crypto.createHash('sha1').update(JSON.stringify(example.input)).digest();
  return h[0] % 3 === 0 ? 'holdout' : 'train';
}

export function scoreOutput(goal: Goal, expected: Record<string, unknown>, actual: unknown): number {
  const keys = Object.keys(expected);
  if (!keys.length) return 1;
  if (typeof actual !== 'object' || actual === null) return 0;
  const a = actual as Record<string, unknown>;
  let total = 0;
  for (const k of keys) {
    const e = expected[k];
    const v = a[k];
    if (goal.scorer === 'numeric' && typeof e === 'number') {
      total += typeof v === 'number' && Math.abs(v - e) <= (goal.tolerance ?? 1e-6) ? 1 : 0;
    } else if (goal.scorer === 'text' && typeof e === 'string') {
      total += typeof v === 'string' ? similarity(e, v) : 0;
    } else {
      total += deepEqual(e, v) ? 1 : 0;
    }
  }
  return total / keys.length;
}

/** Run every example through `run` and score. `run` should execute the full pipeline and throw on failure. */
export function scoreGoal(goal: Goal, run: (input: unknown) => unknown): GoalScore {
  const sums = { train: 0, holdout: 0 };
  const counts = { train: 0, holdout: 0 };
  const misses: GoalMiss[] = [];
  for (const ex of goal.examples) {
    const split = splitOf(ex);
    let actual: unknown;
    let score = 0;
    try { actual = run(ex.input); score = scoreOutput(goal, ex.expected, actual); }
    catch (err) { actual = { error: err instanceof Error ? err.message : String(err) }; }
    sums[split] += score;
    counts[split]++;
    if (score < 1) misses.push({ input: ex.input, expected: ex.expected, actual, score, split });
  }
  misses.sort((x, y) => x.score - y.score);
  return {
    train: counts.train ? round(sums.train / counts.train) : 1,
    holdout: counts.holdout ? round(sums.holdout / counts.holdout) : 1,
    trainCount: counts.train,
    holdoutCount: counts.holdout,
    misses,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object); const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Normalised Levenshtein similarity in [0, 1]. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length; const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

function round(n: number) { return Math.round(n * 1000) / 1000; }
