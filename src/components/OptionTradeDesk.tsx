import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Copy,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import {
  BacktestResult,
  StrategyConfig,
} from '../types/strategy';
import { formatINR } from '../utils/formatters';
import {
  computeOptionRecommendation,
  getFallbackInstrumentMeta,
  InstrumentMeta,
  OPTION_DELTA_PRESETS,
  OptionStrikeRecommendation,
} from '../utils/optionsEngine';

interface OptionTradeDeskProps {
  symbol: string;
  spotPrice: number;
  result: BacktestResult;
  config: StrategyConfig;
  instrumentMeta: InstrumentMeta | null;
  fyersAuthenticated: boolean;
  onChangeConfig: (next: StrategyConfig) => void;
}

interface LiveOptionPickResponse {
  fyersOptionSymbol: string | null;
  expiryIso: string | null;
  expiryLabel: string | null;
  isExpiryNearRisk: boolean;
  liveLtp: number | null;
  changePct: number | null;
  volume: number | null;
}

export const OptionTradeDesk: React.FC<OptionTradeDeskProps> = ({
  symbol,
  spotPrice,
  result,
  config,
  instrumentMeta,
  fyersAuthenticated,
  onChangeConfig,
}) => {
  const [expiryChoice, setExpiryChoice] = useState<'current' | 'next'>(
    'current'
  );
  const [liveData, setLiveData] = useState<LiveOptionPickResponse | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [copiedSym, setCopiedSym] = useState(false);

  const meta = useMemo(
    () => instrumentMeta ?? getFallbackInstrumentMeta(symbol),
    [instrumentMeta, symbol]
  );

  // Determine active direction from open trade, armed setup, or locked 4-candle bias
  const openTrade = result.trades.find((t) => t.exitReason === 'OPEN') ?? null;
  const lastCandle =
    result.candles.length > 0
      ? result.candles[result.candles.length - 1]
      : null;

  const activeDirection: 'LONG' | 'SHORT' | null =
    openTrade?.direction ??
    lastCandle?.armedDirection ??
    (result.finalBias === 'BULLISH'
      ? 'LONG'
      : result.finalBias === 'BEARISH'
      ? 'SHORT'
      : null);

  // Compute primary recommendation (or both CE & PE when bias is still pending)
  const primaryDirection: 'LONG' | 'SHORT' = activeDirection ?? 'LONG';

  const primaryRec: OptionStrikeRecommendation = useMemo(
    () =>
      computeOptionRecommendation({
        symbol: meta.normalizedSymbol,
        spotPrice: spotPrice || 24500,
        direction: primaryDirection,
        targetDelta: config.optionDeltaEstimate,
        slPoints: config.stopLossPoints,
        targetPoints: config.targetPoints,
        lotSize: config.lotSize,
        lots: config.lots,
        strikeStep: meta.strikeStep,
        approxFuturesMargin: meta.approxFuturesMargin,
        liveOptionLtp: liveData?.liveLtp ?? null,
        liveOptionSymbol: liveData?.fyersOptionSymbol ?? null,
        expiryLabel: liveData?.expiryLabel ?? null,
        expiryIso: liveData?.expiryIso ?? null,
        isExpiryNearRisk: liveData?.isExpiryNearRisk ?? false,
      }),
    [
      config.lotSize,
      config.lots,
      config.optionDeltaEstimate,
      config.stopLossPoints,
      config.targetPoints,
      liveData,
      meta.approxFuturesMargin,
      meta.normalizedSymbol,
      meta.strikeStep,
      primaryDirection,
      spotPrice,
    ]
  );

  const standbyPeRec: OptionStrikeRecommendation | null = useMemo(() => {
    if (activeDirection !== null) return null;
    return computeOptionRecommendation({
      symbol: meta.normalizedSymbol,
      spotPrice: spotPrice || 24500,
      direction: 'SHORT',
      targetDelta: config.optionDeltaEstimate,
      slPoints: config.stopLossPoints,
      targetPoints: config.targetPoints,
      lotSize: config.lotSize,
      lots: config.lots,
      strikeStep: meta.strikeStep,
      approxFuturesMargin: meta.approxFuturesMargin,
    });
  }, [
    activeDirection,
    config.lotSize,
    config.lots,
    config.optionDeltaEstimate,
    config.stopLossPoints,
    config.targetPoints,
    meta.approxFuturesMargin,
    meta.normalizedSymbol,
    meta.strikeStep,
    spotPrice,
  ]);

  const fetchLiveOptionQuote = async () => {
    if (!meta.fnoEnabled || !spotPrice) return;
    setLoadingLive(true);
    try {
      const params = new URLSearchParams({
        symbol: meta.normalizedSymbol,
        strike: String(primaryRec.selectedStrike),
        optionType: primaryRec.optionType,
        expiry: expiryChoice,
      });
      const resp = await fetch(`/api/fyers/option-pick?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as LiveOptionPickResponse;
      setLiveData(data);
    } catch {
      // Fall back to estimated option premium silently
    } finally {
      setLoadingLive(false);
    }
  };

  useEffect(() => {
    setLiveData(null);
    if (!meta.fnoEnabled || !spotPrice) return;
    let cancelled = false;
    (async () => {
      setLoadingLive(true);
      try {
        const params = new URLSearchParams({
          symbol: meta.normalizedSymbol,
          strike: String(primaryRec.selectedStrike),
          optionType: primaryRec.optionType,
          expiry: expiryChoice,
        });
        const resp = await fetch(
          `/api/fyers/option-pick?${params.toString()}`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (!resp.ok || cancelled) return;
        const data = (await resp.json()) as LiveOptionPickResponse;
        if (!cancelled) setLiveData(data);
      } catch {
        // Ignore transient network errors
      } finally {
        if (!cancelled) setLoadingLive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    expiryChoice,
    fyersAuthenticated,
    meta.fnoEnabled,
    meta.normalizedSymbol,
    primaryRec.optionType,
    primaryRec.selectedStrike,
    spotPrice,
  ]);

  const handleCopySymbol = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSym(true);
      window.setTimeout(() => setCopiedSym(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const hasCustomSlMismatch =
    meta.fnoEnabled &&
    (Math.abs(config.stopLossPoints - meta.recommendedSlPoints) >= 10 ||
      Math.abs(config.targetPoints - meta.recommendedTargetPoints) >= 30);

  if (!meta.fnoEnabled) {
    return (
      <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/90 rounded-xl px-5 py-4 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {meta.displayName}
        </span>{' '}
        is a Cash Equity instrument (no NSE/BSE F&amp;O options chain). Switch to
        NIFTY 50, BANK NIFTY, FIN NIFTY, SENSEX, or an F&amp;O stock like SBIN or
        RELIANCE to trade options.
      </section>
    );
  }

  return (
    <section
      aria-label="Option Buying Strike Desk"
      className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/90 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Option Buying Desk · {meta.displayName}
          </h2>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Spot {spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Lot {config.lotSize} × {config.lots} = {primaryRec.totalQty} qty
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Expiry selector */}
          <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-[#161D2B] rounded-lg text-[11px]">
            <button
              type="button"
              onClick={() => setExpiryChoice('current')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                expiryChoice === 'current'
                  ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Current Expiry
            </button>
            <button
              type="button"
              onClick={() => setExpiryChoice('next')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                expiryChoice === 'next'
                  ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Next Expiry
            </button>
          </div>

          <button
            type="button"
            onClick={() => void fetchLiveOptionQuote()}
            disabled={loadingLive}
            title="Refresh live option LTP from Fyers"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3 h-3 ${loadingLive ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{primaryRec.isLivePrice ? 'Live LTP' : 'Sync LTP'}</span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Expiry-day theta warning */}
        {primaryRec.isExpiryNearRisk && expiryChoice === 'current' && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                Expiry is within 24h — theta &amp; gamma decay accelerate sharply on
                intraday pullbacks. Switch to <strong>Next Expiry</strong> for
                cleaner 1:3 RR.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExpiryChoice('next')}
              className="px-2.5 py-1 text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md cursor-pointer whitespace-nowrap"
            >
              Use Next Expiry
            </button>
          </div>
        )}

        {/* Primary Signal Recommendation Card */}
        {activeDirection !== null ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-4">
            {/* Left: Actionable Option Contract */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E131D] p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${
                        primaryRec.optionType === 'CE'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {primaryRec.optionType === 'CE' ? (
                        <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {primaryRec.optionType === 'CE'
                        ? 'BUY CALL (BULLISH BIAS)'
                        : 'BUY PUT (BEARISH BIAS)'}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      · {primaryRec.moneynessLabel} (~{primaryRec.effectiveDelta.toFixed(2)}Δ)
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                    <span className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-100">
                      {primaryRec.contractLabel}
                    </span>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {primaryRec.expiryLabel}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {primaryRec.isLivePrice ? 'Live Option LTP' : 'Est. Option Premium'}
                  </div>
                  <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100">
                    ₹{primaryRec.optionEntryPrice.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Copyable Fyers Ticker */}
              {primaryRec.fyersOptionSymbol && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-[#161D2B] border border-slate-200 dark:border-slate-700/80 text-xs">
                  <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                    {primaryRec.fyersOptionSymbol}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopySymbol(primaryRec.fyersOptionSymbol!)
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
                  >
                    {copiedSym ? (
                      <>
                        <Check className="w-3 h-3" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" aria-hidden="true" />
                        <span>Copy Symbol</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Option Execution Levels */}
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="rounded-lg bg-white dark:bg-[#141B29] border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Option SL
                  </div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-red-600 dark:text-red-400 mt-0.5">
                    ₹{primaryRec.optionSlPrice.toFixed(2)}
                  </div>
                  <div className="font-mono tabular-nums text-[10px] text-slate-400 dark:text-slate-500">
                    -{primaryRec.optionSlPoints.toFixed(1)} pts ({config.stopLossPoints}pt spot)
                  </div>
                </div>

                <div className="rounded-lg bg-white dark:bg-[#141B29] border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    1:1 Trail Cost
                  </div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    ₹{primaryRec.optionTrailTriggerPrice.toFixed(2)}
                  </div>
                  <div className="font-mono tabular-nums text-[10px] text-slate-400 dark:text-slate-500">
                    +{primaryRec.optionSlPoints.toFixed(1)} pts → SL @ Entry
                  </div>
                </div>

                <div className="rounded-lg bg-white dark:bg-[#141B29] border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Option Target
                  </div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ₹{primaryRec.optionTargetPrice.toFixed(2)}
                  </div>
                  <div className="font-mono tabular-nums text-[10px] text-slate-400 dark:text-slate-500">
                    +{primaryRec.optionTargetPoints.toFixed(1)} pts ({config.targetPoints}pt spot)
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Capital & Risk/Reward Comparison vs Futures */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E131D] p-4 flex flex-col justify-between gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Capital Required
                  </div>
                  <div className="font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {formatINR(primaryRec.capitalRequired, { signed: false, decimals: 0 })}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ~{primaryRec.capitalSavedPct}% less than Futures
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Max Risk / Target
                  </div>
                  <div className="font-mono tabular-nums text-sm font-semibold mt-0.5">
                    <span className="text-red-600 dark:text-red-400">
                      -{formatINR(primaryRec.riskRupees, { signed: false, decimals: 0 })}
                    </span>
                    <span className="text-slate-400 dark:text-slate-600 mx-1">
                      /
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{formatINR(primaryRec.rewardRupees, { signed: false, decimals: 0 })}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    1:{primaryRec.riskRewardRatio.toFixed(1)} RR · {primaryRec.lots} lot
                  </div>
                </div>
              </div>

              {/* Delta Quick Switcher */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-slate-600 dark:text-slate-400">
                    Delta Profile
                  </span>
                  <span className="font-mono text-slate-500 dark:text-slate-400">
                    ATM {primaryRec.atmStrike} · Step {primaryRec.strikeStep}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {OPTION_DELTA_PRESETS.map((preset) => {
                    const active =
                      Math.abs(config.optionDeltaEstimate - preset.delta) < 0.03;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          onChangeConfig({
                            ...config,
                            optionDeltaEstimate: preset.delta,
                          })
                        }
                        className={`px-2 py-1.5 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#161D2B]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {primaryRec.deltaGuidance}
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Standby View when 4-Candle Bias is still PENDING */
          <div className="space-y-3">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              4-candle directional bias is still{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                PENDING
              </strong>
              . Standby strikes ready at{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                ~{config.optionDeltaEstimate.toFixed(2)}Δ ({primaryRec.moneynessLabel})
              </span>{' '}
              as soon as bias locks:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[primaryRec, standbyPeRec].map((rec) => {
                if (!rec) return null;
                const isCe = rec.optionType === 'CE';
                return (
                  <div
                    key={rec.optionType}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E131D] p-3.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div
                        className={`text-[11px] font-semibold ${
                          isCe
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isCe ? 'If Bullish → BUY CE' : 'If Bearish → BUY PE'}
                      </div>
                      <div className="font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        {rec.contractLabel}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                        SL -{rec.optionSlPoints.toFixed(1)} · Tgt +
                        {rec.optionTargetPoints.toFixed(1)} pts
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Est. Capital
                      </div>
                      <div className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatINR(rec.capitalRequired, { signed: false, decimals: 0 })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional 1-click Symbol Risk/Target Calibration when switching to BankNifty / Sensex / SBIN */}
        {hasCustomSlMismatch && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <SlidersHorizontal
                className="w-3.5 h-3.5 text-blue-500 shrink-0"
                aria-hidden="true"
              />
              <span>
                <strong className="text-slate-800 dark:text-slate-200">
                  {meta.displayName}
                </strong>{' '}
                typical intraday range scales better with{' '}
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {meta.recommendedSlPoints}pt SL / {meta.recommendedTargetPoints}pt Target
                </span>{' '}
                (1:3 RR) vs current {config.stopLossPoints}/{config.targetPoints} pts.
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onChangeConfig({
                  ...config,
                  stopLossPoints: meta.recommendedSlPoints,
                  targetPoints: meta.recommendedTargetPoints,
                })
              }
              className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Apply {meta.displayName} SL/Target
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
