import React, { useState } from 'react';
import {
  Check,
  Copy,
  LogOut,
  Radio,
  RefreshCw,
  Square,
  Wifi,
} from 'lucide-react';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';

export type { FyersQuoteTick, FyersStatus } from '../hooks/useFyersLiveFeed';

interface FyersLiveBarProps {
  feed: FyersLiveFeedController;
  isLiveModeActive: boolean;
}

const SYMBOL_OPTIONS = [
  'NSE:NIFTY50-INDEX',
  'NSE:NIFTYBANK-INDEX',
  'NSE:FINNIFTY-INDEX',
];

export const FyersLiveBar: React.FC<FyersLiveBarProps> = ({
  feed,
  isLiveModeActive,
}) => {
  const [copiedCallback, setCopiedCallback] = useState(false);
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
    handleDisconnect,
    handleFetchHistory,
    toggleStream,
  } = feed;

  const handleCopyCallback = async () => {
    if (!status?.callbackUrl) return;
    try {
      await navigator.clipboard.writeText(status.callbackUrl);
      setCopiedCallback(true);
      setTimeout(() => setCopiedCallback(false), 1800);
    } catch {
      // ignore
    }
  };

  if (loadingStatus) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 text-xs text-slate-500">
        Checking Fyers API v3 connection status...
      </section>
    );
  }

  return (
    <section
      aria-label="Fyers Real-Time Market Feed"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Status & Profile */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 font-display font-semibold text-slate-900">
            <Wifi
              className={`w-4 h-4 ${
                isStreaming
                  ? 'text-emerald-600'
                  : status?.authenticated
                  ? 'text-blue-600'
                  : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span>Fyers API v3 Data Feed</span>
          </div>

          <span className="text-slate-300" aria-hidden="true">
            ·
          </span>

          {!status?.configured ? (
            <span className="text-amber-700 font-medium">
              Set FYERS_APP_ID &amp; FYERS_SECRET_ID in AI Studio Secrets to
              enable live sign-in
            </span>
          ) : !status.authenticated ? (
            <span className="text-slate-600 font-mono tabular-nums">
              App ID: <strong className="text-slate-900">{status.appId}</strong>
            </span>
          ) : (
            <span className="text-emerald-700 font-medium font-mono tabular-nums">
              Connected: {status.profile?.fy_id || 'Fyers User'}
              {status.profile?.name ? ` (${status.profile.name})` : ''}
              <span className="text-slate-400 font-sans font-normal ml-2">
                {status.autoRefreshEnabled
                  ? '· Saved (15d auto-refresh)'
                  : '· Saved across reloads'}
              </span>
            </span>
          )}

          {latestQuote && (isLiveModeActive || isStreaming) && (
            <>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {latestQuote.symbol} {latestQuote.ltp.toFixed(2)}{' '}
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
                    @ {latestQuote.istTimeSec} IST
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!status?.authenticated && status?.callbackUrl && (
            <button
              type="button"
              onClick={handleCopyCallback}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {copiedCallback ? (
                <>
                  <Check
                    className="w-3.5 h-3.5 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span>Redirect URI Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy Redirect URI</span>
                </>
              )}
            </button>
          )}

          {status?.configured && !status.authenticated && (
            <button
              type="button"
              onClick={() => void handleConnect()}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>Connect Fyers Account</span>
            </button>
          )}

          {status?.authenticated && (
            <>
              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setCustomSymbol('');
                }}
                disabled={isStreaming}
                aria-label="Fyers Symbol"
                className="px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 disabled:bg-slate-50 disabled:text-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                placeholder="Or NSE:NIFTY26NOVFUT"
                aria-label="Custom Fyers symbol"
                className="w-40 px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 disabled:bg-slate-50 disabled:text-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />

              <input
                type="date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                aria-label="Trading session date"
                className="px-2.5 py-1.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />

              <button
                type="button"
                onClick={() => void handleFetchHistory()}
                disabled={fetchingHistory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${fetchingHistory ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{fetchingHistory ? 'Fetching...' : 'Fetch 5m Data'}</span>
              </button>

              <button
                type="button"
                onClick={toggleStream}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isStreaming
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isStreaming ? (
                  <>
                    <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                    <span>Stop Live Stream</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Start Live Stream</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => void handleDisconnect()}
                aria-label="Disconnect Fyers session"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Disconnect</span>
              </button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="px-5 py-2.5 bg-red-50 border-t border-red-200 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
    </section>
  );
};
