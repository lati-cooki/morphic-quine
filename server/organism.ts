import { EventEmitter } from 'node:events';
import path from 'node:path';
import { Pipeline, type NodeWindowStats } from './pipeline';
import { DEFAULT_EDGES, DEFAULT_NODES, packets } from './nodes';
import { Telemetry } from './telemetry';
import { Sentinel, DEFAULT_SENTINEL } from './sentinel';
import { Lineage, exportSnapshot } from './lineage';
import { selectProvider, type Provider } from './mutator';
import { compileFunction, type CompiledFn } from './sandbox';
import { evaluateCandidate } from './evaluator';
import { diffLines } from './diff';
import type { CandidateView, EventLog, LogLevel, OrganismState, Phase } from '../src/types';

interface Candidate extends CandidateView {
  compiled: CompiledFn;
  prompt: string;
  baseline: NodeWindowStats;
}

export interface OrganismOptions {
  rootDir: string;
  ambientIntervalMs?: number;
  tickIntervalMs?: number;
  spliceThreshold?: number;
  autonomous?: boolean;
  maxAttempts?: number;
}

/**
 * The control loop: traffic → sentinel → synthesize → evaluate → splice → observe → (rollback).
 * Emits 'state' whenever something worth redrawing happened.
 */
export class Organism extends EventEmitter {
  readonly pipeline = new Pipeline(DEFAULT_NODES, DEFAULT_EDGES);
  readonly telemetry = new Telemetry();
  readonly sentinel = new Sentinel(DEFAULT_SENTINEL);
  readonly lineage: Lineage;
  private provider: Provider;
  private providersAvailable: string[];
  private logs: EventLog[] = [];
  private phase: Phase = 'idle';
  private targetNodeId: string | null = null;
  private candidate: Candidate | null = null;
  private lastCandidate: (Candidate & { outcome: 'spliced' | 'discarded' }) | null = null;
  private autonomous: boolean;
  private spliceThreshold: number;
  private maxAttempts: number;
  private timers: NodeJS.Timeout[] = [];
  private started = Date.now();
  private opts: Required<OrganismOptions>;

  constructor(opts: OrganismOptions) {
    super();
    this.opts = {
      ambientIntervalMs: 400,
      tickIntervalMs: 1000,
      spliceThreshold: 85,
      autonomous: true,
      maxAttempts: 2,
      ...opts,
    };
    this.lineage = new Lineage(path.join(opts.rootDir, 'lineage'));
    const sel = selectProvider();
    this.provider = sel.active;
    this.providersAvailable = sel.available;
    this.autonomous = this.opts.autonomous;
    this.spliceThreshold = this.opts.spliceThreshold;
    this.maxAttempts = this.opts.maxAttempts;
    const replayed = this.replayLineage();
    this.log('INFO', `Engine up. ${this.pipeline.order.length} nodes compiled in isolated contexts. Lineage generation ${this.lineage.generation}${replayed ? `, ${replayed} splice${replayed === 1 ? '' : 's'} replayed from disk` : ''}.`);
    this.log('INFO', `Patch provider: ${this.provider.name} (${this.provider.model}). Available: ${this.providersAvailable.join(', ')}.`);
  }

  /** Lineage is the source of truth for what code is live: reapply every active splice, oldest first. */
  private replayLineage(): number {
    let n = 0;
    for (const rec of this.lineage.activeRecords()) {
      if (!this.pipeline.nodes.has(rec.nodeId) || !rec.source) continue;
      try { this.pipeline.splice(rec.nodeId, rec.source); n++; }
      catch (err) { this.log('INFO', `Could not replay generation ${rec.generation} onto ${rec.nodeId}: ${(err as Error).message}`); }
    }
    return n;
  }

  start() {
    this.timers.push(setInterval(() => this.ambient(), this.opts.ambientIntervalMs));
    this.timers.push(setInterval(() => this.tick(), this.opts.tickIntervalMs));
  }

  stop() { this.timers.forEach(clearInterval); this.telemetry.stop(); }

  // ---- traffic -------------------------------------------------------------------------

  private ambient() {
    this.send(packets.normal());
  }

  send(packet: unknown) {
    const res = this.pipeline.execute(packet);
    this.telemetry.record(res.latencyMs, !res.error);
    if (res.error) this.log('FAULT', `${res.faultedNode} threw: ${res.error}`, `input: ${preview(packet)}`);
    else if (res.latencyMs > DEFAULT_SENTINEL.p95ThresholdMs) {
      const slowest = res.trace.reduce((a, b) => (b.latencyMs > a.latencyMs ? b : a));
      this.log('FAULT', `${slowest.nodeId} took ${slowest.latencyMs.toFixed(1)}ms`, `input: ${preview(packet, 80)}`);
    }
    return res;
  }

  inject(kind: 'MALFORMED' | 'SURGE' | 'NORMAL', count = 1) {
    const gen = kind === 'MALFORMED' ? packets.malformed : kind === 'SURGE' ? packets.surge : packets.normal;
    this.log('INFO', `Injecting ${count} ${kind.toLowerCase()} packet${count > 1 ? 's' : ''}.`);
    for (let i = 0; i < count; i++) this.send(gen());
    this.emitState();
  }

  // ---- control loop --------------------------------------------------------------------

  private tick() {
    if (this.phase === 'observing' && this.targetNodeId) {
      const node = this.pipeline.nodes.get(this.targetNodeId)!;
      const obs = this.sentinel.observe(this.targetNodeId, node.windowStats());
      if (obs.verdict === 'regress') {
        this.log('SENTINEL', `Regression on ${node.spec.name} after splice: ${obs.detail}. Rolling back.`);
        this.rollback('sentinel');
      } else if (obs.verdict === 'pass') {
        this.log('SENTINEL', `${node.spec.name} stable after splice: ${obs.detail}.`);
        this.phase = 'idle';
        this.targetNodeId = null;
        this.emitState();
      }
    }

    if (this.phase === 'idle' && this.autonomous) {
      const stats = this.pipeline.order.map((id) => ({ nodeId: id, ...this.pipeline.nodes.get(id)!.windowStats() }));
      const [breach] = this.sentinel.check(stats);
      if (breach) {
        this.log('SENTINEL', `${this.pipeline.nodes.get(breach.nodeId)!.spec.name} breached ${breach.reason.replace('_', ' ')} threshold: ${breach.detail}.`);
        void this.synthesize(breach.nodeId);
      }
    }

    if (this.phase === 'candidate_ready' && this.autonomous && this.candidate) {
      if (this.candidate.fitness.score >= this.spliceThreshold) this.splice('sentinel');
    }
    this.emitState();
  }

  async synthesize(nodeId?: string): Promise<void> {
    if (this.phase === 'synthesizing') return;
    const target = nodeId ?? this.worstNode();
    const node = this.pipeline.nodes.get(target);
    if (!node) { this.log('SYNTH', `Unknown node ${target}.`); return; }

    this.phase = 'synthesizing';
    this.targetNodeId = target;
    this.candidate = null;
    const baseline = node.windowStats();
    const corpus = node.corpus();
    const downstream = this.pipeline.downstreamOf(target);
    this.log('SYNTH', `Requesting patch for ${node.spec.name} from ${this.provider.name}/${this.provider.model}.`, `${node.recentFailures().length} recorded failures, ${node.recentSlow().length} slow inputs, ${corpus.length} corpus samples.`);
    this.emitState();

    let feedback: string | undefined;
    let best: Candidate | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const patch = await this.provider.synthesize({
          node: { id: target, name: node.spec.name, role: node.spec.role, source: node.source },
          failures: node.recentFailures().map((f) => ({ input: f.input, error: f.error ?? 'unknown' })),
          slow: node.recentSlow().map((s) => ({ input: s.input, latencyMs: s.latencyMs })),
          downstream: downstream.map((d) => ({ name: d.spec.name, source: d.source })),
          feedback,
        });
        const compiled = compileFunction(patch.source);
        const fitness = evaluateCandidate({ candidate: compiled, incumbent: node.fn, corpus, downstream: downstream.map((d) => d.fn) });
        const cand: Candidate = {
          id: `candidate_${target}`,
          targetNodeId: target,
          name: `${node.spec.name} v${node.version + 1}`,
          source: patch.source,
          provider: patch.provider,
          model: patch.model,
          attempt,
          rationale: patch.rationale,
          fitness,
          diff: diffLines(node.source, patch.source),
          createdAt: new Date().toISOString(),
          compiled,
          prompt: patch.prompt,
          baseline,
        };
        this.log('EVAL', `Attempt ${attempt}: fitness ${fitness.score} on ${fitness.corpusSize} recorded inputs. pass ${pct(fitness.passRate)}, contract ${pct(fitness.contractRate)}, p99 ${fitness.candidate.p99}ms vs ${fitness.incumbent.p99}ms (${fitness.speedup}x).`);
        if (!best || fitness.score > best.fitness.score) best = cand;
        if (fitness.score >= this.spliceThreshold) break;
        feedback = describeShortfall(cand);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log('SYNTH', `Attempt ${attempt} failed: ${msg}`);
        feedback = `Previous attempt failed: ${msg}`;
      }
    }

    if (!best) {
      this.phase = 'idle';
      this.log('SYNTH', `No usable candidate for ${node.spec.name}.`);
    } else {
      this.candidate = best;
      this.phase = 'candidate_ready';
      const verdict = best.fitness.score >= this.spliceThreshold ? `meets splice threshold ${this.spliceThreshold}` : `below splice threshold ${this.spliceThreshold}; manual splice only`;
      this.log('EVAL', `Candidate ready for ${node.spec.name}: fitness ${best.fitness.score} (${verdict}).`);
    }
    this.emitState();
  }

  splice(by: 'user' | 'sentinel' = 'user') {
    if (!this.candidate || this.phase !== 'candidate_ready') return;
    const cand = this.candidate;
    const node = this.pipeline.nodes.get(cand.targetNodeId)!;
    const parentHash = this.pipeline.hash();
    const { previousSource, version } = this.pipeline.splice(cand.targetNodeId, cand.source);
    const hash = this.pipeline.hash();
    this.lineage.record({
      nodeId: cand.targetNodeId,
      parentHash,
      hash,
      provider: cand.provider,
      model: cand.model,
      fitnessScore: cand.fitness.score,
      speedup: cand.fitness.speedup,
      source: cand.source,
      previousSource,
      prompt: cand.prompt,
      rationale: cand.rationale,
    });
    this.sentinel.beginObservation(cand.targetNodeId, { errorRate: cand.baseline.errorRate, p95: cand.baseline.p95 });
    this.log('SPLICE', `${node.spec.name} → v${version} swapped in place by ${by}. Generation ${this.lineage.generation}, hash ${hash.slice(0, 8)}. Observing.`);
    this.lastCandidate = { ...cand, outcome: 'spliced' };
    this.candidate = null;
    this.phase = 'observing';
    this.emitState();
  }

  discard() {
    if (!this.candidate) return;
    this.log('SYNTH', `Candidate for ${this.candidate.targetNodeId} discarded.`);
    this.lastCandidate = { ...this.candidate, outcome: 'discarded' };
    this.candidate = null;
    this.phase = 'idle';
    this.targetNodeId = null;
    this.emitState();
  }

  rollback(by: 'user' | 'sentinel' = 'user') {
    const entry = this.lineage.latestActive();
    if (!entry) return;
    const node = this.pipeline.nodes.get(entry.nodeId);
    if (!node || !this.pipeline.rollback(entry.nodeId)) return;
    this.lineage.markRolledBack(entry.generation);
    this.sentinel.cancelObservation(entry.nodeId);
    this.log('ROLLBACK', `${node.spec.name} reverted to v${node.version - 2} source by ${by}. Generation ${entry.generation} marked rolled back.`);
    this.phase = 'idle';
    this.targetNodeId = null;
    this.candidate = null;
    this.emitState();
  }

  setAutonomous(enabled: boolean) {
    this.autonomous = enabled;
    this.log('INFO', `Autonomous mode ${enabled ? 'enabled: sentinel will synthesize on breach and splice above threshold' : 'disabled: synthesize and splice are manual'}.`);
    this.emitState();
  }

  snapshot(): { filename: string; code: string } {
    const out = exportSnapshot(this.pipeline, this.lineage, path.join(this.opts.rootDir, 'snapshots'));
    this.log('INFO', `Snapshot written: ${out.filename}.`);
    this.emitState();
    return out;
  }

  // ---- view ------------------------------------------------------------------------------

  state(): OrganismState {
    const nodes = this.pipeline.order.map((id) => {
      const n = this.pipeline.nodes.get(id)!;
      const s = n.windowStats();
      return {
        id,
        name: n.spec.name,
        role: n.spec.role,
        depth: this.pipeline.depthOf(id),
        health: n.health(),
        version: n.version,
        source: n.source,
        executions: n.executions,
        errors: n.errors,
        windowErrorRate: s.errorRate,
        p50: round(s.p50),
        p95: round(s.p95),
        lastLatencyMs: round(s.lastLatencyMs),
        lastError: n.lastError,
        recordedInputs: n.recordedInputs(),
        recordedFailures: n.recentFailures().length,
      };
    });
    const edges = this.pipeline.edges.map((e) => ({
      from: e.from,
      to: e.to,
      rate: Math.round(this.pipeline.edgeRate(e.from, e.to) * 10) / 10,
      degraded: this.pipeline.nodes.get(e.to)!.health() !== 'healthy',
    }));
    const strip = (c: Candidate | null) => { if (!c) return null; const { compiled: _c, prompt: _p, baseline: _b, ...view } = c; return view as CandidateView; };
    return {
      generation: this.lineage.generation,
      stateHash: this.pipeline.hash(),
      uptimeSec: Math.floor((Date.now() - this.started) / 1000),
      phase: this.phase,
      targetNodeId: this.targetNodeId,
      autonomous: this.autonomous,
      spliceThreshold: this.spliceThreshold,
      nodes,
      edges,
      candidate: strip(this.candidate),
      lastCandidate: this.lastCandidate ? ({ ...strip(this.lastCandidate)!, outcome: this.lastCandidate.outcome }) : null,
      vitals: this.telemetry.vitals(),
      logs: this.logs.slice(-60),
      lineage: this.lineage.list(),
      provider: { active: this.provider.name, model: this.provider.model, available: this.providersAvailable },
      canRollback: Boolean(this.lineage.latestActive()),
    };
  }

  private worstNode(): string {
    let worst = this.pipeline.order[0];
    let worstScore = -1;
    for (const id of this.pipeline.order) {
      const s = this.pipeline.nodes.get(id)!.windowStats();
      const score = s.errorRate * 1000 + s.p95;
      if (score > worstScore) { worstScore = score; worst = id; }
    }
    return worst;
  }

  private log(level: LogLevel, message: string, details?: string) {
    this.logs.push({ id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, ts: new Date().toISOString(), level, message, details });
    if (this.logs.length > 200) this.logs.shift();
    this.emit('log');
  }

  private emitState() { this.emit('state'); }
}

function describeShortfall(c: Candidate): string {
  const parts: string[] = [`Fitness ${c.fitness.score}/100.`];
  if (c.fitness.failures.length) parts.push(`Still throws on:\n${c.fitness.failures.map((f) => `- ${f.input} → ${f.error}`).join('\n')}`);
  if (c.fitness.contractViolations.length) parts.push(`Contract violations:\n${c.fitness.contractViolations.map((v) => `- ${v.input} → ${v.reason}`).join('\n')}`);
  if (c.fitness.latencyScore < 1) parts.push(`p99 latency ${c.fitness.candidate.p99}ms is over the 5ms budget.`);
  return parts.join('\n');
}

function preview(v: unknown, max = 160): string {
  try { const s = JSON.stringify(v) ?? 'undefined'; return s.length > max ? s.slice(0, max - 1) + '…' : s; } catch { return String(v); }
}
function pct(n: number) { return `${Math.round(n * 100)}%`; }
function round(n: number) { return Math.round(n * 100) / 100; }
