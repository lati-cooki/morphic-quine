import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';

import { MorphicDAG } from './dag';
import { TelemetryCollector } from './telemetry';
import { CorticalMutator } from './mutator';
import { QuineEngine } from './quine';
import { OrganismState, WsClientMessage, WsServerMessage } from './types';
import { ReflectionLog } from '../src/types';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const dag = new MorphicDAG();
const telemetry = new TelemetryCollector(dag);
const mutator = new CorticalMutator();
const quine = new QuineEngine(dag);

let logs: ReflectionLog[] = [
  {
    id: 'init_1',
    time: new Date().toLocaleTimeString('en-US', { hour12: false }),
    level: 'SYNAPSE',
    message: 'Morphic living runtime initialized. Active DAG nodes compiled in isolated VM contexts.',
  },
  {
    id: 'init_2',
    time: new Date().toLocaleTimeString('en-US', { hour12: false }),
    level: 'THOUGHT',
    message: 'Homeostatic telemetry loop active. Monitoring memory entropy, GC churn, and microsecond latencies.',
  },
];

function broadcast(msg: WsServerMessage) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function getOrganismState(): OrganismState {
  const isMitosis = dag.candidate !== null;
  const isJitOptimal = dag.nodes.get('jit_cache')?.status === 'optimal';

  return {
    generation: quine.getGeneration(),
    lineageDepth: 29,
    isMitosisActive: isMitosis,
    isSpliceComplete: isJitOptimal && !isMitosis && dag.nodes.get('jit_cache')?.tag.includes('HOT-SPLICED') || false,
    nodes: dag.toGraphNodes(),
    synapses: dag.getSynapses(),
    vitals: telemetry.getVitals(),
    astDiff: dag.candidate?.diff || {
      nodeTarget: 'JIT_Cache',
      strategy: 'AVX-512 SIMD Vectorization & Defensive Sanitization',
      previousFitness: 68.2,
      candidateFitness: 99.4,
      oldAst: ['// Awaiting mitosis trigger...'],
      newAst: ['// Candidate AST will be synthesized upon mitosis trigger...'],
      changes: [],
    },
    logs: logs.slice(-15),
    quineStatus: quine.getStatus(),
    candidate: dag.candidate,
  };
}

// REST Endpoints for quick testing & health
app.get('/api/health', (req, res) => {
  res.json({ status: 'living', generation: quine.getGeneration(), packets: dag.totalPacketsProcessed });
});

app.post('/api/packet', async (req, res) => {
  const result = await dag.executePipeline(req.body);
  telemetry.recordLatency(result.latencyMs, !!result.error);
  res.json(result);
});

// WebSocket Connection
wss.on('connection', (ws) => {
  console.log('[WS] HUD Client connected');

  // Send immediate initial state
  ws.send(JSON.stringify({ type: 'STATE_UPDATE', state: getOrganismState() }));

  ws.on('message', async (raw) => {
    try {
      const msg: WsClientMessage = JSON.parse(raw.toString());

      if (msg.type === 'SEND_PACKET') {
        const payload = msg.payload || { data: 'ambient_sensor_' + Date.now() };
        const res = await dag.executePipeline(payload);
        telemetry.recordLatency(res.latencyMs, !!res.error);
        ws.send(JSON.stringify({ type: 'PACKET_PROCESSED', latencyMs: res.latencyMs, error: res.error }));
      }

      else if (msg.type === 'INJECT_CHAOS') {
        const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
        if (msg.kind === 'POISON') {
          logs.push({
            id: 'log_' + Date.now(),
            time: timeStr,
            level: 'REFLEX',
            message: '🚨 HOSTILE POISON PAYLOAD INJECTED into pipeline! Unhandled exception triggered in JIT_Cache.',
          });
          const res = await dag.executePipeline({ id: 'poison_' + Date.now(), poison: true });
          telemetry.recordLatency(res.latencyMs, true);
        } else if (msg.kind === 'QUADRATIC') {
          logs.push({
            id: 'log_' + Date.now(),
            time: timeStr,
            level: 'REFLEX',
            message: '⚠️ QUADRATIC SURGE INJECTED: O(N^2) pseudo-scan loop experiencing massive latency choke.',
          });
          const res = await dag.executePipeline({ id: 'choke_' + Date.now(), quadraticStress: true });
          telemetry.recordLatency(res.latencyMs, false);
        }
        broadcast({ type: 'STATE_UPDATE', state: getOrganismState() });
      }

      else if (msg.type === 'START_MITOSIS') {
        const targetNode = dag.nodes.get('jit_cache');
        if (targetNode) {
          targetNode.type = 'bottleneck_mitosis';
          targetNode.status = 'bottleneck_mitosis';
          const { candidate, logs: mutationLogs } = await mutator.synthesizeCandidate('jit_cache', targetNode.code, targetNode.name);
          dag.candidate = candidate;
          logs.push(...mutationLogs);
          broadcast({ type: 'STATE_UPDATE', state: getOrganismState() });
        }
      }

      else if (msg.type === 'EXECUTE_HOTSPLICE') {
        if (dag.candidate) {
          const cand = dag.candidate;
          dag.hotSplice('jit_cache', cand.code, cand.fitness);
          logs.push({
            id: 'log_' + Date.now(),
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            level: 'HOTSWAP',
            message: `✨ ATOMIC ZERO-DOWNTIME HOT-SPLICE COMPLETE. Function pointer swapped in memory. Fitness restored to ${cand.fitness}%.`,
          });
          broadcast({ type: 'STATE_UPDATE', state: getOrganismState() });
        }
      }

      else if (msg.type === 'GENERATE_QUINE') {
        const quineResult = await quine.exportRunnableQuine(process.cwd());
        logs.push({
          id: 'log_' + Date.now(),
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level: 'THOUGHT',
          message: `💾 Living Quine persisted to disk: ${quineResult.filename} (Checksum: ${quineResult.checksum.substring(0, 8)}).`,
        });
        broadcast({ type: 'STATE_UPDATE', state: getOrganismState() });
        ws.send(JSON.stringify({
          type: 'QUINE_GENERATED',
          filename: quineResult.filename,
          code: quineResult.code,
          generation: quine.getGeneration(),
        }));
      }
    } catch (e: any) {
      console.error('[WS Error]', e);
    }
  });
});

// Ambient Heartbeat Loop: processes gentle ambient packets so the graph pulses with life
setInterval(async () => {
  if (dag.nodes.get('jit_cache')?.status !== 'bottleneck_mitosis') {
    const res = await dag.executePipeline({ id: 'ambient_' + Math.floor(Math.random() * 1000), data: 'stream_vector' });
    telemetry.recordLatency(res.latencyMs, false);
  }
  broadcast({ type: 'STATE_UPDATE', state: getOrganismState() });
}, 800);

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\x1b[32m[Morphic Quine Engine]\x1b[0m Living Runtime listening on http://localhost:${PORT} (WS on /ws)`);
});
