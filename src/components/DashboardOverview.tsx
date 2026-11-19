import React, { useMemo } from 'react';
import {
  Activity,
  ArrowRight,
  BookmarkPlus,
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
import { SaaSUser } from '../hooks/useSaaSAuth';
import { TelegramAlertsController } from '../hooks/useTelegramAlerts';
import { BacktestResult, StrategyConfig } from '../types/strategy';
import { formatINR } from '../utils/formatters';
import { WorkspaceTab } from './TopBar';

interface DashboardOverviewProps {
  user: SaaSUser;
  theme?: 'dark' | 'light';
  config: StrategyConfig;
  labResult: BacktestResult;
  labScenarioName: string;
  journal: PaperTradeJournalController;
  fyersFeed: FyersLiveFeedController;
  telegram: TelegramAlertsController;
  onNavigate: (tab: WorkspaceTab) => void;
  onOpenIntegrationsTab: (sub: 'brokers' | 'telegram') => void;
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
  user,
  theme = 'dark',
  config,
  labResult,
  labScenarioName,
  journal,
  fyersFeed,
  telegram,
  onNavigate,
  onOpenIntegrationsTab,
  onOpenCalendarDate,
  onSaveLabSessionToCalendar,
}) => {
  const isDark = theme === 'dark';
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
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

  const recentEntries = journal.entries.slice(0, 6);
  const fyersConnected = Boolean(fyersFeed.status?.authenticated);

  const gridStroke = isDark ? '#1E293B' : '#f1f5f9';
  const axisStroke = isDark ? '#334155' : '#e2e8f0';
  const tickFill = isDark ? '#94a3b8' : '#64748b';
  const refStroke = isDark ? '#475569' : '#cbd5e1';

  return (
    <div className="space-y-6">
      {/* Calm Executive Header — Single Focused Primary Action */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {user.bio
              ? user.bio
              : hasJournalData
              ? `${journal.entries.length} logged paper trades across ${journal.monthlyBuckets.length} month${
                  journal.monthlyBuckets.length === 1 ? '' : 's'
                }`
              : `NIFTY 5m 4-Candle & RSI(${config.rsiLength}) desk`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('lab')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Open Strategy Lab</span>
        </button>
      </header>

      {/* 4-Column Crisp KPI Strip */}
      <section
        aria-label="Workspace Summary"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800"
      >
        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {hasJournalData ? 'Journal Net P&L' : 'Session Net P&L'}
          </div>
          <div
            className={`mt-1.5 font-mono tabular-nums text-2xl font-semibold tracking-tight ${
              kpiNetInr > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : kpiNetInr < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatINR(kpiNetInr)}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
            {kpiNetPts >= 0 ? '+' : ''}
            {kpiNetPts.toFixed(1)} pts
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Win Rate &amp; Factor
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {kpiWinRate.toFixed(1)}%
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              PF {kpiPf.toFixed(2)}
            </span>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
            {kpiWins}W · {kpiLosses}L · DD -{kpiMaxDd.toFixed(1)}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Broker Feed</span>
            <button
              type="button"
              onClick={() => onOpenIntegrationsTab('brokers')}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer"
            >
              {fyersConnected ? 'Manage' : 'Connect'}
            </button>
          </div>
          <div
            className={`mt-1.5 font-display text-lg font-semibold ${
              fyersConnected
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {fyersConnected
              ? fyersFeed.isStreaming
                ? 'Fyers Streaming'
                : 'Fyers Connected'
              : 'Disconnected'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {fyersConnected
              ? fyersFeed.status?.profile?.name ||
                fyersFeed.status?.profile?.fy_id ||
                'OAuth active'
              : 'Link your Fyers account'}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Telegram Alerts</span>
            <button
              type="button"
              onClick={() => onOpenIntegrationsTab('telegram')}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer"
            >
              Configure
            </button>
          </div>
          <div
            className={`mt-1.5 font-display text-lg font-semibold ${
              telegram.isArmedForLive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {telegram.isArmedForLive ? 'Armed' : 'Paused'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {telegram.activeDestinationCount > 0
              ? `${telegram.activeDestinationCount} active destination${
                  telegram.activeDestinationCount === 1 ? '' : 's'
                }`
              : 'Personal, group, or channel'}
          </div>
        </div>
      </section>

      {/* Analytical Split: Equity Curve + Mini Monthly Heatmap */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6 items-stretch">
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {hasJournalData
                  ? 'Cumulative Equity Curve'
                  : `Session Equity Preview · ${labScenarioName}`}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {hasJournalData
                  ? 'Daily net points across saved paper journal sessions'
                  : 'Save a backtest or live session to build your cumulative track record'}
              </p>
            </div>

            {!hasJournalData && labResult.trades.length > 0 && (
              <button
                type="button"
                onClick={onSaveLabSessionToCalendar}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save to Journal</span>
              </button>
            )}
          </div>

          <div className="flex-1 min-h-[250px] px-4 pt-5 pb-3">
            {equitySeries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                No executed trades available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart
                  data={equitySeries}
                  margin={{ top: 8, right: 14, left: 2, bottom: 0 }}
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
                        stopColor="#10b981"
                        stopOpacity={1}
                      />
                      <stop
                        offset={zeroOffset}
                        stopColor="#ef4444"
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
                        stopColor="#10b981"
                        stopOpacity={isDark ? 0.24 : 0.16}
                      />
                      <stop
                        offset={zeroOffset}
                        stopColor="#10b981"
                        stopOpacity={0.01}
                      />
                      <stop
                        offset={zeroOffset}
                        stopColor="#ef4444"
                        stopOpacity={0.01}
                      />
                      <stop
                        offset={1}
                        stopColor="#ef4444"
                        stopOpacity={isDark ? 0.24 : 0.16}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={gridStroke}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{
                      fontSize: 11,
                      fill: tickFill,
                      fontFamily: 'var(--font-mono)',
                    }}
                    tickLine={false}
                    axisLine={{ stroke: axisStroke }}
                    minTickGap={32}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: tickFill,
                      fontFamily: 'var(--font-mono)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    width={54}
                    tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}`}
                  />
                  <ReferenceLine
                    y={0}
                    stroke={refStroke}
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
                      };
                      return (
                        <div className="bg-white dark:bg-[#161D2B] border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 shadow-lg text-xs font-mono tabular-nums space-y-1">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {pt.label}
                          </div>
                          <div className="text-slate-600 dark:text-slate-400">
                            Session:{' '}
                            <span
                              className={
                                pt.dayPoints >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                  : 'text-red-600 dark:text-red-400 font-semibold'
                              }
                            >
                              {pt.dayPoints >= 0 ? '+' : ''}
                              {pt.dayPoints.toFixed(1)} pts
                            </span>
                          </div>
                          <div className="text-slate-900 dark:text-slate-100 font-semibold">
                            Total: {pt.cumPoints >= 0 ? '+' : ''}
                            {pt.cumPoints.toFixed(1)} pts (
                            {formatINR(pt.cumRupees)})
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

        {/* Compact Monthly Heatmap */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatMonthLabel(activeMonth)}
              </h2>
              <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                {activeMonthBucket
                  ? `${activeMonthBucket.netPoints >= 0 ? '+' : ''}${activeMonthBucket.netPoints.toFixed(
                      1
                    )} pts · ${activeMonthBucket.winningDays}G / ${
                      activeMonthBucket.losingDays
                    }R`
                  : 'No journal entries yet'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap cursor-pointer"
            >
              <span>Journal</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-400 dark:text-slate-500">
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
                    'bg-slate-50/80 dark:bg-[#0E131D] border-slate-200/60 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70';
                  if (b) {
                    if (b.netPoints > 0.5) {
                      cls =
                        'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300/80 dark:border-emerald-500/35 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/25';
                    } else if (b.netPoints < -0.5) {
                      cls =
                        'bg-red-50 dark:bg-red-500/15 border-red-300/80 dark:border-red-500/35 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/25';
                    } else {
                      cls =
                        'bg-amber-50 dark:bg-amber-500/15 border-amber-300/80 dark:border-amber-500/35 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/25';
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
                      <span className="text-[11px] font-medium leading-none">
                        {cell.dayNum}
                      </span>
                      {b && (
                        <span className="text-[9px] leading-none mt-0.5 font-semibold">
                          {b.netPoints >= 0 ? '+' : ''}
                          {Math.round(b.netPoints)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Select any day to inspect trades</span>
              <button
                type="button"
                onClick={() => onNavigate('backtest1y')}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer"
              >
                Run Backtest
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Split: Recent Trades + Concise Strategy Rules */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6 items-start">
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Journal Activity
            </h2>
            {recentEntries.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('calendar')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
              >
                View all ({journal.entries.length})
              </button>
            )}
          </div>

          {recentEntries.length === 0 ? (
            <div className="px-6 py-10 text-center space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Save backtest results or live sessions into your monthly paper
                journal to track daily consistency and drawdowns.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('backtest1y')}
                  className="px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                >
                  Open Backtest
                </button>
                {labResult.trades.length > 0 && (
                  <button
                    type="button"
                    onClick={onSaveLabSessionToCalendar}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    Save Current Session
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0E131D] text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-5">Date</th>
                    <th className="py-2.5 px-3">Side</th>
                    <th className="py-2.5 px-3">Entry → Exit</th>
                    <th className="py-2.5 px-3">Outcome</th>
                    <th className="py-2.5 px-3 text-right">Points</th>
                    <th className="py-2.5 px-5 text-right">P&amp;L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                  {recentEntries.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => onOpenCalendarDate(t.date)}
                      className="h-10 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="px-5 font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {t.date}
                      </td>
                      <td
                        className={`px-3 font-mono font-medium whitespace-nowrap ${
                          t.direction === 'LONG'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.direction}
                      </td>
                      <td className="px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {t.entryPrice.toFixed(1)} →{' '}
                        {t.exitPrice !== undefined
                          ? t.exitPrice.toFixed(1)
                          : '--'}
                      </td>
                      <td className="px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {t.exitReason === 'TARGET_HIT'
                          ? 'Target'
                          : t.exitReason === 'STRICT_SL_HIT'
                          ? 'Stop Loss'
                          : t.exitReason === 'TRAILED_COST_EXIT'
                          ? 'Cost Trail'
                          : 'EOD'}
                      </td>
                      <td
                        className={`px-3 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                          t.pnlPoints > 0.5
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : t.pnlPoints < -0.5
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {t.pnlPoints >= 0 ? '+' : ''}
                        {t.pnlPoints.toFixed(1)}
                      </td>
                      <td
                        className={`px-5 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                          t.pnlRupees > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : t.pnlRupees < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {formatINR(t.pnlRupees)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Saved Rules Summary */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Active Strategy Rules
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('lab')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Edit</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Bias Filter
              </span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                {config.requiredMajority}/{config.setSize} Candles ·{' '}
                {config.biasMode === 'LOCK_FOR_DAY' ? 'Lock Day' : 'Rolling'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Wilder RSI({config.rsiLength})
              </span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                &lt; {config.rsiBuyThreshold} / &gt; {config.rsiSellThreshold}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Stop Loss / Target
              </span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                {config.stopLossPoints} / {config.targetPoints} pts (1:
                {(
                  config.targetPoints / Math.max(1, config.stopLossPoints)
                ).toFixed(1)}
                )
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Daily Cap
              </span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                Max {config.maxTradesPerDay}/day ·{' '}
                {config.stopAfterTargetHit ? 'Halt on Target' : 'Continue'}
              </span>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Position Size
              </span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                {config.lots} lot ({config.lots * config.lotSize} qty)
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
