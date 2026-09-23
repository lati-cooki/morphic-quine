import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPipeline, listPipelines, trafficFor } from '../server/pipelines';
import { Pipeline } from '../server/pipeline';
import { Organism } from '../server/organism';

describe('pipelines', () => {
  it('lists and loads the logs pipeline', () => {
    expect(listPipelines(process.cwd())).toContain('logs');
    const def = loadPipeline(process.cwd(), 'logs');
    expect(def.nodes.map((n) => n.id)).toEqual(['ingest', 'parse', 'classify', 'emit']);
    expect(def.edges).toHaveLength(3);
    const p = new Pipeline(def.nodes, def.edges);
    const out = p.execute({ id: 'x', line: 'ERROR billing: charge failed: card declined' }).output as any;
    expect(out.level).toBe('ERROR');
    expect(out.service).toBe('billing');
    expect(out.severity).toBe(3);
    const json = p.execute({ id: 'y', line: '{"level":"error","service":"auth","msg":"x"}' }).output as any;
    expect(json.level).toBe('UNKNOWN');
  });

  it('stamps fresh ids on traffic samples', () => {
    const t = trafficFor(loadPipeline(process.cwd(), 'logs'));
    const a = t.normal() as any; const b = t.normal() as any;
    expect(a.id).not.toBe(b.id);
    expect(typeof a.line).toBe('string');
  });

  it('rejects unknown pipelines', () => {
    expect(() => loadPipeline(process.cwd(), 'nope')).toThrow(/No pipeline/);
  });
});

describe('Organism on the logs pipeline', () => {
  let tmp: string;
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('boots, scores both goals as unmet, and keeps lineage beside the pipeline', () => {
    // Copy the pipeline into a temp root so lineage/corpus writes stay out of the repo.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    // Copy the definition and goals only; a live engine may have written lineage/ and corpus/ beside them.
    const src = path.join(process.cwd(), 'pipelines', 'logs');
    fs.mkdirSync(path.join(tmp, 'pipelines', 'logs'), { recursive: true });
    fs.copyFileSync(path.join(src, 'pipeline.json'), path.join(tmp, 'pipelines', 'logs', 'pipeline.json'));
    fs.cpSync(path.join(src, 'goals'), path.join(tmp, 'pipelines', 'logs', 'goals'), { recursive: true });
    const org = new Organism({ rootDir: tmp, pipeline: 'logs', autonomous: false });
    try {
      const s = org.state();
      expect(s.pipeline.name).toBe('logs');
      expect(s.nodes.map((n) => n.id)).toEqual(['ingest', 'parse', 'classify', 'emit']);
      expect(s.goals.map((g) => g.name).sort()).toEqual(['categorize', 'parse-formats']);
      expect(s.goals.every((g) => !g.met)).toBe(true);
      const pf = s.goals.find((g) => g.name === 'parse-formats')!;
      expect(pf.holdout).toBeGreaterThan(0);   // house-format examples already pass
      expect(pf.holdout).toBeLessThan(0.6);
      for (let i = 0; i < 20; i++) org.inject('NORMAL');
      expect(s.nodes.every((n) => n.health === 'healthy')).toBe(true);
      org.inject('MALFORMED', 4);
      expect(org.state().nodes.find((n) => n.id === 'ingest')!.health).toBe('healthy');
      expect(org.snapshot().filename).toMatch(/^morphic-gen000/);
      expect(fs.existsSync(path.join(tmp, 'pipelines', 'logs', 'snapshots'))).toBe(true);
    } finally { org.stop(); }
  });
});
