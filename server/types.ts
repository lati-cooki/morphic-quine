import { GraphNode, SynapseLink, VitalsData, AstDiffSnippet, ReflectionLog, QuineStatus } from '../src/types';

export interface ExecutableNode {
  id: string;
  name: string;
  role: string;
  code: string; // Active JavaScript function code
  compiledFn: (input: any) => Promise<any> | any;
  x: number;
  y: number;
  type: 'primary' | 'bottleneck_mitosis' | 'shadow_candidate';
  status: 'optimal' | 'bottleneck_mitosis' | 'evaluating_sandbox' | 'buffering';
  tag: string;
  fitness: number;
  totalExecutions: number;
  totalLatencyMs: number;
  lastLatencyMs: number;
  errorCount: number;
  memoryBytes: number;
}

export interface CandidateNode {
  id: string;
  targetNodeId: string;
  name: string;
  code: string;
  compiledFn: (input: any) => Promise<any> | any;
  fitness: number;
  benchmarkSpeedup: number;
  testsPassed: number;
  totalTests: number;
  diff: AstDiffSnippet;
}

export interface OrganismState {
  generation: number;
  lineageDepth: number;
  isMitosisActive: boolean;
  isSpliceComplete: boolean;
  nodes: GraphNode[];
  synapses: SynapseLink[];
  vitals: VitalsData;
  astDiff: AstDiffSnippet;
  logs: ReflectionLog[];
  quineStatus: QuineStatus;
  candidate: CandidateNode | null;
}

export type WsClientMessage = 
  | { type: 'INJECT_CHAOS'; kind: 'POISON' | 'SURGE' | 'QUADRATIC' }
  | { type: 'START_MITOSIS'; targetNodeId?: string; prompt?: string }
  | { type: 'EXECUTE_HOTSPLICE' }
  | { type: 'GENERATE_QUINE' }
  | { type: 'SEND_PACKET'; payload?: any };

export type WsServerMessage =
  | { type: 'STATE_UPDATE'; state: OrganismState }
  | { type: 'PACKET_PROCESSED'; latencyMs: number; error?: string }
  | { type: 'QUINE_GENERATED'; filename: string; code: string; generation: number }
  | { type: 'LOG_APPEND'; log: ReflectionLog };
