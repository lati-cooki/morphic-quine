import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import vm from 'node:vm';

/** Ceiling for one model call. The loop's own timeout sits 5s above this. */
export const PROVIDER_TIMEOUT_MS = Math.max(30_000, Number(process.env.PROVIDER_TIMEOUT_MS) || 120_000);
import { extractFunctionSource } from './sandbox';
import type { AttackRequest, Attacker } from './attacker';
import type { Usage } from './usage';

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
  usage?: Usage;
}

export interface AttackResult {
  inputs: unknown[];
  usage?: Usage;
}

export interface Provider {
  readonly name: string;
  readonly model: string;
  available(): boolean;
  synthesize(req: PatchRequest): Promise<PatchResult>;
  /** Optional red team: propose inputs meant to break the function. */
  attack?(req: AttackRequest): Promise<AttackResult>;
}

const ATTACK_SYSTEM = `You are a red team for a single JavaScript function running inside a data pipeline.
Your job is to produce inputs that make it throw, run for more than 100 milliseconds, return something other than an object, or return an object its downstream consumers cannot handle.

Rules:
- Stay within the shape of the sample inputs: same top-level keys, hostile values. Only when told the node is first in the pipeline may you replace the whole input.
- Prefer inputs that expose a general weakness (type confusion, missing guards, unbounded work) over random noise.
- Do not repeat the known hits.
- Reply with a JSON array of inputs and nothing else. No fences, no commentary.`;

export function buildAttackPrompt(req: AttackRequest): string {
  const parts = [
    `# Target: ${req.node.name} (${req.node.id})${req.node.depth === 0 ? ' — first node, receives raw external packets; whole-input replacement allowed' : ''}\nRole: ${req.node.role}\n\n\`\`\`js\n${req.node.source}\n\`\`\``,
    `# Sample inputs it receives\n${req.samples.slice(0, 6).map((s, i) => `${i + 1}. ${preview(s, 400)}`).join('\n')}`,
  ];
  if (req.downstream.length) parts.push(`# Downstream consumers of its output\n${req.downstream.map((d) => `\`\`\`js\n${d.source}\n\`\`\``).join('\n')}`);
  if (req.known.length) parts.push(`# Known hits (do not repeat)\n${req.known.slice(0, 10).map((k) => `- ${preview(k, 200)}`).join('\n')}`);
  parts.push(`Return up to ${req.max} inputs as a JSON array.`);
  return parts.join('\n\n');
}

function noFunction(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const snippet = t.length > 300 ? `${t.slice(0, 150)} … ${t.slice(-150)}` : t;
  return `No function found in model output (${text.length} chars): ${snippet || '<empty>'}`;
}

export function parseAttackList(text: string, max: number): unknown[] {
  const cleaned = text.replace(/```(?:json|js|javascript)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON array in attacker output');
  const slice = cleaned.slice(start, end + 1);
  let arr: unknown;
  try {
    arr = JSON.parse(slice);
  } catch {
    // Models often write JS literals (undefined, NaN, unquoted keys, trailing commas). Evaluate in an empty context.
    try { arr = vm.runInNewContext(`(${slice})`, Object.create(null), { timeout: 200 }); }
    catch (err) {
      const snippet = cleaned.length > 240 ? `${cleaned.slice(0, 120)} … ${cleaned.slice(-120)}` : cleaned;
      throw new Error(`Attacker output is not parseable: ${(err as Error).message}. Output: ${snippet.replace(/\s+/g, ' ')}`);
    }
  }
  if (!Array.isArray(arr)) throw new Error('Attacker output is not an array');
  return arr.slice(0, max);
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
    if (!this.client) this.client = new Anthropic({ timeout: PROVIDER_TIMEOUT_MS - 5_000 });
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
    if (!source) throw new Error(noFunction(text));
    return { source, provider: this.name, model: this.model, prompt, usage: anthropicUsage(response.usage) };
  }

  async attack(req: AttackRequest): Promise<AttackResult> {
    if (!this.client) this.client = new Anthropic({ timeout: PROVIDER_TIMEOUT_MS - 5_000 });
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: ATTACK_SYSTEM,
      messages: [{ role: 'user', content: buildAttackPrompt(req) }],
    });
    if (response.stop_reason === 'refusal') throw new Error('Model declined the attack request');
    return { inputs: parseAttackList(response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'), req.max), usage: anthropicUsage(response.usage) };
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
    if (!this.client) this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: PROVIDER_TIMEOUT_MS - 5_000 } });
    const prompt = buildPrompt(req);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: `${SYSTEM}\n\n${prompt}`,
    });
    const source = extractFunctionSource(response.text ?? '');
    if (!source) throw new Error(noFunction(response.text ?? ''));
    return { source, provider: this.name, model: this.model, prompt, usage: geminiUsage(response.usageMetadata) };
  }

  async attack(req: AttackRequest): Promise<AttackResult> {
    if (!this.client) this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 60_000 } });
    const response = await this.client.models.generateContent({ model: this.model, contents: `${ATTACK_SYSTEM}\n\n${buildAttackPrompt(req)}` });
    return { inputs: parseAttackList(response.text ?? '', req.max), usage: geminiUsage(response.usageMetadata) };
  }
}

/** Adapter so an LLM provider can serve as the attacker. Usage is reported through onUsage. */
export class ProviderAttacker implements Attacker {
  constructor(private provider: Provider, private onUsage?: (u: Usage, ms: number) => void) {}
  get name() { return this.provider.name; }
  get model() { return this.provider.model; }
  async generate(req: AttackRequest) {
    const t0 = Date.now();
    const r = await this.provider.attack!(req);
    if (r.usage && this.onUsage) this.onUsage(r.usage, Date.now() - t0);
    return r.inputs;
  }
}

function anthropicUsage(u: { input_tokens: number; output_tokens: number } | undefined): Usage | undefined {
  if (!u) return undefined;
  return { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, thoughtTokens: 0 };
}

function geminiUsage(u: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined): Usage | undefined {
  if (!u) return undefined;
  return { inputTokens: u.promptTokenCount ?? 0, outputTokens: u.candidatesTokenCount ?? 0, thoughtTokens: u.thoughtsTokenCount ?? 0 };
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
