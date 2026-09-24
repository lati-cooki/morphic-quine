/** Token accounting and a cost estimate per model. Prices are USD per million tokens, list price. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Reasoning tokens where the provider reports them separately (billed as output). */
  thoughtTokens: number;
}

export interface UsageRecord extends Usage {
  provider: string;
  model: string;
  purpose: 'synthesize' | 'attack';
  ms: number;
  estUsd: number;
  ts: string;
}

const PRICES: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /gemini-2\.5-pro/, input: 1.25, output: 10 },
  { match: /gemini-2\.5-flash-lite/, input: 0.1, output: 0.4 },
  { match: /gemini-2\.5-flash/, input: 0.3, output: 2.5 },
  { match: /claude-opus-5/, input: 5, output: 25 },
  { match: /claude-sonnet-5/, input: 2, output: 10 },
  { match: /claude-haiku-4-5/, input: 1, output: 5 },
];

export function estimateUsd(model: string, u: Usage): number {
  const p = PRICES.find((x) => x.match.test(model));
  if (!p) return 0;
  return (u.inputTokens * p.input + (u.outputTokens + u.thoughtTokens) * p.output) / 1_000_000;
}

export function priceKnown(model: string): boolean { return PRICES.some((x) => x.match.test(model)); }

export class UsageMeter {
  private records: UsageRecord[] = [];
  private dayStart = startOfDay();

  add(rec: Omit<UsageRecord, 'estUsd' | 'ts'>): UsageRecord {
    const full: UsageRecord = { ...rec, estUsd: estimateUsd(rec.model, rec), ts: new Date().toISOString() };
    this.records.push(full);
    if (this.records.length > 2000) this.records.shift();
    return full;
  }

  /** Totals since process start. */
  totals() { return sum(this.records); }

  /** Totals since local midnight; resets when the day rolls over. */
  today() {
    const start = startOfDay();
    if (start !== this.dayStart) this.dayStart = start;
    return sum(this.records.filter((r) => new Date(r.ts).getTime() >= start));
  }

  recent(n = 10) { return this.records.slice(-n); }
}

function sum(rs: UsageRecord[]) {
  return rs.reduce(
    (a, r) => ({ calls: a.calls + 1, inputTokens: a.inputTokens + r.inputTokens, outputTokens: a.outputTokens + r.outputTokens + r.thoughtTokens, estUsd: a.estUsd + r.estUsd }),
    { calls: 0, inputTokens: 0, outputTokens: 0, estUsd: 0 },
  );
}

function startOfDay() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
