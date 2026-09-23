import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { extractFunctionSource } from './sandbox';

export interface PatchRequest {
  node: { id: string; name: string; role: string; source: string };
  failures: Array<{ input: unknown; error: string }>;
  slow: Array<{ input: unknown; latencyMs: number }>;
  downstream: Array<{ name: string; source: string }>;
  /** Evaluator feedback from a previous attempt, if this is a retry. */
  feedback?: string;
  /** Goal-directed synthesis: what the pipeline should emit. Only training examples appear here. */
  goal?: {
    name: string;
    description: string;
    examples: Array<{ pipelineInput: unknown; nodeInput: unknown; expected: Record<string, unknown>; actual: unknown }>;
  };
}

export interface PatchResult {
  source: string;
  provider: string;
  model: string;
  rationale?: string;
  prompt: string;
}

export interface Provider {
  readonly name: string;
  readonly model: string;
  available(): boolean;
  synthesize(req: PatchRequest): Promise<PatchResult>;
}

const SYSTEM = `You repair a single JavaScript function that runs inside a hot-swappable data pipeline.
The function is compiled in an isolated V8 context with no imports, no require, no globals beyond the ECMAScript builtins and \`performance\`. It must be synchronous and pure.

Rules:
- Keep the same function name and parameter.
- Preserve the output contract: every key the current implementation returns must still be present with the same meaning. Downstream consumers are shown to you; their reads must keep working.
- Never throw on malformed input. Degrade gracefully (empty string, null, zero) and keep returning a full object.
- When a goal is given, make the output satisfy it for the general case described, not just the listed examples. Do not hardcode example values.
- Remove algorithmic hot spots. Target linear or n·log(n) time in the size of the input.
- Do not add flags, mode switches, or special cases for the sample inputs. Fix the general defect.
- Reply with the complete function only. No markdown fences, no commentary before or after.`;

function preview(v: unknown, max = 300): string {
  let s: string;
  try { s = JSON.stringify(v) ?? 'undefined'; } catch { s = String(v); }
  return s.length > max ? `${s.slice(0, max)}… (${s.length} chars total)` : s;
}

export function buildPrompt(req: PatchRequest): string {
  const parts: string[] = [];
  parts.push(`# Target node: ${req.node.name} (${req.node.id})\nRole: ${req.node.role}\n\n\`\`\`js\n${req.node.source}\n\`\`\``);
  if (req.failures.length) {
    parts.push(`# Recorded failures (${req.failures.length})\n` + req.failures.map((f, i) => `${i + 1}. input: ${preview(f.input)}\n   error: ${f.error}`).join('\n'));
  }
  if (req.slow.length) {
    parts.push(`# Recorded slow executions (${req.slow.length})\n` + req.slow.map((s, i) => `${i + 1}. ${s.latencyMs.toFixed(1)}ms on input: ${preview(s.input, 120)}`).join('\n'));
  }
  if (req.downstream.length) {
    parts.push(`# Downstream consumers of this node's output\n` + req.downstream.map((d) => `\`\`\`js\n${d.source}\n\`\`\``).join('\n'));
  }
  if (req.goal) {
    parts.push(`# Goal: ${req.goal.name}\n${req.goal.description}\n\nThe pipeline's final output is scored against the expected fields below. You are rewriting ${req.node.name}; its output flows through the downstream consumers shown above before it becomes the pipeline output. Current vs expected on training examples:\n` +
      req.goal.examples.map((e, i) => `${i + 1}. pipeline input: ${preview(e.pipelineInput, 160)}\n   this node's input: ${preview(e.nodeInput, 240)}\n   expected fields: ${preview(e.expected, 160)}\n   currently: ${preview(e.actual, 160)}`).join('\n'));
  }
  if (req.feedback) parts.push(`# Feedback from the previous attempt\n${req.feedback}`);
  parts.push('Return the repaired function.');
  return parts.join('\n\n');
}

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  readonly model = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
  private client: Anthropic | null = null;

  available(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  }

  async synthesize(req: PatchRequest): Promise<PatchResult> {
    if (!this.client) this.client = new Anthropic();
    const prompt = buildPrompt(req);
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') throw new Error('Model declined the request');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const source = extractFunctionSource(text);
    if (!source) throw new Error('No function found in model output');
    return { source, provider: this.name, model: this.model, prompt };
  }
}

export class GeminiProvider implements Provider {
  readonly name = 'gemini';
  readonly model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  private client: GoogleGenAI | null = null;

  available(): boolean {
    const k = process.env.GEMINI_API_KEY;
    return Boolean(k && k !== 'MY_GEMINI_API_KEY' && k.length > 5);
  }

  async synthesize(req: PatchRequest): Promise<PatchResult> {
    if (!this.client) this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const prompt = buildPrompt(req);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: `${SYSTEM}\n\n${prompt}`,
    });
    const source = extractFunctionSource(response.text ?? '');
    if (!source) throw new Error('No function found in model output');
    return { source, provider: this.name, model: this.model, prompt };
  }
}

/**
 * No-network fallback so the loop still closes without an API key. It knows one repair:
 * the shipped JIT_Cache. The fix is algorithmic, not a lookup — the pairwise mean absolute
 * difference is computed exactly in n·log(n) via a sorted prefix sum, and the key derivation
 * tolerates any payload type. Everything else still has to pass the evaluator.
 */
export class ReferenceProvider implements Provider {
  readonly name = 'reference';
  readonly model = 'built-in';
  available() { return true; }

  async synthesize(req: PatchRequest): Promise<PatchResult> {
    if (req.goal) {
      throw new Error(`Reference provider cannot synthesize toward a goal. Configure ANTHROPIC_API_KEY or GEMINI_API_KEY for goal-directed repair.`);
    }
    if (req.node.id !== 'jit_cache') {
      throw new Error(`Reference provider only knows how to repair jit_cache. Configure ANTHROPIC_API_KEY or GEMINI_API_KEY to repair ${req.node.id}.`);
    }
    const source = `function jitCache(input) {
  // Derive the cache key from whatever the payload is; never assume a string.
  const text = typeof input.payload === 'string'
    ? input.payload
    : input.payload == null ? '' : JSON.stringify(input.payload);
  const key = text.trim().toLowerCase().slice(0, 32);

  // Mean pairwise |v_i - v_j| over all ordered pairs, computed exactly in n·log(n):
  // sort, then each element contributes v[k] * (2k - n + 1) to the sum over unordered pairs.
  const v = Array.isArray(input.vector) ? input.vector : [];
  const n = v.length;
  let spread = 0;
  if (n > 1) {
    const s = v.slice().sort((a, b) => a - b);
    let sumPairs = 0;
    for (let k = 0; k < n; k++) sumPairs += s[k] * (2 * k - n + 1);
    spread = (2 * sumPairs) / (n * n);
  }
  const evictionBucket = Math.min(15, Math.max(0, Math.floor(spread * 16)));

  return {
    ...input,
    cached: true,
    cacheKey: 'jit_' + key + '_' + input.id,
    evictionBucket
  };
}`;
    return { source, provider: this.name, model: this.model, prompt: buildPrompt(req), rationale: 'Built-in reference repair: type-safe key derivation and n·log(n) pairwise spread via sorted prefix sums.' };
  }
}

export function selectProvider(): { active: Provider; available: string[] } {
  const all: Provider[] = [new AnthropicProvider(), new GeminiProvider(), new ReferenceProvider()];
  const available = all.filter((p) => p.available());
  const forced = process.env.MUTATOR_PROVIDER;
  const active = (forced && available.find((p) => p.name === forced)) || available[0];
  return { active, available: available.map((p) => p.name) };
}
