import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Play,
  SlidersHorizontal,
} from 'lucide-react';
import {
  countGridCombinations,
  DEFAULT_OPTIMIZER_GRID,
  DEFAULT_RSI_PAIR_OPTIONS,
  OptimizationObjective,
  OptimizationReport,
  OptimizerGridInput,
  RsiZonePair,
  runStrategyOptimization,
} from '../engine/strategyOptimizer';
import { Candle, StrategyConfig } from '../types/strategy';

interface StrategyOptimizerPanelProps {
  candles: Candle[] | null;
  periodLabel: string | null;
  config: StrategyConfig;
  isFetchingData: boolean;
  autoRunToken: number;
  onApplyConfig: (next: StrategyConfig, label: string) => void;
  onFetchAndOptimize: () => void;
}

const SL_OPTIONS = [10, 15, 20, 25, 30, 35];
const TARGET_OPTIONS = [30, 40, 50, 60, 80, 100, 120];
const MAX_TRADES_OPTIONS = [1, 2, 3, 4, 5];
const RSI_LEN_OPTIONS = [2, 3, 4];
const BUFFER_OPTIONS = [0, 0.5, 1, 2];

const OBJECTIVE_OPTIONS: Array<{
  value: OptimizationObjective;
  label: string;
  hint: string;
}> = [
  {
    value: 'CALMAR',
    label: 'Best Risk-Adjusted (P&L / Drawdown)',
    hint: 'Balances strong returns with controlled drawdown to avoid overfitting',
  },
  {
    value: 'NET_POINTS',
    label: 'Highest Total Net P&L',
    hint: 'Maximizes total NIFTY points captured across the period',
  },
  {
    value: 'PROFIT_FACTOR',
    label: 'Highest Profit Factor',
    hint: 'Maximizes gross profit divided by gross loss',
  },
  {
    value: 'ACCURACY',
    label: 'Highest Win Accuracy',
    hint: 'Maximizes decisive winning trade percentage (excl. cost exits)',
  },
];

function toggleNumber(list: number[], val: number): number[] {
  if (list.includes(val)) {
    return list.length > 1 ? list.filter((n) => n !== val) : list;
  }
  return [...list, val].sort((a, b) => a - b);
}

function toggleRsiPair(list: RsiZonePair[], target: RsiZonePair): RsiZonePair[] {
  const exists = list.some(
    (p) => p.buy === target.buy && p.sell === target.sell
  );
  if (exists) {
    return list.length > 1
      ? list.filter((p) => !(p.buy === target.buy && p.sell === target.sell))
      : list;
  }
  return [...list, target].sort((a, b) => a.buy - b.buy);
}

export const StrategyOptimizerPanel: React.FC<StrategyOptimizerPanelProps> = ({
  candles,
  periodLabel,
  config,
  isFetchingData,
  autoRunToken,
  onApplyConfig,
  onFetchAndOptimize,
}) => {
  const [grid, setGrid] = useState<OptimizerGridInput>(() => ({
    ...DEFAULT_OPTIMIZER_GRID,
    entryBufferValues: [config.entryBufferPoints],
  }));
  const [showGridEditor, setShowGridEditor] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [appliedRank, setAppliedRank] = useState<number | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const totalCombos = useMemo(() => countGridCombinations(grid), [grid]);

  const executeOptimization = async (activeCandles: Candle[]) => {
    if (activeCandles.length === 0 || totalCombos === 0) return;
    setRunning(true);
    setAppliedRank(null);
    setProgress({ done: 0, total: totalCombos });
    try {
      const result = await runStrategyOptimization(
        activeCandles,
        config,
        grid,
        (done, total) => setProgress({ done, total })
      );
      setReport(result);
    } finally {
      setRunning(false);
    }
  };

  // Trigger automatically when user clicks "Fetch & Find Best Settings" and fetch finishes
  useEffect(() => {
    if (autoRunToken > 0 && candles && candles.length > 0 && !running) {
      void executeOptimization(candles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunToken]);

  const handlePrimaryRun = () => {
    if (!candles || candles.length === 0) {
      onFetchAndOptimize();
      return;
    }
    void executeOptimization(candles);
  };

  const handleApplyCandidate = (candidateConfig: StrategyConfig, rank: number) => {
    setAppliedRank(rank);
    onApplyConfig(
      candidateConfig,
      `Applied Rank #${rank}: SL ${candidateConfig.stopLossPoints}pt · Target ${candidateConfig.targetPoints}pt · Max ${candidateConfig.maxTradesPerDay}/day · RSI(${candidateConfig.rsiLength}) <${candidateConfig.rsiBuyThreshold}/>${candidateConfig.rsiSellThreshold} · Buf ${candidateConfig.entryBufferPoints}pt`
    );
  };

  const handleCopySummary = async () => {
    if (!report || !report.bestCandidate) return;
    const best = report.bestCandidate;
    const cur = report.currentBaseline;
    const lines = [
      `NeoAlgo Optimization Summary (${periodLabel || 'Fyers Range'})`,
      `Objective: ${activeObjective?.label || report.objective} | Tested: ${report.testedCombinations} combinations`,
      `Current: SL ${cur.config.stopLossPoints} / Tgt ${cur.config.targetPoints} / Max ${cur.config.maxTradesPerDay}/day / RSI(${cur.config.rsiLength}) <${cur.config.rsiBuyThreshold}/>${cur.config.rsiSellThreshold} / Buf ${cur.config.entryBufferPoints} -> Net ${cur.netPoints >= 0 ? '+' : ''}${cur.netPoints.toFixed(1)} pts, Acc ${cur.accuracyExclBreakevenPct.toFixed(1)}%, PF ${cur.profitFactor.toFixed(2)}, DD -${cur.maxDrawdownPoints.toFixed(1)} pts`,
      `Best #1: SL ${best.config.stopLossPoints} / Tgt ${best.config.targetPoints} / Max ${best.config.maxTradesPerDay}/day / RSI(${best.config.rsiLength}) <${best.config.rsiBuyThreshold}/>${best.config.rsiSellThreshold} / Buf ${best.config.entryBufferPoints} -> Net ${best.netPoints >= 0 ? '+' : ''}${best.netPoints.toFixed(1)} pts (₹${Math.round(best.netRupees).toLocaleString('en-IN')}), Acc ${best.accuracyExclBreakevenPct.toFixed(1)}% (${best.wins}W/${best.losses}L/${best.breakevens}C), PF ${best.profitFactor.toFixed(2)}, DD -${best.maxDrawdownPoints.toFixed(1)} pts`,
      `Top 5:`,
      ...report.topCandidates.slice(0, 5).map(
        (c) =>
          `  #${c.rank}: SL ${c.config.stopLossPoints}/Tgt ${c.config.targetPoints}/Max ${c.config.maxTradesPerDay}/RSI(${c.config.rsiLength})<${c.config.rsiBuyThreshold}/>${c.config.rsiSellThreshold}/Buf ${c.config.entryBufferPoints} => ${c.netPoints >= 0 ? '+' : ''}${c.netPoints.toFixed(1)} pts, Acc ${c.accuracyExclBreakevenPct.toFixed(1)}%, PF ${c.profitFactor.toFixed(2)}, DD -${c.maxDrawdownPoints.toFixed(1)}`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // ignore
    }
  };

  const activeObjective = OBJECTIVE_OPTIONS.find(
    (o) => o.value === grid.objective
  );

  return (
    <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Parameter Optimizer &amp; Best Settings Finder
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sweeps Stop Loss, Target, Max Trades/Day, RSI length/zones, and Entry
            Buffer across your real Fyers candles (preserving 4-candle bias,
            trailing base candle, 1:1 cost trail, and stop-after-target rules).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={grid.objective}
            onChange={(e) =>
              setGrid((prev) => ({
                ...prev,
                objective: e.target.value as OptimizationObjective,
              }))
            }
            aria-label="Optimization ranking objective"
            className="px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {OBJECTIVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowGridEditor((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#1F293B] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Search Grid ({totalCombos})</span>
            {showGridEditor ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={handlePrimaryRun}
            disabled={running || isFetchingData || totalCombos === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {isFetchingData
                ? 'Fetching Fyers History...'
                : running
                ? `Testing ${progress.done}/${progress.total}...`
                : candles && candles.length > 0
                ? `Find Best Settings (${totalCombos})`
                : 'Fetch Range & Find Best Settings'}
            </span>
          </button>
        </div>
      </div>

      {/* Collapsible Search Grid Configuration */}
      {showGridEditor && (
        <div className="px-5 py-4 bg-slate-50/70 dark:bg-[#0E131D] border-b border-slate-200 dark:border-slate-800 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Stop Loss */}
            <div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Stop Loss Points
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SL_OPTIONS.map((val) => {
                  const active = grid.stopLossValues.includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setGrid((prev) => ({
                          ...prev,
                          stopLossValues: toggleNumber(prev.stopLossValues, val),
                        }))
                      }
                      className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161D2B] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1F293B]'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target */}
            <div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Target Points
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TARGET_OPTIONS.map((val) => {
                  const active = grid.targetValues.includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setGrid((prev) => ({
                          ...prev,
                          targetValues: toggleNumber(prev.targetValues, val),
                        }))
                      }
                      className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161D2B] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1F293B]'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Max Trades / Day */}
            <div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Max Trades Per Day
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MAX_TRADES_OPTIONS.map((val) => {
                  const active = grid.maxTradesValues.includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setGrid((prev) => ({
                          ...prev,
                          maxTradesValues: toggleNumber(
                            prev.maxTradesValues,
                            val
                          ),
                        }))
                      }
                      className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161D2B] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1F293B]'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RSI Length */}
            <div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                RSI Length
              </div>
              <div className="flex flex-wrap gap-1.5">
                {RSI_LEN_OPTIONS.map((val) => {
                  const active = grid.rsiLengths.includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setGrid((prev) => ({
                          ...prev,
                          rsiLengths: toggleNumber(prev.rsiLengths, val),
                        }))
                      }
                      className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161D2B] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1F293B]'
                      }`}
                    >
                      RSI({val})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RSI Buy / Sell Zones */}
            <div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                RSI Buy / Sell Zones
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_RSI_PAIR_OPTIONS.map((pair) => {
                  const active = grid.rsiPairs.some(
                    (p) => p.buy === pair.buy && p.sell === pair.sell
                  );
                  return (
                    <button
                      key={pair.label}
                      type="button"
                      onClick={() =>
                        setGrid((prev) => ({
                          ...prev,
                          rsiPairs: toggleRsiPair(prev.rsiPairs, pair),
                        }))
                      }
                      className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161D2B] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1F293B]'
                      }`}
                    >
                      {pair.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Entry Buffer */}
            <div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Entry Buffer Points
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BUFFER_OPTIONS.map((val) => {
                  const active = grid.entryBufferValues.includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setGrid((prev) => ({
                          ...prev,
                          entryBufferValues: toggleNumber(
                            prev.entryBufferValues,
                            val
                          ),
                        }))
                      }
                      className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                        active
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161D2B] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1F293B]'
                      }`}
                    >
                      {val} pt
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            <span>{activeObjective?.hint}</span>
            <span className="font-mono tabular-nums">
              {totalCombos} valid combinations (Target &gt; SL)
            </span>
          </div>
        </div>
      )}

      {/* Progress Bar while running */}
      {running && (
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0E131D] space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
            <span>
              Evaluating {progress.done} of {progress.total} strategy
              combinations...
            </span>
            <span className="font-mono tabular-nums font-semibold">
              {progress.total > 0
                ? Math.round((progress.done / progress.total) * 100)
                : 0}
              %
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-150"
              style={{
                width: `${
                  progress.total > 0
                    ? Math.round((progress.done / progress.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Results Area */}
      {!report && !running && (
        <div className="px-5 py-5 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center justify-between gap-3">
          <span>
            {candles && candles.length > 0
              ? `Ready to test ${totalCombos} combinations on ${periodLabel || 'loaded range'} (${candles.length.toLocaleString()} candles). Click Find Best Settings to rank optimal SL, Target, Max Trades/Day, and RSI settings.`
              : 'Click Fetch Range & Find Best Settings to pull real Fyers 5-minute history for your selected date range and automatically rank the highest-performing SL, Target, Max Trades/Day, and RSI settings.'}
          </span>
        </div>
      )}

      {report && !running && report.bestCandidate && (
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {/* Best Recommendation vs Current Settings */}
          <div className="px-5 py-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  Top Recommended Settings · Tested {report.testedCombinations}{' '}
                  combinations in {(report.durationMs / 1000).toFixed(2)}s
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ranked by{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {activeObjective?.label}
                  </strong>
                  {periodLabel ? ` on ${periodLabel}` : ''}. Top 15 results
                  verified with full canonical backtest engine.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopySummary()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#1F293B] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {copiedSummary ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>Summary Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy Summary</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyCandidate(report.bestCandidate!.config, 1)
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {appliedRank === 1 ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Best Settings Applied</span>
                    </>
                  ) : (
                    <span>Apply Best Settings to Strategy</span>
                  )}
                </button>
              </div>
            </div>

            {/* Side-by-side comparison grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Current Baseline */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50/50 dark:bg-[#0E131D] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Your Current Settings
                  </span>
                  <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                    1:
                    {(
                      report.currentBaseline.config.targetPoints /
                      Math.max(1, report.currentBaseline.config.stopLossPoints)
                    ).toFixed(1)}{' '}
                    RR
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">SL / Target</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.currentBaseline.config.stopLossPoints} /{' '}
                      {report.currentBaseline.config.targetPoints} pts
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Max Trades</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.currentBaseline.config.maxTradesPerDay} / day
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">RSI Zone</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      RSI({report.currentBaseline.config.rsiLength}) &lt;
                      {report.currentBaseline.config.rsiBuyThreshold}/&gt;
                      {report.currentBaseline.config.rsiSellThreshold}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Buffer</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.currentBaseline.config.entryBufferPoints} pts
                    </div>
                  </div>
                </div>
                <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Net P&amp;L</div>
                    <div
                      className={`font-mono tabular-nums font-bold mt-0.5 ${
                        report.currentBaseline.netPoints >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {report.currentBaseline.netPoints >= 0 ? '+' : ''}
                      {report.currentBaseline.netPoints.toFixed(1)} pts
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Accuracy</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.currentBaseline.accuracyExclBreakevenPct.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Profit Factor</div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.currentBaseline.profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Max DD</div>
                    <div className="font-mono tabular-nums font-semibold text-red-600 dark:text-red-400 mt-0.5">
                      -{report.currentBaseline.maxDrawdownPoints.toFixed(1)} pts
                    </div>
                  </div>
                </div>
              </div>

              {/* Best Found */}
              <div className="border-2 border-blue-600/30 dark:border-blue-500/40 rounded-lg p-4 bg-blue-50/20 dark:bg-blue-500/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                    Rank #1 Suggested Best Settings
                  </span>
                  <span className="font-mono tabular-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {report.bestCandidate.netPoints -
                      report.currentBaseline.netPoints >=
                    0
                      ? '+'
                      : ''}
                    {(
                      report.bestCandidate.netPoints -
                      report.currentBaseline.netPoints
                    ).toFixed(1)}{' '}
                    pts vs current
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">SL / Target</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.bestCandidate.config.stopLossPoints} /{' '}
                      {report.bestCandidate.config.targetPoints} pts
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Max Trades</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.bestCandidate.config.maxTradesPerDay} / day
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">RSI Zone</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      RSI({report.bestCandidate.config.rsiLength}) &lt;
                      {report.bestCandidate.config.rsiBuyThreshold}/&gt;
                      {report.bestCandidate.config.rsiSellThreshold}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Buffer</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.bestCandidate.config.entryBufferPoints} pts
                    </div>
                  </div>
                </div>
                <div className="pt-2.5 border-t border-blue-200/70 dark:border-blue-500/30 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Net P&amp;L</div>
                    <div
                      className={`font-mono tabular-nums font-bold mt-0.5 ${
                        report.bestCandidate.netPoints >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {report.bestCandidate.netPoints >= 0 ? '+' : ''}
                      {report.bestCandidate.netPoints.toFixed(1)} pts
                    </div>
                    <div className="font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400">
                      ₹
                      {Math.round(
                        report.bestCandidate.netRupees
                      ).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Accuracy</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.bestCandidate.accuracyExclBreakevenPct.toFixed(1)}%
                    </div>
                    <div className="font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400">
                      {report.bestCandidate.wins}W / {report.bestCandidate.losses}
                      L / {report.bestCandidate.breakevens}C
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Profit Factor</div>
                    <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.bestCandidate.profitFactor.toFixed(2)}
                    </div>
                    <div className="font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400">
                      Calmar {report.bestCandidate.calmarRatio.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Max DD</div>
                    <div className="font-mono tabular-nums font-bold text-red-600 dark:text-red-400 mt-0.5">
                      -{report.bestCandidate.maxDrawdownPoints.toFixed(1)} pts
                    </div>
                    <div className="font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400">
                      Exp{' '}
                      {report.bestCandidate.expectancyPoints >= 0 ? '+' : ''}
                      {report.bestCandidate.expectancyPoints.toFixed(1)} pt/tr
                    </div>
                  </div>
                </div>
                {report.walkForwardMidDate && (
                  <div className="pt-2 border-t border-blue-200/70 dark:border-blue-500/30 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                    <span className="text-slate-600 dark:text-slate-400 font-sans">
                      Walk-Forward Split (mid {report.walkForwardMidDate}):
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      H1{' '}
                      <strong
                        className={
                          report.bestCandidate.h1NetPoints >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {report.bestCandidate.h1NetPoints >= 0 ? '+' : ''}
                        {report.bestCandidate.h1NetPoints.toFixed(0)} pts
                      </strong>{' '}
                      · H2{' '}
                      <strong
                        className={
                          report.bestCandidate.h2NetPoints >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }
                      >
                        {report.bestCandidate.h2NetPoints >= 0 ? '+' : ''}
                        {report.bestCandidate.h2NetPoints.toFixed(0)} pts
                      </strong>{' '}
                      <span
                        className={`ml-1 font-sans font-semibold ${
                          report.bestCandidate.bothHalvesProfitable
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {report.bestCandidate.bothHalvesProfitable
                          ? '· Both halves profitable'
                          : '· Check H1/H2 balance'}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Parameter Stability / Sensitivity Breakdown */}
          <div className="px-5 py-4 bg-slate-50/40 dark:bg-[#0E131D]/70">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3">
              Parameter Robustness (Average Net Points Across All Tested
              Combinations)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'By Stop Loss', items: report.sensitivity.stopLoss },
                { title: 'By Target', items: report.sensitivity.target },
                {
                  title: 'By Max Trades / Day',
                  items: report.sensitivity.maxTrades,
                },
                { title: 'By RSI Zone', items: report.sensitivity.rsiZone },
              ].map((group) => (
                <div
                  key={group.title}
                  className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2"
                >
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    {group.title}
                  </div>
                  <div className="space-y-1.5">
                    {group.items.slice(0, 5).map((item, idx) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between text-[11px] gap-2"
                      >
                        <span
                          className={`font-mono ${
                            idx === 0
                              ? 'font-semibold text-slate-900 dark:text-slate-100'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {item.label}
                        </span>
                        <span
                          className={`font-mono tabular-nums font-medium ${
                            item.avgNetPoints >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {item.avgNetPoints >= 0 ? '+' : ''}
                          {item.avgNetPoints.toFixed(0)} avg
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top 15 Ranked Combinations Table */}
          <div>
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Top {report.topCandidates.length} Ranked Strategy Configurations
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Click Apply on any row to test it live &amp; update Neo Algo code
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E131D] text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">#</th>
                    <th className="py-2.5 px-3">SL / Tgt</th>
                    <th className="py-2.5 px-3">Max/Day</th>
                    <th className="py-2.5 px-3">RSI Setting</th>
                    <th className="py-2.5 px-3">Buf</th>
                    <th className="py-2.5 px-3 text-right">Trades</th>
                    <th className="py-2.5 px-3 text-right">W / L / C</th>
                    <th className="py-2.5 px-3 text-right">Accuracy</th>
                    <th className="py-2.5 px-3 text-right">Net Pts</th>
                    <th className="py-2.5 px-3 text-right">Net ₹</th>
                    <th className="py-2.5 px-3 text-right">PF</th>
                    <th className="py-2.5 px-3 text-right">Max DD</th>
                    {report.walkForwardMidDate && (
                      <th className="py-2.5 px-3 text-right">H1 / H2 Pts</th>
                    )}
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono tabular-nums">
                  {report.topCandidates.map((cand) => (
                    <tr
                      key={cand.rank}
                      className={
                        cand.rank === 1
                          ? 'bg-blue-50/30 dark:bg-blue-500/10 hover:bg-blue-50/50 dark:hover:bg-blue-500/15'
                          : 'hover:bg-slate-50/70 dark:hover:bg-[#161D2B]/60'
                      }
                    >
                      <td className="py-2.5 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        {cand.rank}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {cand.config.stopLossPoints} / {cand.config.targetPoints}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        {cand.config.maxTradesPerDay}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        RSI({cand.config.rsiLength}) &lt;
                        {cand.config.rsiBuyThreshold}/&gt;
                        {cand.config.rsiSellThreshold}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {cand.config.entryBufferPoints}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                        {cand.totalTrades}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <span className="text-emerald-700 dark:text-emerald-400">{cand.wins}</span>/
                        <span className="text-red-600 dark:text-red-400">{cand.losses}</span>/
                        <span className="text-amber-700 dark:text-amber-400">{cand.breakevens}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-900 dark:text-slate-100 font-medium">
                        {cand.accuracyExclBreakevenPct.toFixed(1)}%
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold whitespace-nowrap ${
                          cand.netPoints >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {cand.netPoints >= 0 ? '+' : ''}
                        {cand.netPoints.toFixed(1)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right whitespace-nowrap ${
                          cand.netRupees >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {cand.netRupees >= 0 ? '+' : '-'}₹
                        {Math.abs(Math.round(cand.netRupees)).toLocaleString(
                          'en-IN'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200">
                        {cand.profitFactor.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-red-600 dark:text-red-400">
                        -{cand.maxDrawdownPoints.toFixed(1)}
                      </td>
                      {report.walkForwardMidDate && (
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span
                            className={
                              cand.h1NetPoints >= 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {cand.h1NetPoints >= 0 ? '+' : ''}
                            {cand.h1NetPoints.toFixed(0)}
                          </span>
                          <span className="text-slate-400 dark:text-slate-600"> / </span>
                          <span
                            className={
                              cand.h2NetPoints >= 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {cand.h2NetPoints >= 0 ? '+' : ''}
                            {cand.h2NetPoints.toFixed(0)}
                          </span>
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-right font-sans">
                        <button
                          type="button"
                          onClick={() =>
                            handleApplyCandidate(cand.config, cand.rank)
                          }
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors cursor-pointer ${
                            appliedRank === cand.rank
                              ? 'border-emerald-600 dark:border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#161D2B] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1F293B]'
                          }`}
                        >
                          {appliedRank === cand.rank ? 'Applied' : 'Apply'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
