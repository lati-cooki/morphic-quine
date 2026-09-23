import React, { useRef, useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Camera, 
  Sparkles, 
  Check, 
  Maximize2, 
  Layers, 
  ShieldCheck,
  Cpu,
  Flame,
  Activity,
  Terminal,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { GraphNode, VitalsData, AstDiffSnippet, ReflectionLog, QuineStatus } from '../types';

interface HighResModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: GraphNode[];
  vitals: VitalsData;
  astDiff: AstDiffSnippet;
  logs: ReflectionLog[];
  quineStatus: QuineStatus;
  isSpliceComplete: boolean;
}

export const HighResModal: React.FC<HighResModalProps> = ({
  isOpen,
  onClose,
  nodes,
  vitals,
  astDiff,
  logs,
  quineStatus,
  isSpliceComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Generate 4K Ultra High-Resolution Image on an HTML5 Canvas
  useEffect(() => {
    if (!isOpen) return;

    setIsGenerating(true);
    const canvas = document.createElement('canvas');
    // 4K Ultra HD dimensions: 3840 x 2160
    const W = 3840;
    const H = 2160;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setIsGenerating(false);
      return;
    }

    // 1. Deep Space Cybernetic Background
    ctx.fillStyle = '#03060d';
    ctx.fillRect(0, 0, W, H);

    // 2. Subtle HUD Hex / Grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.lineWidth = 2;
    const gridSize = 80;
    for (let x = 0; x < W; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // 3. Top Header Bar (HUD Title & Status)
    ctx.fillStyle = 'rgba(7, 11, 20, 0.95)';
    ctx.fillRect(60, 60, W - 120, 140);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(60, 60, W - 120, 140);

    // Title text
    ctx.font = 'bold 52px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MORPHIC QUINE HUD', 110, 145);

    ctx.font = '32px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('// AUTONOMOUS MUTATIVE RUNTIME v14.8', 680, 145);

    // Status Pill
    ctx.fillStyle = isSpliceComplete ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)';
    ctx.fillRect(W - 740, 95, 620, 70);
    ctx.strokeStyle = isSpliceComplete ? '#10b981' : '#f59e0b';
    ctx.lineWidth = 3;
    ctx.strokeRect(W - 740, 95, 620, 70);

    ctx.font = 'bold 28px "JetBrains Mono", monospace';
    ctx.fillStyle = isSpliceComplete ? '#34d399' : '#fbbf24';
    ctx.fillText(
      isSpliceComplete ? 'STATUS: AST HOT-SPLICED (GEN 15.0)' : 'STATUS: AUTONOMOUS MITOSIS IN PROGRESS',
      W - 710,
      140
    );

    // 4. Layout Columns
    // Left: Vitals (60 to 960)
    // Center: Living Graph (1000 to 2760)
    // Right: Cortical Feed (2800 to W - 60)
    // Bottom: Quine Bar (60 to W - 60, H - 240 to H - 60)

    const topY = 240;
    const mainH = H - topY - 220;

    // --- LEFT PANEL: Homeostatic Vitals (The Nervous System) ---
    const leftX = 60;
    const leftW = 880;
    ctx.fillStyle = 'rgba(6, 10, 22, 0.9)';
    ctx.fillRect(leftX, topY, leftW, mainH);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(leftX, topY, leftW, mainH);

    // Left Panel Title
    ctx.font = 'bold 36px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('HOMEOSTATIC VITALS [NERVOUS SYSTEM]', leftX + 40, topY + 70);

    // Metabolic Strain & Memory Entropy Gauges
    // Metabolic Strain Dial
    const drawDial = (cx: number, cy: number, r: number, val: number, label: string, color: string) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.8)';
      ctx.lineWidth = 26;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (val / 100)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.font = 'bold 44px "JetBrains Mono", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`${val}%`, cx, cy + 12);

      ctx.font = '24px "JetBrains Mono", monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(label, cx, cy + 65);
      ctx.textAlign = 'left';
    };

    drawDial(leftX + 230, topY + 230, 110, vitals.metabolicStrain, 'Metabolic Strain', '#f59e0b');
    drawDial(leftX + 650, topY + 230, 110, vitals.memoryEntropy, 'Memory Entropy', '#ec4899');

    // Churn and leak stats
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(leftX + 40, topY + 410, leftW - 80, 220);
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
    ctx.strokeRect(leftX + 40, topY + 410, leftW - 80, 220);

    ctx.font = '28px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('GC Churn Rate:', leftX + 70, topY + 480);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`${vitals.gcChurnRate} MB/s`, leftX + 540, topY + 480);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Execution Volatility:', leftX + 70, topY + 540);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`±${vitals.executionVolatility}%`, leftX + 540, topY + 540);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Memory Leak Probability:', leftX + 70, topY + 600);
    ctx.fillStyle = '#34d399';
    ctx.fillText(`${vitals.leakProbability}% (Compensated)`, leftX + 540, topY + 600);

    // Latency Heatmap Title
    ctx.font = 'bold 32px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('LATENCY HEATMAP // OUTLIER CLUSTER', leftX + 40, topY + 700);

    // Draw Latency Histogram Bars
    const histX = leftX + 40;
    const histY = topY + 740;
    const histW = leftW - 80;
    const histH = 340;
    ctx.fillStyle = 'rgba(10, 15, 30, 0.9)';
    ctx.fillRect(histX, histY, histW, histH);

    const barW = (histW - 60) / vitals.latencyHistogram.length;
    vitals.latencyHistogram.forEach((bar, idx) => {
      const bx = histX + 30 + idx * barW;
      const bh = (bar.value / 100) * 240;
      const by = histY + histH - bh - 50;

      ctx.fillStyle = bar.isRightCluster ? '#ef4444' : '#06b6d4';
      ctx.fillRect(bx + 10, by, barW - 20, bh);

      ctx.font = '20px "JetBrains Mono", monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(bar.range, bx + 12, histY + histH - 18);
    });

    // Pain Reflex Warning Box
    ctx.fillStyle = 'rgba(153, 27, 27, 0.25)';
    ctx.fillRect(leftX + 40, topY + 1130, leftW - 80, 240);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(leftX + 40, topY + 1130, leftW - 80, 240);

    ctx.font = 'bold 30px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f87171';
    ctx.fillText('⚠ PAIN REFLEX ACTIVE', leftX + 70, topY + 1190);

    ctx.font = '22px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('Latency consistently clusters on right (>50ms).', leftX + 70, topY + 1240);
    ctx.fillText('Pain reflexes triggered in mutation engine to prune', leftX + 70, topY + 1280);
    ctx.fillText('degraded scalar loops and hot-swap candidate AST.', leftX + 70, topY + 1320);

    // --- CENTER PANEL: The Living Computational Graph (Mitosis in Action) ---
    const centerX = 980;
    const centerW = 1840;
    ctx.fillStyle = 'rgba(4, 7, 17, 0.95)';
    ctx.fillRect(centerX, topY, centerW, mainH);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(centerX, topY, centerW, mainH);

    // Title banner
    ctx.font = 'bold 36px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('THE LIVING COMPUTATIONAL GRAPH // MITOSIS IN ACTION', centerX + 40, topY + 70);

    // Isolated Sandbox Field around Candidate_AST_v3
    const sandX = centerX + 1120;
    const sandY = topY + 280;
    const sandW = 660;
    const sandH = 680;
    ctx.fillStyle = 'rgba(6, 78, 59, 0.2)';
    ctx.fillRect(sandX, sandY, sandW, sandH);
    ctx.setLineDash([20, 10]);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    ctx.strokeRect(sandX, sandY, sandW, sandH);
    ctx.setLineDash([]);

    ctx.font = 'bold 24px "JetBrains Mono", monospace';
    ctx.fillStyle = '#34d399';
    ctx.fillText('ISOLATED SANDBOX CONTAINMENT [LIVE-FIRE TEST]', sandX + 30, sandY + 50);

    // Synapse coordinates map
    const nodeCoords: Record<string, { x: number; y: number }> = {
      stream_ingest: { x: centerX + 420, y: topY + 380 },
      vector_core: { x: centerX + 460, y: topY + 1040 },
      jit_cache: { x: centerX + 1040, y: topY + 620 },
      candidate_ast: { x: centerX + 1440, y: topY + 560 },
      async_buffer: { x: centerX + 960, y: topY + 1180 },
    };

    // Draw Synapses
    const drawSynapse = (fromKey: string, toKey: string, isMitotic: boolean = false) => {
      const p1 = nodeCoords[fromKey];
      const p2 = nodeCoords[toKey];
      if (!p1 || !p2) return;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = isMitotic ? 'rgba(245, 158, 11, 0.9)' : 'rgba(6, 182, 212, 0.5)';
      ctx.lineWidth = isMitotic ? 7 : 4;
      if (isMitotic) ctx.setLineDash([16, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glow particles along synapse
      for (let f = 0.2; f <= 0.8; f += 0.2) {
        const px = p1.x + (p2.x - p1.x) * f;
        const py = p1.y + (p2.y - p1.y) * f;
        ctx.beginPath();
        ctx.arc(px, py, isMitotic ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = isMitotic ? '#fbbf24' : '#38bdf8';
        ctx.fill();
      }
    };

    drawSynapse('stream_ingest', 'vector_core');
    drawSynapse('stream_ingest', 'jit_cache');
    drawSynapse('vector_core', 'async_buffer');
    drawSynapse('jit_cache', 'async_buffer');
    drawSynapse('jit_cache', 'candidate_ast', true); // Mitosis Bridge!

    // Draw Graph Nodes
    const drawNodeBox = (
      id: string,
      name: string,
      role: string,
      tag: string,
      load: number,
      lat: number,
      tp: string,
      isAmber: boolean = false,
      isGreen: boolean = false,
      fitness?: number
    ) => {
      const coord = nodeCoords[id];
      if (!coord) return;
      const nw = 420;
      const nh = 260;
      const nx = coord.x - nw / 2;
      const ny = coord.y - nh / 2;

      // Glow backdrop
      if (isAmber) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.fillRect(nx - 20, ny - 20, nw + 40, nh + 40);
      } else if (isGreen) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.fillRect(nx - 20, ny - 20, nw + 40, nh + 40);
      }

      ctx.fillStyle = isAmber ? 'rgba(21, 14, 5, 0.96)' : isGreen ? 'rgba(5, 20, 16, 0.96)' : 'rgba(7, 12, 24, 0.95)';
      ctx.fillRect(nx, ny, nw, nh);
      ctx.strokeStyle = isAmber ? '#f59e0b' : isGreen ? '#10b981' : '#0ea5e9';
      ctx.lineWidth = isAmber ? 6 : 3;
      ctx.strokeRect(nx, ny, nw, nh);

      // Node Name & Tag
      ctx.font = 'bold 30px "JetBrains Mono", monospace';
      ctx.fillStyle = isAmber ? '#fbbf24' : isGreen ? '#34d399' : '#ffffff';
      ctx.fillText(name, nx + 25, ny + 50);

      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.fillStyle = isAmber ? '#f59e0b' : isGreen ? '#10b981' : '#38bdf8';
      ctx.fillText(tag, nx + 25, ny + 85);

      ctx.font = '20px "JetBrains Mono", monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Latency: ${lat} ms`, nx + 25, ny + 130);
      ctx.fillText(`Throughput: ${tp}`, nx + 25, ny + 165);
      ctx.fillText(`Exec Load: ${load}%`, nx + 25, ny + 200);

      if (fitness) {
        ctx.font = 'bold 22px "JetBrains Mono", monospace';
        ctx.fillStyle = '#34d399';
        ctx.fillText(`Candidate Fitness: ${fitness}%`, nx + 25, ny + 235);
      }
    };

    drawNodeBox('stream_ingest', 'StreamIngest', 'Zero-Copy Ingestion', 'I/O GATEWAY', 48, 0.6, '94.2 GB/s');
    drawNodeBox('vector_core', 'VectorCore', 'AVX-512 SIMD Mesh', 'COMPUTE MESH', 82, 1.4, '168.5 GB/s');
    drawNodeBox('jit_cache', 'JIT_Cache', 'Polymorphic Cache', 'GLOWING AMBER // BOTTLENECK MITOSIS', 96, 18.7, '42.1 GB/s', true);
    drawNodeBox('candidate_ast', 'Candidate_AST_v3', 'Shadow Sandbox Node', 'LIVE-FIRE EVALUATION', 18, 0.9, '310.8 GB/s', false, true, 99.4);
    drawNodeBox('async_buffer', 'AsyncBuffer', 'Ring Buffer', 'QUORUM RING', 39, 0.8, '124.0 GB/s');

    // Bottom graph explanation callout
    ctx.fillStyle = 'rgba(7, 11, 20, 0.9)';
    ctx.fillRect(centerX + 40, topY + mainH - 120, centerW - 80, 80);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(centerX + 40, topY + mainH - 120, centerW - 80, 80);

    ctx.font = 'bold 22px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('Notice JIT_Cache glowing amber:', centerX + 70, topY + mainH - 72);
    ctx.font = '22px "JetBrains Mono", monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Detected execution bottleneck under load (18.7ms) and budded shadow candidate Candidate_AST_v3 [Fitness: 99.4%].', centerX + 480, topY + mainH - 72);

    // --- RIGHT PANEL: Cortical Mutation Feed ---
    const rightX = 2860;
    const rightW = W - rightX - 60;
    ctx.fillStyle = 'rgba(6, 10, 22, 0.9)';
    ctx.fillRect(rightX, topY, rightW, mainH);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(rightX, topY, rightW, mainH);

    // Title
    ctx.font = 'bold 36px "JetBrains Mono", monospace';
    ctx.fillStyle = '#c084fc';
    ctx.fillText('CORTICAL MUTATION FEED', rightX + 40, topY + 70);

    // Live AST Diff Header
    ctx.font = 'bold 28px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('LIVE AST DIFF (Synthesized in RAM)', rightX + 40, topY + 140);

    ctx.font = '22px "JetBrains Mono", monospace';
    ctx.fillStyle = '#a855f7';
    ctx.fillText(`Strategy: ${astDiff.strategy}`, rightX + 40, topY + 180);

    // AST Diff Box
    const diffBoxY = topY + 220;
    const diffBoxH = 680;
    ctx.fillStyle = '#03050a';
    ctx.fillRect(rightX + 40, diffBoxY, rightW - 80, diffBoxH);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(rightX + 40, diffBoxY, rightW - 80, diffBoxH);

    ctx.font = '20px "JetBrains Mono", monospace';
    astDiff.changes.forEach((ch, idx) => {
      const lineY = diffBoxY + 50 + idx * 46;
      if (ch.type === 'add') {
        ctx.fillStyle = 'rgba(6, 78, 59, 0.4)';
        ctx.fillRect(rightX + 45, lineY - 28, rightW - 90, 40);
        ctx.fillStyle = '#34d399';
      } else if (ch.type === 'remove') {
        ctx.fillStyle = 'rgba(153, 27, 27, 0.3)';
        ctx.fillRect(rightX + 45, lineY - 28, rightW - 90, 40);
        ctx.fillStyle = '#f87171';
      } else {
        ctx.fillStyle = '#94a3b8';
      }
      ctx.fillText(`${ch.line.toString().padStart(2, ' ')}  ${ch.text}`, rightX + 60, lineY);
    });

    // Self Reflection Log Title
    const logTitleY = diffBoxY + diffBoxH + 60;
    ctx.font = 'bold 28px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SELF-REFLECTION LOG (Cognitive Monologue)', rightX + 40, logTitleY);

    // Reflection monologue entries
    const logBoxY = logTitleY + 30;
    const logBoxH = mainH - (logBoxY - topY) - 40;
    ctx.fillStyle = '#03050a';
    ctx.fillRect(rightX + 40, logBoxY, rightW - 80, logBoxH);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(rightX + 40, logBoxY, rightW - 80, logBoxH);

    logs.forEach((item, idx) => {
      const lY = logBoxY + 50 + idx * 75;
      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.fillStyle = item.level === 'THOUGHT' ? '#c084fc' : item.level === 'MITOSIS' ? '#fbbf24' : '#38bdf8';
      ctx.fillText(`[${item.level}]  ${item.time}`, rightX + 65, lY);

      ctx.font = '19px "JetBrains Mono", monospace';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`“${item.message}”`, rightX + 65, lY + 30);
    });

    // --- BOTTOM BAR: Generation & Quine Integrity ---
    const botY = H - 160;
    const botH = 100;
    ctx.fillStyle = 'rgba(7, 11, 20, 0.98)';
    ctx.fillRect(60, botY, W - 120, botH);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(60, botY, W - 120, botH);

    ctx.font = 'bold 36px "JetBrains Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`EVOLUTIONARY LINEAGE: ${isSpliceComplete ? 'Gen 15.0' : quineStatus.generation}`, 110, botY + 62);

    ctx.font = 'bold 26px "JetBrains Mono", monospace';
    ctx.fillStyle = '#34d399';
    ctx.fillText('QUINE SERIALIZER: READY TO CLONE OR PERSIST EVOLVED STATE TO DISK AT ANY MOMENT', 960, botY + 62);

    ctx.font = '22px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`CHECKSUM: ${quineStatus.stateChecksum}  |  INTEGRITY: ${quineStatus.integrityScore}%`, W - 1050, botY + 62);

    // Export Data URL
    try {
      const dataUrl = canvas.toDataURL('image/png');
      setRenderedImageUrl(dataUrl);
    } catch (e) {
      console.error('Failed to export canvas to dataUrl', e);
    } finally {
      setIsGenerating(false);
    }
  }, [isOpen, nodes, vitals, astDiff, logs, quineStatus, isSpliceComplete]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!renderedImageUrl) return;
    const a = document.createElement('a');
    a.href = renderedImageUrl;
    a.download = `morphic_quine_hud_prototype_4k_${quineStatus.generation.toLowerCase().replace(' ', '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200 font-mono">
      <div className="relative w-full max-w-7xl h-[92vh] bg-[#050814] border border-cyan-500/50 rounded-2xl shadow-[0_0_80px_rgba(6,182,212,0.3)] flex flex-col overflow-hidden">
        {/* Modal Top Controls Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-cyan-900/50 bg-[#070b18]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-500/40 text-cyan-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wider font-display uppercase">
                  Morphic Quine HUD — High-Resolution 4K Prototype Asset
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
                  3840 x 2160 UHD
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ultra-high-definition rendered prototype capture featuring the Living Graph, Mitosis, Vitals & Cortical Feed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
                className="p-1 hover:text-white text-slate-400 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-300 px-1 font-mono">{Math.round(zoomLevel * 100)}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(2.0, z + 0.2))}
                className="p-1 hover:text-white text-slate-400 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleDownload}
              disabled={isGenerating || !renderedImageUrl}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold transition cursor-pointer shadow-lg ${
                downloaded
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]'
              }`}
            >
              {downloaded ? <Check className="w-4 h-4 text-slate-950" /> : <Download className="w-4 h-4" />}
              <span>{downloaded ? 'Downloaded 4K PNG!' : 'Download High-Res 4K Image'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Close High-Res Viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* High-Resolution Image Canvas / Preview */}
        <div className="flex-1 bg-[#020408] overflow-auto flex items-center justify-center p-4 relative select-none">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-3 text-cyan-400">
              <Sparkles className="w-8 h-8 animate-spin" />
              <span className="text-sm font-mono tracking-wider">
                Synthesizing 4K UHD High-Resolution Prototype Canvas...
              </span>
            </div>
          ) : renderedImageUrl ? (
            <div 
              className="transition-transform duration-200 shadow-2xl rounded-lg overflow-hidden border border-cyan-900/60"
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
            >
              <img
                src={renderedImageUrl}
                alt="Morphic Quine HUD 4K Visual Prototype"
                className="max-w-none w-[1280px] lg:w-[1540px] xl:w-[1920px] h-auto object-contain rounded"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="text-slate-400 text-sm">Failed to generate high-res preview</div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-2.5 bg-[#070b18] border-t border-cyan-900/40 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>High-Resolution Morphic Quine HUD Prototype (4K Render 3840x2160 / 60 FPS Vector Spec)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-cyan-400">Gen 14.8 Mitotic Snapshot</span>
            <span>|</span>
            <span className="text-amber-400">Candidate_AST_v3 [99.4% Fitness]</span>
          </div>
        </div>
      </div>
    </div>
  );
};
