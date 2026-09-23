import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrganismState, WsClientMessage, WsServerMessage } from '../types';

export interface Snapshot { filename: string; code: string }

export function useMorphicEngine() {
  const [state, setState] = useState<OrganismState | null>(null);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    let ws: WebSocket;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        const msg: WsServerMessage = JSON.parse(ev.data);
        if (msg.type === 'STATE') setState(msg.state);
        else if (msg.type === 'SNAPSHOT') setSnapshot({ filename: msg.filename, code: msg.code });
        else if (msg.type === 'ERROR') { setError(msg.message); setTimeout(() => setError(null), 6000); }
      };
      ws.onclose = () => { setConnected(false); if (!closed) retry = setTimeout(connect, 1500); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { closed = true; clearTimeout(retry); ws.close(); };
  }, []);

  const send = useCallback((msg: WsClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return {
    state,
    connected,
    snapshot,
    error,
    clearSnapshot: () => setSnapshot(null),
    inject: (kind: 'MALFORMED' | 'SURGE' | 'NORMAL', count = 1) => send({ type: 'INJECT', kind, count }),
    synthesize: (nodeId?: string, goal?: string) => send({ type: 'SYNTHESIZE', nodeId, goal }),
    splice: () => send({ type: 'SPLICE' }),
    discard: () => send({ type: 'DISCARD' }),
    rollback: () => send({ type: 'ROLLBACK' }),
    setAutonomous: (enabled: boolean) => send({ type: 'SET_AUTONOMOUS', enabled }),
    exportSnapshot: () => send({ type: 'EXPORT_SNAPSHOT' }),
  };
}
