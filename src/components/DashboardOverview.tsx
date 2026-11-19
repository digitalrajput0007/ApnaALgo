import React, { useMemo } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookmarkPlus,
  CalendarDays,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';
import {
  formatMonthLabel,
  getTodayIstYYYYMMDD,
  PaperTradeJournalController,
} from '../hooks/usePaperTradeJournal';
import { BacktestResult, StrategyConfig } from '../types/strategy';
import { WorkspaceTab } from './TopBar';

interface DashboardOverviewProps {
  config: StrategyConfig;
  labResult: BacktestResult;
  labScenarioName: string;
  journal: PaperTradeJournalController;
  fyersFeed: FyersLiveFeedController;
  onNavigate: (tab: WorkspaceTab) => void;
  onOpenCalendarDate: (date: string) => void;
  onSaveLabSessionToCalendar: () => void;
}

const MINI_WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function buildMiniMonthCells(yearMonth: string) {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDow = (firstDay.getUTCDay() + 6) % 7;

  const cells: { date: string | null; dayNum: number | null }[] = [];
  for (let i = 0; i < startDow; i++) {
    cells.push({ date: null, dayNum: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    cells.push({ date: dt.toISOString().slice(0, 10), dayNum: d });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayNum: null });
  }
  return cells;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  config,
  labResult,
  labScenarioName,
  journal,
  fyersFeed,
  onNavigate,
  onOpenCalendarDate,
  onSaveLabSessionToCalendar,
}) => {
  const hasJournalData = journal.entries.length > 0;
  const activeMonth =
    journal.monthlyBuckets.length > 0
      ? journal.monthlyBuckets[0].month
      : getTodayIstYYYYMMDD().slice(0, 7);

  const miniCells = useMemo(
    () => buildMiniMonthCells(activeMonth),
    [activeMonth]
  );

  const activeMonthBucket = useMemo(
    () => journal.monthlyBuckets.find((m) => m.month === activeMonth) ?? null,
    [journal.monthlyBuckets, activeMonth]
  );

  // Build cumulative equity curve from saved paper journal (by date) OR fallback to Strategy Lab trades
  const equitySeries = useMemo(() => {
    if (hasJournalData) {
      const sortedDays = Array.from(journal.dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      let cumPts = 0;
      let cumInr = 0;
      return sortedDays.map((d) => {
        cumPts = Math.round((cumPts + d.netPoints) * 100) / 100;
        cumInr = Math.round(cumInr + d.netRupees);
        return {
          label: d.date,
          dayPoints: d.netPoints,
          cumPoints: cumPts,
          cumRupees: cumInr,
          trades: d.trades.length,
        };
      });
    }

    let cumPts = 0;
    let cumInr = 0;
    return labResult.trades.map((t) => {
      cumPts = Math.round((cumPts + t.pnlPoints) * 100) / 100;
      cumInr = Math.round(cumInr + t.pnlRupees);
      return {
        label: `T#${t.id} ${t.exitTime || t.entryTime}`,
        dayPoints: t.pnlPoints,
        cumPoints: cumPts,
        cumRupees: cumInr,
        trades: 1,
      };
    });
  }, [hasJournalData, journal.dailyMap, labResult.trades]);

  const zeroOffset = useMemo(() => {
    if (equitySeries.length === 0) return 1;
    let maxV = 0;
    let minV = 0;
    for (const p of equitySeries) {
      if (p.cumPoints > maxV) maxV = p.cumPoints;
      if (p.cumPoints < minV) minV = p.cumPoints;
    }
    if (maxV <= 0) return 0;
    if (minV >= 0) return 1;
    return maxV / (maxV - minV);
  }, [equitySeries]);

  const kpiNetPts = hasJournalData
    ? journal.stats.netPoints
    : labResult.metrics.netPoints;
  const kpiNetInr = hasJournalData
    ? journal.stats.netRupees
    : labResult.metrics.netRupees;
  const kpiWinRate = hasJournalData
    ? journal.stats.winRatePct
    : labResult.metrics.winRatePct;
  const kpiPf = hasJournalData
    ? journal.stats.profitFactor
    : labResult.metrics.profitFactor;
  const kpiWins = hasJournalData
    ? journal.stats.wins
    : labResult.metrics.wins;
  const kpiLosses = hasJournalData
    ? journal.stats.losses
    : labResult.metrics.losses;
  const kpiMaxDd = hasJournalData
    ? journal.stats.maxDrawdownPoints
    : labResult.metrics.maxDrawdownPoints;

  const recentEntries = journal.entries.slice(0, 8);
  const fyersAuthenticated = Boolean(fyersFeed.status?.authenticated);

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            NeoAlgo Trading Desk
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            NIFTY 5-minute 4-Candle Bias &amp; Wilder RSI({config.rsiLength})
            systematic workbench ·{' '}
            {hasJournalData
              ? `${journal.entries.length} saved paper trades across ${journal.monthlyBuckets.length} month${
                  journal.monthlyBuckets.length === 1 ? '' : 's'
                }`
              : 'Previewing active Strategy Lab session'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('lab')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open Strategy Lab</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('backtest1y')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>1-Year Backtest</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Paper Calendar</span>
          </button>
        </div>
      </section>

      {/* 4-Column Full-Width KPI Strip */}
      <section
        aria-label="Desk Performance Overview"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
      >
        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500">
            {hasJournalData ? 'Paper Journal Net P&L' : 'Lab Session Net P&L'}
          </div>
          <div
            className={`mt-1.5 font-mono tabular-nums text-2xl font-bold ${
              kpiNetPts > 0
                ? 'text-emerald-700'
                : kpiNetPts < 0
                ? 'text-red-600'
                : 'text-slate-900'
            }`}
          >
            {kpiNetPts >= 0 ? '+' : ''}
            {kpiNetPts.toFixed(1)} pts
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
            {kpiNetInr >= 0 ? '+₹' : '-₹'}
            {Math.abs(kpiNetInr).toLocaleString('en-IN', {
              maximumFractionDigits: 0,
            })}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500">
            Win Rate &amp; Profit Factor
          </div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
              {kpiWinRate.toFixed(1)}%
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              PF {kpiPf.toFixed(2)}
            </span>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
            {kpiWins} Wins · {kpiLosses} Losses
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500">
            {hasJournalData ? 'Saved Trading Days' : 'Max Drawdown'}
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900">
            {hasJournalData
              ? `${journal.stats.tradingDays} days`
              : `-${kpiMaxDd.toFixed(1)} pts`}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
            {hasJournalData
              ? `${journal.stats.winningDays} Green · ${journal.stats.losingDays} Red · DD -${kpiMaxDd.toFixed(
                  1
                )}`
              : `Scenario: ${labScenarioName}`}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>Broker Connection</span>
            <button
              type="button"
              onClick={() => onNavigate('brokers')}
              className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
            >
              {fyersAuthenticated ? 'Manage' : 'Connect →'}
            </button>
          </div>
          <div
            className={`mt-1.5 font-display text-lg font-bold ${
              fyersAuthenticated ? 'text-emerald-700' : 'text-slate-700'
            }`}
          >
            {fyersAuthenticated
              ? fyersFeed.isStreaming
                ? 'Fyers Live Active'
                : 'Fyers Connected'
              : 'No Broker Connected'}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
            {config.lots} lot ({config.lots * config.lotSize} qty) · SL{' '}
            {config.stopLossPoints} / Tgt {config.targetPoints}
          </div>
        </div>
      </section>

      {/* 2-Column Analytical Split: Equity Curve + Mini Monthly Calendar */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-6 items-stretch">
        {/* Equity Curve Card */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {hasJournalData
                  ? 'Cumulative Paper Journal Equity Curve'
                  : `Strategy Lab Equity Preview (${labScenarioName})`}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {hasJournalData
                  ? 'Daily net points curve across all saved backtest and paper sessions'
                  : 'Save this session or a 1-Year Backtest to populate your persistent monthly calendar'}
              </p>
            </div>

            {!hasJournalData && labResult.trades.length > 0 && (
              <button
                type="button"
                onClick={onSaveLabSessionToCalendar}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Lab Session to Calendar</span>
              </button>
            )}
          </div>

          <div className="flex-1 min-h-[260px] px-4 pt-5 pb-3">
            {equitySeries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                No executed trades available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart
                  data={equitySeries}
                  margin={{ top: 8, right: 16, left: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="dashEquityStroke"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset={zeroOffset}
                        stopColor="#16a34a"
                        stopOpacity={1}
                      />
                      <stop
                        offset={zeroOffset}
                        stopColor="#dc2626"
                        stopOpacity={1}
                      />
                    </linearGradient>
                    <linearGradient
                      id="dashEquityFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset={0}
                        stopColor="#16a34a"
                        stopOpacity={0.2}
                      />
                      <stop
                        offset={zeroOffset}
                        stopColor="#16a34a"
                        stopOpacity={0.02}
                      />
                      <stop
                        offset={zeroOffset}
                        stopColor="#dc2626"
                        stopOpacity={0.02}
                      />
                      <stop
                        offset={1}
                        stopColor="#dc2626"
                        stopOpacity={0.2}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{
                      fontSize: 11,
                      fill: '#64748b',
                      fontFamily: 'var(--font-mono)',
                    }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    minTickGap={30}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: '#64748b',
                      fontFamily: 'var(--font-mono)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                    tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}`}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="#94a3b8"
                    strokeDasharray="4 3"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0)
                        return null;
                      const pt = payload[0].payload as {
                        label: string;
                        dayPoints: number;
                        cumPoints: number;
                        cumRupees: number;
                        trades: number;
                      };
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs font-mono tabular-nums space-y-1">
                          <div className="font-semibold text-slate-900">
                            {pt.label}
                          </div>
                          <div className="text-slate-600">
                            Delta:{' '}
                            <span
                              className={
                                pt.dayPoints >= 0
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-red-600 font-semibold'
                              }
                            >
                              {pt.dayPoints >= 0 ? '+' : ''}
                              {pt.dayPoints.toFixed(1)} pts
                            </span>
                          </div>
                          <div className="text-slate-900 font-semibold">
                            Cumulative: {pt.cumPoints >= 0 ? '+' : ''}
                            {pt.cumPoints.toFixed(1)} pts (
                            {pt.cumRupees >= 0 ? '+₹' : '-₹'}
                            {Math.abs(pt.cumRupees).toLocaleString('en-IN')})
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumPoints"
                    stroke="url(#dashEquityStroke)"
                    strokeWidth={2}
                    fill="url(#dashEquityFill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Mini Monthly Calendar Preview */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Paper Calendar · {formatMonthLabel(activeMonth)}
              </h2>
              <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {activeMonthBucket
                  ? `${activeMonthBucket.netPoints >= 0 ? '+' : ''}${activeMonthBucket.netPoints.toFixed(
                      1
                    )} pts · ${activeMonthBucket.winningDays}G / ${
                      activeMonthBucket.losingDays
                    }R days`
                  : 'No paper trades saved for this month'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap cursor-pointer"
            >
              <span>Full Calendar</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400">
                {MINI_WEEKDAYS.map((d, idx) => (
                  <div key={`${d}-${idx}`}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {miniCells.map((cell, idx) => {
                  if (!cell.date || cell.dayNum === null) {
                    return <div key={`empty-${idx}`} className="h-9" />;
                  }
                  const b = journal.dailyMap.get(cell.date);
                  let cls =
                    'bg-slate-50 border-slate-200/70 text-slate-500 hover:bg-slate-100';
                  if (b) {
                    if (b.netPoints > 0.5) {
                      cls =
                        'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100';
                    } else if (b.netPoints < -0.5) {
                      cls =
                        'bg-red-50 border-red-300 text-red-700 hover:bg-red-100';
                    } else {
                      cls =
                        'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100';
                    }
                  }
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => onOpenCalendarDate(cell.date!)}
                      title={
                        b
                          ? `${cell.date}: ${b.netPoints >= 0 ? '+' : ''}${b.netPoints.toFixed(
                              1
                            )} pts (${b.trades.length} trades)`
                          : cell.date
                      }
                      className={`h-9 rounded-md border flex flex-col items-center justify-center font-mono tabular-nums transition-colors cursor-pointer ${cls}`}
                    >
                      <span className="text-[11px] font-semibold leading-none">
                        {cell.dayNum}
                      </span>
                      {b && (
                        <span className="text-[9px] leading-none mt-0.5 font-bold">
                          {b.netPoints >= 0 ? '+' : ''}
                          {Math.round(b.netPoints)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Click any day to open in Paper Calendar</span>
              <button
                type="button"
                onClick={() => onNavigate('backtest1y')}
                className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                Import from 1Y Backtest
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom 2-Column Section: Recent Paper Trades + Active Strategy Rules */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-6 items-start">
        {/* Recent Saved Paper Trades */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Recent Saved Paper Trades
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Latest entries stored in your monthly trading calendar
              </p>
            </div>
            {recentEntries.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('calendar')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                View All ({journal.entries.length})
              </button>
            )}
          </div>

          {recentEntries.length === 0 ? (
            <div className="px-6 py-10 text-center space-y-3">
              <p className="text-sm text-slate-600">
                Your paper trade calendar is ready. Save backtested trades from{' '}
                <strong>1-Year Backtest</strong> or your current{' '}
                <strong>Strategy Lab</strong> session to track monthly P&amp;L.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('backtest1y')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Go to 1-Year Backtest
                </button>
                {labResult.trades.length > 0 && (
                  <button
                    type="button"
                    onClick={onSaveLabSessionToCalendar}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                  >
                    Save Lab Session ({labResult.trades.length} trades)
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-3">Side</th>
                    <th className="py-2.5 px-3">Entry / Exit</th>
                    <th className="py-2.5 px-3">Outcome</th>
                    <th className="py-2.5 px-3 text-right">Points</th>
                    <th className="py-2.5 px-4 text-right">P&amp;L (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {recentEntries.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => onOpenCalendarDate(t.date)}
                      className="h-10 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {t.date}
                      </td>
                      <td
                        className={`px-3 font-mono font-semibold whitespace-nowrap ${
                          t.direction === 'LONG'
                            ? 'text-emerald-700'
                            : 'text-red-600'
                        }`}
                      >
                        {t.direction}
                      </td>
                      <td className="px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {t.entryPrice.toFixed(1)} →{' '}
                        {t.exitPrice !== undefined
                          ? t.exitPrice.toFixed(1)
                          : '--'}
                      </td>
                      <td className="px-3 text-slate-600 whitespace-nowrap">
                        {t.exitReason === 'TARGET_HIT'
                          ? 'Target Hit'
                          : t.exitReason === 'STRICT_SL_HIT'
                          ? 'Strict SL'
                          : t.exitReason === 'TRAILED_COST_EXIT'
                          ? 'Cost SL'
                          : 'EOD'}
                      </td>
                      <td
                        className={`px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          t.pnlPoints > 0.5
                            ? 'text-emerald-700'
                            : t.pnlPoints < -0.5
                            ? 'text-red-600'
                            : 'text-amber-700'
                        }`}
                      >
                        {t.pnlPoints >= 0 ? '+' : ''}
                        {t.pnlPoints.toFixed(1)}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Active Strategy Rules Summary */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Active Strategy Specification
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('lab')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tune</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500">Session Bias Filter</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {config.requiredMajority}/{config.setSize} Candles ·{' '}
                {config.biasMode === 'LOCK_FOR_DAY' ? 'Lock Day' : 'Rolling'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500">Wilder RSI({config.rsiLength}) Trigger</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                Buy &lt; {config.rsiBuyThreshold} / Sell &gt;{' '}
                {config.rsiSellThreshold}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500">Breakout Entry Buffer</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ±{config.entryBufferPoints} pts · Trailing Base
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500">Risk / Reward</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                SL {config.stopLossPoints} / Target {config.targetPoints} (1:
                {(
                  config.targetPoints / Math.max(1, config.stopLossPoints)
                ).toFixed(1)}
                )
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500">Daily Risk Discipline</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                Max {config.maxTradesPerDay}/day ·{' '}
                {config.stopAfterTargetHit ? 'Stop on Target' : 'Continue'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500">1:1 Cost Trail</span>
              <span className="font-medium text-slate-900">
                {config.trailToCostAtOneToOne
                  ? `Enabled (+${config.stopLossPoints} pts)`
                  : 'Disabled'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
