import fs from 'node:fs';
import path from 'node:path';
import type { LineageEntry } from '../src/types';
import type { Pipeline } from './pipeline';

export interface LineageRecordInput {
  nodeId: string;
  parentHash: string;
  hash: string;
  provider: string;
  model: string;
  fitnessScore: number;
  speedup: number;
  source: string;
  previousSource: string;
  prompt?: string;
  rationale?: string;
  inputTokens?: number;
  outputTokens?: number;
  estUsd?: number;
}

/**
 * Append-only history of every splice. One JSON file per generation so the audit trail
 * survives restarts and can be diffed or replayed by hand.
 */
export interface LineageRecord extends LineageEntry { source: string; previousSource: string }

export class Lineage {
  private entries: LineageEntry[] = [];
  private records: LineageRecord[] = [];

  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).filter((f) => /^gen-\d+\.json$/.test(f)).sort();
    for (const f of files) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        this.entries.push(toEntry(rec));
        this.records.push({ ...toEntry(rec), source: String(rec.source ?? ''), previousSource: String(rec.previousSource ?? '') });
      } catch (err) {
        console.warn(`[lineage] skipping unreadable ${f}:`, (err as Error).message);
      }
    }
  }

  get generation(): number { return this.entries.length; }
  list(): LineageEntry[] { return this.entries.slice(); }
  /** Full records including sources, for replaying history onto a fresh pipeline. */
  activeRecords(): LineageRecord[] { return this.records.filter((r) => !r.rolledBack); }
  last(): LineageEntry | undefined { return this.entries[this.entries.length - 1]; }

  record(input: LineageRecordInput): LineageEntry {
    const generation = this.entries.length + 1;
    const rec = { generation, ts: new Date().toISOString(), rolledBack: false, ...input };
    fs.writeFileSync(path.join(this.dir, `gen-${String(generation).padStart(4, '0')}.json`), JSON.stringify(rec, null, 2));
    const entry = toEntry(rec);
    this.entries.push(entry);
    this.records.push({ ...entry, source: input.source, previousSource: input.previousSource });
    return entry;
  }

  markRolledBack(generation: number) {
    const e = this.entries.find((x) => x.generation === generation);
    if (!e) return;
    e.rolledBack = true;
    const r = this.records.find((x) => x.generation === generation);
    if (r) r.rolledBack = true;
    const file = path.join(this.dir, `gen-${String(generation).padStart(4, '0')}.json`);
    try {
      const rec = JSON.parse(fs.readFileSync(file, 'utf-8'));
      rec.rolledBack = true;
      rec.rolledBackAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(rec, null, 2));
    } catch { /* in-memory flag is enough to keep the UI honest */ }
  }

  /** Most recent splice that has not been undone, if any. */
  latestActive(): LineageEntry | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) if (!this.entries[i].rolledBack) return this.entries[i];
    return undefined;
  }
}

function toEntry(rec: Record<string, unknown>): LineageEntry {
  return {
    generation: Number(rec.generation),
    ts: String(rec.ts),
    nodeId: String(rec.nodeId),
    parentHash: String(rec.parentHash),
    hash: String(rec.hash),
    provider: String(rec.provider),
    model: String(rec.model),
    fitnessScore: Number(rec.fitnessScore),
    speedup: Number(rec.speedup),
    rolledBack: Boolean(rec.rolledBack),
    inputTokens: rec.inputTokens == null ? undefined : Number(rec.inputTokens),
    outputTokens: rec.outputTokens == null ? undefined : Number(rec.outputTokens),
    estUsd: rec.estUsd == null ? undefined : Number(rec.estUsd),
  };
}

/**
 * Write the live pipeline out as a standalone, runnable ES module. The header carries the
 * lineage table so the file documents how it came to be.
 */
export function exportSnapshot(pipeline: Pipeline, lineage: Lineage, outDir: string): { filename: string; filePath: string; code: string } {
  fs.mkdirSync(outDir, { recursive: true });
  const gen = lineage.generation;
  const hash = pipeline.hash();
  const filename = `morphic-gen${String(gen).padStart(3, '0')}-${hash.slice(0, 8)}.mjs`;
  const filePath = path.join(outDir, filename);

  const nodeBlocks = pipeline.order
    .map((id) => {
      const n = pipeline.nodes.get(id)!;
      return `// ${n.spec.name} — ${n.spec.role} (v${n.version})\nexport const ${id} = ${n.source};`;
    })
    .join('\n\n');

  const lineageTable = lineage.list().length
    ? lineage.list().map((e) => ` *   gen ${e.generation}  ${e.ts}  ${e.nodeId}  ${e.provider}/${e.model}  fitness ${e.fitnessScore}${e.estUsd != null ? `  $${e.estUsd.toFixed(4)}` : ''}  ${e.parentHash.slice(0, 8)} → ${e.hash.slice(0, 8)}${e.rolledBack ? '  (rolled back)' : ''}`).join('\n')
    : ' *   (no splices yet — original source)';

  const code = `/**
 * Morphic pipeline snapshot — generation ${gen}
 * State hash: ${hash}
 * Exported:   ${new Date().toISOString()}
 *
 * Lineage:
${lineageTable}
 *
 * Runnable: node ${filename} '{"data":"hello"}'
 */

import { performance } from 'node:perf_hooks';

${nodeBlocks}

export const ORDER = ${JSON.stringify(pipeline.order)};
const NODES = { ${pipeline.order.join(', ')} };

export function run(packet) {
  let current = packet;
  for (const id of ORDER) current = NODES[id](current);
  return current;
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const arg = process.argv[2];
  const packet = arg ? JSON.parse(arg) : { data: 'snapshot_self_test' };
  const t0 = performance.now();
  const out = run(packet);
  console.log(JSON.stringify({ generation: ${gen}, hash: '${hash.slice(0, 16)}', elapsedMs: +(performance.now() - t0).toFixed(3), out }, null, 2));
}
`;
  fs.writeFileSync(filePath, code, 'utf-8');
  return { filename, filePath, code };
}
