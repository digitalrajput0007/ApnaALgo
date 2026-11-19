import React, { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import {
  generatePythonNeoAlgo,
  generateTypeScriptNeoAlgo,
} from '../engine/codeGenerator';
import { StrategyConfig } from '../types/strategy';

interface NeoAlgoCodeViewProps {
  config: StrategyConfig;
  onDownloadPython: () => void;
}

export const NeoAlgoCodeView: React.FC<NeoAlgoCodeViewProps> = ({
  config,
  onDownloadPython,
}) => {
  const [lang, setLang] = useState<'python' | 'typescript'>('python');
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => {
    return lang === 'python'
      ? generatePythonNeoAlgo(config)
      : generateTypeScriptNeoAlgo(config);
  }, [lang, config]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownloadTs = () => {
    const blob = new Blob([code], { type: 'text/typescript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'neoNiftyStrategy.ts';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Fyers API v3 Neo Algo Strategy Module
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Drop-in strategy class synced with your live parameters. Pass your
            existing authenticated Fyers client instance into the constructor
            and forward WebSocket ticks to{' '}
            <code className="text-xs bg-slate-100 dark:bg-[#161D2B] px-1.5 py-0.5 rounded text-slate-800 dark:text-slate-200">
              on_tick()
            </code>
            .
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-[#161D2B] rounded-lg">
            <button
              type="button"
              onClick={() => setLang('python')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                lang === 'python'
                  ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Python · fyers-apiv3
            </button>
            <button
              type="button"
              onClick={() => setLang('typescript')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                lang === 'typescript'
                  ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              TypeScript · Node
            </button>
          </div>
        </div>
      </div>

      {/* Live Parameter Sync Strip */}
      <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
          <span>
            Timeframe:{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {config.timeframeMinutes}m
            </strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <span>
            Bias:{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {config.requiredMajority}/{config.setSize} Candles
            </strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <span>
            RSI({config.rsiLength}):{' '}
            <strong className="text-emerald-600 dark:text-emerald-400">
              &lt;{config.rsiBuyThreshold}
            </strong>{' '}
            /{' '}
            <strong className="text-red-600 dark:text-red-400">
              &gt;{config.rsiSellThreshold}
            </strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <span>
            SL/Target:{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {config.stopLossPoints} / {config.targetPoints} pts
            </strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <span>
            1:1 Trail:{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {config.trailToCostAtOneToOne ? 'Cost' : 'Off'}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy Code</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={lang === 'python' ? onDownloadPython : handleDownloadTs}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {lang === 'python' ? 'Download .py' : 'Download .ts'}
            </span>
          </button>
        </div>
      </div>

      {/* Code Display */}
      <div className="bg-[#080C14] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>
            {lang === 'python'
              ? 'neo_nifty_4candle_rsi2.py'
              : 'neoNiftyStrategy.ts'}
          </span>
          <span>paper_mode=True by default for safe dry-run</span>
        </div>
        <pre className="p-5 overflow-x-auto text-[12.5px] leading-relaxed font-mono text-slate-200 max-h-[640px]">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};
