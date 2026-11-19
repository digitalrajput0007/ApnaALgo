import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Link2,
  LogOut,
  Menu,
  Moon,
  OctagonX,
  Shield,
  Sun,
  User,
} from 'lucide-react';
import { FyersQuoteTick } from '../hooks/useFyersLiveFeed';
import { SaaSUser } from '../hooks/useSaaSAuth';
import { getNseMarketStatus, NseMarketStatus } from '../utils/formatters';
import { SettingsSection } from './SettingsView';
import { UserAvatar } from './UserAvatar';

export type WorkspaceTab =
  | 'dashboard'
  | 'lab'
  | 'backtest1y'
  | 'journal'
  | 'calendar'
  | 'integrations'
  | 'settings';

export type TradingMode = 'PAPER' | 'LIVE';

const TAB_LABELS: Record<WorkspaceTab, string> = {
  dashboard: 'Overview',
  lab: 'Strategy Lab',
  backtest1y: 'Backtest',
  journal: 'Trades & Positions',
  calendar: 'Paper Calendar',
  integrations: 'Integrations',
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
  onOpenSettingsSection: (section: SettingsSection) => void;
  onSignOut: () => void;
  onOpenMobileMenu: () => void;
  isLiveStreaming?: boolean;
  liveTick?: FyersQuoteTick | null;
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
  onOpenSettingsSection,
  onSignOut,
  onOpenMobileMenu,
  isLiveStreaming = false,
  liveTick = null,
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

  const lastUpdateDisplay = liveTick?.istTimeSec || marketStatus.istTime;

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0E131D]/95 backdrop-blur-sm border-b border-slate-200/90 dark:border-slate-800/90">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Left: Mobile Drawer Trigger + Quiet Breadcrumb + NSE Status */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open workspace navigation"
            className="lg:hidden inline-flex items-center justify-center w-9 h-9 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-xs sm:text-[13px] min-w-0 whitespace-nowrap"
          >
            <button
              type="button"
              onClick={() => onSelectTab('dashboard')}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer shrink-0"
            >
              NeoAlgo
            </button>
            <span
              className="text-slate-300 dark:text-slate-700 shrink-0"
              aria-hidden="true"
            >
              /
            </span>
            <span className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
              {TAB_LABELS[activeTab]}
            </span>
          </nav>

          {/* Quiet NSE Market Status & Last Update Timestamp */}
          <div className="hidden xl:flex items-center gap-2 pl-3 ml-1 border-l border-slate-200 dark:border-slate-800 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            <span
              className={
                marketStatus.isOpen
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }
            >
              {marketStatus.label}
            </span>
            <span aria-hidden="true">·</span>
            <span>{lastUpdateDisplay} IST</span>
            {isLiveStreaming && liveTick && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-900 dark:text-slate-100 font-semibold">
                  NIFTY {liveTick.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: Trust & Safety Controls (PAPER/LIVE, Stop All, Theme, Account) */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Clear PAPER vs LIVE Mode Switcher */}
          <button
            type="button"
            onClick={() =>
              onRequestModeSwitch(tradingMode === 'PAPER' ? 'LIVE' : 'PAPER')
            }
            title="Switch between Paper Simulation and Live Trading mode"
            className={`px-2.5 py-1.5 text-[11px] font-mono font-semibold tracking-wide rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tradingMode === 'LIVE'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-100 dark:bg-[#161D2B] border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
            }`}
          >
            {tradingMode === 'LIVE' ? 'LIVE MODE' : 'PAPER MODE'}
          </button>

          {/* Always-Visible Stop All / Square Off Emergency Button */}
          <button
            type="button"
            onClick={onRequestStopAll}
            title="Stop active feeds and square off open positions"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <OctagonX className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Stop All / Square Off</span>
            <span className="sm:hidden">Stop All</span>
          </button>

          {/* Dark / Light Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
            }
            title={
              theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'
            }
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors shrink-0 cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          {/* Account Avatar Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
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
                className="w-3.5 h-3.5 text-slate-400"
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
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenSettingsSection('profile');
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white flex items-center gap-2.5 cursor-pointer"
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
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white flex items-center gap-2.5 cursor-pointer"
                  >
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span>Password &amp; recovery</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onSelectTab('integrations');
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white flex items-center gap-2.5 cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Brokers &amp; Telegram</span>
                  </button>
                </div>

                <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2.5 cursor-pointer"
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
  );
};
