import React, { useState } from 'react';
import {
  BookmarkCheck,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Link2,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Wallet,
} from 'lucide-react';
import {
  BiasEvaluationMode,
  InstrumentType,
  PerIndexStrategyMap,
  StrategyConfig,
} from '../types/strategy';
import { formatINR } from '../utils/formatters';
import {
  InstrumentMeta,
  OPTION_DELTA_PRESETS,
  RiskBasedLotCalculation,
} from '../utils/optionsEngine';

interface StrategyControlsProps {
  config: StrategyConfig;
  onChange: (next: StrategyConfig) => void;
  onResetDefaults: () => void;
  hasUnsavedChanges?: boolean;
  justSaved?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  instrumentMeta?: InstrumentMeta | null;
  loadingLotSize?: boolean;
  /** Per-index attached strategy support */
  activeSymbol?: string;
  isAttachedToActiveSymbol?: boolean;
  perIndexConfigs?: PerIndexStrategyMap;
  onAttachToSymbol?: (symbol: string, cfg: StrategyConfig) => void;
  onRemoveAttachedSymbol?: (symbol: string) => void;
  /** Paper Wallet & Risk Management lot sizing readout */
  lotCalculation?: RiskBasedLotCalculation | null;
  autoSizeLotsEnabled?: boolean;
  onOpenPaperWallet?: () => void;
  defaultCollapsed?: boolean;
}

export const StrategyControls: React.FC<StrategyControlsProps> = ({
  config,
  onChange,
  onResetDefaults,
  hasUnsavedChanges = false,
  justSaved = false,
  onSave,
  onDiscard,
  instrumentMeta = null,
  loadingLotSize = false,
  activeSymbol,
  isAttachedToActiveSymbol = false,
  perIndexConfigs = {},
  onAttachToSymbol,
  onRemoveAttachedSymbol,
  lotCalculation = null,
  autoSizeLotsEnabled = false,
  onOpenPaperWallet,
  defaultCollapsed = false,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const update = <K extends keyof StrategyConfig>(
    key: K,
    value: StrategyConfig[K]
  ) => {
    onChange({ ...config, [key]: value });
  };

  const isOptionBuying = config.instrumentType === 'NIFTY_ATM_OPT';
  const effectiveDelta = isOptionBuying
    ? config.optionDeltaEstimate || 0.5
    : 1;
  const optionSlPts = Math.round(config.stopLossPoints * effectiveDelta * 10) / 10;
  const optionTargetPts = Math.round(config.targetPoints * effectiveDelta * 10) / 10;
  const riskPerTradeRupees = Math.round(
    optionSlPts * config.lotSize * config.lots
  );
  const rewardPerTradeRupees = Math.round(
    optionTargetPts * config.lotSize * config.lots
  );
  const attachedSymbols = Object.keys(perIndexConfigs);
  const activeDisplayName =
    instrumentMeta?.displayName || activeSymbol || 'NIFTY 50';

  const inputCls =
    'w-full px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500';
  const labelCls =
    'block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1';

  return (
    <section
      aria-label="Strategy Parameters"
      className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden"
    >
      {/* Top Bar: Title, Attached Index Badge, Quick Actions & Collapse Toggle */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <SlidersHorizontal
              className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Strategy Configuration
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md bg-slate-100 dark:bg-[#161D2B] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {activeDisplayName}
              </span>
              {isAttachedToActiveSymbol ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                  <BookmarkCheck className="w-3 h-3" aria-hidden="true" />
                  <span>Attached Strategy</span>
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Global Default
                </span>
              )}
              {hasUnsavedChanges && (
                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  · Unsaved
                </span>
              )}
              {!hasUnsavedChanges && justSaved && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              {isOptionBuying
                ? `Options Buy Only (${effectiveDelta.toFixed(2)}Δ · BUY CE/PE)`
                : config.instrumentType}{' '}
              · SL {config.stopLossPoints}pt
              {isOptionBuying ? ` (${optionSlPts}pt Opt)` : ''} · Target{' '}
              {config.targetPoints}pt
              {isOptionBuying ? ` (${optionTargetPts}pt Opt)` : ''} ·{' '}
              {config.lots}L ({config.lots * config.lotSize} qty)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeSymbol && onAttachToSymbol && (
            <button
              type="button"
              onClick={() => onAttachToSymbol(activeSymbol, config)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Attach to {activeDisplayName}</span>
            </button>
          )}

          {onSave && hasUnsavedChanges && (
            <button
              type="button"
              onClick={onSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Save</span>
            </button>
          )}

          {onDiscard && hasUnsavedChanges && (
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Revert</span>
            </button>
          )}

          <button
            type="button"
            onClick={onResetDefaults}
            title="Reset strategy parameters to default Options Buy 0.50Δ configuration"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Defaults</span>
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#161D2B] hover:bg-slate-200/80 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            {collapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Configure</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Hide</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Vertical Stacked Configuration Body */}
      {!collapsed && (
        <div className="p-4 sm:p-5 space-y-5 divide-y divide-slate-100 dark:divide-slate-800/80">
          {/* SECTION 1: Options Buying Mode, 0.50Δ Delta & Smart Expiry */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                1. Execution Mode · Options Buy Only (CE / PE)
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Bullish → <span className="text-emerald-600 dark:text-emerald-400 font-semibold">BUY CE</span>{' '}
                · Bearish → <span className="text-red-600 dark:text-red-400 font-semibold">BUY PE</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Execution Instrument</label>
                <select
                  value={config.instrumentType}
                  onChange={(e) => {
                    const nextType = e.target.value as InstrumentType;
                    onChange({
                      ...config,
                      instrumentType: nextType,
                      optionDeltaEstimate:
                        nextType === 'NIFTY_ATM_OPT'
                          ? config.optionDeltaEstimate || 0.5
                          : config.optionDeltaEstimate,
                    });
                  }}
                  className={inputCls}
                >
                  <option value="NIFTY_ATM_OPT">
                    Options Buy Only (BUY CE / BUY PE)
                  </option>
                  <option value="NIFTY_FUT">Index Futures (Sim)</option>
                  <option value="NIFTY_SPOT_SIM">Spot Index (Sim)</option>
                </select>
              </div>

              {isOptionBuying && (
                <div>
                  <label className={labelCls}>
                    Option Delta (0.50Δ = Half SL)
                  </label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg">
                    {OPTION_DELTA_PRESETS.map((preset) => {
                      const active =
                        Math.abs(config.optionDeltaEstimate - preset.delta) < 0.05;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            update('optionDeltaEstimate', preset.delta)
                          }
                          className={`py-1.5 text-[11px] font-mono rounded-md transition-colors cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white font-semibold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                          }`}
                        >
                          {preset.delta.toFixed(2)}Δ
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isOptionBuying && (
                <div>
                  <label className={labelCls}>Expiry Selection</label>
                  <select
                    value={config.optionExpiryPreference || 'auto'}
                    onChange={(e) =>
                      update(
                        'optionExpiryPreference',
                        e.target.value as 'auto' | 'current' | 'next'
                      )
                    }
                    className={inputCls}
                  >
                    <option value="auto">
                      Auto (Roll to Next on Expiry Day)
                    </option>
                    <option value="current">Current Weekly / Monthly</option>
                    <option value="next">Next Expiry (Lower Gamma)</option>
                  </select>
                </div>
              )}

              <div>
                <label className={labelCls}>
                  Lot Size{' '}
                  {loadingLotSize ? (
                    <span className="text-blue-500">(fetching...)</span>
                  ) : instrumentMeta?.fnoEnabled ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      (Auto · {instrumentMeta.underlying})
                    </span>
                  ) : null}
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={config.lotSize}
                  onChange={(e) =>
                    update('lotSize', Math.max(1, Number(e.target.value) || 1))
                  }
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Risk Management, SL/Target & Position Sizing */}
          <div className="pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                2. Stop Loss, Target &amp; Risk-Based Lot Sizing
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
                <span className="text-red-600 dark:text-red-400 font-semibold">
                  Risk/Trade:{' '}
                  {formatINR(-riskPerTradeRupees, { signed: true, decimals: 0 })}
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Target:{' '}
                  {formatINR(rewardPerTradeRupees, { signed: true, decimals: 0 })}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <label className={labelCls}>
                  Index SL (pts){' '}
                  {isOptionBuying && (
                    <span className="text-red-600 dark:text-red-400 font-mono">
                      → {optionSlPts}pt Opt
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min={2}
                  max={500}
                  step={1}
                  value={config.stopLossPoints}
                  onChange={(e) =>
                    update(
                      'stopLossPoints',
                      Math.max(2, Number(e.target.value) || 20)
                    )
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>
                  Index Target (pts){' '}
                  {isOptionBuying && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                      → {optionTargetPts}pt Opt
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min={5}
                  max={1500}
                  step={5}
                  value={config.targetPoints}
                  onChange={(e) =>
                    update(
                      'targetPoints',
                      Math.max(5, Number(e.target.value) || 60)
                    )
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>
                  Lots{' '}
                  {autoSizeLotsEnabled && lotCalculation ? (
                    <span className="text-blue-600 dark:text-blue-400">
                      (Auto: {lotCalculation.recommendedLots})
                    </span>
                  ) : null}
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={config.lots}
                  onChange={(e) =>
                    update(
                      'lots',
                      Math.max(1, Math.floor(Number(e.target.value) || 1))
                    )
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Max Trades / Day</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={config.maxTradesPerDay}
                  onChange={(e) =>
                    update(
                      'maxTradesPerDay',
                      Math.max(1, Math.min(20, Number(e.target.value) || 1))
                    )
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Auto Square-Off (IST)</label>
                <input
                  type="time"
                  value={config.squareOffTime}
                  onChange={(e) =>
                    update('squareOffTime', e.target.value || '15:15')
                  }
                  className={inputCls}
                />
              </div>
            </div>

            {/* Paper Wallet Risk Calculation Bar */}
            {lotCalculation && onOpenPaperWallet && (
              <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0E131D] border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                  <Calculator className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>
                    Wallet Risk:{' '}
                    <strong>
                      {formatINR(lotCalculation.allowedRiskRupees, {
                        signed: false,
                        decimals: 0,
                      })}
                    </strong>{' '}
                    ÷{' '}
                    <strong>
                      {formatINR(lotCalculation.riskPerLotRupees, {
                        signed: false,
                        decimals: 0,
                      })}
                      /lot
                    </strong>{' '}
                    ={' '}
                    <strong className="text-blue-600 dark:text-blue-400">
                      {lotCalculation.recommendedLots} lot
                      {lotCalculation.recommendedLots === 1 ? '' : 's'}
                    </strong>
                    {autoSizeLotsEnabled ? ' (Auto-applied)' : ''}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onOpenPaperWallet}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md cursor-pointer"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Configure Paper Wallet &amp; Risk</span>
                </button>
              </div>
            )}
          </div>

          {/* SECTION 3: 4-Candle Bias, RSI(2) Setup & Trade Rules */}
          <div className="pt-4 space-y-3">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              3. Bias &amp; RSI Entry Rules
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className={labelCls}>Set Size (Candles)</label>
                <input
                  type="number"
                  min={2}
                  max={12}
                  step={1}
                  value={config.setSize}
                  onChange={(e) => {
                    const nextSet = Math.max(
                      2,
                      Math.min(12, Number(e.target.value) || 4)
                    );
                    onChange({
                      ...config,
                      setSize: nextSet,
                      requiredMajority: Math.min(
                        config.requiredMajority,
                        nextSet
                      ),
                    });
                  }}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Required Majority</label>
                <input
                  type="number"
                  min={2}
                  max={config.setSize}
                  step={1}
                  value={config.requiredMajority}
                  onChange={(e) =>
                    update(
                      'requiredMajority',
                      Math.max(
                        2,
                        Math.min(config.setSize, Number(e.target.value) || 3)
                      )
                    )
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>RSI Length</label>
                <input
                  type="number"
                  min={2}
                  max={14}
                  step={1}
                  value={config.rsiLength}
                  onChange={(e) =>
                    update(
                      'rsiLength',
                      Math.max(2, Math.min(14, Number(e.target.value) || 2))
                    )
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Buy CE if RSI &lt;</label>
                <input
                  type="number"
                  min={1}
                  max={49}
                  step={1}
                  value={config.rsiBuyThreshold}
                  onChange={(e) =>
                    update(
                      'rsiBuyThreshold',
                      Math.max(1, Math.min(49, Number(e.target.value) || 12))
                    )
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Buy PE if RSI &gt;</label>
                <input
                  type="number"
                  min={51}
                  max={99}
                  step={1}
                  value={config.rsiSellThreshold}
                  onChange={(e) =>
                    update(
                      'rsiSellThreshold',
                      Math.max(51, Math.min(99, Number(e.target.value) || 89))
                    )
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Entry Buffer (pts)</label>
                <input
                  type="number"
                  min={0}
                  max={25}
                  step={0.5}
                  value={config.entryBufferPoints}
                  onChange={(e) =>
                    update(
                      'entryBufferPoints',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-slate-700 dark:text-slate-300">
              <label className="inline-flex items-center gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Bias Mode:
                </span>
                <select
                  value={config.biasMode}
                  onChange={(e) =>
                    update('biasMode', e.target.value as BiasEvaluationMode)
                  }
                  className="px-2.5 py-1 text-xs bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  <option value="LOCK_FOR_DAY">Lock for Day</option>
                  <option value="ROLLING_SETS">Rolling 4-Candle Sets</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.trailToCostAtOneToOne}
                  onChange={(e) =>
                    update('trailToCostAtOneToOne', e.target.checked)
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
                />
                <span>Trail SL to Cost at 1:1</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.stopAfterTargetHit}
                  onChange={(e) =>
                    update('stopAfterTargetHit', e.target.checked)
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
                />
                <span>Stop trading after Target hit</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.updateTriggerWhileInRsiZone}
                  onChange={(e) =>
                    update('updateTriggerWhileInRsiZone', e.target.checked)
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
                />
                <span>Trail trigger level inside RSI zone</span>
              </label>
            </div>
          </div>

          {/* SECTION 4: Attached Per-Index Strategies Overview */}
          {attachedSymbols.length > 0 && (
            <div className="pt-4 space-y-2">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Attached Per-Index Strategies ({attachedSymbols.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {attachedSymbols.map((sym) => {
                  const sc = perIndexConfigs[sym];
                  const isCurrent = activeSymbol === sym;
                  return (
                    <div
                      key={sym}
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono tabular-nums ${
                        isCurrent
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-50 dark:bg-[#0E131D] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="font-semibold">
                        {sym.replace(/^(NSE|BSE):|-INDEX$|-EQ$/g, '')}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        SL {sc.stopLossPoints} / T {sc.targetPoints} ·{' '}
                        {sc.optionDeltaEstimate}Δ · RSI {sc.rsiBuyThreshold}/
                        {sc.rsiSellThreshold}
                      </span>
                      {onRemoveAttachedSymbol && (
                        <button
                          type="button"
                          onClick={() => onRemoveAttachedSymbol(sym)}
                          title={`Detach saved strategy for ${sym}`}
                          className="text-slate-400 hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
