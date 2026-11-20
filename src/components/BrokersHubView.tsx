import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Link2,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';
import { SaaSUser } from '../hooks/useSaaSAuth';
import { BrokerLogo, BrokerLogoId } from './BrokerLogos';

interface BrokerStatusItem {
  id: BrokerLogoId;
  name: string;
  shortName: string;
  exchangeCoverage: string;
  availability: 'active' | 'coming_soon';
  authType: 'OAuth 2.0' | 'API Token';
  configured: boolean;
  connected: boolean;
  profile: {
    name?: string;
    clientId?: string;
    email?: string;
    fy_id?: string;
    email_id?: string;
  } | null;
  connectedAt: number | null;
  autoRefreshEnabled: boolean;
  callbackUrl: string | null;
  capabilities: {
    historicalCandles: boolean;
    liveQuotes: boolean;
    orderExecution: boolean;
    autoRefresh: boolean;
  };
  description: string;
}

interface BrokersHubViewProps {
  user: SaaSUser;
  fyersFeed: FyersLiveFeedController;
  onGoToLab: () => void;
}

export const BrokersHubView: React.FC<BrokersHubViewProps> = ({
  user,
  fyersFeed,
  onGoToLab,
}) => {
  const [brokers, setBrokers] = useState<BrokerStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCallback, setCopiedCallback] = useState(false);

  const fetchBrokers = useCallback(async () => {
    try {
      const resp = await fetch('/api/brokers', { credentials: 'include' });
      if (!resp.ok) return;
      const data = (await resp.json()) as { brokers?: BrokerStatusItem[] };
      if (Array.isArray(data.brokers)) {
        setBrokers(data.brokers);
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBrokers();
  }, [fetchBrokers, fyersFeed.status?.authenticated]);

  const fyersBroker = brokers.find((b) => b.id === 'fyers') ?? null;
  const upcomingBrokers = brokers.filter((b) => b.availability !== 'active');

  const handleCopyCallback = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCallback(true);
      toast.success('Redirect URI copied.');
      window.setTimeout(() => setCopiedCallback(false), 1800);
    } catch {
      toast.error('Unable to copy URI.');
    }
  };

  const handleConnectFyers = async () => {
    await fyersFeed.handleConnect();
  };

  const handleDisconnectFyers = async () => {
    await fyersFeed.handleDisconnect();
    await fetchBrokers();
    toast.success('Fyers account disconnected.');
  };

  const isFyersConnected = Boolean(fyersFeed.status?.authenticated);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Connected Broker
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tokens are stored in an encrypted vault scoped to{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {user.email}
            </span>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void fyersFeed.refreshStatus();
            void fetchBrokers();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Primary Broker Card: Fyers API v3 */}
      <section className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/90 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <BrokerLogo brokerId="fyers" size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Fyers
                </h3>
                <span
                  className={`text-xs font-semibold ${
                    isFyersConnected
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  · {isFyersConnected ? 'Connected' : 'Ready to connect'}
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                API v3 ·{' '}
                {fyersBroker?.exchangeCoverage || 'NSE · NFO · MCX · BSE'} ·
                OAuth 2.0
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isFyersConnected ? (
              <>
                {user.role === 'owner' && (
                  <button
                    type="button"
                    onClick={onGoToLab}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>Open Strategy Lab</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleConnectFyers}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reconnect</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectFyers}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Disconnect</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnectFyers}
                disabled={!fyersFeed.status?.configured}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Connect Fyers</span>
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {user.role === 'owner'
                ? fyersBroker?.description ||
                  'Connect your Fyers trading account via OAuth 2.0 for historical market data, real-time quotes, and automated journal sync.'
                : 'Connect your Fyers trading account securely via OAuth 2.0 to enable automated order execution and real-time position tracking.'}
            </p>

            {fyersFeed.errorMsg && (
              <div className="px-3.5 py-2.5 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded-lg">
                {fyersFeed.errorMsg}
              </div>
            )}

            {fyersFeed.status && !fyersFeed.status.configured && (
              <div className="px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-lg">
                Configure{' '}
                <code className="font-mono font-semibold">FYERS_APP_ID</code>{' '}
                and{' '}
                <code className="font-mono font-semibold">FYERS_SECRET_ID</code>{' '}
                on the server to enable Fyers sign-in.
              </div>
            )}

            {fyersFeed.status?.callbackUrl && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  OAuth Redirect URI (myapi.fyers.in)
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg truncate">
                    {fyersFeed.status.callbackUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyCallback(fyersFeed.status!.callbackUrl)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedCallback ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Account Summary Panel */}
          <div className="lg:col-span-5 bg-[#F9FAFB] dark:bg-[#0E131D] border border-slate-200/90 dark:border-slate-800/90 rounded-lg divide-y divide-slate-200/80 dark:divide-slate-800/80 text-xs">
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                Account Holder
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {fyersFeed.status?.profile?.name || '—'}
              </span>
            </div>
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                Client ID
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {fyersFeed.status?.profile?.fy_id || '—'}
              </span>
            </div>
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                Live Feed
              </span>
              <span
                className={`font-medium ${
                  fyersFeed.isStreaming
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : isFyersConnected
                    ? 'text-slate-800 dark:text-slate-200'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {fyersFeed.isStreaming
                  ? 'Streaming Live'
                  : isFyersConnected
                  ? 'Standby'
                  : 'Offline'}
              </span>
            </div>
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                Session Renewal
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {fyersFeed.status?.autoRefreshEnabled
                  ? '15-Day Auto-Refresh'
                  : 'Daily (06:00 IST)'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Indian Broker Directory (Upcoming Connectors) */}
      <section className="space-y-3.5">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            More Indian Brokers
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Additional broker adapters coming to the NeoAlgo connector hub.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-36 bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingBrokers.map((broker) => (
              <div
                key={broker.id}
                className="bg-white dark:bg-[#111622] border border-slate-200/90 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <BrokerLogo brokerId={broker.id} size="md" />
                      <div className="min-w-0">
                        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {broker.name}
                        </h3>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          {broker.exchangeCoverage}
                        </div>
                      </div>
                    </div>

                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0 pt-0.5">
                      Coming soon
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {broker.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{broker.authType}</span>
                  <span>
                    {broker.capabilities.historicalCandles ? 'Market History' : ''}
                    {broker.capabilities.liveQuotes ? ' · Live Feed' : ''}
                    {broker.capabilities.orderExecution ? ' · Orders' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
