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
  const region = text === null ? 'UNKNOWN' : text.split(':')[0].toUpperCase();
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
