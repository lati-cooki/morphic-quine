import { describe, it, expect } from 'vitest';
import { Pipeline, topoSort } from '../server/pipeline';
import { DEFAULT_EDGES, DEFAULT_NODES, packets } from '../server/nodes';

describe('Pipeline', () => {
  it('orders nodes topologically', () => {
    expect(topoSort(['c', 'a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }])).toEqual(['a', 'b', 'c']);
    expect(() => topoSort(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }])).toThrow(/cycle/);
  });

  it('runs a normal packet end to end', () => {
    const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES);
    const res = p.execute(packets.normal());
    expect(res.error).toBeUndefined();
    expect((res.output as any).status).toBe('COMMITTED');
    expect(res.trace).toHaveLength(4);
  });

  it('faults jit_cache on a malformed packet and records the failure', () => {
    const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES);
    const res = p.execute({ id: 'x', data: null });
    expect(res.faultedNode).toBe('jit_cache');
    expect(res.error).toMatch(/TypeError/);
    const node = p.nodes.get('jit_cache')!;
    expect(node.recentFailures()).toHaveLength(1);
    expect(node.health()).toBe('faulted');
    expect(node.corpus()).toContainEqual(expect.objectContaining({ id: 'x' }));
  });

  it('chokes jit_cache on a surge packet', () => {
    const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES, { timeoutMs: 5000 });
    const res = p.execute(packets.surge());
    const jit = res.trace.find((t) => t.nodeId === 'jit_cache')!;
    expect(jit.latencyMs).toBeGreaterThan(25);
    expect(p.nodes.get('jit_cache')!.recentSlow()).toHaveLength(1);
  });

  it('splices and rolls back, resetting the window', () => {
    const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES);
    p.execute({ id: 'x', data: null });
    const before = p.hash();
    const { version } = p.splice('jit_cache', 'function jitCache(input) { return { ...input, cached: true, cacheKey: "k", evictionBucket: 0 }; }');
    expect(version).toBe(2);
    expect(p.hash()).not.toBe(before);
    expect(p.nodes.get('jit_cache')!.health()).toBe('healthy');
    expect(p.execute({ id: 'x', data: null }).error).toBeUndefined();
    expect(p.rollback('jit_cache')).toBe(true);
    expect(p.hash()).toBe(before);
    expect(p.rollback('jit_cache')).toBe(false);
  });
});
