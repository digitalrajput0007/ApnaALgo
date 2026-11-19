import React from 'react';
import { Database, Radio, RefreshCw, Square, Wifi } from 'lucide-react';
import { FyersLiveFeedController } from '../hooks/useFyersLiveFeed';
import { formatPct } from '../utils/formatters';
import {
  FYERS_INDEX_PRESETS,
  normalizeFyersSymbol,
} from '../utils/fyersSymbols';

export type { FyersQuoteTick, FyersStatus } from '../hooks/useFyersLiveFeed';

interface FyersLiveBarProps {
  feed: FyersLiveFeedController;
  isLiveModeActive: boolean;
  onOpenIntegrations?: () => void;
}

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
    lastDataSource,
    errorMsg,
    handleConnect,
    handleFetchHistory,
    toggleStream,
  } = feed;

  const trimmedCustom = customSymbol.trim();
  const normalizedCustomPreview = trimmedCustom
    ? normalizeFyersSymbol(trimmedCustom)
    : '';

  if (loadingStatus) {
    return (
      <section className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/90 rounded-xl px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
        Checking broker connection...
      </section>
    );
  }

  return (
    <section
      aria-label="Fyers Real-Time Market Feed"
      className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800/90 rounded-xl overflow-hidden"
    >
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Compact Broker & Live Quote Status */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs min-w-0">
          <Wifi
            className={`w-4 h-4 shrink-0 ${
              isStreaming
                ? 'text-emerald-500'
                : status?.authenticated
                ? 'text-blue-500'
                : 'text-slate-400 dark:text-slate-500'
            }`}
            aria-hidden="true"
          />

          {!status?.configured ? (
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              Broker credentials not configured on server
            </span>
          ) : !status.authenticated ? (
            <span className="text-slate-600 dark:text-slate-400">
              Fyers is not connected yet
            </span>
          ) : (
            <span className="font-medium text-slate-800 dark:text-slate-200">
              Fyers ·{' '}
              <span className="font-mono text-slate-600 dark:text-slate-400">
                {status.profile?.fy_id || status.profile?.name || 'Connected'}
              </span>
            </span>
          )}

          {lastDataSource === 'database' && !isStreaming && (
            <span
              title="Historical candles served from local server database without calling Fyers API"
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-md"
            >
              <Database className="w-3 h-3" aria-hidden="true" />
              <span>Local DB</span>
            </span>
          )}

          {latestQuote && (isLiveModeActive || isStreaming) && (
            <>
              <span
                className="text-slate-300 dark:text-slate-700"
                aria-hidden="true"
              >
                ·
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {latestQuote.ltp.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                <span
                  className={
                    latestQuote.change >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                >
                  ({latestQuote.change >= 0 ? '+' : ''}
                  {latestQuote.change.toFixed(2)} /{' '}
                  {formatPct(latestQuote.changePct)})
                </span>
                {latestQuote.istTimeSec && (
                  <span className="text-slate-400 dark:text-slate-500 font-normal ml-1.5">
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
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Connect Fyers
                </button>
              )}
              {onOpenIntegrations && (
                <button
                  type="button"
                  onClick={onOpenIntegrations}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
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
                  const next = e.target.value;
                  setSymbol(next);
                  setCustomSymbol('');
                  if (!isStreaming) {
                    void handleFetchHistory(next);
                  }
                }}
                disabled={isStreaming}
                aria-label="Symbol"
                className="px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 disabled:opacity-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                {FYERS_INDEX_PRESETS.map((opt) => (
                  <option key={opt.symbol} value={opt.symbol}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="relative flex items-center">
                <input
                  type="text"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isStreaming && !fetchingHistory) {
                      e.preventDefault();
                      void handleFetchHistory(
                        customSymbol.trim() || symbol
                      );
                    }
                  }}
                  disabled={isStreaming}
                  placeholder="e.g. SBIN, RELIANCE"
                  title={
                    normalizedCustomPreview
                      ? `Resolves to ${normalizedCustomPreview} — press Enter to load`
                      : 'Enter any NSE/BSE symbol (e.g. SBIN, NSE:SBIN, RELIANCE, TCS)'
                  }
                  aria-label="Custom Fyers symbol"
                  className="w-40 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 disabled:opacity-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <input
                type="date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                aria-label="Session date"
                className="px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />

              <button
                type="button"
                onClick={() => void handleFetchHistory()}
                disabled={fetchingHistory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
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

      {trimmedCustom &&
        normalizedCustomPreview &&
        normalizedCustomPreview !== trimmedCustom.toUpperCase() && (
          <div className="px-4 py-1.5 bg-slate-50 dark:bg-[#0E131E] border-t border-slate-200/80 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>
              Symbol mapped automatically to{' '}
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {normalizedCustomPreview}
              </span>{' '}
              (press Enter or click Fetch 5m)
            </span>
          </div>
        )}

      {errorMsg && (
        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-500/10 border-t border-red-200 dark:border-red-500/20 text-xs text-red-700 dark:text-red-400">
          {errorMsg}
        </div>
      )}
    </section>
  );
};
