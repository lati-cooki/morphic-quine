import { describe, it, expect } from 'vitest';
import { scoreOutput, scoreGoal, splitOf, loadGoals, type Goal } from '../server/goals';
import path from 'node:path';

const goal: Goal = {
  name: 't', description: '', target: 0.9, scorer: 'fields',
  examples: Array.from({ length: 30 }, (_, i) => ({ input: { id: `i${i}`, data: `r${i % 3}:x` }, expected: { region: `R${i % 3}` } })),
};

describe('goals', () => {
  it('scores partial expected objects field by field', () => {
    expect(scoreOutput(goal, { a: 1, b: 'x' }, { a: 1, b: 'y', c: 3 })).toBe(0.5);
    expect(scoreOutput(goal, { a: 1 }, null)).toBe(0);
    expect(scoreOutput({ ...goal, scorer: 'numeric', tolerance: 0.1 }, { v: 1 }, { v: 1.05 })).toBe(1);
    expect(scoreOutput({ ...goal, scorer: 'text' }, { s: 'kitten' }, { s: 'sitting' })).toBeCloseTo(1 - 3 / 7, 3);
  });

  it('splits deterministically with roughly a third held out', () => {
    const holdout = goal.examples.filter((e) => splitOf(e) === 'holdout').length;
    expect(holdout).toBeGreaterThan(3);
    expect(holdout).toBeLessThan(20);
    expect(splitOf(goal.examples[0])).toBe(splitOf(goal.examples[0]));
  });

  it('scores train and holdout separately and lists misses worst first', () => {
    const sc = scoreGoal(goal, (input) => ({ region: (input as any).data.startsWith('r0') ? 'R0' : 'nope' }));
    expect(sc.trainCount + sc.holdoutCount).toBe(30);
    expect(sc.train).toBeGreaterThan(0);
    expect(sc.train).toBeLessThan(1);
    expect(sc.misses.length).toBe(20);
    expect(sc.misses[0].score).toBe(0);
  });

  it('treats a throwing pipeline as a zero for that example', () => {
    const sc = scoreGoal(goal, () => { throw new Error('boom'); });
    expect(sc.holdout).toBe(0);
    expect(sc.misses[0].actual).toEqual({ error: 'boom' });
  });

  it('loads the shipped goal', () => {
    const [g] = loadGoals(path.join(process.cwd(), 'goals'));
    expect(g.name).toBe('region-tag');
    expect(g.nodeId).toBe('async_buffer');
    expect(g.examples.length).toBeGreaterThanOrEqual(20);
  });
});
