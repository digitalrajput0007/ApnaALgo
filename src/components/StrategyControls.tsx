import React from 'react';
import { Check, RotateCcw, Save, Undo2 } from 'lucide-react';
import { StrategyConfig } from '../types/strategy';

interface StrategyControlsProps {
  config: StrategyConfig;
  onChange: (next: StrategyConfig) => void;
  onResetDefaults: () => void;
  hasUnsavedChanges?: boolean;
  justSaved?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}

export const StrategyControls: React.FC<StrategyControlsProps> = ({
  config,
  onChange,
  onResetDefaults,
  hasUnsavedChanges = false,
  justSaved = false,
  onSave,
  onDiscard,
}) => {
  const updateField = <K extends keyof StrategyConfig>(
    key: K,
    value: StrategyConfig[K]
  ) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <aside className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Strategy Parameters
            </h2>
            <p
              className={`text-xs mt-0.5 ${
                hasUnsavedChanges
                  ? 'text-amber-700 font-medium'
                  : justSaved
                  ? 'text-emerald-700 font-medium'
                  : 'text-slate-500'
              }`}
            >
              {hasUnsavedChanges
                ? 'Unsaved parameter changes'
                : justSaved
                ? 'Saved to browser storage'
                : '5m NIFTY execution rules'}
            </p>
          </div>
          <button
            type="button"
            onClick={onResetDefaults}
            title="Reset all parameters to factory defaults"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  : 'bg-slate-100 text-slate-500 cursor-default'
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
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
        <div className="text-xs font-semibold text-slate-800">
          01. 4-Candle Bias Filter
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">
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
              className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">
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
              className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </label>
        </div>

        <div>
          <span className="text-[11px] font-medium text-slate-600 block mb-1.5">
            Bias Persistence
          </span>
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => updateField('biasMode', 'LOCK_FOR_DAY')}
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                config.biasMode === 'LOCK_FOR_DAY'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lock Once Decided
            </button>
            <button
              type="button"
              onClick={() => updateField('biasMode', 'ROLLING_SETS')}
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                config.biasMode === 'ROLLING_SETS'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Re-eval Every Set
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: RSI(2) Zone & Entry Buffer */}
      <div className="px-5 py-4 space-y-3.5">
        <div className="text-xs font-semibold text-slate-800">
          02. RSI({config.rsiLength}) &amp; Entry Buffer
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">
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
              className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-emerald-700">
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
              className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-red-700">
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
              className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-600">
              Entry Buffer Points
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
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
              className="w-24 px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex flex-1 items-center gap-1">
              {[0, 0.5, 1, 2, 5].map((buf) => (
                <button
                  key={buf}
                  type="button"
                  onClick={() => updateField('entryBufferPoints', buf)}
                  className={`flex-1 py-1.5 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                    config.entryBufferPoints === buf
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <span className="text-xs text-slate-600 leading-snug">
            Shift base candle on Lower High (Buy) / Higher Low (Sell) until breakout
          </span>
        </label>
      </div>

      {/* Section 3: Risk, Target, Daily Cap & 1:1 Cost Trail */}
      <div className="px-5 py-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-800">
            03. Risk &amp; 1:1 Cost Trail
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-500">
            1:{(config.targetPoints / Math.max(1, config.stopLossPoints)).toFixed(1)} RR
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">
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
              className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">
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
              className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              +{presetTarget}
            </button>
          ))}
        </div>

        {/* Max Trades Per Day */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-slate-600 block">
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
              className="w-20 px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <div className="flex flex-1 items-center gap-1">
              {[1, 2, 3, 4, 6].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => updateField('maxTradesPerDay', cnt)}
                  className={`flex-1 py-1.5 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                    config.maxTradesPerDay === cnt
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <span className="text-xs text-slate-600 leading-snug">
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
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <span className="text-xs text-slate-600 leading-snug">
            Stop trading for the day after any Target hit (next trade only on SL)
          </span>
        </label>
      </div>

      {/* Section 4: Fyers Sizing & Instrument Mapping */}
      <div className="px-5 py-4 space-y-3.5">
        <div className="text-xs font-semibold text-slate-800">
          04. Sizing &amp; Instrument
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => updateField('instrumentType', 'NIFTY_FUT')}
            className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              config.instrumentType === 'NIFTY_FUT'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            NIFTY Futures
          </button>
          <button
            type="button"
            onClick={() => updateField('instrumentType', 'NIFTY_ATM_OPT')}
            className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              config.instrumentType === 'NIFTY_ATM_OPT'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ATM Option (CE/PE)
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">
              Lot Size
            </span>
            <input
              type="number"
              min={1}
              max={500}
              value={config.lotSize}
              onChange={(e) =>
                updateField(
                  'lotSize',
                  Math.max(1, Number(e.target.value) || 75)
                )
              }
              className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">Lots</span>
            <input
              type="number"
              min={1}
              max={50}
              value={config.lots}
              onChange={(e) =>
                updateField('lots', Math.max(1, Number(e.target.value) || 1))
              }
              className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>
        </div>

        {config.instrumentType === 'NIFTY_ATM_OPT' && (
          <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Estimated P&amp;L scales Spot points by ATM delta (
            <span className="font-mono font-semibold">
              {config.optionDeltaEstimate.toFixed(2)}
            </span>
            ). Execution triggers stay anchored to NIFTY 5m Index candles.
          </div>
        )}
      </div>

      {onSave && (
        <div className="px-5 py-3.5 bg-slate-50/70 rounded-b-xl flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">
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
                : 'bg-slate-200/80 text-slate-500 cursor-default'
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
