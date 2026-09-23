import React from 'react';
import { VitalsData } from '../types';
import { 
  Activity, 
  AlertTriangle, 
  Gauge, 
  Trash2, 
  Waves, 
  ShieldAlert, 
  TrendingUp, 
  Flame,
  Zap
} from 'lucide-react';

interface HomeostaticVitalsProps {
  vitals: VitalsData;
  onInjectPressure: () => void;
  onTriggerPainReflex: () => void;
  isSpliceComplete: boolean;
}

export const HomeostaticVitals: React.FC<HomeostaticVitalsProps> = ({
  vitals,
  onInjectPressure,
  onTriggerPainReflex,
  isSpliceComplete,
}) => {
  // SVG Radial Gauge Helper
  const renderRadialGauge = (value: number, label: string, color: string, unit: string = '%') => {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (value / 100) * circumference;

    return (
      <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 relative">
        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="text-slate-800"
            strokeWidth="7"
            stroke="currentColor"
            fill="transparent"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={color}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        <div className="absolute flex flex-col items-center">
          <span className="text-xl font-bold font-mono tracking-tight text-white">
            {value}
            <span className="text-xs font-normal text-slate-400">{unit}</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{label}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full lg:w-80 flex flex-col gap-3.5 bg-[#060a16]/90 border border-cyan-950/60 rounded-xl p-3.5 backdrop-blur-md shadow-xl">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-cyan-900/30">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-bold font-mono tracking-widest uppercase text-cyan-300">
            Homeostatic Vitals
          </h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/40">
          NERVOUS SYSTEM
        </span>
      </div>

      {/* Dual Radial Gauges: Metabolic Strain & Memory Entropy */}
      <div>
        <div className="text-[11px] font-mono text-slate-400 mb-2 flex items-center justify-between">
          <span className="uppercase tracking-wider font-semibold text-slate-300">Core Biometrics</span>
          <span className={vitals.metabolicStrain > 70 ? 'text-amber-400 font-bold' : 'text-cyan-400'}>
            {vitals.metabolicStrain > 70 ? 'CRITICAL METABOLISM' : 'STABLE METABOLISM'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {renderRadialGauge(
            vitals.metabolicStrain,
            'Metabolic Strain',
            vitals.metabolicStrain > 70 ? '#f59e0b' : '#06b6d4'
          )}
          {renderRadialGauge(
            vitals.memoryEntropy,
            'Memory Entropy',
            vitals.memoryEntropy > 75 ? '#ec4899' : '#38bdf8'
          )}
        </div>
      </div>

      {/* Sub-Metrics: GC Churn, Execution Volatility, Leak Probability */}
      <div className="space-y-2 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Trash2 className="w-3.5 h-3.5 text-amber-400" />
            <span>GC Churn Rate:</span>
          </div>
          <span className="font-bold text-amber-300">{vitals.gcChurnRate} MB/s</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Waves className="w-3.5 h-3.5 text-cyan-400" />
            <span>Execution Volatility:</span>
          </div>
          <span className="font-bold text-cyan-300">±{vitals.executionVolatility}%</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>Memory Leak Probability:</span>
          </div>
          <span className="font-bold text-emerald-300">{vitals.leakProbability}% (Compensated)</span>
        </div>
      </div>

      {/* Latency Heatmap & Outliers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              Latency Heatmap
            </span>
          </div>
          <span className="text-[10px] font-mono text-amber-400">
            {vitals.painReflexActive ? 'RIGHT CLUSTER DETECTED' : 'BALANCED'}
          </span>
        </div>

        {/* 2D Heatmap Matrix Cells */}
        <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
          <div className="text-[9px] font-mono text-slate-500 mb-1 flex justify-between">
            <span>LOW LATENCY (&lt;1ms)</span>
            <span className="text-amber-400 font-semibold">OUTLIERS (&gt;50ms)</span>
          </div>

          <div className="grid grid-cols-7 gap-1 h-14 items-end">
            {vitals.latencyHistogram.map((item, index) => {
              const heightPct = Math.min(100, Math.max(12, item.value));
              return (
                <div key={index} className="flex flex-col items-center h-full justify-end group relative">
                  {/* Tooltip */}
                  <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-slate-900 border border-slate-700 text-[9px] font-mono px-1 rounded whitespace-nowrap z-30 text-white">
                    {item.range}: {item.value} reqs
                  </div>

                  <div
                    className={`w-full rounded-t transition-all duration-500 ${
                      item.isRightCluster
                        ? 'bg-gradient-to-t from-amber-600 via-amber-500 to-red-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                        : 'bg-gradient-to-t from-cyan-900 to-cyan-500 opacity-80'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[8px] font-mono text-slate-400 mt-1 truncate w-full text-center">
                    {item.range}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pain Reflex Alert Box */}
      <div className={`p-3 rounded-lg border transition-all ${
        vitals.painReflexActive && !isSpliceComplete
          ? 'bg-amber-950/30 border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
          : 'bg-slate-950/40 border-slate-800/60 text-slate-400'
      }`}>
        <div className="flex items-start gap-2">
          <ShieldAlert className={`w-4 h-4 shrink-0 mt-0.5 ${
            vitals.painReflexActive && !isSpliceComplete ? 'text-amber-400 animate-pulse' : 'text-slate-500'
          }`} />
          <div className="font-mono text-xs">
            <div className={`font-bold uppercase tracking-wider ${
              vitals.painReflexActive && !isSpliceComplete ? 'text-amber-300' : 'text-slate-400'
            }`}>
              Pain Reflex Engine
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
              {vitals.painReflexActive && !isSpliceComplete
                ? 'High-tail latency outliers triggered autonomic pain response. Mutation engine invoked to synthesize candidate AST.'
                : 'Vitals homeostatic. Latency profile normalized under new AST vector dispatch.'}
            </p>
          </div>
        </div>

        {/* Interactive Load Injection / Test Trigger */}
        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
          <button
            onClick={onTriggerPainReflex}
            className="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition cursor-pointer flex items-center justify-center gap-1"
          >
            <Flame className="w-3 h-3 text-amber-400" />
            <span>Spike Outliers</span>
          </button>

          <button
            onClick={onInjectPressure}
            className="flex-1 py-1 px-2 text-[10px] font-mono rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition cursor-pointer flex items-center justify-center gap-1"
          >
            <Zap className="w-3 h-3 text-cyan-400" />
            <span>Pulse Churn</span>
          </button>
        </div>
      </div>
    </div>
  );
};
