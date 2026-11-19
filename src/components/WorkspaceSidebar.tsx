import React from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  Code2,
  LayoutDashboard,
  Link2,
  LogOut,
  PlayCircle,
  Send,
  Square,
  X,
} from 'lucide-react';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';
import { SaaSUser } from '../hooks/useSaaSAuth';
import { StrategyConfig } from '../types/strategy';
import { BrandLogo } from './BrandLogo';
import { WorkspaceTab } from './TopBar';

interface WorkspaceSidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  user: SaaSUser;
  onSignOut: () => void;
  fyersFeed: FyersLiveFeedController;
  config: StrategyConfig;
  paperTradeCount: number;
  telegramActiveCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavGroup {
  title: string;
  items: {
    id: WorkspaceTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    meta?: string;
  }[];
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  activeTab,
  onSelectTab,
  user,
  onSignOut,
  fyersFeed,
  config,
  paperTradeCount,
  telegramActiveCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const fyersAuthenticated = Boolean(fyersFeed.status?.authenticated);

  const navGroups: NavGroup[] = [
    {
      title: 'Workspace',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'lab', label: 'Strategy Lab', icon: Activity },
        { id: 'replay', label: 'Trade Replay', icon: PlayCircle },
      ],
    },
    {
      title: 'Research & Journal',
      items: [
        { id: 'backtest1y', label: '1-Year Backtest', icon: BarChart3 },
        {
          id: 'calendar',
          label: 'Paper Calendar',
          icon: CalendarDays,
          meta: paperTradeCount > 0 ? String(paperTradeCount) : undefined,
        },
        {
          id: 'brokers',
          label: 'Brokers',
          icon: Link2,
          meta: fyersAuthenticated ? '1' : undefined,
        },
        {
          id: 'alerts',
          label: 'Telegram Alerts',
          icon: Send,
          meta: telegramActiveCount > 0 ? String(telegramActiveCount) : undefined,
        },
      ],
    },
    {
      title: 'Deployment',
      items: [
        { id: 'code', label: 'Neo Algo Code', icon: Code2 },
        { id: 'guide', label: 'Modification Guide', icon: BookOpen },
      ],
    },
  ];

  const handleSelect = (tab: WorkspaceTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const fyersProfileName =
    fyersFeed.status?.profile?.name ||
    fyersFeed.status?.profile?.fy_id ||
    'Connected';

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand Lockup */}
      <div className="h-15 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => handleSelect('dashboard')}
          className="text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md"
        >
          <BrandLogo size="md" showSubtitle />
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav
        aria-label="Primary workspace navigation"
        className="flex-1 overflow-y-auto px-3 py-5 space-y-6"
      >
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold text-slate-400">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-blue-400' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.meta && (
                    <span
                      className={`font-mono tabular-nums text-[11px] ${
                        isActive ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {item.meta}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: Broker Status + Active Ruleset + Signed-In User Account */}
      <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/70 shrink-0">
        <button
          type="button"
          onClick={() => handleSelect('brokers')}
          className="w-full text-left space-y-1 hover:bg-slate-100/80 -mx-1.5 px-1.5 py-1 rounded-lg transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-500">Broker Vault</span>
            <span
              className={`font-medium ${
                fyersAuthenticated ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {fyersAuthenticated ? 'Fyers Active' : 'Connect Broker'}
            </span>
          </div>
          <div className="text-xs font-medium text-slate-800 truncate">
            {fyersAuthenticated
              ? fyersProfileName
              : 'Manage Fyers & Brokers'}
          </div>
        </button>

        {fyersFeed.isStreaming && (
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-emerald-700">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                {fyersFeed.latestQuote
                  ? fyersFeed.latestQuote.ltp.toFixed(2)
                  : 'Streaming'}
              </span>
            </span>
            <button
              type="button"
              onClick={fyersFeed.stopStream}
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-sans font-semibold cursor-pointer"
            >
              <Square
                className="w-2.5 h-2.5 fill-current"
                aria-hidden="true"
              />
              <span>Stop</span>
            </button>
          </div>
        )}

        <div className="pt-2.5 border-t border-slate-200 text-[11px] text-slate-600 font-mono tabular-nums flex items-center justify-between">
          <span>
            SL {config.stopLossPoints}/T{config.targetPoints}
          </span>
          <span>
            RSI &lt;{config.rsiBuyThreshold}/&gt;{config.rsiSellThreshold}
          </span>
        </div>

        {/* User Account Row */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-display text-xs font-semibold flex items-center justify-center shrink-0">
              {initials || 'TR'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {user.name}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {user.email}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            title="Sign out of NeoAlgo"
            aria-label="Sign out"
            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Permanent Sidebar */}
      <aside className="hidden lg:block w-[248px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace navigation"
        >
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div className="relative w-[264px] max-w-[82vw] h-full z-10 shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
