// Wire types shared between the engine (server/) and the HUD (src/).

export type NodeHealth = 'healthy' | 'degraded' | 'faulted';

export type Phase =
  | 'idle'
  | 'probing'
  | 'synthesizing'
  | 'candidate_ready'
  | 'observing';

export interface NodeView {
  id: string;
  name: string;
  role: string;
  depth: number;
  health: NodeHealth;
  version: number;
  source: string;
  /** Lifetime counters */
  executions: number;
  errors: number;
  /** Sliding-window stats (last ~50 executions) */
  windowErrorRate: number;
  p50: number;
  p95: number;
  lastLatencyMs: number;
  lastError?: string;
  recordedInputs: number;
  recordedFailures: number;
  /** Attacker-discovered inputs this node's code must survive. */
  adversarialInputs: number;
}

export interface EdgeView {
  from: string;
  to: string;
  /** packets/sec observed across this edge in the last window */
  rate: number;
  degraded: boolean;
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface LatencyStats {
  p50: number;
  p99: number;
  max: number;
}

export interface FitnessReport {
  /** 0-100 composite */
  score: number;
  corpusSize: number;
  /** fraction of corpus inputs the candidate handled without throwing */
  passRate: number;
  /** fraction of inputs where the candidate's output shape satisfied the incumbent contract and downstream nodes */
  contractRate: number;
  /** 0-1, derived from candidate p99 against a latency budget */
  latencyScore: number;
  incumbent: LatencyStats & { passRate: number };
  candidate: LatencyStats;
  /** incumbent p99 / candidate p99 */
  speedup: number;
  failures: Array<{ input: string; error: string }>;
  contractViolations: Array<{ input: string; reason: string }>;
  /** Present when the candidate was synthesized for a goal. Holdout examples are never shown to the model. */
  goal?: { name: string; train: number; holdout: number; holdoutCount: number; target: number };
}

export interface CandidateView {
  id: string;
  targetNodeId: string;
  name: string;
  source: string;
  provider: string;
  model: string;
  attempt: number;
  rationale?: string;
  fitness: FitnessReport;
  diff: DiffLine[];
  createdAt: string;
  /** Red-team result for this candidate. */
  hardening?: { attacker: string; rounds: number; tried: number; hits: number; survived: boolean; sample: Array<{ input: string; error: string }>; error?: string };
}

export interface GoalView {
  name: string;
  description: string;
  nodeId: string;
  target: number;
  train: number;
  holdout: number;
  trainCount: number;
  holdoutCount: number;
  met: boolean;
  worstMisses: Array<{ input: string; expected: string; actual: string; split: 'train' | 'holdout' }>;
}

export interface Vitals {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  eventLoopLagMs: number;
  gcChurnMBs: number;
  packetsPerSec: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  histogram: Array<{ range: string; count: number }>;
  uptimeSec: number;
}

export type LogLevel = 'INFO' | 'FAULT' | 'SENTINEL' | 'SYNTH' | 'EVAL' | 'SPLICE' | 'ROLLBACK' | 'GOAL' | 'ATTACK';

export interface EventLog {
  id: string;
  ts: string;
  level: LogLevel;
  message: string;
  details?: string;
}

export interface LineageEntry {
  generation: number;
  ts: string;
  nodeId: string;
  parentHash: string;
  hash: string;
  provider: string;
  model: string;
  fitnessScore: number;
  speedup: number;
  rolledBack: boolean;
}

export interface OrganismState {
  pipeline: { name: string; description: string; available: string[] };
  generation: number;
  stateHash: string;
  uptimeSec: number;
  phase: Phase;
  targetNodeId: string | null;
  autonomous: boolean;
  spliceThreshold: number;
  nodes: NodeView[];
  edges: EdgeView[];
  candidate: CandidateView | null;
  /** Most recent candidate that was spliced or discarded, kept so the diff and fitness stay inspectable. */
  lastCandidate: (CandidateView & { outcome: 'spliced' | 'discarded' }) | null;
  vitals: Vitals;
  logs: EventLog[];
  lineage: LineageEntry[];
  goals: GoalView[];
  activeGoal: string | null;
  provider: { active: string; model: string; available: string[] };
  attacker: { name: string; model: string };
  canRollback: boolean;
}

export type WsClientMessage =
  | { type: 'INJECT'; kind: 'MALFORMED' | 'SURGE' | 'NORMAL'; count?: number }
  | { type: 'SYNTHESIZE'; nodeId?: string; goal?: string }
  | { type: 'PROBE'; nodeId: string }
  | { type: 'SPLICE' }
  | { type: 'DISCARD' }
  | { type: 'ROLLBACK' }
  | { type: 'SET_AUTONOMOUS'; enabled: boolean }
  | { type: 'EXPORT_SNAPSHOT' }
  | { type: 'SEND_PACKET'; payload: unknown };

export type WsServerMessage =
  | { type: 'STATE'; state: OrganismState }
  | { type: 'SNAPSHOT'; filename: string; code: string }
  | { type: 'ERROR'; message: string };
