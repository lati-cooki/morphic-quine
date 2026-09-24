import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UsageMeter, estimateUsd, priceKnown } from '../server/usage';
import { Organism } from '../server/organism';
import type { Provider, PatchResult } from '../server/mutator';

describe('usage', () => {
  it('prices known models and returns 0 for unknown ones', () => {
    expect(estimateUsd('gemini-2.5-pro', { inputTokens: 1_000_000, outputTokens: 0, thoughtTokens: 0 })).toBeCloseTo(1.25);
    expect(estimateUsd('gemini-2.5-pro', { inputTokens: 0, outputTokens: 500_000, thoughtTokens: 500_000 })).toBeCloseTo(10);
    expect(estimateUsd('claude-opus-5', { inputTokens: 1000, outputTokens: 1000, thoughtTokens: 0 })).toBeCloseTo(0.03);
    expect(estimateUsd('built-in', { inputTokens: 1e6, outputTokens: 1e6, thoughtTokens: 0 })).toBe(0);
    expect(priceKnown('gemini-2.5-flash')).toBe(true);
    expect(priceKnown('scripted')).toBe(false);
  });

  it('totals by day', () => {
    const m = new UsageMeter();
    m.add({ provider: 'gemini', model: 'gemini-2.5-flash', purpose: 'synthesize', ms: 10, inputTokens: 1000, outputTokens: 200, thoughtTokens: 300 });
    m.add({ provider: 'gemini', model: 'gemini-2.5-flash', purpose: 'attack', ms: 10, inputTokens: 500, outputTokens: 100, thoughtTokens: 0 });
    const t = m.today();
    expect(t.calls).toBe(2);
    expect(t.inputTokens).toBe(1500);
    expect(t.outputTokens).toBe(600);
    expect(t.estUsd).toBeCloseTo((1500 * 0.3 + 600 * 2.5) / 1e6);
  });
});

describe('Organism budget', () => {
  let dir: string;
  let org: Organism | null = null;
  afterEach(() => { org?.stop(); org = null; fs.rmSync(dir, { recursive: true, force: true }); });

  const pricey: Provider = {
    name: 'gemini', model: 'gemini-2.5-pro', available: () => true,
    async synthesize(): Promise<PatchResult> {
      return {
        source: 'function jitCache(input) { const t = typeof input.payload === "string" ? input.payload : ""; return { ...input, cached: true, cacheKey: "jit_" + t.slice(0, 32) + "_" + input.id, evictionBucket: 0 }; }',
        provider: 'gemini', model: 'gemini-2.5-pro', prompt: '',
        usage: { inputTokens: 400_000, outputTokens: 100_000, thoughtTokens: 0 },   // $1.50 at list
      };
    },
  };

  it('records spend on the candidate and lineage, and stops autonomous synthesis at the cap', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-'));
    org = new Organism({ rootDir: dir, autonomous: true, attackRounds: 0, provider: pricey, dailyBudgetUsd: 2 });
    for (let i = 0; i < 10; i++) org.inject('NORMAL');
    org.inject('MALFORMED', 3);
    await org.synthesize('jit_cache');
    const c = org.state().candidate!;
    expect(c.spend!.calls).toBe(1);
    expect(c.spend!.estUsd).toBeCloseTo(1.5);
    org.splice('user');
    expect(org.state().lineage[0].estUsd).toBeCloseTo(1.5);
    expect(org.state().spend.today.estUsd).toBeCloseTo(1.5);

    // Second synthesis pushes today over $2; the sentinel then refuses to start another.
    org['phase'] = 'idle';
    await org.synthesize('jit_cache');
    expect(org.state().spend.today.estUsd).toBeCloseTo(3);
    org.discard();
    org.inject('MALFORMED', 3);           // would normally trigger a breach
    await (org as any).tick();
    const s = org.state();
    expect(s.phase).toBe('idle');
    expect(s.logs.some((l) => /Daily model budget reached/.test(l.message))).toBe(true);
  });
});
