import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  KeyRound,
  LayoutDashboard,
  Link2,
  OctagonX,
  Pause,
  Play,
  RotateCcw,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { AdminUsersView } from './components/AdminUsersView';
import { AuthPortal } from './components/AuthPortal';
import { BrandLogo } from './components/BrandLogo';
import { CsvImportModal } from './components/CsvImportModal';
import { DashboardOverview } from './components/DashboardOverview';
import { EquityCurveChart } from './components/EquityCurveChart';
import { ForcePasswordChangeScreen } from './components/ForcePasswordChangeScreen';
import { FyersLiveBar } from './components/FyersLiveBar';
import {
  IntegrationsSubTab,
  IntegrationsView,
} from './components/IntegrationsView';
import { NiftyChart } from './components/NiftyChart';
import {
  LiveOptionTickPayload,
  OptionTradeDesk,
} from './components/OptionTradeDesk';
import { PaperCalendarView } from './components/PaperCalendarView';
import { PaperWalletView } from './components/PaperWalletView';
import { SettingsSection, SettingsView } from './components/SettingsView';
import { StrategyControls } from './components/StrategyControls';
import { TopBar, TradingMode, WorkspaceTab } from './components/TopBar';
import { TradeLedger } from './components/TradeLedger';
import { TradesPositionsJournalView } from './components/TradesPositionsJournalView';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { YearlyBacktestView } from './components/YearlyBacktestView';
import { formatINR } from './utils/formatters';
import { normalizeFyersSymbol } from './utils/fyersSymbols';
import {
  calculateRiskBasedLots,
  computeOptionRecommendation,
  getFallbackInstrumentMeta,
  InstrumentMeta,
} from './utils/optionsEngine';
import { generatePythonNeoAlgo } from './engine/codeGenerator';
import {
  DEFAULT_STRATEGY_CONFIG,
  getScenarioPresets,
  isLastCandleFormingNow,
  runNiftyStrategy,
} from './engine/niftyStrategy';
import { FyersQuoteTick, useFyersLiveFeed } from './hooks/useFyersLiveFeed';
import { useOrderPositionJournal } from './hooks/useOrderPositionJournal';
import {
  getTodayIstYYYYMMDD,
  tradeRecordsToPaperEntries,
  usePaperTradeJournal,
} from './hooks/usePaperTradeJournal';
import { usePaperWallet } from './hooks/usePaperWallet';
import { useSaaSAuth } from './hooks/useSaaSAuth';
import { useTelegramAlerts } from './hooks/useTelegramAlerts';
import {
  Candle,
  OrderJournalPayload,
  PaperTradeEntry,
  PaperWalletConfig,
  PerIndexStrategyMap,
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
        <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Chart view reset after rapid date change
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click reload chart below to re-render the current 5-minute session.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
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
const PER_INDEX_CONFIGS_KEY = 'neoalgo_per_index_strategies_v1';

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

function loadPerIndexConfigs(userId?: string | null): PerIndexStrategyMap {
  try {
    const key = userId
      ? `${PER_INDEX_CONFIGS_KEY}_${userId}`
      : PER_INDEX_CONFIGS_KEY;
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<StrategyConfig>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: PerIndexStrategyMap = {};
    for (const [sym, cfg] of Object.entries(parsed)) {
      if (cfg && typeof cfg === 'object') {
        out[normalizeFyersSymbol(sym)] = {
          ...DEFAULT_STRATEGY_CONFIG,
          ...cfg,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export default function App() {
  const auth = useSaaSAuth();
  const userId = auth.user?.id ?? null;
  const isAdmin = auth.isAdmin;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [labMode, setLabMode] = useState<'analysis' | 'replay'>('analysis');
  const [integrationsSubTab, setIntegrationsSubTab] =
    useState<IntegrationsSubTab>('brokers');
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>('profile');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dark-first theme with optional light toggle (persisted)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return window.localStorage.getItem('neoalgo_theme') === 'light'
        ? 'light'
        : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('neoalgo_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Trust & Safety: PAPER vs LIVE mode + confirmation modals
  const [tradingMode, setTradingMode] = useState<TradingMode>('PAPER');
  const [showLiveConfirmModal, setShowLiveConfirmModal] = useState(false);
  const [showStopAllModal, setShowStopAllModal] = useState(false);

  const handleRequestModeSwitch = (next: TradingMode) => {
    if (next === tradingMode) return;
    if (next === 'PAPER') {
      setTradingMode('PAPER');
      toast.success('Switched to PAPER mode.');
      return;
    }
    setShowLiveConfirmModal(true);
  };

  const [presets, setPresets] = useState<ScenarioPreset[]>(() =>
    getScenarioPresets()
  );
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<string>('today_bullish');
  const [loadedLabSymbol, setLoadedLabSymbol] = useState<string | null>(null);
  const [globalDefaultConfig, setGlobalDefaultConfig] = useState<StrategyConfig>(
    DEFAULT_STRATEGY_CONFIG
  );
  const [savedConfig, setSavedConfig] = useState<StrategyConfig>(
    DEFAULT_STRATEGY_CONFIG
  );
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [backtestConfig, setBacktestConfig] = useState<StrategyConfig>(
    DEFAULT_STRATEGY_CONFIG
  );
  const [perIndexConfigs, setPerIndexConfigs] = useState<PerIndexStrategyMap>(
    {}
  );
  const [serverSavedReports, setServerSavedReports] = useState<
    SavedBacktestReport[] | null
  >(null);
  const [justSavedConfig, setJustSavedConfig] = useState<boolean>(false);
  const saveTimerRef = useRef<number | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [liveOptionInfo, setLiveOptionInfo] =
    useState<LiveOptionTickPayload | null>(null);
  const [copiedRecoveryBanner, setCopiedRecoveryBanner] = useState(false);

  // Per-user Paper Trade Monthly Calendar, Trades/Positions Journal & Paper Wallet state (server-synced)
  const paperJournal = usePaperTradeJournal(userId);
  const orderJournal = useOrderPositionJournal(userId);
  const paperWalletCtrl = usePaperWallet(userId);
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
      setGlobalDefaultConfig(DEFAULT_STRATEGY_CONFIG);
      setSavedConfig(DEFAULT_STRATEGY_CONFIG);
      setConfig(DEFAULT_STRATEGY_CONFIG);
      setBacktestConfig(DEFAULT_STRATEGY_CONFIG);
      setPerIndexConfigs({});
      setServerSavedReports(null);
      setPresets(getScenarioPresets());
      setSelectedScenarioId('today_bullish');
      setLoadedLabSymbol(null);
      setLabCalendarFeedback(null);
      return;
    }

    let cancelled = false;
    const localFallback = loadSavedStrategyConfig(userId);
    const localPerIndex = loadPerIndexConfigs(userId);
    setGlobalDefaultConfig(localFallback);
    setSavedConfig(localFallback);
    setConfig(localFallback);
    setBacktestConfig(localFallback);
    setPerIndexConfigs(localPerIndex);

    (async () => {
      try {
        const resp = await fetch('/api/user/workspace', {
          credentials: 'include',
        });
        if (!resp.ok || cancelled) return;
        const data = (await resp.json()) as {
          strategyConfig?: Partial<StrategyConfig> | null;
          perIndexConfigs?: Record<string, Partial<StrategyConfig>> | null;
          paperWallet?: Partial<PaperWalletConfig> | null;
          paperTrades?: PaperTradeEntry[];
          savedReports?: SavedBacktestReport[];
          orderJournal?: Partial<OrderJournalPayload> | null;
        };
        if (cancelled) return;

        if (data.perIndexConfigs && typeof data.perIndexConfigs === 'object') {
          const mergedMap: PerIndexStrategyMap = {};
          for (const [sym, cfg] of Object.entries(data.perIndexConfigs)) {
            if (cfg && typeof cfg === 'object') {
              mergedMap[normalizeFyersSymbol(sym)] = {
                ...DEFAULT_STRATEGY_CONFIG,
                ...cfg,
              };
            }
          }
          setPerIndexConfigs(mergedMap);
          try {
            window.localStorage.setItem(
              `${PER_INDEX_CONFIGS_KEY}_${userId}`,
              JSON.stringify(mergedMap)
            );
          } catch {
            // ignore
          }
        }

        if (data.strategyConfig && typeof data.strategyConfig === 'object') {
          const merged = { ...DEFAULT_STRATEGY_CONFIG, ...data.strategyConfig };
          setGlobalDefaultConfig(merged);
          setSavedConfig(merged);
          setConfig(merged);
          setBacktestConfig(merged);
          try {
            window.localStorage.setItem(
              `${SAVED_CONFIG_KEY}_${userId}`,
              JSON.stringify(merged)
            );
          } catch {
            // ignore
          }
        }
        if (data.paperWallet && typeof data.paperWallet === 'object') {
          paperWalletCtrl.hydrateFromServer(data.paperWallet);
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

  const handleAttachStrategyToSymbol = (
    rawSymbol: string,
    strategyCfg: StrategyConfig
  ) => {
    const normalized = normalizeFyersSymbol(rawSymbol);
    const snapshot: StrategyConfig = { ...DEFAULT_STRATEGY_CONFIG, ...strategyCfg };
    setPerIndexConfigs((prev) => {
      const next = { ...prev, [normalized]: snapshot };
      try {
        const key = userId
          ? `${PER_INDEX_CONFIGS_KEY}_${userId}`
          : PER_INDEX_CONFIGS_KEY;
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    if (userId) {
      void fetch('/api/user/index-strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ symbol: normalized, config: snapshot }),
      }).catch(() => {
        // Keep local copy
      });
    }
    if (normalized === activeLabSymbol) {
      setConfig(snapshot);
      setSavedConfig(snapshot);
    }
    setJustSavedConfig(true);
    toast.success(`Strategy attached to ${normalized}.`);
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      setJustSavedConfig(false);
    }, 2200);
  };

  const handleRemoveAttachedStrategy = (rawSymbol: string) => {
    const normalized = normalizeFyersSymbol(rawSymbol);
    setPerIndexConfigs((prev) => {
      const next = { ...prev };
      delete next[normalized];
      try {
        const key = userId
          ? `${PER_INDEX_CONFIGS_KEY}_${userId}`
          : PER_INDEX_CONFIGS_KEY;
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    if (userId) {
      const params = new URLSearchParams({ symbol: normalized });
      void fetch(`/api/user/index-strategy?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => {
        // ignore
      });
    }
    toast.info(`Detached custom strategy for ${normalized}.`);
  };

  const handleSaveConfig = (overrideCfg?: StrategyConfig) => {
    const isExplicitConfig = Boolean(
      overrideCfg &&
        typeof overrideCfg === 'object' &&
        'stopLossPoints' in overrideCfg
    );
    const targetCfg = isExplicitConfig && overrideCfg ? overrideCfg : config;
    try {
      const key = userId ? `${SAVED_CONFIG_KEY}_${userId}` : SAVED_CONFIG_KEY;
      window.localStorage.setItem(key, JSON.stringify(targetCfg));
    } catch {
      // Ignore storage quota errors
    }
    if (userId) {
      void fetch('/api/user/strategy-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config: targetCfg }),
      }).catch(() => {
        // Ignore network error; local copy saved
      });
    }
    setGlobalDefaultConfig(targetCfg);
    if (!isExplicitConfig) {
      setSavedConfig(targetCfg);
    }
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

  const ADMIN_ONLY_TABS: WorkspaceTab[] = [
    'lab',
    'backtest1y',
    'calendar',
    'users',
  ];

  // Ensure non-admin customers can never remain on an Admin-only tab
  useEffect(() => {
    if (auth.user && !isAdmin && ADMIN_ONLY_TABS.includes(activeTab)) {
      setActiveTab('dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user, isAdmin, activeTab]);

  const handleSelectTab = (tab: WorkspaceTab) => {
    if (!isAdmin && ADMIN_ONLY_TABS.includes(tab)) {
      setActiveTab('dashboard');
      return;
    }
    setActiveTab(tab);
    setIsPlaying(false);
  };

  const handleOpenSettingsSection = (sec: SettingsSection) => {
    setSettingsSection(!isAdmin && sec === 'developer' ? 'profile' : sec);
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
    if (!isAdmin) {
      setActiveTab('journal');
      return;
    }
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

  const normalizeSessionCandles = (raw: Candle[]): Candle[] => {
    const byKey = new Map<string, Candle>();
    for (const c of raw) {
      const key = `${c.date || ''}_${c.time}`;
      byKey.set(key, c);
    }
    return Array.from(byKey.values())
      .sort((a, b) => {
        const da = a.date || '';
        const db = b.date || '';
        if (da !== db) return da.localeCompare(db);
        return a.time.localeCompare(b.time);
      })
      .map((c, idx) => ({ ...c, index: idx }));
  };

  const handleImportCandles = (rawCandles: Candle[], name: string) => {
    const candles = normalizeSessionCandles(rawCandles);
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
    rawCandles: Candle[],
    label: string,
    subtitle: string,
    symbol?: string
  ) => {
    const candles = normalizeSessionCandles(rawCandles);
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
    if (symbol) {
      setLoadedLabSymbol(normalizeFyersSymbol(symbol));
    }
    setSelectedScenarioId(liveId);
    setSelectedTradeId(null);
    setIsPlaying(false);
    setLabMode('analysis');
    setReplayCount(candles.length);
    setActiveTab('lab');
  };

  const handleHistorySync = (
    rawCandles: Candle[],
    symbol: string,
    date: string
  ) => {
    const candles = normalizeSessionCandles(rawCandles);
    const liveId = 'fyers_live';
    const lastBarIsCurrentlyForming = isLastCandleFormingNow(candles, true);
    setPresets((prev) => {
      const idx = prev.findIndex((p) => p.id === liveId);
      const existing = idx !== -1 ? prev[idx] : null;
      const merged = [...candles];
      // Only preserve live tick extremes on the currently forming 5-min bar;
      // for all closed candles, trust official Fyers 5-min OHLC to match Backtest 100%.
      if (
        lastBarIsCurrentlyForming &&
        existing &&
        existing.candles.length > 0 &&
        merged.length > 0
      ) {
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
    setLoadedLabSymbol(normalizeFyersSymbol(symbol));
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
      let prevCandles = existing ? [...existing.candles] : [];
      const lastExisting = prevCandles[prevCandles.length - 1];

      // Never append today's live ticks onto a previous day's historical session
      if (lastExisting && lastExisting.date && lastExisting.date !== istDate) {
        prevCandles = [];
      }

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
          date: istDate,
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
    setLoadedLabSymbol(normalizeFyersSymbol(symbol));
    setSelectedScenarioId(liveId);
  };

  // Root-level Fyers live feed controller bound to current SaaS user
  const fyersFeed = useFyersLiveFeed({
    authUserId: userId,
    onLoadCandles: handleLoadFyersCandles,
    onLiveTick: handleLiveFyersTick,
    onHistorySync: handleHistorySync,
  });

  // Reset loadedLabSymbol override when user explicitly switches the Live Bar symbol selector
  useEffect(() => {
    setLoadedLabSymbol(null);
  }, [fyersFeed.activeSymbol]);

  const isLabLastCandleForming = useMemo(
    () =>
      (selectedScenarioId === 'fyers_live' &&
        !isReplayActive &&
        isLastCandleFormingNow(
          effectiveCandles,
          fyersFeed.isStreaming,
          fyersFeed.latestQuote
        )) ||
      (isReplayActive && animateFormation && formationSubStep < 4),
    [
      selectedScenarioId,
      isReplayActive,
      animateFormation,
      formationSubStep,
      effectiveCandles,
      fyersFeed.isStreaming,
      fyersFeed.latestQuote,
    ]
  );

  const result = useMemo(
    () =>
      runNiftyStrategy(effectiveCandles, config, undefined, undefined, {
        lastCandleIsForming: isLabLastCandleForming,
      }),
    [effectiveCandles, config, isLabLastCandleForming]
  );

  const lastCandle =
    result.candles.length > 0
      ? result.candles[result.candles.length - 1]
      : null;

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

  // Automatic F&O Futures Lot Size, Option Strike Step & Per-Index Attached Strategy loader
  const activeLabSymbol = normalizeFyersSymbol(
    selectedScenarioId === 'fyers_live'
      ? loadedLabSymbol || fyersFeed.activeSymbol
      : 'NSE:NIFTY50-INDEX'
  );
  const [labInstrumentMeta, setLabInstrumentMeta] = useState<InstrumentMeta>(
    () => getFallbackInstrumentMeta(activeLabSymbol)
  );
  const [loadingLabLotSize, setLoadingLabLotSize] = useState(false);
  const lastAutoLotSymbolRef = useRef<string | null>(null);
  const lastAppliedAttachedSymbolRef = useRef<string | null>(null);

  // Auto-load attached per-index strategy whenever user switches active index/symbol
  useEffect(() => {
    const attached = perIndexConfigs[activeLabSymbol];
    if (lastAppliedAttachedSymbolRef.current === activeLabSymbol) return;
    const hadPrevious = lastAppliedAttachedSymbolRef.current !== null;
    lastAppliedAttachedSymbolRef.current = activeLabSymbol;

    if (attached) {
      const merged = { ...DEFAULT_STRATEGY_CONFIG, ...attached };
      lastAutoLotSymbolRef.current = activeLabSymbol;
      setConfig(merged);
      setSavedConfig(merged);
    } else if (hadPrevious) {
      const fallbackMeta = getFallbackInstrumentMeta(activeLabSymbol);
      const restored = {
        ...DEFAULT_STRATEGY_CONFIG,
        ...globalDefaultConfig,
        lotSize: fallbackMeta.lotSize,
      };
      setConfig(restored);
      setSavedConfig(restored);
    }
  }, [activeLabSymbol, perIndexConfigs, globalDefaultConfig]);

  useEffect(() => {
    const fallback = getFallbackInstrumentMeta(activeLabSymbol);
    setLabInstrumentMeta(fallback);

    const applyLotSizeIfSymbolChanged = (meta: InstrumentMeta, notify: boolean) => {
      if (lastAutoLotSymbolRef.current !== meta.normalizedSymbol) {
        const hadPrevious = lastAutoLotSymbolRef.current !== null;
        lastAutoLotSymbolRef.current = meta.normalizedSymbol;
        setConfig((prev) =>
          prev.lotSize === meta.lotSize
            ? prev
            : { ...prev, lotSize: meta.lotSize }
        );
        if (hadPrevious && notify && meta.fnoEnabled) {
          toast.info(
            `${meta.displayName} lot size auto-set to ${meta.lotSize}${
              meta.nearFuturesSymbol ? ` (${meta.nearFuturesSymbol})` : ''
            }`
          );
        }
      } else {
        setConfig((prev) =>
          prev.lotSize === fallback.lotSize && meta.lotSize !== fallback.lotSize
            ? { ...prev, lotSize: meta.lotSize }
            : prev
        );
      }
    };

    if (!userId) {
      applyLotSizeIfSymbolChanged(fallback, false);
      return;
    }

    let cancelled = false;
    setLoadingLabLotSize(true);
    (async () => {
      try {
        const params = new URLSearchParams({ symbol: activeLabSymbol });
        const resp = await fetch(
          `/api/fyers/instrument-meta?${params.toString()}`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (!resp.ok || cancelled) {
          if (!cancelled) applyLotSizeIfSymbolChanged(fallback, false);
          return;
        }
        const meta = (await resp.json()) as InstrumentMeta;
        if (cancelled) return;
        setLabInstrumentMeta(meta);
        applyLotSizeIfSymbolChanged(meta, true);
      } catch {
        if (!cancelled) applyLotSizeIfSymbolChanged(fallback, false);
      } finally {
        if (!cancelled) setLoadingLabLotSize(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeLabSymbol, userId]);

  // Real-time Paper Wallet Live Balance, Open MTM & Auto Risk-Based Lot Calculation
  const todayIstDate = getTodayIstYYYYMMDD();
  const walletMetrics = useMemo(() => {
    const closedPositions = orderJournal.positions.filter(
      (p) => p.status === 'CLOSED'
    );
    const openPositions = orderJournal.positions.filter(
      (p) => p.status === 'OPEN'
    );

    const realizedPnl = closedPositions.reduce(
      (sum, p) => sum + (Number.isFinite(p.pnlRupees) ? p.pnlRupees : 0),
      0
    );
    const todayRealizedPnl = closedPositions
      .filter((p) => p.date === todayIstDate)
      .reduce(
        (sum, p) => sum + (Number.isFinite(p.pnlRupees) ? p.pnlRupees : 0),
        0
      );

    // Live Open MTM: mark open positions live using incoming Fyers tick (or live session open trade)
    const liveSpot = fyersFeed.latestQuote?.ltp ?? null;
    const deltaFactor =
      config.instrumentType === 'NIFTY_ATM_OPT'
        ? config.optionDeltaEstimate || 0.5
        : 1;

    let liveOpenMtm = 0;
    let activeOpenCount = openPositions.length;

    if (openPositions.length > 0) {
      for (const pos of openPositions) {
        // If this open position matches our actively streaming symbol, compute live tick-by-tick MTM
        const matchesLiveUnderlying =
          liveSpot !== null &&
          fyersFeed.isStreaming &&
          (pos.symbol.includes(labInstrumentMeta.underlying) ||
            pos.symbol === fyersFeed.activeSymbol);

        if (matchesLiveUnderlying && liveSpot !== null) {
          const pts =
            pos.direction === 'LONG'
              ? liveSpot - pos.avgEntryPrice
              : pos.avgEntryPrice - liveSpot;
          liveOpenMtm += Math.round(pts * pos.qty * deltaFactor);
        } else {
          liveOpenMtm += Number.isFinite(pos.pnlRupees) ? pos.pnlRupees : 0;
        }
      }
    } else if (selectedScenarioId === 'fyers_live' && result.trades.length > 0) {
      const lastTrade = result.trades[result.trades.length - 1];
      if (lastTrade.exitReason === 'OPEN') {
        activeOpenCount = 1;
        const mark = liveSpot ?? lastCandle?.close ?? lastTrade.entryPrice;
        const pts =
          lastTrade.direction === 'LONG'
            ? mark - lastTrade.entryPrice
            : lastTrade.entryPrice - mark;
        liveOpenMtm = Math.round(
          pts * config.lotSize * config.lots * deltaFactor
        );
      }
    }

    const liveBalance =
      paperWalletCtrl.wallet.startingCapital + realizedPnl + liveOpenMtm;

    return {
      realizedPnl,
      todayRealizedPnl,
      liveOpenMtm,
      liveBalance,
      activeOpenCount,
    };
  }, [
    orderJournal.positions,
    todayIstDate,
    fyersFeed.latestQuote?.ltp,
    fyersFeed.isStreaming,
    fyersFeed.activeSymbol,
    labInstrumentMeta.underlying,
    config.instrumentType,
    config.optionDeltaEstimate,
    config.lotSize,
    config.lots,
    selectedScenarioId,
    result.trades,
    lastCandle?.close,
    paperWalletCtrl.wallet.startingCapital,
  ]);

  const activeSpotPrice =
    (selectedScenarioId === 'fyers_live' && fyersFeed.latestQuote?.ltp) ||
    lastCandle?.close ||
    24500;

  const activeOptionPriceSnapshot = useMemo(() => {
    const streamedLtp =
      fyersFeed.latestOptionQuote && fyersFeed.latestOptionQuote.ltp > 0
        ? fyersFeed.latestOptionQuote.ltp
        : null;
    if (streamedLtp !== null) {
      return {
        ltp: streamedLtp,
        isLive: true,
        label:
          liveOptionInfo?.contractLabel ||
          fyersFeed.latestOptionQuote?.symbol ||
          null,
      };
    }
    if (liveOptionInfo?.ltp && liveOptionInfo.ltp > 0) {
      return {
        ltp: liveOptionInfo.ltp,
        isLive: liveOptionInfo.isLive,
        label: liveOptionInfo.contractLabel,
      };
    }
    const fallbackRec = computeOptionRecommendation({
      symbol: activeLabSymbol,
      spotPrice: activeSpotPrice,
      direction: result.finalBias === 'BEARISH' ? 'SHORT' : 'LONG',
      targetDelta: config.optionDeltaEstimate || 0.5,
      slPoints: config.stopLossPoints,
      targetPoints: config.targetPoints,
      lotSize: config.lotSize,
      lots: 1,
      strikeStep: labInstrumentMeta.strikeStep,
      approxFuturesMargin: labInstrumentMeta.approxFuturesMargin,
    });
    return {
      ltp: fallbackRec.optionEntryPrice,
      isLive: false,
      label: fallbackRec.contractLabel,
    };
  }, [
    fyersFeed.latestOptionQuote,
    liveOptionInfo,
    activeLabSymbol,
    activeSpotPrice,
    result.finalBias,
    config.optionDeltaEstimate,
    config.stopLossPoints,
    config.targetPoints,
    config.lotSize,
    labInstrumentMeta.strikeStep,
    labInstrumentMeta.approxFuturesMargin,
  ]);

  const lotCalculation = useMemo(
    () =>
      calculateRiskBasedLots({
        startingCapital: paperWalletCtrl.wallet.startingCapital,
        liveEquity: walletMetrics.liveBalance,
        riskMode: paperWalletCtrl.wallet.riskMode,
        riskPerTradeRupees: paperWalletCtrl.wallet.riskPerTradeRupees,
        riskPerTradePct: paperWalletCtrl.wallet.riskPerTradePct,
        dailyRiskMode: paperWalletCtrl.wallet.dailyRiskMode,
        maxDailyLossRupees: paperWalletCtrl.wallet.maxDailyLossRupees,
        maxDailyLossPct: paperWalletCtrl.wallet.maxDailyLossPct,
        todayNetPnl: walletMetrics.todayRealizedPnl + walletMetrics.liveOpenMtm,
        maxLotsCap: paperWalletCtrl.wallet.maxLotsCap,
        indexStopLossPoints: config.stopLossPoints,
        optionDelta: config.optionDeltaEstimate,
        isOptionBuying: config.instrumentType === 'NIFTY_ATM_OPT',
        lotSize: config.lotSize,
        optionLtp: activeOptionPriceSnapshot.ltp,
        isOptionLtpLive: activeOptionPriceSnapshot.isLive,
      }),
    [
      paperWalletCtrl.wallet,
      walletMetrics.liveBalance,
      walletMetrics.todayRealizedPnl,
      walletMetrics.liveOpenMtm,
      config.stopLossPoints,
      config.optionDeltaEstimate,
      config.instrumentType,
      config.lotSize,
      activeOptionPriceSnapshot.ltp,
      activeOptionPriceSnapshot.isLive,
    ]
  );

  // Auto-apply calculated lots when Auto-Size Lots is enabled in Paper Wallet Risk Management
  useEffect(() => {
    if (!paperWalletCtrl.wallet.autoSizeLots) return;
    if (config.lots !== lotCalculation.recommendedLots) {
      setConfig((prev) =>
        prev.lots === lotCalculation.recommendedLots
          ? prev
          : { ...prev, lots: lotCalculation.recommendedLots }
      );
    }
  }, [
    paperWalletCtrl.wallet.autoSizeLots,
    lotCalculation.recommendedLots,
    config.lots,
  ]);

  const handleSignOut = async () => {
    fyersFeed.stopStream();
    await auth.logout();
    setActiveTab('dashboard');
    toast.success('Signed out.');
  };

  const handleConfirmLiveMode = () => {
    setTradingMode('LIVE');
    setShowLiveConfirmModal(false);
    toast.warning(
      'LIVE mode enabled. Confirm every live action before execution.'
    );
  };

  const handleConfirmStopAll = () => {
    fyersFeed.stopStream();
    setIsPlaying(false);
    setTradingMode('PAPER');
    setShowStopAllModal(false);
    toast.error(
      'Emergency Stop executed — live stream stopped, replay paused, and workspace switched to PAPER mode.'
    );
  };

  // Paper Trade Calendar save handlers
  const resolveSessionFallbackDate = () => {
    const firstDated = effectiveCandles.find(
      (c) => c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date)
    );
    return firstDated?.date || getTodayIstYYYYMMDD();
  };

  const resolveSessionSymbol = () => activeLabSymbol;

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
    const liveCandleIsForming = isLastCandleFormingNow(
      liveFyersCandles,
      fyersFeed.isStreaming,
      fyersFeed.latestQuote
    );
    const liveEval = runNiftyStrategy(
      liveFyersCandles,
      config,
      undefined,
      undefined,
      { lastCandleIsForming: liveCandleIsForming }
    );
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
      <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0B0F17] flex flex-col items-center justify-center gap-3 px-6">
        <BrandLogo size="md" />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Loading workspace...
        </p>
      </div>
    );
  }

  // Multi-user SaaS Authentication Gate
  if (!auth.user) {
    return (
      <>
        <Toaster position="bottom-right" theme={theme} richColors />
        <AuthPortal
          auth={auth}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      </>
    );
  }

  // Mandatory First-Login / Post-Reset Password Change Gate
  if (auth.user.mustChangePassword) {
    return (
      <>
        <Toaster position="bottom-right" theme={theme} richColors />
        <ForcePasswordChangeScreen
          auth={auth}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      </>
    );
  }

  const openPositionsCount = orderJournal.positions.filter(
    (p) => p.status === 'OPEN'
  ).length;

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex">
      <Toaster position="bottom-right" theme={theme} richColors />

      <WorkspaceSidebar
        isAdmin={isAdmin}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
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
          theme={theme}
          onToggleTheme={handleToggleTheme}
          tradingMode={tradingMode}
          onRequestModeSwitch={handleRequestModeSwitch}
          onRequestStopAll={() => setShowStopAllModal(true)}
          onSelectTab={handleSelectTab}
          onOpenIntegrationsTab={handleOpenIntegrationsTab}
          onOpenSettingsSection={handleOpenSettingsSection}
          onSignOut={() => void handleSignOut()}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          fyersConnected={Boolean(fyersFeed.status?.authenticated)}
          fyersProfileLabel={
            fyersFeed.status?.profile?.name ||
            fyersFeed.status?.profile?.fy_id ||
            undefined
          }
          isLiveStreaming={fyersFeed.isStreaming}
          liveTick={fyersFeed.latestQuote}
          telegramArmed={telegramAlerts.isArmedForLive}
          telegramDestinationsCount={telegramAlerts.activeDestinationCount}
          paperWalletBalance={walletMetrics.liveBalance}
        />

        <main className="flex-1 w-full max-w-[1400px] mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-20 lg:pb-8 space-y-5 sm:space-y-6">
          {/* One-time Recovery Key Banner shown right after registration or key-based reset */}
          {auth.pendingRecoveryKeyBanner && (
            <section className="bg-white dark:bg-[#111622] border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
              <div className="flex items-start gap-3 min-w-0">
                <KeyRound
                  className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Save your account Recovery Key
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">
                    Store this key somewhere safe — you can use it to recover
                    your password from the Sign In screen:{' '}
                    <code className="font-mono font-semibold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-[#161D2B] px-2 py-0.5 rounded select-all">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  {copiedRecoveryBanner ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedRecoveryBanner ? 'Copied' : 'Copy key'}</span>
                </button>
                <button
                  type="button"
                  onClick={auth.dismissRecoveryKeyBanner}
                  aria-label="Dismiss recovery key notice"
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </section>
          )}

          {activeTab === 'dashboard' && (
            <DashboardOverview
              isAdmin={isAdmin}
              user={auth.user}
              fyersConnected={Boolean(fyersFeed.status?.authenticated)}
              theme={theme}
              config={config}
              labResult={result}
              labScenarioName={activeScenario.name}
              isLiveStreaming={fyersFeed.isStreaming}
              journal={paperJournal}
              orderJournal={orderJournal}
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

          {isAdmin && activeTab === 'lab' && (
            <>
              {/* Unified Strategy Lab & Replay Header */}
              <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    Strategy Lab
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {activeScenario.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Live Analysis vs Bar Replay Switch */}
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-[#161D2B] rounded-lg">
                    <button
                      type="button"
                      onClick={() => handleSwitchLabMode('analysis')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        labMode === 'analysis'
                          ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Live &amp; Analysis
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchLabMode('replay')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        labMode === 'replay'
                          ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
                    className="px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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

              {/* Vertical Top-of-Page Strategy Configuration (First visible configuration on page) */}
              <StrategyControls
                config={config}
                onChange={setConfig}
                onResetDefaults={() => setConfig(DEFAULT_STRATEGY_CONFIG)}
                hasUnsavedChanges={hasUnsavedConfig}
                justSaved={justSavedConfig}
                onSave={() => handleSaveConfig()}
                onDiscard={handleDiscardConfig}
                instrumentMeta={labInstrumentMeta}
                loadingLotSize={loadingLabLotSize}
                activeSymbol={activeLabSymbol}
                isAttachedToActiveSymbol={Boolean(
                  perIndexConfigs[activeLabSymbol]
                )}
                perIndexConfigs={perIndexConfigs}
                onAttachToSymbol={handleAttachStrategyToSymbol}
                onRemoveAttachedSymbol={handleRemoveAttachedStrategy}
                lotCalculation={lotCalculation}
                autoSizeLotsEnabled={paperWalletCtrl.wallet.autoSizeLots}
                onOpenPaperWallet={() => handleSelectTab('wallet')}
              />

              {/* 4-Column Session KPI Strip */}
              <section
                aria-label="Session Performance Summary"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800"
              >
                <div className="px-5 py-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Session Net P&amp;L
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span
                      className={`font-mono tabular-nums text-2xl font-semibold ${
                        result.metrics.netPoints > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : result.metrics.netPoints < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {result.metrics.netPoints >= 0 ? '+' : ''}
                      {result.metrics.netPoints.toFixed(1)} pts
                    </span>
                    <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                      ({formatINR(result.metrics.netRupees)})
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Session Bias
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span
                      className={`font-display text-lg font-semibold ${
                        result.finalBias === 'BULLISH'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : result.finalBias === 'BEARISH'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {result.finalBias === 'PENDING'
                        ? 'Undecided'
                        : result.finalBias === 'BULLISH'
                        ? 'Bullish'
                        : 'Bearish'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {result.biasDecidedSet
                        ? `Group #${result.biasDecidedSet} @ ${result.biasDecidedTime}`
                        : `${result.metrics.setsSkipped} skipped`}
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Trades &amp; PF
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {result.metrics.wins}W / {result.metrics.losses}L
                      {result.metrics.breakevens > 0
                        ? ` / ${result.metrics.breakevens}BE`
                        : ''}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      PF {result.metrics.profitFactor.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Engine State
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {stageLabel}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                    Sets: {result.metrics.setsEvaluated} · Skipped:{' '}
                    {result.metrics.setsSkipped}
                  </div>
                </div>
              </section>

              {/* Inline Replay Controls (only when Bar Replay mode is selected) */}
              {isReplayActive && (
                <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
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
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
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
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
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
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Reset</span>
                    </button>

                    <label className="inline-flex items-center gap-1.5 ml-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={animateFormation}
                        onChange={(e) => {
                          setAnimateFormation(e.target.checked);
                          setFormationSubStep(4);
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
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
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                    <span className="font-mono tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {replayCount}/{activeScenario.candles.length} (
                      {lastCandle?.time ?? '--'})
                    </span>
                  </div>
                </section>
              )}

              {/* Full-Width Chart, Live Options Buy Desk, Equity Curve & Ledger (Strategy Controls moved cleanly to top) */}
              <section className="space-y-6">
                <div className="space-y-6 min-w-0">
                  <ChartErrorBoundary
                    resetKey={`${activeScenario.id}:${activeScenario.name}:${labMode}:${
                      effectiveCandles[0]?.date ?? 'nodate'
                    }:${effectiveCandles[0]?.open ?? 0}`}
                  >
                    <NiftyChart
                      result={result}
                      totalCandlesInScenario={activeScenario.candles.length}
                      config={config}
                      selectedTradeId={selectedTradeId}
                      onSelectTrade={setSelectedTradeId}
                      scenarioKey={`${activeScenario.id}:${activeScenario.name}:${labMode}:${
                        effectiveCandles[0]?.date ?? 'nodate'
                      }:${effectiveCandles[0]?.open ?? 0}`}
                      symbolLabel={activeScenario.name}
                      appTheme={theme}
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

                  <OptionTradeDesk
                    symbol={activeLabSymbol}
                    spotPrice={
                      (selectedScenarioId === 'fyers_live' &&
                        fyersFeed.latestQuote?.ltp) ||
                      lastCandle?.close ||
                      24500
                    }
                    result={result}
                    config={config}
                    instrumentMeta={labInstrumentMeta}
                    fyersAuthenticated={Boolean(
                      fyersFeed.status?.authenticated
                    )}
                    isLiveStreaming={fyersFeed.isStreaming}
                    streamedOptionQuote={fyersFeed.latestOptionQuote}
                    onRegisterStreamOptionSymbol={
                      fyersFeed.setStreamedOptionSymbol
                    }
                    onLiveOptionChange={setLiveOptionInfo}
                    lotCalculation={lotCalculation}
                    onOpenPaperWallet={() => handleSelectTab('wallet')}
                    onChangeConfig={setConfig}
                  />

                  <EquityCurveChart
                    result={result}
                    config={config}
                    theme={theme}
                  />

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
              </section>
            </>
          )}

          {isAdmin && activeTab === 'backtest1y' && (
            <YearlyBacktestView
              theme={theme}
              config={backtestConfig}
              savedGlobalConfig={globalDefaultConfig}
              onChangeConfig={setBacktestConfig}
              onResetDefaults={() => setBacktestConfig(DEFAULT_STRATEGY_CONFIG)}
              hasUnsavedChanges={
                JSON.stringify(backtestConfig) !==
                JSON.stringify(globalDefaultConfig)
              }
              justSaved={justSavedConfig}
              onSaveConfig={() => handleSaveConfig(backtestConfig)}
              onDiscardConfig={() => setBacktestConfig(globalDefaultConfig)}
              userId={userId}
              serverSavedReports={serverSavedReports}
              perIndexConfigs={perIndexConfigs}
              onAttachStrategyToSymbol={handleAttachStrategyToSymbol}
              onRemoveAttachedStrategy={handleRemoveAttachedStrategy}
              lotCalculation={lotCalculation}
              autoSizeLotsEnabled={paperWalletCtrl.wallet.autoSizeLots}
              defaultStartingCapital={paperWalletCtrl.wallet.startingCapital}
              defaultRiskPerTradePct={paperWalletCtrl.wallet.riskPerTradePct}
              onOpenPaperWallet={() => handleSelectTab('wallet')}
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
                const normalized = normalizeFyersSymbol(symbol);
                // Copy the exact Backtest Strategy Configuration into Strategy Lab for 100% parity
                lastAppliedAttachedSymbolRef.current = normalized;
                lastAutoLotSymbolRef.current = normalized;
                setConfig(backtestConfig);
                setSavedConfig(backtestConfig);
                handleLoadFyersCandles(
                  candles,
                  `${normalized} · ${date}`,
                  `${candles.length} real 5-min bars from ${date}`,
                  normalized
                );
              }}
            />
          )}

          {activeTab === 'journal' && (
            <TradesPositionsJournalView
              isAdmin={isAdmin}
              journal={orderJournal}
              config={config}
              currentLabTradesCount={result.trades.length}
              currentLabLabel={activeScenario.name}
              isLiveAutoRecording={fyersFeed.isStreaming}
              onRecordCurrentLabSession={handleRecordLabOrdersAndPositions}
              onGoToLab={() => handleSelectTab('lab')}
            />
          )}

          {activeTab === 'wallet' && (
            <PaperWalletView
              wallet={paperWalletCtrl.wallet}
              onUpdateWallet={paperWalletCtrl.updateWallet}
              onResetWallet={() => {
                paperWalletCtrl.resetWalletDefaults();
                toast.info('Paper Wallet & Risk defaults restored (₹1,00,000).');
              }}
              realizedPnl={walletMetrics.realizedPnl}
              todayRealizedPnl={walletMetrics.todayRealizedPnl}
              liveOpenMtm={walletMetrics.liveOpenMtm}
              openPositionsCount={walletMetrics.activeOpenCount}
              config={config}
              activeSymbol={activeLabSymbol}
              activeInstrumentMeta={labInstrumentMeta}
              activeSpotPrice={activeSpotPrice}
              activeLiveOptionLtp={
                activeOptionPriceSnapshot.isLive
                  ? activeOptionPriceSnapshot.ltp
                  : null
              }
              activeLiveOptionLabel={activeOptionPriceSnapshot.label}
              activeLotCalculation={lotCalculation}
              fyersAuthenticated={Boolean(fyersFeed.status?.authenticated)}
              canEditStrategy={isAdmin}
              onApplyRecommendedLots={(lots) => {
                setConfig((prev) => ({ ...prev, lots }));
                toast.success(
                  `Applied ${lots} risk-sized lots (${lots * config.lotSize} qty).`
                );
              }}
            />
          )}

          {isAdmin && activeTab === 'calendar' && (
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
              onGoToLab={() => handleSelectTab(isAdmin ? 'lab' : 'dashboard')}
            />
          )}

          {isAdmin && activeTab === 'users' && <AdminUsersView />}

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

        {/* Thumb-Zone Mobile Bottom Tab Bar */}
        <nav
          aria-label="Mobile quick navigation"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 dark:bg-[#0E131D]/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800/90 grid grid-cols-4 items-center"
        >
          {(isAdmin
            ? ([
                { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
                { id: 'lab', label: 'Lab', icon: Activity },
                { id: 'wallet', label: 'Wallet', icon: Wallet },
                { id: 'users', label: 'Users', icon: Users },
              ] as const)
            : ([
                { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
                { id: 'journal', label: 'Positions', icon: ClipboardList },
                { id: 'wallet', label: 'Wallet', icon: Wallet },
                { id: 'integrations', label: 'Broker', icon: Link2 },
              ] as const)
          ).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 font-medium'
                }`}
              >
                <Icon className="w-[19px] h-[19px]" aria-hidden="true" />
                <span className="text-[10px] leading-tight tracking-tight">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <CsvImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImportCandles}
      />

      {/* Trust & Safety Modal: Confirm Switching to LIVE Mode */}
      {showLiveConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="live-mode-dialog-title"
        >
          <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
              <AlertTriangle
                className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0"
                aria-hidden="true"
              />
              <h2
                id="live-mode-dialog-title"
                className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                Switch to LIVE Trading Mode?
              </h2>
            </div>

            <div className="px-6 py-4 space-y-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <p>
                You are switching the workspace indicator from{' '}
                <strong className="text-slate-900 dark:text-slate-100">
                  PAPER
                </strong>{' '}
                to{' '}
                <strong className="text-red-600 dark:text-red-400">LIVE</strong>
                .{' '}
                {isAdmin
                  ? `Make sure your broker feed, stop loss (${config.stopLossPoints} pts), target (${config.targetPoints} pts), and max daily trade cap (${config.maxTradesPerDay}/day) are verified.`
                  : 'Make sure your connected broker account and available margin are verified before live execution.'}
              </p>
              <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 font-mono tabular-nums text-[11px] text-slate-700 dark:text-slate-300">
                Broker:{' '}
                {fyersFeed.status?.authenticated
                  ? 'Fyers Connected'
                  : 'Not Connected'}
                {isAdmin
                  ? ` · Lot Size: ${config.lots} × ${config.lotSize} qty`
                  : ''}
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 dark:bg-[#0E131D] border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLiveConfirmModal(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Stay in Paper Mode
              </button>
              <button
                type="button"
                onClick={handleConfirmLiveMode}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
              >
                Confirm LIVE Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trust & Safety Modal: Emergency Stop All / Square Off */}
      {showStopAllModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stop-all-dialog-title"
        >
          <div className="bg-white dark:bg-[#111622] border border-red-200 dark:border-red-500/35 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
              <OctagonX
                className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0"
                aria-hidden="true"
              />
              <h2
                id="stop-all-dialog-title"
                className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                Confirm Emergency Stop All / Square Off
              </h2>
            </div>

            <div className="px-6 py-4 space-y-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <p>
                This will immediately halt all active workspace automation:
              </p>
              <ul className="space-y-1.5 font-mono tabular-nums text-[11px] bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-slate-700 dark:text-slate-300">
                <li>
                  • Fyers Live Feed:{' '}
                  <strong>
                    {fyersFeed.isStreaming ? 'STREAMING → STOP' : 'Idle'}
                  </strong>
                </li>
                <li>
                  • Active Mode:{' '}
                  <strong>{tradingMode} → PAPER</strong>
                </li>
                <li>
                  • Open Journal Positions: <strong>{openPositionsCount}</strong>
                </li>
                <li>
                  • Bar Replay: <strong>{isPlaying ? 'RUNNING → PAUSE' : 'Paused'}</strong>
                </li>
              </ul>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 dark:bg-[#0E131D] border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowStopAllModal(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStopAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
              >
                <OctagonX className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stop All Now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
