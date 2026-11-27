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
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  MultiDayBacktestResult,
  StrategyConfig,
  TradeExitReason,
} from '../types/strategy';
import { formatINR } from '../utils/formatters';
import {
  CapitalSizingMode,
  DayCapitalPoint,
  MonthCapitalPoint,
  TradeCapitalPoint,
  TraderJourneyResult,
  TraderJourneySettings,
} from '../utils/tradingCosts';
import { NumericInput } from './NumericInput';

export type CapitalGranularity = 'trade' | 'day' | 'month';
type ChartViewStyle = 'combined' | 'equity';

interface BacktestCapitalAnalyticsProps {
  backtest: MultiDayBacktestResult;
  config: StrategyConfig;
  symbol: string;
  fromDate: string;
  toDate: string;
  startingCapitalInput: string;
  onStartingCapitalInputChange: (val: string) => void;
  journeySettings: TraderJourneySettings;
  onChangeJourneySettings: (next: TraderJourneySettings) => void;
  journey: TraderJourneyResult;
  theme: 'dark' | 'light';
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
  config,
  symbol,
  fromDate,
  toDate,
  startingCapitalInput,
  onStartingCapitalInputChange,
  journeySettings,
  onChangeJourneySettings,
  journey,
  theme,
}) => {
  const [granularity, setGranularity] = useState<CapitalGranularity>('day');
  const [chartStyle, setChartStyle] = useState<ChartViewStyle>('combined');
  const [showCostDetails, setShowCostDetails] = useState(false);

  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#1E293B' : '#e2e8f0';
  const tickFill = isDark ? '#94a3b8' : '#64748b';
  const zeroStroke = isDark ? '#475569' : '#94a3b8';
  const posColor = isDark ? '#10b981' : '#16a34a';
  const negColor = isDark ? '#ef4444' : '#dc2626';
  const capitalLineColor = isDark ? '#3b82f6' : '#2563eb';
  const grossLineColor = isDark ? '#64748b' : '#94a3b8';
  const isOptionBuying = config.instrumentType === 'NIFTY_ATM_OPT';

  const { tradeSeries, daySeries, monthSeries, costs, summary } = journey;
  const startingCapital = summary.startingCapital;

  const activeData: Array<
    TradeCapitalPoint | DayCapitalPoint | MonthCapitalPoint
  > =
    granularity === 'trade'
      ? tradeSeries
      : granularity === 'day'
      ? daySeries
      : monthSeries;

  // Gradient split offset for Capital Curve AreaChart anchored at Starting Capital
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
      ? 'Avg Net / Trade'
      : granularity === 'day'
      ? 'Avg Net / Day'
      : 'Avg Net / Month';
  const activeAvgValue =
    granularity === 'trade'
      ? summary.avgNetPerTrade
      : granularity === 'day'
      ? summary.avgNetPerDay
      : summary.avgNetPerMonth;

  const updateSetting = <K extends keyof TraderJourneySettings>(
    key: K,
    value: TraderJourneySettings[K]
  ) => {
    onChangeJourneySettings({
      ...journeySettings,
      [key]: value,
    });
  };

  return (
    <section
      aria-label="Real-Life Trader Capital Journey and Cost Analytics"
      className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Card Header + Editable Starting Capital + Granularity Tabs */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Wallet
              className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0"
              aria-hidden="true"
            />
            <span>Real-Life Trader Capital Journey</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            {symbol} · {fromDate} to {toDate} ·{' '}
            {journeySettings.sizingMode === 'compounding_risk'
              ? `Compounding (${journeySettings.riskPerTradePct}% risk/trade)`
              : `Fixed ${config.lots} lot${config.lots === 1 ? '' : 's'}`}{' '}
            ·{' '}
            {isOptionBuying
              ? `${config.optionDeltaEstimate}Δ Options Buy`
              : 'Futures'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Editable Starting Capital Input */}
          <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#161D2B] border border-slate-200 dark:border-slate-700 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
              Starting Capital ₹
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={startingCapitalInput}
              onChange={(e) => onStartingCapitalInputChange(e.target.value)}
              aria-label="Backtest starting capital in rupees"
              className="w-24 bg-transparent font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 focus:outline-none text-right"
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
        </div>
      </div>

      {/* Real-Life Sizing, Brokerage, Taxes & Slippage Controls Strip */}
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121D] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Position Sizing Mode */}
          <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-[#161D2B] rounded-lg">
            {(
              [
                {
                  id: 'compounding_risk' as CapitalSizingMode,
                  label: 'Real-Life Compounding',
                },
                {
                  id: 'fixed_lots' as CapitalSizingMode,
                  label: `Fixed ${config.lots} Lot${config.lots === 1 ? '' : 's'}`,
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateSetting('sizingMode', opt.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  journeySettings.sizingMode === opt.id
                    ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Risk % & Max Lots Cap (Compounding Mode) */}
          {journeySettings.sizingMode === 'compounding_risk' && (
            <>
              <div className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span className="whitespace-nowrap">Risk/Trade</span>
                <NumericInput
                  value={journeySettings.riskPerTradePct}
                  min={0.1}
                  max={25}
                  allowDecimal
                  decimals={2}
                  showRangeHint={false}
                  ariaLabel="Risk per trade percentage"
                  onChange={(v) => updateSetting('riskPerTradePct', v)}
                  className="w-16 px-2 py-1 text-xs font-mono tabular-nums text-right text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <span>%</span>
              </div>

              <div
                className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400"
                title="Upper cap on lots per trade to reflect realistic NSE/BSE retail liquidity"
              >
                <span className="whitespace-nowrap">Max Lots</span>
                <NumericInput
                  value={journeySettings.maxLotsCap}
                  min={1}
                  max={1000}
                  showRangeHint={false}
                  ariaLabel="Maximum lots cap"
                  onChange={(v) => updateSetting('maxLotsCap', v)}
                  className="w-16 px-2 py-1 text-xs font-mono tabular-nums text-right text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </>
          )}
        </div>

        {/* Brokerage, Taxes & Slippage Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={journeySettings.includeCosts}
              onChange={(e) => updateSetting('includeCosts', e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 cursor-pointer"
            />
            <span className="font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
              Deduct Brokerage, Taxes &amp; Slippage
            </span>
          </label>

          {journeySettings.includeCosts && (
            <>
              <div
                className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400"
                title="Brokerage charged per executed order (2 orders = 1 round-trip trade)"
              >
                <span className="whitespace-nowrap">Brokerage ₹</span>
                <NumericInput
                  value={journeySettings.brokeragePerOrder}
                  min={0}
                  max={500}
                  allowDecimal
                  decimals={2}
                  showRangeHint={false}
                  ariaLabel="Brokerage per order in rupees"
                  onChange={(v) => updateSetting('brokeragePerOrder', v)}
                  className="w-16 px-2 py-1 text-xs font-mono tabular-nums text-right text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <span className="text-[11px] text-slate-400">/ord</span>
              </div>

              <div
                className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400"
                title="Round-trip bid-ask + market order fill slippage in points on the traded instrument"
              >
                <span className="whitespace-nowrap">Slippage</span>
                <NumericInput
                  value={journeySettings.slippagePoints}
                  min={0}
                  max={50}
                  allowDecimal
                  decimals={2}
                  showRangeHint={false}
                  ariaLabel="Round-trip slippage in points"
                  onChange={(v) => updateSetting('slippagePoints', v)}
                  className="w-16 px-2 py-1 text-xs font-mono tabular-nums text-right text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <span className="text-[11px] text-slate-400">pts</span>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowCostDetails((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-colors cursor-pointer"
          >
            <Receipt className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tax &amp; Cost Breakdown</span>
            {showCostDetails ? (
              <ChevronUp className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Capital Affordability Warning (when margin exceeds starting/current capital) */}
      {summary.skippedTrades > 0 && (
        <div className="px-5 py-3 border-b border-amber-200 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle
            className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div>
            <span className="font-semibold">
              {summary.skippedTrades} of {tradeSeries.length} trades skipped due
              to insufficient capital.
            </span>{' '}
            {!summary.canAffordInitialLot ? (
              <>
                1 lot currently needs roughly{' '}
                <span className="font-mono font-semibold">
                  {formatINR(summary.estimatedMarginPerLot, { decimals: 0 })}
                </span>{' '}
                {isOptionBuying
                  ? 'in ATM option premium'
                  : 'in NSE Futures SPAN+Exposure margin'}
                , which exceeds 80% of your{' '}
                <span className="font-mono font-semibold">
                  {formatINR(startingCapital, { decimals: 0 })}
                </span>{' '}
                starting capital.
                {!isOptionBuying &&
                  ' Switch Instrument to Options Buying (0.5Δ) in Strategy Parameters to trade comfortably with ₹1,00,000.'}
              </>
            ) : (
              <>
                After drawdown, available capital fell below the required
                1-lot outlay (~
                {formatINR(summary.estimatedMarginPerLot, { decimals: 0 })}).
              </>
            )}
          </div>
        </div>
      )}

      {/* 4-Column Real-Life Capital KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800">
        {/* 1. Net Ending Capital vs Gross */}
        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {journeySettings.includeCosts
              ? 'Net Ending Capital (Take-Home)'
              : 'Ending Capital (Gross)'}
          </div>
          <div
            className={`mt-1.5 font-mono tabular-nums text-xl font-bold flex items-center gap-1.5 ${
              summary.netGain >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {summary.netGain >= 0 ? (
              <TrendingUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <TrendingDown className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>
              {formatINR(summary.netEndingCapital, {
                signed: false,
                decimals: 0,
              })}
            </span>
          </div>
          <div className="text-xs font-mono tabular-nums mt-0.5 flex flex-wrap items-center gap-x-2">
            <span
              className={
                summary.netGain >= 0
                  ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                  : 'text-red-600 dark:text-red-400 font-semibold'
              }
            >
              {formatINR(summary.netGain, { signed: true, decimals: 0 })} (
              {summary.netRoiPct >= 0 ? '+' : ''}
              {summary.netRoiPct.toFixed(1)}%)
            </span>
            {journeySettings.includeCosts && (
              <span className="text-slate-400 dark:text-slate-500">
                Gross:{' '}
                {formatINR(summary.grossEndingCapital, {
                  signed: false,
                  decimals: 0,
                })}
              </span>
            )}
          </div>
        </div>

        {/* 2. Total Brokerage, Taxes & Slippage */}
        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Brokerage, Taxes &amp; Slippage
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-xl font-bold text-red-600 dark:text-red-400">
            {journeySettings.includeCosts
              ? `-${formatINR(costs.totalFriction, { decimals: 0 })}`
              : '₹0 (Off)'}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
            {journeySettings.includeCosts ? (
              <>
                ~{formatINR(costs.avgFrictionPerTrade, { decimals: 0 })}/trade ·{' '}
                {costs.breakevenPointsPerTrade.toFixed(1)} index pts drag
              </>
            ) : (
              <>
                Would deduct{' '}
                {formatINR(costs.totalFriction, { decimals: 0 })} if enabled
              </>
            )}
          </div>
        </div>

        {/* 3. Peak Capital & Real Max Drawdown */}
        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Peak Capital &amp; Real Drawdown
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatINR(summary.peakNetCapital, {
              signed: false,
              decimals: 0,
            })}
          </div>
          <div className="text-xs font-mono tabular-nums text-red-600 dark:text-red-400 mt-0.5">
            Max DD: -{formatINR(summary.maxDrawdownRupees, { decimals: 0 })} (-
            {summary.maxDrawdownPct.toFixed(1)}%)
          </div>
        </div>

        {/* 4. Position Scaling & Avg Net Gain */}
        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {activeAvgLabel}
          </div>
          <div
            className={`mt-1.5 font-mono tabular-nums text-xl font-bold ${
              activeAvgValue >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatINR(activeAvgValue, { signed: true, decimals: 0 })}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
            {journeySettings.sizingMode === 'compounding_risk'
              ? `Lots: ${summary.minLots}–${summary.maxLots} (avg ${summary.avgLots.toFixed(1)})`
              : `Fixed ${config.lots} lot${config.lots === 1 ? '' : 's'}`}{' '}
            · ~{formatINR(summary.estimatedMarginPerLot, { decimals: 0 })}/lot
          </div>
        </div>
      </div>

      {/* Expandable FY 2026 Indian F&O Contract-Note Tax & Slippage Breakdown */}
      {showCostDetails && (
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0D121D] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Indian NSE/BSE F&amp;O Cost &amp; Statutory Tax Breakdown (FY
              2026–27 Rates · {summary.executedTrades} Executed Trades)
            </div>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {costs.frictionPctOfStartingCapital.toFixed(1)}% of starting
              capital
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
            <div className="p-3 rounded-lg bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Brokerage
              </div>
              <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {formatINR(costs.brokerage, { decimals: 0 })}
              </div>
              <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                ₹{journeySettings.brokeragePerOrder}/order × 2
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                STT (Sell Side)
              </div>
              <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {formatINR(costs.stt, { decimals: 0 })}
              </div>
              <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                {isOptionBuying ? '0.15% prem (Apr 26)' : '0.05% fut (Apr 26)'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Exchange + SEBI + IPFT
              </div>
              <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {formatINR(costs.exchangeTxn + costs.sebi + costs.ipft, {
                  decimals: 0,
                })}
              </div>
              <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                {isOptionBuying ? '0.035% + ₹60/Cr' : '0.0017% + ₹20/Cr'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Stamp Duty (Buy)
              </div>
              <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {formatINR(costs.stampDuty, { decimals: 0 })}
              </div>
              <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                {isOptionBuying ? '0.003% buy prem' : '0.002% buy val'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                GST (18%)
              </div>
              <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {formatINR(costs.gst, { decimals: 0 })}
              </div>
              <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                On Brok + Exch + SEBI
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-[#111622] border border-red-200/70 dark:border-red-500/30">
              <div className="text-[11px] text-red-600 dark:text-red-400">
                Execution Slippage
              </div>
              <div className="mt-1 font-mono tabular-nums font-semibold text-red-600 dark:text-red-400">
                {formatINR(costs.slippage, { decimals: 0 })}
              </div>
              <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                {journeySettings.slippagePoints} pt/trade (~
                {formatINR(costs.avgSlippagePerTrade, { decimals: 0 })})
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Statutory rates reflect SEBI True-to-Label exchange charges and
            April 2026 F&amp;O STT rates (0.15% on option sell premium, 0.05% on
            futures sell value).{' '}
            {isOptionBuying
              ? 'ATM option premium is realistically estimated at ~0.65% of the index spot price per trade to model buy/sell premium turnover and capital outlay.'
              : 'Futures margin is estimated at 12% SPAN + Exposure margin of contract value.'}
          </p>
        </div>
      )}

      {/* Chart Mode Sub-header */}
      <div className="px-5 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {granularity === 'trade'
              ? 'Trade-by-Trade Net Gain / Loss & Real-Life Capital'
              : granularity === 'day'
              ? 'Daily Net Gain / Loss & Real-Life Capital'
              : 'Monthly Net Gain / Loss & Real-Life Capital'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {chartStyle === 'combined'
              ? journeySettings.includeCosts
                ? 'Bars show net gain/loss after brokerage, taxes & slippage; solid blue line shows real-life capital vs dashed gross capital.'
                : 'Bars show gross gain/loss (₹) per period; blue line tracks running capital balance.'
              : journeySettings.includeCosts
              ? 'Real-life net account balance (solid) compared against ideal gross balance before costs (dashed).'
              : 'Running account capital curve anchored to starting capital.'}
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#161D2B] rounded-lg">
          <button
            type="button"
            onClick={() => setChartStyle('combined')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              chartStyle === 'combined'
                ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Gain Bars + Capital Line
          </button>
          <button
            type="button"
            onClick={() => setChartStyle('equity')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              chartStyle === 'equity'
                ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Capital Curve
          </button>
        </div>
      </div>

      {/* Main Graph */}
      <div className="px-4 pt-2 pb-4">
        {activeData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            No completed trades in this period to plot capital gain/loss.
          </div>
        ) : (
          <>
            {/* Compact Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-4">
                {chartStyle === 'combined' ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                      Net Profit
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-red-500" />
                      Net Loss
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3.5 h-0.5 bg-blue-500" />
                      Real-Life Capital (₹)
                    </span>
                    {journeySettings.includeCosts && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3.5 h-0 border-t border-dashed border-slate-400" />
                        Gross Capital (Before Costs)
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
                      Above Starting Capital
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-red-500" />
                      Below Starting Capital
                    </span>
                    {journeySettings.includeCosts && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3.5 h-0 border-t border-dashed border-slate-400" />
                        Gross Capital (Before Costs)
                      </span>
                    )}
                  </>
                )}
              </div>
              <span className="font-mono tabular-nums">
                Baseline:{' '}
                {formatINR(startingCapital, { signed: false, decimals: 0 })}
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
                    {/* Left Y Axis: Period Net Gain / Loss Bars */}
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
                            includeCosts={journeySettings.includeCosts}
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
                    {journeySettings.includeCosts && (
                      <Line
                        yAxisId="capital"
                        type="monotone"
                        dataKey="grossCapitalAfter"
                        stroke={grossLineColor}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    )}
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
                          offset="0%"
                          stopColor={posColor}
                          stopOpacity={0.22}
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
                          offset="100%"
                          stopColor={negColor}
                          stopOpacity={0.22}
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
                      strokeDasharray="4 4"
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
                            includeCosts={journeySettings.includeCosts}
                          />
                        );
                      }}
                    />
                    {journeySettings.includeCosts && (
                      <Line
                        type="monotone"
                        dataKey="grossCapitalAfter"
                        stroke={grossLineColor}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="capitalAfter"
                      stroke="url(#btCapitalStroke)"
                      strokeWidth={2.25}
                      fill="url(#btCapitalFill)"
                      baseValue={startingCapital}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Granular Breakdown Ledger Table synced with Trade / Day / Month tab */}
      <div className="border-t border-slate-200 dark:border-slate-800">
        <div className="px-5 py-3 bg-slate-50/70 dark:bg-[#0D121D] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {granularity === 'trade'
              ? `Trade-Wise Real-Life Ledger (${tradeSeries.length} trades)`
              : granularity === 'day'
              ? `Day-Wise Real-Life Ledger (${daySeries.length} sessions)`
              : `Month-Wise Real-Life Ledger (${monthSeries.length} months)`}
          </span>
          {granularity === 'month' &&
            summary.bestMonth &&
            summary.worstMonth && (
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Best:{' '}
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  {summary.bestMonth.label} (
                  {formatINR(summary.bestMonth.gainRupees, {
                    signed: true,
                    decimals: 0,
                  })}
                  )
                </span>{' '}
                · Worst:{' '}
                <span className="text-red-600 dark:text-red-400 font-semibold">
                  {summary.worstMonth.label} (
                  {formatINR(summary.worstMonth.gainRupees, {
                    signed: true,
                    decimals: 0,
                  })}
                  )
                </span>
              </span>
            )}
        </div>

        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          {granularity === 'trade' && (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#161D2B]">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-5 pr-3">#</th>
                  <th className="py-2.5 px-3">Date &amp; Time</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3 text-right">Lots</th>
                  <th className="py-2.5 px-3 text-right">Gross P&amp;L</th>
                  <th className="py-2.5 px-3 text-right">Costs &amp; Slip</th>
                  <th className="py-2.5 px-3 text-right">Net P&amp;L</th>
                  <th className="py-2.5 px-3 text-right">Ending Capital</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Cum. ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs font-mono tabular-nums">
                {tradeSeries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-8 text-center font-sans text-slate-500 dark:text-slate-400"
                    >
                      No trades executed in this backtest period.
                    </td>
                  </tr>
                ) : (
                  [...tradeSeries].reverse().map((t) => (
                    <tr
                      key={`tr_${t.seq}_${t.date}_${t.entryTime}`}
                      className={`hover:bg-slate-50 dark:hover:bg-[#161D2B]/60 transition-colors ${
                        t.skippedInsufficientCapital ? 'opacity-55' : ''
                      }`}
                    >
                      <td className="py-2.5 pl-5 pr-3 text-slate-500 dark:text-slate-400">
                        #{t.seq}
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {t.date}{' '}
                        <span className="text-slate-500 dark:text-slate-400">
                          {t.entryTime}–{t.exitTime}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            t.direction === 'LONG'
                              ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400'
                          }`}
                        >
                          {isOptionBuying
                            ? t.direction === 'LONG'
                              ? 'BUY CE'
                              : 'BUY PE'
                            : t.direction}
                        </span>
                        <span className="ml-1.5 font-sans text-[11px] text-slate-500 dark:text-slate-400">
                          {t.skippedInsufficientCapital
                            ? 'Skipped (Margin)'
                            : formatExitLabel(t.exitReason)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                        {t.skippedInsufficientCapital ? '0' : t.lotsTraded}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right ${
                          t.grossGainRupees > 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : t.grossGainRupees < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {formatINR(t.grossGainRupees, {
                          signed: true,
                          decimals: 0,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400">
                        {journeySettings.includeCosts &&
                        !t.skippedInsufficientCapital
                          ? `-${formatINR(t.totalFrictionRupees, {
                              decimals: 0,
                            })}`
                          : '₹0'}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          t.gainRupees > 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : t.gainRupees < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {formatINR(t.gainRupees, { signed: true, decimals: 0 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {formatINR(t.capitalAfter, {
                          signed: false,
                          decimals: 0,
                        })}
                      </td>
                      <td
                        className={`py-2.5 pl-3 pr-5 text-right font-semibold ${
                          t.cumulativeReturnPct >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {t.cumulativeReturnPct >= 0 ? '+' : ''}
                        {t.cumulativeReturnPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {granularity === 'day' && (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#161D2B]">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-5 pr-3">Date</th>
                  <th className="py-2.5 px-3">Bias</th>
                  <th className="py-2.5 px-3 text-right">Trades / Lots</th>
                  <th className="py-2.5 px-3 text-right">Gross P&amp;L</th>
                  <th className="py-2.5 px-3 text-right">Costs &amp; Slip</th>
                  <th className="py-2.5 px-3 text-right">Net Day P&amp;L</th>
                  <th className="py-2.5 px-3 text-right">Ending Capital</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Cum. ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs font-mono tabular-nums">
                {[...daySeries].reverse().map((d) => (
                  <tr
                    key={d.date}
                    className="hover:bg-slate-50 dark:hover:bg-[#161D2B]/60 transition-colors"
                  >
                    <td className="py-2.5 pl-5 pr-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {d.date}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          d.bias === 'BULLISH'
                            ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : d.bias === 'BEARISH'
                            ? 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {d.bias}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">
                      {d.executedTrades}
                      {d.avgLots > 0 ? ` · ${d.avgLots.toFixed(1)}L` : ''}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        d.grossGainRupees > 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : d.grossGainRupees < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {formatINR(d.grossGainRupees, {
                        signed: true,
                        decimals: 0,
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400">
                      {journeySettings.includeCosts &&
                      d.totalFrictionRupees > 0
                        ? `-${formatINR(d.totalFrictionRupees, {
                            decimals: 0,
                          })}`
                        : '₹0'}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold ${
                        d.gainRupees > 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : d.gainRupees < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {formatINR(d.gainRupees, { signed: true, decimals: 0 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatINR(d.capitalAfter, {
                        signed: false,
                        decimals: 0,
                      })}
                    </td>
                    <td
                      className={`py-2.5 pl-3 pr-5 text-right font-semibold ${
                        d.cumulativeReturnPct >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {d.cumulativeReturnPct >= 0 ? '+' : ''}
                      {d.cumulativeReturnPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {granularity === 'month' && (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#161D2B]">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-5 pr-3">Month</th>
                  <th className="py-2.5 px-3 text-right">Trades / Avg Lots</th>
                  <th className="py-2.5 px-3 text-right">Gross P&amp;L</th>
                  <th className="py-2.5 px-3 text-right">Costs &amp; Slip</th>
                  <th className="py-2.5 px-3 text-right">Net Month P&amp;L</th>
                  <th className="py-2.5 px-3 text-right">Monthly %</th>
                  <th className="py-2.5 px-3 text-right">Ending Capital</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Cum. ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs font-mono tabular-nums">
                {[...monthSeries].reverse().map((m) => (
                  <tr
                    key={m.month}
                    className="hover:bg-slate-50 dark:hover:bg-[#161D2B]/60 transition-colors"
                  >
                    <td className="py-2.5 pl-5 pr-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {m.label}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">
                      {m.executedTrades} ({m.wins}W/{m.losses}L)
                      {m.avgLots > 0 ? ` · ${m.avgLots.toFixed(1)}L` : ''}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        m.grossGainRupees >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatINR(m.grossGainRupees, {
                        signed: true,
                        decimals: 0,
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500 dark:text-slate-400">
                      {journeySettings.includeCosts &&
                      m.totalFrictionRupees > 0
                        ? `-${formatINR(m.totalFrictionRupees, {
                            decimals: 0,
                          })}`
                        : '₹0'}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold ${
                        m.gainRupees >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatINR(m.gainRupees, { signed: true, decimals: 0 })}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        m.periodReturnPct >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {m.periodReturnPct >= 0 ? '+' : ''}
                      {m.periodReturnPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatINR(m.capitalAfter, {
                        signed: false,
                        decimals: 0,
                      })}
                    </td>
                    <td
                      className={`py-2.5 pl-3 pr-5 text-right font-semibold ${
                        m.cumulativeReturnPct >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {m.cumulativeReturnPct >= 0 ? '+' : ''}
                      {m.cumulativeReturnPct.toFixed(1)}%
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

interface TooltipProps {
  granularity: CapitalGranularity;
  row: TradeCapitalPoint | DayCapitalPoint | MonthCapitalPoint;
  isOptionBuying: boolean;
  includeCosts: boolean;
}

const CapitalChartTooltip: React.FC<TooltipProps> = ({
  granularity,
  row,
  isOptionBuying,
  includeCosts,
}) => {
  const isPos = row.gainRupees >= 0;
  const isCumPos = row.cumulativeGainRupees >= 0;

  return (
    <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3.5 py-2.5 text-xs font-mono tabular-nums min-w-[235px]">
      {granularity === 'trade' && 'seq' in row && (
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center justify-between gap-3">
          <span>
            Trade #{row.seq} ·{' '}
            {isOptionBuying
              ? row.direction === 'LONG'
                ? 'BUY CE'
                : 'BUY PE'
              : row.direction}
          </span>
          <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
            {row.lotsTraded} lot{row.lotsTraded === 1 ? '' : 's'} · {row.date}
          </span>
        </div>
      )}

      {granularity === 'day' && 'bias' in row && (
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center justify-between gap-3">
          <span>{row.date}</span>
          <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
            {row.executedTrades} trades · {row.wins}W/{row.losses}L
          </span>
        </div>
      )}

      {granularity === 'month' && 'month' in row && (
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center justify-between gap-3">
          <span>{row.label}</span>
          <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
            {row.executedTrades} trades · avg {row.avgLots.toFixed(1)}L
          </span>
        </div>
      )}

      <div className="space-y-1">
        {includeCosts && (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400 font-sans">
                Gross P&amp;L
              </span>
              <span className="text-slate-700 dark:text-slate-300">
                {formatINR(row.grossGainRupees, { signed: true, decimals: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400 font-sans">
                Brokerage &amp; Taxes
              </span>
              <span className="text-red-600 dark:text-red-400">
                -{formatINR(row.chargesRupees, { decimals: 0 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400 font-sans">
                Slippage
              </span>
              <span className="text-red-600 dark:text-red-400">
                -{formatINR(row.slippageRupees, { decimals: 0 })}
              </span>
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-4 pt-0.5">
          <span className="text-slate-600 dark:text-slate-300 font-sans font-medium">
            {includeCosts ? 'Net Gain / Loss' : 'Period Gain / Loss'}
          </span>
          <span
            className={`font-semibold ${
              isPos
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatINR(row.gainRupees, { signed: true, decimals: 0 })} (
            {row.periodReturnPct >= 0 ? '+' : ''}
            {row.periodReturnPct.toFixed(1)}%)
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-slate-500 dark:text-slate-400 font-sans">
            Real-Life Capital
          </span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {formatINR(row.capitalAfter, { signed: false, decimals: 0 })}
          </span>
        </div>

        {includeCosts && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400 dark:text-slate-500 font-sans">
              Gross Capital (Ideal)
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {formatINR(row.grossCapitalAfter, { signed: false, decimals: 0 })}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400 font-sans">
            Cumulative Net ROI
          </span>
          <span
            className={
              isCumPos
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }
          >
            {formatINR(row.cumulativeGainRupees, { signed: true, decimals: 0 })}{' '}
            ({row.cumulativeReturnPct >= 0 ? '+' : ''}
            {row.cumulativeReturnPct.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
};
