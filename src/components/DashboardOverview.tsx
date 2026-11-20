import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookmarkPlus,
  ChevronRight,
  Link2,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
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
import { OrderPositionJournalController } from '../hooks/useOrderPositionJournal';
import {
  formatMonthLabel,
  getTodayIstYYYYMMDD,
  PaperTradeJournalController,
} from '../hooks/usePaperTradeJournal';
import { SaaSUser } from '../hooks/useSaaSAuth';
import { BacktestResult, StrategyConfig } from '../types/strategy';
import { formatINR, getNseMarketStatus } from '../utils/formatters';
import { WorkspaceTab } from './TopBar';

interface DashboardOverviewProps {
  isAdmin: boolean;
  user: SaaSUser;
  fyersConnected: boolean;
  theme?: 'dark' | 'light';
  config: StrategyConfig;
  labResult: BacktestResult;
  labScenarioName: string;
  isLiveStreaming: boolean;
  journal: PaperTradeJournalController;
  orderJournal: OrderPositionJournalController;
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

function formatReadableIstDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dt);
}

function exitReasonLabel(reason: string): string {
  if (reason === 'TARGET_HIT') return 'Target';
  if (reason === 'STRICT_SL_HIT') return 'Stop Loss';
  if (reason === 'TRAILED_COST_EXIT') return 'Cost Trail';
  if (reason === 'OPEN') return 'Open';
  return 'EOD Close';
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  isAdmin,
  user,
  fyersConnected,
  theme = 'dark',
  config,
  labResult,
  labScenarioName,
  isLiveStreaming,
  journal,
  orderJournal,
  onNavigate,
  onOpenCalendarDate,
  onSaveLabSessionToCalendar,
}) => {
  const isDark = theme === 'dark';
  const todayIst = getTodayIstYYYYMMDD();
  const currentMonth = todayIst.slice(0, 7);
  const marketStatus = useMemo(() => getNseMarketStatus(), []);

  const subscriptionSummary = useMemo(() => {
    const planMap: Record<string, string> = {
      '1m': '1 Month',
      '3m': '3 Months',
      '6m': '6 Months',
      '1y': '1 Year',
      admin: 'Admin',
    };
    const label = planMap[user.subscriptionPlan] || 'Active';
    if (!user.subscriptionExpiresAt) {
      return { label, sub: 'Active subscription' };
    }
    const daysLeft = Math.max(
      0,
      Math.ceil((user.subscriptionExpiresAt - Date.now()) / (24 * 60 * 60 * 1000))
    );
    const expStr = new Date(user.subscriptionExpiresAt).toLocaleDateString(
      'en-IN',
      { day: 'numeric', month: 'short', year: 'numeric' }
    );
    return { label, sub: `Exp ${expStr} · ${daysLeft}d left` };
  }, [user.subscriptionPlan, user.subscriptionExpiresAt]);

  const [activityTab, setActivityTab] = useState<
    'positions' | 'orders' | 'trades'
  >('positions');
  const [chartTab, setChartTab] = useState<'equity' | 'calendar'>('equity');

  // Today's recorded orders & positions (from Trades & Positions Journal)
  const todayPositions = useMemo(
    () => orderJournal.positions.filter((p) => p.date === todayIst),
    [orderJournal.positions, todayIst]
  );
  const todayOrders = useMemo(
    () => orderJournal.orders.filter((o) => o.date === todayIst),
    [orderJournal.orders, todayIst]
  );
  const openPositions = useMemo(
    () => orderJournal.positions.filter((p) => p.status === 'OPEN'),
    [orderJournal.positions]
  );
  const openMtmRupees = useMemo(
    () => openPositions.reduce((acc, p) => acc + p.pnlRupees, 0),
    [openPositions]
  );

  // Today's journal trades (saved in Paper Calendar) vs Active Strategy Lab session
  const todayJournalDay = journal.dailyMap.get(todayIst) ?? null;
  const hasTodayRecorded =
    todayPositions.length > 0 || (todayJournalDay?.trades.length ?? 0) > 0;

  const todaySummary = useMemo(() => {
    if (todayPositions.length > 0) {
      const netPts = todayPositions.reduce((s, p) => s + p.pnlPoints, 0);
      const netInr = todayPositions.reduce((s, p) => s + p.pnlRupees, 0);
      const wins = todayPositions.filter((p) => p.pnlPoints > 0.5).length;
      const losses = todayPositions.filter((p) => p.pnlPoints < -0.5).length;
      return {
        label: 'Today',
        netPoints: Math.round(netPts * 100) / 100,
        netRupees: Math.round(netInr),
        tradesCount: todayPositions.length,
        wins,
        losses,
        ordersCount: todayOrders.length,
      };
    }

    if (todayJournalDay && todayJournalDay.trades.length > 0) {
      return {
        label: 'Today',
        netPoints: todayJournalDay.netPoints,
        netRupees: todayJournalDay.netRupees,
        tradesCount: todayJournalDay.trades.length,
        wins: todayJournalDay.wins,
        losses: todayJournalDay.losses,
        ordersCount: todayOrders.length || todayJournalDay.trades.length * 2,
      };
    }

    if (!isAdmin) {
      return {
        label: 'Today',
        netPoints: 0,
        netRupees: 0,
        tradesCount: 0,
        wins: 0,
        losses: 0,
        ordersCount: todayOrders.length,
      };
    }

    return {
      label: isLiveStreaming ? 'Live Session' : 'Active Session',
      netPoints: labResult.metrics.netPoints,
      netRupees: labResult.metrics.netRupees,
      tradesCount: labResult.trades.length,
      wins: labResult.metrics.wins,
      losses: labResult.metrics.losses,
      ordersCount:
        todayOrders.length > 0
          ? todayOrders.length
          : labResult.trades.reduce(
              (acc, t) => acc + (t.exitReason === 'OPEN' ? 1 : 2),
              0
            ),
    };
  }, [
    isAdmin,
    todayPositions,
    todayOrders.length,
    todayJournalDay,
    isLiveStreaming,
    labResult,
  ]);

  // Month-to-Date (MTD) Performance from Journal (falls back gracefully to latest recorded month or session)
  const hasJournalData = journal.entries.length > 0;
  const activeMonth = useMemo(() => {
    if (journal.monthlyBuckets.some((m) => m.month === currentMonth)) {
      return currentMonth;
    }
    if (journal.monthlyBuckets.length > 0) {
      return journal.monthlyBuckets[0].month;
    }
    return currentMonth;
  }, [journal.monthlyBuckets, currentMonth]);

  const activeMonthBucket = useMemo(
    () => journal.monthlyBuckets.find((m) => m.month === activeMonth) ?? null,
    [journal.monthlyBuckets, activeMonth]
  );

  const mtdStats = useMemo(() => {
    if (activeMonthBucket) {
      const monthTrades = journal.entries.filter((e) =>
        e.date.startsWith(activeMonth)
      );
      const wins = monthTrades.filter((t) => t.pnlPoints > 0.5);
      const losses = monthTrades.filter((t) => t.pnlPoints < -0.5);
      const breakevens = monthTrades.length - wins.length - losses.length;
      const grossWin = wins.reduce((s, t) => s + t.pnlPoints, 0);
      const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPoints, 0));
      const decided = wins.length + losses.length;
      const accuracyPct = decided > 0 ? (wins.length / decided) * 100 : 0;
      const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
      const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
      const pf =
        grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? grossWin : 0;

      let bestDay = 0;
      for (const day of journal.dailyMap.values()) {
        if (day.date.startsWith(activeMonth) && day.netPoints > bestDay) {
          bestDay = day.netPoints;
        }
      }

      return {
        isCurrentMonth: activeMonth === currentMonth,
        monthLabel: formatMonthLabel(activeMonth),
        netPoints: activeMonthBucket.netPoints,
        netRupees: activeMonthBucket.netRupees,
        winningDays: activeMonthBucket.winningDays,
        losingDays: activeMonthBucket.losingDays,
        wins: wins.length,
        losses: losses.length,
        breakevens,
        totalTrades: monthTrades.length,
        accuracyPct,
        profitFactor: pf,
        avgWin,
        avgLoss,
        maxDrawdown: journal.stats.maxDrawdownPoints,
        bestDay,
      };
    }

    if (!isAdmin) {
      const closedPositions = orderJournal.positions.filter(
        (p) => p.status === 'CLOSED'
      );
      const wins = closedPositions.filter((p) => p.pnlPoints > 0.5);
      const losses = closedPositions.filter((p) => p.pnlPoints < -0.5);
      const breakevens = closedPositions.length - wins.length - losses.length;
      const netPoints = closedPositions.reduce((s, p) => s + p.pnlPoints, 0);
      const netRupees = closedPositions.reduce((s, p) => s + p.pnlRupees, 0);
      const grossWin = wins.reduce((s, p) => s + p.pnlPoints, 0);
      const grossLoss = Math.abs(losses.reduce((s, p) => s + p.pnlPoints, 0));
      const decided = wins.length + losses.length;
      const accuracyPct = decided > 0 ? (wins.length / decided) * 100 : 0;
      const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
      const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
      const pf =
        grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? grossWin : 0;

      return {
        isCurrentMonth: true,
        monthLabel: formatMonthLabel(currentMonth),
        netPoints: Math.round(netPoints * 100) / 100,
        netRupees: Math.round(netRupees),
        winningDays: netRupees > 0 ? 1 : 0,
        losingDays: netRupees < 0 ? 1 : 0,
        wins: wins.length,
        losses: losses.length,
        breakevens,
        totalTrades: closedPositions.length,
        accuracyPct,
        profitFactor: pf,
        avgWin,
        avgLoss,
        maxDrawdown: 0,
        bestDay: Math.max(0, netPoints),
      };
    }

    const wins = labResult.trades.filter((t) => t.pnlPoints > 0.5);
    const losses = labResult.trades.filter((t) => t.pnlPoints < -0.5);
    const breakevens = labResult.trades.length - wins.length - losses.length;
    const avgWin =
      wins.length > 0
        ? wins.reduce((s, t) => s + t.pnlPoints, 0) / wins.length
        : 0;
    const avgLoss =
      losses.length > 0
        ? Math.abs(losses.reduce((s, t) => s + t.pnlPoints, 0)) / losses.length
        : 0;
    const decided = wins.length + losses.length;
    const accuracyPct =
      decided > 0 ? (wins.length / decided) * 100 : labResult.metrics.winRatePct;

    return {
      isCurrentMonth: true,
      monthLabel: formatMonthLabel(currentMonth),
      netPoints: labResult.metrics.netPoints,
      netRupees: labResult.metrics.netRupees,
      winningDays: labResult.metrics.netPoints > 0 ? 1 : 0,
      losingDays: labResult.metrics.netPoints < 0 ? 1 : 0,
      wins: wins.length,
      losses: losses.length,
      breakevens,
      totalTrades: labResult.trades.length,
      accuracyPct,
      profitFactor: labResult.metrics.profitFactor,
      avgWin,
      avgLoss,
      maxDrawdown: labResult.metrics.maxDrawdownPoints,
      bestDay: Math.max(0, labResult.metrics.netPoints),
    };
  }, [
    isAdmin,
    orderJournal.positions,
    activeMonthBucket,
    activeMonth,
    currentMonth,
    journal.dailyMap,
    journal.entries,
    journal.stats.maxDrawdownPoints,
    labResult,
  ]);

  const miniCells = useMemo(
    () => buildMiniMonthCells(activeMonth),
    [activeMonth]
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
          label: d.date.slice(5),
          fullDate: d.date,
          dayPoints: d.netPoints,
          cumPoints: cumPts,
          cumRupees: cumInr,
        };
      });
    }

    if (!isAdmin) {
      const closed = [...orderJournal.positions]
        .filter((p) => p.status === 'CLOSED')
        .reverse();
      let cumPts = 0;
      let cumInr = 0;
      return closed.map((p, idx) => {
        cumPts = Math.round((cumPts + p.pnlPoints) * 100) / 100;
        cumInr = Math.round(cumInr + p.pnlRupees);
        return {
          label: `T#${idx + 1}`,
          fullDate: `${p.date} ${p.exitTime || p.entryTime}`,
          dayPoints: p.pnlPoints,
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
        label: `T#${t.id}`,
        fullDate: t.exitTime || t.entryTime,
        dayPoints: t.pnlPoints,
        cumPoints: cumPts,
        cumRupees: cumInr,
      };
    });
  }, [isAdmin, hasJournalData, journal.dailyMap, labResult.trades, orderJournal.positions]);

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

  const displayedPositions = useMemo(() => {
    if (orderJournal.positions.length > 0) {
      return orderJournal.positions.slice(0, 6);
    }
    return [];
  }, [orderJournal.positions]);

  const displayedOrders = useMemo(
    () => orderJournal.orders.slice(0, 6),
    [orderJournal.orders]
  );

  const displayedTrades = useMemo(() => {
    if (journal.entries.length > 0) {
      return journal.entries.slice(0, 6).map((e) => ({
        id: e.id,
        date: e.date,
        time: e.entryTime,
        direction: e.direction,
        entryPrice: e.entryPrice,
        exitPrice: e.exitPrice,
        exitReason: e.exitReason,
        pnlPoints: e.pnlPoints,
        pnlRupees: e.pnlRupees,
        clickableDate: isAdmin ? e.date : (null as string | null),
      }));
    }
    if (!isAdmin) {
      return orderJournal.positions.slice(0, 6).map((p) => ({
        id: p.id,
        date: p.date,
        time: p.entryTime,
        direction: p.direction,
        entryPrice: p.avgEntryPrice,
        exitPrice: p.ltpOrExitPrice,
        exitReason: p.exitReason,
        pnlPoints: p.pnlPoints,
        pnlRupees: p.pnlRupees,
        clickableDate: null as string | null,
      }));
    }
    return labResult.trades.slice(0, 6).map((t) => ({
      id: `lab_${t.id}`,
      date: t.date || todayIst,
      time: t.entryTime,
      direction: t.direction,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      exitReason: t.exitReason,
      pnlPoints: t.pnlPoints,
      pnlRupees: t.pnlRupees,
      clickableDate: null as string | null,
    }));
  }, [isAdmin, journal.entries, labResult.trades, orderJournal.positions, todayIst]);

  const biasText =
    labResult.finalBias === 'BULLISH'
      ? 'Bullish'
      : labResult.finalBias === 'BEARISH'
      ? 'Bearish'
      : 'Pending';

  const biasSubtext = labResult.biasDecidedSet
    ? `Group #${labResult.biasDecidedSet} · ${labResult.biasDecidedTime} IST`
    : 'Awaiting 4-candle majority';

  const gridStroke = isDark ? '#1E293B' : '#f1f5f9';
  const axisStroke = isDark ? '#334155' : '#e2e8f0';
  const tickFill = isDark ? '#94a3b8' : '#64748b';
  const refStroke = isDark ? '#475569' : '#cbd5e1';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Focal Anchor: Today's Trading Summary Card (Mobile-First) */}
      <section
        aria-label="Today's Trading Summary"
        className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl overflow-hidden"
      >
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {todaySummary.label} P&amp;L
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {formatReadableIstDate(todayIst)}
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  marketStatus.isOpen
                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                    : ''
                }
              >
                {marketStatus.label}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1
                className={`font-mono tabular-nums text-3xl sm:text-4xl font-semibold tracking-tight ${
                  todaySummary.netRupees > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : todaySummary.netRupees < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {formatINR(todaySummary.netRupees)}
              </h1>
              <span
                className={`font-mono tabular-nums text-sm font-medium ${
                  todaySummary.netPoints > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : todaySummary.netPoints < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {todaySummary.netPoints >= 0 ? '+' : ''}
                {todaySummary.netPoints.toFixed(1)} pts
              </span>
            </div>

            {isAdmin && !hasTodayRecorded && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Showing {labScenarioName}
              </p>
            )}
            {!isAdmin && !hasTodayRecorded && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {fyersConnected
                  ? 'Broker connected · Awaiting today’s automated executions'
                  : 'Connect your broker account to enable automated trading'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => onNavigate('lab')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                <Activity className="w-4 h-4" aria-hidden="true" />
                <span>Strategy Lab</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('integrations')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                <Link2 className="w-4 h-4" aria-hidden="true" />
                <span>{fyersConnected ? 'Broker Settings' : 'Connect Broker'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('journal')}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#161D2B] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Positions</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Hairline-Divided 2x2 (Mobile) / 4-Column (Desktop) Today Operational Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#0E131D]/70">
          {isAdmin ? (
            <div className="p-4 sm:px-6 border-r border-b lg:border-b-0 border-slate-200/80 dark:border-slate-800/80">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Today&apos;s Bias
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {labResult.finalBias === 'BULLISH' && (
                  <TrendingUp
                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                )}
                {labResult.finalBias === 'BEARISH' && (
                  <TrendingDown
                    className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`font-display text-base sm:text-lg font-semibold ${
                    labResult.finalBias === 'BULLISH'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : labResult.finalBias === 'BEARISH'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {biasText}
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {biasSubtext}
              </div>
            </div>
          ) : (
            <div className="p-4 sm:px-6 border-r border-b lg:border-b-0 border-slate-200/80 dark:border-slate-800/80">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Subscription
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <ShieldCheck
                  className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
                  aria-hidden="true"
                />
                <span className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {subscriptionSummary.label}
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {subscriptionSummary.sub}
              </div>
            </div>
          )}

          <div className="p-4 sm:px-6 lg:border-r border-b lg:border-b-0 border-slate-200/80 dark:border-slate-800/80">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Trades Executed
            </div>
            <div className="mt-1 font-mono tabular-nums text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              {todaySummary.tradesCount}
              {isAdmin && (
                <>
                  {' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    / {config.maxTradesPerDay} cap
                  </span>
                </>
              )}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {todaySummary.wins}W
              </span>{' '}
              ·{' '}
              <span className="text-red-600 dark:text-red-400 font-medium">
                {todaySummary.losses}L
              </span>
            </div>
          </div>

          <div className="p-4 sm:px-6 border-r border-slate-200/80 dark:border-slate-800/80">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Open Positions
            </div>
            <div className="mt-1 font-mono tabular-nums text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              {openPositions.length}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                {openPositions.length === 1 ? 'active' : 'open'}
              </span>
            </div>
            <div
              className={`text-[11px] font-mono tabular-nums mt-0.5 ${
                openPositions.length === 0
                  ? 'text-slate-500 dark:text-slate-400'
                  : openMtmRupees >= 0
                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                  : 'text-red-600 dark:text-red-400 font-medium'
              }`}
            >
              {openPositions.length > 0
                ? `MTM ${formatINR(openMtmRupees)}`
                : 'No open exposure'}
            </div>
          </div>

          <div className="p-4 sm:px-6">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Orders Today
            </div>
            <div className="mt-1 font-mono tabular-nums text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              {todaySummary.ordersCount}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              {isAdmin
                ? `${config.lots} lot · ${config.lots * config.lotSize} qty`
                : fyersConnected
                ? 'Fyers Connected'
                : 'Broker Not Connected'}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Key Performance Cards: MTD P&L, Accuracy %, Profit/Loss Trades, Risk & Best Day */}
      <section
        aria-label="Performance Metrics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        {/* MTD Net P&L */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {mtdStats.isCurrentMonth ? 'MTD Net P&L' : mtdStats.monthLabel}
          </div>
          <div
            className={`mt-2 font-mono tabular-nums text-xl sm:text-2xl font-semibold tracking-tight truncate ${
              mtdStats.netRupees > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : mtdStats.netRupees < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatINR(mtdStats.netRupees)}
          </div>
          <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {mtdStats.netPoints >= 0 ? '+' : ''}
            {mtdStats.netPoints.toFixed(1)} pts · {mtdStats.winningDays}G /{' '}
            {mtdStats.losingDays}R
          </div>
        </div>

        {/* Accuracy / Win Rate */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Accuracy
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {mtdStats.accuracyPct.toFixed(1)}%
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              PF {mtdStats.profitFactor.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-200"
                style={{
                  width: `${Math.min(100, Math.max(0, mtdStats.accuracyPct))}%`,
                }}
              />
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {mtdStats.totalTrades} total trade
              {mtdStats.totalTrades === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {/* Profit vs Loss Trades */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Profit / Loss Trades
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 font-mono tabular-nums text-xl sm:text-2xl font-semibold tracking-tight">
            <span className="text-emerald-600 dark:text-emerald-400">
              {mtdStats.wins}
            </span>
            <span className="text-slate-300 dark:text-slate-700 text-base">
              /
            </span>
            <span className="text-red-600 dark:text-red-400">
              {mtdStats.losses}
            </span>
            {mtdStats.breakevens > 0 && (
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-0.5">
                +{mtdStats.breakevens}BE
              </span>
            )}
          </div>
          <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Avg +{mtdStats.avgWin.toFixed(0)} / -{mtdStats.avgLoss.toFixed(0)} pt
          </div>
        </div>

        {/* Max Drawdown & Best Day */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Max Drawdown
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            -{mtdStats.maxDrawdown.toFixed(1)}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
              pts
            </span>
          </div>
          <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Best day:{' '}
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              +{mtdStats.bestDay.toFixed(1)} pts
            </span>
          </div>
        </div>
      </section>

      {/* 3. Operational Split: Positions/Orders/Trades + Equity/Calendar */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5 sm:gap-6 items-stretch">
        {/* Left: Positions, Orders & Recent Trades (Touch-Friendly Mobile List + Desktop Table) */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Trade activity views"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg"
            >
              {(
                [
                  {
                    id: 'positions',
                    label: `Positions (${orderJournal.positions.length})`,
                  },
                  {
                    id: 'orders',
                    label: `Orders (${orderJournal.orders.length})`,
                  },
                  {
                    id: 'trades',
                    label: `Trades (${
                      hasJournalData
                        ? journal.entries.length
                        : isAdmin
                        ? labResult.trades.length
                        : orderJournal.positions.length
                    })`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activityTab === tab.id}
                  onClick={() => setActivityTab(tab.id)}
                  className={`px-2.5 sm:px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    activityTab === tab.id
                      ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  isAdmin && activityTab === 'trades' ? 'calendar' : 'journal'
                )
              }
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap cursor-pointer"
            >
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1">
            {activityTab === 'positions' &&
              (displayedPositions.length === 0 ? (
                <div className="px-5 py-10 text-center space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {isAdmin
                      ? 'No positions recorded yet. Start a live feed or record a Strategy Lab session to track open and closed positions here.'
                      : fyersConnected
                      ? 'No positions recorded yet. Automated trades executed on your connected broker account will appear here.'
                      : 'Connect your Fyers broker account to start tracking live and closed automated positions.'}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate(
                        !isAdmin && !fyersConnected ? 'integrations' : 'journal'
                      )
                    }
                    className="px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                  >
                    {!isAdmin && !fyersConnected
                      ? 'Connect Broker Account'
                      : 'Open Trades & Positions'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Mobile Touch Cards */}
                  <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                    {displayedPositions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onNavigate('journal')}
                        className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 active:bg-slate-50 dark:active:bg-slate-800/40 cursor-pointer"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={`font-mono font-semibold ${
                                p.direction === 'LONG'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {p.direction}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {p.symbol.replace('NSE:', '').replace('-INDEX', '')}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                              · {p.status === 'OPEN' ? 'Open' : exitReasonLabel(p.exitReason)}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {p.date} · {p.entryTime} · {p.avgEntryPrice.toFixed(1)} →{' '}
                            {p.ltpOrExitPrice.toFixed(1)}
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div
                            className={`text-sm font-semibold ${
                              p.pnlRupees > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : p.pnlRupees < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {formatINR(p.pnlRupees)}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {p.pnlPoints >= 0 ? '+' : ''}
                            {p.pnlPoints.toFixed(1)} pts
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0E131D] text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-5">Date / Time</th>
                          <th className="py-2.5 px-3">Side</th>
                          <th className="py-2.5 px-3">Entry → Mark</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-5 text-right">P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                        {displayedPositions.map((p) => (
                          <tr
                            key={p.id}
                            onClick={() => onNavigate('journal')}
                            className="h-11 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                          >
                            <td className="px-5 font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {p.date}{' '}
                              <span className="text-slate-400 dark:text-slate-500">
                                {p.entryTime}
                              </span>
                            </td>
                            <td
                              className={`px-3 font-mono font-semibold whitespace-nowrap ${
                                p.direction === 'LONG'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {p.direction}
                            </td>
                            <td className="px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {p.avgEntryPrice.toFixed(1)} →{' '}
                              {p.ltpOrExitPrice.toFixed(1)}
                            </td>
                            <td className="px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {p.status === 'OPEN'
                                ? 'Open'
                                : exitReasonLabel(p.exitReason)}
                            </td>
                            <td
                              className={`px-5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                p.pnlRupees > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : p.pnlRupees < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {formatINR(p.pnlRupees)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ))}

            {activityTab === 'orders' &&
              (displayedOrders.length === 0 ? (
                <div className="px-5 py-10 text-center space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {isAdmin
                      ? 'No executed orders yet. Entry, stop-loss, and target legs from Strategy Lab appear here automatically.'
                      : 'No executed orders yet. Entry, stop-loss, and exit fills on your account will appear here automatically.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('journal')}
                    className="px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Open Order Book
                  </button>
                </div>
              ) : (
                <>
                  {/* Mobile Touch Cards */}
                  <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                    {displayedOrders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => onNavigate('journal')}
                        className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 active:bg-slate-50 dark:active:bg-slate-800/40 cursor-pointer"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={`font-mono font-semibold ${
                                o.side === 'BUY'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {o.side}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {o.leg}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                              · {o.qty} qty
                            </span>
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {o.date} · {o.time} IST · {o.status}
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {o.price.toFixed(2)}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {o.orderType}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0E131D] text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-5">Time</th>
                          <th className="py-2.5 px-3">Side</th>
                          <th className="py-2.5 px-3">Leg</th>
                          <th className="py-2.5 px-3 text-right">Qty</th>
                          <th className="py-2.5 px-5 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                        {displayedOrders.map((o) => (
                          <tr
                            key={o.id}
                            onClick={() => onNavigate('journal')}
                            className="h-11 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                          >
                            <td className="px-5 font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {o.date}{' '}
                              <span className="text-slate-400 dark:text-slate-500">
                                {o.time}
                              </span>
                            </td>
                            <td
                              className={`px-3 font-mono font-semibold whitespace-nowrap ${
                                o.side === 'BUY'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {o.side}
                            </td>
                            <td className="px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {o.leg} · {o.orderType}
                            </td>
                            <td className="px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {o.qty}
                            </td>
                            <td className="px-5 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {o.price.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ))}

            {activityTab === 'trades' &&
              (displayedTrades.length === 0 ? (
                <div className="px-5 py-10 text-center space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {isAdmin
                      ? 'No completed trades logged yet. Run a backtest or live session to populate your trade history.'
                      : 'No completed trades logged yet. Completed executions on your broker account will populate here.'}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onNavigate('backtest1y')}
                      className="px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                    >
                      Open Backtest
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Mobile Touch Cards */}
                  <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                    {displayedTrades.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          t.clickableDate
                            ? onOpenCalendarDate(t.clickableDate)
                            : onNavigate(isAdmin ? 'lab' : 'journal')
                        }
                        className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 active:bg-slate-50 dark:active:bg-slate-800/40 cursor-pointer"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={`font-mono font-semibold ${
                                t.direction === 'LONG'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {t.direction}
                            </span>
                            <span className="text-slate-700 dark:text-slate-200 font-medium">
                              {exitReasonLabel(t.exitReason)}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {t.date} · {t.time} · {t.entryPrice.toFixed(1)} →{' '}
                            {t.exitPrice !== undefined
                              ? t.exitPrice.toFixed(1)
                              : '--'}
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div
                            className={`text-sm font-semibold ${
                              t.pnlRupees > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : t.pnlRupees < 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {formatINR(t.pnlRupees)}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {t.pnlPoints >= 0 ? '+' : ''}
                            {t.pnlPoints.toFixed(1)} pts
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0E131D] text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-5">Date</th>
                          <th className="py-2.5 px-3">Side</th>
                          <th className="py-2.5 px-3">Entry → Exit</th>
                          <th className="py-2.5 px-3">Outcome</th>
                          <th className="py-2.5 px-3 text-right">Pts</th>
                          <th className="py-2.5 px-5 text-right">P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                        {displayedTrades.map((t) => (
                          <tr
                            key={t.id}
                            onClick={() =>
                              t.clickableDate
                                ? onOpenCalendarDate(t.clickableDate)
                                : onNavigate(isAdmin ? 'lab' : 'journal')
                            }
                            className="h-11 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                          >
                            <td className="px-5 font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {t.date}
                            </td>
                            <td
                              className={`px-3 font-mono font-semibold whitespace-nowrap ${
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
                              {exitReasonLabel(t.exitReason)}
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
                              className={`px-5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
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
                </>
              ))}
          </div>
        </div>

        {/* Right: Equity Curve / Monthly P&L Heatmap Switcher Card */}
        <div className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label="Performance visual mode"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg"
            >
              <button
                type="button"
                role="tab"
                aria-selected={chartTab === 'equity'}
                onClick={() => setChartTab('equity')}
                className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  chartTab === 'equity'
                    ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Equity Curve
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={chartTab === 'calendar'}
                onClick={() => setChartTab('calendar')}
                className={`px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  chartTab === 'calendar'
                    ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {formatMonthLabel(activeMonth)}
              </button>
            </div>

            {isAdmin ? (
              !hasJournalData && labResult.trades.length > 0 ? (
                <button
                  type="button"
                  onClick={onSaveLabSessionToCalendar}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Save</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('calendar')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap cursor-pointer"
                >
                  <span>Calendar</span>
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('journal')}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap cursor-pointer"
              >
                <span>Journal</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {chartTab === 'equity' ? (
            <div className="flex-1 min-h-[250px] px-3 sm:px-4 pt-4 pb-3 flex flex-col">
              {equitySeries.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  No executed trades available yet.
                </div>
              ) : (
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={equitySeries}
                      margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
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
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{
                          fontSize: 11,
                          fill: tickFill,
                          fontFamily: 'var(--font-mono)',
                        }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}`}
                      />
                      <ReferenceLine
                        y={0}
                        stroke={refStroke}
                        strokeDasharray="4 3"
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) {
                            return null;
                          }
                          const pt = payload[0].payload as {
                            fullDate: string;
                            dayPoints: number;
                            cumPoints: number;
                            cumRupees: number;
                          };
                          return (
                            <div className="bg-white dark:bg-[#161D2B] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-lg text-xs font-mono tabular-nums space-y-1">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {pt.fullDate}
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">
                                Change:{' '}
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
                                Cum: {pt.cumPoints >= 0 ? '+' : ''}
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
                </div>
              )}
            </div>
          ) : (
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
                      return <div key={`empty-${idx}`} className="h-10" />;
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
                        className={`h-10 rounded-lg border flex flex-col items-center justify-center font-mono tabular-nums transition-colors cursor-pointer ${cls}`}
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
                <span>
                  {isAdmin
                    ? 'Tap any day to inspect trades'
                    : 'Daily performance overview'}
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onNavigate('backtest1y')}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium cursor-pointer"
                  >
                    Run Backtest
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
