import { describe, it, expect } from 'vitest';
import { compileFunction, extractFunctionSource } from '../server/sandbox';

describe('compileFunction', () => {
  it('compiles a function declaration and calls it', () => {
    const fn = compileFunction('function double(x) { return x * 2; }');
    expect(fn.name).toBe('double');
    expect(fn.call(21)).toBe(42);
  });

  it('interrupts a runaway loop', () => {
    const fn = compileFunction('function spin() { while (true) {} }', { timeoutMs: 50 });
    expect(() => fn.call(undefined)).toThrow(/timed out/i);
  });

  it('rejects non-functions', () => {
    expect(() => compileFunction('42')).toThrow(/did not evaluate to a function/);
  });

  it('has no access to host globals', () => {
    const fn = compileFunction('function probe() { return typeof process + typeof require; }');
    expect(fn.call(undefined)).toBe('undefinedundefined');
  });
});

describe('extractFunctionSource', () => {
  it('strips fences and prose', () => {
    const text = 'Here is the fix:\n```js\nfunction f(a) { return { a: "}" }; }\n```\nHope that helps.';
    expect(extractFunctionSource(text)).toBe('function f(a) { return { a: "}" }; }');
  });

  it('returns null without a function', () => {
    expect(extractFunctionSource('const x = 1;')).toBeNull();
  });
});
