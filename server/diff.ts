import type { DiffLine } from '../src/types';

/** Line-level diff via longest common subsequence. Fine for function-sized inputs. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'context', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: 'remove', text: a[i], oldLine: i + 1 });
      i++;
    } else {
      out.push({ type: 'add', text: b[j], newLine: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ type: 'remove', text: a[i], oldLine: ++i });
  while (j < m) out.push({ type: 'add', text: b[j], newLine: ++j });
  return out;
}

export function diffSummary(diff: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const d of diff) {
    if (d.type === 'add') added++;
    else if (d.type === 'remove') removed++;
  }
  return { added, removed };
}
