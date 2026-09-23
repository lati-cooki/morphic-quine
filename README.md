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

`MUTATOR_PROVIDER=anthropic|gemini|reference` forces a provider. Copy `.env.example` to `.env.local`.

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
                  fitness ≥ 85 ──▶ splice (atomic pointer swap) ──▶ lineage/gen-NNNN.json
                              │
                     observe 25 executions ──▶ regression? ──▶ rollback
```

Fitness is measured, not asserted: 55% pass rate, 30% contract (every key the incumbent emitted
must be present and every downstream node must accept the output), 15% latency against a 5 ms p99
budget. A candidate that scores below the threshold gets one retry with the evaluator's findings in
the prompt. Anything below threshold stays a candidate for manual splice.

## HUD

- **Inject fault / Inject surge** send malformed or oversized packets through the live pipeline.
- **autonomous / manual** toggles whether the sentinel synthesizes on breach and splices above threshold.
- **Synthesize**, **Splice**, **Rollback** drive the loop by hand.
- **Diff** is a real line diff of incumbent vs candidate. **Fitness** is the evaluator's report.
  **Log** is the engine's event stream. **Lineage** lists every generation.
- Vitals are the process's own: heap, RSS, event loop lag, GC churn, throughput, latency quantiles.
- **export snapshot** writes `snapshots/morphic-genNNN-<hash>.mjs`, runnable with
  `node snapshots/<file> '{"data":"hello"}'`.

## HTTP

```
GET  /api/health           POST /api/packet {…}        POST /api/inject/:kind?count=n
GET  /api/state            POST /api/synthesize {nodeId?}
POST /api/splice           POST /api/rollback          POST /api/snapshot
```

## Tests

```
npm test        # vitest: sandbox, diff, pipeline, evaluator, sentinel, full loop
npm run lint    # tsc --noEmit
```

## Layout

```
server/
  sandbox.ts     compile a function in an isolated vm context with a per-call timeout
  nodes.ts       default node sources and traffic generators
  pipeline.ts    topo-ordered execution, per-node window stats and traffic ring buffers, splice/rollback
  evaluator.ts   fitness measurement on recorded traffic
  sentinel.ts    breach detection, post-splice observation
  mutator.ts     patch providers: anthropic, gemini, reference
  diff.ts        LCS line diff
  lineage.ts     append-only splice history, snapshot export
  telemetry.ts   process vitals
  organism.ts    the control loop
  server.ts      express + websocket
src/             React HUD
tests/           vitest
```
