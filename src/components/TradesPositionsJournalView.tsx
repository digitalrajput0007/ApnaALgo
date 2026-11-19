import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Download,
  PlusCircle,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  formatStrategyConditionSummary,
  OrderPositionJournalController,
} from '../hooks/useOrderPositionJournal';
import {
  OrderLegType,
  RecordedOrder,
  RecordedPosition,
  StrategyConfig,
} from '../types/strategy';

interface TradesPositionsJournalViewProps {
  journal: OrderPositionJournalController;
  config: StrategyConfig;
  currentLabTradesCount: number;
  currentLabLabel: string;
  isLiveAutoRecording: boolean;
  onRecordCurrentLabSession: () => void;
  onGoToLab: () => void;
}

type SubView = 'positions' | 'orders';

function formatLegLabel(leg: OrderLegType): string {
  switch (leg) {
    case 'ENTRY':
      return 'Entry Breakout';
    case 'SL_MODIFY':
      return 'SL Trail (1:1)';
    case 'TARGET_EXIT':
      return 'Target Exit';
    case 'SL_EXIT':
      return 'Strict SL Exit';
    case 'COST_EXIT':
      return 'Cost SL Exit';
    case 'EOD_EXIT':
      return 'EOD Square-Off';
    case 'RESTING_SL':
      return 'Resting SL';
    case 'RESTING_TARGET':
      return 'Resting Target';
  }
}

function formatExitLabel(reason: RecordedPosition['exitReason']): string {
  switch (reason) {
    case 'OPEN':
      return 'Open';
    case 'TARGET_HIT':
      return 'Target Hit';
    case 'STRICT_SL_HIT':
      return 'Strict SL';
    case 'TRAILED_COST_EXIT':
      return 'Cost SL';
    case 'EOD_SQUARE_OFF':
      return 'EOD Exit';
  }
}

export const TradesPositionsJournalView: React.FC<
  TradesPositionsJournalViewProps
> = ({
  journal,
  config,
  currentLabTradesCount,
  currentLabLabel,
  isLiveAutoRecording,
  onRecordCurrentLabSession,
  onGoToLab,
}) => {
  const [subView, setSubView] = useState<SubView>('positions');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const activeRulesSummary = useMemo(
    () => formatStrategyConditionSummary(config),
    [config]
  );

  const filteredPositions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return journal.positions.filter((p) => {
      if (statusFilter === 'OPEN' && p.status !== 'OPEN') return false;
      if (statusFilter === 'CLOSED' && p.status !== 'CLOSED') return false;
      if (!q) return true;
      return (
        p.symbol.toLowerCase().includes(q) ||
        p.date.includes(q) ||
        p.direction.toLowerCase().includes(q) ||
        p.configSummary.toLowerCase().includes(q)
      );
    });
  }, [journal.positions, statusFilter, query]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return journal.orders.filter((o) => {
      if (statusFilter === 'EXECUTED' && o.status !== 'EXECUTED') return false;
      if (statusFilter === 'OPEN' && o.status !== 'OPEN') return false;
      if (statusFilter === 'MODIFIED' && o.status !== 'MODIFIED') return false;
      if (!q) return true;
      return (
        o.symbol.toLowerCase().includes(q) ||
        o.date.includes(q) ||
        o.side.toLowerCase().includes(q) ||
        o.triggerCondition.toLowerCase().includes(q) ||
        o.orderType.toLowerCase().includes(q)
      );
    });
  }, [journal.orders, statusFilter, query]);

  const handleSwitchSubView = (next: SubView) => {
    setSubView(next);
    setStatusFilter('ALL');
  };

  const handleExport = () => {
    journal.exportCsv(subView);
    toast.success(
      `Exported ${
        subView === 'positions' ? 'Positions' : 'Order Book'
      } CSV.`
    );
  };

  const handleClear = () => {
    journal.clearAll();
    setConfirmClear(false);
    toast.success('Cleared Trades & Positions Journal.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Trades &amp; Positions Journal
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Orders and positions recorded from Strategy Lab rules:{' '}
            <span className="font-mono text-xs text-slate-700">
              {activeRulesSummary}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {currentLabTradesCount > 0 && (
            <button
              type="button"
              onClick={onRecordCurrentLabSession}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                Record Lab Session ({currentLabTradesCount})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExport}
            disabled={
              subView === 'positions'
                ? journal.positions.length === 0
                : journal.orders.length === 0
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-45 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {/* Quiet Live Auto-Recording Note */}
      {isLiveAutoRecording && (
        <div className="px-4 py-2.5 bg-emerald-50/80 border border-emerald-200/90 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>
              <strong>Live auto-recording active:</strong> orders and positions
              triggered by Strategy Lab on{' '}
              <span className="font-mono">{currentLabLabel}</span> are synced
              automatically.
            </span>
          </div>
          <button
            type="button"
            onClick={onGoToLab}
            className="font-semibold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Open Strategy Lab</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 4-Column Metric Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
        <div className="px-5 py-4">
          <div className="text-xs text-slate-500">Open Positions</div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-blue-700">
            {journal.openPositionsCount}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Active intraday exposure
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500">Closed Positions</div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {journal.closedPositionsCount}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Total recorded trades: {journal.positions.length}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500">Recorded Orders</div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {journal.orders.length}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Entry, SL trail &amp; exit legs
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500">Journal Net P&amp;L</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className={`font-mono tabular-nums text-2xl font-semibold ${
                journal.netPnlRupees > 0
                  ? 'text-emerald-700'
                  : journal.netPnlRupees < 0
                  ? 'text-red-600'
                  : 'text-slate-900'
              }`}
            >
              {journal.netPnlRupees >= 0 ? '+₹' : '-₹'}
              {Math.abs(journal.netPnlRupees).toLocaleString('en-IN')}
            </span>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              ({journal.netPnlPoints >= 0 ? '+' : ''}
              {journal.netPnlPoints.toFixed(1)} pts)
            </span>
          </div>
        </div>
      </section>

      {/* Main Positions & Order Book Card */}
      <section className="bg-white border border-slate-200/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
        {/* Controls Toolbar */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Segmented View Switch */}
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => handleSwitchSubView('positions')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  subView === 'positions'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Positions ({journal.positions.length})
              </button>
              <button
                type="button"
                onClick={() => handleSwitchSubView('orders')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  subView === 'orders'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Order Book ({journal.orders.length})
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 text-xs">
              {(subView === 'positions'
                ? ['ALL', 'OPEN', 'CLOSED']
                : ['ALL', 'EXECUTED', 'OPEN', 'MODIFIED']
              ).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    statusFilter === status
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {status === 'ALL'
                    ? 'All'
                    : status.charAt(0) + status.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter date, symbol, trigger..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 w-52"
              />
            </div>

            {journal.positions.length > 0 && (
              <>
                {confirmClear ? (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleClear}
                      className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                    >
                      Confirm Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Clear</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Positions Table */}
        {subView === 'positions' && (
          <div className="overflow-x-auto">
            {filteredPositions.length === 0 ? (
              <div className="px-6 py-12 text-center space-y-3">
                <p className="text-sm font-medium text-slate-700">
                  {journal.positions.length === 0
                    ? 'No positions recorded yet.'
                    : 'No positions match the selected filter.'}
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Live Fyers streaming sessions record automatically. For any
                  fetched historical date or preset in Strategy Lab, click
                  Record Lab Session to log all triggered positions and order
                  legs.
                </p>
                <div className="pt-1 flex items-center justify-center gap-2.5">
                  {currentLabTradesCount > 0 && (
                    <button
                      type="button"
                      onClick={onRecordCurrentLabSession}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>
                        Record Current Lab Session ({currentLabTradesCount})
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onGoToLab}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    <span>Open Strategy Lab</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Date &amp; Entry</th>
                    <th className="py-2.5 px-3">Instrument &amp; Side</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Avg Entry</th>
                    <th className="py-2.5 px-3 text-right">LTP / Exit</th>
                    <th className="py-2.5 px-3 text-right">SL / Target</th>
                    <th className="py-2.5 px-3">Strategy Conditions</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">P&amp;L</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredPositions.map((pos: RecordedPosition) => (
                    <tr
                      key={pos.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {pos.date}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {pos.entryTime}
                          {pos.exitTime ? ` → ${pos.exitTime}` : ' · Live'}
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {pos.symbol.replace(/^NSE:/, '')}
                        </div>
                        <div className="text-[11px] font-mono">
                          <span
                            className={
                              pos.direction === 'LONG'
                                ? 'text-emerald-700 font-semibold'
                                : 'text-red-600 font-semibold'
                            }
                          >
                            {pos.direction}
                          </span>
                          <span className="text-slate-400">
                            {' '}
                            · #{pos.tradeNumber}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {pos.qty}
                        <div className="text-[11px] text-slate-400">
                          {pos.lots} lot{pos.lots === 1 ? '' : 's'}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {pos.avgEntryPrice.toFixed(2)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {pos.ltpOrExitPrice.toFixed(2)}
                        <div className="text-[11px] text-slate-400">
                          {pos.status === 'OPEN' ? 'Mark LTP' : 'Exit Fill'}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-slate-700">
                          SL{' '}
                          <span
                            className={
                              pos.trailedToCost
                                ? 'text-amber-700 font-semibold'
                                : ''
                            }
                          >
                            {pos.currentSlPrice.toFixed(1)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Tgt {pos.targetPrice.toFixed(1)}
                        </div>
                      </td>

                      <td className="py-3 px-3 max-w-[240px]">
                        <div className="font-mono tabular-nums text-[11px] text-slate-800">
                          Set #{pos.biasSetNumber} · RSI{' '}
                          {pos.signalRsi.toFixed(1)} @ {pos.signalTime}
                        </div>
                        <div
                          className="text-[11px] text-slate-500 truncate"
                          title={pos.configSummary}
                        >
                          {pos.configSummary}
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            pos.status === 'OPEN'
                              ? 'text-blue-700'
                              : pos.exitReason === 'TARGET_HIT'
                              ? 'text-emerald-700'
                              : pos.exitReason === 'STRICT_SL_HIT'
                              ? 'text-red-600'
                              : pos.exitReason === 'TRAILED_COST_EXIT'
                              ? 'text-amber-700'
                              : 'text-slate-700'
                          }`}
                        >
                          {formatExitLabel(pos.exitReason)}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <div
                          className={`font-semibold ${
                            pos.pnlRupees > 0
                              ? 'text-emerald-700'
                              : pos.pnlRupees < 0
                              ? 'text-red-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {pos.pnlRupees >= 0 ? '+₹' : '-₹'}
                          {Math.abs(pos.pnlRupees).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {pos.pnlPoints > 0 ? '+' : ''}
                          {pos.pnlPoints.toFixed(2)} pts
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            journal.deleteByTradeKey(pos.tradeKey);
                            toast.success('Removed position & linked orders.');
                          }}
                          title="Delete position and linked orders"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Order Book Table */}
        {subView === 'orders' && (
          <div className="overflow-x-auto">
            {filteredOrders.length === 0 ? (
              <div className="px-6 py-12 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  {journal.orders.length === 0
                    ? 'No orders recorded yet.'
                    : 'No orders match the selected filter.'}
                </p>
                <p className="text-xs text-slate-500">
                  Every Entry breakout, 1:1 Cost Trail SL modification, Target
                  fill, and Stop Loss execution is recorded automatically here.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Date &amp; Time</th>
                    <th className="py-2.5 px-3">Instrument</th>
                    <th className="py-2.5 px-3">Side</th>
                    <th className="py-2.5 px-3">Order Leg</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Price</th>
                    <th className="py-2.5 px-3">Strategy Trigger Condition</th>
                    <th className="py-2.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredOrders.map((ord: RecordedOrder) => (
                    <tr
                      key={ord.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                        <span className="font-semibold text-slate-900">
                          {ord.time}
                        </span>
                        <div className="text-[11px] text-slate-500">
                          {ord.date}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-medium text-slate-900 whitespace-nowrap">
                        {ord.symbol.replace(/^NSE:/, '')}
                        <span className="text-slate-400 font-mono text-[11px]">
                          {' '}
                          #{ord.tradeNumber}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-semibold whitespace-nowrap">
                        <span
                          className={
                            ord.side === 'BUY'
                              ? 'text-emerald-700'
                              : 'text-red-600'
                          }
                        >
                          {ord.side}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
                        {formatLegLabel(ord.leg)}
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {ord.orderType}
                      </td>

                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {ord.qty}
                      </td>

                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {ord.price.toFixed(2)}
                      </td>

                      <td className="py-3 px-3 text-slate-600 max-w-xs">
                        <div className="truncate" title={ord.triggerCondition}>
                          {ord.triggerCondition}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-[11px] font-semibold whitespace-nowrap">
                        <span
                          className={
                            ord.status === 'EXECUTED'
                              ? 'text-emerald-700'
                              : ord.status === 'MODIFIED'
                              ? 'text-amber-700'
                              : 'text-blue-700'
                          }
                        >
                          {ord.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
