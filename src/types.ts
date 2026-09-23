export type NodeType = 'primary' | 'bottleneck_mitosis' | 'shadow_candidate';

export interface GraphNode {
  id: string;
  name: string;
  role: string;
  type: NodeType;
  status: 'optimal' | 'bottleneck_mitosis' | 'evaluating_sandbox' | 'buffering';
  x: number; // percentage coordinates 0-100
  y: number;
  load: number; // 0 - 100
  latency: number; // ms
  throughput: string;
  memory: string;
  fitness?: number; // e.g. 99.4
  tag: string;
  sandboxIsolated?: boolean;
}

export interface SynapseLink {
  id: string;
  from: string;
  to: string;
  bandwidth: string;
  color: 'cyan' | 'amber' | 'emerald' | 'purple';
  active: boolean;
  isBuddingBridge?: boolean;
}

export interface VitalsData {
  metabolicStrain: number; // 0 - 100
  memoryEntropy: number; // 0 - 100
  gcChurnRate: number; // MB/sec
  executionVolatility: number; // %
  leakProbability: number; // %
  latencyHistogram: Array<{
    range: string;
    value: number;
    isRightCluster: boolean;
  }>;
  painReflexActive: boolean;
  painIntensity: number; // 0 - 100
}

export interface AstDiffSnippet {
  nodeTarget: string;
  strategy: string;
  previousFitness: number;
  candidateFitness: number;
  oldAst: string[];
  newAst: string[];
  changes: Array<{
    type: 'add' | 'remove' | 'context';
    text: string;
    line: number;
  }>;
}

export interface ReflectionLog {
  id: string;
  time: string;
  level: 'THOUGHT' | 'SYNAPSE' | 'MITOSIS' | 'REFLEX' | 'HOTSWAP';
  message: string;
  details?: string;
}

export interface QuineStatus {
  generation: string;
  integrityScore: number;
  serializerReady: boolean;
  stateChecksum: string;
  lineageDepth: number;
  persistedEpoch: string;
}
