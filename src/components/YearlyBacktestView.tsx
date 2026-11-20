import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  Calendar,
  CalendarPlus,
  Database,
  Download,
  Play,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DEFAULT_STRATEGY_CONFIG,
  runMultiDayBacktest,
} from '../engine/niftyStrategy';
import { SaveBatchOutcome } from '../hooks/usePaperTradeJournal';
import {
  Candle,
  SavedBacktestReport,
  StrategyConfig,
  TradeRecord,
} from '../types/strategy';
import { StrategyControls } from './StrategyControls';
import { StrategyOptimizerPanel } from './StrategyOptimizerPanel';
import {
  FYERS_INDEX_PRESETS,
  normalizeFyersSymbol,
} from '../utils/fyersSymbols';
import {
  getFallbackInstrumentMeta,
  InstrumentMeta,
} from '../utils/optionsEngine';

interface YearlyBacktestViewProps {
  config: StrategyConfig;
  onChangeConfig: (next: StrategyConfig) => void;
  onResetDefaults: () => void;
  onInspectDay: (candles: Candle[], date: string, symbol: string) => void;
  hasUnsavedChanges?: boolean;
  justSaved?: boolean;
  onSaveConfig?: () => void;
  onDiscardConfig?: () => void;
  onSaveBacktestToCalendar?: (
    trades: TradeRecord[],
    meta: {
      symbol: string;
      fromDate: string;
      toDate: string;
      config: StrategyConfig;
    }
  ) => SaveBatchOutcome;
  onSaveDayToCalendar?: (
    trades: TradeRecord[],
    date: string,
    symbol: string,
    config: StrategyConfig
  ) => SaveBatchOutcome;
  onOpenCalendar?: (month?: string | null, date?: string | null) => void;
  userId?: string | null;
  serverSavedReports?: SavedBacktestReport[] | null;
  theme?: 'dark' | 'light';
}

type DayFilter = 'all' | 'win' | 'loss' | 'notrade';

const SYMBOL_OPTIONS = FYERS_INDEX_PRESETS.map((o) => o.symbol);

const SAVED_REPORTS_KEY = 'neoalgo_saved_backtest_reports_v1';

function formatYYYYMMDD(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDaysYYYYMMDD(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function loadSavedReports(): SavedBacktestReport[] {
  try {
    const raw = window.localStorage.getItem(SAVED_REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedBacktestReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const YearlyBacktestView: React.FC<YearlyBacktestViewProps> = ({
  config,
  onChangeConfig,
  onResetDefaults,
  onInspectDay,
  hasUnsavedChanges,
  justSaved,
  onSaveConfig,
  onDiscardConfig,
  onSaveBacktestToCalendar,
  onSaveDayToCalendar,
  onOpenCalendar,
  userId = null,
  serverSavedReports = null,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const chartGridStroke = isDark ? '#1E293B' : '#e2e8f0';
  const chartTickFill = isDark ? '#94a3b8' : '#64748b';
  const chartZeroStroke = isDark ? '#475569' : '#94a3b8';
  const chartPosColor = isDark ? '#10b981' : '#16a34a';
  const chartNegColor = isDark ? '#ef4444' : '#dc2626';

  const [symbol, setSymbol] = useState('NSE:NIFTY50-INDEX');
  const [customSymbol, setCustomSymbol] = useState('');
  const [toDate, setToDate] = useState<string>(() => formatYYYYMMDD(new Date()));
  const [fromDate, setFromDate] = useState<string>(() =>
    shiftDaysYYYYMMDD(formatYYYYMMDD(new Date()), -365)
  );
  const [activePresetDays, setActivePresetDays] = useState<number | null>(365);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [calendarJumpTarget, setCalendarJumpTarget] = useState<{
    month?: string | null;
    date?: string | null;
  } | null>(null);
  const [reportName, setReportName] = useState('');
  const [unit, setUnit] = useState<'points' | 'rupees'>('points');
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');
  const [autoOptimizeToken, setAutoOptimizeToken] = useState(0);

  const scopedReportsKey = userId
    ? `${SAVED_REPORTS_KEY}_${userId}`
    : SAVED_REPORTS_KEY;

  const [savedReports, setSavedReports] = useState<SavedBacktestReport[]>(() =>
    serverSavedReports ?? loadSavedReports()
  );

  useEffect(() => {
    if (Array.isArray(serverSavedReports)) {
      setSavedReports(serverSavedReports);
    }
  }, [serverSavedReports]);

  const persistReports = (next: SavedBacktestReport[]) => {
    setSavedReports(next);
    try {
      window.localStorage.setItem(scopedReportsKey, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
    if (userId) {
      void fetch('/api/user/backtest-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reports: next }),
      }).catch(() => {
        // Keep local fallback
      });
    }
  };

  const [fetchedRange, setFetchedRange] = useState<{
    symbol: string;
    fromDate: string;
    toDate: string;
    candles: Candle[];
    source?: 'database' | 'hybrid' | 'fyers';
  } | null>(null);

  const activeSymbol = normalizeFyersSymbol(customSymbol.trim() || symbol);
  const [backtestInstrumentMeta, setBacktestInstrumentMeta] =
    useState<InstrumentMeta>(() => getFallbackInstrumentMeta(activeSymbol));
  const [loadingBacktestLot, setLoadingBacktestLot] = useState(false);

  useEffect(() => {
    const fallback = getFallbackInstrumentMeta(activeSymbol);
    setBacktestInstrumentMeta(fallback);
    if (!userId) return;

    let cancelled = false;
    setLoadingBacktestLot(true);
    (async () => {
      try {
        const params = new URLSearchParams({ symbol: activeSymbol });
        const resp = await fetch(
          `/api/fyers/instrument-meta?${params.toString()}`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (!resp.ok || cancelled) return;
        const meta = (await resp.json()) as InstrumentMeta;
        if (cancelled) return;
        setBacktestInstrumentMeta(meta);
        if (meta.lotSize !== config.lotSize) {
          onChangeConfig({ ...config, lotSize: meta.lotSize });
        }
      } catch {
        // Keep fallback metadata
      } finally {
        if (!cancelled) setLoadingBacktestLot(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only re-sync lot size when the backtest symbol changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, userId]);

  const applyQuickPreset = (daysCount: number) => {
    setActivePresetDays(daysCount);
    setFromDate(shiftDaysYYYYMMDD(toDate, -daysCount));
  };

  const handleRunBacktest = async (autoOptimizeAfter = false) => {
    setErrorMsg(null);
    setSaveFeedback(null);

    if (!fromDate || !toDate) {
      setErrorMsg('Select both a From Date and a To Date.');
      return;
    }
    if (fromDate > toDate) {
      setErrorMsg('From Date cannot be after To Date.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        symbol: activeSymbol,
        fromDate,
        toDate,
      });
      const resp = await fetch(`/api/fyers/history-range?${params.toString()}`, {
        credentials: 'include',
      });
      const data = (await resp.json()) as {
        symbol?: string;
        fromDate?: string;
        toDate?: string;
        candles?: Candle[];
        source?: 'database' | 'hybrid' | 'fyers';
        error?: string;
      };
      if (!resp.ok || !data.candles) {
        throw new Error(
          data.error ||
            'Unable to fetch Fyers historical candles. Connect your Fyers account first.'
        );
      }
      if (data.candles.length === 0) {
        setErrorMsg(
          `Fyers returned 0 regular-session 5-min candles for ${activeSymbol} between ${data.fromDate} and ${data.toDate}. Verify the selected date range covers active NSE trading sessions.`
        );
        return;
      }
      setFetchedRange({
        symbol: data.symbol || activeSymbol,
        fromDate: data.fromDate || fromDate,
        toDate: data.toDate || toDate,
        candles: data.candles,
        source: data.source,
      });
      setReportName(
        `${data.symbol || activeSymbol} (${data.fromDate || fromDate} to ${
          data.toDate || toDate
        })`
      );
      if (autoOptimizeAfter) {
        setAutoOptimizeToken((n) => n + 1);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Backtest range fetch failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const backtest = useMemo(() => {
    if (!fetchedRange) return null;
    return runMultiDayBacktest(fetchedRange.candles, config);
  }, [fetchedRange, config]);

  const filteredDays = useMemo(() => {
    if (!backtest) return [];
    const list = [...backtest.dailySummaries].reverse();
    switch (dayFilter) {
      case 'win':
        return list.filter((d) => d.dayPoints > 0.5);
      case 'loss':
        return list.filter((d) => d.dayPoints < -0.5);
      case 'notrade':
        return list.filter((d) => d.tradesCount === 0);
      default:
        return list;
    }
  }, [backtest, dayFilter]);

  const zeroOffset = useMemo(() => {
    if (!backtest || backtest.dailySummaries.length === 0) return 1;
    let maxV = 0;
    let minV = 0;
    for (const d of backtest.dailySummaries) {
      if (d.cumulativePoints > maxV) maxV = d.cumulativePoints;
      if (d.cumulativePoints < minV) minV = d.cumulativePoints;
    }
    if (maxV <= 0) return 0;
    if (minV >= 0) return 1;
    return maxV / (maxV - minV);
  }, [backtest]);

  const handleSaveSnapshot = () => {
    if (!backtest || !fetchedRange) return;
    const trimmed =
      reportName.trim() ||
      `${fetchedRange.symbol} (${fetchedRange.fromDate} to ${fetchedRange.toDate})`;

    const report: SavedBacktestReport = {
      id: `rep_${Date.now()}`,
      name: trimmed,
      savedAt: new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      symbol: fetchedRange.symbol,
      fromDate: fetchedRange.fromDate,
      toDate: fetchedRange.toDate,
      config: { ...config },
      summary: {
        totalDays: backtest.totalDays,
        winningDays: backtest.winningDays,
        losingDays: backtest.losingDays,
        totalTrades: backtest.totalTrades,
        wins: backtest.wins,
        losses: backtest.losses,
        breakevens: backtest.breakevens,
        winRatePct: backtest.winRatePct,
        accuracyExclBreakevenPct: backtest.accuracyExclBreakevenPct,
        netPoints: backtest.netPoints,
        netRupees: backtest.netRupees,
        profitFactor: backtest.profitFactor,
        maxDrawdownPoints: backtest.maxDrawdownPoints,
        expectancyPoints: backtest.expectancyPoints,
        avgWinPoints: backtest.avgWinPoints,
        avgLossPoints: backtest.avgLossPoints,
      },
      monthlySummaries: backtest.monthlySummaries,
    };

    persistReports([report, ...savedReports]);
    setCalendarJumpTarget(null);
    setSaveFeedback(`Saved "${trimmed}" to Saved Backtest Reports.`);
  };

  const handleSaveRangeToPaperCalendar = () => {
    if (!backtest || !fetchedRange || !onSaveBacktestToCalendar) return;
    if (backtest.allTrades.length === 0) {
      setCalendarJumpTarget(null);
      setSaveFeedback('No trades executed in this date range to save.');
      return;
    }
    const outcome = onSaveBacktestToCalendar(backtest.allTrades, {
      symbol: fetchedRange.symbol,
      fromDate: fetchedRange.fromDate,
      toDate: fetchedRange.toDate,
      config,
    });
    setCalendarJumpTarget({ month: outcome.latestMonth, date: null });
    setSaveFeedback(
      outcome.added > 0
        ? `Saved ${outcome.added} backtested paper trade${
            outcome.added === 1 ? '' : 's'
          } (${fetchedRange.fromDate} → ${fetchedRange.toDate}) to Monthly Paper Calendar${
            outcome.skippedDuplicates > 0
              ? ` (${outcome.skippedDuplicates} duplicates skipped)`
              : ''
          }.`
        : `All ${outcome.skippedDuplicates} trades from this backtest are already saved in your Monthly Paper Calendar.`
    );
  };

  const handleSaveSingleDayToPaperCalendar = (date: string) => {
    if (!backtest || !fetchedRange || !onSaveDayToCalendar) return;
    const dayTrades = backtest.allTrades.filter((t) => t.date === date);
    if (dayTrades.length === 0) return;
    const outcome = onSaveDayToCalendar(
      dayTrades,
      date,
      fetchedRange.symbol,
      config
    );
    setCalendarJumpTarget({ month: date.slice(0, 7), date });
    setSaveFeedback(
      outcome.added > 0
        ? `Saved ${outcome.added} paper trade${
            outcome.added === 1 ? '' : 's'
          } for ${date} to Monthly Paper Calendar.`
        : `All ${outcome.skippedDuplicates} paper trades for ${date} are already saved in Monthly Paper Calendar.`
    );
  };

  const handleExportCsv = () => {
    if (!backtest || !fetchedRange) return;
    const summaryRows = [
      ['NeoAlgo Backtest Report'],
      ['Symbol', fetchedRange.symbol],
      ['Period', `${fetchedRange.fromDate} to ${fetchedRange.toDate}`],
      ['Trading Days', String(backtest.totalDays)],
      ['Winning Days', String(backtest.winningDays)],
      ['Losing Days', String(backtest.losingDays)],
      ['Total Trades', String(backtest.totalTrades)],
      ['Winning Trades', String(backtest.wins)],
      ['Losing Trades', String(backtest.losses)],
      ['Cost/Breakeven Exits', String(backtest.breakevens)],
      ['Overall Win Accuracy (%)', backtest.winRatePct.toFixed(2)],
      [
        'Decisive Accuracy excl. Breakeven (%)',
        backtest.accuracyExclBreakevenPct.toFixed(2),
      ],
      ['Total Net P&L (Points)', backtest.netPoints.toFixed(2)],
      ['Total Net P&L (INR)', backtest.netRupees.toFixed(2)],
      ['Profit Factor', backtest.profitFactor.toFixed(2)],
      ['Max Drawdown (Points)', backtest.maxDrawdownPoints.toFixed(2)],
      ['Entry Buffer (Points)', String(config.entryBufferPoints)],
      ['SL / Target (Points)', `${config.stopLossPoints} / ${config.targetPoints}`],
      ['Max Trades / Day', String(config.maxTradesPerDay)],
      [
        'Stop After Target Hit',
        config.stopAfterTargetHit ? 'Enabled (Next trade only after SL)' : 'Disabled',
      ],
      [],
      [
        'Trade #',
        'Date',
        'Direction',
        'Bias Set',
        'Signal Time',
        'Signal RSI',
        'Base Level',
        'Trigger Level',
        'Entry Time',
        'Entry Price',
        'Exit Time',
        'Exit Price',
        'Exit Reason',
        'Trailed To Cost',
        'P&L Points',
        'P&L INR',
      ],
      ...backtest.allTrades.map((t) => [
        String(t.id),
        t.date || '',
        t.direction,
        String(t.biasSetNumber),
        t.signalTime,
        t.signalRsi.toFixed(2),
        t.rawTriggerLevel.toFixed(2),
        t.triggerLevel.toFixed(2),
        t.entryTime,
        t.entryPrice.toFixed(2),
        t.exitTime || '',
        t.exitPrice !== undefined ? t.exitPrice.toFixed(2) : '',
        t.exitReason,
        t.trailedToCost ? 'YES' : 'NO',
        t.pnlPoints.toFixed(2),
        t.pnlRupees.toFixed(2),
      ]),
    ];

    const csvContent = summaryRows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neoalgo_backtest_${fetchedRange.fromDate}_${fetchedRange.toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    if (!backtest || !fetchedRange) return;
    const payload = {
      symbol: fetchedRange.symbol,
      fromDate: fetchedRange.fromDate,
      toDate: fetchedRange.toDate,
      exportedAt: new Date().toISOString(),
      config,
      summary: {
        totalDays: backtest.totalDays,
        winningDays: backtest.winningDays,
        losingDays: backtest.losingDays,
        flatDays: backtest.flatDays,
        dayWinRatePct: backtest.dayWinRatePct,
        totalTrades: backtest.totalTrades,
        wins: backtest.wins,
        losses: backtest.losses,
        breakevens: backtest.breakevens,
        winRatePct: backtest.winRatePct,
        accuracyExclBreakevenPct: backtest.accuracyExclBreakevenPct,
        netPoints: backtest.netPoints,
        netRupees: backtest.netRupees,
        profitFactor: backtest.profitFactor,
        maxDrawdownPoints: backtest.maxDrawdownPoints,
        expectancyPoints: backtest.expectancyPoints,
        avgWinPoints: backtest.avgWinPoints,
        avgLossPoints: backtest.avgLossPoints,
        bestDayPoints: backtest.bestDayPoints,
        worstDayPoints: backtest.worstDayPoints,
        maxConsecutiveWins: backtest.maxConsecutiveWins,
        maxConsecutiveLosses: backtest.maxConsecutiveLosses,
      },
      monthlySummaries: backtest.monthlySummaries,
      dailySummaries: backtest.dailySummaries.map(
        ({ candles: _omit, ...rest }) => rest
      ),
      trades: backtest.allTrades,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neoalgo_backtest_${fetchedRange.fromDate}_${fetchedRange.toDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteSavedReport = (id: string) => {
    persistReports(savedReports.filter((r) => r.id !== id));
  };

  const handleApplySavedConfig = (report: SavedBacktestReport) => {
    onChangeConfig({ ...DEFAULT_STRATEGY_CONFIG, ...report.config });
    if (SYMBOL_OPTIONS.includes(report.symbol)) {
      setSymbol(report.symbol);
      setCustomSymbol('');
    } else {
      setCustomSymbol(report.symbol);
    }
    setFromDate(report.fromDate);
    setToDate(report.toDate);
    setActivePresetDays(null);
    setSaveFeedback(
      `Loaded parameters and date range (${report.fromDate} → ${report.toDate}) from "${report.name}". Click Run Backtest to re-fetch.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Custom Range &amp; 1-Year Fyers Backtest
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Select any custom date range (up to 1 year) of 5-minute Fyers NSE
            data. Evaluates daily 4-candle bias, RSI({config.rsiLength}) setup,
            trailing Lower-High/Higher-Low base candle, {config.entryBufferPoints}pt
            entry buffer, and max {config.maxTradesPerDay} trades/day.
          </p>
        </div>
      </section>

      {/* Date Range & Symbol Fetch Bar */}
      <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setCustomSymbol('');
              }}
              aria-label="Backtest Fyers Symbol"
              className="px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {FYERS_INDEX_PRESETS.map((opt) => (
                <option key={opt.symbol} value={opt.symbol}>
                  {opt.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  e.preventDefault();
                  void handleRunBacktest(false);
                }
              }}
              placeholder="e.g. SBIN, RELIANCE"
              aria-label="Custom Fyers backtest symbol"
              className="w-40 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
              {[
                { label: '30D', value: 30 },
                { label: '90D', value: 90 },
                { label: '180D', value: 180 },
                { label: '1 Year', value: 365 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => applyQuickPreset(opt.value)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    activePresetDays === opt.value
                      ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Calendar
                className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              <span>From</span>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setActivePresetDays(null);
                }}
                className="px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>To</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setActivePresetDays(null);
                }}
                className="px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <button
              type="button"
              onClick={() => void handleRunBacktest(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {loading ? 'Fetching Fyers 5m History...' : 'Run Backtest'}
              </span>
            </button>
          </div>
        </div>

        {/* Save / Export Report Bar when results exist */}
        {backtest && fetchedRange && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            {fetchedRange.source && (
              <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <Database
                  className="w-3.5 h-3.5 text-emerald-500 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {fetchedRange.symbol}
                  </span>{' '}
                  ·{' '}
                  {fetchedRange.source === 'database'
                    ? 'Served instantly from local historical DB (0 Fyers API calls)'
                    : fetchedRange.source === 'hybrid'
                    ? 'Loaded from local DB + synced missing dates from Fyers'
                    : 'Fetched from Fyers and saved permanently to local DB'}
                </span>
              </div>
            )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              <input
                type="text"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Report name (e.g. NIFTY 1Y Buf 1pt Max 3)"
                aria-label="Saved report name"
                className="flex-1 min-w-[220px] max-w-md px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:bg-white dark:focus:bg-[#161D2B] focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={handleSaveSnapshot}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Result</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onSaveBacktestToCalendar && backtest.allTrades.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveRangeToPaperCalendar}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    Save to Paper Calendar ({backtest.allTrades.length})
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#1F293B] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#1F293B] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export JSON</span>
              </button>
            </div>
          </div>
          </div>
        )}
      </section>

      {errorMsg && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-5 py-3.5 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {saveFeedback && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-5 py-3 text-xs text-emerald-800 dark:text-emerald-300 flex flex-wrap items-center justify-between gap-3">
          <span>{saveFeedback}</span>
          <div className="flex items-center gap-3">
            {calendarJumpTarget && onOpenCalendar && (
              <button
                type="button"
                onClick={() =>
                  onOpenCalendar(
                    calendarJumpTarget.month,
                    calendarJumpTarget.date
                  )
                }
                className="font-semibold text-emerald-900 dark:text-emerald-200 underline hover:text-emerald-700 dark:hover:text-emerald-100 cursor-pointer"
              >
                View in Paper Calendar →
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSaveFeedback(null);
                setCalendarJumpTarget(null);
              }}
              className="text-emerald-700 dark:text-emerald-300 hover:underline font-medium cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Built-in Parameter Optimizer (SL, Target, Max Trades/Day, RSI, Entry Buffer) */}
      <StrategyOptimizerPanel
        candles={fetchedRange ? fetchedRange.candles : null}
        periodLabel={
          fetchedRange
            ? `${fetchedRange.symbol} (${fetchedRange.fromDate} → ${fetchedRange.toDate})`
            : null
        }
        config={config}
        isFetchingData={loading}
        autoRunToken={autoOptimizeToken}
        onFetchAndOptimize={() => void handleRunBacktest(true)}
        onApplyConfig={(next, label) => {
          onChangeConfig(next);
          setSaveFeedback(label);
        }}
      />

      {/* Main 2-Column Layout with Live Parameter Tuning */}
      <section className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {!backtest ? (
            <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl px-6 py-16 text-center space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Select Any Date Range &amp; Run Your Fyers Backtest
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
                Pick a custom <strong className="text-slate-900 dark:text-slate-200">From</strong> and <strong className="text-slate-900 dark:text-slate-200">To</strong> date
                (or click 30D / 90D / 180D / 1 Year) and click{' '}
                <strong className="text-slate-900 dark:text-slate-200">Run Backtest</strong>. Once fetched, tweaking Entry
                Buffer, Max Trades/Day, SL, or Target recalculates the entire
                period immediately, and you can save or export the full report.
              </p>
            </div>
          ) : (
            <>
              {/* Primary 4-Column Period Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
                <div className="px-5 py-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Total Net P&amp;L
                  </div>
                  <div className="mt-1.5 font-mono tabular-nums text-2xl font-bold">
                    <span
                      className={
                        backtest.netPoints >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      {backtest.netPoints >= 0 ? '+' : ''}
                      {backtest.netPoints.toFixed(1)} pts
                    </span>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    {backtest.netRupees >= 0 ? '+₹' : '-₹'}
                    {Math.abs(backtest.netRupees).toLocaleString('en-IN', {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Trade Accuracy
                  </div>
                  <div className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {backtest.winRatePct.toFixed(1)}%
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    Excl. Cost SL: {backtest.accuracyExclBreakevenPct.toFixed(1)}%
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Winning vs. Losing Trades
                  </div>
                  <div className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
                    <span className="text-emerald-700 dark:text-emerald-400">{backtest.wins}W</span>
                    <span className="text-slate-300 dark:text-slate-700 mx-1">/</span>
                    <span className="text-red-600 dark:text-red-400">{backtest.losses}L</span>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    {backtest.breakevens} Cost Exit · {backtest.totalTrades} total
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Max Drawdown &amp; PF
                  </div>
                  <div className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-red-600 dark:text-red-400">
                    -{backtest.maxDrawdownPoints.toFixed(1)} pts
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    Profit Factor {backtest.profitFactor.toFixed(2)} · Exp{' '}
                    {backtest.expectancyPoints >= 0 ? '+' : ''}
                    {backtest.expectancyPoints.toFixed(1)}
                  </div>
                </div>
              </div>

              {/* Detailed Period Analysis Grid */}
              <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Detailed Period Analysis ({fetchedRange?.fromDate} to{' '}
                    {fetchedRange?.toDate})
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {backtest.totalDays} trading days ·{' '}
                    {backtest.totalCandles.toLocaleString('en-IN')} candles
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 text-xs">
                  <div className="px-5 py-3.5 space-y-2">
                    <div className="text-slate-500 dark:text-slate-400 font-medium">
                      Winning / Losing Days
                    </div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {backtest.winningDays} Win
                      </span>{' '}
                      ·{' '}
                      <span className="text-red-600 dark:text-red-400">
                        {backtest.losingDays} Loss
                      </span>{' '}
                      · {backtest.flatDays} Flat
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Day Accuracy: {backtest.dayWinRatePct.toFixed(1)}%
                    </div>
                  </div>

                  <div className="px-5 py-3.5 space-y-2">
                    <div className="text-slate-500 dark:text-slate-400 font-medium">
                      Gross Profit / Loss
                    </div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        +{backtest.grossProfitPoints.toFixed(1)}
                      </span>{' '}
                      /{' '}
                      <span className="text-red-600 dark:text-red-400">
                        -{backtest.grossLossPoints.toFixed(1)} pts
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Avg: +{backtest.avgWinPoints.toFixed(1)}W / -
                      {backtest.avgLossPoints.toFixed(1)}L
                    </div>
                  </div>

                  <div className="px-5 py-3.5 space-y-2">
                    <div className="text-slate-500 dark:text-slate-400 font-medium">
                      Best / Worst Session
                    </div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        +{backtest.bestDayPoints.toFixed(1)}
                      </span>{' '}
                      /{' '}
                      <span className="text-red-600 dark:text-red-400">
                        {backtest.worstDayPoints.toFixed(1)} pts
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Avg Trades/Day: {backtest.avgTradesPerDay.toFixed(2)}
                    </div>
                  </div>

                  <div className="px-5 py-3.5 space-y-2">
                    <div className="text-slate-500 dark:text-slate-400 font-medium">
                      Longest Streaks
                    </div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {backtest.maxConsecutiveWins}W
                      </span>{' '}
                      max ·{' '}
                      <span className="text-red-600 dark:text-red-400">
                        {backtest.maxConsecutiveLosses}L
                      </span>{' '}
                      max
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Buf {config.entryBufferPoints}pt · Max{' '}
                      {config.maxTradesPerDay}/day
                    </div>
                  </div>
                </div>
              </div>

              {/* Cumulative Multi-Day Equity Curve */}
              <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Cumulative Period Equity Curve ({fetchedRange?.symbol})
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                      {fetchedRange?.fromDate} to {fetchedRange?.toDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setUnit('points')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        unit === 'points'
                          ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Points (pts)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnit('rupees')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        unit === 'rupees'
                          ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Rupees (₹)
                    </button>
                  </div>
                </div>

                <div className="px-4 pt-5 pb-3 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={backtest.dailySummaries}
                      margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="yearlyEquityStroke"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset={zeroOffset}
                            stopColor={chartPosColor}
                            stopOpacity={1}
                          />
                          <stop
                            offset={zeroOffset}
                            stopColor={chartNegColor}
                            stopOpacity={1}
                          />
                        </linearGradient>
                        <linearGradient
                          id="yearlyEquityFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset={0}
                            stopColor={chartPosColor}
                            stopOpacity={0.22}
                          />
                          <stop
                            offset={zeroOffset}
                            stopColor={chartPosColor}
                            stopOpacity={0.03}
                          />
                          <stop
                            offset={zeroOffset}
                            stopColor={chartNegColor}
                            stopOpacity={0.03}
                          />
                          <stop
                            offset={1}
                            stopColor={chartNegColor}
                            stopOpacity={0.22}
                          />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={chartGridStroke}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{
                          fontSize: 11,
                          fill: chartTickFill,
                          fontFamily: 'var(--font-mono)',
                        }}
                        tickLine={false}
                        axisLine={{ stroke: chartGridStroke }}
                        minTickGap={36}
                      />
                      <YAxis
                        tick={{
                          fontSize: 11,
                          fill: chartTickFill,
                          fontFamily: 'var(--font-mono)',
                        }}
                        tickLine={false}
                        axisLine={false}
                        width={68}
                        tickFormatter={(val: number) =>
                          unit === 'points'
                            ? `${val > 0 ? '+' : ''}${val}`
                            : `${val >= 0 ? '₹' : '-₹'}${Math.abs(
                                val
                              ).toLocaleString('en-IN')}`
                        }
                      />
                      <ReferenceLine
                        y={0}
                        stroke={chartZeroStroke}
                        strokeDasharray="4 3"
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0)
                            return null;
                          const row = payload[0].payload as {
                            date: string;
                            bias: string;
                            tradesCount: number;
                            dayPoints: number;
                            cumulativePoints: number;
                            cumulativeRupees: number;
                            drawdownPoints: number;
                          };
                          return (
                            <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 shadow-sm text-xs space-y-1 font-mono tabular-nums">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {row.date} ({row.bias})
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500 dark:text-slate-400">Day P&amp;L</span>
                                <span
                                  className={
                                    row.dayPoints >= 0
                                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                      : 'text-red-600 dark:text-red-400 font-semibold'
                                  }
                                >
                                  {row.dayPoints >= 0 ? '+' : ''}
                                  {row.dayPoints.toFixed(1)} pts (
                                  {row.tradesCount} trades)
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500 dark:text-slate-400">
                                  Cumulative
                                </span>
                                <span className="text-slate-900 dark:text-slate-100 font-semibold">
                                  {unit === 'points'
                                    ? `${
                                        row.cumulativePoints >= 0 ? '+' : ''
                                      }${row.cumulativePoints.toFixed(1)} pts`
                                    : `${
                                        row.cumulativeRupees >= 0 ? '+₹' : '-₹'
                                      }${Math.abs(
                                        row.cumulativeRupees
                                      ).toLocaleString('en-IN')}`}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500 dark:text-slate-400">Drawdown</span>
                                <span className="text-slate-700 dark:text-slate-300">
                                  {row.drawdownPoints.toFixed(1)} pts
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey={
                          unit === 'points'
                            ? 'cumulativePoints'
                            : 'cumulativeRupees'
                        }
                        stroke="url(#yearlyEquityStroke)"
                        strokeWidth={2}
                        fill="url(#yearlyEquityFill)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly Breakdown Bar Chart */}
              <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Monthly Net P&amp;L Breakdown
                  </h2>
                </div>
                <div className="px-4 pt-5 pb-3 h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={backtest.monthlySummaries}
                      margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={chartGridStroke}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{
                          fontSize: 11,
                          fill: chartTickFill,
                          fontFamily: 'var(--font-mono)',
                        }}
                        tickLine={false}
                        axisLine={{ stroke: chartGridStroke }}
                      />
                      <YAxis
                        tick={{
                          fontSize: 11,
                          fill: chartTickFill,
                          fontFamily: 'var(--font-mono)',
                        }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                      />
                      <ReferenceLine y={0} stroke={chartZeroStroke} />
                      <Tooltip
                        cursor={{ fill: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0)
                            return null;
                          const m = payload[0].payload as {
                            label: string;
                            tradingDays: number;
                            tradesCount: number;
                            wins: number;
                            losses: number;
                            netPoints: number;
                            netRupees: number;
                          };
                          return (
                            <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 shadow-sm text-xs font-mono tabular-nums space-y-1">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {m.label} ({m.tradingDays} days)
                              </div>
                              <div className="text-slate-600 dark:text-slate-300">
                                Net:{' '}
                                <span
                                  className={
                                    m.netPoints >= 0
                                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                      : 'text-red-600 dark:text-red-400 font-semibold'
                                  }
                                >
                                  {m.netPoints >= 0 ? '+' : ''}
                                  {m.netPoints.toFixed(1)} pts (
                                  {m.netRupees >= 0 ? '+₹' : '-₹'}
                                  {Math.abs(m.netRupees).toLocaleString('en-IN')}
                                  )
                                </span>
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">
                                Trades: {m.tradesCount} ({m.wins}W / {m.losses}
                                L)
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey={unit === 'points' ? 'netPoints' : 'netRupees'}
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      >
                        {backtest.monthlySummaries.map((entry) => (
                          <Cell
                            key={entry.month}
                            fill={
                              entry.netPoints >= 0 ? chartPosColor : chartNegColor
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Daily Session Breakdown Table */}
              <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Daily Session Ledger ({filteredDays.length})
                  </h2>
                  <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
                    {(
                      [
                        { id: 'all', label: 'All Days' },
                        { id: 'win', label: 'Winning' },
                        { id: 'loss', label: 'Losing' },
                        { id: 'notrade', label: 'No Trades' },
                      ] as { id: DayFilter; label: string }[]
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setDayFilter(f.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          dayFilter === f.id
                            ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-[#0E131D] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="py-2.5 px-4">Date</th>
                        <th className="py-2.5 px-3">Bias</th>
                        <th className="py-2.5 px-3 text-right">Trades</th>
                        <th className="py-2.5 px-3 text-right">W / L / BE</th>
                        <th className="py-2.5 px-3 text-right">Day Pts</th>
                        <th className="py-2.5 px-3 text-right">Day ₹</th>
                        <th className="py-2.5 px-3 text-right">Cum. Pts</th>
                        <th className="py-2.5 px-4 text-right">Chart</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                      {filteredDays.map((day) => (
                        <tr
                          key={day.date}
                          className="h-10 hover:bg-slate-50 dark:hover:bg-[#161D2B]/60 transition-colors"
                        >
                          <td className="px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                            {day.date}
                          </td>
                          <td className="px-3 font-medium">
                            <span
                              className={
                                day.bias === 'BULLISH'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : day.bias === 'BEARISH'
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              {day.bias === 'PENDING'
                                ? 'Undecided'
                                : `${day.bias} (Set ${day.biasSetNumber})`}
                            </span>
                          </td>
                          <td className="px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {day.tradesCount}
                          </td>
                          <td className="px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                            {day.wins} / {day.losses} / {day.breakevens}
                          </td>
                          <td
                            className={`px-3 text-right font-mono tabular-nums font-semibold ${
                              day.dayPoints > 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : day.dayPoints < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {day.dayPoints > 0 ? '+' : ''}
                            {day.dayPoints.toFixed(1)}
                          </td>
                          <td
                            className={`px-3 text-right font-mono tabular-nums ${
                              day.dayRupees > 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : day.dayRupees < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {day.dayRupees >= 0 ? '+₹' : '-₹'}
                            {Math.abs(day.dayRupees).toLocaleString('en-IN', {
                              maximumFractionDigits: 0,
                            })}
                          </td>
                          <td className="px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                            {day.cumulativePoints >= 0 ? '+' : ''}
                            {day.cumulativePoints.toFixed(1)}
                          </td>
                          <td className="px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-3">
                              {onSaveDayToCalendar && day.tradesCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveSingleDayToPaperCalendar(day.date)
                                  }
                                  title={`Save ${day.tradesCount} trades from ${day.date} to Monthly Paper Calendar`}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 cursor-pointer"
                                >
                                  <CalendarPlus
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>Save</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  onInspectDay(
                                    day.candles,
                                    day.date,
                                    fetchedRange?.symbol || activeSymbol
                                  )
                                }
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                              >
                                <span>Inspect</span>
                                <ArrowUpRight
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Saved Backtest Reports Comparison Table */}
          <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Saved Backtest Reports ({savedReports.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Persisted locally and synced to your workspace to compare
                  parameter sets and periods
                </p>
              </div>
            </div>

            {savedReports.length === 0 ? (
              <div className="px-6 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No backtest snapshots saved yet. Run a period backtest above and
                click <strong className="text-slate-700 dark:text-slate-200">Save Result</strong> to store it here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E131D] text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-4">Report</th>
                      <th className="py-2.5 px-3">Period</th>
                      <th className="py-2.5 px-3">Params</th>
                      <th className="py-2.5 px-3 text-right">W / L / BE</th>
                      <th className="py-2.5 px-3 text-right">Accuracy</th>
                      <th className="py-2.5 px-3 text-right">Total P&amp;L</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {savedReports.map((rep) => (
                      <tr
                        key={rep.id}
                        className="h-11 hover:bg-slate-50 dark:hover:bg-[#161D2B]/60 transition-colors"
                      >
                        <td className="px-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {rep.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {rep.savedAt}
                          </div>
                        </td>
                        <td className="px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {rep.fromDate} → {rep.toDate}
                        </td>
                        <td className="px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          Buf {rep.config.entryBufferPoints} · SL{' '}
                          {rep.config.stopLossPoints} · T{' '}
                          {rep.config.targetPoints} · Max{' '}
                          {rep.config.maxTradesPerDay}/d
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {rep.summary.wins}W
                          </span>{' '}
                          /{' '}
                          <span className="text-red-600 dark:text-red-400 font-semibold">
                            {rep.summary.losses}L
                          </span>{' '}
                          / {rep.summary.breakevens}BE
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {rep.summary.winRatePct.toFixed(1)}%
                        </td>
                        <td
                          className={`px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                            rep.summary.netPoints >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {rep.summary.netPoints >= 0 ? '+' : ''}
                          {rep.summary.netPoints.toFixed(1)} pts (
                          {rep.summary.netRupees >= 0 ? '+₹' : '-₹'}
                          {Math.abs(rep.summary.netRupees).toLocaleString(
                            'en-IN',
                            { maximumFractionDigits: 0 }
                          )}
                          )
                        </td>
                        <td className="px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleApplySavedConfig(rep)}
                              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSavedReport(rep.id)}
                              aria-label={`Delete saved report ${rep.name}`}
                              className="p-1 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <StrategyControls
          config={config}
          onChange={onChangeConfig}
          onResetDefaults={onResetDefaults}
          hasUnsavedChanges={hasUnsavedChanges}
          justSaved={justSaved}
          onSave={onSaveConfig}
          onDiscard={onDiscardConfig}
          instrumentMeta={backtestInstrumentMeta}
          loadingLotSize={loadingBacktestLot}
        />
      </section>
    </div>
  );
};
