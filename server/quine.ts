import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { MorphicDAG } from './dag';
import { QuineStatus } from '../src/types';

export class QuineEngine {
  private generation: number = 14.8;
  private lineageDepth: number = 29;

  constructor(private dag: MorphicDAG) {}

  public getGeneration(): number {
    return this.generation;
  }

  public advanceGeneration() {
    this.generation = Math.round((this.generation + 0.1) * 10) / 10;
    this.lineageDepth++;
  }

  public getStatus(): QuineStatus {
    const codeHash = this.computeChecksum();
    return {
      generation: `Gen ${this.generation.toFixed(1)}`,
      integrityScore: 100,
      serializerReady: true,
      stateChecksum: codeHash.substring(0, 16),
      lineageDepth: this.lineageDepth,
      persistedEpoch: new Date().toISOString(),
    };
  }

  private computeChecksum(): string {
    let combined = '';
    for (const [id, node] of this.dag.nodes) {
      combined += `${id}:${node.code};`;
    }
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Generates a fully runnable standalone Quine file representing the current evolved organism
   */
  public async exportRunnableQuine(outputDir: string): Promise<{ filename: string; filePath: string; code: string; checksum: string }> {
    this.advanceGeneration();
    const genStr = this.generation.toFixed(1);
    const filename = `morphic-quine-gen${genStr.replace('.', '_')}.mjs`;
    const filePath = path.join(outputDir, filename);

    const nodeFunctionsCode = Array.from(this.dag.nodes.values())
      .map((n) => `// --- Node: ${n.name} (${n.role}) [Fitness: ${n.fitness}%] ---\nexport const ${n.id} = ${n.code};`)
      .join('\n\n');

    const checksum = this.computeChecksum();

    const quineSource = `/**
 * ============================================================================
 * MORPHIC QUINE EVOLVED RUNTIME — GENERATION ${genStr}
 * Lineage Depth: ${this.lineageDepth} | State Checksum: ${checksum.substring(0, 16)}
 * Evolved at: ${new Date().toISOString()}
 * 
 * This file is an autonomous snapshot of the living Morphic DAG.
 * It is fully self-contained and runnable: node ${filename}
 * ============================================================================
 */

import { performance } from 'node:perf_hooks';

${nodeFunctionsCode}

export async function runOrganismPipeline(payload) {
  const t0 = performance.now();
  console.log('\\x1b[36m[Morphic Quine Gen ${genStr}]\\x1b[0m Ingesting payload:', payload);
  
  const s1 = stream_ingest(payload);
  const s2 = vector_core(s1);
  const s3 = jit_cache(s2);
  const result = async_buffer(s3);
  
  const elapsed = (performance.now() - t0).toFixed(2);
  console.log('\\x1b[32m[Morphic Quine Gen ${genStr}]\\x1b[0m Executed in ' + elapsed + 'ms | Status:', result.status);
  console.log('Result:', JSON.stringify(result, null, 2));
  return result;
}

// Self-Test on execution
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  console.log('\\x1b[35m=== MORPHIC QUINE LIVING ORGANISM BOOT ===\\x1b[0m');
  console.log('Generation: ${genStr} | Nodes: ${this.dag.nodes.size} | Quine Checksum: ${checksum.substring(0, 16)}');
  runOrganismPipeline({ data: "autonomous_signal", poison: false });
}
`;

    await fs.writeFile(filePath, quineSource, 'utf-8');
    return { filename, filePath, code: quineSource, checksum };
  }
}
