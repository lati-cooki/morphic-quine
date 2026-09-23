import React, { useState } from 'react';
import { QuineStatus } from '../types';
import { 
  GitBranch, 
  Save, 
  CheckCircle, 
  Code2, 
  ShieldCheck, 
  HardDrive,
  Copy,
  Clock,
  Sparkles
} from 'lucide-react';

interface QuineIntegrityBarProps {
  quineStatus: QuineStatus;
  onOpenQuineModal: () => void;
  onPersistToDisk: () => void;
  isSpliceComplete: boolean;
}

export const QuineIntegrityBar: React.FC<QuineIntegrityBarProps> = ({
  quineStatus,
  onOpenQuineModal,
  onPersistToDisk,
  isSpliceComplete,
}) => {
  const [persistedFlash, setPersistedFlash] = useState(false);

  const handlePersist = () => {
    onPersistToDisk();
    setPersistedFlash(true);
    setTimeout(() => setPersistedFlash(false), 2500);
  };

  return (
    <div className="border-t border-cyan-900/40 bg-[#070b14]/95 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 relative z-20">
      {/* Left: Generational Evolutionary Lineage */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/70 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
          <GitBranch className="w-4 h-4 text-cyan-400" />
          <div className="flex flex-col">
            <span className="text-[9px] font-mono text-cyan-400/80 uppercase tracking-widest leading-none">
              Evolutionary Lineage
            </span>
            <span className="text-sm font-bold font-mono tracking-wider text-white leading-tight">
              {isSpliceComplete ? 'Gen 15.0' : quineStatus.generation}
            </span>
          </div>
        </div>

        <div className="hidden sm:flex flex-col font-mono text-[11px] text-slate-400">
          <span className="text-slate-300 font-medium">
            Lineage Depth: <span className="text-cyan-300 font-bold">{isSpliceComplete ? 49 : quineStatus.lineageDepth} Mutations</span>
          </span>
          <span className="text-[10px] text-slate-500">
            State Checksum: <span className="text-slate-400">{quineStatus.stateChecksum}</span>
          </span>
        </div>
      </div>

      {/* Center: Quine Serializer Readiness & Integrity Confirmation */}
      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-xs font-mono">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className="font-bold text-emerald-300">
            Quine Serializer: Ready to Clone or Persist
          </span>
          <span className="hidden md:inline text-emerald-500">|</span>
          <span className="text-[11px] text-emerald-400/80">
            Self-Replication Integrity: {quineStatus.integrityScore}%
          </span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          id="btn-inspect-quine-code"
          onClick={onOpenQuineModal}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 transition cursor-pointer"
          title="Inspect generated self-referential quine code"
        >
          <Code2 className="w-3.5 h-3.5 text-purple-400" />
          <span>Inspect Quine</span>
        </button>

        <button
          id="btn-persist-disk"
          onClick={handlePersist}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold rounded transition cursor-pointer ${
            persistedFlash
              ? 'bg-emerald-500 text-slate-950 border border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
              : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]'
          }`}
          title="Persist the evolved state and topological quine to disk"
        >
          {persistedFlash ? (
            <>
              <CheckCircle className="w-3.5 h-3.5 text-slate-950" />
              <span>Snapshot Persisted!</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Persist State to Disk</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
