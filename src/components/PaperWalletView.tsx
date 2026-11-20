import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Check,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { PaperWalletConfig, StrategyConfig } from '../types/strategy';
import { formatINR } from '../utils/formatters';
import { normalizeFyersSymbol } from '../utils/fyersSymbols';
import {
  calculateRiskBasedLots,
  computeOptionRecommendation,
  getFallbackInstrumentMeta,
  InstrumentMeta,
  RiskBasedLotCalculation,
  STATIC_FNO_REGISTRY,
} from '../utils/optionsEngine';

interface PaperWalletViewProps {
  wallet: PaperWalletConfig;
  onUpdateWallet: (patch: Partial<PaperWalletConfig>) => void;
  onResetWallet: () => void;
  realizedPnl: number;
  todayRealizedPnl: number;
  liveOpenMtm: number;
  openPositionsCount: number;
  config: StrategyConfig;
  activeSymbol: string;
  activeInstrumentMeta: InstrumentMeta;
  activeSpotPrice: number;
  activeLiveOptionLtp: number | null;
  activeLiveOptionLabel: string | null;
  activeLotCalculation: RiskBasedLotCalculation;
  fyersAuthenticated: boolean;
  canEditStrategy: boolean;
  onApplyRecommendedLots?: (lots: number) => void;
}

interface QuickSymbolOption {
  label: string;
  symbol: string;
  key: string;
  fallbackSpot: number;
}

const QUICK_SYMBOLS: QuickSymbolOption[] = [
  { label: 'NIFTY 50', symbol: 'NSE:NIFTY50-INDEX', key: 'NIFTY', fallbackSpot: 24500 },
  { label: 'BANK NIFTY', symbol: 'NSE:NIFTYBANK-INDEX', key: 'BANKNIFTY', fallbackSpot: 52000 },
  { label: 'SENSEX', symbol: 'BSE:SENSEX-INDEX', key: 'SENSEX', fallbackSpot: 80500 },
  { label: 'FIN NIFTY', symbol: 'NSE:FINNIFTY-INDEX', key: 'FINNIFTY', fallbackSpot: 23800 },
  { label: 'MIDCAP NIFTY', symbol: 'NSE:MIDCPNIFTY-INDEX', key: 'MIDCPNIFTY', fallbackSpot: 12600 },
];

interface LiveSymbolQuoteState {
  symbol: string;
  meta: InstrumentMeta;
  spotPrice: number | null;
  optionSymbol: string | null;
  optionLabel: string | null;
  expiryLabel: string | null;
  liveOptionLtp: number | null;
  changePct: number | null;
  updatedAtIst: string | null;
}

function formatIndianUnits(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '₹0';
  if (amount >= 10_000_000) {
    return `${(amount / 10_000_000).toFixed(2)} Cr`;
  }
  if (amount >= 100_000) {
    return `${(amount / 100_000).toFixed(2)} Lakh`;
  }
  return formatINR(amount, { signed: false, decimals: 0 });
}

export const PaperWalletView: React.FC<PaperWalletViewProps> = ({
  wallet,
  onUpdateWallet,
  onResetWallet,
  realizedPnl,
  todayRealizedPnl,
  liveOpenMtm,
  openPositionsCount,
  config,
  activeSymbol,
  activeInstrumentMeta,
  activeSpotPrice,
  activeLiveOptionLtp,
  activeLiveOptionLabel,
  activeLotCalculation,
  fyersAuthenticated,
  canEditStrategy,
  onApplyRecommendedLots,
}) => {
  // Smooth local string drafts so users can type custom numbers freely without jump/clamp mid-keystroke
  const [capitalInput, setCapitalInput] = useState<string>(
    String(wallet.startingCapital)
  );
  const [tradeRiskInput, setTradeRiskInput] = useState<string>(
    String(
      wallet.riskMode === 'PERCENT_CAPITAL'
        ? wallet.riskPerTradePct
        : wallet.riskPerTradeRupees
    )
  );
  const dailyRiskMode = wallet.dailyRiskMode || 'FIXED_INR';
  const [dailyRiskInput, setDailyRiskInput] = useState<string>(
    String(
      dailyRiskMode === 'PERCENT_CAPITAL'
        ? wallet.maxDailyLossPct ?? 5
        : wallet.maxDailyLossRupees
    )
  );
  const [maxLotsInput, setMaxLotsInput] = useState<string>(
    String(wallet.maxLotsCap)
  );
  const [savedNotice, setSavedNotice] = useState(false);

  // Sync drafts if wallet changes externally (e.g. server hydration or reset)
  useEffect(() => {
    setCapitalInput(String(wallet.startingCapital));
  }, [wallet.startingCapital]);

  useEffect(() => {
    setTradeRiskInput(
      String(
        wallet.riskMode === 'PERCENT_CAPITAL'
          ? wallet.riskPerTradePct
          : wallet.riskPerTradeRupees
      )
    );
  }, [wallet.riskMode, wallet.riskPerTradePct, wallet.riskPerTradeRupees]);

  useEffect(() => {
    setDailyRiskInput(
      String(
        dailyRiskMode === 'PERCENT_CAPITAL'
          ? wallet.maxDailyLossPct ?? 5
          : wallet.maxDailyLossRupees
      )
    );
  }, [dailyRiskMode, wallet.maxDailyLossPct, wallet.maxDailyLossRupees]);

  useEffect(() => {
    setMaxLotsInput(String(wallet.maxLotsCap));
  }, [wallet.maxLotsCap]);

  // Live Symbol & Call/Put Option Price Lot Calculator state
  const [calcSymbol, setCalcSymbol] = useState<string>(
    normalizeFyersSymbol(activeSymbol || 'NSE:NIFTY50-INDEX')
  );
  const [customSymbolInput, setCustomSymbolInput] = useState<string>('');
  const [calcOptionType, setCalcOptionType] = useState<'CE' | 'PE'>('CE');
  const [manualOptionLtp, setManualOptionLtp] = useState<string>('');
  const [loadingSymbolQuote, setLoadingSymbolQuote] = useState<boolean>(false);
  const [symbolQuoteState, setSymbolQuoteState] =
    useState<LiveSymbolQuoteState>(() => ({
      symbol: normalizeFyersSymbol(activeSymbol || 'NSE:NIFTY50-INDEX'),
      meta: activeInstrumentMeta,
      spotPrice: activeSpotPrice > 0 ? activeSpotPrice : null,
      optionSymbol: null,
      optionLabel: activeLiveOptionLabel,
      expiryLabel: null,
      liveOptionLtp: activeLiveOptionLtp,
      changePct: null,
      updatedAtIst: null,
    }));

  const liveBalance = wallet.startingCapital + realizedPnl + liveOpenMtm;
  const totalPnl = realizedPnl + liveOpenMtm;
  const totalPnlPct =
    wallet.startingCapital > 0 ? (totalPnl / wallet.startingCapital) * 100 : 0;
  const todayNetPnl = todayRealizedPnl + liveOpenMtm;

  const allowedDailyLoss =
    dailyRiskMode === 'PERCENT_CAPITAL'
      ? Math.max(
          200,
          Math.round(
            (Math.max(0, liveBalance) * Math.max(0.25, wallet.maxDailyLossPct ?? 5)) /
              100
          )
        )
      : Math.max(200, Math.round(wallet.maxDailyLossRupees));

  const dailyLossUsed = todayNetPnl < 0 ? Math.abs(todayNetPnl) : 0;
  const dailyLossPct =
    allowedDailyLoss > 0
      ? Math.min(100, (dailyLossUsed / allowedDailyLoss) * 100)
      : 0;
  const dailyLossBreached =
    allowedDailyLoss > 0 && dailyLossUsed >= allowedDailyLoss;

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedCapital = Math.round(Number(capitalInput));
    if (!Number.isFinite(parsedCapital) || parsedCapital < 1000) {
      toast.error('Enter a custom Paper Wallet balance of at least ₹1,000.');
      return;
    }

    const parsedTradeRisk = Number(tradeRiskInput);
    if (!Number.isFinite(parsedTradeRisk) || parsedTradeRisk <= 0) {
      toast.error('Enter a valid Risk Per Trade value.');
      return;
    }

    const parsedDailyRisk = Number(dailyRiskInput);
    if (!Number.isFinite(parsedDailyRisk) || parsedDailyRisk <= 0) {
      toast.error('Enter a valid Risk Per Day value.');
      return;
    }

    const parsedMaxLots = Math.floor(Number(maxLotsInput));
    if (!Number.isFinite(parsedMaxLots) || parsedMaxLots < 1) {
      toast.error('Max Lots Cap must be at least 1.');
      return;
    }

    const patch: Partial<PaperWalletConfig> = {
      startingCapital: Math.min(1_000_000_000, Math.max(1000, parsedCapital)),
      maxLotsCap: Math.min(500, Math.max(1, parsedMaxLots)),
    };

    if (wallet.riskMode === 'PERCENT_CAPITAL') {
      patch.riskPerTradePct = Math.min(50, Math.max(0.1, parsedTradeRisk));
    } else {
      patch.riskPerTradeRupees = Math.max(100, Math.round(parsedTradeRisk));
    }

    if (dailyRiskMode === 'PERCENT_CAPITAL') {
      patch.maxDailyLossPct = Math.min(50, Math.max(0.25, parsedDailyRisk));
    } else {
      patch.maxDailyLossRupees = Math.max(200, Math.round(parsedDailyRisk));
    }

    onUpdateWallet(patch);
    setSavedNotice(true);
    toast.success('Paper Wallet & Risk settings saved.');
    window.setTimeout(() => setSavedNotice(false), 2000);
  };

  // Fetch official lot size, live spot, and live traded CE/PE option price for any symbol
  const fetchLiveSymbolOptionPrice = useCallback(
    async (targetRawSymbol: string, optionType: 'CE' | 'PE', silent = false) => {
      const normalized = normalizeFyersSymbol(targetRawSymbol);
      const fallbackMeta = getFallbackInstrumentMeta(normalized);
      if (!silent) setLoadingSymbolQuote(true);

      try {
        // 1) Resolve instrument meta (lot size, strike step, expiry)
        let meta: InstrumentMeta = fallbackMeta;
        try {
          const metaResp = await fetch(
            `/api/fyers/instrument-meta?${new URLSearchParams({
              symbol: normalized,
            }).toString()}`,
            { credentials: 'include', cache: 'no-store' }
          );
          if (metaResp.ok) {
            meta = (await metaResp.json()) as InstrumentMeta;
          }
        } catch {
          // Use SEBI fallback registry
        }

        // 2) Fetch live spot LTP if Fyers is connected
        let spot: number | null =
          normalized === normalizeFyersSymbol(activeSymbol) && activeSpotPrice > 0
            ? activeSpotPrice
            : null;
        if (fyersAuthenticated) {
          try {
            const spotResp = await fetch(
              `/api/fyers/quotes?${new URLSearchParams({
                symbol: normalized,
              }).toString()}`,
              { credentials: 'include', cache: 'no-store' }
            );
            if (spotResp.ok) {
              const tick = (await spotResp.json()) as { ltp?: number };
              if (typeof tick.ltp === 'number' && tick.ltp > 0) {
                spot = tick.ltp;
              }
            }
          } catch {
            // fallback
          }
        }

        const quickMatch = QUICK_SYMBOLS.find((q) => q.symbol === normalized);
        const effectiveSpot = spot ?? quickMatch?.fallbackSpot ?? 24500;
        const strikeStep = meta.strikeStep || 50;
        const atmStrike = Math.round(effectiveSpot / strikeStep) * strikeStep;

        // 3) Resolve exact CE/PE contract & live traded option LTP
        let optionSymbol: string | null = null;
        let expiryLabel: string | null = null;
        let liveOptionLtp: number | null = null;
        let changePct: number | null = null;
        let updatedAtIst: string | null = null;

        if (meta.fnoEnabled) {
          try {
            const pickResp = await fetch(
              `/api/fyers/option-pick?${new URLSearchParams({
                symbol: normalized,
                strike: String(atmStrike),
                optionType,
                expiry: config.optionExpiryPreference === 'next' ? 'next' : 'current',
              }).toString()}`,
              { credentials: 'include', cache: 'no-store' }
            );
            if (pickResp.ok) {
              let pick = (await pickResp.json()) as {
                fyersOptionSymbol?: string | null;
                expiryLabel?: string | null;
                isExpiryNearRisk?: boolean;
                liveLtp?: number | null;
                changePct?: number | null;
              };

              // Auto-roll to next expiry if <= 1 day remaining
              if (
                (config.optionExpiryPreference || 'auto') === 'auto' &&
                pick.isExpiryNearRisk
              ) {
                const nextResp = await fetch(
                  `/api/fyers/option-pick?${new URLSearchParams({
                    symbol: normalized,
                    strike: String(atmStrike),
                    optionType,
                    expiry: 'next',
                  }).toString()}`,
                  { credentials: 'include', cache: 'no-store' }
                );
                if (nextResp.ok) {
                  pick = (await nextResp.json()) as typeof pick;
                }
              }

              optionSymbol = pick.fyersOptionSymbol ?? null;
              expiryLabel = pick.expiryLabel ?? null;
              if (typeof pick.liveLtp === 'number' && pick.liveLtp > 0) {
                liveOptionLtp = pick.liveLtp;
              }
              if (typeof pick.changePct === 'number') {
                changePct = pick.changePct;
              }
            }
          } catch {
            // Keep estimated fallback
          }

          // Fresh direct quote for the resolved option contract if authenticated
          if (fyersAuthenticated && optionSymbol) {
            try {
              const optResp = await fetch(
                `/api/fyers/quotes?${new URLSearchParams({
                  symbol: optionSymbol,
                }).toString()}`,
                { credentials: 'include', cache: 'no-store' }
              );
              if (optResp.ok) {
                const optTick = (await optResp.json()) as {
                  ltp?: number;
                  changePct?: number;
                  istTimeSec?: string;
                };
                if (typeof optTick.ltp === 'number' && optTick.ltp > 0) {
                  liveOptionLtp = optTick.ltp;
                }
                if (typeof optTick.changePct === 'number') {
                  changePct = optTick.changePct;
                }
                if (optTick.istTimeSec) {
                  updatedAtIst = optTick.istTimeSec;
                }
              }
            } catch {
              // ignore
            }
          }
        }

        setSymbolQuoteState({
          symbol: normalized,
          meta,
          spotPrice: effectiveSpot,
          optionSymbol,
          optionLabel: `${meta.underlying} ${atmStrike} ${optionType}`,
          expiryLabel,
          liveOptionLtp,
          changePct,
          updatedAtIst,
        });
      } finally {
        if (!silent) setLoadingSymbolQuote(false);
      }
    },
    [
      activeSymbol,
      activeSpotPrice,
      fyersAuthenticated,
      config.optionExpiryPreference,
    ]
  );

  // Fetch symbol meta & live CE/PE option price whenever selected symbol or CE/PE toggles
  useEffect(() => {
    void fetchLiveSymbolOptionPrice(calcSymbol, calcOptionType, false);
  }, [calcSymbol, calcOptionType, fetchLiveSymbolOptionPrice]);

  // Live 3-second polling for the selected CE/PE option contract when Fyers is connected
  useEffect(() => {
    if (!fyersAuthenticated || !symbolQuoteState.optionSymbol) return;
    let cancelled = false;
    const optionSym = symbolQuoteState.optionSymbol;
    const timer = window.setInterval(async () => {
      try {
        const resp = await fetch(
          `/api/fyers/quotes?${new URLSearchParams({ symbol: optionSym }).toString()}`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (!resp.ok || cancelled) return;
        const tick = (await resp.json()) as {
          ltp?: number;
          changePct?: number;
          istTimeSec?: string;
        };
        if (!cancelled && typeof tick.ltp === 'number' && tick.ltp > 0) {
          setSymbolQuoteState((prev) =>
            prev.optionSymbol !== optionSym
              ? prev
              : {
                  ...prev,
                  liveOptionLtp: tick.ltp!,
                  changePct:
                    typeof tick.changePct === 'number'
                      ? tick.changePct
                      : prev.changePct,
                  updatedAtIst: tick.istTimeSec || prev.updatedAtIst,
                }
          );
        }
      } catch {
        // retry next cycle
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fyersAuthenticated, symbolQuoteState.optionSymbol]);

  const handleLoadCustomSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customSymbolInput.trim();
    if (!cleaned) return;
    const normalized = normalizeFyersSymbol(cleaned);
    setCalcSymbol(normalized);
    setManualOptionLtp('');
  };

  // Compute lot sizing for the selected calculator symbol & live/custom CE/PE option price
  const selectedRec = useMemo(() => {
    const spot = symbolQuoteState.spotPrice || 24500;
    const slForSymbol =
      symbolQuoteState.symbol === normalizeFyersSymbol(activeSymbol)
        ? config.stopLossPoints
        : symbolQuoteState.meta.recommendedSlPoints || config.stopLossPoints;
    const tgtForSymbol =
      symbolQuoteState.symbol === normalizeFyersSymbol(activeSymbol)
        ? config.targetPoints
        : symbolQuoteState.meta.recommendedTargetPoints || config.targetPoints;
    const manualNum = Number(manualOptionLtp);
    const hasManual = Number.isFinite(manualNum) && manualNum > 0;
    const resolvedLtp = hasManual
      ? manualNum
      : symbolQuoteState.liveOptionLtp ?? null;

    const rec = computeOptionRecommendation({
      symbol: symbolQuoteState.symbol,
      spotPrice: spot,
      direction: calcOptionType === 'CE' ? 'LONG' : 'SHORT',
      targetDelta: config.optionDeltaEstimate || 0.5,
      slPoints: slForSymbol,
      targetPoints: tgtForSymbol,
      lotSize: symbolQuoteState.meta.lotSize,
      lots: 1,
      strikeStep: symbolQuoteState.meta.strikeStep,
      approxFuturesMargin: symbolQuoteState.meta.approxFuturesMargin,
      liveOptionLtp: resolvedLtp,
      liveOptionSymbol: symbolQuoteState.optionSymbol,
      expiryLabel: symbolQuoteState.expiryLabel,
    });

    const calc = calculateRiskBasedLots({
      startingCapital: wallet.startingCapital,
      liveEquity: liveBalance,
      riskMode: wallet.riskMode,
      riskPerTradeRupees: wallet.riskPerTradeRupees,
      riskPerTradePct: wallet.riskPerTradePct,
      dailyRiskMode,
      maxDailyLossRupees: wallet.maxDailyLossRupees,
      maxDailyLossPct: wallet.maxDailyLossPct,
      todayNetPnl,
      maxLotsCap: wallet.maxLotsCap,
      indexStopLossPoints: slForSymbol,
      optionDelta: config.optionDeltaEstimate || 0.5,
      isOptionBuying: true,
      lotSize: symbolQuoteState.meta.lotSize,
      optionLtp: rec.optionEntryPrice,
      isOptionLtpLive: !hasManual && symbolQuoteState.liveOptionLtp !== null,
    });

    return { rec, calc, slForSymbol, hasManual };
  }, [
    symbolQuoteState,
    activeSymbol,
    config.stopLossPoints,
    config.targetPoints,
    config.optionDeltaEstimate,
    manualOptionLtp,
    calcOptionType,
    wallet,
    liveBalance,
    dailyRiskMode,
    todayNetPnl,
  ]);

  // Multi-index comparison matrix (Nifty, Bank Nifty, Sensex, FinNifty, Midcap Nifty)
  const indexMatrixRows = useMemo(() => {
    return QUICK_SYMBOLS.map((item) => {
      const spec = STATIC_FNO_REGISTRY[item.key];
      const isSelected = symbolQuoteState.symbol === item.symbol;
      const spot = isSelected
        ? symbolQuoteState.spotPrice || item.fallbackSpot
        : item.fallbackSpot;
      const lotSize = isSelected ? symbolQuoteState.meta.lotSize : spec.lotSize;
      const liveLtp = isSelected ? symbolQuoteState.liveOptionLtp : null;

      const rec = computeOptionRecommendation({
        symbol: item.symbol,
        spotPrice: spot,
        direction: calcOptionType === 'CE' ? 'LONG' : 'SHORT',
        targetDelta: config.optionDeltaEstimate || 0.5,
        slPoints: spec.recommendedSlPoints,
        targetPoints: spec.recommendedTargetPoints,
        lotSize,
        lots: 1,
        strikeStep: spec.strikeStep,
        approxFuturesMargin: spec.approxFuturesMargin,
        liveOptionLtp: liveLtp,
      });

      const calc = calculateRiskBasedLots({
        startingCapital: wallet.startingCapital,
        liveEquity: liveBalance,
        riskMode: wallet.riskMode,
        riskPerTradeRupees: wallet.riskPerTradeRupees,
        riskPerTradePct: wallet.riskPerTradePct,
        dailyRiskMode,
        maxDailyLossRupees: wallet.maxDailyLossRupees,
        maxDailyLossPct: wallet.maxDailyLossPct,
        todayNetPnl,
        maxLotsCap: wallet.maxLotsCap,
        indexStopLossPoints: spec.recommendedSlPoints,
        optionDelta: config.optionDeltaEstimate || 0.5,
        isOptionBuying: true,
        lotSize,
        optionLtp: rec.optionEntryPrice,
        isOptionLtpLive: liveLtp !== null,
      });

      return {
        item,
        lotSize,
        optionPrice: rec.optionEntryPrice,
        isLive: liveLtp !== null,
        calc,
      };
    });
  }, [
    symbolQuoteState,
    calcOptionType,
    config.optionDeltaEstimate,
    wallet,
    liveBalance,
    dailyRiskMode,
    todayNetPnl,
  ]);

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Paper Wallet &amp; Risk Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure custom virtual capital, per-trade &amp; daily risk limits,
            and auto-calculate option buying lots from live CE/PE prices.
          </p>
        </div>

        <button
          type="button"
          onClick={onResetWallet}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset Defaults (₹1,00,000)</span>
        </button>
      </header>

      {/* 4-Column Live Wallet Summary */}
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl divide-y lg:divide-y-0 divide-x divide-slate-200/80 dark:divide-slate-800/80 overflow-hidden">
        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Live Wallet Balance</span>
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
            {formatINR(liveBalance, { signed: false, decimals: 0 })}
          </div>
          <div
            className={`text-xs font-mono tabular-nums font-medium mt-0.5 ${
              totalPnl > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : totalPnl < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {totalPnlPct >= 0 ? '+' : ''}
            {totalPnlPct.toFixed(2)}% overall
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Configured Virtual Capital
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatINR(wallet.startingCapital, { signed: false, decimals: 0 })}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            {formatIndianUnits(wallet.startingCapital)}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Realized Paper P&amp;L
          </div>
          <div
            className={`mt-1.5 font-mono tabular-nums text-xl font-semibold ${
              realizedPnl > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : realizedPnl < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {formatINR(realizedPnl, { signed: true, decimals: 0 })}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Closed paper positions
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>Live Open MTM</span>
            {openPositionsCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
          <div
            className={`mt-1.5 font-mono tabular-nums text-xl font-semibold ${
              liveOpenMtm > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : liveOpenMtm < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {formatINR(liveOpenMtm, { signed: true, decimals: 0 })}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {openPositionsCount} open position{openPositionsCount === 1 ? '' : 's'}
          </div>
        </div>
      </section>

      {/* Daily Risk Limit Guard */}
      <section
        className={`px-5 py-4 rounded-2xl border ${
          dailyLossBreached
            ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/35'
            : 'bg-white dark:bg-[#111622] border-slate-200/90 dark:border-slate-800/90'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            {dailyLossBreached ? (
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>Daily Risk Guard</span>
            {dailyLossBreached && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase rounded bg-red-600 text-white">
                Max Daily Loss Reached
              </span>
            )}
          </div>
          <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            Today Net:{' '}
            <strong
              className={
                todayNetPnl > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : todayNetPnl < 0
                  ? 'text-red-600 dark:text-red-400'
                  : ''
              }
            >
              {formatINR(todayNetPnl, { signed: true, decimals: 0 })}
            </strong>{' '}
            · Risk/Day Limit:{' '}
            <strong>
              -{formatINR(allowedDailyLoss, { signed: false, decimals: 0 })}
            </strong>{' '}
            · Remaining:{' '}
            <strong>
              {formatINR(Math.max(0, allowedDailyLoss - dailyLossUsed), {
                signed: false,
                decimals: 0,
              })}
            </strong>
          </div>
        </div>
        <div className="mt-2.5 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              dailyLossBreached
                ? 'bg-red-600'
                : dailyLossPct >= 70
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${dailyLossPct}%` }}
          />
        </div>
      </section>

      {/* Main Configuration Card: Custom Wallet Balance, Risk Per Trade, Risk Per Day */}
      <section className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Custom Wallet &amp; Risk Rules
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enter any custom virtual wallet amount, risk per trade, and risk
              per day. Saved to your account.
            </p>
          </div>
          {savedNotice && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span>Saved</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSaveSettings} className="p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Custom Paper Wallet Balance (no fixed presets — fully customizable) */}
            <div className="space-y-1.5">
              <label
                htmlFor="custom-wallet-balance"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Custom Paper Wallet Balance (₹)
              </label>
              <input
                id="custom-wallet-balance"
                type="number"
                inputMode="numeric"
                min={1000}
                max={1000000000}
                step={1}
                value={capitalInput}
                onChange={(e) => setCapitalInput(e.target.value)}
                placeholder="e.g. 100000"
                className={inputCls}
              />
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {Number(capitalInput) > 0
                  ? `${formatINR(Number(capitalInput), {
                      signed: false,
                      decimals: 0,
                    })} (${formatIndianUnits(Number(capitalInput))})`
                  : 'Enter any amount ≥ ₹1,000'}
              </div>
            </div>

            {/* Max Lots Cap */}
            <div className="space-y-1.5">
              <label
                htmlFor="max-lots-cap"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Maximum Lots Cap (Safety Ceiling)
              </label>
              <input
                id="max-lots-cap"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                step={1}
                value={maxLotsInput}
                onChange={(e) => setMaxLotsInput(e.target.value)}
                placeholder="e.g. 25"
                className={inputCls}
              />
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Hard upper limit on lots per trade even if risk budget allows
                more.
              </div>
            </div>

            {/* Risk Per Trade */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="risk-per-trade-input"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Risk Per Trade
                </label>
                <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-[#161D2B] rounded-md border border-slate-200 dark:border-slate-700 text-[11px]">
                  <button
                    type="button"
                    onClick={() => onUpdateWallet({ riskMode: 'FIXED_INR' })}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      wallet.riskMode === 'FIXED_INR'
                        ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Fixed ₹
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateWallet({ riskMode: 'PERCENT_CAPITAL' })
                    }
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      wallet.riskMode === 'PERCENT_CAPITAL'
                        ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    % Wallet
                  </button>
                </div>
              </div>
              <input
                id="risk-per-trade-input"
                type="number"
                inputMode="decimal"
                min={wallet.riskMode === 'PERCENT_CAPITAL' ? 0.1 : 100}
                max={wallet.riskMode === 'PERCENT_CAPITAL' ? 50 : 100000000}
                step={wallet.riskMode === 'PERCENT_CAPITAL' ? 0.1 : 1}
                value={tradeRiskInput}
                onChange={(e) => setTradeRiskInput(e.target.value)}
                placeholder={
                  wallet.riskMode === 'PERCENT_CAPITAL' ? 'e.g. 2' : 'e.g. 2000'
                }
                className={inputCls}
              />
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Active risk budget / trade:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {formatINR(activeLotCalculation.allowedRiskRupees, {
                    signed: false,
                    decimals: 0,
                  })}
                </strong>
              </div>
            </div>

            {/* Risk Per Day (Max Daily Loss) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="risk-per-day-input"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Risk Per Day (Max Daily Loss)
                </label>
                <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-[#161D2B] rounded-md border border-slate-200 dark:border-slate-700 text-[11px]">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateWallet({ dailyRiskMode: 'FIXED_INR' })
                    }
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      dailyRiskMode === 'FIXED_INR'
                        ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Fixed ₹
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateWallet({ dailyRiskMode: 'PERCENT_CAPITAL' })
                    }
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      dailyRiskMode === 'PERCENT_CAPITAL'
                        ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    % Wallet
                  </button>
                </div>
              </div>
              <input
                id="risk-per-day-input"
                type="number"
                inputMode="decimal"
                min={dailyRiskMode === 'PERCENT_CAPITAL' ? 0.25 : 200}
                max={dailyRiskMode === 'PERCENT_CAPITAL' ? 50 : 100000000}
                step={dailyRiskMode === 'PERCENT_CAPITAL' ? 0.25 : 1}
                value={dailyRiskInput}
                onChange={(e) => setDailyRiskInput(e.target.value)}
                placeholder={
                  dailyRiskMode === 'PERCENT_CAPITAL' ? 'e.g. 5' : 'e.g. 5000'
                }
                className={inputCls}
              />
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Active daily loss limit:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {formatINR(allowedDailyLoss, { signed: false, decimals: 0 })}
                </strong>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={wallet.autoSizeLots}
                onChange={(e) =>
                  onUpdateWallet({ autoSizeLots: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
              />
              <span>
                Auto-calculate &amp; apply lots from live CE/PE option price
                when trading
              </span>
            </label>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Save Wallet &amp; Risk Rules</span>
            </button>
          </div>
        </form>
      </section>

      {/* Live Symbol & Call/Put Option Price Lot Size Calculator */}
      <section className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Live Option-Price Lot Calculator (Any NSE / BSE Symbol)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Calculates exact lots for NIFTY, SENSEX, BANK NIFTY, or any
                custom F&amp;O symbol using the live traded Call/Put option
                price and your risk budget.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loadingSymbolQuote}
            onClick={() =>
              void fetchLiveSymbolOptionPrice(calcSymbol, calcOptionType, false)
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loadingSymbolQuote ? 'animate-spin' : ''}`}
            />
            <span>Refresh Live Price</span>
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* Symbol Selector + Custom Symbol + CE/PE Switch */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_SYMBOLS.map((sym) => {
                const selected = calcSymbol === sym.symbol;
                return (
                  <button
                    key={sym.symbol}
                    type="button"
                    onClick={() => {
                      setCalcSymbol(sym.symbol);
                      setManualOptionLtp('');
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 dark:bg-[#161D2B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {sym.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <form
                onSubmit={handleLoadCustomSymbol}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={customSymbolInput}
                  onChange={(e) => setCustomSymbolInput(e.target.value)}
                  placeholder="Custom e.g. RELIANCE, BANKEX"
                  className="w-44 sm:w-48 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B2436] border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  Load
                </button>
              </form>

              <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-[#161D2B] rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setCalcOptionType('CE')}
                  className={`px-3 py-1 text-xs font-mono font-semibold rounded-md cursor-pointer ${
                    calcOptionType === 'CE'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  BUY CE
                </button>
                <button
                  type="button"
                  onClick={() => setCalcOptionType('PE')}
                  className={`px-3 py-1 text-xs font-mono font-semibold rounded-md cursor-pointer ${
                    calcOptionType === 'PE'
                      ? 'bg-red-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  BUY PE
                </button>
              </div>
            </div>
          </div>

          {/* Active Option Contract Strip + Optional Manual LTP Test Override */}
          <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded ${
                    calcOptionType === 'CE'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-red-500/15 text-red-700 dark:text-red-400'
                  }`}
                >
                  BUY {calcOptionType}
                </span>
                <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                  {selectedRec.rec.contractLabel}
                </span>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  · Lot Size: {symbolQuoteState.meta.lotSize} qty
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
                {selectedRec.calc.isOptionLtpLive ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <Radio className="w-3 h-3 animate-pulse" />
                    Live Option LTP
                    {symbolQuoteState.updatedAtIst
                      ? ` · ${symbolQuoteState.updatedAtIst}`
                      : ''}
                  </span>
                ) : (
                  <span>
                    {selectedRec.hasManual
                      ? 'Custom Test Option Price'
                      : 'Estimated Option Price (Connect Fyers for live LTP)'}
                  </span>
                )}
                {symbolQuoteState.optionSymbol && (
                  <>
                    <span>·</span>
                    <span>{symbolQuoteState.optionSymbol}</span>
                  </>
                )}
                {symbolQuoteState.expiryLabel && (
                  <>
                    <span>·</span>
                    <span>Exp {symbolQuoteState.expiryLabel}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Traded Option Price
                </div>
                <div className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-100">
                  ₹{selectedRec.rec.optionEntryPrice.toFixed(2)}
                </div>
              </div>

              <div className="w-32">
                <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
                  Test LTP (optional)
                </label>
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={manualOptionLtp}
                  onChange={(e) => setManualOptionLtp(e.target.value)}
                  placeholder="Auto live"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>
          </div>

          {/* 5-Column Calculation Breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 font-mono tabular-nums">
            <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3">
              <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                1 Lot Option Cost
              </div>
              <div className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {selectedRec.calc.capitalPerLotRupees !== null
                  ? formatINR(selectedRec.calc.capitalPerLotRupees, {
                      signed: false,
                      decimals: 0,
                    })
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                ₹{selectedRec.rec.optionEntryPrice.toFixed(1)} ×{' '}
                {symbolQuoteState.meta.lotSize} qty
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3">
              <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                Risk per 1 Lot
              </div>
              <div className="mt-1 text-base font-bold text-red-600 dark:text-red-400">
                {formatINR(selectedRec.calc.riskPerLotRupees, {
                  signed: false,
                  decimals: 0,
                })}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedRec.calc.optionSlPoints}pt SL ×{' '}
                {symbolQuoteState.meta.lotSize} qty
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3">
              <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                By Risk Budget
              </div>
              <div className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {selectedRec.calc.rawLotsByRisk} lot
                {selectedRec.calc.rawLotsByRisk === 1 ? '' : 's'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {formatINR(selectedRec.calc.effectiveRiskBudgetRupees, {
                  signed: false,
                  decimals: 0,
                })}{' '}
                budget
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-3">
              <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                Wallet Can Buy
              </div>
              <div className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {selectedRec.calc.affordableLots !== null
                  ? `${selectedRec.calc.affordableLots} lot${
                      selectedRec.calc.affordableLots === 1 ? '' : 's'
                    }`
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                @ live option LTP
              </div>
            </div>

            <div className="col-span-2 lg:col-span-1 bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/35 rounded-xl px-3.5 py-3">
              <div className="text-[11px] font-sans font-medium text-blue-700 dark:text-blue-300">
                Calculated Trade Size
              </div>
              <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                {selectedRec.calc.executableLots} lot
                {selectedRec.calc.executableLots === 1 ? '' : 's'}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                {selectedRec.calc.executableLots * symbolQuoteState.meta.lotSize}{' '}
                qty ·{' '}
                {selectedRec.calc.capitalPerLotRupees !== null
                  ? formatINR(
                      selectedRec.calc.executableLots *
                        selectedRec.calc.capitalPerLotRupees,
                      { signed: false, decimals: 0 }
                    )
                  : '—'}
              </div>
            </div>
          </div>

          {(selectedRec.calc.dailyLimitReached ||
            selectedRec.calc.insufficientCapital ||
            selectedRec.calc.cappedByCapital ||
            selectedRec.calc.cappedByDailyRisk ||
            selectedRec.calc.cappedByMaxLots) && (
            <div className="px-3.5 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {selectedRec.calc.dailyLimitReached
                  ? 'Daily risk limit reached — 0 lots permitted until next trading session.'
                  : selectedRec.calc.insufficientCapital
                  ? `Live Wallet Balance (${formatINR(liveBalance, {
                      signed: false,
                      decimals: 0,
                    })}) is below the cost of 1 lot (${formatINR(
                      selectedRec.calc.capitalPerLotRupees ?? 0,
                      { signed: false, decimals: 0 }
                    )}) at this option LTP.`
                  : selectedRec.calc.cappedByCapital
                  ? 'Lots were capped by available Paper Wallet balance based on live option premium.'
                  : selectedRec.calc.cappedByDailyRisk
                  ? 'Lots were reduced to stay within your remaining Risk Per Day budget.'
                  : `Lots were capped at your Maximum Lots ceiling (${wallet.maxLotsCap}).`}
              </span>
            </div>
          )}

          {canEditStrategy &&
            onApplyRecommendedLots &&
            symbolQuoteState.symbol === normalizeFyersSymbol(activeSymbol) &&
            selectedRec.calc.executableLots >= 1 &&
            config.lots !== selectedRec.calc.executableLots && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    onApplyRecommendedLots(selectedRec.calc.executableLots)
                  }
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Apply {selectedRec.calc.executableLots} Lots to Active
                  Strategy
                </button>
              </div>
            )}

          {/* Quick Multi-Index Sizing Reference */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
              Quick Index Reference ({calcOptionType} · {config.optionDeltaEstimate}
              Δ)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium">Index</th>
                    <th className="py-2 px-3 font-medium text-right">
                      Lot Size
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      Option Price
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      1 Lot Cost
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      Risk / Lot
                    </th>
                    <th className="py-2 pl-3 font-medium text-right">
                      Calculated Lots
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono tabular-nums">
                  {indexMatrixRows.map((row) => (
                    <tr
                      key={row.item.symbol}
                      onClick={() => {
                        setCalcSymbol(row.item.symbol);
                        setManualOptionLtp('');
                      }}
                      className={`cursor-pointer transition-colors ${
                        calcSymbol === row.item.symbol
                          ? 'bg-blue-50/50 dark:bg-blue-500/10'
                          : 'hover:bg-slate-50 dark:hover:bg-[#141B29]'
                      }`}
                    >
                      <td className="py-2.5 pr-3 font-sans font-semibold text-slate-900 dark:text-slate-100">
                        {row.item.label}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                        {row.lotSize}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-800 dark:text-slate-200">
                        ₹{row.optionPrice.toFixed(1)}{' '}
                        {row.isLive && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            LIVE
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                        {row.calc.capitalPerLotRupees !== null
                          ? formatINR(row.calc.capitalPerLotRupees, {
                              signed: false,
                              decimals: 0,
                            })
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-red-600 dark:text-red-400">
                        {formatINR(row.calc.riskPerLotRupees, {
                          signed: false,
                          decimals: 0,
                        })}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-semibold text-blue-700 dark:text-blue-400">
                        {row.calc.executableLots} lot
                        {row.calc.executableLots === 1 ? '' : 's'} (
                        {row.calc.executableLots * row.lotSize} qty)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
