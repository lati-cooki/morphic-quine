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
