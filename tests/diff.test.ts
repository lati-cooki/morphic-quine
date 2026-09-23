import { describe, it, expect } from 'vitest';
import { diffLines, diffSummary } from '../server/diff';

describe('diffLines', () => {
  it('marks changed lines and keeps context', () => {
    const d = diffLines('a\nb\nc', 'a\nB\nc\nd');
    expect(d.map((l) => `${l.type}:${l.text}`)).toEqual(['context:a', 'remove:b', 'add:B', 'context:c', 'add:d']);
    expect(diffSummary(d)).toEqual({ added: 2, removed: 1 });
  });

  it('is empty-change for identical input', () => {
    const d = diffLines('x\ny', 'x\ny');
    expect(d.every((l) => l.type === 'context')).toBe(true);
  });
});
