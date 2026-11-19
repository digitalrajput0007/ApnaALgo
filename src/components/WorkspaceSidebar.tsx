import React from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Link2,
  LogOut,
  Settings,
  Square,
  X,
} from 'lucide-react';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';
import { SaaSUser } from '../hooks/useSaaSAuth';
import { BrandLogo } from './BrandLogo';
import { WorkspaceTab } from './TopBar';
import { UserAvatar } from './UserAvatar';

interface WorkspaceSidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  user: SaaSUser;
  onSignOut: () => void;
  fyersFeed: FyersLiveFeedController;
  paperTradeCount: number;
  journalPositionCount: number;
  connectedIntegrationsCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: WorkspaceTab;
  label: string;
  icon: React.FC<{ className?: string }>;
  meta?: string;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  activeTab,
  onSelectTab,
  user,
  onSignOut,
  fyersFeed,
  paperTradeCount,
  journalPositionCount,
  connectedIntegrationsCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const primaryItems: NavItem[] = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'lab', label: 'Strategy Lab', icon: Activity },
    { id: 'backtest1y', label: 'Backtest', icon: BarChart3 },
    {
      id: 'journal',
      label: 'Trades & Positions',
      icon: ClipboardList,
      meta: journalPositionCount > 0 ? String(journalPositionCount) : undefined,
    },
    {
      id: 'calendar',
      label: 'Paper Calendar',
      icon: CalendarDays,
      meta: paperTradeCount > 0 ? String(paperTradeCount) : undefined,
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: Link2,
      meta:
        connectedIntegrationsCount > 0
          ? String(connectedIntegrationsCount)
          : undefined,
    },
  ];

  const handleSelect = (tab: WorkspaceTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200/90">
      {/* Brand Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200/80 shrink-0">
        <button
          type="button"
          onClick={() => handleSelect('dashboard')}
          className="text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 rounded-md"
        >
          <BrandLogo size="sm" />
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

      {/* Focused Primary Navigation */}
      <nav
        aria-label="Primary workspace navigation"
        className="flex-1 overflow-y-auto px-3 py-4 flex flex-col justify-between gap-4"
      >
        <div className="space-y-1">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-slate-100 text-slate-950 font-semibold'
                    : 'text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-blue-600' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.meta && (
                  <span className="font-mono tabular-nums text-[11px] text-slate-400">
                    {item.meta}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom Workspace Settings Link */}
        <div className="pt-3 border-t border-slate-100 space-y-1">
          <button
            type="button"
            onClick={() => handleSelect('settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-slate-100 text-slate-950 font-semibold'
                : 'text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Settings
              className={`w-4 h-4 shrink-0 ${
                activeTab === 'settings' ? 'text-blue-600' : 'text-slate-400'
              }`}
            />
            <span>Settings</span>
          </button>
        </div>
      </nav>

      {/* Quiet Live Stream Strip (only when streaming) + Profile Footer */}
      <div className="p-3 border-t border-slate-200/80 space-y-2.5 shrink-0 bg-[#FCFCFD]">
        {fyersFeed.isStreaming && (
          <div className="px-2.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-emerald-800">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate font-semibold">
                {fyersFeed.latestQuote
                  ? fyersFeed.latestQuote.ltp.toFixed(2)
                  : 'Live feed'}
              </span>
            </span>
            <button
              type="button"
              onClick={fyersFeed.stopStream}
              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-sans font-semibold shrink-0 cursor-pointer"
            >
              <Square
                className="w-2.5 h-2.5 fill-current"
                aria-hidden="true"
              />
              <span>Stop</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => handleSelect('settings')}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left p-1 rounded-lg hover:bg-slate-100/80 transition-colors cursor-pointer"
          >
            <UserAvatar
              name={user.name}
              avatarDataUrl={user.avatarDataUrl}
              size="sm"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {user.name}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {user.email}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[232px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace navigation"
        >
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div className="relative w-[256px] max-w-[82vw] h-full z-10 shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
