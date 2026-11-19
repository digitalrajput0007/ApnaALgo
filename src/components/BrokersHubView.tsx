import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';
import { SaaSUser } from '../hooks/useSaaSAuth';

interface BrokerStatusItem {
  id: 'fyers' | 'zerodha' | 'dhan' | 'upstox' | 'angelone';
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
      window.setTimeout(() => setCopiedCallback(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleConnectFyers = async () => {
    await fyersFeed.handleConnect();
  };

  const handleDisconnectFyers = async () => {
    await fyersFeed.handleDisconnect();
    await fetchBrokers();
  };

  const connectedCount = brokers.filter((b) => b.connected).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Broker Connections
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Each user connects their own broker account inside an encrypted
            per-user vault. Signed in as{' '}
            <span className="font-medium text-slate-900">{user.email}</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void fyersFeed.refreshStatus();
            void fetchBrokers();
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Refresh Status</span>
        </button>
      </section>

      {/* 3-Column Broker Vault Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500">
            Connected Brokers
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-bold text-slate-900">
            {connectedCount} / 1 Active
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Fyers API v3 live · {upcomingBrokers.length} brokers in roadmap
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500">
            Tenant Isolation
          </div>
          <div className="mt-1.5 font-display text-lg font-bold text-emerald-700">
            Per-User Vault
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            AES-256-GCM encrypted tokens scoped to your account ID
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-xs font-medium text-slate-500">
            Active Market Data Feed
          </div>
          <div className="mt-1.5 font-display text-lg font-bold text-slate-900">
            {fyersFeed.status?.authenticated
              ? fyersFeed.isStreaming
                ? 'Fyers Live Streaming'
                : 'Fyers Ready'
              : 'Not Connected'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {fyersFeed.status?.authenticated
              ? 'Historical 5m candles & 1s live quotes enabled'
              : 'Connect Fyers below to enable live quotes and 1Y backtests'}
          </div>
        </div>
      </section>

      {/* Active Broker: Fyers API v3 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-emerald-700">
                Supported Now
              </span>
              <span aria-hidden="true">·</span>
              <span>{fyersBroker?.exchangeCoverage || 'NSE · NFO · MCX · BSE'}</span>
              <span aria-hidden="true">·</span>
              <span>OAuth 2.0</span>
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
              Fyers API v3
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {fyersFeed.status?.authenticated ? (
              <>
                <button
                  type="button"
                  onClick={onGoToLab}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open Live Strategy Lab</span>
                </button>
                <button
                  type="button"
                  onClick={handleConnectFyers}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Reconnect</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectFyers}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
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
                <span>Connect Fyers Account</span>
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-sm text-slate-600 leading-relaxed">
              {fyersBroker?.description ||
                'Connect your personal Fyers trading account via Fyers API v3 OAuth to unlock 1-year 5-minute NIFTY backtesting, live 1-second candle formation, and parameter optimization.'}
            </p>

            {fyersFeed.errorMsg && (
              <div className="px-3.5 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {fyersFeed.errorMsg}
              </div>
            )}

            {fyersFeed.status && !fyersFeed.status.configured && (
              <div className="px-3.5 py-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
                Server admin setup required: add{' '}
                <code className="font-mono font-semibold">FYERS_APP_ID</code>{' '}
                and{' '}
                <code className="font-mono font-semibold">FYERS_SECRET_ID</code>{' '}
                to your VPS <code className="font-mono">.env</code> file so
                users can authenticate with Fyers.
              </div>
            )}

            {fyersFeed.status?.callbackUrl && (
              <div className="pt-1 space-y-1.5">
                <div className="text-[11px] font-medium text-slate-500">
                  Fyers App Redirect URI (configure once on myapi.fyers.in)
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-lg truncate">
                    {fyersFeed.status.callbackUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyCallback(fyersFeed.status!.callbackUrl)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedCallback ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy URI</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Connected Account Details */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-lg divide-y divide-slate-200 text-xs">
            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <span className="text-slate-500">Connection Status</span>
              <span
                className={`font-semibold ${
                  fyersFeed.status?.authenticated
                    ? 'text-emerald-700'
                    : 'text-slate-600'
                }`}
              >
                {fyersFeed.status?.authenticated
                  ? 'Connected & Authenticated'
                  : 'Not Connected'}
              </span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <span className="text-slate-500">Fyers Client ID</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {fyersFeed.status?.profile?.fy_id || '—'}
              </span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <span className="text-slate-500">Account Holder</span>
              <span className="font-medium text-slate-900">
                {fyersFeed.status?.profile?.name || '—'}
              </span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <span className="text-slate-500">Token Persistence</span>
              <span className="font-medium text-slate-700">
                {fyersFeed.status?.autoRefreshEnabled
                  ? '15-Day Auto-Refresh Active'
                  : 'Daily Session (SEBI 06:00 IST reset)'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Extensible Multi-Broker Roadmap */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Upcoming Broker Connectors
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              NeoAlgo uses a modular broker registry so additional Indian
              brokers plug into the same encrypted per-user vault and charting
              engine.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Adapter Interface: server/brokers/types.ts
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcomingBrokers.map((broker) => (
              <div
                key={broker.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      {broker.name}
                    </h3>
                    <span className="text-[11px] font-medium text-slate-500">
                      Planned · {broker.authType}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {broker.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-mono">{broker.exchangeCoverage}</span>
                  <span>
                    {broker.capabilities.historicalCandles ? '5m History' : ''}{' '}
                    · {broker.capabilities.liveQuotes ? 'Live Feed' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AWS VPS Multi-User Security Summary */}
      <section className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck
            className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="text-xs text-slate-600 space-y-0.5">
            <div className="font-semibold text-slate-900">
              AWS VPS Self-Hosted Deployment Ready
            </div>
            <p>
              Set <code className="font-mono text-slate-800">APP_URL</code>,{' '}
              <code className="font-mono text-slate-800">SESSION_SECRET</code>,{' '}
              <code className="font-mono text-slate-800">FYERS_APP_ID</code>,
              and{' '}
              <code className="font-mono text-slate-800">FYERS_SECRET_ID</code>{' '}
              in your VPS <code className="font-mono text-slate-800">.env</code>
              , then run{' '}
              <code className="font-mono text-slate-800">
                npm run build &amp;&amp; NODE_ENV=production npm start
              </code>
              . All users, paper calendars, and encrypted broker tokens persist
              under <code className="font-mono text-slate-800">DATA_DIR</code>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
