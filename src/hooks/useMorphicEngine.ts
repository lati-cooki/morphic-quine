import { useState, useEffect, useRef, useCallback } from 'react';
import { GraphNode, SynapseLink, VitalsData, AstDiffSnippet, ReflectionLog, QuineStatus } from '../types';
import { OrganismState, WsClientMessage, WsServerMessage } from '../../server/types';
import { 
  INITIAL_NODES, 
  INITIAL_SYNAPSES, 
  INITIAL_VITALS, 
  INITIAL_AST_DIFF, 
  INITIAL_REFLECTION_LOGS, 
  INITIAL_QUINE_STATUS,
  QUINE_SOURCE_CODE
} from '../data/mockQuineData';

export function useMorphicEngine() {
  const [nodes, setNodes] = useState<GraphNode[]>(INITIAL_NODES);
  const [synapses, setSynapses] = useState<SynapseLink[]>(INITIAL_SYNAPSES);
  const [vitals, setVitals] = useState<VitalsData>(INITIAL_VITALS);
  const [astDiff, setAstDiff] = useState<AstDiffSnippet>(INITIAL_AST_DIFF);
  const [logs, setLogs] = useState<ReflectionLog[]>(INITIAL_REFLECTION_LOGS);
  const [quineStatus, setQuineStatus] = useState<QuineStatus>(INITIAL_QUINE_STATUS);
  const [isMitosisActive, setIsMitosisActive] = useState<boolean>(true);
  const [isSpliceComplete, setIsSpliceComplete] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastQuineCode, setLastQuineCode] = useState<string>(QUINE_SOURCE_CODE);
  const [lastQuineFile, setLastQuineFile] = useState<string>('morphic-quine-gen14_8.mjs');

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let ws: WebSocket;
    let reconnectTimeout: any;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[Morphic Engine] Connected to living runtime backend');
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data: WsServerMessage = JSON.parse(event.data);
            if (data.type === 'STATE_UPDATE') {
              const state: OrganismState = data.state;
              setNodes(state.nodes);
              setSynapses(state.synapses);
              setVitals(state.vitals);
              setAstDiff(state.astDiff);
              setLogs(state.logs);
              setQuineStatus(state.quineStatus);
              setIsMitosisActive(state.isMitosisActive);
              setIsSpliceComplete(state.isSpliceComplete);
            } else if (data.type === 'QUINE_GENERATED') {
              setLastQuineCode(data.code);
              setLastQuineFile(data.filename);
            }
          } catch (err) {
            console.error('[WS Parse error]', err);
          }
        };

        ws.onclose = () => {
          console.warn('[Morphic Engine] WS disconnected, retrying in 2s...');
          setIsConnected(false);
          reconnectTimeout = setTimeout(connect, 2000);
        };

        ws.onerror = (err) => {
          console.warn('[Morphic Engine] WS error:', err);
          ws.close();
        };
      } catch (err) {
        console.warn('[WS Connect error]', err);
        reconnectTimeout = setTimeout(connect, 2000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  const send = useCallback((msg: WsClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const injectChaos = useCallback((kind: 'POISON' | 'SURGE' | 'QUADRATIC') => {
    send({ type: 'INJECT_CHAOS', kind });
  }, [send]);

  const startMitosis = useCallback((targetNodeId?: string) => {
    send({ type: 'START_MITOSIS', targetNodeId });
  }, [send]);

  const executeHotSplice = useCallback(() => {
    send({ type: 'EXECUTE_HOTSPLICE' });
  }, [send]);

  const generateQuine = useCallback(() => {
    send({ type: 'GENERATE_QUINE' });
  }, [send]);

  const sendPacket = useCallback((payload?: any) => {
    send({ type: 'SEND_PACKET', payload });
  }, [send]);

  return {
    nodes,
    synapses,
    vitals,
    astDiff,
    logs,
    quineStatus,
    isMitosisActive,
    isSpliceComplete,
    isConnected,
    lastQuineCode,
    lastQuineFile,
    injectChaos,
    startMitosis,
    executeHotSplice,
    generateQuine,
    sendPacket,
  };
}
