# Morphic

A self-repairing data pipeline with a live HUD.

Four JavaScript functions run as a pipeline, each compiled into its own V8 context with a per-call
time limit. A sentinel watches every node's error rate and p95 latency. When one breaches, the engine
asks a model for a patch, scores the patch on the traffic that actually hit the node, and hot-swaps
it in if it clears the bar. It then watches the new code and rolls back on regression. Every splice
is written to disk as a lineage record, replayed onto the pipeline at boot, and the whole pipeline can be exported as a runnable module
whose header carries that history.

The shipped `JIT_Cache` node has two real defects: it calls `.trim()` on a payload it assumes is a
string, and it computes an eviction bucket with an O(n²) pairwise scan over a vector whose size
scales with payload length. A packet with no payload crashes it. A 700-byte payload takes tens of milliseconds.

## Run

```
npm install
npm run dev:all      # engine on :3001, HUD on :3000
```

Or separately: `npm run engine` and `npm run dev`.

Without an API key the built-in reference provider closes the loop for the shipped defect only. To
repair arbitrary nodes, set one of:

```
ANTHROPIC_API_KEY=...   # claude-opus-5 by default; override with ANTHROPIC_MODEL
GEMINI_API_KEY=...      # gemini-2.5-flash by default; override with GEMINI_MODEL
```

`MUTATOR_PROVIDER=anthropic|gemini|reference` forces a provider. `PROVIDER_TIMEOUT_MS` caps each model
call (default 120000; Gemini 2.5 Pro on a large prompt can need 180000). Copy `.env.example` to `.env.local`.

## The loop

```
traffic ──▶ pipeline ──▶ per-node window stats
                              │
                        sentinel breach? (error rate > 5% or p95 > 25 ms)
                              │
                     synthesize: prompt = source + recorded failures
                                        + recorded slow inputs + downstream consumers
                              │
                     evaluate in a fresh vm context on the node's recorded corpus
                        pass rate · output contract · downstream acceptance · p99
                              │
                  fitness ≥ 85 ──▶ red team attacks the candidate
                              │        hits ──▶ corpus/<node>.json ──▶ back to synthesize
                              │
                    survived ──▶ splice (atomic pointer swap) ──▶ lineage/gen-NNNN.json
                              │
                     observe 25 executions ──▶ regression? ──▶ rollback
```

Fitness is measured, not asserted: 55% pass rate, 30% contract (every key the incumbent emitted
must be present and every downstream node must accept the output), 15% latency against a 5 ms p99
budget. A candidate that scores below the threshold gets one retry with the evaluator's findings in
the prompt. Anything below threshold stays a candidate for manual splice.

## Red team

Fitness on recorded traffic proves a candidate handles what happened. The red team asks what could
happen. After a candidate clears the fitness threshold, an attacker is given the function, the
shape of inputs it receives, and its downstream consumers, and asked for inputs that will make it
throw, time out, return a non-object, or emit something downstream rejects. Hits go into the node's
permanent corpus (`corpus/<node>.json`) and the candidate goes back to the mutator with them in the
prompt. A candidate ships only after a round where the attacker comes up empty, or the attempt budget
runs out. Every later candidate for that node must survive everything that ever broke an ancestor.

If the red team itself fails (network, unparseable output) the candidate is kept and marked
unhardened rather than thrown away.

Two attackers ship. `fuzz` is a deterministic structural mutator (wrong types, empties, extremes,
oversized strings and arrays) that stays inside the observed input shape; only the first node gets
whole-input replacements, because only it sees raw packets. When the patch provider is an LLM, the
red team is the fuzzer plus that model, merged, unless `ATTACKER=fuzz`. In practice the fuzzer finds
most of the hits; the model contributes semantic cases the fuzzer cannot guess. `ATTACK_ROUNDS` is not exposed yet; edit `attackRounds` in
the Organism options.

**Probe** in a node's detail modal attacks the live code of a healthy node. Hits are recorded as
failures, so the sentinel breaches on a discovered defect the same way it does on an observed one.

## Goals

A goal is a positive objective: for these inputs, the pipeline should emit this. Drop a JSON file in
`goals/`:

```json
{
  "name": "region-tag",
  "description": "Every commit record carries a `region` field: the payload text before the first ':' in upper case, or UNKNOWN when the payload is not a string.",
  "nodeId": "async_buffer",
  "target": 0.95,
  "scorer": "fields",
  "examples": [ { "input": { "id": "g0", "data": "eu-west:4471:tick" }, "expected": { "region": "EU-WEST" } }, … ]
}
```

`expected` is partial: only the keys present are scored. Scorers are `fields` (deep equality),
`numeric` (absolute `tolerance`), and `text` (normalised edit distance). A third of the examples are
held out deterministically and never appear in the prompt. The sentinel treats holdout below
`target` as a breach and synthesizes a rewrite of `nodeId` with the training misses in the prompt.
Fitness for a goal-directed candidate is 25% pass, 15% contract, 10% latency, 50% goal holdout, so a
candidate that hardcodes the shown examples scores high on train and low on holdout and stays below
the splice threshold. The log calls that out. If goal examples fail upstream of the target node, the
log says which node is blocking. When every remaining miss is a throw in one upstream node, the
autonomous loop repairs that node instead of rewriting the target again.

The shipped goal is unmet on the original pipeline. The built-in reference provider declines goal
work, so this path needs an API key.

## HUD

- **Inject fault / Inject surge** send malformed or oversized packets through the live pipeline.
- **autonomous / manual** toggles whether the sentinel synthesizes on breach and splices above threshold.
- **Synthesize**, **Splice**, **Rollback** drive the loop by hand.
- **Diff** is a real line diff of incumbent vs candidate. **Fitness** is the evaluator's report.
  **Log** is the engine's event stream. **Lineage** lists every generation. **Goals** shows each
  goal's train and holdout score, its worst misses, and a button to synthesize toward it.
- Vitals are the process's own: heap, RSS, event loop lag, GC churn, throughput, latency quantiles.
- **export snapshot** writes `snapshots/morphic-genNNN-<hash>.mjs`, runnable with
  `node snapshots/<file> '{"data":"hello"}'`.

## HTTP

```
GET  /api/health           POST /api/packet {…}        POST /api/inject/:kind?count=n
GET  /api/state            POST /api/synthesize {nodeId?, goal?}
GET  /api/goals
POST /api/splice           POST /api/rollback          POST /api/snapshot
```

## Tests

```
npm test        # vitest: sandbox, diff, pipeline, evaluator, sentinel, goals, attacker, full loop
npm run lint    # tsc --noEmit
```

## Layout

```
server/
  sandbox.ts     compile a function in an isolated vm context with a per-call timeout
  nodes.ts       default node sources and traffic generators
  pipeline.ts    topo-ordered execution, per-node window stats and traffic ring buffers, splice/rollback
  evaluator.ts   fitness measurement on recorded traffic, plus goal holdout when a goal is active
  attacker.ts    red team: fuzz attacker, attack runner
  goals.ts       goal files, deterministic train/holdout split, scorers
  sentinel.ts    breach detection, post-splice observation
  mutator.ts     patch providers: anthropic, gemini, reference; LLM attackers
  diff.ts        LCS line diff
  lineage.ts     append-only splice history, snapshot export
  telemetry.ts   process vitals
  organism.ts    the control loop
  server.ts      express + websocket
src/             React HUD
goals/           goal definitions
corpus/          attacker-discovered inputs per node (generated)
tests/           vitest
```
