/**
 * Node contracts: a small schema for what a node guarantees to emit. The next node may assume it.
 *
 *   { "id": "string", "line": "string", "receivedAt": "number", "ts": "string|null", "meta": "object?" }
 *
 * Types: string, number (finite), integer, boolean, object (non-null, non-array), array, null, any.
 * Unions with "|". A trailing "?" makes the field optional (may be absent or undefined).
 * Fields not declared are unconstrained: nodes may pass extra fields through freely.
 */
export type Contract = Record<string, string>;

export type ContractType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | 'any';
const TYPES = new Set<string>(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null', 'any']);

export interface FieldSpec {
  name: string;
  types: ContractType[];
  optional: boolean;
}

export interface Violation {
  field: string;
  expected: string;
  got: string;
}

export function parseField(name: string, spec: string): FieldSpec {
  let s = spec.trim();
  const optional = s.endsWith('?');
  if (optional) s = s.slice(0, -1);
  const types = s.split('|').map((t) => t.trim()).filter(Boolean);
  for (const t of types) if (!TYPES.has(t)) throw new Error(`Contract field "${name}": unknown type "${t}"`);
  if (!types.length) throw new Error(`Contract field "${name}": empty type`);
  return { name, types: types as ContractType[], optional };
}

export function parseContract(c: Contract | undefined): FieldSpec[] {
  if (!c) return [];
  return Object.entries(c).map(([k, v]) => parseField(k, v));
}

export function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isFinite(v) ? (Number.isInteger(v) ? 'integer' : 'number') : 'non-finite number';
  return typeof v;
}

export function satisfies(v: unknown, types: ContractType[]): boolean {
  for (const t of types) {
    switch (t) {
      case 'any': if (v !== undefined) return true; break;
      case 'null': if (v === null) return true; break;
      case 'string': if (typeof v === 'string') return true; break;
      case 'boolean': if (typeof v === 'boolean') return true; break;
      case 'number': if (typeof v === 'number' && Number.isFinite(v)) return true; break;
      case 'integer': if (typeof v === 'number' && Number.isInteger(v)) return true; break;
      case 'array': if (Array.isArray(v)) return true; break;
      case 'object': if (typeof v === 'object' && v !== null && !Array.isArray(v)) return true; break;
    }
  }
  return false;
}

/** Empty array means the value meets the contract. */
export function checkContract(fields: FieldSpec[], value: unknown): Violation[] {
  if (!fields.length) return [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ field: '(output)', expected: 'object', got: typeOf(value) }];
  }
  const obj = value as Record<string, unknown>;
  const out: Violation[] = [];
  for (const f of fields) {
    const v = obj[f.name];
    if (v === undefined) {
      if (!f.optional) out.push({ field: f.name, expected: f.types.join('|'), got: 'missing' });
      continue;
    }
    if (!satisfies(v, f.types)) out.push({ field: f.name, expected: f.types.join('|'), got: typeOf(v) });
  }
  return out;
}

export function describeViolations(v: Violation[]): string {
  return v.map((x) => `${x.field}: expected ${x.expected}, got ${x.got}`).join('; ');
}

/** Human/model readable one-liner. */
export function describeContract(c: Contract | undefined): string {
  if (!c || !Object.keys(c).length) return '(no contract declared: any object)';
  return Object.entries(c).map(([k, v]) => `${k}: ${v}`).join(', ');
}

/** Whether a mutated value for `field` is still something the contract permits. Undeclared fields permit anything. */
export function permits(fields: FieldSpec[], field: string, value: unknown): boolean {
  const f = fields.find((x) => x.name === field);
  if (!f) return true;
  if (value === undefined) return f.optional;
  return satisfies(value, f.types);
}
