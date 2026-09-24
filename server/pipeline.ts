import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { compileFunction, type CompiledFn } from './sandbox';
import type { EdgeSpec, NodeSpec } from './nodes';
import type { NodeHealth } from '../src/types';
import { parseContract, checkContract, describeViolations, type Contract, type FieldSpec } from './contracts';

export interface TrafficSample {
  input: unknown;
  ok: boolean;
  error?: string;
  latencyMs: number;
  ts: number;
}

export interface NodeWindowStats {
  samples: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  lastLatencyMs: number;
  /** Samples in the window over the slow threshold. */
  slowCount: number;
}

export interface HealthThresholds {
  errorRate: number;
  p95Ms: number;
  minSamples: number;
}

export const DEFAULT_THRESHOLDS: HealthThresholds = { errorRate: 0.05, p95Ms: 25, minSamples: 8 };

class Ring<T> {
  private buf: T[] = [];
  constructor(private cap: number) {}
  push(v: T) { this.buf.push(v); if (this.buf.length > this.cap) this.buf.shift(); }
  values(): T[] { return this.buf.slice(); }
  get length() { return this.buf.length; }
  clear() { this.buf = []; }
  last(): T | undefined { return this.buf[this.buf.length - 1]; }
}

export class RuntimeNode {
  fn: CompiledFn;
  /** Parsed emits contract. */
  readonly emits: FieldSpec[];
  version = 1;
  history: string[] = [];
  executions = 0;
  errors = 0;
  lastError?: string;
  private window = new Ring<{ ok: boolean; latencyMs: number }>(50);
  private traffic = new Ring<TrafficSample>(60);
  private failures = new Ring<TrafficSample>(20);
  private slow = new Ring<TrafficSample>(10);
  /** Inputs discovered by the attacker. Persistent; every future candidate must survive them. */
  adversarial: unknown[] = [];

  constructor(public spec: NodeSpec, timeoutMs: number) {
    this.fn = compileFunction(spec.source, { timeoutMs });
    this.emits = parseContract(spec.emits);
  }

  get source() { return this.fn.source; }

  record(sample: TrafficSample, slowMs: number) {
    this.executions++;
    this.window.push({ ok: sample.ok, latencyMs: sample.latencyMs });
    this.traffic.push(sample);
    if (!sample.ok) { this.errors++; this.lastError = sample.error; this.failures.push(sample); }
    else if (sample.latencyMs > slowMs) this.slow.push(sample);
  }

  windowStats(slowMs: number = DEFAULT_THRESHOLDS.p95Ms): NodeWindowStats {
    const w = this.window.values();
    const lat = w.map((s) => s.latencyMs).sort((a, b) => a - b);
    const q = (p: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : 0);
    return {
      samples: w.length,
      errorRate: w.length ? w.filter((s) => !s.ok).length / w.length : 0,
      p50: q(0.5),
      p95: q(0.95),
      p99: q(0.99),
      lastLatencyMs: this.window.last()?.latencyMs ?? 0,
      slowCount: w.filter((s) => s.ok && s.latencyMs > slowMs).length,
    };
  }

  /** Drop recorded slow inputs and their window samples after they proved transient. */
  forgetSlow() {
    this.slow.clear();
  }

  health(t: HealthThresholds = DEFAULT_THRESHOLDS): NodeHealth {
    const s = this.windowStats();
    if (s.samples === 0) return 'healthy';
    if (s.errorRate > 0) return 'faulted';
    if (s.p95 > t.p95Ms) return 'degraded';
    return 'healthy';
  }

  /** Verification corpus: everything recently seen, with failures and slow inputs guaranteed present. */
  corpus(): unknown[] {
    const seen = new Set<string>();
    const out: unknown[] = [];
    const add = (s: TrafficSample) => {
      const k = safeKey(s.input);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(s.input);
    };
    this.failures.values().forEach(add);
    this.slow.values().forEach(add);
    this.traffic.values().forEach(add);
    for (const a of this.adversarial) { const k = safeKey(a); if (!seen.has(k)) { seen.add(k); out.push(a); } }
    return out;
  }

  addAdversarial(inputs: unknown[]): number {
    const have = new Set(this.adversarial.map(safeKey));
    let n = 0;
    for (const i of inputs) { const k = safeKey(i); if (!have.has(k)) { have.add(k); this.adversarial.push(i); n++; } }
    return n;
  }

  /** Recent successful inputs, for the attacker to learn the shape from. */
  sampleInputs(max = 8): unknown[] {
    return this.traffic.values().filter((t) => t.ok).slice(-max).map((t) => t.input);
  }

  recentFailures(): TrafficSample[] { return this.failures.values(); }
  recentSlow(): TrafficSample[] { return this.slow.values(); }
  recordedInputs(): number { return this.traffic.length; }

  resetWindow() { this.window.clear(); this.failures.clear(); this.slow.clear(); }
}

function safeKey(v: unknown): string {
  try { return JSON.stringify(v, (_k, val) => (typeof val === 'number' && Number.isNaN(val) ? '__NaN__' : val))?.slice(0, 400) ?? 'undefined'; } catch { return String(v); }
}

export interface ExecutionResult {
  output?: unknown;
  latencyMs: number;
  error?: string;
  faultedNode?: string;
  trace: Array<{ nodeId: string; latencyMs: number; ok: boolean }>;
}

export interface PipelineOptions {
  timeoutMs?: number;
  slowMs?: number;
  /** Contract for external packets, assumed by the first node. */
  input?: Contract;
}

export class Pipeline {
  readonly nodes = new Map<string, RuntimeNode>();
  readonly edges: EdgeSpec[];
  readonly order: string[];
  private edgeHits = new Map<string, Ring<number>>();
  totalPackets = 0;
  totalErrors = 0;
  private timeoutMs: number;
  private slowMs: number;
  readonly inputContract: Contract | undefined;

  constructor(specs: NodeSpec[], edges: EdgeSpec[], opts: PipelineOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 250;
    this.slowMs = opts.slowMs ?? DEFAULT_THRESHOLDS.p95Ms;
    this.inputContract = opts.input;
    for (const s of specs) this.nodes.set(s.id, new RuntimeNode(s, this.timeoutMs));
    this.edges = edges;
    this.order = topoSort(specs.map((s) => s.id), edges);
    for (const e of edges) this.edgeHits.set(`${e.from}->${e.to}`, new Ring<number>(200));
  }

  depthOf(nodeId: string): number {
    const depth = new Map<string, number>();
    for (const id of this.order) {
      const parents = this.edges.filter((e) => e.to === id).map((e) => depth.get(e.from) ?? 0);
      depth.set(id, parents.length ? Math.max(...parents) + 1 : 0);
    }
    return depth.get(nodeId) ?? 0;
  }

  /** What a node may assume about its input: the upstream node's emits, or the pipeline input contract for the first node. */
  inputContractOf(nodeId: string): Contract | undefined {
    const idx = this.order.indexOf(nodeId);
    if (idx <= 0) return this.inputContract;
    return this.nodes.get(this.order[idx - 1])!.spec.emits;
  }

  downstreamOf(nodeId: string): RuntimeNode[] {
    const idx = this.order.indexOf(nodeId);
    return this.order.slice(idx + 1).map((id) => this.nodes.get(id)!);
  }

  execute(packet: unknown): ExecutionResult {
    const t0 = performance.now();
    this.totalPackets++;
    let current = packet;
    const trace: ExecutionResult['trace'] = [];
    for (let i = 0; i < this.order.length; i++) {
      const nodeId = this.order[i];
      const node = this.nodes.get(nodeId)!;
      const input = current;
      const ts = performance.now();
      try {
        current = node.fn.call(input);
        const bad = checkContract(node.emits, current);
        if (bad.length) throw new ContractViolationError(describeViolations(bad));
        const latencyMs = performance.now() - ts;
        node.record({ input, ok: true, latencyMs, ts }, this.slowMs);
        trace.push({ nodeId, latencyMs, ok: true });
        if (i + 1 < this.order.length) this.edgeHits.get(`${nodeId}->${this.order[i + 1]}`)?.push(ts);
      } catch (err) {
        const latencyMs = performance.now() - ts;
        const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        node.record({ input, ok: false, error, latencyMs, ts }, this.slowMs);
        trace.push({ nodeId, latencyMs, ok: false });
        this.totalErrors++;
        return { latencyMs: performance.now() - t0, error, faultedNode: nodeId, trace };
      }
    }
    return { output: current, latencyMs: performance.now() - t0, trace };
  }

  /** Execute without recording stats, optionally substituting node implementations. Throws on failure. */
  dryRun(input: unknown, overrides: Map<string, CompiledFn> = new Map()): { output: unknown; nodeInputs: Map<string, unknown> } {
    let current = input;
    const nodeInputs = new Map<string, unknown>();
    for (const id of this.order) {
      nodeInputs.set(id, current);
      const fn = overrides.get(id) ?? this.nodes.get(id)!.fn;
      try {
        current = fn.call(current);
        const bad = checkContract(this.nodes.get(id)!.emits, current);
        if (bad.length) throw new ContractViolationError(describeViolations(bad));
      }
      catch (err) {
        const e = new Error(`${id}: ${err instanceof Error ? err.message : String(err)}`) as Error & { nodeId: string; nodeInputs: Map<string, unknown>; cause: unknown };
        e.nodeId = id;
        e.nodeInputs = nodeInputs;
        e.cause = err;
        throw e;
      }
    }
    return { output: current, nodeInputs };
  }

  edgeRate(from: string, to: string, windowMs = 5000): number {
    const now = performance.now();
    const hits = this.edgeHits.get(`${from}->${to}`)?.values() ?? [];
    return hits.filter((t) => now - t <= windowMs).length / (windowMs / 1000);
  }

  /** Swap a node's implementation. Previous source is kept for rollback. */
  splice(nodeId: string, source: string): { previousSource: string; version: number } {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown node ${nodeId}`);
    const compiled = compileFunction(source, { timeoutMs: this.timeoutMs });
    const previousSource = node.source;
    node.history.push(previousSource);
    node.fn = compiled;
    node.version++;
    node.lastError = undefined;
    node.resetWindow();
    return { previousSource, version: node.version };
  }

  rollback(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node || node.history.length === 0) return false;
    const prev = node.history.pop()!;
    node.fn = compileFunction(prev, { timeoutMs: this.timeoutMs });
    node.version++;
    node.lastError = undefined;
    node.resetWindow();
    return true;
  }

  hash(): string {
    const h = crypto.createHash('sha256');
    for (const id of this.order) h.update(`${id}:${this.nodes.get(id)!.source};`);
    return h.digest('hex');
  }
}

export class ContractViolationError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ContractViolation'; }
}

export function topoSort(ids: string[], edges: EdgeSpec[]): string[] {
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const e of edges.filter((e) => e.from === id)) {
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  if (out.length !== ids.length) throw new Error('Pipeline graph has a cycle');
  return out;
}
