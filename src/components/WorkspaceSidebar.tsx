import React from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Link2,
  Square,
  Users,
  X,
} from 'lucide-react';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';
import { BrandLogo } from './BrandLogo';
import { WorkspaceTab } from './TopBar';

interface WorkspaceSidebarProps {
  isAdmin: boolean;
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
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
  isAdmin,
  activeTab,
  onSelectTab,
  fyersFeed,
  paperTradeCount,
  journalPositionCount,
  connectedIntegrationsCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const primaryItems: NavItem[] = isAdmin
    ? [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
        { id: 'lab', label: 'Strategy Lab', icon: Activity },
        { id: 'backtest1y', label: 'Backtest', icon: BarChart3 },
        {
          id: 'journal',
          label: 'Trades & Positions',
          icon: ClipboardList,
          meta:
            journalPositionCount > 0 ? String(journalPositionCount) : undefined,
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
        { id: 'users', label: 'User Management', icon: Users },
      ]
    : [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
        {
          id: 'journal',
          label: 'Trades & Positions',
          icon: ClipboardList,
          meta:
            journalPositionCount > 0 ? String(journalPositionCount) : undefined,
        },
        {
          id: 'integrations',
          label: 'Broker & Alerts',
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
    <div className="flex flex-col h-full bg-white dark:bg-[#0E131D] border-r border-slate-200/90 dark:border-slate-800/90">
      {/* Brand Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/90 shrink-0">
        <button
          type="button"
          onClick={() => handleSelect('dashboard')}
          className="text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded-md"
        >
          <BrandLogo size="sm" />
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Focused Workspace Navigation */}
      <nav
        aria-label="Primary workspace navigation"
        className="flex-1 overflow-y-auto px-3 py-4"
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
                    ? 'bg-slate-100 dark:bg-[#182032] text-slate-950 dark:text-slate-50 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-[#141B29] hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.meta && (
                  <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500">
                    {item.meta}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Live Stream Strip (only shown when live feed is active) */}
      {fyersFeed.isStreaming && (
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/90 shrink-0 bg-[#FCFCFD] dark:bg-[#0B0F17]">
          <div className="px-2.5 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/30 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-emerald-800 dark:text-emerald-300">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate font-semibold">
                {fyersFeed.latestQuote
                  ? fyersFeed.latestQuote.ltp.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : 'Live feed'}
              </span>
            </span>
            <button
              type="button"
              onClick={fyersFeed.stopStream}
              className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:text-red-700 font-sans font-semibold shrink-0 cursor-pointer"
            >
              <Square
                className="w-2.5 h-2.5 fill-current"
                aria-hidden="true"
              />
              <span>Stop</span>
            </button>
          </div>
        </div>
      )}
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
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
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
