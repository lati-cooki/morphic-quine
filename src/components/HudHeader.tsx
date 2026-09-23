import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  Zap, 
  ShieldAlert, 
  Code2, 
  Camera, 
  Flame, 
  RotateCcw,
  Sparkles,
  Download
} from 'lucide-react';

interface HudHeaderProps {
  generation: string;
  isMitosisActive: boolean;
  onHotSplice: () => void;
  onInjectLoad: () => void;
  onReset: () => void;
  onOpenQuineModal: () => void;
  onOpenHighResView: () => void;
  isSpliceComplete: boolean;
  isConnected?: boolean;
}

export const HudHeader: React.FC<HudHeaderProps> = ({
  generation,
  isMitosisActive,
  onHotSplice,
  onInjectLoad,
  onReset,
  onOpenQuineModal,
  onOpenHighResView,
  isSpliceComplete,
  isConnected = false,
}) => {
  const [timeString, setTimeString] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeString(
        now.toISOString().slice(11, 19) + '.' + String(now.getMilliseconds()).padStart(3, '0')
      );
    };
    update();
    const timer = setInterval(update, 67);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="border-b border-cyan-900/40 bg-[#070b14]/90 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 relative z-30">
      {/* Brand & Identity */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
          <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-wider font-display uppercase text-white flex items-center gap-1.5">
              <span>Morphic Quine</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                HUD v14.8
              </span>
            </h1>
            <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-slate-600" />
            <span className="hidden sm:inline-block text-xs font-mono text-slate-400 tracking-wider">
              AUTONOMOUS MUTATIVE RUNTIME
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-3">
            <span className="text-cyan-400/90 font-medium">SYS.EPOCH: {timeString}</span>
            <span className="hidden md:inline text-slate-500">|</span>
            <span className="hidden md:inline text-amber-400/90">TOPOLOGY: ADAPTIVE SYNAPSE MESH</span>
          </div>
        </div>
      </div>

      {/* Center Live Badges */}
      <div className="flex items-center gap-2">
        {isMitosisActive && !isSpliceComplete ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-mono shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-bold tracking-wide">MITOSIS IN PROGRESS</span>
            <span className="text-[10px] text-amber-400/70 border-l border-amber-500/30 pl-2">
              Candidate_AST_v3 [99.4%]
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs font-mono shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-bold tracking-wide">AST HOT-SPLICED</span>
            <span className="text-[10px] text-emerald-400/70 border-l border-emerald-500/30 pl-2">
              Gen 15.0 Staged
            </span>
          </div>
        )}

        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700/60 text-slate-300 text-xs font-mono">
          <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
          <span>SANDBOX: ISOLATED</span>
        </div>

        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700/60 text-xs font-mono">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-amber-400'}`} />
          <span className={isConnected ? 'text-emerald-300 font-semibold' : 'text-amber-300'}>
            {isConnected ? 'LIVE ENGINE RUNTIME' : 'SIMULATOR'}
          </span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2">
        <button
          id="btn-highres-view"
          onClick={onOpenHighResView}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 transition shadow-[0_0_12px_rgba(6,182,212,0.15)] hover:shadow-[0_0_18px_rgba(6,182,212,0.3)] cursor-pointer"
          title="View and Export High Resolution 4K Image of this HUD"
        >
          <Camera className="w-3.5 h-3.5 text-cyan-400" />
          <span>High-Res Image</span>
        </button>

        <button
          id="btn-inject-load"
          onClick={onInjectLoad}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition cursor-pointer"
          title="Inject synthetic bottleneck load to trigger mitosis and pain reflexes"
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>Inject Load</span>
        </button>

        {!isSpliceComplete ? (
          <button
            id="btn-hotsplice-trigger"
            onClick={onHotSplice}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold rounded bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.4)] transition cursor-pointer active:scale-95"
            title="Hot-splice candidate AST into production"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Hot-Splice AST</span>
          </button>
        ) : (
          <button
            id="btn-reset-state"
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition cursor-pointer"
            title="Reset to initial mitosis state"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Mitosis</span>
          </button>
        )}

        <button
          id="btn-view-quine"
          onClick={onOpenQuineModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition cursor-pointer"
          title="Inspect Self-Referential Quine Code"
        >
          <Code2 className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden md:inline">Quine Code</span>
        </button>
      </div>
    </header>
  );
};
