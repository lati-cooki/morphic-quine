import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Organism } from '../server/organism';

let dir: string;
let org: Organism | null = null;
afterEach(() => { org?.stop(); org = null; fs.rmSync(dir, { recursive: true, force: true }); });

describe('Organism (reference provider, no network)', () => {
  it('closes the loop: fault → synthesize → splice → rollback, with lineage on disk', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    org = new Organism({ rootDir: dir, autonomous: false });
    for (let i = 0; i < 10; i++) org.inject('NORMAL');
    org.inject('MALFORMED', 3);
    expect(org.state().nodes.find((n) => n.id === 'jit_cache')!.health).toBe('faulted');

    await org.synthesize('jit_cache');
    const s1 = org.state();
    expect(s1.phase).toBe('candidate_ready');
    expect(s1.candidate!.fitness.score).toBeGreaterThanOrEqual(85);
    expect(s1.candidate!.diff.some((d) => d.type === 'add')).toBe(true);

    org.splice('user');
    const s2 = org.state();
    expect(s2.phase).toBe('observing');
    expect(s2.generation).toBe(1);
    expect(fs.readdirSync(path.join(dir, 'lineage'))).toEqual(['gen-0001.json']);
    expect(org.send({ id: 'p', data: null }).error).toBeUndefined();

    const snap = org.snapshot();
    expect(fs.existsSync(path.join(dir, 'snapshots', snap.filename))).toBe(true);
    expect(snap.code).toContain('Lineage:');

    org.rollback('user');
    const s3 = org.state();
    expect(s3.phase).toBe('idle');
    expect(s3.lineage[0].rolledBack).toBe(true);
    expect(s3.canRollback).toBe(false);
    expect(org.send({ id: 'p', data: null }).error).toMatch(/TypeError/);
  });

  it('reloads lineage from disk', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    org = new Organism({ rootDir: dir, autonomous: false });
    org.inject('MALFORMED', 2);
    await org.synthesize('jit_cache');
    org.splice('user');
    const liveHash = org.state().stateHash;
    org.stop();
    org = new Organism({ rootDir: dir, autonomous: false });
    expect(org.state().generation).toBe(1);
    expect(org.state().canRollback).toBe(true);
    expect(org.state().stateHash).toBe(liveHash);
    expect(org.state().nodes.find((n) => n.id === 'jit_cache')!.version).toBe(2);
    expect(org.send({ id: 'p', data: null }).error).toBeUndefined();
    org.rollback('user');
    expect(org.send({ id: 'p', data: null }).error).toMatch(/TypeError/);
  });
});

import { ReferenceProvider, type Provider, type PatchRequest, type PatchResult } from '../server/mutator';
import { splitOf } from '../server/goals';

function scripted(name: string, fn: (req: PatchRequest) => string): Provider {
  return {
    name, model: 'scripted', available: () => true,
    async synthesize(req): Promise<PatchResult> {
      // Defer the shipped JIT_Cache defect to the reference repair so tests can fix upstream first.
      if (req.node.id === 'jit_cache') return new ReferenceProvider().synthesize({ ...req, goal: undefined });
      return { source: fn(req), provider: name, model: 'scripted', prompt: '' };
    },
  };
}

const GENERAL_FIX = `function asyncBuffer(input) {
  const text = typeof input.payload === 'string' ? input.payload : null;
  const region = text === null ? 'UNKNOWN' : text.split(':')[0].toUpperCase().slice(0, 16);
  return {
    packetId: input.id,
    cacheKey: input.cacheKey,
    evictionBucket: input.evictionBucket,
    dim: input.dim,
    region,
    latencyMs: performance.now() - input.ingestedAt,
    status: 'COMMITTED'
  };
}`;

describe('Organism goals', () => {
  it('scores the shipped goal as unmet on the original pipeline and prompts with train examples only', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    let seen: PatchRequest | null = null;
    org = new Organism({ rootDir: dir, goalsDir: path.join(process.cwd(), 'goals'), autonomous: false, provider: scripted('probe', (req) => { seen = req; return GENERAL_FIX; }) });
    const g0 = org.state().goals[0];
    expect(g0.met).toBe(false);
    expect(g0.holdout).toBe(0);

    await org.synthesize(undefined, 'region-tag');
    expect(seen).not.toBeNull();
    expect(seen!.goal!.name).toBe('region-tag');
    const shownIds = new Set(seen!.goal!.examples.map((e) => (e.pipelineInput as any).id));
    const holdoutIds = g0 ? loadHoldoutIds() : new Set<string>();
    for (const id of shownIds) expect(holdoutIds.has(id)).toBe(false);
    expect(seen!.node.id).toBe('async_buffer');
  });

  it('a goal blocked by an upstream defect: holdout capped, hint logged, then met once upstream is repaired', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    org = new Organism({ rootDir: dir, goalsDir: path.join(process.cwd(), 'goals'), autonomous: false, provider: scripted('good', () => GENERAL_FIX) });
    for (let i = 0; i < 10; i++) org.inject('NORMAL');

    // The malformed goal examples die in JIT_Cache before AsyncBuffer sees them.
    await org.synthesize(undefined, 'region-tag');
    const blocked = org.state();
    expect(blocked.candidate!.fitness.goal!.holdout).toBeLessThan(1);
    expect(blocked.logs.some((l) => /fail upstream in JIT_Cache/.test(l.message))).toBe(true);
    org.discard();

    // Repair JIT_Cache, then the goal is reachable.
    org.inject('MALFORMED', 3);
    await org.synthesize('jit_cache');
    org.splice('user');
    await org.synthesize(undefined, 'region-tag');
    const s = org.state();
    expect(s.phase).toBe('candidate_ready');
    expect(s.candidate!.fitness.goal!.holdout).toBe(1);
    expect(s.candidate!.fitness.score).toBeGreaterThanOrEqual(85);
    org.splice('user');
    expect(org.state().goals[0].met).toBe(true);
    expect(org.state().generation).toBe(2);
    expect((org.send({ id: 'z', data: 'eu-west:1:tick' }).output as any).region).toBe('EU-WEST');
    expect((org.send({ id: 'z', data: null }).output as any).region).toBe('UNKNOWN');
  });

  it('routes an upstream-blocked goal to the blocking node in autonomous mode', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    org = new Organism({ rootDir: dir, goalsDir: path.join(process.cwd(), 'goals'), autonomous: false, provider: scripted('good', () => GENERAL_FIX), attackRounds: 0, goalCooldownMs: 0 });
    // Meet the goal on every example that reaches AsyncBuffer, leaving only the upstream-blocked ones.
    await org.synthesize(undefined, 'region-tag');
    org.splice('user');
    const g = org.state().goals[0];
    expect(g.met).toBe(false);
    expect(g.worstMisses.every((m) => /jit_cache:/.test(m.actual))).toBe(true);
    // Now let the control loop decide what to do about it.
    org.setAutonomous(true);
    org['phase'] = 'idle';
    await (org as any).tick();
    const synthLog = org.state().logs.find((l) => /repairing that node instead/.test(l.message));
    expect(synthLog).toBeDefined();
    expect(synthLog!.message).toMatch(/upstream in JIT_Cache/);
    expect(synthLog!.message).toMatch(/3 failing goal inputs recorded/);
    const jit = org.pipeline.nodes.get('jit_cache')!;
    expect(jit.recentFailures().length).toBe(3);
    expect(jit.recentFailures()[0].error).toMatch(/goal "region-tag" example/);
  });

  it('rejects a fix that hardcodes the shown examples: train high, holdout low, stays below threshold', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    const provider = scripted('cheat', (req) => {
      const table = Object.fromEntries(req.goal!.examples.map((e) => [(e.pipelineInput as any).id, e.expected.region]));
      return `function asyncBuffer(input) {
  const table = ${JSON.stringify(table)};
  return { packetId: input.id, cacheKey: input.cacheKey, evictionBucket: input.evictionBucket, dim: input.dim, region: table[input.id] || 'MISS', latencyMs: performance.now() - input.ingestedAt, status: 'COMMITTED' };
}`;
    });
    org = new Organism({ rootDir: dir, goalsDir: path.join(process.cwd(), 'goals'), autonomous: false, maxAttempts: 1, provider });
    await org.synthesize(undefined, 'region-tag');
    const c = org.state().candidate!;
    expect(c.fitness.goal!.train).toBeGreaterThan(0.5);
    expect(c.fitness.goal!.holdout).toBeLessThan(0.2);
    expect(c.fitness.score).toBeLessThan(85);
    expect(org.state().logs.some((l) => /likely hardcoded/.test(l.message))).toBe(true);
  });
});

function loadHoldoutIds(): Set<string> {
  const g = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'goals', 'region-tag.json'), 'utf-8'));
  return new Set(g.examples.filter((e: any) => splitOf(e) === 'holdout').map((e: any) => e.input.id));
}

const PARTIAL_FIX = `function jitCache(input) {
  const text = input.payload == null ? '' : input.payload;
  const key = text.trim().toLowerCase().slice(0, 32);
  const v = Array.isArray(input.vector) ? input.vector : [];
  let spread = 0;
  if (v.length > 1) { const s = v.slice().sort((a, b) => a - b); let sum = 0; for (let k = 0; k < s.length; k++) sum += s[k] * (2 * k - s.length + 1); spread = (2 * sum) / (s.length * s.length); }
  return { ...input, cached: true, cacheKey: 'jit_' + key + '_' + input.id, evictionBucket: Math.min(15, Math.max(0, Math.floor(spread * 16))) };
}`;

describe('Organism red team', () => {
  it('hardens a candidate: fuzzer breaks the partial fix, feedback produces one that survives, hits persist to disk', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    let calls = 0;
    const provider: Provider = {
      name: 'staged', model: 'scripted', available: () => true,
      async synthesize(req): Promise<PatchResult> {
        calls++;
        if (calls === 1) return { source: PARTIAL_FIX, provider: 'staged', model: 'scripted', prompt: '' };
        expect(req.feedback).toMatch(/Adversarial inputs that broke this version/);
        return new ReferenceProvider().synthesize({ ...req, goal: undefined });
      },
    };
    org = new Organism({ rootDir: dir, autonomous: false, provider });
    for (let i = 0; i < 10; i++) org.inject('NORMAL');
    // Only the null case is observed in traffic, so the partial fix clears fitness and it is the fuzzer that has to catch the rest.
    for (let i = 0; i < 3; i++) org.send({ id: `n${i}`, data: null });
    await org.synthesize('jit_cache');
    const s = org.state();
    expect(calls).toBe(2);
    expect(s.phase).toBe('candidate_ready');
    expect(s.candidate!.attempt).toBe(2);
    expect(s.candidate!.hardening!.survived).toBe(true);
    expect(s.candidate!.hardening!.attacker).toBe('fuzz');
    const jit = s.nodes.find((n) => n.id === 'jit_cache')!;
    expect(jit.adversarialInputs).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(dir, 'corpus', 'jit_cache.json'))).toBe(true);
    expect(s.logs.some((l) => l.level === 'ATTACK' && /broke candidate attempt 1/.test(l.message))).toBe(true);

    // Persisted corpus is loaded by a fresh engine and joins the verification corpus.
    org.stop();
    org = new Organism({ rootDir: dir, autonomous: false, provider });
    expect(org.state().nodes.find((n) => n.id === 'jit_cache')!.adversarialInputs).toBe(jit.adversarialInputs);
    expect(org.pipeline.nodes.get('jit_cache')!.corpus().length).toBeGreaterThanOrEqual(jit.adversarialInputs);
  });

  it('probes a healthy node, records discovered failures, and the sentinel treats them as real', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    org = new Organism({ rootDir: dir, autonomous: false });
    for (let i = 0; i < 10; i++) org.inject('NORMAL');
    expect(org.state().nodes.find((n) => n.id === 'jit_cache')!.health).toBe('healthy');
    await org.probe('jit_cache');
    const jit = org.state().nodes.find((n) => n.id === 'jit_cache')!;
    expect(jit.health).toBe('faulted');
    expect(jit.lastError).toMatch(/discovered by fuzz/);
    expect(jit.adversarialInputs).toBeGreaterThan(0);
    expect(org.state().phase).toBe('idle');
  });
});

describe('Organism goal splice policy', () => {
  it('does not auto-splice a goal candidate whose holdout fails to improve on the live score', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    // A fix that satisfies only the house format examples: same holdout as the shipped code on the shipped goal? No —
    // use the region goal: a candidate that emits region for string payloads but never truncates scores < target and,
    // once spliced, a second identical candidate must be held rather than spliced again.
    const provider = scripted('same', () => `function asyncBuffer(input) {
  const text = typeof input.payload === 'string' ? input.payload : null;
  const region = text === null ? 'UNKNOWN' : text.split(':')[0].toUpperCase();
  return { packetId: input.id, cacheKey: input.cacheKey, evictionBucket: input.evictionBucket, dim: input.dim, region, latencyMs: performance.now() - input.ingestedAt, status: 'COMMITTED' };
}`);
    // Low threshold so the composite score clears and the goal rule alone decides.
    org = new Organism({ rootDir: dir, goalsDir: path.join(process.cwd(), 'goals'), autonomous: false, provider, attackRounds: 0, spliceThreshold: 60 });
    await org.synthesize(undefined, 'region-tag');
    const first = org.state().candidate!.fitness.goal!.holdout;
    expect(first).toBeGreaterThan(0);
    org.splice('user');
    org['phase'] = 'idle';
    // Same candidate again, now judged by the autonomous loop.
    await org.synthesize(undefined, 'region-tag');
    expect(org.state().phase).toBe('candidate_ready');
    org.setAutonomous(true);
    await (org as any).tick();
    const s = org.state();
    expect(s.phase).toBe('idle');
    expect(s.generation).toBe(1);
    expect(s.logs.some((l) => /does not improve on the live/.test(l.message))).toBe(true);
    expect(org['goalFeedback'].get('region-tag')).toMatch(/did not generalise/);
  });
});


describe('Organism latency sentinel', () => {
  it('ignores slowness that does not reproduce on replay, and forgets the slow samples', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    org = new Organism({ rootDir: dir, autonomous: true, attackRounds: 0 });
    for (let i = 0; i < 20; i++) org.inject('NORMAL');
    // Fake six host hiccups: normal inputs recorded as slow.
    const jit = org.pipeline.nodes.get('jit_cache')!;
    const input = jit.sampleInputs(1)[0];
    for (let i = 0; i < 6; i++) jit.record({ input, ok: true, latencyMs: 40 + i, ts: 0 }, 25);
    expect(jit.windowStats().slowCount).toBe(6);
    await (org as any).tick();
    const s = org.state();
    expect(s.phase).toBe('idle');
    expect(s.logs.some((l) => /Host jitter, not the code. Ignoring/.test(l.message))).toBe(true);
    expect(jit.recentSlow()).toHaveLength(0);
  });

  it('confirms slowness that does reproduce and synthesizes', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    org = new Organism({ rootDir: dir, autonomous: true, attackRounds: 0 });
    for (let i = 0; i < 10; i++) org.inject('NORMAL');
    org.inject('SURGE', 6);
    await (org as any).tick();
    const s = org.state();
    expect(s.logs.some((l) => /Replay confirms/.test(l.message))).toBe(true);
    expect(['synthesizing', 'candidate_ready', 'observing']).toContain(s.phase);
  });
});
