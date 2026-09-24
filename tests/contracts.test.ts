import { describe, it, expect } from 'vitest';
import { parseContract, checkContract, permits, describeContract, satisfies } from '../server/contracts';
import { Pipeline } from '../server/pipeline';
import { DEFAULT_EDGES, DEFAULT_NODES, DEFAULT_INPUT_CONTRACT, packets } from '../server/nodes';
import { FuzzAttacker, filterByContract } from '../server/attacker';
import { compileFunction } from '../server/sandbox';
import { evaluateCandidate } from '../server/evaluator';
import { loadPipeline } from '../server/pipelines';

describe('contracts', () => {
  it('parses types, unions and optional markers', () => {
    const f = parseContract({ id: 'string', ts: 'string|null', meta: 'object?' });
    expect(f.map((x) => [x.name, x.types, x.optional])).toEqual([
      ['id', ['string'], false], ['ts', ['string', 'null'], false], ['meta', ['object'], true],
    ]);
    expect(() => parseContract({ x: 'strng' })).toThrow(/unknown type/);
  });

  it('checks values and reports violations', () => {
    const f = parseContract({ id: 'string', n: 'number', k: 'integer', ts: 'string|null', opt: 'string?' });
    expect(checkContract(f, { id: 'a', n: 1.5, k: 2, ts: null })).toEqual([]);
    expect(checkContract(f, { id: 'a', n: 1.5, k: 2, ts: null, opt: 'x', extra: 1 })).toEqual([]);
    const bad = checkContract(f, { id: 7, n: NaN, k: 2.5, opt: 3 });
    expect(bad.map((b) => b.field)).toEqual(['id', 'n', 'k', 'ts', 'opt']);
    expect(checkContract(f, null)[0].expected).toBe('object');
    expect(satisfies(Infinity, ['number'])).toBe(false);
  });

  it('permits anything for undeclared fields and only in-type values for declared ones', () => {
    const f = parseContract({ line: 'string', meta: 'object?' });
    expect(permits(f, 'line', null)).toBe(false);
    expect(permits(f, 'line', 'x'.repeat(8000))).toBe(true);
    expect(permits(f, 'line', undefined)).toBe(false);
    expect(permits(f, 'meta', undefined)).toBe(true);
    expect(permits(f, 'anything', null)).toBe(true);
    expect(describeContract(undefined)).toMatch(/no contract/);
  });
});

describe('contracts in the pipeline', () => {
  it('declares emits on every default node and the logs nodes', () => {
    for (const n of DEFAULT_NODES) expect(Object.keys(n.emits ?? {}).length).toBeGreaterThan(0);
    const logs = loadPipeline(process.cwd(), 'logs');
    for (const n of logs.nodes) expect(Object.keys(n.emits ?? {}).length).toBeGreaterThan(0);
    expect(logs.input).toEqual({ id: 'string?', line: 'any?' });
  });

  it('exposes each node\'s input guarantee as the upstream emits', () => {
    const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES, { input: DEFAULT_INPUT_CONTRACT });
    expect(p.inputContractOf('stream_ingest')).toEqual(DEFAULT_INPUT_CONTRACT);
    expect(p.inputContractOf('jit_cache')).toEqual(DEFAULT_NODES[1].emits);
  });

  it('shipped nodes satisfy their own contracts on normal traffic', () => {
    const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES);
    for (let i = 0; i < 20; i++) expect(p.execute(packets.normal()).error).toBeUndefined();
    const logs = loadPipeline(process.cwd(), 'logs');
    const lp = new Pipeline(logs.nodes, logs.edges, { input: logs.input });
    for (const t of logs.traffic.normal) expect(lp.execute(t).error).toBeUndefined();
    for (const t of logs.traffic.malformed ?? []) expect(lp.execute(t).error).toBeUndefined();
  });

  it('a spliced node that breaks its contract faults at runtime and the sentinel sees it', () => {
    const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES);
    p.splice('jit_cache', 'function jitCache(input) { return { ...input, cached: "yes", cacheKey: 42, evictionBucket: 1.5 }; }');
    const res = p.execute(packets.normal());
    expect(res.faultedNode).toBe('jit_cache');
    expect(res.error).toMatch(/ContractViolation/);
    expect(res.error).toMatch(/cached: expected boolean, got string/);
    expect(res.error).toMatch(/cacheKey: expected string, got integer/);
    expect(res.error).toMatch(/evictionBucket: expected integer, got number/);
    expect(p.nodes.get('jit_cache')!.health()).toBe('faulted');
    expect(() => p.dryRun(packets.normal())).toThrow(/jit_cache: cached: expected boolean/);
  });
});

describe('contracts and the red team', () => {
  it('the fuzzer never sends what upstream guarantees cannot happen', async () => {
    const logs = loadPipeline(process.cwd(), 'logs');
    const p = new Pipeline(logs.nodes, logs.edges, { input: logs.input });
    for (const t of logs.traffic.normal) p.execute(t);
    const parse = p.nodes.get('parse')!;
    const req = {
      node: { id: 'parse', name: 'Parse', role: '', source: parse.source, depth: 1 },
      samples: parse.sampleInputs(), downstream: [], known: [], max: 60,
      inputContract: p.inputContractOf('parse'),
    };
    const inputs = await new FuzzAttacker().generate(req);
    expect(inputs.length).toBeGreaterThan(5);
    for (const i of inputs as any[]) {
      expect(typeof i.line).toBe('string');        // ingest emits line: string
      expect(typeof i.id).toBe('string');
      expect(Number.isFinite(i.receivedAt)).toBe(true);
    }
    // Without the contract the same fuzzer happily sends line: null.
    const free = await new FuzzAttacker().generate({ ...req, inputContract: undefined });
    expect((free as any[]).some((i) => i.line === null)).toBe(true);
  });

  it('filters LLM attack output by the contract', () => {
    const { kept, dropped } = filterByContract([{ line: null }, { line: 'ok', id: 'a', receivedAt: 1 }, 'junk'], { line: 'string', id: 'string', receivedAt: 'number' });
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(2);
  });

  it('the evaluator rejects a candidate that violates the declared emits contract', () => {
    const p = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES);
    for (let i = 0; i < 10; i++) p.execute(packets.normal());
    const node = p.nodes.get('jit_cache')!;
    const bad = compileFunction('function jitCache(input) { return { ...input, cached: true, cacheKey: null, evictionBucket: 0 }; }');
    const r = evaluateCandidate({ candidate: bad, incumbent: node.fn, corpus: node.corpus(), downstream: [], contract: node.emits });
    expect(r.passRate).toBe(1);
    expect(r.contractRate).toBe(0);
    expect(r.contractViolations[0].reason).toMatch(/Contract: cacheKey: expected string, got null/);
  });
});
