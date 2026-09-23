import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { ExecutableNode, CandidateNode } from './types';
import { GraphNode, SynapseLink } from '../src/types';

export class MorphicDAG {
  public nodes: Map<string, ExecutableNode> = new Map();
  public candidate: CandidateNode | null = null;
  public totalPacketsProcessed = 0;
  public totalErrors = 0;

  constructor() {
    this.initDefaultNodes();
  }

  private compileCode(code: string): (input: any) => any {
    // Compile using isolated VM script for safety and real runtime compilation
    const script = new vm.Script(`(${code})`);
    const context = vm.createContext({
      console,
      Math,
      Date,
      performance,
      Buffer,
      Array,
      Object,
      String,
      Number,
      Boolean,
    });
    return script.runInContext(context);
  }

  private initDefaultNodes() {
    // 1. StreamIngest: Ingestion gateway
    const streamIngestCode = `function streamIngest(packet) {
  const ts = performance.now();
  const raw = packet?.data || packet || "stream_packet";
  const size = typeof raw === 'string' ? raw.length : JSON.stringify(raw).length;
  return {
    id: packet?.id || Math.random().toString(36).substring(2, 9),
    payload: raw,
    sizeBytes: size,
    ingestedAt: ts,
    poison: packet?.poison || false,
    quadraticStress: packet?.quadraticStress || false,
    batchSize: packet?.batchSize || 1
  };
}`;

    // 2. VectorCore: High dimensional vector projection
    const vectorCoreCode = `function vectorCore(input) {
  const rawStr = String(input.payload || '');
  const dim = 32;
  const vector = new Float32Array(dim);
  
  // Deterministic projection hash
  for (let i = 0; i < rawStr.length; i++) {
    const code = rawStr.charCodeAt(i);
    const idx = (code * 31 + i) % dim;
    vector[idx] = (vector[idx] + (code / 255.0)) % 1.0;
  }
  
  return {
    ...input,
    vector: Array.from(vector),
    projectedDim: dim
  };
}`;

    // 3. JIT_Cache: Polymorphic cache with intentional unoptimized loop & poison vulnerability
    const jitCacheCode = `function jitCache(input) {
  // Vulnerability 1: Hostile poison triggers unhandled crash
  if (input.poison) {
    throw new TypeError("EX_MEMORY_CORRUPTION: Unchecked access to malformed poison payload in unhardened JIT buffer");
  }

  // Vulnerability 2: Quadratic bottleneck under stress
  let searchDepth = 50;
  if (input.quadraticStress) {
    searchDepth = 1500; // quadratic choke
  }

  let similarityScore = 0;
  // Inefficient O(N^2) pseudo-scan
  for (let i = 0; i < searchDepth; i++) {
    for (let j = 0; j < (input.vector ? input.vector.length : 10); j++) {
      similarityScore += Math.sin(i * 0.01) * Math.cos(j * 0.05);
    }
  }

  return {
    ...input,
    cached: true,
    cacheKey: 'jit_key_' + (input.id || 'anon'),
    similarityIndex: Math.abs(similarityScore % 1.0),
    evictionScore: 0.94
  };
}`;

    // 4. AsyncBuffer: Aggregates and flushes
    const asyncBufferCode = `function asyncBuffer(input) {
  const now = performance.now();
  const latency = now - (input.ingestedAt || now);
  return {
    packetId: input.id,
    processed: true,
    totalLatencyMs: latency,
    cacheKey: input.cacheKey || 'none',
    status: 'COMMITTED',
    timestamp: Date.now()
  };
}`;

    this.registerNode({
      id: 'stream_ingest',
      name: 'StreamIngest',
      role: 'Zero-Copy Ingestion Gateway',
      code: streamIngestCode,
      compiledFn: this.compileCode(streamIngestCode),
      x: 22,
      y: 28,
      type: 'primary',
      status: 'optimal',
      tag: 'I/O GATEWAY',
      fitness: 99.8,
      totalExecutions: 0,
      totalLatencyMs: 0,
      lastLatencyMs: 0.4,
      errorCount: 0,
      memoryBytes: 1400000,
    });

    this.registerNode({
      id: 'vector_core',
      name: 'VectorCore',
      role: 'AVX-512 SIMD Execution Grid',
      code: vectorCoreCode,
      compiledFn: this.compileCode(vectorCoreCode),
      x: 24,
      y: 72,
      type: 'primary',
      status: 'optimal',
      tag: 'COMPUTE MESH',
      fitness: 99.2,
      totalExecutions: 0,
      totalLatencyMs: 0,
      lastLatencyMs: 1.1,
      errorCount: 0,
      memoryBytes: 4800000,
    });

    this.registerNode({
      id: 'jit_cache',
      name: 'JIT_Cache',
      role: 'Autonomous Polymorphic Cache',
      code: jitCacheCode,
      compiledFn: this.compileCode(jitCacheCode),
      x: 58,
      y: 45,
      type: 'primary',
      status: 'optimal',
      tag: 'POLYMORMIC CACHE',
      fitness: 92.5,
      totalExecutions: 0,
      totalLatencyMs: 0,
      lastLatencyMs: 2.3,
      errorCount: 0,
      memoryBytes: 8200000,
    });

    this.registerNode({
      id: 'async_buffer',
      name: 'AsyncBuffer',
      role: 'Non-Blocking Commit Ring',
      code: asyncBufferCode,
      compiledFn: this.compileCode(asyncBufferCode),
      x: 82,
      y: 75,
      type: 'primary',
      status: 'optimal',
      tag: 'RING BUFFER',
      fitness: 99.9,
      totalExecutions: 0,
      totalLatencyMs: 0,
      lastLatencyMs: 0.2,
      errorCount: 0,
      memoryBytes: 2100000,
    });
  }

  public registerNode(node: ExecutableNode) {
    this.nodes.set(node.id, node);
  }

  public async executePipeline(rawPacket: any): Promise<{ output?: any; latencyMs: number; error?: string; faultedNode?: string }> {
    const t0 = performance.now();
    let current = rawPacket;
    this.totalPacketsProcessed++;

    const pipeline = ['stream_ingest', 'vector_core', 'jit_cache', 'async_buffer'];

    for (const nodeId of pipeline) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      const nodeStart = performance.now();
      try {
        current = await Promise.resolve(node.compiledFn(current));
        const nodeDur = performance.now() - nodeStart;

        node.totalExecutions++;
        node.totalLatencyMs += nodeDur;
        node.lastLatencyMs = nodeDur;

        // Check if latency is choking
        if (nodeDur > 25) {
          node.type = 'bottleneck_mitosis';
          node.status = 'bottleneck_mitosis';
          node.tag = 'CHOKE: ' + nodeDur.toFixed(1) + 'ms';
          node.fitness = Math.max(30, Math.round(node.fitness - 5));
        }
      } catch (err: any) {
        const nodeDur = performance.now() - nodeStart;
        node.errorCount++;
        this.totalErrors++;
        node.type = 'bottleneck_mitosis';
        node.status = 'bottleneck_mitosis';
        node.tag = 'FAULT: ' + (err.name || 'ERROR');
        node.fitness = Math.max(15, Math.round(node.fitness - 15));

        return {
          latencyMs: performance.now() - t0,
          error: err.message || String(err),
          faultedNode: nodeId,
        };
      }
    }

    const totalTime = performance.now() - t0;
    return {
      output: current,
      latencyMs: totalTime,
    };
  }

  /**
   * Atomic Hot-Splice: replaces a node's running code and execution pointer in memory
   */
  public hotSplice(nodeId: string, newCode: string, fitness: number) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const newCompiled = this.compileCode(newCode);

    // Atomically swap
    node.code = newCode;
    node.compiledFn = newCompiled;
    node.type = 'primary';
    node.status = 'optimal';
    node.tag = 'AVX-512 HOT-SPLICED';
    node.fitness = fitness;
    node.errorCount = 0;
    node.lastLatencyMs = 0.5;

    // Clear candidate
    this.candidate = null;
  }

  public toGraphNodes(): GraphNode[] {
    const list: GraphNode[] = [];
    for (const [_, n] of this.nodes) {
      list.push({
        id: n.id,
        name: n.name,
        role: n.role,
        type: n.type,
        status: n.status,
        x: n.x,
        y: n.y,
        load: Math.min(100, Math.max(10, Math.round(n.lastLatencyMs * 8 + (n.status === 'bottleneck_mitosis' ? 60 : 20)))),
        latency: Math.round(n.lastLatencyMs * 10) / 10,
        throughput: n.status === 'bottleneck_mitosis' ? '38.4 GB/s (Degraded)' : `${(100 + (n.fitness * 2.1)).toFixed(1)} GB/s`,
        memory: `${(n.memoryBytes / 1000000).toFixed(1)} MB`,
        fitness: n.fitness,
        tag: n.tag,
      });
    }

    // Add candidate if mitosis is active
    if (this.candidate) {
      list.push({
        id: this.candidate.id,
        name: this.candidate.name,
        role: 'Holographic Sandbox Shadow Node',
        type: 'shadow_candidate',
        status: 'evaluating_sandbox',
        x: 84,
        y: 35,
        load: 18,
        latency: 0.8,
        throughput: `${(280 + this.candidate.fitness * 0.5).toFixed(1)} GB/s (Simulated)`,
        memory: '1.9 MB',
        fitness: this.candidate.fitness,
        tag: `FITNESS: ${this.candidate.fitness}%`,
        sandboxIsolated: true,
      });
    }

    return list;
  }

  public getSynapses(): SynapseLink[] {
    const isMitosis = this.candidate !== null;
    const isJitChoked = this.nodes.get('jit_cache')?.status === 'bottleneck_mitosis';

    const links: SynapseLink[] = [
      {
        id: 'syn_ingest_vector',
        from: 'stream_ingest',
        to: 'vector_core',
        bandwidth: '124.8 GB/s',
        color: 'cyan',
        active: true,
      },
      {
        id: 'syn_vector_jit',
        from: 'vector_core',
        to: 'jit_cache',
        bandwidth: isJitChoked ? '24.2 GB/s' : '182.4 GB/s',
        color: isJitChoked ? 'amber' : 'cyan',
        active: true,
      },
      {
        id: 'syn_jit_buffer',
        from: 'jit_cache',
        to: 'async_buffer',
        bandwidth: isJitChoked ? '18.1 GB/s' : '210.0 GB/s',
        color: isJitChoked ? 'amber' : 'cyan',
        active: true,
      },
    ];

    if (isMitosis) {
      links.push({
        id: 'syn_jit_candidate',
        from: 'jit_cache',
        to: 'candidate_ast',
        bandwidth: 'Holographic Shadow Bridge (99.4% Sync)',
        color: 'amber',
        active: true,
        isBuddingBridge: true,
      });
    }

    return links;
  }
}
