import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_EDGES, DEFAULT_NODES, DEFAULT_INPUT_CONTRACT, packets, type EdgeSpec, type NodeSpec } from './nodes';
import { parseContract, type Contract } from './contracts';

export interface TrafficDef {
  /** Packets the ambient loop cycles through. A fresh id is stamped on each send. */
  normal: unknown[];
  /** Packets for the "Inject fault" control. Falls back to generic malformed packets. */
  malformed?: unknown[];
  /** Packets for the "Inject surge" control. Falls back to a generic oversized packet. */
  surge?: unknown[];
}

export interface PipelineDef {
  name: string;
  description: string;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  traffic: TrafficDef;
  /** What external packets look like. The first node may assume it. */
  input?: Contract;
  /** Where lineage/, corpus/, snapshots/ and goals/ live for this pipeline. */
  dir: string;
}

/**
 * The built-in pipeline lives at the project root. Named pipelines live in pipelines/<name>/pipeline.json
 * with their own goals/, lineage/, corpus/ and snapshots/ beside it.
 */
export function loadPipeline(rootDir: string, name = 'default'): PipelineDef {
  if (name === 'default') {
    return {
      name,
      description: 'Ingest → vector → cache → commit, with two shipped defects in JIT_Cache.',
      nodes: DEFAULT_NODES,
      edges: DEFAULT_EDGES,
      traffic: { normal: [], malformed: [], surge: [] },
      input: DEFAULT_INPUT_CONTRACT,
      dir: rootDir,
    };
  }
  const dir = path.join(rootDir, 'pipelines', name);
  const file = path.join(dir, 'pipeline.json');
  if (!fs.existsSync(file)) throw new Error(`No pipeline at ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const nodes: NodeSpec[] = (raw.nodes ?? []).map((n: Record<string, unknown>) => ({
    id: String(n.id),
    name: String(n.name ?? n.id),
    role: String(n.role ?? ''),
    source: Array.isArray(n.source) ? n.source.join('\n') : String(n.source),
    emits: n.emits as Contract | undefined,
  }));
  for (const n of nodes) parseContract(n.emits); // validate early
  const input = raw.input as Contract | undefined;
  parseContract(input);
  if (nodes.length === 0) throw new Error(`Pipeline ${name} has no nodes`);
  const edges: EdgeSpec[] = raw.edges ?? nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
  const traffic: TrafficDef = raw.traffic ?? { normal: [] };
  if (!Array.isArray(traffic.normal) || traffic.normal.length === 0) throw new Error(`Pipeline ${name} needs traffic.normal samples`);
  return { name, description: String(raw.description ?? ''), nodes, edges, traffic, input, dir };
}

let seq = 0;
function stamp(sample: unknown, prefix: string): unknown {
  const id = `${prefix}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  if (typeof sample === 'object' && sample !== null && !Array.isArray(sample)) return { ...(sample as Record<string, unknown>), id };
  return sample;
}

export function trafficFor(def: PipelineDef) {
  const pick = (arr: unknown[]) => arr[Math.floor(Math.random() * arr.length)];
  return {
    normal: () => (def.traffic.normal.length ? stamp(pick(def.traffic.normal), 'amb') : packets.normal()),
    malformed: () => (def.traffic.malformed?.length ? stamp(pick(def.traffic.malformed), 'bad') : packets.malformed()),
    surge: () => (def.traffic.surge?.length ? stamp(pick(def.traffic.surge), 'big') : packets.surge()),
  };
}

export function listPipelines(rootDir: string): string[] {
  const dir = path.join(rootDir, 'pipelines');
  if (!fs.existsSync(dir)) return ['default'];
  return ['default', ...fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'pipeline.json')))];
}
