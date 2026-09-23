import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

export interface CompiledFn {
  source: string;
  name: string;
  call(input: unknown): unknown;
}

export interface CompileOptions {
  /** Hard wall-clock limit per invocation. Synchronous runaway loops are interrupted. */
  timeoutMs?: number;
}

/**
 * Compile a single JavaScript function declaration inside an isolated V8 context.
 * Each invocation runs through vm with a timeout so a candidate that spins forever
 * cannot take the engine down with it.
 */
export function compileFunction(source: string, opts: CompileOptions = {}): CompiledFn {
  const timeoutMs = opts.timeoutMs ?? 250;
  const trimmed = source.trim();
  if (!trimmed) throw new Error('Empty source');

  const context = vm.createContext({
    performance,
    console: { log() {}, warn() {}, error() {} },
    __input: undefined,
    __fn: undefined,
  });

  let fn: unknown;
  try {
    fn = new vm.Script(`(${trimmed})`, { filename: 'node-source.js' }).runInContext(context, { timeout: timeoutMs });
  } catch (err) {
    throw new Error(`Compile failed: ${(err as Error).message}`);
  }
  if (typeof fn !== 'function') throw new Error('Source did not evaluate to a function');

  context.__fn = fn;
  const invoke = new vm.Script('__fn(__input)', { filename: 'node-invoke.js' });
  const name = (fn as { name?: string }).name || 'anonymous';

  return {
    source: trimmed,
    name,
    call(input: unknown) {
      context.__input = input;
      try {
        return invoke.runInContext(context, { timeout: timeoutMs });
      } finally {
        context.__input = undefined;
      }
    },
  };
}

/** Pull a function declaration out of free-form model output (fences, prose, etc). */
export function extractFunctionSource(text: string): string | null {
  let s = text.replace(/```(?:javascript|js|ts|typescript)?/gi, '').replace(/```/g, '');
  const start = s.search(/\b(?:async\s+)?function\b/);
  if (start === -1) return null;
  s = s.slice(start);
  // Walk braces to find the end of the first function body.
  let depth = 0;
  let seenBrace = false;
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '/' && s[i + 1] === '/') { const nl = s.indexOf('\n', i); if (nl === -1) break; i = nl; continue; }
    if (ch === '/' && s[i + 1] === '*') { const end = s.indexOf('*/', i + 2); if (end === -1) break; i = end + 1; continue; }
    if (ch === '{') { depth++; seenBrace = true; }
    else if (ch === '}') { depth--; if (seenBrace && depth === 0) return s.slice(0, i + 1).trim(); }
  }
  return null;
}
