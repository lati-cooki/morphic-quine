import { VitalsData } from '../src/types';
import { MorphicDAG } from './dag';

export class TelemetryCollector {
  private recentLatencies: number[] = [];
  private lastHeapUsed: number = 0;
  private gcChurnRate: number = 24.5; // MB/sec estimate
  public painReflexActive: boolean = false;
  public painIntensity: number = 0;

  constructor(private dag: MorphicDAG) {
    this.lastHeapUsed = process.memoryUsage().heapUsed;
  }

  public recordLatency(ms: number, hasError: boolean = false) {
    this.recentLatencies.push(ms);
    if (this.recentLatencies.length > 100) {
      this.recentLatencies.shift();
    }

    if (hasError || ms > 25) {
      this.painReflexActive = true;
      this.painIntensity = Math.min(100, this.painIntensity + (hasError ? 40 : 20));
    } else {
      this.painIntensity = Math.max(0, this.painIntensity - 2);
      if (this.painIntensity === 0) {
        this.painReflexActive = false;
      }
    }
  }

  public getVitals(): VitalsData {
    const mem = process.memoryUsage();
    const heapDiff = Math.abs(mem.heapUsed - this.lastHeapUsed);
    this.lastHeapUsed = mem.heapUsed;
    this.gcChurnRate = Math.round((heapDiff / (1024 * 1024) * 5 + 20) * 10) / 10;

    // Calculate histogram buckets
    const buckets = [
      { range: '<1ms', count: 0 },
      { range: '1-3ms', count: 0 },
      { range: '3-6ms', count: 0 },
      { range: '6-10ms', count: 0 },
      { range: '10-25ms', count: 0 },
      { range: '>25ms', count: 0 },
    ];

    const samples = this.recentLatencies.length > 0 ? this.recentLatencies : [0.8, 1.2, 0.5];
    for (const lat of samples) {
      if (lat < 1) buckets[0].count++;
      else if (lat < 3) buckets[1].count++;
      else if (lat < 6) buckets[2].count++;
      else if (lat < 10) buckets[3].count++;
      else if (lat < 25) buckets[4].count++;
      else buckets[5].count++;
    }

    const total = samples.length || 1;
    const histogram = buckets.map((b, idx) => ({
      range: b.range,
      value: Math.round((b.count / total) * 100),
      isRightCluster: idx >= 4 && b.count > 0,
    }));

    // Calculate strain
    const avgLatency = samples.reduce((a, b) => a + b, 0) / total;
    const isJitFaulted = this.dag.nodes.get('jit_cache')?.status === 'bottleneck_mitosis';
    const strainBase = isJitFaulted ? 78 : Math.min(60, Math.max(15, avgLatency * 12));
    const metabolicStrain = Math.min(99, Math.round(strainBase + (this.painIntensity * 0.2)));

    const memoryEntropy = Math.min(95, Math.round((mem.heapUsed / mem.heapTotal) * 80 + (isJitFaulted ? 25 : 5)));

    return {
      metabolicStrain,
      memoryEntropy,
      gcChurnRate: this.gcChurnRate,
      executionVolatility: isJitFaulted ? 42.6 : Math.round(Math.random() * 4 + 2) / 10,
      leakProbability: isJitFaulted ? 82.4 : 0.8,
      latencyHistogram: histogram,
      painReflexActive: this.painReflexActive,
      painIntensity: this.painIntensity,
    };
  }
}
