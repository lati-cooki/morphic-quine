import { useState } from 'react';
import { X, Copy, Check, Download, FileCode } from 'lucide-react';
import type { Snapshot } from '../hooks/useMorphicEngine';

export function SnapshotModal({ snapshot, onClose }: { snapshot: Snapshot | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!snapshot) return null;
  const copy = () => { navigator.clipboard.writeText(snapshot.code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([snapshot.code], { type: 'text/javascript' }));
    a.download = snapshot.filename; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-mono" onClick={onClose}>
      <div className="relative w-full max-w-3xl bg-[#070b16] border border-purple-500/50 rounded-2xl shadow-2xl p-5 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between pb-3 border-b border-purple-900/40 mb-3">
          <div className="flex items-center gap-2.5">
            <FileCode className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-base font-bold text-white tracking-wider">{snapshot.filename}</h3>
              <p className="text-xs text-slate-400">written to ./snapshots/ · runnable with <span className="text-slate-300">node {snapshot.filename} '{'{"data":"hi"}'}'</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 bg-[#03050a] border border-slate-800 rounded-lg overflow-auto">
          <pre className="p-3 text-purple-200/90 text-[11px] leading-relaxed whitespace-pre">{snapshot.code}</pre>
        </div>
        <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-slate-800 text-xs">
          <button onClick={copy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer">{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'copied' : 'copy'}</button>
          <button onClick={download} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold cursor-pointer"><Download className="w-3.5 h-3.5" /> download</button>
        </div>
      </div>
    </div>
  );
}
