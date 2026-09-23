import type { CompiledFn } from './sandbox';

export interface AttackRequest {
  node: { id: string; name: string; role: string; source: string; depth: number };
  /** Recent inputs this node received, so attacks stay within the shape it actually sees. */
  samples: unknown[];
  downstream: Array<{ name: string; source: string }>;
  /** Attacks that already landed, so the attacker looks elsewhere. */
  known: unknown[];
  max: number;
}

export interface Attacker {
  readonly name: string;
  readonly model: string;
  generate(req: AttackRequest): Promise<unknown[]>;
}

export interface AttackHit {
  input: unknown;
  error: string;
}

/**
 * Run adversarial inputs against a function. A hit is a throw, a timeout (the sandbox throws),
 * a non-object result, or a downstream node refusing the output.
 */
export function runAttacks(fn: CompiledFn, inputs: unknown[], downstream: CompiledFn[]): AttackHit[] {
  const hits: AttackHit[] = [];
  for (const input of inputs) {
    try {
      const out = fn.call(input);
      if (typeof out !== 'object' || out === null) { hits.push({ input, error: `returned ${out === null ? 'null' : typeof out}` }); continue; }
      let cur: unknown = out;
      for (const d of downstream) {
        try { cur = d.call(cur); }
        catch (err) { hits.push({ input, error: `downstream ${d.name} threw: ${err instanceof Error ? err.message : String(err)}` }); break; }
      }
    } catch (err) {
      hits.push({ input, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
  }
  return hits;
}

/**
 * Deterministic structural fuzzer. Mutates values inside the observed input shape: wrong types,
 * empties, extremes, oversized strings and arrays. Only the first node in the pipeline receives
 * whole-input replacements, because only it sees raw external packets.
 */
export class FuzzAttacker implements Attacker {
  readonly name = 'fuzz';
  readonly model = 'structural';

  async generate(req: AttackRequest): Promise<unknown[]> {
    const out: unknown[] = [];
    const seen = new Set<string>();
    const push = (v: unknown) => {
      const k = key(v);
      if (seen.has(k)) return;
      for (const kn of req.known) if (key(kn) === k) return;
      seen.add(k);
      out.push(v);
    };

    // Two representatives per distinct key set; more identical shapes add nothing.
    const byShape = new Map<string, Record<string, unknown>[]>();
    for (const s of req.samples) {
      if (typeof s !== 'object' || s === null || Array.isArray(s)) continue;
      const shape = Object.keys(s).sort().join(',');
      const list = byShape.get(shape) ?? [];
      if (list.length < 2) list.push(s as Record<string, unknown>);
      byShape.set(shape, list);
    }
    const samples = [...byShape.values()].flat();
    if (req.node.depth === 0) {
      for (const v of [null, undefined, 42, 'raw string', [], {}, { data: null }, { data: 7 }, { data: { deep: [1, 2] } }, { data: 'x'.repeat(20000) }, { id: null }]) push(v);
    }

    // Round-robin across keys so a small budget still touches every field. Cheap type confusion
    // first (the most common class of defect), then oversized inputs, then the long tail.
    const perKey: Array<{ sample: Record<string, unknown>; k: string; variants: unknown[] }> = [];
    for (const s of samples) {
      for (const k of Object.keys(s)) {
        const v = s[k];
        // null first, then the type's oversized form (unbounded-work defects), then the rest of the type confusion.
        const variants: unknown[] = [null];
        if (Array.isArray(v)) variants.push(new Array(10000).fill(0.5));
        if (typeof v === 'string') variants.push('x'.repeat(8000));
        variants.push(0, true, {}, [], undefined);
        if (Array.isArray(v)) variants.push([null, NaN, undefined], ['a', {}, []], new Array(v.length).fill(NaN));
        if (typeof v === 'string') variants.push('\u0000', '   ', '::::', 'ÜÑÎÇØDÉ');
        if (typeof v === 'number') variants.push(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1e308, 0.1 + 0.2);
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) variants.push([v], 'not an object');
        variants.push('', -1, NaN);
        perKey.push({ sample: s, k, variants });
      }
      const broken: Record<string, unknown> = {};
      for (const k of Object.keys(s)) broken[k] = null;
      push(broken);
    }
    const maxLen = Math.max(0, ...perKey.map((p) => p.variants.length));
    for (let i = 0; i < maxLen && out.length < req.max; i++) {
      for (const { sample, k, variants } of perKey) {
        if (i >= variants.length) continue;
        const m: Record<string, unknown> = { ...sample };
        if (variants[i] === undefined) delete m[k]; else m[k] = variants[i];
        push(m);
      }
    }
    return out.slice(0, req.max);
  }
}

function key(v: unknown): string {
  try { return JSON.stringify(v, (_k, val) => (typeof val === 'number' && Number.isNaN(val) ? '__NaN__' : val === undefined ? '__undef__' : val)) ?? 'undefined'; } catch { return String(v); }
}

export function previewInput(v: unknown, max = 160): string {
  const s = key(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Runs several attackers and merges their inputs. The fuzzer is cheap and deterministic, so it always rides along with an LLM attacker. */
export class CompositeAttacker implements Attacker {
  constructor(private parts: Attacker[], private partTimeoutMs = 60_000) {}
  get name() { return this.parts.map((p) => p.name).join('+'); }
  get model() { return this.parts.map((p) => p.model).join('+'); }
  async generate(req: AttackRequest): Promise<unknown[]> {
    const per = Math.max(4, Math.ceil(req.max / this.parts.length));
    const results = await Promise.allSettled(this.parts.map((p) => withTimeout(p.generate({ ...req, max: per }), this.partTimeoutMs, `${p.name} attacker`)));
    const seen = new Set<string>();
    const out: unknown[] = [];
    const errors: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') { errors.push(`${this.parts[i].name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`); return; }
      for (const v of r.value) { const k = previewInput(v, 4000); if (!seen.has(k)) { seen.add(k); out.push(v); } }
    });
    if (!out.length && errors.length) throw new Error(errors.join('; '));
    const result = out.slice(0, req.max) as unknown[] & { warnings?: string[] };
    if (errors.length) result.warnings = errors;
    return result;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => { t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}
