import React from 'react';
import { Download, Menu, Square } from 'lucide-react';
import { FyersQuoteTick } from '../hooks/useFyersLiveFeed';

export type WorkspaceTab =
  | 'dashboard'
  | 'lab'
  | 'replay'
  | 'backtest1y'
  | 'calendar'
  | 'brokers'
  | 'alerts'
  | 'code'
  | 'guide';

const TAB_BREADCRUMBS: Record<WorkspaceTab, { section: string; label: string }> =
  {
    dashboard: { section: 'Workspace', label: 'Executive Dashboard' },
    lab: { section: 'Trading Desk', label: 'Strategy Lab' },
    replay: { section: 'Trading Desk', label: 'Trade Replay' },
    backtest1y: { section: 'Research', label: '1-Year Backtest' },
    calendar: { section: 'Journal', label: 'Paper Trade Calendar' },
    brokers: { section: 'Connections', label: 'Brokers Hub' },
    alerts: { section: 'Connections', label: 'Telegram Alerts' },
    code: { section: 'Engineering', label: 'Neo Algo Code' },
    guide: { section: 'Engineering', label: 'Modification Guide' },
  };

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onDownloadPython: () => void;
  onOpenMobileMenu: () => void;
  isLiveStreaming?: boolean;
  liveTick?: FyersQuoteTick | null;
  onStopLiveStream?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onDownloadPython,
  onOpenMobileMenu,
  isLiveStreaming = false,
  liveTick = null,
  onStopLiveStream,
}) => {
  const crumb = TAB_BREADCRUMBS[activeTab];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="px-4 sm:px-6 h-15 flex items-center justify-between gap-6">
        {/* Left: Mobile drawer trigger + Clean SaaS Breadcrumb */}
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
            className="flex items-center gap-2 text-xs sm:text-sm min-w-0 whitespace-nowrap"
          >
            <button
              type="button"
              onClick={() => onSelectTab('dashboard')}
              className="font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
            >
              NeoAlgo
            </button>
            <span className="text-slate-300 shrink-0" aria-hidden="true">
              /
            </span>
            <span className="hidden sm:inline text-slate-500 shrink-0">
              {crumb.section}
            </span>
            <span
              className="hidden sm:inline text-slate-300 shrink-0"
              aria-hidden="true"
            >
              /
            </span>
            <span className="font-display font-semibold text-slate-900 truncate">
              {crumb.label}
            </span>
          </nav>
        </div>

        {/* Right: Active real-time stream control (only when streaming) + Primary CTA */}
        <div className="flex items-center gap-3 shrink-0">
          {isLiveStreaming && (
            <div className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono tabular-nums bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 whitespace-nowrap shrink-0">
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

          <button
            type="button"
            onClick={onDownloadPython}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export Python</span>
          </button>
        </div>
      </div>
    </header>
  );
};
