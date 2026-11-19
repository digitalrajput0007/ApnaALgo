import React, { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { BacktestResult, StrategyConfig, TradeRecord } from '../types/strategy';

interface TradeLedgerProps {
  result: BacktestResult;
  config: StrategyConfig;
  selectedTradeId: number | null;
  onSelectTrade: (tradeId: number | null) => void;
  onSaveSessionToCalendar?: () => void;
  onSaveTradeToCalendar?: (trade: TradeRecord) => void;
  calendarFeedback?: string | null;
  onOpenCalendar?: () => void;
}

type LedgerTab = 'trades' | 'sets' | 'events';

export const TradeLedger: React.FC<TradeLedgerProps> = ({
  result,
  config,
  selectedTradeId,
  onSelectTrade,
  onSaveSessionToCalendar,
  onSaveTradeToCalendar,
  calendarFeedback,
  onOpenCalendar,
}) => {
  const [activeTab, setActiveTab] = useState<LedgerTab>('trades');

  const formatExitReason = (reason: string) => {
    switch (reason) {
      case 'TARGET_HIT':
        return 'Target Hit';
      case 'STRICT_SL_HIT':
        return 'Strict SL';
      case 'TRAILED_COST_EXIT':
        return 'Cost SL Exit';
      case 'EOD_SQUARE_OFF':
        return 'EOD Square-Off';
      default:
        return 'Open Position';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('trades')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'trades'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Executed Trades ({result.trades.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sets')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'sets'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            4-Candle Sets ({result.sets.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'events'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Execution Log ({result.events.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {selectedTradeId !== null ? (
            <button
              type="button"
              onClick={() => onSelectTrade(null)}
              className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Show all trades on chart
            </button>
          ) : (
            <span className="hidden sm:inline">
              Click any trade row to isolate it on the chart
            </span>
          )}

          {onSaveSessionToCalendar && result.trades.length > 0 && (
            <button
              type="button"
              onClick={onSaveSessionToCalendar}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Save to Paper Calendar</span>
            </button>
          )}
        </div>
      </div>

      {calendarFeedback && (
        <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-800">
          <span>{calendarFeedback}</span>
          {onOpenCalendar && (
            <button
              type="button"
              onClick={onOpenCalendar}
              className="font-semibold text-emerald-800 underline hover:text-emerald-950 cursor-pointer"
            >
              Open Paper Calendar →
            </button>
          )}
        </div>
      )}

      {activeTab === 'trades' && (
        <div className="overflow-x-auto">
          {result.trades.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No trades triggered yet in the visible candle window. Step forward
              in replay or verify bias and RSI({config.rsiLength}) thresholds.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Trade</th>
                  <th className="py-2.5 px-3">Bias Set</th>
                  <th className="py-2.5 px-3">Signal RSI</th>
                  <th className="py-2.5 px-3 text-right">Entry</th>
                  <th className="py-2.5 px-3 text-right">SL / Trailed</th>
                  <th className="py-2.5 px-3 text-right">Target</th>
                  <th className="py-2.5 px-3 text-right">Exit</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Points</th>
                  <th className="py-2.5 px-4 text-right">Est. P&amp;L</th>
                  {onSaveTradeToCalendar && (
                    <th className="py-2.5 px-3 text-right">Calendar</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {result.trades.map((t) => {
                  const isSelected = selectedTradeId === t.id;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onSelectTrade(isSelected ? null : t.id)}
                      className={`h-10 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/70'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        #{t.id} ·{' '}
                        <span
                          className={
                            t.direction === 'LONG'
                              ? 'text-emerald-700'
                              : 'text-red-600'
                          }
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        Set {t.biasSetNumber}
                      </td>
                      <td className="px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {t.signalRsi.toFixed(1)} @ {t.signalTime}
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {t.entryPrice.toFixed(2)}{' '}
                        <span className="text-slate-400">({t.entryTime})</span>
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-slate-600">
                          {t.initialSlPrice.toFixed(1)}
                        </span>
                        {t.trailedToCost && (
                          <span className="text-amber-700 font-semibold">
                            {' '}
                            → {t.currentSlPrice.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {t.targetPrice.toFixed(2)}
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {t.exitPrice !== undefined ? (
                          <>
                            {t.exitPrice.toFixed(2)}{' '}
                            <span className="text-slate-400">
                              ({t.exitTime})
                            </span>
                          </>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="px-3 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            t.exitReason === 'TARGET_HIT'
                              ? 'text-emerald-700'
                              : t.exitReason === 'STRICT_SL_HIT'
                              ? 'text-red-600'
                              : t.exitReason === 'TRAILED_COST_EXIT'
                              ? 'text-amber-700'
                              : 'text-blue-700'
                          }`}
                        >
                          {formatExitReason(t.exitReason)}
                        </span>
                      </td>
                      <td
                        className={`px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          t.pnlPoints > 0
                            ? 'text-emerald-700'
                            : t.pnlPoints < 0
                            ? 'text-red-600'
                            : 'text-amber-700'
                        }`}
                      >
                        {t.pnlPoints > 0 ? '+' : ''}
                        {t.pnlPoints.toFixed(2)}
                      </td>
                      <td
                        className={`px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          t.pnlRupees > 0
                            ? 'text-emerald-700'
                            : t.pnlRupees < 0
                            ? 'text-red-600'
                            : 'text-amber-700'
                        }`}
                      >
                        {t.pnlRupees >= 0 ? '+₹' : '-₹'}
                        {Math.abs(t.pnlRupees).toLocaleString('en-IN', {
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      {onSaveTradeToCalendar && (
                        <td className="px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onSaveTradeToCalendar(t);
                            }}
                            title="Save this paper trade to Monthly Calendar"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                          >
                            <CalendarPlus
                              className="w-3 h-3"
                              aria-hidden="true"
                            />
                            <span>Save</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'sets' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4">Set #</th>
                <th className="py-2.5 px-3">Window (IST)</th>
                <th className="py-2.5 px-3 text-right">Green</th>
                <th className="py-2.5 px-3 text-right">Red</th>
                <th className="py-2.5 px-3 text-right">Doji</th>
                <th className="py-2.5 px-3">Outcome</th>
                <th className="py-2.5 px-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {result.sets.map((s) => (
                <tr key={s.setNumber} className="h-10 hover:bg-slate-50">
                  <td className="px-4 font-mono tabular-nums font-semibold text-slate-900">
                    Set {s.setNumber}
                  </td>
                  <td className="px-3 font-mono tabular-nums text-slate-600">
                    {s.startTime} – {s.endTime}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                    {s.greenCount}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-red-600 font-semibold">
                    {s.redCount}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-slate-500">
                    {s.dojiCount}
                  </td>
                  <td className="px-3 font-medium">
                    <span
                      className={
                        s.outcome === 'BULLISH'
                          ? 'text-emerald-700'
                          : s.outcome === 'BEARISH'
                          ? 'text-red-600'
                          : 'text-slate-600'
                      }
                    >
                      {s.outcome === 'BULLISH'
                        ? 'Bullish Majority'
                        : s.outcome === 'BEARISH'
                        ? 'Bearish Majority'
                        : s.outcome === 'UNDECIDED'
                        ? '2G/2R Undecided'
                        : 'In Progress'}
                    </span>
                  </td>
                  <td className="px-4 text-slate-600">
                    {s.appliedForBias
                      ? 'Bias Locked for Trading'
                      : s.outcome === 'UNDECIDED'
                      ? 'Moved to Next 4-Candle Set'
                      : s.outcome === 'INCOMPLETE'
                      ? 'Awaiting 4th Candle Close'
                      : 'Bias Already Active'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {result.events.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-500">
              No strategy events recorded yet.
            </div>
          ) : (
            result.events.map((ev, idx) => (
              <div
                key={`${ev.candleIndex}-${idx}`}
                className="px-5 py-3 flex items-start justify-between gap-4 hover:bg-slate-50/70"
              >
                <div className="flex items-start gap-3">
                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-500 pt-0.5 shrink-0">
                    {ev.time}
                  </span>
                  <div>
                    <div
                      className={`text-xs font-semibold ${
                        ev.sentiment === 'bullish'
                          ? 'text-emerald-700'
                          : ev.sentiment === 'bearish'
                          ? 'text-red-600'
                          : ev.sentiment === 'warning'
                          ? 'text-amber-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {ev.title}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{ev.detail}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
