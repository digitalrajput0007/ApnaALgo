import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Pause,
  Play,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { AuthPortal } from './components/AuthPortal';
import { BrandLogo } from './components/BrandLogo';
import { CsvImportModal } from './components/CsvImportModal';
import { DashboardOverview } from './components/DashboardOverview';
import { EquityCurveChart } from './components/EquityCurveChart';
import { FyersLiveBar } from './components/FyersLiveBar';
import {
  IntegrationsSubTab,
  IntegrationsView,
} from './components/IntegrationsView';
import { NiftyChart } from './components/NiftyChart';
import { PaperCalendarView } from './components/PaperCalendarView';
import { SettingsSection, SettingsView } from './components/SettingsView';
import { StrategyControls } from './components/StrategyControls';
import { TopBar, WorkspaceTab } from './components/TopBar';
import { TradeLedger } from './components/TradeLedger';
import { TradesPositionsJournalView } from './components/TradesPositionsJournalView';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { YearlyBacktestView } from './components/YearlyBacktestView';
import { generatePythonNeoAlgo } from './engine/codeGenerator';
import {
  DEFAULT_STRATEGY_CONFIG,
  getScenarioPresets,
  runNiftyStrategy,
} from './engine/niftyStrategy';
import { FyersQuoteTick, useFyersLiveFeed } from './hooks/useFyersLiveFeed';
import { useOrderPositionJournal } from './hooks/useOrderPositionJournal';
import {
  getTodayIstYYYYMMDD,
  tradeRecordsToPaperEntries,
  usePaperTradeJournal,
} from './hooks/usePaperTradeJournal';
import { useSaaSAuth } from './hooks/useSaaSAuth';
import { useTelegramAlerts } from './hooks/useTelegramAlerts';
import {
  Candle,
  OrderJournalPayload,
  PaperTradeEntry,
  SavedBacktestReport,
  ScenarioPreset,
  StrategyConfig,
  TradeRecord,
} from './types/strategy';

class ChartErrorBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { resetKey: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidUpdate(prevProps: { resetKey: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <div className="text-sm font-semibold text-slate-900">
            Chart view reset after rapid date change
          </div>
          <p className="text-xs text-slate-500">
            Click reload chart below to re-render the current 5-minute session.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            Reload Chart
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const [labMode, setLabMode] = useState<'analysis' | 'replay'>('analysis');
  const [integrationsSubTab, setIntegrationsSubTab] =
    useState<IntegrationsSubTab>('brokers');
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>('profile');
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
  const [copiedRecoveryBanner, setCopiedRecoveryBanner] = useState(false);

  // Per-user Paper Trade Monthly Calendar & Trades/Positions Journal state (server-synced)
  const paperJournal = usePaperTradeJournal(userId);
  const orderJournal = useOrderPositionJournal(userId);
  const lastLiveJournalSyncSigRef = useRef<string>('');
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
          orderJournal?: Partial<OrderJournalPayload> | null;
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
        orderJournal.hydrateFromServer(data.orderJournal ?? null);
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
    toast.success('Strategy parameters saved.');
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

  // Active scenario & replay state
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
        labMode === 'replay'
          ? Math.min(4, next.candles.length)
          : next.candles.length
      );
    }
  };

  const handleSwitchLabMode = (nextMode: 'analysis' | 'replay') => {
    setLabMode(nextMode);
    setIsPlaying(false);
    if (nextMode === 'analysis') {
      setReplayCount(activeScenario.candles.length);
    } else if (replayCount >= activeScenario.candles.length) {
      setReplayCount(Math.min(4, activeScenario.candles.length));
    }
  };

  const handleSelectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    setIsPlaying(false);
  };

  const handleOpenSettingsSection = (sec: SettingsSection) => {
    setSettingsSection(sec);
    setActiveTab('settings');
    setIsPlaying(false);
  };

  const handleOpenIntegrationsTab = (sub: IntegrationsSubTab) => {
    setIntegrationsSubTab(sub);
    setActiveTab('integrations');
    setIsPlaying(false);
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

  const isReplayActive = activeTab === 'lab' && labMode === 'replay';
  const effectiveCandleCount = isReplayActive
    ? replayCount
    : activeScenario.candles.length;

  const effectiveCandles = useMemo(() => {
    const sliced = activeScenario.candles.slice(0, effectiveCandleCount);
    if (
      !isReplayActive ||
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
    isReplayActive,
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
    toast.success('Exported neo_nifty_4candle_rsi2.py');
  };

  const handleImportCandles = (candles: Candle[], name: string) => {
    const customId = `custom_${Date.now()}`;
    const customPreset: ScenarioPreset = {
      id: customId,
      name,
      subtitle: `${candles.length} imported 5-min bars · Custom CSV session`,
      dateLabel: 'Custom Data',
      candles,
    };
    setPresets((prev) => [...prev, customPreset]);
    setSelectedScenarioId(customId);
    setSelectedTradeId(null);
    setIsPlaying(false);
    setLabMode('analysis');
    setReplayCount(candles.length);
    setActiveTab('lab');
    toast.success(`Imported ${candles.length} bars.`);
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
    setLabMode('analysis');
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
        subtitle: `${merged.length} synced 5-min bars (${date})`,
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

  const connectedIntegrationsCount =
    (fyersFeed.status?.authenticated ? 1 : 0) +
    (telegramAlerts.isArmedForLive ? 1 : 0);

  const handleSignOut = async () => {
    fyersFeed.stopStream();
    await auth.logout();
    setActiveTab('dashboard');
    toast.success('Signed out.');
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
    const msg =
      outcome.added > 0
        ? `Saved ${outcome.added} paper trade${
            outcome.added === 1 ? '' : 's'
          } (${fallbackDate}) to Paper Journal.`
        : `All ${outcome.skippedDuplicates} trades from this session are already in your Paper Journal.`;
    setLabCalendarFeedback(msg);
    toast.success(msg);
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
    const msg =
      outcome.added > 0
        ? `Saved Trade #${trade.id} to ${fallbackDate} in Paper Journal.`
        : `Trade #${trade.id} is already saved in your Paper Journal.`;
    setLabCalendarFeedback(msg);
    toast.success(msg);
  };

  // Record Strategy Lab orders & positions into Trades & Positions Journal
  const handleRecordLabOrdersAndPositions = () => {
    if (result.trades.length === 0) return;
    const fallbackDate = resolveSessionFallbackDate();
    const latestPrice =
      selectedScenarioId === 'fyers_live' && fyersFeed.latestQuote
        ? fyersFeed.latestQuote.ltp
        : lastCandle?.close ?? null;

    const outcome = orderJournal.recordSession(result.trades, {
      symbol: resolveSessionSymbol(),
      fallbackDate,
      latestPrice,
      source:
        selectedScenarioId === 'fyers_live' ? 'LIVE_SESSION' : 'STRATEGY_LAB',
      sessionLabel: activeScenario.name,
      config,
    });
    toast.success(
      `Recorded ${outcome.positionsUpserted} position${
        outcome.positionsUpserted === 1 ? '' : 's'
      } & ${outcome.ordersUpserted} order${
        outcome.ordersUpserted === 1 ? '' : 's'
      } to Trades & Positions Journal.`
    );
  };

  // Auto-record orders & positions whenever live Fyers streaming produces or updates Strategy Lab trades
  useEffect(() => {
    if (!userId || !fyersFeed.isStreaming || liveFyersCandles.length === 0) {
      return;
    }
    const liveEval = runNiftyStrategy(liveFyersCandles, config);
    if (liveEval.trades.length === 0) return;

    const fallbackDate =
      liveFyersCandles.find((c) => c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date))
        ?.date || getTodayIstYYYYMMDD();
    const latestPrice =
      fyersFeed.latestQuote?.ltp ??
      liveFyersCandles[liveFyersCandles.length - 1]?.close ??
      null;

    // Signature prevents redundant network writes on unchanged ticks while syncing every trade state transition
    const sig = liveEval.trades
      .map(
        (t) =>
          `${t.id}:${t.entryPrice}:${t.trailedToCost}:${t.exitReason}:${
            t.exitPrice ?? (latestPrice !== null ? Math.round(latestPrice) : '')
          }`
      )
      .join('|');
    const fullSig = `${fallbackDate}|${fyersFeed.activeSymbol}|${sig}`;
    if (fullSig === lastLiveJournalSyncSigRef.current) return;
    lastLiveJournalSyncSigRef.current = fullSig;

    orderJournal.recordSession(liveEval.trades, {
      symbol: fyersFeed.activeSymbol,
      fallbackDate,
      latestPrice,
      source: 'LIVE_SESSION',
      sessionLabel: `Fyers Live: ${fyersFeed.activeSymbol}`,
      config,
    });
  }, [
    userId,
    fyersFeed.isStreaming,
    fyersFeed.activeSymbol,
    fyersFeed.latestQuote?.ltp,
    liveFyersCandles,
    config,
    orderJournal,
  ]);

  const stageLabel = useMemo(() => {
    if (!lastCandle) return 'Awaiting Data';
    switch (lastCandle.stageAtClose) {
      case 'EVALUATING_SET':
        return `Evaluating Set ${lastCandle.setNumber} (${lastCandle.positionInSet}/${config.setSize})`;
      case 'WAITING_RSI_ZONE':
        return result.finalBias === 'BULLISH'
          ? `Bullish · Waiting RSI(${config.rsiLength}) < ${config.rsiBuyThreshold}`
          : `Bearish · Waiting RSI(${config.rsiLength}) > ${config.rsiSellThreshold}`;
      case 'SETUP_ARMED':
        return `Armed ${lastCandle.armedDirection} @ ${lastCandle.armedTriggerLevel?.toFixed(
          2
        )}`;
      case 'IN_TRADE':
        return `Position Active · ${config.stopLossPoints}pt SL`;
      case 'SL_TRAILED_TO_COST':
        return '1:1 Reached · SL at Cost';
      case 'COMPLETED_DAY':
        return 'Session Complete';
    }
  }, [lastCandle, config, result.finalBias]);

  // Initial session check splash
  if (auth.loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center gap-3 px-6">
        <BrandLogo size="md" />
        <p className="text-xs text-slate-400">Loading workspace...</p>
      </div>
    );
  }

  // Multi-user SaaS Authentication Gate
  if (!auth.user) {
    return (
      <>
        <Toaster position="bottom-right" richColors />
        <AuthPortal auth={auth} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900 flex">
      <Toaster position="bottom-right" richColors />

      <WorkspaceSidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        user={auth.user}
        onSignOut={() => void handleSignOut()}
        fyersFeed={fyersFeed}
        paperTradeCount={paperJournal.entries.length}
        journalPositionCount={orderJournal.positions.length}
        connectedIntegrationsCount={connectedIntegrationsCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <TopBar
          activeTab={activeTab}
          user={auth.user}
          onSelectTab={handleSelectTab}
          onOpenSettingsSection={handleOpenSettingsSection}
          onSignOut={() => void handleSignOut()}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          isLiveStreaming={fyersFeed.isStreaming}
          liveTick={fyersFeed.latestQuote}
          onStopLiveStream={fyersFeed.stopStream}
        />

        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* One-time Recovery Key Banner shown right after registration or key-based reset */}
          {auth.pendingRecoveryKeyBanner && (
            <section className="bg-white border border-blue-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
              <div className="flex items-start gap-3 min-w-0">
                <KeyRound
                  className="w-4 h-4 text-blue-600 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-slate-900">
                    Save your account Recovery Key
                  </div>
                  <p className="text-slate-600">
                    Store this key somewhere safe — you can use it to recover
                    your password from the Sign In screen:{' '}
                    <code className="font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded select-all">
                      {auth.pendingRecoveryKeyBanner}
                    </code>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        auth.pendingRecoveryKeyBanner!
                      );
                      setCopiedRecoveryBanner(true);
                      toast.success('Recovery key copied.');
                      setTimeout(() => setCopiedRecoveryBanner(false), 1800);
                    } catch {
                      toast.error('Copy failed.');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  {copiedRecoveryBanner ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedRecoveryBanner ? 'Copied' : 'Copy key'}</span>
                </button>
                <button
                  type="button"
                  onClick={auth.dismissRecoveryKeyBanner}
                  aria-label="Dismiss recovery key notice"
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </section>
          )}

          {activeTab === 'dashboard' && (
            <DashboardOverview
              user={auth.user}
              config={config}
              labResult={result}
              labScenarioName={activeScenario.name}
              journal={paperJournal}
              fyersFeed={fyersFeed}
              telegram={telegramAlerts}
              onNavigate={handleSelectTab}
              onOpenIntegrationsTab={handleOpenIntegrationsTab}
              onOpenCalendarDate={(date) =>
                handleOpenCalendar(date.slice(0, 7), date)
              }
              onSaveLabSessionToCalendar={() => {
                handleSaveLabSessionToCalendar();
                setActiveTab('calendar');
              }}
            />
          )}

          {activeTab === 'lab' && (
            <>
              {/* Unified Strategy Lab & Replay Header */}
              <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
                    Strategy Lab
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {activeScenario.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Live Analysis vs Bar Replay Switch */}
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                    <button
                      type="button"
                      onClick={() => handleSwitchLabMode('analysis')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        labMode === 'analysis'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Live &amp; Analysis
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchLabMode('replay')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        labMode === 'replay'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Bar Replay
                    </button>
                  </div>

                  {/* Compact Scenario Selector */}
                  <select
                    value={activeScenario.id}
                    onChange={(e) => handleSelectScenario(e.target.value)}
                    aria-label="Select trading session"
                    className="px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setIsImportOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Import CSV</span>
                  </button>
                </div>
              </header>

              {/* Streamlined Fyers Market Feed Bar */}
              <FyersLiveBar
                feed={fyersFeed}
                isLiveModeActive={selectedScenarioId === 'fyers_live'}
                onOpenIntegrations={() => handleOpenIntegrationsTab('brokers')}
              />

              {/* 4-Column Session KPI Strip */}
              <section
                aria-label="Session Performance Summary"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80"
              >
                <div className="px-5 py-4">
                  <div className="text-xs text-slate-500">Session Net P&amp;L</div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span
                      className={`font-mono tabular-nums text-2xl font-semibold ${
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
                        { maximumFractionDigits: 0 }
                      )}
                      )
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs text-slate-500">Session Bias</div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span
                      className={`font-display text-lg font-semibold ${
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
                        ? 'Bullish'
                        : 'Bearish'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {result.biasDecidedSet
                        ? `Set #${result.biasDecidedSet} @ ${result.biasDecidedTime}`
                        : `${result.metrics.setsSkipped} skipped`}
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs text-slate-500">Trades &amp; PF</div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-mono tabular-nums text-2xl font-semibold text-slate-900">
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
                  <div className="text-xs text-slate-500">Engine State</div>
                  <div className="mt-1.5 text-sm font-semibold text-slate-900 truncate">
                    {stageLabel}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                    Sets: {result.metrics.setsEvaluated} · Skipped:{' '}
                    {result.metrics.setsSkipped}
                  </div>
                </div>
              </section>

              {/* Inline Replay Controls (only when Bar Replay mode is selected) */}
              {isReplayActive && (
                <section className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPlaying((p) => !p)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
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
                      <span>Next</span>
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
                      <span>Reset</span>
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
                      <span>Animate candle</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-3 flex-1 min-w-[200px] max-w-md">
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
                      className="w-full accent-slate-900 cursor-pointer"
                    />
                    <span className="font-mono tabular-nums text-xs font-medium text-slate-700 whitespace-nowrap">
                      {replayCount}/{activeScenario.candles.length} (
                      {lastCandle?.time ?? '--'})
                    </span>
                  </div>
                </section>
              )}

              {/* Chart & Strategy Controls Grid */}
              <section className="grid grid-cols-1 xl:grid-cols-[1fr_308px] gap-6 items-start">
                <div className="space-y-6 min-w-0">
                  <ChartErrorBoundary
                    resetKey={`${activeScenario.id}:${labMode}:${
                      effectiveCandles[0]?.date ?? 'nodate'
                    }`}
                  >
                    <NiftyChart
                      result={result}
                      totalCandlesInScenario={activeScenario.candles.length}
                      config={config}
                      selectedTradeId={selectedTradeId}
                      onSelectTrade={setSelectedTradeId}
                      scenarioKey={`${activeScenario.id}:${labMode}:${
                        effectiveCandles[0]?.date ?? 'nodate'
                      }`}
                      symbolLabel={activeScenario.name}
                      isLiveStreaming={
                        fyersFeed.isStreaming &&
                        selectedScenarioId === 'fyers_live'
                      }
                      liveTick={fyersFeed.latestQuote}
                      isFormingCandle={
                        isReplayActive &&
                        isPlaying &&
                        animateFormation &&
                        formationSubStep < 4
                      }
                    />
                  </ChartErrorBoundary>

                  <EquityCurveChart result={result} config={config} />

                  <TradeLedger
                    result={result}
                    config={config}
                    selectedTradeId={selectedTradeId}
                    onSelectTrade={setSelectedTradeId}
                    onSaveSessionToCalendar={handleSaveLabSessionToCalendar}
                    onSaveTradeToCalendar={handleSaveSingleLabTradeToCalendar}
                    onRecordOrdersAndPositions={
                      handleRecordLabOrdersAndPositions
                    }
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
                  `${candles.length} real 5-min bars from ${date}`
                );
              }}
            />
          )}

          {activeTab === 'journal' && (
            <TradesPositionsJournalView
              journal={orderJournal}
              config={config}
              currentLabTradesCount={result.trades.length}
              currentLabLabel={activeScenario.name}
              isLiveAutoRecording={fyersFeed.isStreaming}
              onRecordCurrentLabSession={handleRecordLabOrdersAndPositions}
              onGoToLab={() => handleSelectTab('lab')}
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

          {activeTab === 'integrations' && (
            <IntegrationsView
              user={auth.user}
              fyersFeed={fyersFeed}
              telegram={telegramAlerts}
              strategyConfig={config}
              initialSubTab={integrationsSubTab}
              onGoToLab={() => handleSelectTab('lab')}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              auth={auth}
              initialSection={settingsSection}
              strategyConfig={config}
              onDownloadPython={handleDownloadPython}
              onGoToIntegrations={() => handleOpenIntegrationsTab('telegram')}
            />
          )}
        </main>
      </div>

      <CsvImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImportCandles}
      />
    </div>
  );
}
