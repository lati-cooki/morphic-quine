import { describe, it, expect } from 'vitest';
import { Sentinel } from '../server/sentinel';

const stats = (o: Partial<{ samples: number; errorRate: number; p50: number; p95: number; p99: number; lastLatencyMs: number; slowCount: number }>) =>
  ({ samples: 20, errorRate: 0, p50: 0.1, p95: 0.5, p99: 1, lastLatencyMs: 0.1, slowCount: 0, ...o });
const OPTS = { errorRateThreshold: 0.05, p95ThresholdMs: 25, minSamples: 5, cooldownMs: 0, observeSamples: 10, minSlowSamples: 5 };

describe('Sentinel', () => {
  it('breaches on error rate, then respects cooldown', () => {
    let now = 0;
    const s = new Sentinel({ ...OPTS, cooldownMs: 1000 }, () => now);
    const b1 = s.check([{ nodeId: 'a', ...stats({ errorRate: 0.2 }) }]);
    expect(b1).toEqual([expect.objectContaining({ nodeId: 'a', reason: 'error_rate' })]);
    expect(s.check([{ nodeId: 'a', ...stats({ errorRate: 0.2 }) }])).toEqual([]);
    now = 1500;
    expect(s.check([{ nodeId: 'a', ...stats({ errorRate: 0.2 }) }])).toHaveLength(1);
  });

  it('breaches on latency only with enough slow samples, and never while the host stalled', () => {
    const s = new Sentinel(OPTS);
    expect(s.check([{ nodeId: 'a', ...stats({ p95: 40, samples: 2, slowCount: 2 }) }])).toEqual([]);
    // p95 nudged over by two stray samples: not a breach.
    expect(s.check([{ nodeId: 'a', ...stats({ p95: 40, slowCount: 2 }) }])).toEqual([]);
    expect(s.check([{ nodeId: 'a', ...stats({ p95: 40, slowCount: 5 }) }])[0].reason).toBe('latency');
    expect(s.check([{ nodeId: 'a', ...stats({ p95: 40, slowCount: 9 }) }], true)).toEqual([]);
    // error-rate breaches are not suppressed by a stall.
    expect(s.check([{ nodeId: 'a', ...stats({ errorRate: 0.5 }) }], true)[0].reason).toBe('error_rate');
  });

  it('passes a stable splice and flags a regression', () => {
    const s = new Sentinel(OPTS);
    s.beginObservation('a', { errorRate: 0.3, p95: 200 });
    expect(s.observe('a', stats({ samples: 3 })).verdict).toBe('pending');
    expect(s.observe('a', stats({ samples: 10 })).verdict).toBe('pass');
    s.beginObservation('a', { errorRate: 0, p95: 1 });
    expect(s.observe('a', stats({ samples: 6, errorRate: 0.5 })).verdict).toBe('regress');
    expect(s.isObserving('a')).toBe(false);
  });
});
