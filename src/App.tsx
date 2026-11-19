import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { AuthPortal } from './components/AuthPortal';
import { BrandLogo } from './components/BrandLogo';
import { BrokersHubView } from './components/BrokersHubView';
import { CsvImportModal } from './components/CsvImportModal';
import { DashboardOverview } from './components/DashboardOverview';
import { EquityCurveChart } from './components/EquityCurveChart';
import { FyersLiveBar } from './components/FyersLiveBar';
import { ModificationGuide } from './components/ModificationGuide';
import { NeoAlgoCodeView } from './components/NeoAlgoCodeView';
import { NiftyChart } from './components/NiftyChart';
import { PaperCalendarView } from './components/PaperCalendarView';
import { StrategyControls } from './components/StrategyControls';
import { TelegramAlertsView } from './components/TelegramAlertsView';
import { TopBar, WorkspaceTab } from './components/TopBar';
import { TradeLedger } from './components/TradeLedger';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { YearlyBacktestView } from './components/YearlyBacktestView';
import { generatePythonNeoAlgo } from './engine/codeGenerator';
import {
  DEFAULT_STRATEGY_CONFIG,
  getScenarioPresets,
  runNiftyStrategy,
} from './engine/niftyStrategy';
import { FyersQuoteTick, useFyersLiveFeed } from './hooks/useFyersLiveFeed';
import {
  getTodayIstYYYYMMDD,
  tradeRecordsToPaperEntries,
  usePaperTradeJournal,
} from './hooks/usePaperTradeJournal';
import { useSaaSAuth } from './hooks/useSaaSAuth';
import { useTelegramAlerts } from './hooks/useTelegramAlerts';
import {
  Candle,
  PaperTradeEntry,
  SavedBacktestReport,
  ScenarioPreset,
  StrategyConfig,
  TradeRecord,
} from './types/strategy';

const SAVED_CONFIG_KEY = 'neoalgo_saved_strategy_config_v1';

function loadSavedStrategyConfig(userId?: string | null): StrategyConfig {
  try {
    const key = userId ? `${SAVED_CONFIG_KEY}_${userId}` : SAVED_CONFIG_KEY;
    const raw =
      window.localStorage.getItem(key) ||
      window.localStorage.getItem(SAVED_CONFIG_KEY);
    if (!raw) return DEFAULT_STRATEGY_CONFIG;
    const parsed = JSON.parse(raw) as Partial<StrategyConfig>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_STRATEGY_CONFIG;
    return { ...DEFAULT_STRATEGY_CONFIG, ...parsed };
  } catch {
    return DEFAULT_STRATEGY_CONFIG;
  }
}

export default function App() {
  const auth = useSaaSAuth();
  const userId = auth.user?.id ?? null;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [presets, setPresets] = useState<ScenarioPreset[]>(() =>
    getScenarioPresets()
  );
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<string>('today_bullish');
  const [savedConfig, setSavedConfig] = useState<StrategyConfig>(
    DEFAULT_STRATEGY_CONFIG
  );
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [serverSavedReports, setServerSavedReports] = useState<
    SavedBacktestReport[] | null
  >(null);
  const [justSavedConfig, setJustSavedConfig] = useState<boolean>(false);
  const saveTimerRef = useRef<number | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Per-user Paper Trade Monthly Calendar state (server-synced)
  const paperJournal = usePaperTradeJournal(userId);
  const [calendarFocusMonth, setCalendarFocusMonth] = useState<string | null>(
    null
  );
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(
    null
  );
  const [labCalendarFeedback, setLabCalendarFeedback] = useState<string | null>(
    null
  );

  // Hydrate per-user workspace from self-hosted SaaS backend when user signs in
  useEffect(() => {
    if (!userId) {
      setSavedConfig(DEFAULT_STRATEGY_CONFIG);
      setConfig(DEFAULT_STRATEGY_CONFIG);
      setServerSavedReports(null);
      setPresets(getScenarioPresets());
      setSelectedScenarioId('today_bullish');
      setLabCalendarFeedback(null);
      return;
    }

    let cancelled = false;
    const localFallback = loadSavedStrategyConfig(userId);
    setSavedConfig(localFallback);
    setConfig(localFallback);

    (async () => {
      try {
        const resp = await fetch('/api/user/workspace', {
          credentials: 'include',
        });
        if (!resp.ok || cancelled) return;
        const data = (await resp.json()) as {
          strategyConfig?: Partial<StrategyConfig> | null;
          paperTrades?: PaperTradeEntry[];
          savedReports?: SavedBacktestReport[];
        };
        if (cancelled) return;

        if (data.strategyConfig && typeof data.strategyConfig === 'object') {
          const merged = { ...DEFAULT_STRATEGY_CONFIG, ...data.strategyConfig };
          setSavedConfig(merged);
          setConfig(merged);
          try {
            window.localStorage.setItem(
              `${SAVED_CONFIG_KEY}_${userId}`,
              JSON.stringify(merged)
            );
          } catch {
            // ignore
          }
        }
        paperJournal.hydrateFromServer(data.paperTrades ?? []);
        setServerSavedReports(
          Array.isArray(data.savedReports) ? data.savedReports : []
        );
      } catch {
        // Keep local fallback if offline
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const hasUnsavedConfig = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig]
  );

  const handleSaveConfig = () => {
    try {
      const key = userId ? `${SAVED_CONFIG_KEY}_${userId}` : SAVED_CONFIG_KEY;
      window.localStorage.setItem(key, JSON.stringify(config));
    } catch {
      // Ignore storage quota errors
    }
    if (userId) {
      void fetch('/api/user/strategy-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config }),
      }).catch(() => {
        // Ignore network error; local copy saved
      });
    }
    setSavedConfig(config);
    setJustSavedConfig(true);
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      setJustSavedConfig(false);
    }, 2200);
  };

  const handleDiscardConfig = () => {
    setConfig(savedConfig);
    setJustSavedConfig(false);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Replay controls state
  const activeScenario = useMemo(
    () => presets.find((p) => p.id === selectedScenarioId) ?? presets[0],
    [presets, selectedScenarioId]
  );

  const [replayCount, setReplayCount] = useState<number>(
    activeScenario.candles.length
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [animateFormation, setAnimateFormation] = useState<boolean>(true);
  const [formationSubStep, setFormationSubStep] = useState<number>(4);

  const handleSelectScenario = (scenarioId: string) => {
    const next = presets.find((p) => p.id === scenarioId);
    setSelectedScenarioId(scenarioId);
    setSelectedTradeId(null);
    setLabCalendarFeedback(null);
    setIsPlaying(false);
    if (next) {
      setReplayCount(
        activeTab === 'replay'
          ? Math.min(4, next.candles.length)
          : next.candles.length
      );
    }
  };

  const handleSelectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    setIsPlaying(false);
    if (tab === 'lab') {
      setReplayCount(activeScenario.candles.length);
    } else if (tab === 'replay' && replayCount >= activeScenario.candles.length) {
      setReplayCount(Math.min(4, activeScenario.candles.length));
    }
  };

  const handleOpenCalendar = (
    month?: string | null,
    date?: string | null
  ) => {
    setCalendarFocusMonth(month ?? (date ? date.slice(0, 7) : null));
    setCalendarFocusDate(date ?? null);
    setActiveTab('calendar');
  };

  useEffect(() => {
    if (!isPlaying) return;
    if (
      replayCount >= activeScenario.candles.length &&
      (!animateFormation || formationSubStep >= 4)
    ) {
      setIsPlaying(false);
      return;
    }

    if (animateFormation) {
      const timer = window.setInterval(() => {
        setFormationSubStep((step) => {
          if (step < 4) return step + 1;
          setReplayCount((prev) => {
            if (prev >= activeScenario.candles.length) {
              setIsPlaying(false);
              return prev;
            }
            return prev + 1;
          });
          return 1;
        });
      }, 240);
      return () => window.clearInterval(timer);
    }

    const timer = window.setInterval(() => {
      setReplayCount((prev) => {
        if (prev >= activeScenario.candles.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [
    isPlaying,
    replayCount,
    activeScenario.candles.length,
    animateFormation,
    formationSubStep,
  ]);

  const effectiveCandleCount =
    activeTab === 'replay' ? replayCount : activeScenario.candles.length;

  const effectiveCandles = useMemo(() => {
    const sliced = activeScenario.candles.slice(0, effectiveCandleCount);
    if (
      activeTab !== 'replay' ||
      !animateFormation ||
      formationSubStep >= 4 ||
      sliced.length === 0
    ) {
      return sliced;
    }
    const copy = [...sliced];
    const target = copy[copy.length - 1];
    const isBull = target.close >= target.open;
    const firstExtreme = isBull ? target.low : target.high;
    const secondExtreme = isBull ? target.high : target.low;
    const midPrice =
      Math.round(((target.open + secondExtreme) / 2) * 100) / 100;

    if (formationSubStep === 1) {
      copy[copy.length - 1] = {
        ...target,
        high: Math.max(target.open, firstExtreme),
        low: Math.min(target.open, firstExtreme),
        close: firstExtreme,
        volume: Math.round(target.volume * 0.25),
      };
    } else if (formationSubStep === 2) {
      copy[copy.length - 1] = {
        ...target,
        high: Math.max(target.open, firstExtreme, midPrice),
        low: Math.min(target.open, firstExtreme, midPrice),
        close: midPrice,
        volume: Math.round(target.volume * 0.55),
      };
    } else if (formationSubStep === 3) {
      copy[copy.length - 1] = {
        ...target,
        high: target.high,
        low: target.low,
        close: secondExtreme,
        volume: Math.round(target.volume * 0.85),
      };
    }
    return copy;
  }, [
    activeScenario.candles,
    effectiveCandleCount,
    activeTab,
    animateFormation,
    formationSubStep,
  ]);

  const result = useMemo(
    () => runNiftyStrategy(effectiveCandles, config),
    [effectiveCandles, config]
  );

  const lastCandle =
    result.candles.length > 0
      ? result.candles[result.candles.length - 1]
      : null;

  const handleDownloadPython = () => {
    const pyCode = generatePythonNeoAlgo(config);
    const blob = new Blob([pyCode], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'neo_nifty_4candle_rsi2.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCandles = (candles: Candle[], name: string) => {
    const customId = `custom_${Date.now()}`;
    const customPreset: ScenarioPreset = {
      id: customId,
      name,
      subtitle: `${candles.length} imported 5-min bars · Custom Fyers/CSV session`,
      dateLabel: 'Custom Data',
      candles,
    };
    setPresets((prev) => [...prev, customPreset]);
    setSelectedScenarioId(customId);
    setSelectedTradeId(null);
    setIsPlaying(false);
    setReplayCount(candles.length);
    setActiveTab('lab');
  };

  const handleLoadFyersCandles = (
    candles: Candle[],
    label: string,
    subtitle: string
  ) => {
    const liveId = 'fyers_live';
    const nextPreset: ScenarioPreset = {
      id: liveId,
      name: label,
      subtitle,
      dateLabel: 'Fyers Live',
      candles,
    };
    setPresets((prev) => {
      const idx = prev.findIndex((p) => p.id === liveId);
      if (idx === -1) return [...prev, nextPreset];
      const copy = [...prev];
      copy[idx] = nextPreset;
      return copy;
    });
    setSelectedScenarioId(liveId);
    setSelectedTradeId(null);
    setIsPlaying(false);
    setReplayCount(candles.length);
    setActiveTab('lab');
  };

  const handleHistorySync = (
    candles: Candle[],
    symbol: string,
    date: string
  ) => {
    const liveId = 'fyers_live';
    setPresets((prev) => {
      const idx = prev.findIndex((p) => p.id === liveId);
      const existing = idx !== -1 ? prev[idx] : null;
      const merged = [...candles];
      if (existing && existing.candles.length > 0 && merged.length > 0) {
        const prevLast = existing.candles[existing.candles.length - 1];
        const nextLast = merged[merged.length - 1];
        if (prevLast.time === nextLast.time && prevLast.date === nextLast.date) {
          merged[merged.length - 1] = {
            ...nextLast,
            high: Math.max(nextLast.high, prevLast.high),
            low: Math.min(nextLast.low, prevLast.low),
            close: prevLast.close,
          };
        }
      }
      const updated: ScenarioPreset = {
        id: liveId,
        name: `Fyers Live: ${symbol}`,
        subtitle: `${merged.length} synced 5-min bars from Fyers (${date})`,
        dateLabel: 'Fyers Live',
        candles: merged,
      };
      if (idx === -1) return [...prev, updated];
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });
    setSelectedScenarioId(liveId);
    setReplayCount(candles.length);
  };

  const handleLiveFyersTick = (tick: FyersQuoteTick, symbol: string) => {
    if (!tick.ltp || !tick.istTime) return;
    const [hhStr, mmStr] = tick.istTime.split(':');
    const hh = Number(hhStr);
    const mm = Number(mmStr);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const mins = hh * 60 + mm;
    if (mins < 9 * 60 + 15 || mins > 15 * 60 + 29) return;

    const bucketMin = Math.floor(mm / 5) * 5;
    const bucketTime = `${String(hh).padStart(2, '0')}:${String(
      bucketMin
    ).padStart(2, '0')}`;
    const liveId = 'fyers_live';
    const istDate =
      tick.istDate ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(tick.epoch * 1000));

    setPresets((prev) => {
      const idx = prev.findIndex((p) => p.id === liveId);
      const existing = idx !== -1 ? prev[idx] : null;
      const prevCandles = existing ? [...existing.candles] : [];
      const last = prevCandles[prevCandles.length - 1];

      if (last && last.time === bucketTime) {
        prevCandles[prevCandles.length - 1] = {
          ...last,
          high: Math.max(last.high, tick.ltp),
          low: Math.min(last.low, tick.ltp),
          close: tick.ltp,
          volume: tick.volume || last.volume,
        };
      } else if (!last || bucketTime > last.time) {
        prevCandles.push({
          index: prevCandles.length,
          date: last?.date || istDate,
          time: bucketTime,
          open: tick.ltp,
          high: tick.ltp,
          low: tick.ltp,
          close: tick.ltp,
          volume: tick.volume || 0,
        });
      }

      const updated: ScenarioPreset = {
        id: liveId,
        name: `Fyers Live: ${symbol}`,
        subtitle: `Live feed · Last tick ${tick.ltp.toFixed(2)} @ ${
          tick.istTimeSec || tick.istTime
        } IST`,
        dateLabel: 'Fyers Live',
        candles: prevCandles,
      };
      if (idx === -1) return [...prev, updated];
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });
    setSelectedScenarioId(liveId);
  };

  // Root-level Fyers live feed controller bound to current SaaS user
  const fyersFeed = useFyersLiveFeed({
    authUserId: userId,
    onLoadCandles: handleLoadFyersCandles,
    onLiveTick: handleLiveFyersTick,
    onHistorySync: handleHistorySync,
  });

  // Root-level Telegram alerts dispatcher monitoring Fyers live session across all tabs
  const liveFyersCandles = useMemo(
    () => presets.find((p) => p.id === 'fyers_live')?.candles ?? [],
    [presets]
  );

  const telegramAlerts = useTelegramAlerts({
    userId,
    isLiveStreaming: fyersFeed.isStreaming,
    liveCandles: liveFyersCandles,
    activeSymbol: fyersFeed.activeSymbol,
    strategyConfig: config,
  });

  const handleSignOut = async () => {
    fyersFeed.stopStream();
    await auth.logout();
    setActiveTab('dashboard');
  };

  // Paper Trade Calendar save handlers
  const resolveSessionFallbackDate = () => {
    const firstDated = effectiveCandles.find(
      (c) => c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date)
    );
    return firstDated?.date || getTodayIstYYYYMMDD();
  };

  const resolveSessionSymbol = () => {
    if (selectedScenarioId === 'fyers_live') return fyersFeed.activeSymbol;
    return 'NSE:NIFTY50-INDEX';
  };

  const handleSaveLabSessionToCalendar = () => {
    if (result.trades.length === 0) return;
    const fallbackDate = resolveSessionFallbackDate();
    const entries = tradeRecordsToPaperEntries(result.trades, {
      symbol: resolveSessionSymbol(),
      fallbackDate,
      source:
        selectedScenarioId === 'fyers_live' ? 'LIVE_SESSION' : 'STRATEGY_LAB',
      batchLabel: activeScenario.name,
      config,
    });
    const outcome = paperJournal.saveEntries(entries);
    setCalendarFocusMonth(outcome.latestMonth);
    setCalendarFocusDate(fallbackDate);
    setLabCalendarFeedback(
      outcome.added > 0
        ? `Saved ${outcome.added} paper trade${
            outcome.added === 1 ? '' : 's'
          } (${fallbackDate}) to Monthly Paper Calendar${
            outcome.skippedDuplicates > 0
              ? ` (${outcome.skippedDuplicates} duplicates skipped)`
              : ''
          }.`
        : `All ${outcome.skippedDuplicates} trades from this session are already in your Monthly Paper Calendar.`
    );
  };

  const handleSaveSingleLabTradeToCalendar = (trade: TradeRecord) => {
    const fallbackDate = trade.date || resolveSessionFallbackDate();
    const entries = tradeRecordsToPaperEntries([trade], {
      symbol: resolveSessionSymbol(),
      fallbackDate,
      source:
        selectedScenarioId === 'fyers_live' ? 'LIVE_SESSION' : 'STRATEGY_LAB',
      batchLabel: activeScenario.name,
      config,
    });
    const outcome = paperJournal.saveEntries(entries);
    setCalendarFocusMonth(outcome.latestMonth);
    setCalendarFocusDate(fallbackDate);
    setLabCalendarFeedback(
      outcome.added > 0
        ? `Saved Trade #${trade.id} (${trade.direction} @ ${trade.entryPrice.toFixed(
            2
          )}) to ${fallbackDate} in Paper Calendar.`
        : `Trade #${trade.id} is already saved in your Monthly Paper Calendar.`
    );
  };

  const stageLabel = useMemo(() => {
    if (!lastCandle) return 'Awaiting Data';
    switch (lastCandle.stageAtClose) {
      case 'EVALUATING_SET':
        return `Evaluating Set ${lastCandle.setNumber} (${lastCandle.positionInSet}/${config.setSize})`;
      case 'WAITING_RSI_ZONE':
        return result.finalBias === 'BULLISH'
          ? `Bullish Bias · Waiting RSI(${config.rsiLength}) < ${config.rsiBuyThreshold}`
          : `Bearish Bias · Waiting RSI(${config.rsiLength}) > ${config.rsiSellThreshold}`;
      case 'SETUP_ARMED':
        return `Armed ${lastCandle.armedDirection} Breakout @ ${lastCandle.armedTriggerLevel?.toFixed(
          2
        )}`;
      case 'IN_TRADE':
        return `Position Active · Strict ${config.stopLossPoints}pt SL`;
      case 'SL_TRAILED_TO_COST':
        return '1:1 Reached · SL Trailed to Cost';
      case 'COMPLETED_DAY':
        return 'Session Square-Off Complete';
    }
  }, [lastCandle, config, result.finalBias]);

  // Initial session check splash
  if (auth.loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6">
        <BrandLogo size="md" showSubtitle />
        <p className="text-xs text-slate-500">
          Restoring your NeoAlgo workspace...
        </p>
      </div>
    );
  }

  // Multi-user SaaS Authentication Gate
  if (!auth.user) {
    return <AuthPortal auth={auth} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <WorkspaceSidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        user={auth.user}
        onSignOut={() => void handleSignOut()}
        fyersFeed={fyersFeed}
        config={config}
        paperTradeCount={paperJournal.entries.length}
        telegramActiveCount={
          telegramAlerts.isArmedForLive
            ? telegramAlerts.activeDestinationCount
            : 0
        }
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <TopBar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          onDownloadPython={handleDownloadPython}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          isLiveStreaming={fyersFeed.isStreaming}
          liveTick={fyersFeed.latestQuote}
          onStopLiveStream={fyersFeed.stopStream}
        />

        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
          {activeTab === 'dashboard' && (
            <DashboardOverview
              config={config}
              labResult={result}
              labScenarioName={activeScenario.name}
              journal={paperJournal}
              fyersFeed={fyersFeed}
              onNavigate={handleSelectTab}
              onOpenCalendarDate={(date) =>
                handleOpenCalendar(date.slice(0, 7), date)
              }
              onSaveLabSessionToCalendar={() => {
                handleSaveLabSessionToCalendar();
                setActiveTab('calendar');
              }}
            />
          )}

          {(activeTab === 'lab' || activeTab === 'replay') && (
            <>
              {/* Header & Scenario Bar */}
              <section className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                    NIFTY 5m 4-Candle Bias &amp; RSI({config.rsiLength}) Strategy
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    {activeScenario.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                    {presets.map((preset) => {
                      const isSelected = preset.id === activeScenario.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectScenario(preset.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                            isSelected
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsImportOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Import CSV</span>
                  </button>
                </div>
              </section>

              {/* Fyers API v3 Live Connection & Streaming Bar */}
              <FyersLiveBar
                feed={fyersFeed}
                isLiveModeActive={selectedScenarioId === 'fyers_live'}
              />

              {/* 4-Column Full-Width KPI Strip */}
              <section
                aria-label="Session Performance Summary"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
              >
                <div className="px-5 py-4">
                  <div className="text-xs font-medium text-slate-500">
                    Net Session P&amp;L
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2.5">
                    <span
                      className={`font-mono tabular-nums text-2xl font-bold ${
                        result.metrics.netPoints > 0
                          ? 'text-emerald-700'
                          : result.metrics.netPoints < 0
                          ? 'text-red-600'
                          : 'text-slate-900'
                      }`}
                    >
                      {result.metrics.netPoints >= 0 ? '+' : ''}
                      {result.metrics.netPoints.toFixed(1)} pts
                    </span>
                    <span className="font-mono tabular-nums text-xs text-slate-500">
                      ({result.metrics.netRupees >= 0 ? '+₹' : '-₹'}
                      {Math.abs(result.metrics.netRupees).toLocaleString(
                        'en-IN',
                        {
                          maximumFractionDigits: 0,
                        }
                      )}
                      )
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs font-medium text-slate-500">
                    4-Candle Session Bias
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2.5">
                    <span
                      className={`font-display text-xl font-bold ${
                        result.finalBias === 'BULLISH'
                          ? 'text-emerald-700'
                          : result.finalBias === 'BEARISH'
                          ? 'text-red-600'
                          : 'text-slate-700'
                      }`}
                    >
                      {result.finalBias === 'PENDING'
                        ? 'Undecided'
                        : result.finalBias === 'BULLISH'
                        ? 'Bullish (Long)'
                        : 'Bearish (Short)'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {result.biasDecidedSet
                        ? `Set #${result.biasDecidedSet} @ ${result.biasDecidedTime}`
                        : `${result.metrics.setsSkipped} skipped`}
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs font-medium text-slate-500">
                    Trades &amp; Win Rate
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2.5">
                    <span className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                      {result.metrics.wins}W / {result.metrics.losses}L
                      {result.metrics.breakevens > 0
                        ? ` / ${result.metrics.breakevens}BE`
                        : ''}
                    </span>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      PF {result.metrics.profitFactor.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs font-medium text-slate-500">
                    Engine State
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-slate-900 truncate">
                    {stageLabel}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                    Sets Evaluated: {result.metrics.setsEvaluated} · Skipped:{' '}
                    {result.metrics.setsSkipped}
                  </div>
                </div>
              </section>

              {/* Interactive Candle Replay Toolbar */}
              {activeTab === 'replay' && (
                <section className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPlaying((p) => !p)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Play 5m Replay</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setFormationSubStep(4);
                        setReplayCount((c) => Math.max(1, c - 1));
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                    >
                      <ChevronLeft
                        className="w-3.5 h-3.5"
                        aria-hidden="true"
                      />
                      <span>Prev</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setFormationSubStep(4);
                        setReplayCount((c) =>
                          Math.min(activeScenario.candles.length, c + 1)
                        );
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                    >
                      <span>Step 5m</span>
                      <ChevronRight
                        className="w-3.5 h-3.5"
                        aria-hidden="true"
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setFormationSubStep(4);
                        setReplayCount(1);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Restart</span>
                    </button>

                    <label className="inline-flex items-center gap-1.5 ml-1 text-xs text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={animateFormation}
                        onChange={(e) => {
                          setAnimateFormation(e.target.checked);
                          setFormationSubStep(4);
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                      <span>Animate Candle Formation</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-md">
                    <input
                      type="range"
                      min={1}
                      max={activeScenario.candles.length}
                      value={replayCount}
                      onChange={(e) => {
                        setIsPlaying(false);
                        setFormationSubStep(4);
                        setReplayCount(Number(e.target.value));
                      }}
                      aria-label="Replay candle position"
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                    <span className="font-mono tabular-nums text-xs font-semibold text-slate-700 whitespace-nowrap">
                      Bar {replayCount} / {activeScenario.candles.length} (
                      {lastCandle?.time ?? '--'})
                    </span>
                  </div>
                </section>
              )}

              {/* Main 2-Column Analytical Grid */}
              <section className="grid grid-cols-1 xl:grid-cols-[1fr_310px] gap-6 items-start">
                <div className="space-y-6 min-w-0">
                  <NiftyChart
                    result={result}
                    totalCandlesInScenario={activeScenario.candles.length}
                    config={config}
                    selectedTradeId={selectedTradeId}
                    onSelectTrade={setSelectedTradeId}
                    scenarioKey={`${activeScenario.id}:${activeTab}`}
                    symbolLabel={activeScenario.name}
                    isLiveStreaming={
                      fyersFeed.isStreaming &&
                      selectedScenarioId === 'fyers_live'
                    }
                    liveTick={fyersFeed.latestQuote}
                    isFormingCandle={
                      activeTab === 'replay' &&
                      isPlaying &&
                      animateFormation &&
                      formationSubStep < 4
                    }
                  />

                  <EquityCurveChart result={result} config={config} />

                  <TradeLedger
                    result={result}
                    config={config}
                    selectedTradeId={selectedTradeId}
                    onSelectTrade={setSelectedTradeId}
                    onSaveSessionToCalendar={handleSaveLabSessionToCalendar}
                    onSaveTradeToCalendar={handleSaveSingleLabTradeToCalendar}
                    calendarFeedback={labCalendarFeedback}
                    onOpenCalendar={() =>
                      handleOpenCalendar(calendarFocusMonth, calendarFocusDate)
                    }
                  />
                </div>

                <StrategyControls
                  config={config}
                  onChange={setConfig}
                  onResetDefaults={() => setConfig(DEFAULT_STRATEGY_CONFIG)}
                  hasUnsavedChanges={hasUnsavedConfig}
                  justSaved={justSavedConfig}
                  onSave={handleSaveConfig}
                  onDiscard={handleDiscardConfig}
                />
              </section>
            </>
          )}

          {activeTab === 'backtest1y' && (
            <YearlyBacktestView
              config={config}
              onChangeConfig={setConfig}
              onResetDefaults={() => setConfig(DEFAULT_STRATEGY_CONFIG)}
              hasUnsavedChanges={hasUnsavedConfig}
              justSaved={justSavedConfig}
              onSaveConfig={handleSaveConfig}
              onDiscardConfig={handleDiscardConfig}
              userId={userId}
              serverSavedReports={serverSavedReports}
              onSaveBacktestToCalendar={(trades, meta) => {
                const entries = tradeRecordsToPaperEntries(trades, {
                  symbol: meta.symbol,
                  fallbackDate: meta.toDate,
                  source: 'BACKTEST_1Y',
                  batchLabel: `${meta.symbol} (${meta.fromDate} → ${meta.toDate})`,
                  config: meta.config,
                });
                return paperJournal.saveEntries(entries);
              }}
              onSaveDayToCalendar={(trades, date, symbol, cfg) => {
                const entries = tradeRecordsToPaperEntries(trades, {
                  symbol,
                  fallbackDate: date,
                  source: 'BACKTEST_1Y',
                  batchLabel: `${symbol} · ${date}`,
                  config: cfg,
                });
                return paperJournal.saveEntries(entries);
              }}
              onOpenCalendar={(month, date) => handleOpenCalendar(month, date)}
              onInspectDay={(candles, date, symbol) => {
                handleLoadFyersCandles(
                  candles,
                  `${symbol} · ${date}`,
                  `${candles.length} real 5-min bars from ${date} (1-Year Backtest Drill-Down)`
                );
              }}
            />
          )}

          {activeTab === 'calendar' && (
            <PaperCalendarView
              journal={paperJournal}
              config={config}
              initialFocusMonth={calendarFocusMonth}
              initialFocusDate={calendarFocusDate}
              onGoToBacktest={() => handleSelectTab('backtest1y')}
              onGoToLab={() => handleSelectTab('lab')}
              onSaveCurrentLabSession={handleSaveLabSessionToCalendar}
              currentLabTradesCount={result.trades.length}
            />
          )}

          {activeTab === 'brokers' && (
            <BrokersHubView
              user={auth.user}
              fyersFeed={fyersFeed}
              onGoToLab={() => handleSelectTab('lab')}
            />
          )}

          {activeTab === 'alerts' && (
            <TelegramAlertsView
              telegram={telegramAlerts}
              strategyConfig={config}
              isLiveStreaming={fyersFeed.isStreaming}
              activeSymbol={fyersFeed.activeSymbol}
              onGoToLab={() => handleSelectTab('lab')}
            />
          )}

          {activeTab === 'code' && (
            <NeoAlgoCodeView
              config={config}
              onDownloadPython={handleDownloadPython}
            />
          )}

          {activeTab === 'guide' && (
            <ModificationGuide
              config={config}
              onJumpToCode={() => setActiveTab('code')}
            />
          )}
        </main>

        <footer className="border-t border-slate-200 bg-white mt-10">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <span>
              NeoAlgo Quantitative Desk · NSE NIFTY 5m 4-Candle &amp; Wilder
              RSI({config.rsiLength})
            </span>
            <span>
              Signed in as {auth.user.email} · Verify paper calendar logs before
              enabling live broker orders
            </span>
          </div>
        </footer>
      </div>

      <CsvImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImportCandles}
      />
    </div>
  );
}
