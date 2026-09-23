import { EventEmitter } from 'node:events';
import path from 'node:path';
import { Pipeline, type NodeWindowStats } from './pipeline';
import { loadPipeline, trafficFor, listPipelines, type PipelineDef } from './pipelines';
import { Telemetry } from './telemetry';
import { Sentinel, DEFAULT_SENTINEL } from './sentinel';
import { Lineage, exportSnapshot } from './lineage';
import { selectProvider, ProviderAttacker, type Provider } from './mutator';
import { FuzzAttacker, CompositeAttacker, runAttacks, previewInput, withTimeout, type Attacker, type AttackHit } from './attacker';
import fs from 'node:fs';
import { compileFunction, type CompiledFn } from './sandbox';
import { performance } from 'node:perf_hooks';
import { evaluateCandidate } from './evaluator';
import { diffLines } from './diff';
import { loadGoals, scoreGoal, scoreOutput, splitOf, type Goal, type GoalScore } from './goals';
import type { CandidateView, EventLog, GoalView, LogLevel, OrganismState, Phase } from '../src/types';

interface Candidate extends CandidateView {
  compiled: CompiledFn;
  prompt: string;
  baseline: NodeWindowStats;
}

export interface OrganismOptions {
  rootDir: string;
  /** Pipeline name: 'default' or a directory under pipelines/. */
  pipeline?: string;
  ambientIntervalMs?: number;
  tickIntervalMs?: number;
  spliceThreshold?: number;
  autonomous?: boolean;
  maxAttempts?: number;
  /** Override provider selection (tests). */
  provider?: Provider;
  /** Directory of goal JSON files. Defaults to <rootDir>/goals. */
  goalsDir?: string;
  /** Seconds between goal-driven synthesis attempts for the same goal. */
  goalCooldownMs?: number;
  /** Override the red team (tests). */
  attacker?: Attacker;
  /** Red-team rounds per candidate. 0 disables hardening. */
  attackRounds?: number;
  /** Adversarial inputs requested per round. */
  attackBatch?: number;
  /** Hard ceiling on any single provider or attacker call. */
  providerTimeoutMs?: number;
}

/**
 * The control loop: traffic → sentinel → synthesize → evaluate → splice → observe → (rollback).
 * Emits 'state' whenever something worth redrawing happened.
 */
export class Organism extends EventEmitter {
  readonly def: PipelineDef;
  readonly pipeline: Pipeline;
  private traffic: ReturnType<typeof trafficFor>;
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
  private opts: Required<Omit<OrganismOptions, 'provider' | 'goalsDir' | 'attacker' | 'pipeline'>> & { goalsDir: string; pipeline: string };
  private attacker: Attacker;
  private corpusDir: string;
  private goals: Goal[] = [];
  private goalScores = new Map<string, GoalScore>();
  private goalLastTry = new Map<string, number>();
  private goalFeedback = new Map<string, string>();
  private activeGoal: string | null = null;

  constructor(opts: OrganismOptions) {
    super();
    this.def = loadPipeline(opts.rootDir, opts.pipeline ?? 'default');
    this.pipeline = new Pipeline(this.def.nodes, this.def.edges);
    this.traffic = trafficFor(this.def);
    this.opts = {
      ambientIntervalMs: 400,
      tickIntervalMs: 1000,
      spliceThreshold: 85,
      autonomous: true,
      maxAttempts: 3,
      goalCooldownMs: 30_000,
      attackRounds: 2,
      attackBatch: 32,
      providerTimeoutMs: 120_000,
      pipeline: opts.pipeline ?? 'default',
      goalsDir: opts.goalsDir ?? path.join(this.def.dir, 'goals'),
      ...opts,
    };
    this.corpusDir = path.join(this.def.dir, 'corpus');
    this.lineage = new Lineage(path.join(this.def.dir, 'lineage'));
    const sel = selectProvider();
    this.provider = opts.provider ?? sel.active;
    this.providersAvailable = opts.provider ? [opts.provider.name] : sel.available;
    this.attacker = opts.attacker ?? (process.env.ATTACKER !== 'fuzz' && this.provider.attack ? new CompositeAttacker([new FuzzAttacker(), new ProviderAttacker(this.provider)]) : new FuzzAttacker());
    this.loadAdversarialCorpus();
    try { this.goals = loadGoals(this.opts.goalsDir); } catch (err) { this.log('GOAL', `Could not load goals: ${(err as Error).message}`); }
    this.autonomous = this.opts.autonomous;
    this.spliceThreshold = this.opts.spliceThreshold;
    this.maxAttempts = this.opts.maxAttempts;
    const replayed = this.replayLineage();
    this.log('INFO', `Engine up on pipeline "${this.def.name}": ${this.pipeline.order.length} nodes compiled in isolated contexts. Lineage generation ${this.lineage.generation}${replayed ? `, ${replayed} splice${replayed === 1 ? '' : 's'} replayed from disk` : ''}.`);
    this.log('INFO', `Patch provider: ${this.provider.name} (${this.provider.model}). Available: ${this.providersAvailable.join(', ')}. Red team: ${this.attacker.name} (${this.attacker.model}), ${this.opts.attackRounds} round${this.opts.attackRounds === 1 ? '' : 's'} per candidate.`);
    if (this.goals.length) {
      this.rescoreGoals();
      for (const g of this.goals) {
        const sc = this.goalScores.get(g.name)!;
        this.log('GOAL', `Goal "${g.name}" loaded: ${g.examples.length} examples (${sc.trainCount} train / ${sc.holdoutCount} holdout), target ${g.target}. Holdout score ${sc.holdout}.`);
      }
    }
  }

  private rescoreGoals() {
    for (const g of this.goals) this.goalScores.set(g.name, scoreGoal(g, (input) => this.pipeline.dryRun(input).output));
  }

  /**
   * Replay the goal examples that die in `blocker` and record each as a failure on that node, so the
   * repair prompt and the verification corpus both contain the inputs that actually matter.
   */
  private feedGoalFailuresTo(g: Goal, blocker: string): number {
    const node = this.pipeline.nodes.get(blocker)!;
    let n = 0;
    for (const ex of g.examples) {
      try { this.pipeline.dryRun(ex.input); }
      catch (err) {
        const e = err as { nodeId?: string; nodeInputs?: Map<string, unknown>; cause?: unknown };
        if (e.nodeId !== blocker || !e.nodeInputs) continue;
        const cause = e.cause instanceof Error ? `${e.cause.name}: ${e.cause.message}` : String(e.cause);
        node.record({ input: e.nodeInputs.get(blocker), ok: false, error: `goal "${g.name}" example: ${cause}`, latencyMs: 0, ts: performance.now() }, DEFAULT_SENTINEL.p95ThresholdMs);
        n++;
      }
    }
    return n;
  }

  /** If every current miss on a goal is a throw in one node upstream of the target, that node is the real problem. */
  private upstreamBlocker(g: Goal): string | null {
    const sc = this.goalScores.get(g.name);
    if (!sc || sc.misses.length === 0) return null;
    const target = this.goalTarget(g);
    let blocker: string | null = null;
    for (const m of sc.misses) {
      const err = typeof m.actual === 'object' && m.actual !== null && 'error' in (m.actual as object) ? String((m.actual as { error: unknown }).error) : null;
      const id = err ? this.pipeline.order.find((nid) => err.startsWith(`${nid}: `)) ?? null : null;
      if (!id || id === target) return null;
      if (blocker && blocker !== id) return null;
      blocker = id;
    }
    return blocker;
  }

  private goalTarget(g: Goal): string { return g.nodeId ?? this.pipeline.order[this.pipeline.order.length - 1]; }

  private loadAdversarialCorpus() {
    if (!fs.existsSync(this.corpusDir)) return;
    let total = 0;
    for (const [id, node] of this.pipeline.nodes) {
      const file = path.join(this.corpusDir, `${id}.json`);
      if (!fs.existsSync(file)) continue;
      try { total += node.addAdversarial(JSON.parse(fs.readFileSync(file, 'utf-8'))); }
      catch (err) { this.log('ATTACK', `Could not read adversarial corpus for ${id}: ${(err as Error).message}`); }
    }
    if (total) this.log('ATTACK', `Loaded ${total} adversarial input${total === 1 ? '' : 's'} from disk.`);
  }

  private saveAdversarialCorpus(nodeId: string) {
    fs.mkdirSync(this.corpusDir, { recursive: true });
    const node = this.pipeline.nodes.get(nodeId)!;
    fs.writeFileSync(path.join(this.corpusDir, `${nodeId}.json`), JSON.stringify(node.adversarial, (_k, v) => (typeof v === 'number' && Number.isNaN(v) ? null : v), 2));
  }

  /**
   * Red-team a function. Returns the hits and records them in the node's permanent corpus so
   * every future candidate has to survive them.
   */
  private async attack(nodeId: string, fn: CompiledFn, label: string): Promise<{ tried: number; hits: AttackHit[] }> {
    const node = this.pipeline.nodes.get(nodeId)!;
    const downstream = this.pipeline.downstreamOf(nodeId);
    const inputs = await withTimeout(this.attacker.generate({
      node: { id: nodeId, name: node.spec.name, role: node.spec.role, source: fn.source, depth: this.pipeline.depthOf(nodeId) },
      samples: node.sampleInputs(),
      downstream: downstream.map((d) => ({ name: d.spec.name, source: d.source })),
      known: node.adversarial.slice(-20),
      max: this.opts.attackBatch,
    }), this.opts.providerTimeoutMs, `${this.attacker.name} attack`);
    const warnings = (inputs as unknown[] & { warnings?: string[] }).warnings;
    if (warnings?.length) this.log('ATTACK', `Part of the red team failed: ${warnings.join('; ')}`);
    const hits = runAttacks(fn, inputs, downstream.map((d) => d.fn));
    if (hits.length) {
      const added = node.addAdversarial(hits.map((h) => h.input));
      if (added) this.saveAdversarialCorpus(nodeId);
      this.log('ATTACK', `${this.attacker.name} broke ${label} with ${hits.length}/${inputs.length} inputs. ${added} new input${added === 1 ? '' : 's'} added to ${node.spec.name}'s permanent corpus (${node.adversarial.length} total).`,
        hits.slice(0, 3).map((h) => `${previewInput(h.input, 90)} → ${h.error}`).join('\n'));
    } else {
      this.log('ATTACK', `${this.attacker.name} tried ${inputs.length} inputs against ${label}; none landed.`);
    }
    return { tried: inputs.length, hits };
  }

  /** Attack the live code of a healthy node. Hits are recorded as failures so the sentinel treats them like observed ones. */
  async probe(nodeId: string): Promise<void> {
    if (this.phase !== 'idle') return;
    const node = this.pipeline.nodes.get(nodeId);
    if (!node) return;
    this.phase = 'probing';
    this.targetNodeId = nodeId;
    this.log('ATTACK', `Probing ${node.spec.name} v${node.version} with ${this.attacker.name}.`);
    this.emitState();
    try {
      const { hits } = await this.attack(nodeId, node.fn, `${node.spec.name} v${node.version}`);
      for (const h of hits.slice(0, 10)) node.record({ input: h.input, ok: false, error: `discovered by ${this.attacker.name}: ${h.error}`, latencyMs: 0, ts: performance.now() }, DEFAULT_SENTINEL.p95ThresholdMs);
      if (hits.length) this.log('SENTINEL', `${node.spec.name} marked faulted on discovered inputs; ${this.autonomous ? 'synthesis will follow.' : 'synthesize to repair.'}`);
    } catch (err) {
      this.log('ATTACK', `Probe failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.phase = 'idle';
    this.targetNodeId = null;
    this.emitState();
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
    this.send(this.traffic.normal());
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
    const gen = kind === 'MALFORMED' ? this.traffic.malformed : kind === 'SURGE' ? this.traffic.surge : this.traffic.normal;
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
        if (this.activeGoal) {
          this.rescoreGoals();
          const g = this.goals.find((x) => x.name === this.activeGoal)!;
          const sc = this.goalScores.get(g.name)!;
          this.log('GOAL', `Goal "${g.name}" now scores ${sc.holdout} on holdout (target ${g.target}): ${sc.holdout >= g.target ? 'met' : 'still unmet'}.`);
          if (sc.holdout >= g.target) this.goalFeedback.delete(g.name);
        }
        this.activeGoal = null;
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

    if (this.phase === 'idle' && this.goals.length) {
      this.rescoreGoals();
      if (this.autonomous) {
        const now = Date.now();
        const unmet = this.goals.find((g) => {
          const sc = this.goalScores.get(g.name)!;
          return sc.holdout < g.target && now - (this.goalLastTry.get(g.name) ?? -Infinity) > this.opts.goalCooldownMs;
        });
        if (unmet) {
          const sc = this.goalScores.get(unmet.name)!;
          this.goalLastTry.set(unmet.name, now);
          const blocker = this.upstreamBlocker(unmet);
          if (blocker) {
            const fed = this.feedGoalFailuresTo(unmet, blocker);
            this.log('GOAL', `Goal "${unmet.name}" unmet: holdout ${sc.holdout} < target ${unmet.target}. Every remaining miss fails upstream in ${this.pipeline.nodes.get(blocker)!.spec.name}; repairing that node instead of rewriting ${this.goalTarget(unmet)}. ${fed} failing goal input${fed === 1 ? '' : 's'} recorded against it.`);
            void this.synthesize(blocker);
          } else {
            this.log('GOAL', `Goal "${unmet.name}" unmet: holdout ${sc.holdout} < target ${unmet.target}. Synthesizing toward it on ${this.goalTarget(unmet)}.`);
            void this.synthesize(this.goalTarget(unmet), unmet.name);
          }
        }
      }
    }

    if (this.phase === 'candidate_ready' && this.autonomous && this.candidate) {
      const c = this.candidate;
      if (c.fitness.score >= this.spliceThreshold) {
        // A goal candidate has to move the holdout score, not just clear the composite threshold.
        const g = c.fitness.goal;
        const current = g ? this.goalScores.get(g.name)?.holdout ?? 0 : 0;
        if (g && g.holdout < g.target && g.holdout <= current) {
          this.log('EVAL', `Holding candidate for ${c.targetNodeId}: goal "${g.name}" holdout ${g.holdout} does not improve on the live ${current} and is below target ${g.target}. Discarding; next attempt will carry this feedback.`);
          this.goalFeedback.set(g.name, `The previous candidate scored ${g.holdout} on hidden examples, no better than the current code (${current}). It did not generalise. Re-read the goal description and implement the rule it states for all cases, not only the listed examples.`);
          this.discard();
        } else {
          this.splice('sentinel');
        }
      }
    }
    this.emitState();
  }

  async synthesize(nodeId?: string, goalName?: string): Promise<void> {
    if (this.phase === 'synthesizing') return;
    const goal = goalName ? this.goals.find((g) => g.name === goalName) : undefined;
    if (goalName && !goal) { this.log('GOAL', `Unknown goal ${goalName}.`); return; }
    const target = nodeId ?? (goal ? this.goalTarget(goal) : this.worstNode());
    const node = this.pipeline.nodes.get(target);
    if (!node) { this.log('SYNTH', `Unknown node ${target}.`); return; }

    this.phase = 'synthesizing';
    this.targetNodeId = target;
    this.activeGoal = goal?.name ?? null;
    this.candidate = null;
    if (goal) this.goalLastTry.set(goal.name, Date.now());
    const baseline = node.windowStats();
    const corpus = node.corpus();
    const downstream = this.pipeline.downstreamOf(target);
    this.log('SYNTH', `Requesting ${goal ? `goal-directed rewrite` : 'patch'} for ${node.spec.name} from ${this.provider.name}/${this.provider.model}.`, `${node.recentFailures().length} recorded failures, ${node.recentSlow().length} slow inputs, ${corpus.length} corpus samples${goal ? `, goal "${goal.name}"` : ''}.`);
    this.emitState();

    // Goal examples for the prompt: training split only, with the node's actual input and the pipeline's current output.
    const goalExamples = goal
      ? goal.examples.filter((ex) => splitOf(ex) === 'train').map((ex) => {
          let nodeInput: unknown = undefined; let actual: unknown;
          try { const r = this.pipeline.dryRun(ex.input); nodeInput = r.nodeInputs.get(target); actual = r.output; }
          catch (err) { actual = { error: err instanceof Error ? err.message : String(err) }; }
          return { pipelineInput: ex.input, nodeInput, expected: ex.expected, actual };
        })
      : undefined;
    if (goal) {
      const upstream = new Map<string, number>();
      for (const ex of goal.examples) {
        try { this.pipeline.dryRun(ex.input); }
        catch (err) { const id = (err as { nodeId?: string }).nodeId; if (id && id !== target) upstream.set(id, (upstream.get(id) ?? 0) + 1); }
      }
      for (const [id, n] of upstream) this.log('GOAL', `${n} goal example${n > 1 ? 's' : ''} fail upstream in ${this.pipeline.nodes.get(id)!.spec.name} before reaching ${node.spec.name}. Rewriting ${node.spec.name} cannot fix those; repair ${this.pipeline.nodes.get(id)!.spec.name} first.`);
    }
    // Goal inputs also join the corpus so pass/contract are checked on them too.
    if (goal) for (const ex of goal.examples) { try { corpus.push(this.pipeline.dryRun(ex.input).nodeInputs.get(target)); } catch { /* upstream failed; nothing to feed this node */ } }

    let feedback: string | undefined = goal ? this.goalFeedback.get(goal.name) : undefined;
    let best: Candidate | null = null;
    let attackRoundsUsed = 0;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const patch = await withTimeout(this.provider.synthesize({
          node: { id: target, name: node.spec.name, role: node.spec.role, source: node.source },
          failures: node.recentFailures().map((f) => ({ input: f.input, error: f.error ?? 'unknown' })),
          slow: node.recentSlow().map((s) => ({ input: s.input, latencyMs: s.latencyMs })),
          downstream: downstream.map((d) => ({ name: d.spec.name, source: d.source })),
          feedback,
          goal: goal && goalExamples ? { name: goal.name, description: goal.description, examples: goalExamples.filter((e) => scoreOf(goal, e) < 1).slice(0, 8).concat(goalExamples.filter((e) => scoreOf(goal, e) >= 1).slice(0, 2)) } : undefined,
        }), this.opts.providerTimeoutMs, `${this.provider.name} synthesize`);
        const compiled = compileFunction(patch.source);
        const overrides = new Map([[target, compiled]]);
        const fitness = evaluateCandidate({
          candidate: compiled,
          incumbent: node.fn,
          corpus,
          downstream: downstream.map((d) => d.fn),
          goal: goal ? { goal, run: (input) => this.pipeline.dryRun(input, overrides).output } : undefined,
        });
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
        this.log('EVAL', `Attempt ${attempt}: fitness ${fitness.score} on ${fitness.corpusSize} inputs. pass ${pct(fitness.passRate)}, contract ${pct(fitness.contractRate)}, p99 ${fitness.candidate.p99}ms vs ${fitness.incumbent.p99}ms (${fitness.speedup}x)${fitness.goal ? `, goal train ${fitness.goal.train} / holdout ${fitness.goal.holdout}` : ''}.`);
        if (fitness.goal && fitness.goal.train - fitness.goal.holdout > 0.25) this.log('EVAL', `Attempt ${attempt}: train/holdout gap ${(fitness.goal.train - fitness.goal.holdout).toFixed(2)}. The candidate fits the shown examples better than the hidden ones; likely hardcoded.`);
        if (!best || fitness.score > best.fitness.score) best = cand;
        if (fitness.score < this.spliceThreshold) { feedback = describeShortfall(cand); continue; }

        // Fitness cleared. Now try to break it before it ships.
        if (this.opts.attackRounds > 0 && attackRoundsUsed < this.opts.attackRounds) {
          attackRoundsUsed++;
          let tried = 0; let hits: AttackHit[] = [];
          try { ({ tried, hits } = await this.attack(target, compiled, `candidate attempt ${attempt}`)); }
          catch (err) {
            // A red-team failure is not a candidate failure. Keep the candidate, say what happened.
            this.log('ATTACK', `Red team unavailable for attempt ${attempt}: ${err instanceof Error ? err.message : String(err)}. Candidate kept unhardened.`);
            cand.hardening = { attacker: this.attacker.name, rounds: attackRoundsUsed, tried: 0, hits: 0, survived: false, sample: [], error: err instanceof Error ? err.message : String(err) };
            break;
          }
          cand.hardening = {
            attacker: this.attacker.name, rounds: attackRoundsUsed, tried, hits: hits.length, survived: hits.length === 0,
            sample: hits.slice(0, 5).map((h) => ({ input: previewInput(h.input), error: h.error })),
          };
          if (hits.length) {
            // Re-score with the hits in the corpus so the number on the card is honest, then send it back.
            for (const h of hits) corpus.push(h.input);
            cand.fitness = evaluateCandidate({ candidate: compiled, incumbent: node.fn, corpus, downstream: downstream.map((d) => d.fn), goal: goal ? { goal, run: (input) => this.pipeline.dryRun(input, overrides).output } : undefined });
            this.log('EVAL', `Attempt ${attempt} re-scored with adversarial inputs: fitness ${cand.fitness.score}.`);
            if (cand.fitness.score > (best?.fitness.score ?? -1) || best === cand) best = cand;
            feedback = describeShortfall(cand) + `\n\nAdversarial inputs that broke this version:\n` + hits.slice(0, 8).map((h) => `- ${previewInput(h.input, 200)} → ${h.error}`).join('\n');
            if (attempt < this.maxAttempts) continue;
          }
        } else if (this.opts.attackRounds > 0) {
          cand.hardening = { attacker: this.attacker.name, rounds: attackRoundsUsed, tried: 0, hits: 0, survived: true, sample: [] };
        }
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log('SYNTH', `Attempt ${attempt} failed: ${msg}`);
        feedback = `Previous attempt failed: ${msg}`;
      }
    }

    if (!best) {
      this.phase = 'idle';
      this.targetNodeId = null;
      this.activeGoal = null;
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
    this.rescoreGoals();
    this.emitState();
  }

  discard() {
    if (!this.candidate) return;
    this.log('SYNTH', `Candidate for ${this.candidate.targetNodeId} discarded.`);
    this.lastCandidate = { ...this.candidate, outcome: 'discarded' };
    this.candidate = null;
    this.activeGoal = null;
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
    this.rescoreGoals();
    this.phase = 'idle';
    this.targetNodeId = null;
    this.candidate = null;
    this.activeGoal = null;
    this.emitState();
  }

  setAutonomous(enabled: boolean) {
    this.autonomous = enabled;
    this.log('INFO', `Autonomous mode ${enabled ? 'enabled: sentinel will synthesize on breach and splice above threshold' : 'disabled: synthesize and splice are manual'}.`);
    this.emitState();
  }

  snapshot(): { filename: string; code: string } {
    const out = exportSnapshot(this.pipeline, this.lineage, path.join(this.def.dir, 'snapshots'));
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
        adversarialInputs: n.adversarial.length,
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
      pipeline: { name: this.def.name, description: this.def.description, available: listPipelines(this.opts.rootDir) },
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
      goals: this.goals.map((g) => this.goalView(g)),
      activeGoal: this.activeGoal,
      provider: { active: this.provider.name, model: this.provider.model, available: this.providersAvailable },
      attacker: { name: this.attacker.name, model: this.attacker.model },
      canRollback: Boolean(this.lineage.latestActive()),
    };
  }

  private goalView(g: Goal): GoalView {
    const sc = this.goalScores.get(g.name) ?? scoreGoal(g, (input) => this.pipeline.dryRun(input).output);
    return {
      name: g.name,
      description: g.description,
      nodeId: this.goalTarget(g),
      target: g.target,
      train: sc.train,
      holdout: sc.holdout,
      trainCount: sc.trainCount,
      holdoutCount: sc.holdoutCount,
      met: sc.holdout >= g.target,
      worstMisses: sc.misses.slice(0, 6).map((m) => ({ input: preview(m.input, 100), expected: preview(m.expected, 80), actual: preview(pick(m.actual, m.expected), 100), split: m.split })),
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
  if (c.fitness.goal && c.fitness.goal.holdout < c.fitness.goal.target) parts.push(`Goal "${c.fitness.goal.name}" scored ${c.fitness.goal.holdout} on examples you were not shown (target ${c.fitness.goal.target}). Implement the rule described in the goal for the general case; do not special-case the listed inputs.`);
  return parts.join('\n');
}

function preview(v: unknown, max = 160): string {
  try { const s = JSON.stringify(v) ?? 'undefined'; return s.length > max ? s.slice(0, max - 1) + '…' : s; } catch { return String(v); }
}
function scoreOf(goal: Goal, e: { expected: Record<string, unknown>; actual: unknown }): number {
  return scoreOutputSafe(goal, e.expected, e.actual);
}
function scoreOutputSafe(goal: Goal, expected: Record<string, unknown>, actual: unknown): number {
  try { return scoreOutput(goal, expected, actual); } catch { return 0; }
}
/** Show only the fields the goal cares about from the actual output, so misses read side by side. */
function pick(actual: unknown, expected: Record<string, unknown>): unknown {
  if (typeof actual !== 'object' || actual === null) return actual;
  const a = actual as Record<string, unknown>;
  if ('error' in a && Object.keys(a).length === 1) return a;
  return Object.fromEntries(Object.keys(expected).map((k) => [k, a[k]]));
}
function pct(n: number) { return `${Math.round(n * 100)}%`; }
function round(n: number) { return Math.round(n * 100) / 100; }
