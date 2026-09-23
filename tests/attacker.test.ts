import { describe, it, expect } from 'vitest';
import { FuzzAttacker, runAttacks } from '../server/attacker';
import { Pipeline } from '../server/pipeline';
import { DEFAULT_EDGES, DEFAULT_NODES, packets } from '../server/nodes';
import { ReferenceProvider } from '../server/mutator';
import { compileFunction } from '../server/sandbox';

async function setup() {
  const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES);
  for (let i = 0; i < 8; i++) p.execute(packets.normal());
  const node = p.nodes.get('jit_cache')!;
  const req = {
    node: { id: 'jit_cache', name: node.spec.name, role: node.spec.role, source: node.source, depth: p.depthOf('jit_cache') },
    samples: node.sampleInputs(),
    downstream: p.downstreamOf('jit_cache').map((d) => ({ name: d.spec.name, source: d.source })),
    known: [],
    max: 40,
  };
  return { p, node, req };
}

describe('FuzzAttacker', () => {
  it('stays within the observed shape for interior nodes and finds the shipped defects', async () => {
    const { p, node, req } = await setup();
    const inputs = await new FuzzAttacker().generate(req);
    expect(inputs.length).toBeGreaterThan(10);
    for (const i of inputs) { expect(typeof i).toBe('object'); expect(i).not.toBeNull(); }
    const hits = runAttacks(node.fn, inputs, p.downstreamOf('jit_cache').map((d) => d.fn));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /trim/.test(h.error))).toBe(true);
    expect(hits.some((h) => /timed out/.test(h.error))).toBe(true);
  });

  it('allows whole-input replacement only for the first node', async () => {
    const { req } = await setup();
    const first = await new FuzzAttacker().generate({ ...req, node: { ...req.node, depth: 0 } });
    expect(first.some((i) => i === null || typeof i !== 'object')).toBe(true);
  });

  it('does not repeat known hits', async () => {
    const { req } = await setup();
    const a = new FuzzAttacker();
    const first = await a.generate(req);
    const second = await a.generate({ ...req, known: first });
    for (const s of second) expect(first.map((f) => JSON.stringify(f))).not.toContain(JSON.stringify(s));
  });

  it('the reference repair survives the fuzzer', async () => {
    const { p, node, req } = await setup();
    const patch = await new ReferenceProvider().synthesize({ node: { id: 'jit_cache', name: '', role: '', source: node.source }, failures: [], slow: [], downstream: [] });
    const hits = runAttacks(compileFunction(patch.source), await new FuzzAttacker().generate(req), p.downstreamOf('jit_cache').map((d) => d.fn));
    expect(hits).toEqual([]);
  });
});

import { parseAttackList } from '../server/mutator';

describe('parseAttackList', () => {
  it('parses strict JSON', () => {
    expect(parseAttackList('here:\n```json\n[{"a":1},{"a":null}]\n```', 10)).toEqual([{ a: 1 }, { a: null }]);
  });
  it('tolerates JS literals the models like to emit', () => {
    const out = parseAttackList('[{a: undefined, b: NaN, c: "x",}, {d: [1,2,],}]', 10) as any[];
    expect(out).toHaveLength(2);
    expect(out[0].a).toBeUndefined();
    expect(Number.isNaN(out[0].b)).toBe(true);
    expect(out[1].d).toEqual([1, 2]);
  });
  it('rejects non-arrays and code', () => {
    expect(() => parseAttackList('{"a":1}', 10)).toThrow();
    expect(() => parseAttackList('[ (function(){ while(true){} })() ]', 10)).toThrow(/parseable/);
  });
});
