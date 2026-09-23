import React, { useState } from 'react';
import { GraphNode } from './types';
import { HudHeader } from './components/HudHeader';
import { LivingGraph } from './components/LivingGraph';
import { HomeostaticVitals } from './components/HomeostaticVitals';
import { CorticalMutationFeed } from './components/CorticalMutationFeed';
import { QuineIntegrityBar } from './components/QuineIntegrityBar';
import { NodeDetailModal } from './components/NodeDetailModal';
import { QuineCodeModal } from './components/QuineCodeModal';
import { HighResModal } from './components/HighResModal';
import { useMorphicEngine } from './hooks/useMorphicEngine';

export default function App() {
  const {
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
  } = useMorphicEngine();

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isQuineModalOpen, setIsQuineModalOpen] = useState<boolean>(false);
  const [isHighResModalOpen, setIsHighResModalOpen] = useState<boolean>(false);

  // Execute Hot-Splice on real backend
  const handleHotSplice = () => {
    executeHotSplice();
  };

  // Reset / Trigger Mitosis on real backend
  const handleReset = () => {
    startMitosis();
  };

  // Inject real hostile poison or quadratic stress into live DAG
  const handleInjectLoad = () => {
    injectChaos('POISON');
  };

  // Persist live mutated AST to runnable standalone file
  const handlePersistToDisk = () => {
    generateQuine();
    setIsQuineModalOpen(true);
  };

  const handleAddReflectionThought = (text: string) => {
    sendPacket({ data: text, userThought: true });
  };

  return (
    <div className="min-h-screen bg-[#03060c] text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200 relative overflow-x-hidden">
      {/* HUD Header Bar */}
      <HudHeader
        generation={quineStatus.generation}
        isMitosisActive={isMitosisActive}
        onHotSplice={handleHotSplice}
        onInjectLoad={handleInjectLoad}
        onReset={handleReset}
        onOpenQuineModal={() => setIsQuineModalOpen(true)}
        onOpenHighResView={() => setIsHighResModalOpen(true)}
        isSpliceComplete={isSpliceComplete}
        isConnected={isConnected}
      />

      {/* Main 3-Column HUD Viewport */}
      <main className="flex-1 p-3 sm:p-4 flex flex-col lg:flex-row gap-3.5 relative z-10 min-h-0">
        {/* Left Panel: Homeostatic Vitals */}
        <HomeostaticVitals
          vitals={vitals}
          onInjectPressure={() => {
            injectChaos('QUADRATIC');
          }}
          onTriggerPainReflex={handleInjectLoad}
          isSpliceComplete={isSpliceComplete}
        />

        {/* Center: The Living Computational Graph (Mitosis in Action) */}
        <LivingGraph
          nodes={nodes}
          synapses={synapses}
          selectedNodeId={selectedNode?.id || null}
          onSelectNode={(n) => setSelectedNode(n)}
          isMitosisActive={isMitosisActive}
          isSpliceComplete={isSpliceComplete}
          onHotSplice={handleHotSplice}
        />

        {/* Right Panel: Cortical Mutation Feed */}
        <CorticalMutationFeed
          astDiff={astDiff}
          reflectionLogs={logs}
          isSpliceComplete={isSpliceComplete}
          onHotSplice={handleHotSplice}
          onAddReflectionThought={handleAddReflectionThought}
        />
      </main>

      {/* Bottom Bar: Generation & Quine Integrity */}
      <QuineIntegrityBar
        quineStatus={quineStatus}
        onOpenQuineModal={() => setIsQuineModalOpen(true)}
        onPersistToDisk={handlePersistToDisk}
        isSpliceComplete={isSpliceComplete}
      />

      {/* Modals */}
      <NodeDetailModal
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onHotSplice={handleHotSplice}
        isSpliceComplete={isSpliceComplete}
      />

      <QuineCodeModal
        isOpen={isQuineModalOpen}
        onClose={() => setIsQuineModalOpen(false)}
        generation={quineStatus.generation}
        code={lastQuineCode}
        filename={lastQuineFile}
      />

      <HighResModal
        isOpen={isHighResModalOpen}
        onClose={() => setIsHighResModalOpen(false)}
        nodes={nodes}
        vitals={vitals}
        astDiff={astDiff}
        logs={logs}
        quineStatus={quineStatus}
        isSpliceComplete={isSpliceComplete}
      />
    </div>
  );
}
