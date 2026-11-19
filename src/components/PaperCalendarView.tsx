import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  computePaperJournalStats,
  formatMonthLabel,
  getTodayIstYYYYMMDD,
  groupPaperTradesByDate,
  groupPaperTradesByMonth,
  PaperTradeJournalController,
} from '../hooks/usePaperTradeJournal';
import {
  PaperTradeEntry,
  PaperTradeSource,
  StrategyConfig,
  TradeExitReason,
} from '../types/strategy';

interface PaperCalendarViewProps {
  journal: PaperTradeJournalController;
  config: StrategyConfig;
  initialFocusMonth?: string | null;
  initialFocusDate?: string | null;
  onGoToBacktest: () => void;
  onGoToLab: () => void;
  onSaveCurrentLabSession: () => void;
  currentLabTradesCount: number;
}

type SourceFilter = 'ALL' | PaperTradeSource;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shiftMonth(yearMonth: string, deltaMonths: number): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number(yStr) || 2026;
  const m = Number(mStr) || 1;
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

function formatMonthLong(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return yearMonth;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function buildCalendarWeeks(yearMonth: string): {
  date: string;
  dayNum: number;
  inMonth: boolean;
  isWeekend: boolean;
}[][] {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number(yStr);
  const month = Number(mStr); // 1-12
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const daysInMonth = lastDay.getUTCDate();

  // Monday = 0 ... Sunday = 6
  const startDow = (firstDay.getUTCDay() + 6) % 7;

  const cells: {
    date: string;
    dayNum: number;
    inMonth: boolean;
    isWeekend: boolean;
  }[] = [];

  // Leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(year, month - 1, -i));
    const dow = (dt.getUTCDay() + 6) % 7;
    cells.push({
      date: dt.toISOString().slice(0, 10),
      dayNum: dt.getUTCDate(),
      inMonth: false,
      isWeekend: dow >= 5,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    const dow = (dt.getUTCDay() + 6) % 7;
    cells.push({
      date: dt.toISOString().slice(0, 10),
      dayNum: d,
      inMonth: true,
      isWeekend: dow >= 5,
    });
  }

  // Trailing days to fill last week
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const dt = new Date(Date.UTC(year, month, nextDay));
    const dow = (dt.getUTCDay() + 6) % 7;
    cells.push({
      date: dt.toISOString().slice(0, 10),
      dayNum: dt.getUTCDate(),
      inMonth: false,
      isWeekend: dow >= 5,
    });
    nextDay += 1;
  }

  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function formatSourceLabel(source: PaperTradeSource): string {
  switch (source) {
    case 'BACKTEST_1Y':
      return '1Y Backtest';
    case 'STRATEGY_LAB':
      return 'Strategy Lab';
    case 'LIVE_SESSION':
      return 'Live Session';
    case 'MANUAL':
      return 'Manual Log';
  }
}

function formatExitLabel(reason: TradeExitReason): string {
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
      return 'Open';
  }
}

export const PaperCalendarView: React.FC<PaperCalendarViewProps> = ({
  journal,
  config,
  initialFocusMonth,
  initialFocusDate,
  onGoToBacktest,
  onGoToLab,
  onSaveCurrentLabSession,
  currentLabTradesCount,
}) => {
  const todayIst = getTodayIstYYYYMMDD();
  const [unit, setUnit] = useState<'points' | 'rupees'>('points');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [activeMonth, setActiveMonth] = useState<string>(() => {
    if (initialFocusMonth) return initialFocusMonth;
    if (initialFocusDate) return initialFocusDate.slice(0, 7);
    if (journal.monthlyBuckets.length > 0) return journal.monthlyBuckets[0].month;
    return todayIst.slice(0, 7);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    if (initialFocusDate) return initialFocusDate;
    return null;
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmClearScope, setConfirmClearScope] = useState<
    'month' | 'all' | null
  >(null);

  // Manual trade form state
  const [manualDate, setManualDate] = useState(todayIst);
  const [manualSymbol, setManualSymbol] = useState('NSE:NIFTY50-INDEX');
  const [manualDirection, setManualDirection] = useState<'LONG' | 'SHORT'>(
    'LONG'
  );
  const [manualEntryTime, setManualEntryTime] = useState('10:15');
  const [manualExitTime, setManualExitTime] = useState('11:05');
  const [manualEntryPrice, setManualEntryPrice] = useState('24500');
  const [manualExitPrice, setManualExitPrice] = useState('24560');
  const [manualReason, setManualReason] =
    useState<TradeExitReason>('TARGET_HIT');
  const [manualNote, setManualNote] = useState('');

  useEffect(() => {
    if (initialFocusDate) {
      setActiveMonth(initialFocusDate.slice(0, 7));
      setSelectedDate(initialFocusDate);
    } else if (initialFocusMonth) {
      setActiveMonth(initialFocusMonth);
    }
  }, [initialFocusMonth, initialFocusDate]);

  const filteredEntries = useMemo(() => {
    if (sourceFilter === 'ALL') return journal.entries;
    return journal.entries.filter((e) => e.source === sourceFilter);
  }, [journal.entries, sourceFilter]);

  const filteredMonthlyBuckets = useMemo(
    () => groupPaperTradesByMonth(filteredEntries),
    [filteredEntries]
  );

  const filteredDailyMap = useMemo(
    () => groupPaperTradesByDate(filteredEntries),
    [filteredEntries]
  );

  const monthEntries = useMemo(
    () => filteredEntries.filter((e) => e.date.startsWith(activeMonth)),
    [filteredEntries, activeMonth]
  );

  const monthStats = useMemo(
    () => computePaperJournalStats(monthEntries),
    [monthEntries]
  );

  const calendarWeeks = useMemo(
    () => buildCalendarWeeks(activeMonth),
    [activeMonth]
  );

  // Auto-select latest traded day in active month if selectedDate is not in activeMonth
  useEffect(() => {
    if (selectedDate && selectedDate.startsWith(activeMonth)) return;
    const daysInMonth = Array.from(filteredDailyMap.keys())
      .filter((d) => d.startsWith(activeMonth))
      .sort((a, b) => b.localeCompare(a));
    if (daysInMonth.length > 0) {
      setSelectedDate(daysInMonth[0]);
    } else {
      setSelectedDate(null);
    }
  }, [activeMonth, filteredDailyMap, selectedDate]);

  const selectedDayBucket = selectedDate
    ? filteredDailyMap.get(selectedDate) ?? null
    : null;

  const formatPnl = (points: number, rupees: number, compact = false) => {
    if (unit === 'points') {
      const sign = points > 0 ? '+' : '';
      return compact
        ? `${sign}${points.toFixed(1)}`
        : `${sign}${points.toFixed(1)} pts`;
    }
    const sign = rupees >= 0 ? '+₹' : '-₹';
    const abs = Math.abs(rupees);
    if (compact && abs >= 100000) {
      return `${sign}${(abs / 100000).toFixed(2)}L`;
    }
    if (compact && abs >= 1000) {
      return `${sign}${(abs / 1000).toFixed(1)}k`;
    }
    return `${sign}${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const handleOpenManualForm = (prefillDate?: string) => {
    setManualDate(prefillDate || selectedDate || `${activeMonth}-01`);
    setShowAddForm(true);
  };

  const handleSubmitManualTrade = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = Number(manualEntryPrice);
    const exit = Number(manualExitPrice);
    if (!manualDate || Number.isNaN(entry) || Number.isNaN(exit)) return;

    const rawPoints =
      manualDirection === 'LONG' ? exit - entry : entry - exit;
    const pnlPoints = Math.round(rawPoints * 100) / 100;
    const qty = config.lotSize * config.lots;
    const multiplier =
      config.instrumentType === 'NIFTY_ATM_OPT'
        ? config.optionDeltaEstimate
        : 1;
    const pnlRupees = Math.round(pnlPoints * qty * multiplier);

    journal.addManualEntry({
      date: manualDate,
      symbol: manualSymbol.trim() || 'NSE:NIFTY50-INDEX',
      direction: manualDirection,
      entryTime: manualEntryTime || '09:35',
      exitTime: manualExitTime || '10:30',
      entryPrice: entry,
      exitPrice: exit,
      exitReason: manualReason,
      pnlPoints,
      pnlRupees,
      trailedToCost: manualReason === 'TRAILED_COST_EXIT',
      signalRsi: manualDirection === 'LONG' ? config.rsiBuyThreshold : config.rsiSellThreshold,
      biasSetNumber: 1,
      note: manualNote.trim() || undefined,
      configSnapshot: {
        stopLossPoints: config.stopLossPoints,
        targetPoints: config.targetPoints,
        rsiBuyThreshold: config.rsiBuyThreshold,
        rsiSellThreshold: config.rsiSellThreshold,
        entryBufferPoints: config.entryBufferPoints,
        maxTradesPerDay: config.maxTradesPerDay,
      },
    });

    setActiveMonth(manualDate.slice(0, 7));
    setSelectedDate(manualDate);
    setManualNote('');
    setShowAddForm(false);
  };

  const handleExportCsv = () => {
    if (filteredEntries.length === 0) return;
    const rows = [
      [
        'Date',
        'Symbol',
        'Direction',
        'Entry Time',
        'Exit Time',
        'Entry Price',
        'Exit Price',
        'Exit Reason',
        'P&L Points',
        'P&L INR',
        'Signal RSI',
        'Bias Set',
        'Source',
        'Batch Label',
        'Notes',
      ],
      ...filteredEntries.map((e: PaperTradeEntry) => [
        e.date,
        e.symbol,
        e.direction,
        e.entryTime,
        e.exitTime || '',
        e.entryPrice.toFixed(2),
        e.exitPrice !== undefined ? e.exitPrice.toFixed(2) : '',
        e.exitReason,
        e.pnlPoints.toFixed(2),
        e.pnlRupees.toFixed(2),
        e.signalRsi.toFixed(2),
        String(e.biasSetNumber),
        e.source,
        e.batchLabel || '',
        e.note || '',
      ]),
    ];

    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neoalgo_paper_calendar_${activeMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Paper Trade Monthly Calendar
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Review saved backtested and paper-traded executions day by day,
            track weekly P&amp;L consistency, and maintain trade notes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenManualForm()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Log Paper Trade</span>
          </button>

          {filteredEntries.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </section>

      {/* Manual Trade Entry Form (collapsible) */}
      {showAddForm && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Log Paper Trade to Calendar
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                P&amp;L in Rupees is automatically calculated using your active
                lot sizing ({config.lots} lot × {config.lotSize} qty).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              aria-label="Close manual trade form"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <form
            onSubmit={handleSubmitManualTrade}
            className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end"
          >
            <label className="block col-span-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-slate-600">
                Trade Date
              </span>
              <input
                type="date"
                required
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="block col-span-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-slate-600">
                Symbol
              </span>
              <input
                type="text"
                value={manualSymbol}
                onChange={(e) => setManualSymbol(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">
                Side
              </span>
              <select
                value={manualDirection}
                onChange={(e) =>
                  setManualDirection(e.target.value as 'LONG' | 'SHORT')
                }
                className="mt-1 w-full px-2.5 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">
                Entry Time
              </span>
              <input
                type="time"
                value={manualEntryTime}
                onChange={(e) => setManualEntryTime(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">
                Exit Time
              </span>
              <input
                type="time"
                value={manualExitTime}
                onChange={(e) => setManualExitTime(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">
                Exit Reason
              </span>
              <select
                value={manualReason}
                onChange={(e) =>
                  setManualReason(e.target.value as TradeExitReason)
                }
                className="mt-1 w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="TARGET_HIT">Target Hit</option>
                <option value="STRICT_SL_HIT">Strict SL</option>
                <option value="TRAILED_COST_EXIT">Cost SL Exit</option>
                <option value="EOD_SQUARE_OFF">EOD Square-Off</option>
              </select>
            </label>

            <label className="block col-span-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-slate-600">
                Entry Price
              </span>
              <input
                type="number"
                step="0.05"
                required
                value={manualEntryPrice}
                onChange={(e) => setManualEntryPrice(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="block col-span-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-slate-600">
                Exit Price
              </span>
              <input
                type="number"
                step="0.05"
                required
                value={manualExitPrice}
                onChange={(e) => setManualExitPrice(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="block col-span-2 sm:col-span-3">
              <span className="text-[11px] font-medium text-slate-600">
                Trade Note (optional)
              </span>
              <input
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="Clean breakout after lower-high base shift..."
                className="mt-1 w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <button
              type="submit"
              className="col-span-2 sm:col-span-1 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Save Trade
            </button>
          </form>
        </section>
      )}

      {/* Empty State when Paper Journal has 0 entries */}
      {journal.entries.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl px-6 py-14 text-center space-y-4">
          <div className="mx-auto w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <CalendarDays className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1.5 max-w-lg mx-auto">
            <h2 className="font-display text-base font-semibold text-slate-900">
              No Paper Trades Saved to Calendar Yet
            </h2>
            <p className="text-sm text-slate-600">
              Run a custom range or 1-year Fyers backtest and click{' '}
              <strong>Save to Paper Calendar</strong> to populate every month
              automatically, or save trades from your current Strategy Lab
              session.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onGoToBacktest}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Run 1-Year Backtest &amp; Save</span>
            </button>
            {currentLabTradesCount > 0 && (
              <button
                type="button"
                onClick={onSaveCurrentLabSession}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>
                  Save Current Lab Session ({currentLabTradesCount} trades)
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onGoToLab}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Open Strategy Lab</span>
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Calendar Control Toolbar */}
          <section className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
            {/* Month Navigation */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveMonth((m) => shiftMonth(m, -1))}
                aria-label="Previous month"
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>

              <div className="min-w-[168px] text-center font-display text-sm font-bold text-slate-900">
                {formatMonthLong(activeMonth)}
              </div>

              <button
                type="button"
                onClick={() => setActiveMonth((m) => shiftMonth(m, 1))}
                aria-label="Next month"
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => setActiveMonth(todayIst.slice(0, 7))}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                Today
              </button>
            </div>

            {/* Filters & Unit Toggle */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'ALL', label: 'All Sources' },
                    { id: 'BACKTEST_1Y', label: '1Y Backtest' },
                    { id: 'STRATEGY_LAB', label: 'Strategy Lab' },
                    { id: 'MANUAL', label: 'Manual' },
                  ] as { id: SourceFilter; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSourceFilter(opt.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      sourceFilter === opt.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setUnit('points')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    unit === 'points'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Points
                </button>
                <button
                  type="button"
                  onClick={() => setUnit('rupees')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    unit === 'rupees'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Rupees (₹)
                </button>
              </div>
            </div>
          </section>

          {/* 4-Column Monthly Performance KPI Strip */}
          <section
            aria-label="Monthly Paper Trade Summary"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
          >
            <div className="px-5 py-4">
              <div className="text-xs font-medium text-slate-500">
                {formatMonthLabel(activeMonth)} Net P&amp;L
              </div>
              <div
                className={`mt-1.5 font-mono tabular-nums text-2xl font-bold ${
                  monthStats.netPoints > 0
                    ? 'text-emerald-700'
                    : monthStats.netPoints < 0
                    ? 'text-red-600'
                    : 'text-slate-900'
                }`}
              >
                {monthStats.netPoints >= 0 ? '+' : ''}
                {monthStats.netPoints.toFixed(1)} pts
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {monthStats.netRupees >= 0 ? '+₹' : '-₹'}
                {Math.abs(monthStats.netRupees).toLocaleString('en-IN', {
                  maximumFractionDigits: 0,
                })}
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="text-xs font-medium text-slate-500">
                Monthly Accuracy &amp; PF
              </div>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {monthStats.winRatePct.toFixed(1)}%
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  PF {monthStats.profitFactor.toFixed(2)}
                </span>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {monthStats.wins}W / {monthStats.losses}L /{' '}
                {monthStats.breakevens}BE ({monthStats.totalTrades} trades)
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="text-xs font-medium text-slate-500">
                Active Trading Days
              </div>
              <div className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900">
                {monthStats.tradingDays} days
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                <span className="text-emerald-700">
                  {monthStats.winningDays} Green
                </span>{' '}
                ·{' '}
                <span className="text-red-600">
                  {monthStats.losingDays} Red
                </span>{' '}
                · {monthStats.flatDays} Flat
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="text-xs font-medium text-slate-500">
                Best / Worst Day
              </div>
              <div className="mt-1.5 font-mono tabular-nums text-sm font-semibold space-y-0.5">
                <div className="text-emerald-700">
                  {monthStats.bestDay
                    ? `${formatPnl(
                        monthStats.bestDay.points,
                        monthStats.bestDay.rupees
                      )} (${monthStats.bestDay.date.slice(5)})`
                    : '--'}
                </div>
                <div className="text-red-600">
                  {monthStats.worstDay && monthStats.worstDay.points < 0
                    ? `${formatPnl(
                        monthStats.worstDay.points,
                        monthStats.worstDay.rupees
                      )} (${monthStats.worstDay.date.slice(5)})`
                    : '--'}
                </div>
              </div>
            </div>
          </section>

          {/* Main Calendar + Day Trade Inspector Split */}
          <section className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
            {/* Monthly Calendar Grid with Weekly Totals */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Click any day tile to inspect individual paper trades and add
                  execution notes.
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  {confirmClearScope === 'month' ? (
                    <span className="inline-flex items-center gap-2 text-red-700">
                      <span>Clear {formatMonthLabel(activeMonth)}?</span>
                      <button
                        type="button"
                        onClick={() => {
                          journal.deleteMonthEntries(activeMonth);
                          setConfirmClearScope(null);
                        }}
                        className="font-semibold underline cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearScope(null)}
                        className="text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : monthEntries.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearScope('month')}
                      className="text-slate-500 hover:text-red-600 font-medium cursor-pointer"
                    >
                      Clear Month
                    </button>
                  ) : null}

                  {confirmClearScope === 'all' ? (
                    <span className="inline-flex items-center gap-2 text-red-700">
                      <span>Clear all {journal.entries.length} trades?</span>
                      <button
                        type="button"
                        onClick={() => {
                          journal.clearAllEntries();
                          setConfirmClearScope(null);
                        }}
                        className="font-semibold underline cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearScope(null)}
                        className="text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearScope('all')}
                      className="text-slate-400 hover:text-red-600 font-medium cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[680px] p-4 space-y-2">
                  {/* Weekday Header Row + Week Total */}
                  <div className="grid grid-cols-8 gap-2 text-[11px] font-semibold text-slate-500 px-1">
                    {WEEKDAYS.map((wd) => (
                      <div key={wd} className="text-center">
                        {wd}
                      </div>
                    ))}
                    <div className="text-center text-slate-700">Week</div>
                  </div>

                  {/* Calendar Week Rows */}
                  {calendarWeeks.map((week, wIdx) => {
                    let weekPts = 0;
                    let weekInr = 0;
                    let weekTrades = 0;
                    let weekActiveDays = 0;

                    for (const cell of week) {
                      if (!cell.inMonth) continue;
                      const b = filteredDailyMap.get(cell.date);
                      if (b) {
                        weekPts += b.netPoints;
                        weekInr += b.netRupees;
                        weekTrades += b.trades.length;
                        weekActiveDays += 1;
                      }
                    }

                    return (
                      <div key={wIdx} className="grid grid-cols-8 gap-2">
                        {week.map((cell) => {
                          const bucket = filteredDailyMap.get(cell.date);
                          const isSelected = selectedDate === cell.date;
                          const isToday = cell.date === todayIst;

                          let tileStyle =
                            'bg-white border-slate-200/80 hover:bg-slate-50';
                          if (!cell.inMonth) {
                            tileStyle =
                              'bg-slate-50/40 border-slate-100 text-slate-300';
                          } else if (bucket) {
                            if (bucket.netPoints > 0.5) {
                              tileStyle =
                                'bg-emerald-50/80 border-emerald-200 hover:bg-emerald-50';
                            } else if (bucket.netPoints < -0.5) {
                              tileStyle =
                                'bg-red-50/80 border-red-200 hover:bg-red-50';
                            } else {
                              tileStyle =
                                'bg-amber-50/70 border-amber-200 hover:bg-amber-50';
                            }
                          } else if (cell.isWeekend) {
                            tileStyle =
                              'bg-slate-50/70 border-slate-200/60 hover:bg-slate-100/60';
                          }

                          return (
                            <button
                              key={cell.date}
                              type="button"
                              onClick={() => {
                                if (!cell.inMonth) {
                                  setActiveMonth(cell.date.slice(0, 7));
                                }
                                setSelectedDate(cell.date);
                              }}
                              className={`min-h-[82px] p-2 rounded-lg border text-left flex flex-col justify-between transition-colors cursor-pointer ${tileStyle} ${
                                isSelected
                                  ? 'ring-2 ring-blue-600 ring-offset-1'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`font-mono tabular-nums text-xs font-semibold ${
                                    !cell.inMonth
                                      ? 'text-slate-300'
                                      : isToday
                                      ? 'text-blue-700'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {cell.dayNum}
                                </span>
                                {bucket && cell.inMonth && (
                                  <span className="font-mono tabular-nums text-[10px] text-slate-500">
                                    {bucket.trades.length}T
                                  </span>
                                )}
                              </div>

                              {bucket && cell.inMonth ? (
                                <div className="space-y-0.5">
                                  <div
                                    className={`font-mono tabular-nums text-xs font-bold leading-tight truncate ${
                                      bucket.netPoints > 0.5
                                        ? 'text-emerald-700'
                                        : bucket.netPoints < -0.5
                                        ? 'text-red-600'
                                        : 'text-amber-700'
                                    }`}
                                  >
                                    {formatPnl(
                                      bucket.netPoints,
                                      bucket.netRupees,
                                      true
                                    )}
                                  </div>
                                  <div className="font-mono tabular-nums text-[10px] text-slate-500">
                                    {bucket.wins}W/{bucket.losses}L
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-300">
                                  {cell.inMonth && !cell.isWeekend ? '—' : ''}
                                </div>
                              )}
                            </button>
                          );
                        })}

                        {/* Weekly Summary Tile */}
                        <div className="min-h-[82px] p-2 rounded-lg border border-slate-200 bg-slate-50/90 flex flex-col justify-between">
                          <div className="text-[10px] font-medium text-slate-500">
                            Wk {wIdx + 1}
                          </div>
                          {weekTrades > 0 ? (
                            <div className="space-y-0.5">
                              <div
                                className={`font-mono tabular-nums text-xs font-bold leading-tight truncate ${
                                  weekPts > 0.5
                                    ? 'text-emerald-700'
                                    : weekPts < -0.5
                                    ? 'text-red-600'
                                    : 'text-slate-700'
                                }`}
                              >
                                {formatPnl(weekPts, weekInr, true)}
                              </div>
                              <div className="font-mono tabular-nums text-[10px] text-slate-500">
                                {weekActiveDays}d · {weekTrades}T
                              </div>
                            </div>
                          ) : (
                            <div className="font-mono text-[11px] text-slate-400">
                              —
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Panel: Selected Day Trade Inspector */}
            <aside className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    {selectedDate ? `Session ${selectedDate}` : 'Day Inspector'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                    {selectedDayBucket
                      ? `${selectedDayBucket.trades.length} trade${
                          selectedDayBucket.trades.length === 1 ? '' : 's'
                        } · ${selectedDayBucket.wins}W / ${
                          selectedDayBucket.losses
                        }L / ${selectedDayBucket.breakevens}BE`
                      : 'No saved paper trades on this date'}
                  </p>
                </div>

                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => handleOpenManualForm(selectedDate)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Add</span>
                  </button>
                )}
              </div>

              {selectedDayBucket ? (
                <>
                  {/* Selected Day Summary Bar */}
                  <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-slate-500">Day Net P&amp;L</div>
                      <div
                        className={`font-mono tabular-nums text-base font-bold ${
                          selectedDayBucket.netPoints >= 0
                            ? 'text-emerald-700'
                            : 'text-red-600'
                        }`}
                      >
                        {selectedDayBucket.netPoints >= 0 ? '+' : ''}
                        {selectedDayBucket.netPoints.toFixed(1)} pts (
                        {selectedDayBucket.netRupees >= 0 ? '+₹' : '-₹'}
                        {Math.abs(selectedDayBucket.netRupees).toLocaleString(
                          'en-IN',
                          { maximumFractionDigits: 0 }
                        )}
                        )
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        journal.deleteDayEntries(selectedDayBucket.date)
                      }
                      className="text-xs font-medium text-slate-500 hover:text-red-600 cursor-pointer"
                    >
                      Clear Day
                    </button>
                  </div>

                  {/* Individual Saved Paper Trades */}
                  <div className="divide-y divide-slate-200 max-h-[540px] overflow-y-auto">
                    {selectedDayBucket.trades.map((trade, idx) => (
                      <div key={trade.id} className="px-5 py-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                              <span className="font-semibold text-slate-500">
                                #{idx + 1}
                              </span>
                              <span
                                className={`font-bold ${
                                  trade.direction === 'LONG'
                                    ? 'text-emerald-700'
                                    : 'text-red-600'
                                }`}
                              >
                                {trade.direction}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-700">
                                {trade.entryTime}–{trade.exitTime || '--'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {trade.symbol} · {formatSourceLabel(trade.source)}
                            </div>
                          </div>

                          <div className="flex items-start gap-2">
                            <div className="text-right font-mono tabular-nums">
                              <div
                                className={`text-xs font-bold ${
                                  trade.pnlPoints > 0.5
                                    ? 'text-emerald-700'
                                    : trade.pnlPoints < -0.5
                                    ? 'text-red-600'
                                    : 'text-amber-700'
                                }`}
                              >
                                {trade.pnlPoints >= 0 ? '+' : ''}
                                {trade.pnlPoints.toFixed(1)} pts
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {trade.pnlRupees >= 0 ? '+₹' : '-₹'}
                                {Math.abs(trade.pnlRupees).toLocaleString(
                                  'en-IN',
                                  { maximumFractionDigits: 0 }
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => journal.deleteEntry(trade.id)}
                              aria-label="Delete paper trade"
                              className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                            >
                              <Trash2
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                          <div>
                            Entry:{' '}
                            <span className="text-slate-900 font-semibold">
                              {trade.entryPrice.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            Exit:{' '}
                            <span className="text-slate-900 font-semibold">
                              {trade.exitPrice !== undefined
                                ? trade.exitPrice.toFixed(2)
                                : '--'}
                            </span>
                          </div>
                          <div>
                            Outcome:{' '}
                            <span className="font-sans font-medium text-slate-800">
                              {formatExitLabel(trade.exitReason)}
                            </span>
                          </div>
                          <div>
                            RSI(2):{' '}
                            <span className="text-slate-900">
                              {trade.signalRsi.toFixed(1)}
                            </span>
                          </div>
                        </div>

                        {trade.configSnapshot && (
                          <div className="text-[11px] font-mono tabular-nums text-slate-500">
                            SL {trade.configSnapshot.stopLossPoints} / Tgt{' '}
                            {trade.configSnapshot.targetPoints} · RSI &lt;
                            {trade.configSnapshot.rsiBuyThreshold}/&gt;
                            {trade.configSnapshot.rsiSellThreshold} · Buf{' '}
                            {trade.configSnapshot.entryBufferPoints}
                          </div>
                        )}

                        <input
                          type="text"
                          value={trade.note || ''}
                          onChange={(e) =>
                            journal.updateNote(trade.id, e.target.value)
                          }
                          placeholder="Add trade execution note..."
                          aria-label={`Execution note for trade ${idx + 1}`}
                          className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="px-5 py-10 text-center space-y-2">
                  <p className="text-xs text-slate-500">
                    Select any green or red date tile on the calendar to review
                    saved trades, or log a manual paper trade for this day.
                  </p>
                </div>
              )}
            </aside>
          </section>

          {/* Monthly Rollup Index Table (Quick Month Jump across 1Y) */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Monthly Performance Directory ({filteredMonthlyBuckets.length}{' '}
                  months)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click any month row to jump directly to that month in the
                  calendar
                </p>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-600">
                All-Time Saved:{' '}
                <span
                  className={`font-semibold ${
                    journal.stats.netPoints >= 0
                      ? 'text-emerald-700'
                      : 'text-red-600'
                  }`}
                >
                  {journal.stats.netPoints >= 0 ? '+' : ''}
                  {journal.stats.netPoints.toFixed(1)} pts
                </span>{' '}
                ({journal.entries.length} trades)
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Month</th>
                    <th className="py-2.5 px-3 text-right">Days (G / R)</th>
                    <th className="py-2.5 px-3 text-right">Trades</th>
                    <th className="py-2.5 px-3 text-right">W / L / BE</th>
                    <th className="py-2.5 px-3 text-right">Accuracy</th>
                    <th className="py-2.5 px-3 text-right">Profit Factor</th>
                    <th className="py-2.5 px-3 text-right">Net Points</th>
                    <th className="py-2.5 px-4 text-right">Net P&amp;L (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredMonthlyBuckets.map((m) => {
                    const isCurrent = m.month === activeMonth;
                    return (
                      <tr
                        key={m.month}
                        onClick={() => setActiveMonth(m.month)}
                        className={`h-10 transition-colors cursor-pointer ${
                          isCurrent ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 font-display font-semibold text-slate-900 whitespace-nowrap">
                          {m.label}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {m.tradingDays}{' '}
                          <span className="text-slate-400">
                            ({m.winningDays}G / {m.losingDays}R)
                          </span>
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-slate-700">
                          {m.tradesCount}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {m.wins} / {m.losses} / {m.breakevens}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-slate-900 font-medium">
                          {m.winRatePct.toFixed(1)}%
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-slate-700">
                          {m.profitFactor.toFixed(2)}
                        </td>
                        <td
                          className={`px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            m.netPoints >= 0
                              ? 'text-emerald-700'
                              : 'text-red-600'
                          }`}
                        >
                          {m.netPoints >= 0 ? '+' : ''}
                          {m.netPoints.toFixed(1)}
                        </td>
                        <td
                          className={`px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            m.netRupees >= 0
                              ? 'text-emerald-700'
                              : 'text-red-600'
                          }`}
                        >
                          {m.netRupees >= 0 ? '+₹' : '-₹'}
                          {Math.abs(m.netRupees).toLocaleString('en-IN', {
                            maximumFractionDigits: 0,
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
