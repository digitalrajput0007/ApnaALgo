import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  Check,
  Copy,
  Radio,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { FyersQuoteTick } from '../hooks/useFyersLiveFeed';
import { BacktestResult, StrategyConfig } from '../types/strategy';
import { formatINR } from '../utils/formatters';
import {
  computeOptionRecommendation,
  InstrumentMeta,
  OPTION_DELTA_PRESETS,
  RiskBasedLotCalculation,
} from '../utils/optionsEngine';

export interface LiveOptionTickPayload {
  fyersOptionSymbol: string | null;
  contractLabel: string;
  optionType: 'CE' | 'PE';
  strike: number;
  ltp: number | null;
  isLive: boolean;
  expiryLabel: string;
}

interface OptionTradeDeskProps {
  symbol: string;
  spotPrice: number;
  result: BacktestResult;
  config: StrategyConfig;
  instrumentMeta: InstrumentMeta;
  fyersAuthenticated: boolean;
  isLiveStreaming?: boolean;
  streamedOptionQuote?: FyersQuoteTick | null;
  onRegisterStreamOptionSymbol?: (optionSymbol: string | null) => void;
  onLiveOptionChange?: (payload: LiveOptionTickPayload) => void;
  lotCalculation?: RiskBasedLotCalculation | null;
  onOpenPaperWallet?: () => void;
  onChangeConfig: (next: StrategyConfig) => void;
}

interface LiveOptionPickResponse {
  fyersOptionSymbol: string | null;
  expiryIso: string | null;
  expiryLabel: string;
  daysToExpiry: number;
  isExpiryNearRisk: boolean;
  lotSize: number;
  strikeStep: number;
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
  isLiveStreaming = false,
  streamedOptionQuote = null,
  onRegisterStreamOptionSymbol,
  onLiveOptionChange,
  lotCalculation = null,
  onOpenPaperWallet,
  onChangeConfig,
}) => {
  const expiryMode = config.optionExpiryPreference || 'auto';
  const [manualDirection, setManualDirection] = useState<'LONG' | 'SHORT'>(
    'LONG'
  );
  const [contractMeta, setContractMeta] =
    useState<LiveOptionPickResponse | null>(null);
  const [polledOptionTick, setPolledOptionTick] =
    useState<FyersQuoteTick | null>(null);
  const [loadingContract, setLoadingContract] = useState(false);
  const [copiedSymbol, setCopiedSymbol] = useState(false);

  const onRegisterRef = useRef(onRegisterStreamOptionSymbol);
  onRegisterRef.current = onRegisterStreamOptionSymbol;
  const onLiveOptionChangeRef = useRef(onLiveOptionChange);
  onLiveOptionChangeRef.current = onLiveOptionChange;

  const lastCandle =
    result.candles.length > 0
      ? result.candles[result.candles.length - 1]
      : null;
  const activeOpenTrade =
    result.trades.length > 0 &&
    result.trades[result.trades.length - 1].exitReason === 'OPEN'
      ? result.trades[result.trades.length - 1]
      : null;

  // Strictly Options Buy Only: Bullish -> BUY CE (LONG), Bearish -> BUY PE (SHORT)
  const resolvedDirection: 'LONG' | 'SHORT' = activeOpenTrade
    ? activeOpenTrade.direction
    : lastCandle?.armedDirection
    ? lastCandle.armedDirection
    : result.finalBias === 'BULLISH'
    ? 'LONG'
    : result.finalBias === 'BEARISH'
    ? 'SHORT'
    : manualDirection;

  const directionSource = activeOpenTrade
    ? `Open Signal (#${activeOpenTrade.id})`
    : lastCandle?.armedDirection
    ? `Armed @ ${lastCandle.armedTriggerLevel?.toFixed(2)}`
    : result.finalBias !== 'PENDING'
    ? `Session Bias (${result.finalBias})`
    : 'Preview (Bias Pending)';

  const targetDelta =
    config.optionDeltaEstimate >= 0.4 && config.optionDeltaEstimate <= 0.85
      ? config.optionDeltaEstimate
      : 0.5;

  // Detect if current expiry is <= 1 day away using instrumentMeta or resolved contract
  const nearestExpiryNearRisk = useMemo(() => {
    if (contractMeta?.isExpiryNearRisk !== undefined) {
      return contractMeta.isExpiryNearRisk;
    }
    if (!instrumentMeta.nearExpiryIso) return false;
    const todayIso = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const diffDays = Math.round(
      (Date.parse(`${instrumentMeta.nearExpiryIso}T00:00:00Z`) -
        Date.parse(`${todayIso}T00:00:00Z`)) /
        (24 * 60 * 60 * 1000)
    );
    return diffDays <= 1;
  }, [contractMeta?.isExpiryNearRisk, instrumentMeta.nearExpiryIso]);

  const effectiveExpiryApiChoice: 'current' | 'next' =
    expiryMode === 'next'
      ? 'next'
      : expiryMode === 'current'
      ? 'current'
      : nearestExpiryNearRisk
      ? 'next'
      : 'current';

  // Compute strike deterministically from spot & delta (quantized to strikeStep so small spot ticks don't spam API)
  const prelim = useMemo(
    () =>
      computeOptionRecommendation({
        symbol,
        spotPrice: spotPrice > 0 ? spotPrice : 24500,
        direction: resolvedDirection,
        targetDelta,
        slPoints: config.stopLossPoints,
        targetPoints: config.targetPoints,
        lotSize: config.lotSize,
        lots: config.lots,
        strikeStep: instrumentMeta.strikeStep,
        approxFuturesMargin: instrumentMeta.approxFuturesMargin,
      }),
    [
      symbol,
      spotPrice,
      resolvedDirection,
      targetDelta,
      config.stopLossPoints,
      config.targetPoints,
      config.lotSize,
      config.lots,
      instrumentMeta.strikeStep,
      instrumentMeta.approxFuturesMargin,
    ]
  );

  // Lookup exact Fyers Option Symbol ONLY when symbol/strike/optionType/expiry changes (NO flicker on spot ticks!)
  useEffect(() => {
    if (!instrumentMeta.fnoEnabled || spotPrice <= 0) {
      setContractMeta(null);
      setPolledOptionTick(null);
      onRegisterRef.current?.(null);
      return;
    }

    let cancelled = false;
    setLoadingContract(true);

    (async () => {
      try {
        const params = new URLSearchParams({
          symbol,
          strike: String(prelim.selectedStrike),
          optionType: prelim.optionType,
          expiry: effectiveExpiryApiChoice,
        });
        const resp = await fetch(`/api/fyers/option-pick?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!resp.ok || cancelled) return;
        const data = (await resp.json()) as LiveOptionPickResponse;
        if (cancelled) return;

        // If Auto mode discovered current expiry is <=1 day away and we hadn't rolled yet, immediately fetch Next Expiry
        if (
          expiryMode === 'auto' &&
          effectiveExpiryApiChoice === 'current' &&
          data.isExpiryNearRisk
        ) {
          const nextParams = new URLSearchParams({
            symbol,
            strike: String(prelim.selectedStrike),
            optionType: prelim.optionType,
            expiry: 'next',
          });
          const nextResp = await fetch(
            `/api/fyers/option-pick?${nextParams.toString()}`,
            { credentials: 'include', cache: 'no-store' }
          );
          if (nextResp.ok && !cancelled) {
            const nextData = (await nextResp.json()) as LiveOptionPickResponse;
            if (!cancelled) {
              setContractMeta(nextData);
              onRegisterRef.current?.(nextData.fyersOptionSymbol ?? null);
              return;
            }
          }
        }

        setContractMeta(data);
        onRegisterRef.current?.(data.fyersOptionSymbol ?? null);
      } catch {
        // Keep last valid contract metadata
      } finally {
        if (!cancelled) setLoadingContract(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    symbol,
    prelim.selectedStrike,
    prelim.optionType,
    effectiveExpiryApiChoice,
    expiryMode,
    instrumentMeta.fnoEnabled,
    fyersAuthenticated,
  ]);

  const resolvedOptionSymbol = contractMeta?.fyersOptionSymbol ?? null;

  // Keep server-side persistent stream synced with the active option contract symbol
  useEffect(() => {
    onRegisterRef.current?.(resolvedOptionSymbol);
  }, [resolvedOptionSymbol, isLiveStreaming]);

  // Real-time fallback quote poll (every 2s) when Fyers is connected so Option LTP ALWAYS updates live
  useEffect(() => {
    if (!fyersAuthenticated || !resolvedOptionSymbol) {
      setPolledOptionTick(null);
      return;
    }

    // If persistent WS stream is actively delivering matching option ticks, no extra HTTP poll needed
    const streamMatches =
      isLiveStreaming &&
      streamedOptionQuote &&
      streamedOptionQuote.symbol === resolvedOptionSymbol;
    if (streamMatches) return;

    let cancelled = false;
    const pollQuote = async () => {
      try {
        const params = new URLSearchParams({ symbol: resolvedOptionSymbol });
        const resp = await fetch(`/api/fyers/quotes?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!resp.ok || cancelled) return;
        const tick = (await resp.json()) as FyersQuoteTick;
        if (!cancelled && typeof tick.ltp === 'number' && tick.ltp > 0) {
          setPolledOptionTick(tick);
        }
      } catch {
        // Retry next cycle
      }
    };

    void pollQuote();
    const timer = window.setInterval(() => {
      void pollQuote();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    fyersAuthenticated,
    resolvedOptionSymbol,
    isLiveStreaming,
    streamedOptionQuote?.symbol,
  ]);

  // Select the freshest live Option Tick (server WS stream > 2s HTTP quote poll > initial pick LTP)
  const activeOptionTick: FyersQuoteTick | null =
    streamedOptionQuote &&
    resolvedOptionSymbol &&
    streamedOptionQuote.symbol === resolvedOptionSymbol &&
    streamedOptionQuote.ltp > 0
      ? streamedOptionQuote
      : polledOptionTick && polledOptionTick.ltp > 0
      ? polledOptionTick
      : null;

  const liveOptionLtp =
    activeOptionTick?.ltp ?? contractMeta?.liveLtp ?? null;
  const liveChangePct =
    activeOptionTick?.changePct ?? contractMeta?.changePct ?? null;
  const lastTickTime = activeOptionTick?.istTimeSec ?? null;

  const rec = useMemo(
    () =>
      computeOptionRecommendation({
        symbol,
        spotPrice: spotPrice > 0 ? spotPrice : 24500,
        direction: resolvedDirection,
        targetDelta,
        slPoints: config.stopLossPoints,
        targetPoints: config.targetPoints,
        lotSize: config.lotSize,
        lots: config.lots,
        strikeStep: contractMeta?.strikeStep ?? instrumentMeta.strikeStep,
        approxFuturesMargin: instrumentMeta.approxFuturesMargin,
        liveOptionLtp,
        liveOptionSymbol: resolvedOptionSymbol,
        expiryLabel: contractMeta?.expiryLabel ?? null,
        expiryIso: contractMeta?.expiryIso ?? null,
        isExpiryNearRisk: contractMeta?.isExpiryNearRisk ?? false,
      }),
    [
      symbol,
      spotPrice,
      resolvedDirection,
      targetDelta,
      config.stopLossPoints,
      config.targetPoints,
      config.lotSize,
      config.lots,
      contractMeta,
      instrumentMeta.strikeStep,
      instrumentMeta.approxFuturesMargin,
      liveOptionLtp,
      resolvedOptionSymbol,
    ]
  );

  // Push live option LTP & contract up to App.tsx for live MTM & Paper Wallet balance calculation
  useEffect(() => {
    onLiveOptionChangeRef.current?.({
      fyersOptionSymbol: rec.fyersOptionSymbol,
      contractLabel: rec.contractLabel,
      optionType: rec.optionType,
      strike: rec.selectedStrike,
      ltp: rec.isLivePrice ? rec.optionEntryPrice : null,
      isLive: rec.isLivePrice,
      expiryLabel: rec.expiryLabel,
    });
  }, [
    rec.fyersOptionSymbol,
    rec.contractLabel,
    rec.optionType,
    rec.selectedStrike,
    rec.optionEntryPrice,
    rec.isLivePrice,
    rec.expiryLabel,
  ]);

  const handleCopySymbol = async () => {
    const text = rec.fyersOptionSymbol || rec.contractLabel;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSymbol(true);
      window.setTimeout(() => setCopiedSymbol(false), 1800);
    } catch {
      // Ignore clipboard errors
    }
  };

  if (!instrumentMeta.fnoEnabled) {
    return (
      <section className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Options Buying Desk
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                {instrumentMeta.normalizedSymbol}
              </span>{' '}
              is a cash-equity symbol without active NSE F&amp;O contracts.
              Select NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, or an F&amp;O
              stock for live 0.50Δ CE/PE option buying.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const isCall = rec.optionType === 'CE';

  return (
    <section
      aria-label="Options Buying Only Desk"
      className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Options Buy Only Desk ({rec.underlying})
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
              Bullish → BUY CE · Bearish → BUY PE
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {directionSource} · Spot{' '}
            <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
              {rec.spotPrice.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>{' '}
            · Lot Size{' '}
            <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
              {rec.lotSize}
            </span>{' '}
            · {config.stopLossPoints}pt Index SL ={' '}
            <strong className="font-mono text-red-600 dark:text-red-400">
              {rec.optionSlPoints}pt Option SL
            </strong>
          </p>
        </div>

        {/* Delta, Expiry & Direction Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Delta Preset Picker */}
          <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-[#161D2B] rounded-lg border border-slate-200/80 dark:border-slate-800">
            {OPTION_DELTA_PRESETS.map((preset) => {
              const active = Math.abs(targetDelta - preset.delta) < 0.05;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      instrumentType: 'NIFTY_ATM_OPT',
                      optionDeltaEstimate: preset.delta,
                    })
                  }
                  className={`px-2 py-1 text-[11px] font-mono rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {preset.delta.toFixed(2)}Δ
                </button>
              );
            })}
          </div>

          {/* Smart Expiry Selector (Auto / Current / Next) */}
          <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-[#161D2B] rounded-lg border border-slate-200/80 dark:border-slate-800">
            {(
              [
                { id: 'auto', label: 'Auto Exp' },
                { id: 'current', label: 'Current' },
                { id: 'next', label: 'Next Exp' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() =>
                  onChangeConfig({
                    ...config,
                    optionExpiryPreference: opt.id,
                  })
                }
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  expiryMode === opt.id
                    ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Manual preview toggle when session bias is still PENDING */}
          {!activeOpenTrade &&
            !lastCandle?.armedDirection &&
            result.finalBias === 'PENDING' && (
              <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-[#161D2B] rounded-lg border border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setManualDirection('LONG')}
                  className={`px-2 py-1 text-[11px] font-mono font-semibold rounded-md cursor-pointer ${
                    manualDirection === 'LONG'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  BUY CE
                </button>
                <button
                  type="button"
                  onClick={() => setManualDirection('SHORT')}
                  className={`px-2 py-1 text-[11px] font-mono font-semibold rounded-md cursor-pointer ${
                    manualDirection === 'SHORT'
                      ? 'bg-red-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  BUY PE
                </button>
              </div>
            )}
        </div>
      </div>

      {/* Main Contract Hero + Live Option LTP + Option SL/Target Grid */}
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800/80">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md ${
                  isCall
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-500/15 text-red-700 dark:text-red-400'
                }`}
              >
                {isCall ? (
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                BUY {rec.optionType}
              </span>
              <span className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100">
                {rec.contractLabel}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                ({rec.moneynessLabel} · {rec.effectiveDelta.toFixed(2)}Δ)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Expiry:{' '}
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  {rec.expiryLabel}
                </strong>
                {expiryMode === 'auto' && effectiveExpiryApiChoice === 'next' && (
                  <span className="ml-1.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                    (Auto-rolled to Next)
                  </span>
                )}
              </span>
              {rec.fyersOptionSymbol && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => void handleCopySymbol()}
                    title="Copy Fyers option symbol"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <span>{rec.fyersOptionSymbol}</span>
                    {copiedSymbol ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </>
              )}
              {loadingContract && (
                <span className="text-[11px] text-slate-400">
                  resolving contract...
                </span>
              )}
            </div>
          </div>

          {/* Live Option LTP Ticker */}
          <div className="text-right">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-end gap-1.5">
              {rec.isLivePrice && (
                <Radio
                  className="w-3 h-3 text-emerald-500 animate-pulse"
                  aria-hidden="true"
                />
              )}
              <span>
                {rec.isLivePrice
                  ? `Live Option LTP${lastTickTime ? ` · ${lastTickTime}` : ''}`
                  : 'Est. Option Premium'}
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-end gap-2">
              <span className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
                ₹{rec.optionEntryPrice.toFixed(2)}
              </span>
              {liveChangePct !== null && (
                <span
                  className={`font-mono tabular-nums text-xs font-semibold ${
                    liveChangePct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {liveChangePct >= 0 ? '+' : ''}
                  {liveChangePct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 4 Key Option Execution Metrics (Strict 0.50Δ Half-Point SL Mapping) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200/80 dark:border-slate-800 rounded-lg px-3.5 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Option SL ({rec.optionSlPoints} pts)
            </div>
            <div className="mt-1 font-mono tabular-nums text-base font-bold text-red-600 dark:text-red-400">
              ₹{rec.optionSlPrice.toFixed(2)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              Risk {formatINR(-rec.riskRupees, { signed: true, decimals: 0 })} (
              {rec.lots}L · {rec.totalQty} qty)
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200/80 dark:border-slate-800 rounded-lg px-3.5 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              1:1 Cost Trail Trigger
            </div>
            <div className="mt-1 font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100">
              ₹{rec.optionTrailTriggerPrice.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Move SL → ₹{rec.optionEntryPrice.toFixed(1)}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200/80 dark:border-slate-800 rounded-lg px-3.5 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Option Target (+{rec.optionTargetPoints} pts)
            </div>
            <div className="mt-1 font-mono tabular-nums text-base font-bold text-emerald-600 dark:text-emerald-400">
              ₹{rec.optionTargetPrice.toFixed(2)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              Reward {formatINR(rec.rewardRupees, { signed: true, decimals: 0 })}{' '}
              (1:{rec.riskRewardRatio.toFixed(1)})
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200/80 dark:border-slate-800 rounded-lg px-3.5 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Option Capital ({rec.lots} {rec.lots === 1 ? 'Lot' : 'Lots'})
            </div>
            <div className="mt-1 font-mono tabular-nums text-base font-bold text-slate-900 dark:text-slate-100">
              {formatINR(rec.capitalRequired, { signed: false, decimals: 0 })}
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
              ~{rec.capitalSavedPct}% less than Futures
            </div>
          </div>
        </div>

        {/* Risk-Managed Auto Lot Sizing Strip */}
        {lotCalculation && (
          <div className="px-3.5 py-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200/80 dark:border-blue-500/25 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 min-w-0">
              <Calculator
                className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0"
                aria-hidden="true"
              />
              <span className="font-mono tabular-nums">
                Risk Budget{' '}
                <strong>
                  {formatINR(lotCalculation.allowedRiskRupees, {
                    signed: false,
                    decimals: 0,
                  })}
                </strong>{' '}
                ÷{' '}
                <strong>
                  {formatINR(lotCalculation.riskPerLotRupees, {
                    signed: false,
                    decimals: 0,
                  })}
                  /lot
                </strong>{' '}
                ={' '}
                <strong className="text-blue-700 dark:text-blue-300">
                  {lotCalculation.recommendedLots} lot
                  {lotCalculation.recommendedLots === 1 ? '' : 's'} (
                  {lotCalculation.recommendedLots * config.lotSize} qty)
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {config.lots !== lotCalculation.recommendedLots && (
                <button
                  type="button"
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      lots: lotCalculation.recommendedLots,
                    })
                  }
                  className="px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                >
                  Use {lotCalculation.recommendedLots} Lots
                </button>
              )}
              {onOpenPaperWallet && (
                <button
                  type="button"
                  onClick={onOpenPaperWallet}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 hover:underline cursor-pointer"
                >
                  <Wallet className="w-3 h-3" />
                  <span>Risk Settings</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Expiry Warning if user manually forced Current Expiry on expiry day */}
        {expiryMode === 'current' && rec.isExpiryNearRisk && (
          <div className="px-3.5 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                Expiry-day warning: Current expiry has ≤1 day left (rapid theta &amp;
                gamma). Switch to Auto Exp or Next Expiry to preserve 0.50Δ.
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onChangeConfig({ ...config, optionExpiryPreference: 'auto' })
              }
              className="px-2.5 py-1 text-[11px] font-semibold bg-amber-600 text-white hover:bg-amber-700 rounded-md cursor-pointer"
            >
              Use Auto Expiry
            </button>
          </div>
        )}

        {/* Concise Delta Guidance */}
        <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0E131D] border border-slate-200/70 dark:border-slate-800/80 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <ShieldCheck
            className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span>{rec.deltaGuidance}</span>
        </div>
      </div>
    </section>
  );
};
