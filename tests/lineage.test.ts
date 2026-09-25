import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Lineage, exportSnapshot, type LineageRecordInput } from '../server/lineage';
import { Pipeline } from '../server/pipeline';

const timestamp = '2026-01-02T03:04:05.000Z';
const input: LineageRecordInput = {
  nodeId: 'normalize',
  parentHash: 'aaaaaaaa11111111',
  hash: 'bbbbbbbb22222222',
  provider: 'test',
  model: 'fixture',
  fitnessScore: 95,
  speedup: 2,
  source: 'function normalize(packet) { return { ...packet, data: packet.data.trim().toUpperCase() }; }',
  previousSource: 'function normalize(packet) { return { ...packet, data: packet.data.trim() }; }',
  prompt: 'Normalize the packet',
  rationale: 'Use uppercase text',
  inputTokens: 100,
  outputTokens: 20,
  estUsd: 0.01234,
};

function makePipeline() {
  // Deliberately define nodes out of execution order. Both implementations are
  // deterministic, so the complete output can be compared across runtimes.
  return new Pipeline([
    { id: 'finish', name: 'Finish', role: 'Format output', source: 'function finish(packet) { return { id: packet.id, result: "[" + packet.data + "]" }; }' },
    { id: 'normalize', name: 'Normalize', role: 'Normalize text', source: input.previousSource },
  ], [{ from: 'normalize', to: 'finish' }]);
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphic-lineage-test-'));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(timestamp));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('Lineage', () => {
  it('persists full records in numbered files and reloads them in generation order', () => {
    const recordsDir = path.join(dir, 'history');
    const lineage = new Lineage(recordsDir);
    expect(lineage.generation).toBe(0);
    expect(lineage.list()).toEqual([]);
    expect(lineage.last()).toBeUndefined();

    const entries = Array.from({ length: 12 }, (_, i) => {
      const recordInput = { ...input, hash: `hash-${i + 1}` };
      const entry = lineage.record(recordInput);
      expect(entry).toEqual({
        generation: i + 1, ts: timestamp, rolledBack: false,
        nodeId: input.nodeId, parentHash: input.parentHash, hash: recordInput.hash,
        provider: input.provider, model: input.model, fitnessScore: 95, speedup: 2,
        inputTokens: 100, outputTokens: 20, estUsd: 0.01234,
      });
      const filename = `gen-${String(i + 1).padStart(4, '0')}.json`;
      expect(JSON.parse(fs.readFileSync(path.join(recordsDir, filename), 'utf-8'))).toEqual({
        ...recordInput, generation: i + 1, ts: timestamp, rolledBack: false,
      });
      return entry;
    });
    expect(fs.readdirSync(recordsDir)).toEqual(entries.map((e) => `gen-${String(e.generation).padStart(4, '0')}.json`));

    // Force a shuffled directory listing so sorting is tested independently of
    // the filesystem's usual alphabetical enumeration.
    const files = fs.readdirSync(recordsDir).reverse();
    const readdir = vi.spyOn(fs, 'readdirSync').mockReturnValueOnce(files as never);
    const restarted = new Lineage(recordsDir);
    readdir.mockRestore();
    expect(restarted.generation).toBe(12);
    expect(restarted.list()).toEqual(entries);
    expect(restarted.last()).toEqual(entries[11]);
    expect(restarted.activeRecords()).toEqual(entries.map((entry) => ({
      ...entry, source: input.source, previousSource: input.previousSource,
    })));
    expect(restarted.record(input).generation).toBe(13);
    expect(fs.existsSync(path.join(recordsDir, 'gen-0013.json'))).toBe(true);
  });

  it('skips corrupt and non-matching files while loading valid records', () => {
    const lineage = new Lineage(dir);
    const entries = [lineage.record(input), lineage.record({ ...input, hash: 'cccccccc33333333' })];
    fs.writeFileSync(path.join(dir, 'gen-0000.json'), '{broken JSON');
    fs.writeFileSync(path.join(dir, 'gen-9999.json'), 'null');
    const ignoredRecord = JSON.stringify({ ...input, generation: 99, ts: timestamp });
    for (const filename of ['other.json', 'gen-x.json', 'gen-0003.json.bak', 'prefix-gen-0003.json']) {
      fs.writeFileSync(path.join(dir, filename), ignoredRecord);
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const restarted = new Lineage(dir);
    expect(restarted.list()).toEqual(entries);
    expect(restarted.generation).toBe(2);
    expect(restarted.activeRecords()).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('[lineage] skipping unreadable gen-0000.json:', expect.any(String));
    expect(warn).toHaveBeenCalledWith('[lineage] skipping unreadable gen-9999.json:', expect.any(String));
  });
});

describe('exportSnapshot', () => {
  it('writes a generation-zero snapshot with the original-source lineage header', () => {
    const pipeline = makePipeline();
    const lineage = new Lineage(path.join(dir, 'history'));
    const outDir = path.join(dir, 'exports');
    const snapshot = exportSnapshot(pipeline, lineage, outDir);
    const filename = `morphic-gen000-${pipeline.hash().slice(0, 8)}.mjs`;
    expect(snapshot.filename).toBe(filename);
    expect(snapshot.filePath).toBe(path.join(outDir, filename));
    expect(fs.readFileSync(snapshot.filePath, 'utf-8')).toBe(snapshot.code);
    expect(snapshot.code).toContain(' * Morphic pipeline snapshot — generation 0');
    expect(snapshot.code).toContain(' *   (no splices yet — original source)');
  });

  it('exports the header and lineage table and runs the written module like the live pipeline', async () => {
    const pipeline = makePipeline();
    const lineage = new Lineage(path.join(dir, 'history'));
    lineage.record(input);
    lineage.markRolledBack(1);
    const parentHash = pipeline.hash();
    const { previousSource } = pipeline.splice('normalize', input.source);
    const hash = pipeline.hash();
    lineage.record({ ...input, parentHash, hash, previousSource, estUsd: undefined });

    const outDir = path.join(dir, 'exports');
    const snapshot = exportSnapshot(pipeline, lineage, outDir);
    const filename = `morphic-gen002-${hash.slice(0, 8)}.mjs`;
    expect(snapshot.filename).toBe(filename);
    expect(snapshot.filePath).toBe(path.join(outDir, filename));
    const written = fs.readFileSync(snapshot.filePath, 'utf-8');
    expect(written).toBe(snapshot.code);
    expect(written).toContain(`/**
 * Morphic pipeline snapshot — generation 2
 * State hash: ${hash}
 * Exported:   ${timestamp}
 *
 * Lineage:
 *   gen 1  ${timestamp}  normalize  test/fixture  fitness 95  $0.0123  aaaaaaaa → bbbbbbbb  (rolled back)
 *   gen 2  ${timestamp}  normalize  test/fixture  fitness 95  ${parentHash.slice(0, 8)} → ${hash.slice(0, 8)}
 *
 * Runnable: node ${filename} '{"data":"hello"}'
 */`);
    expect(written).toContain('// Normalize — Normalize text (v2)');

    const exported = await import(pathToFileURL(snapshot.filePath).href);
    expect(exported.ORDER).toEqual(['normalize', 'finish']);
    const packet = { id: 'packet-1', data: ' hello world ' };
    const live = pipeline.execute(packet);
    expect(live.error).toBeUndefined();
    expect(live.output).toEqual({ id: 'packet-1', result: '[HELLO WORLD]' });
    expect(exported.run(packet)).toEqual(live.output);
  });
});
