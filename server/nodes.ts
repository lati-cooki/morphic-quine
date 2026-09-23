/**
 * Default node definitions. JIT_Cache ships with two genuine defects, not flag checks:
 *   1. It assumes payload is always a string and calls .trim() on it.
 *   2. Its eviction-bucket scan is O(dim²) over the vector, and dim scales with payload length.
 * A packet with a missing payload crashes it; a packet with an oversized payload chokes it.
 */
export interface NodeSpec {
  id: string;
  name: string;
  role: string;
  source: string;
}

export interface EdgeSpec {
  from: string;
  to: string;
}

export const DEFAULT_NODES: NodeSpec[] = [
  {
    id: 'stream_ingest',
    name: 'StreamIngest',
    role: 'Ingestion gateway',
    source: `function streamIngest(packet) {
  const payload = packet && packet.data;
  return {
    id: (packet && packet.id) || Math.random().toString(36).slice(2, 9),
    payload,
    sizeBytes: typeof payload === 'string' ? payload.length : JSON.stringify(payload === undefined ? null : payload).length,
    ingestedAt: performance.now()
  };
}`,
  },
  {
    id: 'vector_core',
    name: 'VectorCore',
    role: 'Payload → feature vector',
    source: `function vectorCore(input) {
  const text = typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload === undefined ? '' : input.payload);
  const dim = Math.max(16, Math.min(4096, text.length));
  const vector = new Float32Array(dim);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const idx = (c * 31 + i) % dim;
    vector[idx] = (vector[idx] + c / 255) % 1;
  }
  return { ...input, vector: Array.from(vector), dim };
}`,
  },
  {
    id: 'jit_cache',
    name: 'JIT_Cache',
    role: 'Cache key + eviction bucket',
    source: `function jitCache(input) {
  // Derive the cache key from the payload text.
  const key = input.payload.trim().toLowerCase().slice(0, 32);

  // Pick an eviction bucket from the vector's mean pairwise spread.
  const v = input.vector;
  let acc = 0;
  for (let i = 0; i < v.length; i++) {
    for (let j = 0; j < v.length; j++) {
      acc += Math.abs(v[i] - v[j]);
    }
  }
  const spread = acc / ((v.length * v.length) || 1);
  const evictionBucket = Math.min(15, Math.floor(spread * 16));

  return {
    ...input,
    cached: true,
    cacheKey: 'jit_' + key + '_' + input.id,
    evictionBucket
  };
}`,
  },
  {
    id: 'async_buffer',
    name: 'AsyncBuffer',
    role: 'Commit record',
    source: `function asyncBuffer(input) {
  return {
    packetId: input.id,
    cacheKey: input.cacheKey,
    evictionBucket: input.evictionBucket,
    dim: input.dim,
    latencyMs: performance.now() - input.ingestedAt,
    status: 'COMMITTED'
  };
}`,
  },
];

export const DEFAULT_EDGES: EdgeSpec[] = [
  { from: 'stream_ingest', to: 'vector_core' },
  { from: 'vector_core', to: 'jit_cache' },
  { from: 'jit_cache', to: 'async_buffer' },
];

/** Traffic generators used by the ambient loop and the chaos controls. */
export const packets = {
  normal(): { id: string; data: string } {
    const words = ['sensor', 'frame', 'tick', 'trace', 'span', 'metric', 'event', 'sample'];
    const w = words[Math.floor(Math.random() * words.length)];
    return { id: 'amb_' + Math.random().toString(36).slice(2, 8), data: `${w}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}` };
  },
  /** No payload at all. Exercises the unguarded .trim(). */
  malformed(): { id: string; data?: unknown } {
    const variants: unknown[] = [undefined, null, 42, { nested: true }, ['a', 'b']];
    return { id: 'bad_' + Math.random().toString(36).slice(2, 8), data: variants[Math.floor(Math.random() * variants.length)] };
  },
  /** Oversized payload. dim tracks payload length, so the pairwise scan runs ~500k iterations and takes tens of ms. */
  surge(): { id: string; data: string } {
    return { id: 'big_' + Math.random().toString(36).slice(2, 8), data: 'x'.repeat(700) + Math.random().toString(36) };
  },
};
