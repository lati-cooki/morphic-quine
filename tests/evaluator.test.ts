import { describe, it, expect } from 'vitest';
import { compileFunction } from '../server/sandbox';
import { evaluateCandidate } from '../server/evaluator';
import { Pipeline } from '../server/pipeline';
import { DEFAULT_EDGES, DEFAULT_NODES, packets } from '../server/nodes';
import { ReferenceProvider } from '../server/mutator';

function corpusFromTraffic() {
  const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES, { timeoutMs: 5000 });
  for (let i = 0; i < 12; i++) p.execute(packets.normal());
  for (let i = 0; i < 3; i++) p.execute(packets.malformed());
  p.execute(packets.surge());
  const node = p.nodes.get('jit_cache')!;
  return { p, node, corpus: node.corpus(), downstream: p.downstreamOf('jit_cache').map((d) => d.fn) };
}

describe('evaluateCandidate', () => {
  it('scores the incumbent against itself below the threshold because it fails on recorded traffic', () => {
    const { node, corpus, downstream } = corpusFromTraffic();
    const r = evaluateCandidate({ candidate: node.fn, incumbent: node.fn, corpus, downstream });
    expect(r.corpusSize).toBeGreaterThanOrEqual(5);
    expect(r.passRate).toBeLessThan(1);
    expect(r.score).toBeLessThan(85);
    expect(r.failures.length).toBeGreaterThan(0);
  });

  it('penalises a candidate that drops output keys', () => {
    const { node, corpus, downstream } = corpusFromTraffic();
    const lazy = compileFunction('function jitCache(input) { return { id: input.id }; }');
    const r = evaluateCandidate({ candidate: lazy, incumbent: node.fn, corpus, downstream });
    expect(r.passRate).toBe(1);
    expect(r.contractRate).toBeLessThan(0.5);
    expect(r.contractViolations[0].reason).toMatch(/Missing keys/);
  });

  it('penalises a candidate that returns non-objects', () => {
    const { node, corpus, downstream } = corpusFromTraffic();
    const bad = compileFunction('function jitCache() { return 7; }');
    const r = evaluateCandidate({ candidate: bad, incumbent: node.fn, corpus, downstream });
    expect(r.passRate).toBe(0);
  });

  it('rates the reference repair above the splice threshold and faster on the surge input', async () => {
    const { node, corpus, downstream } = corpusFromTraffic();
    const patch = await new ReferenceProvider().synthesize({ node: { id: 'jit_cache', name: 'JIT_Cache', role: '', source: node.source }, failures: [], slow: [], downstream: [] });
    const cand = compileFunction(patch.source);
    const r = evaluateCandidate({ candidate: cand, incumbent: node.fn, corpus, downstream });
    expect(r.passRate).toBe(1);
    expect(r.contractRate).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.speedup).toBeGreaterThan(5);
  });

  it('reference repair preserves the eviction bucket of the original on well-formed input', async () => {
    const { p, node } = corpusFromTraffic();
    const patch = await new ReferenceProvider().synthesize({ node: { id: 'jit_cache', name: 'JIT_Cache', role: '', source: node.source }, failures: [], slow: [], downstream: [] });
    const cand = compileFunction(patch.source);
    const pre = p.nodes.get('vector_core')!.fn.call(p.nodes.get('stream_ingest')!.fn.call({ id: 'k', data: 'hello world, a fixed payload' })) as Record<string, unknown>;
    const a = node.fn.call(pre) as any;
    const b = cand.call(pre) as any;
    expect(b.evictionBucket).toBe(a.evictionBucket);
    expect(b.cacheKey).toBe(a.cacheKey);
  });
});
