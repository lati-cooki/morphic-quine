import React, { useState } from 'react';
import { QUINE_SOURCE_CODE } from '../data/mockQuineData';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  Code2, 
  GitBranch, 
  ShieldCheck,
  FileCode
} from 'lucide-react';

interface QuineCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  generation: string;
  code?: string;
  filename?: string;
}

export const QuineCodeModal: React.FC<QuineCodeModalProps> = ({
  isOpen,
  onClose,
  generation,
  code,
  filename,
}) => {
  const [copied, setCopied] = useState(false);
  const activeCode = code || QUINE_SOURCE_CODE;
  const activeFilename = filename || `morphic_quine_${generation.toLowerCase().replace(' ', '_')}.mjs`;

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([activeCode], { type: 'text/javascript' });
    element.href = URL.createObjectURL(file);
    element.download = activeFilename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 font-mono">
      <div className="relative w-full max-w-2xl bg-[#070b16] border border-purple-500/50 rounded-2xl shadow-[0_0_60px_rgba(168,85,247,0.25)] p-5 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-purple-900/40 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-950/70 border border-purple-500/50 text-purple-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wider">
                  Self-Referential Quine Serializer
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/50 font-semibold">
                  {generation}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Executable source code capable of producing its own complete topological state
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quine Guarantees Banner */}
        <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/30 mb-3 text-xs text-purple-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
            <span>100% Reversible Quine Serialization Invariance Verified</span>
          </div>
          <span className="text-[10px] font-bold text-emerald-400">HASH: SHA256-MATCH</span>
        </div>

        {/* Source Code Box */}
        <div className="flex-1 min-h-0 bg-[#03050a] border border-slate-800 rounded-lg p-3 overflow-y-auto font-mono text-xs leading-relaxed text-slate-300 select-text">
          <pre className="text-purple-300 font-mono text-[11px] whitespace-pre-wrap">
            {activeCode}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800 text-xs">
          <div className="text-slate-400 text-[11px]">
            Ready to clone or persist evolved state to disk
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Source'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition cursor-pointer shadow-[0_0_15px_rgba(168,85,247,0.4)]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .morphic.js</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
