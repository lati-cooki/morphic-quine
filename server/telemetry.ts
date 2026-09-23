import { performance } from 'node:perf_hooks';
import type { Vitals } from '../src/types';

/**
 * Process-level vitals measured from the actual runtime: heap, RSS, event loop lag,
 * packet throughput and latency quantiles. Nothing here is synthesized.
 */
export class Telemetry {
  private latencies: Array<{ ms: number; ok: boolean; ts: number }> = [];
  private lagSamples: number[] = [];
  private lastHeap = process.memoryUsage().heapUsed;
  private lastHeapAt = performance.now();
  private churn = 0;
  private started = Date.now();
  private timer: NodeJS.Timeout;

  constructor(private windowMs = 10_000) {
    let expected = performance.now() + 100;
    this.timer = setInterval(() => {
      const now = performance.now();
      const lag = Math.max(0, now - expected);
      expected = now + 100;
      this.lagSamples.push(lag);
      if (this.lagSamples.length > 50) this.lagSamples.shift();

      const mem = process.memoryUsage();
      const dt = (now - this.lastHeapAt) / 1000;
      if (dt > 0) {
        // Heap that disappeared since last sample is what GC reclaimed.
        const freed = Math.max(0, this.lastHeap - mem.heapUsed);
        this.churn = this.churn * 0.7 + (freed / 1_048_576 / dt) * 0.3;
      }
      this.lastHeap = mem.heapUsed;
      this.lastHeapAt = now;
    }, 100);
    this.timer.unref();
  }

  record(ms: number, ok: boolean) {
    const now = performance.now();
    this.latencies.push({ ms, ok, ts: now });
    const cutoff = now - this.windowMs;
    while (this.latencies.length && this.latencies[0].ts < cutoff) this.latencies.shift();
  }

  vitals(): Vitals {
    const mem = process.memoryUsage();
    const now = performance.now();
    const win = this.latencies.filter((l) => l.ts >= now - this.windowMs);
    const sorted = win.map((l) => l.ms).sort((a, b) => a - b);
    const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
    const buckets: Array<{ range: string; max: number; count: number }> = [
      { range: '<1ms', max: 1, count: 0 },
      { range: '1-3', max: 3, count: 0 },
      { range: '3-10', max: 10, count: 0 },
      { range: '10-25', max: 25, count: 0 },
      { range: '25-100', max: 100, count: 0 },
      { range: '>100', max: Infinity, count: 0 },
    ];
    for (const ms of sorted) buckets.find((b) => ms < b.max)!.count++;
    const lag = this.lagSamples.length ? this.lagSamples.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, this.lagSamples.length) : 0;
    return {
      heapUsedMB: r(mem.heapUsed / 1_048_576),
      heapTotalMB: r(mem.heapTotal / 1_048_576),
      rssMB: r(mem.rss / 1_048_576),
      eventLoopLagMs: r(lag),
      gcChurnMBs: r(this.churn),
      packetsPerSec: r(win.length / (this.windowMs / 1000)),
      errorRate: win.length ? r(win.filter((l) => !l.ok).length / win.length, 4) : 0,
      p50: r(q(0.5), 3),
      p95: r(q(0.95), 3),
      p99: r(q(0.99), 3),
      histogram: buckets.map(({ range, count }) => ({ range, count })),
      uptimeSec: Math.floor((Date.now() - this.started) / 1000),
    };
  }

  stop() { clearInterval(this.timer); }
}

function r(n: number, d = 1) { const f = 10 ** d; return Math.round(n * f) / f; }
