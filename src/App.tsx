import { useState } from 'react';
import { HudHeader } from './components/HudHeader';
import { LivingGraph } from './components/LivingGraph';
import { Vitals } from './components/Vitals';
import { MutationFeed } from './components/MutationFeed';
import { LineageBar } from './components/LineageBar';
import { NodeDetailModal } from './components/NodeDetailModal';
import { SnapshotModal } from './components/SnapshotModal';
import { useMorphicEngine } from './hooks/useMorphicEngine';

export default function App() {
  const engine = useMorphicEngine();
  const { state, connected } = engine;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  if (!state) {
    return (
      <div className="min-h-screen bg-[#03060c] text-slate-300 flex items-center justify-center font-mono text-sm">
        <div className="text-center space-y-2">
          <div className="text-cyan-300 tracking-widest">MORPHIC</div>
          <div className="text-slate-500">{connected ? 'waiting for state…' : 'connecting to engine on :3001 …'}</div>
          <div className="text-[11px] text-slate-600">start it with <span className="text-slate-400">npm run engine</span></div>
        </div>
      </div>
    );
  }

  const selectedNode = state.nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="min-h-screen bg-[#03060c] text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      <HudHeader
        state={state}
        connected={connected}
        onInject={engine.inject}
        onSynthesize={() => engine.synthesize()}
        onSplice={engine.splice}
        onDiscard={engine.discard}
        onRollback={engine.rollback}
        onToggleAutonomous={() => engine.setAutonomous(!state.autonomous)}
      />

      {engine.error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded border border-rose-500/50 bg-rose-950/40 text-rose-200 text-xs font-mono">{engine.error}</div>
      )}

      <main className="flex-1 p-3 sm:p-4 flex flex-col xl:flex-row gap-3.5 min-h-0">
        <Vitals vitals={state.vitals} nodes={state.nodes} onInject={engine.inject} />
        <LivingGraph state={state} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} onSplice={engine.splice} />
        <MutationFeed state={state} onSplice={engine.splice} onDiscard={engine.discard} onSynthesizeGoal={(nodeId, goal) => engine.synthesize(nodeId, goal)} />
      </main>

      <LineageBar state={state} onExport={engine.exportSnapshot} />

      <NodeDetailModal node={selectedNode} state={state} onClose={() => setSelectedNodeId(null)} onSynthesize={(id) => { engine.synthesize(id); setSelectedNodeId(null); }} />
      <SnapshotModal snapshot={engine.snapshot} onClose={engine.clearSnapshot} />
    </div>
  );
}
