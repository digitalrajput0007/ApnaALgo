import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Code2,
  LogOut,
  Menu,
  Moon,
  OctagonX,
  Radio,
  Send,
  Shield,
  Sun,
  User,
  Wifi,
} from 'lucide-react';
import { FyersQuoteTick } from '../hooks/useFyersLiveFeed';
import { SaaSUser } from '../hooks/useSaaSAuth';
import {
  formatINR,
  getNseMarketStatus,
  NseMarketStatus,
} from '../utils/formatters';
import { SettingsSection } from './SettingsView';
import { UserAvatar } from './UserAvatar';

export type WorkspaceTab =
  | 'dashboard'
  | 'lab'
  | 'backtest1y'
  | 'journal'
  | 'calendar'
  | 'wallet'
  | 'integrations'
  | 'users'
  | 'settings';

export type TradingMode = 'PAPER' | 'LIVE';

const TAB_LABELS: Record<WorkspaceTab, string> = {
  dashboard: 'Overview',
  lab: 'Strategy Lab',
  backtest1y: 'Backtest',
  journal: 'Trades & Positions',
  calendar: 'Paper Calendar',
  wallet: 'Paper Wallet & Risk',
  integrations: 'Integrations',
  users: 'User Management',
  settings: 'Settings',
};

interface TopBarProps {
  activeTab: WorkspaceTab;
  user: SaaSUser;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  tradingMode: TradingMode;
  onRequestModeSwitch: (next: TradingMode) => void;
  onRequestStopAll: () => void;
  onSelectTab: (tab: WorkspaceTab) => void;
  onOpenIntegrationsTab: (sub: 'brokers' | 'telegram') => void;
  onOpenSettingsSection: (section: SettingsSection) => void;
  onSignOut: () => void;
  onOpenMobileMenu: () => void;
  fyersConnected: boolean;
  fyersProfileLabel?: string;
  isLiveStreaming?: boolean;
  liveTick?: FyersQuoteTick | null;
  telegramArmed: boolean;
  telegramDestinationsCount: number;
  paperWalletBalance: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  user,
  theme,
  onToggleTheme,
  tradingMode,
  onRequestModeSwitch,
  onRequestStopAll,
  onSelectTab,
  onOpenIntegrationsTab,
  onOpenSettingsSection,
  onSignOut,
  onOpenMobileMenu,
  fyersConnected,
  fyersProfileLabel,
  isLiveStreaming = false,
  liveTick = null,
  telegramArmed,
  telegramDestinationsCount,
  paperWalletBalance,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [marketStatus, setMarketStatus] = useState<NseMarketStatus>(() =>
    getNseMarketStatus()
  );
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMarketStatus(getNseMarketStatus());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const isAdmin = user.role === 'owner';

  const planBadgeText = (() => {
    if (isAdmin) return 'Admin';
    const labels: Record<string, string> = {
      '1m': '1 Month Plan',
      '3m': '3 Months Plan',
      '6m': '6 Months Plan',
      '1y': '1 Year Plan',
    };
    const label = labels[user.subscriptionPlan] || 'Active Plan';
    if (user.subscriptionExpiresAt) {
      const exp = new Date(user.subscriptionExpiresAt).toLocaleDateString(
        'en-IN',
        { day: 'numeric', month: 'short', year: 'numeric' }
      );
      return `${label} · Exp ${exp}`;
    }
    return label;
  })();

  const ltpFormatted = liveTick
    ? liveTick.ltp.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : null;

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0E131D]/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800/90">
        <div className="px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Mobile Drawer Trigger + Breadcrumb + Desktop Live Connectivity Status */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="Open workspace navigation"
              className="lg:hidden inline-flex items-center justify-center min-w-[40px] min-h-[40px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>

            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-[13px] min-w-0 whitespace-nowrap"
            >
              <button
                type="button"
                onClick={() => onSelectTab('dashboard')}
                className="hidden sm:inline text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer shrink-0"
              >
                NeoAlgo
              </button>
              <span
                className="hidden sm:inline text-slate-300 dark:text-slate-700 shrink-0"
                aria-hidden="true"
              >
                /
              </span>
              <span className="font-display font-semibold text-sm sm:text-[13px] text-slate-900 dark:text-slate-100 truncate">
                {TAB_LABELS[activeTab]}
              </span>
            </nav>

            {/* Desktop Inline Connection & Live Feed Status (Broker · Live Feed · Telegram) */}
            <div className="hidden lg:flex items-center gap-3 pl-3 ml-1 border-l border-slate-200 dark:border-slate-800 text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0">
              <button
                type="button"
                onClick={() => onOpenIntegrationsTab('brokers')}
                title={
                  fyersConnected
                    ? `Fyers connected${fyersProfileLabel ? ` (${fyersProfileLabel})` : ''}`
                    : 'Connect Fyers broker'
                }
                className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    fyersConnected
                      ? 'bg-emerald-500'
                      : 'bg-slate-400 dark:bg-slate-600'
                  }`}
                  aria-hidden="true"
                />
                <span>Broker:</span>
                <span
                  className={
                    fyersConnected
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-slate-500 dark:text-slate-400 font-medium'
                  }
                >
                  {fyersConnected ? 'Fyers' : 'Offline'}
                </span>
              </button>

              {isAdmin && (
                <>
                  <span
                    className="text-slate-300 dark:text-slate-700"
                    aria-hidden="true"
                  >
                    ·
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelectTab('lab')}
                    title={
                      isLiveStreaming
                        ? 'Live feed streaming — click to open Strategy Lab'
                        : 'Open Strategy Lab to start live feed'
                    }
                    className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isLiveStreaming
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-slate-400 dark:bg-slate-600'
                      }`}
                      aria-hidden="true"
                    />
                    <span>Feed:</span>
                    <span
                      className={
                        isLiveStreaming
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400 font-medium'
                      }
                    >
                      {isLiveStreaming
                        ? ltpFormatted
                          ? `Live ${ltpFormatted}`
                          : 'Streaming'
                        : 'Idle'}
                    </span>
                  </button>
                </>
              )}

              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>

              <button
                type="button"
                onClick={() => onOpenIntegrationsTab('telegram')}
                title={
                  telegramArmed
                    ? `Telegram armed (${telegramDestinationsCount} active destination${
                        telegramDestinationsCount === 1 ? '' : 's'
                      })`
                    : 'Configure Telegram trade alerts'
                }
                className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    telegramArmed
                      ? 'bg-emerald-500'
                      : 'bg-slate-400 dark:bg-slate-600'
                  }`}
                  aria-hidden="true"
                />
                <span>Telegram:</span>
                <span
                  className={
                    telegramArmed
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-slate-500 dark:text-slate-400 font-medium'
                  }
                >
                  {telegramArmed
                    ? `Armed${
                        telegramDestinationsCount > 0
                          ? ` (${telegramDestinationsCount})`
                          : ''
                      }`
                    : 'Paused'}
                </span>
              </button>

              <span className="hidden 2xl:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>

              <span className="hidden 2xl:inline text-slate-500 dark:text-slate-400">
                {marketStatus.label} · {liveTick?.istTimeSec || marketStatus.istTime} IST
              </span>
            </div>
          </div>

          {/* Right: Trust & Safety Controls (PAPER/LIVE, Live Paper Wallet, Stop All, Theme, Account) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                onRequestModeSwitch(tradingMode === 'PAPER' ? 'LIVE' : 'PAPER')
              }
              title="Switch between Paper Simulation and Live Trading mode"
              className={`px-2 sm:px-2.5 py-1.5 min-h-[34px] text-[11px] font-mono font-semibold tracking-wide rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tradingMode === 'LIVE'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-slate-100 dark:bg-[#161D2B] border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <span className="hidden sm:inline">
                {tradingMode === 'LIVE' ? 'LIVE MODE' : 'PAPER MODE'}
              </span>
              <span className="sm:hidden">{tradingMode}</span>
            </button>

            {/* Live Paper Wallet Balance (Non-clickable display only) */}
            <div
              aria-label="Live paper wallet balance"
              className="inline-flex items-center px-2.5 py-1.5 min-h-[34px] text-xs font-mono font-semibold tabular-nums rounded-lg border border-slate-200 dark:border-slate-700/90 bg-slate-50 dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 select-none"
            >
              {formatINR(paperWalletBalance, { signed: false, decimals: 0 })}
            </div>

            <button
              type="button"
              onClick={onRequestStopAll}
              title="Stop active feeds and square off open positions"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[34px] text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <OctagonX className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Stop All / Square Off</span>
              <span className="md:hidden">Stop</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
              title={
                theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'
              }
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors shrink-0 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            {/* Account Avatar Dropdown (Single source for Profile, Security, Dev, Sign Out) */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
                className="inline-flex items-center gap-1.5 pl-1 pr-1.5 sm:pr-2 py-1 min-h-[38px] rounded-full hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                <UserAvatar
                  name={user.name}
                  avatarDataUrl={user.avatarDataUrl}
                  size="sm"
                />
                <span className="hidden md:inline text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[120px] truncate">
                  {user.name}
                </span>
                <ChevronDown
                  className="hidden sm:block w-3.5 h-3.5 text-slate-400"
                  aria-hidden="true"
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-60 bg-white dark:bg-[#161D2B] border border-slate-200 dark:border-slate-700/90 rounded-xl shadow-lg py-1.5 z-50"
                >
                  <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {user.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {user.email}
                    </div>
                    <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400 mt-1 truncate">
                      {planBadgeText}
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenSettingsSection('profile');
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white flex items-center gap-2.5 cursor-pointer"
                    >
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Profile &amp; picture</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenSettingsSection('security');
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white flex items-center gap-2.5 cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5 text-slate-400" />
                      <span>Password &amp; recovery</span>
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenSettingsSection('developer');
                        }}
                        className="w-full px-3.5 py-2.5 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white flex items-center gap-2.5 cursor-pointer"
                      >
                        <Code2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Developer &amp; Python code</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onSignOut();
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Connection Status Strip (non-sticky so mobile sticky height stays minimal) */}
      <div
        aria-label="Broker, live feed, and Telegram connection status"
        className="lg:hidden bg-white dark:bg-[#0E131D] border-b border-slate-200/80 dark:border-slate-800/80 px-3"
      >
        <div
          className={`grid ${
            isAdmin ? 'grid-cols-3' : 'grid-cols-2'
          } divide-x divide-slate-200/80 dark:divide-slate-800/80 text-[11px] font-mono tabular-nums`}
        >
          <button
            type="button"
            onClick={() => onOpenIntegrationsTab('brokers')}
            className="min-h-[38px] px-1.5 flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <Wifi
              className={`w-3 h-3 shrink-0 ${
                fyersConnected
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
              aria-hidden="true"
            />
            <span className="truncate">
              {fyersConnected ? 'Fyers On' : 'Broker Off'}
            </span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onSelectTab('lab')}
              className="min-h-[38px] px-1.5 flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <Radio
                className={`w-3 h-3 shrink-0 ${
                  isLiveStreaming
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
                aria-hidden="true"
              />
              <span
                className={`truncate ${
                  isLiveStreaming
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : ''
                }`}
              >
                {isLiveStreaming
                  ? ltpFormatted
                    ? ltpFormatted
                    : 'Feed Live'
                  : 'Feed Idle'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenIntegrationsTab('telegram')}
            className="min-h-[38px] px-1.5 flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <Send
              className={`w-3 h-3 shrink-0 ${
                telegramArmed
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
              aria-hidden="true"
            />
            <span
              className={`truncate ${
                telegramArmed
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                  : ''
              }`}
            >
              {telegramArmed ? 'TG Armed' : 'TG Off'}
            </span>
          </button>
        </div>
      </div>
    </>
  );
};
