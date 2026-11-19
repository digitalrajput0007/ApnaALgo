import { useCallback, useEffect, useRef, useState } from 'react';
import { Candle } from '../types/strategy';

export interface FyersStatus {
  configured: boolean;
  appId: string | null;
  authenticated: boolean;
  profile: {
    name?: string;
    fy_id?: string;
    email_id?: string;
  } | null;
  autoRefreshEnabled?: boolean;
  callbackUrl: string;
  istToday: string;
}

export interface FyersQuoteTick {
  symbol: string;
  ltp: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  epoch: number;
  istDate?: string;
  istTime: string;
  istTimeSec?: string;
}

interface UseFyersLiveFeedOptions {
  authUserId?: string | null;
  onLoadCandles: (candles: Candle[], label: string, subtitle: string) => void;
  onLiveTick: (tick: FyersQuoteTick, symbol: string) => void;
  onHistorySync: (candles: Candle[], symbol: string, date: string) => void;
}

export interface FyersLiveFeedController {
  status: FyersStatus | null;
  loadingStatus: boolean;
  symbol: string;
  setSymbol: (sym: string) => void;
  customSymbol: string;
  setCustomSymbol: (sym: string) => void;
  activeSymbol: string;
  tradeDate: string;
  setTradeDate: (date: string) => void;
  fetchingHistory: boolean;
  isStreaming: boolean;
  latestQuote: FyersQuoteTick | null;
  errorMsg: string | null;
  handleConnect: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  handleFetchHistory: () => Promise<void>;
  toggleStream: () => void;
  stopStream: () => void;
  refreshStatus: () => Promise<void>;
}

/**
 * Root-level Fyers live feed hook so WebSocket / HTTP quote streaming persists
 * across all tab switches until the user explicitly clicks Stop Live Stream or Disconnect.
 */
export function useFyersLiveFeed({
  authUserId = null,
  onLoadCandles,
  onLiveTick,
  onHistorySync,
}: UseFyersLiveFeedOptions): FyersLiveFeedController {
  const [status, setStatus] = useState<FyersStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [symbol, setSymbol] = useState('NSE:NIFTY50-INDEX');
  const [customSymbol, setCustomSymbol] = useState('');
  const [tradeDate, setTradeDate] = useState('');
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [latestQuote, setLatestQuote] = useState<FyersQuoteTick | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const httpPollRef = useRef<number | null>(null);
  const wsFallbackTimerRef = useRef<number | null>(null);
  const streamingIntentRef = useRef<boolean>(false);

  // Keep latest callbacks in refs so active streams never depend on callback identity
  const onLoadCandlesRef = useRef(onLoadCandles);
  const onLiveTickRef = useRef(onLiveTick);
  const onHistorySyncRef = useRef(onHistorySync);
  useEffect(() => {
    onLoadCandlesRef.current = onLoadCandles;
    onLiveTickRef.current = onLiveTick;
    onHistorySyncRef.current = onHistorySync;
  }, [onLoadCandles, onLiveTick, onHistorySync]);

  const activeSymbol = customSymbol.trim() || symbol;

  const refreshStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/fyers/status', { credentials: 'include' });
      if (!resp.ok) throw new Error('Unable to reach server Fyers status');
      const data = (await resp.json()) as FyersStatus;
      setStatus(data);
      setTradeDate((prev) => prev || data.istToday);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Status check failed');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Listen for OAuth popup postMessage completion (works on AI Studio & custom AWS VPS domains)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      if (event.data?.type === 'FYERS_AUTH_SUCCESS') {
        void refreshStatus();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refreshStatus]);

  const stopStream = useCallback(() => {
    streamingIntentRef.current = false;
    if (wsFallbackTimerRef.current !== null) {
      window.clearTimeout(wsFallbackTimerRef.current);
      wsFallbackTimerRef.current = null;
    }
    if (httpPollRef.current !== null) {
      window.clearInterval(httpPollRef.current);
      httpPollRef.current = null;
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: 'unsubscribe' }));
        }
        wsRef.current.close();
      } catch {
        // ignore close error
      }
      wsRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // Reset active stream & refresh per-user broker status whenever the SaaS user changes
  useEffect(() => {
    stopStream();
    setLatestQuote(null);
    setErrorMsg(null);
    if (!authUserId) {
      setStatus(null);
      setLoadingStatus(false);
      return;
    }
    setLoadingStatus(true);
    void refreshStatus();
  }, [authUserId, refreshStatus, stopStream]);

  const handleConnect = useCallback(async () => {
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/fyers/auth/url', {
        credentials: 'include',
      });
      const data = (await resp.json()) as { url?: string; error?: string };
      if (!resp.ok || !data.url) {
        throw new Error(data.error || 'Failed to construct Fyers OAuth URL');
      }
      const popup = window.open(
        data.url,
        'fyers_oauth_popup',
        'width=600,height=720'
      );
      if (!popup) {
        setErrorMsg(
          'Popup was blocked by your browser. Allow popups for this site to sign in with Fyers.'
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Fyers login error');
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    stopStream();
    setLatestQuote(null);
    await fetch('/api/fyers/logout', {
      method: 'POST',
      credentials: 'include',
    });
    await refreshStatus();
  }, [refreshStatus, stopStream]);

  const handleFetchHistory = useCallback(async () => {
    setErrorMsg(null);
    setFetchingHistory(true);
    try {
      const params = new URLSearchParams({
        symbol: activeSymbol,
        date: tradeDate || status?.istToday || '',
      });
      const resp = await fetch(`/api/fyers/history?${params.toString()}`, {
        credentials: 'include',
      });
      const data = (await resp.json()) as {
        symbol?: string;
        date?: string;
        candles?: Candle[];
        error?: string;
      };
      if (!resp.ok || !data.candles) {
        if (resp.status === 401) {
          void refreshStatus();
        }
        throw new Error(data.error || 'Failed to fetch Fyers 5m candles');
      }
      if (data.candles.length === 0) {
        setErrorMsg(
          `No regular-session 5m candles returned for ${activeSymbol} on ${
            data.date || tradeDate
          } (market holiday, weekend, or pre-open).`
        );
        return;
      }
      onLoadCandlesRef.current(
        data.candles,
        `Fyers Live: ${activeSymbol}`,
        `${data.candles.length} real 5-min bars fetched from Fyers (${data.date})`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'History fetch failed');
    } finally {
      setFetchingHistory(false);
    }
  }, [activeSymbol, refreshStatus, status?.istToday, tradeDate]);

  const startHttpQuoteFallback = useCallback(
    (targetSymbol: string, targetDate: string) => {
      if (!streamingIntentRef.current || httpPollRef.current !== null) return;
      let lastSyncedBucket = '';

      const pollOnce = async () => {
        if (!streamingIntentRef.current) return;
        try {
          const qParams = new URLSearchParams({ symbol: targetSymbol });
          const qResp = await fetch(`/api/fyers/quotes?${qParams.toString()}`, {
            credentials: 'include',
          });
          const qData = (await qResp.json()) as FyersQuoteTick & {
            error?: string;
          };
          if (!qResp.ok || typeof qData.ltp !== 'number') {
            if (qResp.status === 401) {
              setErrorMsg(qData.error || 'Fyers session expired. Reconnect.');
              stopStream();
              void refreshStatus();
            }
            return;
          }
          setLatestQuote(qData);
          onLiveTickRef.current(qData, targetSymbol);

          const [hh, mm] = (qData.istTime || '09:15').split(':').map(Number);
          const bucket = `${String(hh).padStart(2, '0')}:${String(
            Math.floor(mm / 5) * 5
          ).padStart(2, '0')}`;
          if (bucket !== lastSyncedBucket) {
            lastSyncedBucket = bucket;
            const hParams = new URLSearchParams({
              symbol: targetSymbol,
              date: targetDate,
            });
            const hResp = await fetch(
              `/api/fyers/history?${hParams.toString()}`,
              { credentials: 'include' }
            );
            const hData = (await hResp.json()) as {
              candles?: Candle[];
              date?: string;
            };
            if (hResp.ok && hData.candles && hData.candles.length > 0) {
              onHistorySyncRef.current(
                hData.candles,
                targetSymbol,
                hData.date || targetDate
              );
            }
          }
        } catch {
          // Keep retrying on transient network blips
        }
      };

      void pollOnce();
      httpPollRef.current = window.setInterval(() => {
        void pollOnce();
      }, 1000);
    },
    [refreshStatus, stopStream]
  );

  const toggleStream = useCallback(() => {
    if (streamingIntentRef.current) {
      stopStream();
      return;
    }

    setErrorMsg(null);
    streamingIntentRef.current = true;
    setIsStreaming(true);

    const targetSymbol = activeSymbol;
    const targetDate = status?.istToday || tradeDate;
    let receivedWsQuote = false;

    // 1. Immediately load today's complete 5-min bars
    void (async () => {
      try {
        const hParams = new URLSearchParams({
          symbol: targetSymbol,
          date: targetDate,
        });
        const resp = await fetch(`/api/fyers/history?${hParams.toString()}`, {
          credentials: 'include',
        });
        const data = (await resp.json()) as {
          candles?: Candle[];
          date?: string;
        };
        if (resp.ok && data.candles && data.candles.length > 0) {
          onHistorySyncRef.current(
            data.candles,
            targetSymbol,
            data.date || targetDate
          );
        }
      } catch {
        // Non-fatal; WS or fallback poll will sync
      }
    })();

    // 2. Open WebSocket with automatic 1-second HTTP fallback
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/fyers`;

    wsFallbackTimerRef.current = window.setTimeout(() => {
      if (!receivedWsQuote && streamingIntentRef.current) {
        startHttpQuoteFallback(targetSymbol, targetDate);
      }
    }, 2500);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            action: 'subscribe',
            symbol: targetSymbol,
            date: targetDate,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            data?: FyersQuoteTick;
            candles?: Candle[];
            symbol?: string;
            date?: string;
            message?: string;
          };
          if (msg.type === 'quote' && msg.data) {
            receivedWsQuote = true;
            if (wsFallbackTimerRef.current !== null) {
              window.clearTimeout(wsFallbackTimerRef.current);
              wsFallbackTimerRef.current = null;
            }
            if (httpPollRef.current !== null) {
              window.clearInterval(httpPollRef.current);
              httpPollRef.current = null;
            }
            setLatestQuote(msg.data);
            onLiveTickRef.current(msg.data, targetSymbol);
          } else if (msg.type === 'history_sync' && msg.candles) {
            if (msg.candles.length > 0) {
              onHistorySyncRef.current(
                msg.candles,
                msg.symbol || targetSymbol,
                msg.date || targetDate
              );
            }
          } else if (msg.type === 'error' && msg.message) {
            setErrorMsg(msg.message);
          }
        } catch {
          // Ignore non-JSON frame
        }
      };

      ws.onerror = () => {
        if (streamingIntentRef.current) {
          startHttpQuoteFallback(targetSymbol, targetDate);
        }
      };

      ws.onclose = () => {
        if (streamingIntentRef.current) {
          startHttpQuoteFallback(targetSymbol, targetDate);
        }
      };
    } catch {
      startHttpQuoteFallback(targetSymbol, targetDate);
    }
  }, [activeSymbol, startHttpQuoteFallback, status?.istToday, stopStream, tradeDate]);

  return {
    status,
    loadingStatus,
    symbol,
    setSymbol,
    customSymbol,
    setCustomSymbol,
    activeSymbol,
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
    stopStream,
    refreshStatus,
  };
}
