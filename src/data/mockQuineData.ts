import { GraphNode, SynapseLink, VitalsData, AstDiffSnippet, ReflectionLog, QuineStatus } from '../types';

export const INITIAL_NODES: GraphNode[] = [
  {
    id: 'stream_ingest',
    name: 'StreamIngest',
    role: 'Zero-Copy Ingestion Gateway',
    type: 'primary',
    status: 'optimal',
    x: 22,
    y: 28,
    load: 48,
    latency: 0.6,
    throughput: '94.2 GB/s',
    memory: '1.4 GB',
    tag: 'I/O GATEWAY',
  },
  {
    id: 'vector_core',
    name: 'VectorCore',
    role: 'AVX-512 SIMD Execution Grid',
    type: 'primary',
    status: 'optimal',
    x: 24,
    y: 72,
    load: 82,
    latency: 1.4,
    throughput: '168.5 GB/s',
    memory: '4.8 GB',
    tag: 'COMPUTE MESH',
  },
  {
    id: 'jit_cache',
    name: 'JIT_Cache',
    role: 'Autonomous Polymorphic Cache',
    type: 'bottleneck_mitosis',
    status: 'bottleneck_mitosis',
    x: 58,
    y: 45,
    load: 96,
    latency: 18.7,
    throughput: '42.1 GB/s (Degraded)',
    memory: '8.2 GB (High Pressure)',
    fitness: 68.2,
    tag: 'MITOSIS IN PROGRESS',
  },
  {
    id: 'candidate_ast',
    name: 'Candidate_AST_v3',
    role: 'Holographic Sandbox Shadow Node',
    type: 'shadow_candidate',
    status: 'evaluating_sandbox',
    x: 84,
    y: 35,
    load: 18,
    latency: 0.9,
    throughput: '310.8 GB/s (Simulated)',
    memory: '1.9 GB',
    fitness: 99.4,
    tag: 'FITNESS: 99.4%',
    sandboxIsolated: true,
  },
  {
    id: 'async_buffer',
    name: 'AsyncBuffer',
    role: 'Ring-Buffer Quorum Backplane',
    type: 'primary',
    status: 'buffering',
    x: 54,
    y: 82,
    load: 39,
    latency: 0.8,
    throughput: '124.0 GB/s',
    memory: '3.1 GB',
    tag: 'QUORUM RING',
  },
];

export const INITIAL_SYNAPSES: SynapseLink[] = [
  { id: 'syn-1', from: 'stream_ingest', to: 'jit_cache', bandwidth: '42.4 GB/s', color: 'cyan', active: true },
  { id: 'syn-2', from: 'stream_ingest', to: 'vector_core', bandwidth: '51.8 GB/s', color: 'cyan', active: true },
  { id: 'syn-3', from: 'vector_core', to: 'async_buffer', bandwidth: '78.2 GB/s', color: 'cyan', active: true },
  { id: 'syn-4', from: 'jit_cache', to: 'async_buffer', bandwidth: '24.1 GB/s', color: 'amber', active: true },
  // Mitotic Shadow Bridge
  { id: 'syn-mitosis', from: 'jit_cache', to: 'candidate_ast', bandwidth: 'Live Fire Mirroring', color: 'amber', active: true, isBuddingBridge: true },
];

export const INITIAL_VITALS: VitalsData = {
  metabolicStrain: 74,
  memoryEntropy: 81,
  gcChurnRate: 412.5, // MB/s
  executionVolatility: 28.4,
  leakProbability: 4.2,
  latencyHistogram: [
    { range: '<1ms', value: 14, isRightCluster: false },
    { range: '1-3ms', value: 26, isRightCluster: false },
    { range: '3-6ms', value: 20, isRightCluster: false },
    { range: '6-10ms', value: 18, isRightCluster: false },
    { range: '10-20ms', value: 48, isRightCluster: true },
    { range: '20-50ms', value: 76, isRightCluster: true },
    { range: '>50ms', value: 92, isRightCluster: true },
  ],
  painReflexActive: true,
  painIntensity: 84,
};

export const INITIAL_AST_DIFF: AstDiffSnippet = {
  nodeTarget: 'JIT_Cache::lookup_key()',
  strategy: 'AVX-512 Masked Vectorization + Branch Pruning',
  previousFitness: 68.2,
  candidateFitness: 99.4,
  oldAst: [
    '// PRE-MUTATION (Scalar Bottleneck)',
    'for (let i = 0; i < buckets.length; i++) {',
    '  if (buckets[i].hash === keyHash) {',
    '    if (buckets[i].tag == queryTag) {',
    '      return execute_fallback(buckets[i]);',
    '    }',
    '  }',
    '}',
  ],
  newAst: [
    '// SYNTHESIZED BY RUNTIME CORTEX (Gen 14.8)',
    'const v_query = _mm512_set1_epi64(keyHash);',
    'const v_tags  = _mm512_loadu_si512(&bucket_tags[0]);',
    'const mask    = _mm512_cmpeq_epi64_mask(v_query, v_tags);',
    'if (__builtin_expect(mask, 1)) {',
    '  const idx = _tzcnt_u32(mask);',
    '  return hot_dispatch(buckets[idx]);',
    '}',
  ],
  changes: [
    { type: 'context', line: 12, text: '  // JIT_Cache Core Hash Resolution' },
    { type: 'remove', line: 13, text: '- for (let i = 0; i < buckets.length; i++) {' },
    { type: 'remove', line: 14, text: '-   if (buckets[i].hash === keyHash) {' },
    { type: 'remove', line: 15, text: '-     return execute_fallback(buckets[i]);' },
    { type: 'remove', line: 16, text: '-   }' },
    { type: 'remove', line: 17, text: '- }' },
    { type: 'add', line: 18, text: '+ const v_query = _mm512_set1_epi64(keyHash);' },
    { type: 'add', line: 19, text: '+ const mask = _mm512_cmpeq_epi64_mask(v_query, bucket_tags);' },
    { type: 'add', line: 20, text: '+ if (__builtin_expect(mask, 1)) {' },
    { type: 'add', line: 21, text: '+   return hot_dispatch(buckets[_tzcnt_u32(mask)]);' },
    { type: 'add', line: 22, text: '+ }' },
  ],
};

export const INITIAL_REFLECTION_LOGS: ReflectionLog[] = [
  {
    id: 'log-1',
    time: '21:44:02.108',
    level: 'THOUGHT',
    message: 'Bottleneck isolated in core loop #12. Generating optimized vectorized branch...',
    details: 'Hash traversal latency spiked to 18.7ms (> 3σ threshold).',
  },
  {
    id: 'log-2',
    time: '21:44:02.412',
    level: 'REFLEX',
    message: 'Pain reflex triggered: Latency clustering on high-frequency distribution right tail.',
    details: '92 requests clocked >50ms in rolling 500ms window.',
  },
  {
    id: 'log-3',
    time: '21:44:02.680',
    level: 'MITOSIS',
    message: 'Autonomous mitotic fission initiated on JIT_Cache. Budding Candidate_AST_v3.',
    details: 'Allocated isolated sandbox container memory at 0x7FFF94E21000.',
  },
  {
    id: 'log-4',
    time: '21:44:03.015',
    level: 'SYNAPSE',
    message: 'Shadow mirroring active: Diverting 15% live-fire traffic to candidate node.',
    details: 'Zero divergence in computation checksum; 14.2x throughput increase.',
  },
  {
    id: 'log-5',
    time: '21:44:03.490',
    level: 'HOTSWAP',
    message: 'Candidate_AST_v3 fitness verified: 99.4%. Hot-swap simulation successful.',
    details: 'Quine serializer primed. Ready to splice mutated AST directly into production.',
  },
];

export const INITIAL_QUINE_STATUS: QuineStatus = {
  generation: 'Gen 14.8',
  integrityScore: 99.98,
  serializerReady: true,
  stateChecksum: '0x9E7F_CA55_881D_7740',
  lineageDepth: 48,
  persistedEpoch: 'T-00:00:14',
};

export const QUINE_SOURCE_CODE = `// MORPHIC QUINE HUD SELF-REFERENTIAL ENGINE v14.8
// A program that executes its own topological representation and preserves evolutionary lineage.
(function morphicQuine(lineage = { gen: "14.8", parentHash: "0x9E7F_CA55", mutations: 48 }) {
  const ast = {
    nodes: ["VectorCore", "StreamIngest", "JIT_Cache", "AsyncBuffer"],
    mitosis: { parent: "JIT_Cache", candidate: "Candidate_AST_v3", fitness: 0.994 },
    metabolic: { strain: 0.74, entropy: 0.81, painReflex: true },
    serialize: () => {
      const code = morphicQuine.toString();
      const snapshot = JSON.stringify(lineage);
      return \`/* MORPHIC QUINE EXECUTABLE ARTIFACT \${lineage.gen} */\\n\${code}\\n/* STATE */\\n(\${snapshot});\`;
    }
  };
  return ast;
})();`;
