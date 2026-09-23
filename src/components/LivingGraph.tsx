import React, { useState, useEffect, useRef } from 'react';
import { 
  GraphNode, 
  SynapseLink 
} from '../types';
import { 
  Cpu, 
  Layers, 
  Flame, 
  Zap, 
  Shield, 
  Database, 
  ArrowRight,
  Sparkles,
  Info,
  Maximize2,
  RefreshCw
} from 'lucide-react';

interface LivingGraphProps {
  nodes: GraphNode[];
  synapses: SynapseLink[];
  selectedNodeId: string | null;
  onSelectNode: (node: GraphNode) => void;
  isMitosisActive: boolean;
  isSpliceComplete: boolean;
  onHotSplice: () => void;
}

export const LivingGraph: React.FC<LivingGraphProps> = ({
  nodes,
  synapses,
  selectedNodeId,
  onSelectNode,
  isMitosisActive,
  isSpliceComplete,
  onHotSplice,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [packetTick, setPacketTick] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Animation frame loop for synapse data packets
  useEffect(() => {
    let animId: number;
    const loop = () => {
      setPacketTick((prev) => (prev + 0.008) % 1);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const getNodePos = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return { x: 50, y: 50 };
    return { x: node.x, y: node.y };
  };

  const jitNode = nodes.find((n) => n.id === 'jit_cache');
  const candidateNode = nodes.find((n) => n.id === 'candidate_ast');

  return (
    <div 
      ref={containerRef}
      className="relative flex-1 h-full min-h-[540px] bg-[#040711] border border-cyan-950/60 rounded-xl overflow-hidden shadow-2xl flex flex-col"
    >
      {/* HUD Reticle Overlay */}
      <div className="absolute inset-0 pointer-events-none hud-grid z-0 opacity-70" />
      <div className="absolute inset-0 pointer-events-none hud-dots z-0 opacity-40" />

      {/* Corner Brackets / Sci-fi Frame Elements */}
      <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-cyan-500/60 pointer-events-none z-10" />
      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-cyan-500/60 pointer-events-none z-10" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-cyan-500/60 pointer-events-none z-10" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-cyan-500/60 pointer-events-none z-10" />

      {/* Top HUD Legend / Title */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2 border-b border-cyan-900/30 bg-[#060a17]/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-mono tracking-widest text-cyan-300 font-bold uppercase">
            Topological Compute Mesh // Living Computational Graph
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400/80 border border-cyan-800/40">
            AUTONOMOUS MITOSIS ACTIVE
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Optimal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-amber-300 font-semibold">Mitotic Bottleneck</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-emerald-300">Sandbox Candidate</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative flex-1 w-full h-full overflow-hidden select-none">
        {/* Isolated Sandbox Containment Field Highlight */}
        {candidateNode && !isSpliceComplete && (
          <div 
            className="absolute rounded-2xl border-2 border-dashed border-emerald-500/40 bg-emerald-950/10 backdrop-blur-[2px] transition-all duration-700 pointer-events-none z-0"
            style={{
              left: `${candidateNode.x - 13}%`,
              top: `${candidateNode.y - 18}%`,
              width: '26%',
              height: '38%',
              boxShadow: '0 0 45px rgba(16,185,129,0.12), inset 0 0 25px rgba(16,185,129,0.08)',
            }}
          >
            <div className="absolute -top-3 left-4 px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/50 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 tracking-wider uppercase shadow-md">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span>ISOLATED SANDBOX // LIVE-FIRE MIRROR</span>
            </div>
            <div className="absolute -bottom-2.5 right-4 text-[9px] font-mono text-emerald-500/80 tracking-widest uppercase">
              CONTAINMENT: 100% SECURE
            </div>
          </div>
        )}

        {/* SVG Synapse Network Layer */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Linear Gradients for Synapses */}
            <linearGradient id="grad-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.4" />
            </linearGradient>

            <linearGradient id="grad-amber" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.5" />
            </linearGradient>

            <linearGradient id="grad-mitosis" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="1" />
              <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
            </linearGradient>

            <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            <filter id="glow-amber" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Render Synapse Connections */}
          {synapses.map((syn) => {
            const p1 = getNodePos(syn.from);
            const p2 = getNodePos(syn.to);

            // Calculate SVG coordinates in percentage
            const x1 = `${p1.x}%`;
            const y1 = `${p1.y}%`;
            const x2 = `${p2.x}%`;
            const y2 = `${p2.y}%`;

            const isMitoticBridge = syn.isBuddingBridge;

            return (
              <g key={syn.id}>
                {/* Background glow path */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isMitoticBridge ? 'url(#grad-mitosis)' : syn.color === 'amber' ? '#f59e0b' : '#06b6d4'}
                  strokeWidth={isMitoticBridge ? 3.5 : 2}
                  strokeOpacity={isMitoticBridge ? 0.9 : 0.4}
                  strokeDasharray={isMitoticBridge ? '6 3' : undefined}
                  filter={isMitoticBridge ? 'url(#glow-amber)' : 'url(#glow-cyan)'}
                />

                {/* Animated Data Packets traveling along synapse */}
                {[0, 0.25, 0.5, 0.75].map((offset, i) => {
                  const progress = (packetTick + offset) % 1;
                  // Interpolate position
                  const curX = p1.x + (p2.x - p1.x) * progress;
                  const curY = p1.y + (p2.y - p1.y) * progress;

                  return (
                    <circle
                      key={i}
                      cx={`${curX}%`}
                      cy={`${curY}%`}
                      r={isMitoticBridge ? 3.5 : 2.5}
                      fill={isMitoticBridge ? '#fbbf24' : syn.color === 'amber' ? '#f59e0b' : '#38bdf8'}
                      opacity={0.9}
                      filter={isMitoticBridge ? 'url(#glow-amber)' : 'url(#glow-cyan)'}
                    />
                  );
                })}

                {/* Mitotic Spindle Ripple Effect for JIT_Cache -> Candidate_AST_v3 */}
                {isMitoticBridge && (
                  <circle
                    cx={`${p1.x + (p2.x - p1.x) * 0.5}%`}
                    cy={`${p1.y + (p2.y - p1.y) * 0.5}%`}
                    r="8"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    opacity={0.7}
                    className="animate-ping"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Render Graph Nodes */}
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const isJit = node.id === 'jit_cache';
          const isCandidate = node.id === 'candidate_ast';

          return (
            <div
              key={node.id}
              onClick={() => onSelectNode(node)}
              className={`absolute cursor-pointer transition-transform duration-300 z-20 group`}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: `translate(-50%, -50%) scale(${isSelected ? 1.08 : 1})`,
              }}
            >
              {/* Special Mitotic Shockwave Aura for JIT_Cache */}
              {isJit && isMitosisActive && !isSpliceComplete && (
                <div className="absolute inset-0 -m-6 rounded-full border-2 border-amber-500/60 animate-ping pointer-events-none" />
              )}
              {isJit && isMitosisActive && !isSpliceComplete && (
                <div className="absolute inset-0 -m-3 rounded-full bg-amber-500/20 blur-xl pointer-events-none animate-pulse" />
              )}

              {/* Special Candidate Hologram Aura */}
              {isCandidate && (
                <div className="absolute inset-0 -m-3 rounded-xl bg-emerald-500/15 blur-lg pointer-events-none animate-pulse" />
              )}

              {/* Node Card Box */}
              <div
                className={`relative px-4 py-3 rounded-xl border backdrop-blur-md transition-all shadow-xl min-w-[190px] ${
                  isJit && !isSpliceComplete
                    ? 'bg-[#150e05]/90 border-amber-500 shadow-[0_0_35px_rgba(245,158,11,0.4)] animate-mitosis'
                    : isCandidate
                    ? 'bg-[#051410]/90 border-emerald-500/80 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
                    : isSelected
                    ? 'bg-slate-900/95 border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
                    : 'bg-[#070c18]/90 border-cyan-900/70 hover:border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                }`}
              >
                {/* Node Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {isJit ? (
                      <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
                    ) : isCandidate ? (
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                    ) : node.id === 'vector_core' ? (
                      <Cpu className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Database className="w-4 h-4 text-sky-400" />
                    )}
                    <span className={`text-xs font-bold font-mono tracking-wider ${
                      isJit && !isSpliceComplete
                        ? 'text-amber-300'
                        : isCandidate
                        ? 'text-emerald-300'
                        : 'text-white'
                    }`}>
                      {node.name}
                    </span>
                  </div>

                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                    isJit && !isSpliceComplete
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : isCandidate
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-cyan-950 text-cyan-400 border border-cyan-800/40'
                  }`}>
                    {node.tag}
                  </span>
                </div>

                {/* Subtitle / Role */}
                <div className="text-[10px] text-slate-400 font-mono mb-2 line-clamp-1">
                  {node.role}
                </div>

                {/* Metrics Breakdown */}
                <div className="space-y-1.5 pt-1.5 border-t border-slate-800/80 font-mono text-[11px]">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-500">Latency:</span>
                    <span className={`font-bold ${
                      node.latency > 10 ? 'text-amber-400 animate-pulse' : 'text-cyan-300'
                    }`}>
                      {node.latency} ms
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-500">Throughput:</span>
                    <span className="text-slate-200">{node.throughput}</span>
                  </div>

                  {/* Load Bar */}
                  <div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 mb-0.5">
                      <span>Exec Load</span>
                      <span className={node.load > 85 ? 'text-amber-400 font-bold' : 'text-cyan-400'}>
                        {node.load}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          node.load > 85
                            ? 'bg-gradient-to-r from-amber-500 to-red-500'
                            : isCandidate
                            ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                        }`}
                        style={{ width: `${node.load}%` }}
                      />
                    </div>
                  </div>

                  {/* Fitness Badge for Candidate */}
                  {node.fitness && (
                    <div className="mt-1 pt-1 border-t border-emerald-900/40 flex justify-between items-center text-[10px]">
                      <span className="text-emerald-400/80 font-semibold">AST Fitness:</span>
                      <span className="text-emerald-300 font-bold bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-500/40">
                        {node.fitness}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Hot-Splice Quick Button if Candidate */}
                {isCandidate && !isSpliceComplete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onHotSplice();
                    }}
                    className="mt-2 w-full py-1 text-[10px] font-mono font-bold rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center justify-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.4)] cursor-pointer"
                  >
                    <Zap className="w-3 h-3 fill-current" />
                    <span>HOT-SPLICE INTO PROD</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Explanatory Overlay Banner at bottom of graph */}
        <div className="absolute bottom-3 left-4 right-4 z-10 pointer-events-none">
          <div className="p-2.5 rounded-lg bg-[#060b17]/85 border border-cyan-900/40 backdrop-blur-md flex items-center justify-between gap-4 text-xs font-mono text-slate-300 pointer-events-auto">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong className="text-amber-300 font-semibold">Autonomous Mitosis: </strong>
                <span className="text-slate-300">
                  JIT_Cache detected execution bottleneck (18.7ms) and budded shadow node{' '}
                  <span className="text-emerald-300 font-bold">Candidate_AST_v3 [Fitness: 99.4%]</span>{' '}
                  inside an isolated sandbox for live-fire evaluation.
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-slate-400">Click any node to inspect telemetry</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
