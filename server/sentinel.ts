import type { NodeWindowStats } from './pipeline';

export interface SentinelOptions {
  errorRateThreshold: number;
  p95ThresholdMs: number;
  minSamples: number;
  cooldownMs: number;
  /** executions to watch after a splice before passing judgement */
  observeSamples: number;
  /** A latency breach needs at least this many slow samples in the window, not just a nudged p95. */
  minSlowSamples: number;
}

export const DEFAULT_SENTINEL: SentinelOptions = {
  errorRateThreshold: 0.05,
  p95ThresholdMs: 25,
  minSamples: 5,
  cooldownMs: 20_000,
  observeSamples: 25,
  minSlowSamples: 5,
};

export interface Breach {
  nodeId: string;
  reason: 'error_rate' | 'latency';
  detail: string;
}

export interface Observation {
  nodeId: string;
  verdict: 'pending' | 'pass' | 'regress';
  detail: string;
}

interface Baseline { errorRate: number; p95: number; startedAt: number }

/**
 * Watches per-node window stats. Raises a breach when a node crosses thresholds,
 * and after a splice judges whether the new code is at least as good as what it replaced.
 */
export class Sentinel {
  private lastTrigger = new Map<string, number>();
  private observing = new Map<string, Baseline>();

  constructor(private opts: SentinelOptions = DEFAULT_SENTINEL, private now: () => number = () => Date.now()) {}

  /**
   * @param hostStalled true when the process itself recently stalled (sleep/wake, long GC). Latency
   *   breaches are skipped while it holds; error-rate breaches still count.
   */
  check(stats: Array<{ nodeId: string } & NodeWindowStats>, hostStalled = false): Breach[] {
    const out: Breach[] = [];
    for (const s of stats) {
      if (s.samples < this.opts.minSamples) continue;
      if (this.observing.has(s.nodeId)) continue;
      const last = this.lastTrigger.get(s.nodeId) ?? -Infinity;
      if (this.now() - last < this.opts.cooldownMs) continue;
      if (s.errorRate > this.opts.errorRateThreshold) {
        out.push({ nodeId: s.nodeId, reason: 'error_rate', detail: `error rate ${(s.errorRate * 100).toFixed(1)}% over ${s.samples} executions` });
      } else if (!hostStalled && s.p95 > this.opts.p95ThresholdMs && s.slowCount >= this.opts.minSlowSamples) {
        out.push({ nodeId: s.nodeId, reason: 'latency', detail: `p95 ${s.p95.toFixed(1)}ms, ${s.slowCount} slow samples over ${s.samples} executions` });
      }
    }
    for (const b of out) this.lastTrigger.set(b.nodeId, this.now());
    return out;
  }

  beginObservation(nodeId: string, baseline: { errorRate: number; p95: number }) {
    this.observing.set(nodeId, { ...baseline, startedAt: this.now() });
  }

  isObserving(nodeId: string) { return this.observing.has(nodeId); }

  observe(nodeId: string, stats: NodeWindowStats): Observation {
    const base = this.observing.get(nodeId);
    if (!base) return { nodeId, verdict: 'pass', detail: 'not under observation' };
    // Regression: any errors when the baseline had none, or clearly worse error rate, or latency worse than both baseline and threshold.
    const worseErrors = stats.errorRate > Math.max(base.errorRate, this.opts.errorRateThreshold);
    const worseLatency = stats.p95 > Math.max(base.p95, this.opts.p95ThresholdMs) && stats.samples >= this.opts.minSamples;
    if (stats.samples >= this.opts.minSamples && (worseErrors || worseLatency)) {
      this.observing.delete(nodeId);
      return { nodeId, verdict: 'regress', detail: worseErrors ? `error rate ${(stats.errorRate * 100).toFixed(1)}% vs baseline ${(base.errorRate * 100).toFixed(1)}%` : `p95 ${stats.p95.toFixed(1)}ms vs baseline ${base.p95.toFixed(1)}ms` };
    }
    if (stats.samples >= this.opts.observeSamples) {
      this.observing.delete(nodeId);
      return { nodeId, verdict: 'pass', detail: `${stats.samples} executions, error rate ${(stats.errorRate * 100).toFixed(1)}%, p95 ${stats.p95.toFixed(2)}ms` };
    }
    return { nodeId, verdict: 'pending', detail: `${stats.samples}/${this.opts.observeSamples} executions observed` };
  }

  cancelObservation(nodeId: string) { this.observing.delete(nodeId); }
}
