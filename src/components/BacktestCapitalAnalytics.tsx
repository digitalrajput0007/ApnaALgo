import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import {
  MultiDayBacktestResult,
  StrategyConfig,
  TradeExitReason,
} from '../types/strategy';
import { formatINR } from '../utils/formatters';

export type CapitalGranularity = 'trade' | 'day' | 'month';
type ChartViewStyle = 'combined' | 'equity';

interface BacktestCapitalAnalyticsProps {
  backtest: MultiDayBacktestResult;
  config: StrategyConfig;
  symbol: string;
  fromDate: string;
  toDate: string;
  startingCapital: number;
  startingCapitalInput: string;
  onStartingCapitalInputChange: (val: string) => void;
  theme: 'dark' | 'light';
}

interface TradeCapitalPoint {
  seq: number;
  label: string;
  tradeId: number;
  date: string;
  entryTime: string;
  exitTime: string;
  direction: 'LONG' | 'SHORT';
  exitReason: TradeExitReason;
  pnlPoints: number;
  gainRupees: number;
  periodReturnPct: number;
  capitalBefore: number;
  capitalAfter: number;
  cumulativeGainRupees: number;
  cumulativeReturnPct: number;
}

interface DayCapitalPoint {
  date: string;
  label: string;
  bias: string;
  tradesCount: number;
  wins: number;
  losses: number;
  breakevens: number;
  dayPoints: number;
  gainRupees: number;
  periodReturnPct: number;
  capitalBefore: number;
  capitalAfter: number;
  cumulativeGainRupees: number;
  cumulativeReturnPct: number;
  drawdownRupees: number;
}

interface MonthCapitalPoint {
  month: string;
  label: string;
  tradingDays: number;
  tradesCount: number;
  wins: number;
  losses: number;
  netPoints: number;
  gainRupees: number;
  periodReturnPct: number;
  capitalBefore: number;
  capitalAfter: number;
  cumulativeGainRupees: number;
  cumulativeReturnPct: number;
}

function formatCompactInr(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

function formatExitLabel(reason: TradeExitReason): string {
  switch (reason) {
    case 'TARGET_HIT':
      return 'Target Hit';
    case 'STRICT_SL_HIT':
      return 'SL Hit';
    case 'TRAILED_COST_EXIT':
      return 'Cost SL';
    case 'EOD_SQUARE_OFF':
      return 'EOD Exit';
    case 'OPEN':
      return 'Open';
  }
}

export const BacktestCapitalAnalytics: React.FC<
  BacktestCapitalAnalyticsProps
> = ({
  backtest,
  config,
  symbol,
  fromDate,
  toDate,
  startingCapital,
  startingCapitalInput,
  onStartingCapitalInputChange,
  theme,
}) => {
  const [granularity, setGranularity] = useState<CapitalGranularity>('day');
  const [chartStyle, setChartStyle] = useState<ChartViewStyle>('combined');

  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#1E293B' : '#e2e8f0';
  const tickFill = isDark ? '#94a3b8' : '#64748b';
  const zeroStroke = isDark ? '#475569' : '#94a3b8';
  const posColor = isDark ? '#10b981' : '#16a34a';
  const negColor = isDark ? '#ef4444' : '#dc2626';
  const capitalLineColor = isDark ? '#3b82f6' : '#2563eb';
  const isOptionBuying = config.instrumentType === 'NIFTY_ATM_OPT';

  // 1) Trade-wise running capital series
  const tradeSeries = useMemo<TradeCapitalPoint[]>(() => {
    let running = startingCapital;
    return backtest.allTrades.map((t, idx) => {
      const before = running;
      const gain = Math.round(t.pnlRupees);
      running = before + gain;
      const periodRet = before > 0 ? (gain / before) * 100 : 0;
      const cumGain = running - startingCapital;
      const cumRet = startingCapital > 0 ? (cumGain / startingCapital) * 100 : 0;
      return {
        seq: idx + 1,
        label: `#${idx + 1}`,
        tradeId: t.id,
        date: t.date || '—',
        entryTime: t.entryTime,
        exitTime: t.exitTime || '—',
        direction: t.direction,
        exitReason: t.exitReason,
        pnlPoints: t.pnlPoints,
        gainRupees: gain,
        periodReturnPct: periodRet,
        capitalBefore: before,
        capitalAfter: running,
        cumulativeGainRupees: cumGain,
        cumulativeReturnPct: cumRet,
      };
    });
  }, [backtest.allTrades, startingCapital]);

  // 2) Day-wise running capital series
  const daySeries = useMemo<DayCapitalPoint[]>(() => {
    let running = startingCapital;
    let peak = startingCapital;
    return backtest.dailySummaries.map((d) => {
      const before = running;
      const gain = Math.round(d.dayRupees);
      running = before + gain;
      if (running > peak) peak = running;
      const dd = peak - running;
      const periodRet = before > 0 ? (gain / before) * 100 : 0;
      const cumGain = running - startingCapital;
      const cumRet = startingCapital > 0 ? (cumGain / startingCapital) * 100 : 0;
      return {
        date: d.date,
        label: d.date.slice(5), // MM-DD
        bias: d.bias,
        tradesCount: d.tradesCount,
        wins: d.wins,
        losses: d.losses,
        breakevens: d.breakevens,
        dayPoints: d.dayPoints,
        gainRupees: gain,
        periodReturnPct: periodRet,
        capitalBefore: before,
        capitalAfter: running,
        cumulativeGainRupees: cumGain,
        cumulativeReturnPct: cumRet,
        drawdownRupees: dd,
      };
    });
  }, [backtest.dailySummaries, startingCapital]);

  // 3) Month-wise running capital series
  const monthSeries = useMemo<MonthCapitalPoint[]>(() => {
    let running = startingCapital;
    return backtest.monthlySummaries.map((m) => {
      const before = running;
      const gain = Math.round(m.netRupees);
      running = before + gain;
      const periodRet = before > 0 ? (gain / before) * 100 : 0;
      const cumGain = running - startingCapital;
      const cumRet = startingCapital > 0 ? (cumGain / startingCapital) * 100 : 0;
      return {
        month: m.month,
        label: m.label,
        tradingDays: m.tradingDays,
        tradesCount: m.tradesCount,
        wins: m.wins,
        losses: m.losses,
        netPoints: m.netPoints,
        gainRupees: gain,
        periodReturnPct: periodRet,
        capitalBefore: before,
        capitalAfter: running,
        cumulativeGainRupees: cumGain,
        cumulativeReturnPct: cumRet,
      };
    });
  }, [backtest.monthlySummaries, startingCapital]);

  // Headline capital KPIs
  const summary = useMemo(() => {
    const netGain = Math.round(backtest.netRupees);
    const endingCapital = startingCapital + netGain;
    const totalRoiPct =
      startingCapital > 0 ? (netGain / startingCapital) * 100 : 0;

    let peakCapital = startingCapital;
    let maxDrawdownRupees = 0;
    let maxDrawdownPct = 0;
    let running = startingCapital;
    for (const t of backtest.allTrades) {
      running += Math.round(t.pnlRupees);
      if (running > peakCapital) peakCapital = running;
      const dd = peakCapital - running;
      if (dd > maxDrawdownRupees) {
        maxDrawdownRupees = dd;
        maxDrawdownPct = peakCapital > 0 ? (dd / peakCapital) * 100 : 0;
      }
    }

    const avgPerTrade =
      tradeSeries.length > 0 ? netGain / tradeSeries.length : 0;
    const avgPerDay = daySeries.length > 0 ? netGain / daySeries.length : 0;
    const avgPerMonth =
      monthSeries.length > 0 ? netGain / monthSeries.length : 0;

    const bestMonth =
      monthSeries.length > 0
        ? monthSeries.reduce((a, b) => (b.gainRupees > a.gainRupees ? b : a))
        : null;
    const worstMonth =
      monthSeries.length > 0
        ? monthSeries.reduce((a, b) => (b.gainRupees < a.gainRupees ? b : a))
        : null;

    return {
      netGain,
      endingCapital,
      totalRoiPct,
      peakCapital,
      maxDrawdownRupees,
      maxDrawdownPct,
      avgPerTrade,
      avgPerDay,
      avgPerMonth,
      bestMonth,
      worstMonth,
    };
  }, [backtest, startingCapital, tradeSeries.length, daySeries.length, monthSeries]);

  const activeData: Array<
    TradeCapitalPoint | DayCapitalPoint | MonthCapitalPoint
  > =
    granularity === 'trade'
      ? tradeSeries
      : granularity === 'day'
      ? daySeries
      : monthSeries;

  // Gradient split offset for Equity AreaChart anchored at Starting Capital
  const capitalZeroOffset = useMemo(() => {
    if (activeData.length === 0) return 1;
    let maxC = startingCapital;
    let minC = startingCapital;
    for (const pt of activeData) {
      if (pt.capitalAfter > maxC) maxC = pt.capitalAfter;
      if (pt.capitalAfter < minC) minC = pt.capitalAfter;
    }
    if (maxC <= startingCapital) return 0;
    if (minC >= startingCapital) return 1;
    return (maxC - startingCapital) / (maxC - minC);
  }, [activeData, startingCapital]);

  const activeAvgLabel =
    granularity === 'trade'
      ? 'Avg Gain / Trade'
      : granularity === 'day'
      ? 'Avg Gain / Day'
      : 'Avg Gain / Month';
  const activeAvgValue =
    granularity === 'trade'
      ? summary.avgPerTrade
      : granularity === 'day'
      ? summary.avgPerDay
      : summary.avgPerMonth;

  return (
    <section
      aria-label="Backtest Capital Growth and Gain Loss Analytics"
      className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Card Header + Inline Starting Capital Input + Granularity Tabs */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Wallet
              className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0"
              aria-hidden="true"
            />
            <span>Capital Growth &amp; Gain / Loss Breakdown</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            {symbol} · {fromDate} to {toDate} · {config.lots} lot
            {config.lots === 1 ? '' : 's'} × {config.lotSize} qty
            {isOptionBuying
              ? ` (${config.optionDeltaEstimate}Δ Options Buy)`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Editable Starting Capital Input */}
          <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#161D2B] border border-slate-200 dark:border-slate-700 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
              Starting Capital ₹
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1000}
              max={1000000000}
              step={1000}
              value={startingCapitalInput}
              onChange={(e) => onStartingCapitalInputChange(e.target.value)}
              aria-label="Backtest starting capital in rupees"
              className="w-28 bg-transparent font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 focus:outline-none text-right"
            />
          </label>

          {/* Trade-wise / Day-wise / Month-wise Switcher */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
            {(
              [
                { id: 'trade', label: `Trade-wise (${tradeSeries.length})` },
                { id: 'day', label: `Day-wise (${daySeries.length})` },
                { id: 'month', label: `Month-wise (${monthSeries.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setGranularity(tab.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  granularity === tab.id
                    ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Chart Style Switcher */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
            <button
              type="button"
              onClick={() => setChartStyle('combined')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                chartStyle === 'combined'
                  ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Gain + Capital
            </button>
            <button
              type="button"
              onClick={() => setChartStyle('equity')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                chartStyle === 'equity'
                  ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Capital Curve
            </button>
          </div>
        </div>
      </div>

      {/* 4-Column Capital KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-slate-200 dark:border-slate-800 divide-y lg:divide-y-0 divide-x divide-slate-200 dark:divide-slate-800">
        <div className="px-5 py-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Starting Capital
          </div>
          <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100">
            {formatINR(startingCapital, { signed: false, decimals: 0 })}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
            Initial backtest fund
          </div>
        </div>

        <div className="px-5 py-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <span>Ending Capital &amp; ROI</span>
            {summary.netGain >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
            )}
          </div>
          <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100">
            {formatINR(summary.endingCapital, { signed: false, decimals: 0 })}
          </div>
          <div
            className={`text-[11px] font-mono tabular-nums font-semibold mt-0.5 ${
              summary.netGain >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatINR(summary.netGain, { signed: true, decimals: 0 })} (
            {summary.totalRoiPct >= 0 ? '+' : ''}
            {summary.totalRoiPct.toFixed(2)}%)
          </div>
        </div>

        <div className="px-5 py-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Peak Capital &amp; Max DD
          </div>
          <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100">
            {formatINR(summary.peakCapital, { signed: false, decimals: 0 })}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-red-600 dark:text-red-400 mt-0.5">
            Max DD -{formatINR(summary.maxDrawdownRupees, { signed: false, decimals: 0 })} (
            -{summary.maxDrawdownPct.toFixed(1)}%)
          </div>
        </div>

        <div className="px-5 py-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {activeAvgLabel}
          </div>
          <div
            className={`mt-1 font-mono tabular-nums text-lg font-bold ${
              activeAvgValue >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatINR(activeAvgValue, { signed: true, decimals: 0 })}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
            {summary.bestMonth
              ? `Best Mo: ${summary.bestMonth.label} (${formatINR(
                  summary.bestMonth.gainRupees,
                  { signed: true, decimals: 0 }
                )})`
              : `${backtest.totalTrades} trades evaluated`}
          </div>
        </div>
      </div>

      {/* Main Visualization Canvas */}
      <div className="px-4 pt-5 pb-3">
        {activeData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
            No {granularity} records generated for this strategy configuration.
          </div>
        ) : (
          <>
            {/* Legend Strip */}
            <div className="px-2 pb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-4">
                {chartStyle === 'combined' ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                      <span>
                        {granularity === 'trade'
                          ? 'Trade Gain (₹)'
                          : granularity === 'day'
                          ? 'Day Gain (₹)'
                          : 'Month Gain (₹)'}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-red-500 inline-block" />
                      <span>Loss (₹)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-4 h-0.5 bg-blue-500 inline-block" />
                      <span>Running Capital (₹)</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                      <span>Above Starting Capital</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-red-500 inline-block" />
                      <span>Below Starting Capital</span>
                    </span>
                  </>
                )}
              </div>
              <span className="font-mono tabular-nums">
                Baseline: {formatINR(startingCapital, { signed: false, decimals: 0 })}
              </span>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartStyle === 'combined' ? (
                  <ComposedChart
                    data={activeData}
                    margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                  >
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
                      axisLine={{ stroke: gridStroke }}
                      minTickGap={24}
                    />
                    {/* Left Y Axis: Period Gain / Loss Bars */}
                    <YAxis
                      yAxisId="gain"
                      tick={{
                        fontSize: 11,
                        fill: tickFill,
                        fontFamily: 'var(--font-mono)',
                      }}
                      tickLine={false}
                      axisLine={false}
                      width={66}
                      tickFormatter={(val: number) => formatCompactInr(val)}
                    />
                    {/* Right Y Axis: Running Account Capital Line */}
                    <YAxis
                      yAxisId="capital"
                      orientation="right"
                      domain={['auto', 'auto']}
                      tick={{
                        fontSize: 11,
                        fill: capitalLineColor,
                        fontFamily: 'var(--font-mono)',
                      }}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      tickFormatter={(val: number) => formatCompactInr(val)}
                    />
                    <ReferenceLine
                      yAxisId="gain"
                      y={0}
                      stroke={zeroStroke}
                      strokeDasharray="3 3"
                    />
                    <ReferenceLine
                      yAxisId="capital"
                      y={startingCapital}
                      stroke={capitalLineColor}
                      strokeOpacity={0.35}
                      strokeDasharray="4 4"
                    />
                    <Tooltip
                      cursor={{
                        fill: isDark
                          ? 'rgba(148,163,184,0.08)'
                          : 'rgba(148,163,184,0.12)',
                      }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0)
                          return null;
                        const row = payload[0].payload as
                          | TradeCapitalPoint
                          | DayCapitalPoint
                          | MonthCapitalPoint;
                        return (
                          <CapitalChartTooltip
                            granularity={granularity}
                            row={row}
                            isOptionBuying={isOptionBuying}
                          />
                        );
                      }}
                    />
                    <Bar
                      yAxisId="gain"
                      dataKey="gainRupees"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={granularity === 'month' ? 40 : 18}
                      isAnimationActive={false}
                    >
                      {activeData.map((entry, idx) => (
                        <Cell
                          key={
                            'seq' in entry
                              ? `t_${entry.seq}`
                              : 'month' in entry
                              ? entry.month
                              : `${entry.date}_${idx}`
                          }
                          fill={entry.gainRupees >= 0 ? posColor : negColor}
                          fillOpacity={0.82}
                        />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="capital"
                      type="monotone"
                      dataKey="capitalAfter"
                      stroke={capitalLineColor}
                      strokeWidth={2.25}
                      dot={granularity === 'month' ? { r: 3.5 } : false}
                      activeDot={{ r: 4.5 }}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                ) : (
                  <AreaChart
                    data={activeData}
                    margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="btCapitalStroke"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset={capitalZeroOffset}
                          stopColor={posColor}
                          stopOpacity={1}
                        />
                        <stop
                          offset={capitalZeroOffset}
                          stopColor={negColor}
                          stopOpacity={1}
                        />
                      </linearGradient>
                      <linearGradient
                        id="btCapitalFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset={0}
                          stopColor={posColor}
                          stopOpacity={0.24}
                        />
                        <stop
                          offset={capitalZeroOffset}
                          stopColor={posColor}
                          stopOpacity={0.03}
                        />
                        <stop
                          offset={capitalZeroOffset}
                          stopColor={negColor}
                          stopOpacity={0.03}
                        />
                        <stop
                          offset={1}
                          stopColor={negColor}
                          stopOpacity={0.24}
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
                      axisLine={{ stroke: gridStroke }}
                      minTickGap={24}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{
                        fontSize: 11,
                        fill: tickFill,
                        fontFamily: 'var(--font-mono)',
                      }}
                      tickLine={false}
                      axisLine={false}
                      width={74}
                      tickFormatter={(val: number) => formatCompactInr(val)}
                    />
                    <ReferenceLine
                      y={startingCapital}
                      stroke={zeroStroke}
                      strokeDasharray="4 3"
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0)
                          return null;
                        const row = payload[0].payload as
                          | TradeCapitalPoint
                          | DayCapitalPoint
                          | MonthCapitalPoint;
                        return (
                          <CapitalChartTooltip
                            granularity={granularity}
                            row={row}
                            isOptionBuying={isOptionBuying}
                          />
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="capitalAfter"
                      stroke="url(#btCapitalStroke)"
                      strokeWidth={2.25}
                      fill="url(#btCapitalFill)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Synchronized Granular Ledger Table (Trade-wise / Day-wise / Month-wise) */}
      <div className="border-t border-slate-200 dark:border-slate-800">
        <div className="px-5 py-2.5 bg-slate-50/70 dark:bg-[#0E131D] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {granularity === 'trade'
              ? `Trade-wise Capital Ledger (${tradeSeries.length} trades)`
              : granularity === 'day'
              ? `Day-wise Capital Ledger (${daySeries.length} trading days)`
              : `Month-wise Capital Ledger (${monthSeries.length} months)`}
          </span>
          <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
            Showing newest first
          </span>
        </div>

        <div className="overflow-x-auto max-h-80">
          {granularity === 'trade' && (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 dark:bg-[#0E131D] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-4">Trade</th>
                  <th className="py-2.5 px-3">Date &amp; Time</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">Exit</th>
                  <th className="py-2.5 px-3 text-right">Gain / Loss (₹)</th>
                  <th className="py-2.5 px-3 text-right">Trade %</th>
                  <th className="py-2.5 px-3 text-right">Capital After</th>
                  <th className="py-2.5 px-4 text-right">Cum. ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs font-mono tabular-nums">
                {[...tradeSeries].reverse().map((row) => (
                  <tr
                    key={`tr_${row.seq}`}
                    className="h-9 hover:bg-slate-50 dark:hover:bg-[#161D2B]/60"
                  >
                    <td className="px-4 font-semibold text-slate-900 dark:text-slate-100">
                      #{row.seq}
                    </td>
                    <td className="px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {row.date} · {row.entryTime}–{row.exitTime}
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          row.direction === 'LONG'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isOptionBuying
                          ? row.direction === 'LONG'
                            ? 'BUY CE'
                            : 'BUY PE'
                          : row.direction}
                      </span>
                    </td>
                    <td className="px-3 font-sans text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatExitLabel(row.exitReason)}
                    </td>
                    <td
                      className={`px-3 text-right font-semibold whitespace-nowrap ${
                        row.gainRupees > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.gainRupees < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {formatINR(row.gainRupees, { signed: true, decimals: 0 })}
                    </td>
                    <td
                      className={`px-3 text-right whitespace-nowrap ${
                        row.periodReturnPct > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.periodReturnPct < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {row.periodReturnPct >= 0 ? '+' : ''}
                      {row.periodReturnPct.toFixed(2)}%
                    </td>
                    <td className="px-3 text-right font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatINR(row.capitalAfter, { signed: false, decimals: 0 })}
                    </td>
                    <td
                      className={`px-4 text-right font-semibold whitespace-nowrap ${
                        row.cumulativeReturnPct >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {row.cumulativeReturnPct >= 0 ? '+' : ''}
                      {row.cumulativeReturnPct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {granularity === 'day' && (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 dark:bg-[#0E131D] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-3">Bias</th>
                  <th className="py-2.5 px-3 text-right">Trades (W/L)</th>
                  <th className="py-2.5 px-3 text-right">Day Gain / Loss</th>
                  <th className="py-2.5 px-3 text-right">Day %</th>
                  <th className="py-2.5 px-3 text-right">End Capital</th>
                  <th className="py-2.5 px-4 text-right">Cum. ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs font-mono tabular-nums">
                {[...daySeries].reverse().map((row) => (
                  <tr
                    key={row.date}
                    className="h-9 hover:bg-slate-50 dark:hover:bg-[#161D2B]/60"
                  >
                    <td className="px-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {row.date}
                    </td>
                    <td className="px-3 font-sans whitespace-nowrap">
                      <span
                        className={
                          row.bias === 'BULLISH'
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : row.bias === 'BEARISH'
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {row.bias === 'PENDING' ? 'Undecided' : row.bias}
                      </span>
                    </td>
                    <td className="px-3 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {row.tradesCount} ({row.wins}W/{row.losses}L)
                    </td>
                    <td
                      className={`px-3 text-right font-semibold whitespace-nowrap ${
                        row.gainRupees > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.gainRupees < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {formatINR(row.gainRupees, { signed: true, decimals: 0 })}
                    </td>
                    <td
                      className={`px-3 text-right whitespace-nowrap ${
                        row.periodReturnPct > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.periodReturnPct < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {row.periodReturnPct >= 0 ? '+' : ''}
                      {row.periodReturnPct.toFixed(2)}%
                    </td>
                    <td className="px-3 text-right font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatINR(row.capitalAfter, { signed: false, decimals: 0 })}
                    </td>
                    <td
                      className={`px-4 text-right font-semibold whitespace-nowrap ${
                        row.cumulativeReturnPct >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {row.cumulativeReturnPct >= 0 ? '+' : ''}
                      {row.cumulativeReturnPct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {granularity === 'month' && (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 dark:bg-[#0E131D] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-4">Month</th>
                  <th className="py-2.5 px-3 text-right">Days</th>
                  <th className="py-2.5 px-3 text-right">Trades (W/L)</th>
                  <th className="py-2.5 px-3 text-right">Start Capital</th>
                  <th className="py-2.5 px-3 text-right">Month Gain / Loss</th>
                  <th className="py-2.5 px-3 text-right">Month %</th>
                  <th className="py-2.5 px-3 text-right">End Capital</th>
                  <th className="py-2.5 px-4 text-right">Cum. ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs font-mono tabular-nums">
                {[...monthSeries].reverse().map((row) => (
                  <tr
                    key={row.month}
                    className="h-9 hover:bg-slate-50 dark:hover:bg-[#161D2B]/60"
                  >
                    <td className="px-4 font-sans font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {row.label}
                    </td>
                    <td className="px-3 text-right text-slate-600 dark:text-slate-400">
                      {row.tradingDays}
                    </td>
                    <td className="px-3 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {row.tradesCount} ({row.wins}W/{row.losses}L)
                    </td>
                    <td className="px-3 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatINR(row.capitalBefore, { signed: false, decimals: 0 })}
                    </td>
                    <td
                      className={`px-3 text-right font-semibold whitespace-nowrap ${
                        row.gainRupees > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.gainRupees < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {formatINR(row.gainRupees, { signed: true, decimals: 0 })}
                    </td>
                    <td
                      className={`px-3 text-right font-semibold whitespace-nowrap ${
                        row.periodReturnPct > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.periodReturnPct < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {row.periodReturnPct >= 0 ? '+' : ''}
                      {row.periodReturnPct.toFixed(2)}%
                    </td>
                    <td className="px-3 text-right font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatINR(row.capitalAfter, { signed: false, decimals: 0 })}
                    </td>
                    <td
                      className={`px-4 text-right font-semibold whitespace-nowrap ${
                        row.cumulativeReturnPct >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {row.cumulativeReturnPct >= 0 ? '+' : ''}
                      {row.cumulativeReturnPct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
};

const CapitalChartTooltip: React.FC<{
  granularity: CapitalGranularity;
  row: TradeCapitalPoint | DayCapitalPoint | MonthCapitalPoint;
  isOptionBuying: boolean;
}> = ({ granularity, row, isOptionBuying }) => {
  const isGain = row.gainRupees >= 0;
  const isCumGain = row.cumulativeGainRupees >= 0;

  let headerTitle = '';
  let subMeta = '';
  if (granularity === 'trade' && 'seq' in row) {
    const sideLabel = isOptionBuying
      ? row.direction === 'LONG'
        ? 'BUY CE'
        : 'BUY PE'
      : row.direction;
    headerTitle = `Trade #${row.seq} · ${sideLabel}`;
    subMeta = `${row.date} (${row.entryTime}–${row.exitTime}) · ${formatExitLabel(
      row.exitReason
    )}`;
  } else if (granularity === 'day' && 'bias' in row) {
    headerTitle = `${row.date} (${row.bias})`;
    subMeta = `${row.tradesCount} trades · ${row.wins}W / ${row.losses}L / ${row.breakevens}BE`;
  } else if ('tradingDays' in row) {
    headerTitle = row.label;
    subMeta = `${row.tradingDays} trading days · ${row.tradesCount} trades (${row.wins}W / ${row.losses}L)`;
  }

  return (
    <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 shadow-md text-xs font-mono tabular-nums space-y-1.5 min-w-[220px]">
      <div>
        <div className="font-sans font-semibold text-slate-900 dark:text-slate-100">
          {headerTitle}
        </div>
        <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
          {subMeta}
        </div>
      </div>

      <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400 font-sans">
            {granularity === 'trade'
              ? 'Trade Gain/Loss'
              : granularity === 'day'
              ? 'Day Gain/Loss'
              : 'Month Gain/Loss'}
          </span>
          <span
            className={`font-semibold ${
              isGain
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatINR(row.gainRupees, { signed: true, decimals: 0 })} (
            {row.periodReturnPct >= 0 ? '+' : ''}
            {row.periodReturnPct.toFixed(2)}%)
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400 font-sans">
            Capital Balance
          </span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {formatINR(row.capitalAfter, { signed: false, decimals: 0 })}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400 font-sans">
            Total Gain / ROI
          </span>
          <span
            className={`font-semibold ${
              isCumGain
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatINR(row.cumulativeGainRupees, { signed: true, decimals: 0 })}{' '}
            ({row.cumulativeReturnPct >= 0 ? '+' : ''}
            {row.cumulativeReturnPct.toFixed(2)}%)
          </span>
        </div>
      </div>
    </div>
  );
};
