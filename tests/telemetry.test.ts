import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Telemetry } from '../server/telemetry';

describe('Telemetry', () => {
  const epoch = Date.UTC(2026, 0, 1);
  let telemetry: Telemetry;
  let performanceOffset: number;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(epoch);
    performanceOffset = 0;
    // Telemetry imports Node's performance object rather than the global clock.
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - epoch + performanceOffset);
  });

  afterEach(() => {
    telemetry?.stop();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reports zero traffic, quantiles and lag before any samples arrive', () => {
    telemetry = new Telemetry();

    expect(telemetry.vitals()).toMatchObject({
      packetsPerSec: 0, errorRate: 0, p50: 0, p95: 0, p99: 0,
      eventLoopLagMs: 0, uptimeSec: 0,
    });
    expect(telemetry.vitals().histogram.every((bucket) => bucket.count === 0)).toBe(true);
    expect(telemetry.recentlyStalled()).toBe(false);
  });

  it('includes samples exactly at the latency window boundary and expires them while idle', () => {
    telemetry = new Telemetry(1_000);
    telemetry.record(50, false);
    vi.advanceTimersByTime(1_000);

    expect(telemetry.vitals()).toMatchObject({ packetsPerSec: 1, errorRate: 1, p50: 50 });

    vi.advanceTimersByTime(1);
    expect(telemetry.vitals()).toMatchObject({
      packetsPerSec: 0, errorRate: 0, p50: 0, p95: 0, p99: 0,
    });
    expect(telemetry.vitals().histogram.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it('keeps only in-window traffic when new samples arrive', () => {
    telemetry = new Telemetry(1_000);
    telemetry.record(200, false);
    vi.advanceTimersByTime(500);
    telemetry.record(20, true);
    vi.advanceTimersByTime(501);
    telemetry.record(10, true);

    expect(telemetry.vitals()).toMatchObject({
      packetsPerSec: 2, errorRate: 0, p50: 20, p95: 20, p99: 20,
    });
    expect(telemetry.vitals().histogram).toEqual([
      { range: '<1ms', count: 0 }, { range: '1-3', count: 0 },
      { range: '3-10', count: 0 }, { range: '10-25', count: 2 },
      { range: '25-100', count: 0 }, { range: '>100', count: 0 },
    ]);
  });

  it('sorts latencies numerically and reports floor-index quantiles rounded to three decimals', () => {
    telemetry = new Telemetry();
    for (let ms = 100; ms >= 1; ms--) telemetry.record(ms + 0.1236, true);

    expect(telemetry.vitals()).toMatchObject({ p50: 51.124, p95: 96.124, p99: 100.124 });
  });

  it('uses the sole sample for every quantile', () => {
    telemetry = new Telemetry();
    telemetry.record(2.3456, true);

    expect(telemetry.vitals()).toMatchObject({ p50: 2.346, p95: 2.346, p99: 2.346 });
  });

  it('measures successful and failed packets over the full default ten-second window', () => {
    telemetry = new Telemetry();
    telemetry.record(1, true);
    telemetry.record(2, false);
    telemetry.record(3, true);

    expect(telemetry.vitals()).toMatchObject({ packetsPerSec: 0.3, errorRate: 0.3333 });
    vi.advanceTimersByTime(5_000);
    expect(telemetry.vitals()).toMatchObject({ packetsPerSec: 0.3, errorRate: 0.3333 });
    vi.advanceTimersByTime(5_001);
    expect(telemetry.vitals()).toMatchObject({ packetsPerSec: 0, errorRate: 0 });
  });

  it('uses a custom window for throughput and rounds to one decimal', () => {
    telemetry = new Telemetry(3_000);
    telemetry.record(1, true);
    telemetry.record(2, true);

    expect(telemetry.vitals()).toMatchObject({ packetsPerSec: 0.7, errorRate: 0 });
  });

  it('assigns exact histogram boundaries to the next bucket', () => {
    telemetry = new Telemetry();
    for (const ms of [0, 0.999, 1, 2.999, 3, 9.999, 10, 24.999, 25, 99.999, 100, 200]) {
      telemetry.record(ms, true);
    }

    expect(telemetry.vitals().histogram).toEqual([
      { range: '<1ms', count: 2 }, { range: '1-3', count: 2 },
      { range: '3-10', count: 2 }, { range: '10-25', count: 2 },
      { range: '25-100', count: 2 }, { range: '>100', count: 2 },
    ]);
  });

  it('does not detect stalls when timer callbacks run on schedule', () => {
    telemetry = new Telemetry();
    vi.advanceTimersByTime(65_000);

    expect(telemetry.recentlyStalled()).toBe(false);
    expect(telemetry.vitals()).toMatchObject({ eventLoopLagMs: 0, uptimeSec: 65 });
  });

  it('requires lag strictly above one second and holds a stall for exactly one minute', () => {
    telemetry = new Telemetry();
    // Jump the monotonic clock before a callback to simulate a blocked event loop.
    performanceOffset += 1_000;
    vi.advanceTimersByTime(100);
    expect(telemetry.recentlyStalled()).toBe(false);
    expect(telemetry.vitals().eventLoopLagMs).toBe(1_000);

    performanceOffset += 1_001;
    vi.advanceTimersByTime(100);
    expect(telemetry.recentlyStalled()).toBe(true);
    expect(telemetry.vitals().eventLoopLagMs).toBe(1_000.5);

    vi.advanceTimersByTime(59_999);
    expect(telemetry.recentlyStalled()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(telemetry.recentlyStalled()).toBe(false);
  });

  it('respects custom stall settings and refreshes the hold after another stall', () => {
    telemetry = new Telemetry(10_000, 50, 500);
    performanceOffset += 51;
    vi.advanceTimersByTime(100);
    expect(telemetry.recentlyStalled()).toBe(true);

    vi.advanceTimersByTime(300);
    performanceOffset += 51;
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(499);
    expect(telemetry.recentlyStalled()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(telemetry.recentlyStalled()).toBe(false);
  });

  it('averages only the latest ten event-loop lag samples', () => {
    telemetry = new Telemetry();
    performanceOffset += 200;
    vi.advanceTimersByTime(100);
    expect(telemetry.vitals().eventLoopLagMs).toBe(200);

    vi.advanceTimersByTime(900);
    expect(telemetry.vitals().eventLoopLagMs).toBe(20);
    vi.advanceTimersByTime(100);
    expect(telemetry.vitals().eventLoopLagMs).toBe(0);
  });

  it('stops the sampling interval', () => {
    telemetry = new Telemetry();
    expect(vi.getTimerCount()).toBe(1);

    telemetry.stop();
    expect(vi.getTimerCount()).toBe(0);
    performanceOffset += 2_000;
    vi.advanceTimersByTime(100);
    expect(telemetry.recentlyStalled()).toBe(false);
    expect(telemetry.vitals().eventLoopLagMs).toBe(0);
  });
});
