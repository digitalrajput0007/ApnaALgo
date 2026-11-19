import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Link2,
  LogOut,
  Menu,
  Shield,
  Square,
  User,
} from 'lucide-react';
import { FyersQuoteTick } from '../hooks/useFyersLiveFeed';
import { SaaSUser } from '../hooks/useSaaSAuth';
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
  onSelectTab: (tab: WorkspaceTab) => void;
  onOpenSettingsSection: (section: SettingsSection) => void;
  onSignOut: () => void;
  onOpenMobileMenu: () => void;
  isLiveStreaming?: boolean;
  liveTick?: FyersQuoteTick | null;
  onStopLiveStream?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  user,
  onSelectTab,
  onOpenSettingsSection,
  onSignOut,
  onOpenMobileMenu,
  isLiveStreaming = false,
  liveTick = null,
  onStopLiveStream,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200/90">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
        {/* Left: Mobile Drawer Trigger + Quiet Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open workspace navigation"
            className="lg:hidden inline-flex items-center justify-center w-9 h-9 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0 cursor-pointer"
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
              className="text-slate-500 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
            >
              NeoAlgo
            </button>
            <span className="text-slate-300 shrink-0" aria-hidden="true">
              /
            </span>
            <span className="font-display font-semibold text-slate-900 truncate">
              {TAB_LABELS[activeTab]}
            </span>
          </nav>
        </div>

        {/* Right: Active Live Stream Pill (only while streaming) + Profile Menu */}
        <div className="flex items-center gap-3 shrink-0">
          {isLiveStreaming && (
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono tabular-nums bg-emerald-50 border border-emerald-200/90 rounded-lg text-emerald-800 whitespace-nowrap shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold">
                LIVE{liveTick ? ` ${liveTick.ltp.toFixed(2)}` : ''}
              </span>
              {onStopLiveStream && (
                <button
                  type="button"
                  onClick={onStopLiveStream}
                  title="Stop Live Stream"
                  className="inline-flex items-center gap-1 ml-1 pl-2 border-l border-emerald-300 text-red-600 hover:text-red-700 font-sans font-semibold cursor-pointer"
                >
                  <Square
                    className="w-2.5 h-2.5 fill-current"
                    aria-hidden="true"
                  />
                  <span>Stop</span>
                </button>
              )}
            </div>
          )}

          {/* Account Avatar Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20"
            >
              <UserAvatar
                name={user.name}
                avatarDataUrl={user.avatarDataUrl}
                size="sm"
              />
              <span className="hidden md:inline text-xs font-medium text-slate-800 max-w-[130px] truncate">
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
                className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50"
              >
                <div className="px-3.5 py-2.5 border-b border-slate-100">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {user.name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
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
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5 cursor-pointer"
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
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5 cursor-pointer"
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
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5 cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Brokers &amp; Telegram</span>
                  </button>
                </div>

                <div className="pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2.5 cursor-pointer"
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
