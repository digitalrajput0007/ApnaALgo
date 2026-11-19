import React from 'react';
import { Radio, RefreshCw, Square, Wifi } from 'lucide-react';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';

export type { FyersQuoteTick, FyersStatus } from '../hooks/useFyersLiveFeed';

interface FyersLiveBarProps {
  feed: FyersLiveFeedController;
  isLiveModeActive: boolean;
  onOpenIntegrations?: () => void;
}

const SYMBOL_OPTIONS = [
  'NSE:NIFTY50-INDEX',
  'NSE:NIFTYBANK-INDEX',
  'NSE:FINNIFTY-INDEX',
];

export const FyersLiveBar: React.FC<FyersLiveBarProps> = ({
  feed,
  isLiveModeActive,
  onOpenIntegrations,
}) => {
  const {
    status,
    loadingStatus,
    symbol,
    setSymbol,
    customSymbol,
    setCustomSymbol,
    tradeDate,
    setTradeDate,
    fetchingHistory,
    isStreaming,
    latestQuote,
    errorMsg,
    handleConnect,
    handleFetchHistory,
    toggleStream,
  } = feed;

  if (loadingStatus) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500">
        Checking broker connection...
      </section>
    );
  }

  return (
    <section
      aria-label="Fyers Real-Time Market Feed"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Compact Broker & Live Quote Status */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs min-w-0">
          <Wifi
            className={`w-4 h-4 shrink-0 ${
              isStreaming
                ? 'text-emerald-600'
                : status?.authenticated
                ? 'text-blue-600'
                : 'text-slate-400'
            }`}
            aria-hidden="true"
          />

          {!status?.configured ? (
            <span className="text-amber-700 font-medium">
              Broker credentials not configured on server
            </span>
          ) : !status.authenticated ? (
            <span className="text-slate-600">
              Fyers is not connected yet
            </span>
          ) : (
            <span className="font-medium text-slate-800">
              Fyers ·{' '}
              <span className="font-mono text-slate-600">
                {status.profile?.fy_id || status.profile?.name || 'Connected'}
              </span>
            </span>
          )}

          {latestQuote && (isLiveModeActive || isStreaming) && (
            <>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {latestQuote.ltp.toFixed(2)}{' '}
                <span
                  className={
                    latestQuote.change >= 0
                      ? 'text-emerald-700'
                      : 'text-red-600'
                  }
                >
                  ({latestQuote.change >= 0 ? '+' : ''}
                  {latestQuote.change.toFixed(2)} /{' '}
                  {latestQuote.changePct.toFixed(2)}%)
                </span>
                {latestQuote.istTimeSec && (
                  <span className="text-slate-400 font-normal ml-1.5">
                    {latestQuote.istTimeSec} IST
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Right: Focused Feed Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!status?.authenticated ? (
            <>
              {status?.configured && (
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Connect Fyers
                </button>
              )}
              {onOpenIntegrations && (
                <button
                  type="button"
                  onClick={onOpenIntegrations}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Manage in Integrations
                </button>
              )}
            </>
          ) : (
            <>
              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setCustomSymbol('');
                }}
                disabled={isStreaming}
                aria-label="Symbol"
                className="px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 disabled:bg-slate-50 disabled:text-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                {SYMBOL_OPTIONS.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value)}
                disabled={isStreaming}
                placeholder="Custom symbol"
                aria-label="Custom Fyers symbol"
                className="w-36 px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 disabled:bg-slate-50 disabled:text-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />

              <input
                type="date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                aria-label="Session date"
                className="px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />

              <button
                type="button"
                onClick={() => void handleFetchHistory()}
                disabled={fetchingHistory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    fetchingHistory ? 'animate-spin' : ''
                  }`}
                  aria-hidden="true"
                />
                <span>{fetchingHistory ? 'Loading...' : 'Fetch 5m'}</span>
              </button>

              <button
                type="button"
                onClick={toggleStream}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isStreaming
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isStreaming ? (
                  <>
                    <Square
                      className="w-3 h-3 fill-current"
                      aria-hidden="true"
                    />
                    <span>Stop Live</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Start Live</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-2.5 bg-red-50 border-t border-red-200 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
    </section>
  );
};
