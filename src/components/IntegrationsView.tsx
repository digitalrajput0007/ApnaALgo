import React, { useEffect, useState } from 'react';
import { Link2, Send } from 'lucide-react';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';
import { SaaSUser } from '../hooks/useSaaSAuth';
import { TelegramAlertsController } from '../hooks/useTelegramAlerts';
import { StrategyConfig } from '../types/strategy';
import { BrokersHubView } from './BrokersHubView';
import { TelegramAlertsView } from './TelegramAlertsView';

export type IntegrationsSubTab = 'brokers' | 'telegram';

interface IntegrationsViewProps {
  user: SaaSUser;
  fyersFeed: FyersLiveFeedController;
  telegram: TelegramAlertsController;
  strategyConfig: StrategyConfig;
  initialSubTab?: IntegrationsSubTab;
  onGoToLab: () => void;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  user,
  fyersFeed,
  telegram,
  strategyConfig,
  initialSubTab = 'brokers',
  onGoToLab,
}) => {
  const [subTab, setSubTab] = useState<IntegrationsSubTab>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('brokers')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'brokers'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Brokers</span>
            {fyersFeed.status?.authenticated && (
              <span className="font-mono text-[11px] text-emerald-700 ml-0.5">
                · 1
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('telegram')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'telegram'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Telegram Alerts</span>
            {telegram.isArmedForLive && (
              <span className="font-mono text-[11px] text-emerald-700 ml-0.5">
                · {telegram.activeDestinationCount}
              </span>
            )}
          </button>
        </div>

        <span className="text-xs text-slate-500">
          All broker &amp; bot credentials are encrypted per account on your
          server
        </span>
      </div>

      {subTab === 'brokers' ? (
        <BrokersHubView
          user={user}
          fyersFeed={fyersFeed}
          onGoToLab={onGoToLab}
        />
      ) : (
        <TelegramAlertsView
          telegram={telegram}
          strategyConfig={strategyConfig}
          isLiveStreaming={fyersFeed.isStreaming}
          activeSymbol={fyersFeed.activeSymbol}
          onGoToLab={onGoToLab}
        />
      )}
    </div>
  );
};
