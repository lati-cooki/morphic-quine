import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { Organism } from './organism';
import type { WsClientMessage, WsServerMessage } from '../src/types';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const PORT = Number(process.env.ENGINE_PORT || 3001);
const organism = new Organism({ rootDir: process.cwd() });

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  const s = organism.state();
  res.json({ status: 'ok', generation: s.generation, phase: s.phase, hash: s.stateHash.slice(0, 16), packets: organism.pipeline.totalPackets, errors: organism.pipeline.totalErrors });
});
app.get('/api/state', (_req, res) => res.json(organism.state()));
app.post('/api/packet', (req, res) => res.json(organism.send(req.body)));
app.post('/api/inject/:kind', (req, res) => {
  const kind = String(req.params.kind).toUpperCase();
  if (kind !== 'MALFORMED' && kind !== 'SURGE' && kind !== 'NORMAL') return res.status(400).json({ error: 'kind must be malformed|surge|normal' });
  organism.inject(kind, Number(req.query.count ?? 1));
  res.json({ ok: true });
});
app.post('/api/synthesize', async (req, res) => { await organism.synthesize(req.body?.nodeId, req.body?.goal); res.json(organism.state().candidate); });
app.get('/api/goals', (_req, res) => res.json(organism.state().goals));
app.post('/api/splice', (_req, res) => { organism.splice('user'); res.json({ phase: organism.state().phase }); });
app.post('/api/rollback', (_req, res) => { organism.rollback('user'); res.json({ phase: organism.state().phase }); });
app.post('/api/snapshot', (_req, res) => res.json(organism.snapshot()));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(msg: WsServerMessage) {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
}

let pending: NodeJS.Timeout | null = null;
function scheduleBroadcast() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; broadcast({ type: 'STATE', state: organism.state() }); }, 120);
}
organism.on('state', scheduleBroadcast);
organism.on('log', scheduleBroadcast);
setInterval(scheduleBroadcast, 500);

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'STATE', state: organism.state() } satisfies WsServerMessage));
  ws.on('message', async (raw) => {
    let msg: WsClientMessage;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    try {
      switch (msg.type) {
        case 'INJECT': organism.inject(msg.kind, msg.count ?? 1); break;
        case 'SYNTHESIZE': await organism.synthesize(msg.nodeId, msg.goal); break;
        case 'SPLICE': organism.splice('user'); break;
        case 'DISCARD': organism.discard(); break;
        case 'ROLLBACK': organism.rollback('user'); break;
        case 'SET_AUTONOMOUS': organism.setAutonomous(msg.enabled); break;
        case 'SEND_PACKET': organism.send(msg.payload); scheduleBroadcast(); break;
        case 'EXPORT_SNAPSHOT': {
          const out = organism.snapshot();
          ws.send(JSON.stringify({ type: 'SNAPSHOT', filename: out.filename, code: out.code } satisfies WsServerMessage));
          break;
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'ERROR', message: err instanceof Error ? err.message : String(err) } satisfies WsServerMessage));
    }
  });
});

organism.start();
server.listen(PORT, () => {
  console.log(`[morphic] engine on http://localhost:${PORT}  ws://localhost:${PORT}/ws`);
});
