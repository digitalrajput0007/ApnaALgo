import React from 'react';
import { Check, RotateCcw, Save, Undo2 } from 'lucide-react';
import { StrategyConfig } from '../types/strategy';
import {
  InstrumentMeta,
  OPTION_DELTA_PRESETS,
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
}) => {
  const updateField = <K extends keyof StrategyConfig>(
    key: K,
    value: StrategyConfig[K]
  ) => {
    onChange({ ...config, [key]: value });
  };

  const inputCls =
    'mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600';

  return (
    <aside className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Strategy Parameters
            </h2>
            <p
              className={`text-xs mt-0.5 ${
                hasUnsavedChanges
                  ? 'text-amber-600 dark:text-amber-400 font-medium'
                  : justSaved
                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {hasUnsavedChanges
                ? 'Unsaved parameter changes'
                : justSaved
                ? 'Saved to workspace'
                : '5m NIFTY execution rules'}
            </p>
          </div>
          <button
            type="button"
            onClick={onResetDefaults}
            title="Reset all parameters to factory defaults"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>

        {onSave && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={!hasUnsavedChanges && !justSaved}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                hasUnsavedChanges
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs'
                  : justSaved
                  ? 'bg-emerald-600 text-white cursor-default'
                  : 'bg-slate-100 dark:bg-[#161D2B] text-slate-500 dark:text-slate-500 cursor-default'
              }`}
            >
              {justSaved && !hasUnsavedChanges ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Changes Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{hasUnsavedChanges ? 'Save Changes' : 'Saved'}</span>
                </>
              )}
            </button>

            {hasUnsavedChanges && onDiscard && (
              <button
                type="button"
                onClick={onDiscard}
                title="Revert to last saved parameters"
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Revert</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Section 1: 4-Candle Bias Rules */}
      <div className="px-5 py-4 space-y-3.5">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          01. 4-Candle Bias Filter
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Candles per Set
            </span>
            <input
              type="number"
              min={2}
              max={8}
              value={config.setSize}
              onChange={(e) =>
                updateField(
                  'setSize',
                  Math.max(2, Math.min(8, Number(e.target.value) || 4))
                )
              }
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Majority Needed
            </span>
            <input
              type="number"
              min={2}
              max={config.setSize}
              value={config.requiredMajority}
              onChange={(e) =>
                updateField(
                  'requiredMajority',
                  Math.max(
                    2,
                    Math.min(config.setSize, Number(e.target.value) || 3)
                  )
                )
              }
              className={inputCls}
            />
          </label>
        </div>

        <div>
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1.5">
            Bias Persistence
          </span>
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
            <button
              type="button"
              onClick={() => updateField('biasMode', 'LOCK_FOR_DAY')}
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                config.biasMode === 'LOCK_FOR_DAY'
                  ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Lock Once Decided
            </button>
            <button
              type="button"
              onClick={() => updateField('biasMode', 'ROLLING_SETS')}
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                config.biasMode === 'ROLLING_SETS'
                  ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Re-eval Every Set
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: RSI(2) Zone & Entry Buffer */}
      <div className="px-5 py-4 space-y-3.5">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          02. RSI({config.rsiLength}) &amp; Entry Buffer
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Length
            </span>
            <input
              type="number"
              min={2}
              max={14}
              value={config.rsiLength}
              onChange={(e) =>
                updateField(
                  'rsiLength',
                  Math.max(2, Math.min(14, Number(e.target.value) || 2))
                )
              }
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Buy &lt;
            </span>
            <input
              type="number"
              min={1}
              max={45}
              value={config.rsiBuyThreshold}
              onChange={(e) =>
                updateField(
                  'rsiBuyThreshold',
                  Math.max(1, Math.min(45, Number(e.target.value) || 12))
                )
              }
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
              Sell &gt;
            </span>
            <input
              type="number"
              min={55}
              max={99}
              value={config.rsiSellThreshold}
              onChange={(e) =>
                updateField(
                  'rsiSellThreshold',
                  Math.max(55, Math.min(99, Number(e.target.value) || 89))
                )
              }
              className={inputCls}
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Entry Buffer Points
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              High+{config.entryBufferPoints} / Low-{config.entryBufferPoints}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={25}
              step={0.5}
              value={config.entryBufferPoints}
              onChange={(e) =>
                updateField(
                  'entryBufferPoints',
                  Math.max(0, Math.min(25, Number(e.target.value) || 0))
                )
              }
              className="w-24 px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex flex-1 items-center gap-1">
              {[0, 0.5, 1, 2, 5].map((buf) => (
                <button
                  key={buf}
                  type="button"
                  onClick={() => updateField('entryBufferPoints', buf)}
                  className={`flex-1 py-1.5 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                    config.entryBufferPoints === buf
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {buf}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer pt-0.5">
          <input
            type="checkbox"
            checked={config.updateTriggerWhileInRsiZone}
            onChange={(e) =>
              updateField('updateTriggerWhileInRsiZone', e.target.checked)
            }
            className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
          />
          <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
            Shift base candle on Lower High (Buy) / Higher Low (Sell) until
            breakout
          </span>
        </label>
      </div>

      {/* Section 3: Risk, Target, Daily Cap & 1:1 Cost Trail */}
      <div className="px-5 py-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            03. Risk &amp; 1:1 Cost Trail
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            1:{(config.targetPoints / Math.max(1, config.stopLossPoints)).toFixed(1)} RR
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Strict SL (pts)
            </span>
            <input
              type="number"
              min={5}
              max={100}
              step={5}
              value={config.stopLossPoints}
              onChange={(e) =>
                updateField(
                  'stopLossPoints',
                  Math.max(5, Math.min(100, Number(e.target.value) || 20))
                )
              }
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Target (pts)
            </span>
            <input
              type="number"
              min={10}
              max={250}
              step={5}
              value={config.targetPoints}
              onChange={(e) =>
                updateField(
                  'targetPoints',
                  Math.max(10, Math.min(250, Number(e.target.value) || 60))
                )
              }
              className={inputCls}
            />
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          {[40, 60, 80, 100].map((presetTarget) => (
            <button
              key={presetTarget}
              type="button"
              onClick={() => updateField('targetPoints', presetTarget)}
              className={`flex-1 py-1 text-xs font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                config.targetPoints === presetTarget
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-semibold'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              +{presetTarget}
            </button>
          ))}
        </div>

        {/* Max Trades Per Day */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block">
            Max Trades Per Day
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={20}
              value={config.maxTradesPerDay}
              onChange={(e) =>
                updateField(
                  'maxTradesPerDay',
                  Math.max(1, Math.min(20, Number(e.target.value) || 4))
                )
              }
              className="w-20 px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex flex-1 items-center gap-1">
              {[1, 2, 3, 4, 6].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => updateField('maxTradesPerDay', cnt)}
                  className={`flex-1 py-1.5 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                    config.maxTradesPerDay === cnt
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer pt-0.5">
          <input
            type="checkbox"
            checked={config.trailToCostAtOneToOne}
            onChange={(e) =>
              updateField('trailToCostAtOneToOne', e.target.checked)
            }
            className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
          />
          <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
            Trail SL to Entry (Cost) once trade reaches 1:1 (+
            {config.stopLossPoints} pts)
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer pt-0.5">
          <input
            type="checkbox"
            checked={config.stopAfterTargetHit}
            onChange={(e) =>
              updateField('stopAfterTargetHit', e.target.checked)
            }
            className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
          />
          <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
            Stop trading for the day after any Target hit (next trade only on
            SL)
          </span>
        </label>
      </div>

      {/* Section 4: Fyers Sizing & Instrument Mapping */}
      <div className="px-5 py-4 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            04. Sizing &amp; Instrument
          </span>
          {instrumentMeta && (
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
              {loadingLotSize
                ? 'Syncing lot...'
                : instrumentMeta.fnoEnabled
                ? `${instrumentMeta.underlying} · Auto ${instrumentMeta.lotSize}`
                : `${instrumentMeta.underlying} · Cash`}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
          <button
            type="button"
            onClick={() => updateField('instrumentType', 'NIFTY_FUT')}
            className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              config.instrumentType === 'NIFTY_FUT'
                ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {instrumentMeta?.underlying || 'Index'} Futures
          </button>
          <button
            type="button"
            onClick={() => updateField('instrumentType', 'NIFTY_ATM_OPT')}
            className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              config.instrumentType === 'NIFTY_ATM_OPT'
                ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Options Buying
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between gap-1">
              <span>Lot Size</span>
              {instrumentMeta?.fnoEnabled &&
                config.lotSize !== instrumentMeta.lotSize && (
                  <button
                    type="button"
                    onClick={() =>
                      updateField('lotSize', instrumentMeta.lotSize)
                    }
                    className="text-[10px] font-mono text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Use {instrumentMeta.lotSize}
                  </button>
                )}
            </span>
            <input
              type="number"
              min={1}
              max={25000}
              value={config.lotSize}
              onChange={(e) =>
                updateField(
                  'lotSize',
                  Math.max(1, Number(e.target.value) || 1)
                )
              }
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Lots
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={config.lots}
              onChange={(e) =>
                updateField('lots', Math.max(1, Number(e.target.value) || 1))
              }
              className={inputCls}
            />
          </label>
        </div>

        {instrumentMeta?.nearFuturesSymbol && (
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Near Fut</span>
            <span className="text-slate-700 dark:text-slate-300 truncate max-w-[175px]">
              {instrumentMeta.nearFuturesSymbol}
            </span>
          </div>
        )}

        {config.instrumentType === 'NIFTY_ATM_OPT' && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Target Option Delta (CE/PE)
              </span>
              <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {config.optionDeltaEstimate.toFixed(2)}Δ
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {OPTION_DELTA_PRESETS.map((preset) => {
                const isSelected =
                  Math.abs(config.optionDeltaEstimate - preset.delta) < 0.03;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      updateField('optionDeltaEstimate', preset.delta)
                    }
                    className={`py-1.5 px-1 text-[10px] font-mono rounded border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {preset.delta.toFixed(2)}Δ
                  </button>
                );
              })}
            </div>

            <input
              type="range"
              min={0.45}
              max={0.85}
              step={0.01}
              value={config.optionDeltaEstimate}
              onChange={(e) =>
                updateField(
                  'optionDeltaEstimate',
                  Number(e.target.value) || 0.65
                )
              }
              aria-label="Target option delta"
              className="w-full accent-blue-600 cursor-pointer"
            />

            <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 leading-relaxed">
              Signals run on{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {instrumentMeta?.displayName || 'Index'} Spot
              </strong>
              ; Bullish buys{' '}
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                CE
              </span>
              , Bearish buys{' '}
              <span className="text-red-600 dark:text-red-400 font-semibold">
                PE
              </span>{' '}
              at ~{config.optionDeltaEstimate.toFixed(2)}Δ (1–2 strikes ITM
              recommended to minimize theta bleed).
            </div>
          </div>
        )}
      </div>

      {onSave && (
        <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-[#0E131D] rounded-b-xl flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {hasUnsavedChanges
              ? 'Click Save to persist'
              : 'Synced across sessions'}
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={!hasUnsavedChanges && !justSaved}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              hasUnsavedChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : justSaved
                ? 'bg-emerald-600 text-white cursor-default'
                : 'bg-slate-200/80 dark:bg-[#161D2B] text-slate-500 dark:text-slate-500 cursor-default'
            }`}
          >
            {justSaved && !hasUnsavedChanges ? (
              <>
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  );
};
