import { useCallback, useEffect, useRef, useState } from 'react';
import { Candle } from '../types/strategy';
import {
  FYERS_INDEX_PRESETS,
  normalizeFyersSymbol,
} from '../utils/fyersSymbols';

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
  istTimeSec: string;
}

export interface FyersActiveStreamMeta {
  active: boolean;
  symbol: string;
  optionSymbol: string | null;
  startedAt: number | null;
  date: string;
}

export interface FyersStatus {
  configured: boolean;
  appId: string | null;
  authenticated: boolean;
  profile: {
    name?: string;
    fy_id?: string;
    email_id?: string;
  } | null;
  connectedAt?: number | null;
  lastRefreshedAt?: number | null;
  tokenStale?: boolean;
  hasPin?: boolean;
  pinSource?: 'account' | 'server' | null;
  autoRefreshEnabled?: boolean;
  callbackUrl: string;
  istToday: string;
  activeStream?: FyersActiveStreamMeta | null;
}

export const FYERS_SYMBOL_OPTIONS = FYERS_INDEX_PRESETS.map((p) => p.symbol);

export interface UseFyersLiveFeedOptions {
  authUserId?: string | null;
  onLoadCandles: (
    candles: Candle[],
    label: string,
    subtitle: string,
    symbol?: string
  ) => void;
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
  date: string;
  setDate: (d: string) => void;
  tradeDate: string;
  setTradeDate: (d: string) => void;
  loadingHistory: boolean;
  fetchingHistory: boolean;
  lastDataSource: 'database' | 'fyers' | null;
  isStreaming: boolean;
  streamTransport: 'ws' | 'http' | null;
  latestQuote: FyersQuoteTick | null;
  latestOptionQuote: FyersQuoteTick | null;
  streamedOptionSymbol: string | null;
  setStreamedOptionSymbol: (optionSymbol: string | null) => void;
  errorMsg: string | null;
  setErrorMsg: (msg: string | null) => void;
  infoMsg: string | null;
  setInfoMsg: (msg: string | null) => void;
  refreshStatus: () => Promise<void>;
  handleConnect: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  saveFyersPin: (pin: string | null) => Promise<{
    ok: boolean;
    refreshedNow?: boolean;
    error?: string;
  }>;
  fetchHistoryForDate: (
    targetDate?: string,
    targetSymbol?: string
  ) => Promise<void>;
  handleFetchHistory: (
    targetDate?: string,
    targetSymbol?: string
  ) => Promise<void>;
  toggleStream: () => void;
  stopStream: () => void;
}

interface StreamStateResponse {
  active: boolean;
  symbol: string;
  optionSymbol: string | null;
  startedAt: number | null;
  date: string;
  latestQuote: FyersQuoteTick | null;
  latestOptionQuote: FyersQuoteTick | null;
  candles: Candle[];
  lastError: string | null;
}

export function useFyersLiveFeed({
  authUserId = null,
  onLoadCandles,
  onLiveTick,
  onHistorySync,
}: UseFyersLiveFeedOptions): FyersLiveFeedController {
  const [status, setStatus] = useState<FyersStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [symbol, setSymbol] = useState<string>('NSE:NIFTY50-INDEX');
  const [customSymbol, setCustomSymbol] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [lastDataSource, setLastDataSource] = useState<
    'database' | 'fyers' | null
  >(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamTransport, setStreamTransport] = useState<'ws' | 'http' | null>(
    null
  );
  const [latestQuote, setLatestQuote] = useState<FyersQuoteTick | null>(null);
  const [latestOptionQuote, setLatestOptionQuote] =
    useState<FyersQuoteTick | null>(null);
  const [streamedOptionSymbol, setStreamedOptionSymbolState] = useState<
    string | null
  >(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const httpPollRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const isStreamingRef = useRef<boolean>(false);
  const activeSymbolRef = useRef<string>('NSE:NIFTY50-INDEX');
  const streamedOptionSymbolRef = useRef<string | null>(null);
  const mountedRef = useRef<boolean>(true);

  const onLiveTickRef = useRef(onLiveTick);
  onLiveTickRef.current = onLiveTick;
  const onHistorySyncRef = useRef(onHistorySync);
  onHistorySyncRef.current = onHistorySync;
  const onLoadCandlesRef = useRef(onLoadCandles);
  onLoadCandlesRef.current = onLoadCandles;

  const activeSymbol = normalizeFyersSymbol(customSymbol.trim() || symbol);
  activeSymbolRef.current = activeSymbol;

  const detachLocalTransport = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    if (httpPollRef.current !== null) {
      window.clearInterval(httpPollRef.current);
      httpPollRef.current = null;
    }
    setStreamTransport(null);
  }, []);

  const startHttpStatePoll = useCallback(() => {
    if (httpPollRef.current !== null) {
      window.clearInterval(httpPollRef.current);
      httpPollRef.current = null;
    }
    setStreamTransport('http');
    const poll = async () => {
      if (!isStreamingRef.current || !mountedRef.current) return;
      try {
        const resp = await fetch('/api/fyers/stream/state', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!resp.ok) return;
        const snap = (await resp.json()) as StreamStateResponse;
        if (!mountedRef.current) return;
        if (!snap.active) {
          isStreamingRef.current = false;
          setIsStreaming(false);
          detachLocalTransport();
          return;
        }
        if (snap.latestQuote) {
          setLatestQuote(snap.latestQuote);
          onLiveTickRef.current(snap.latestQuote, snap.symbol);
        }
        if (snap.latestOptionQuote) {
          setLatestOptionQuote(snap.latestOptionQuote);
        }
        if (snap.lastError) {
          setErrorMsg(snap.lastError);
        } else {
          setErrorMsg(null);
        }
      } catch {
        // Retry on next interval
      }
    };

    void poll();
    httpPollRef.current = window.setInterval(() => {
      void poll();
    }, 1500);
  }, [detachLocalTransport]);

  const attachWebSocketListener = useCallback(() => {
    detachLocalTransport();
    if (!isStreamingRef.current || !mountedRef.current) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/fyers`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const fallbackTimeout = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN && isStreamingRef.current) {
          try {
            ws.close();
          } catch {
            // ignore
          }
          startHttpStatePoll();
        }
      }, 3000);

      ws.onopen = () => {
        window.clearTimeout(fallbackTimeout);
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        setStreamTransport('ws');
        setErrorMsg(null);
        if (streamedOptionSymbolRef.current) {
          try {
            ws.send(
              JSON.stringify({
                action: 'set_option',
                optionSymbol: streamedOptionSymbolRef.current,
              })
            );
          } catch {
            // ignore
          }
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            active?: boolean;
            symbol?: string;
            optionSymbol?: string | null;
            date?: string;
            data?: FyersQuoteTick;
            candles?: Candle[];
            message?: string;
          };

          if (msg.type === 'stream_state') {
            if (msg.active === false) {
              isStreamingRef.current = false;
              setIsStreaming(false);
              detachLocalTransport();
            } else if (msg.active === true && msg.symbol) {
              isStreamingRef.current = true;
              setIsStreaming(true);
            }
          } else if (msg.type === 'quote' && msg.data) {
            setLatestQuote(msg.data);
            setErrorMsg(null);
            onLiveTickRef.current(msg.data, msg.data.symbol || activeSymbolRef.current);
          } else if (msg.type === 'option_quote' && msg.data) {
            setLatestOptionQuote(msg.data);
          } else if (msg.type === 'history_sync' && Array.isArray(msg.candles)) {
            onHistorySyncRef.current(
              msg.candles,
              msg.symbol || activeSymbolRef.current,
              msg.date || ''
            );
          } else if (msg.type === 'error' && msg.message) {
            setErrorMsg(msg.message);
          }
        } catch {
          // Ignore malformed frames
        }
      };

      ws.onerror = () => {
        window.clearTimeout(fallbackTimeout);
        if (isStreamingRef.current && mountedRef.current) {
          startHttpStatePoll();
        }
      };

      ws.onclose = () => {
        window.clearTimeout(fallbackTimeout);
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        // If server stream is still active, auto-reconnect seamlessly
        if (isStreamingRef.current && mountedRef.current) {
          reconnectTimerRef.current = window.setTimeout(() => {
            if (isStreamingRef.current && mountedRef.current) {
              attachWebSocketListener();
            }
          }, 2500);
        }
      };
    } catch {
      startHttpStatePoll();
    }
  }, [detachLocalTransport, startHttpStatePoll]);

  const hydrateRunningServerStream = useCallback(async () => {
    try {
      const resp = await fetch('/api/fyers/stream/state', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!resp.ok || !mountedRef.current) return;
      const snap = (await resp.json()) as StreamStateResponse;
      if (!mountedRef.current) return;

      if (snap.active) {
        if (FYERS_SYMBOL_OPTIONS.includes(snap.symbol)) {
          setSymbol(snap.symbol);
          setCustomSymbol('');
        } else if (snap.symbol) {
          setCustomSymbol(snap.symbol);
        }
        activeSymbolRef.current = snap.symbol;
        if (snap.date) setDate(snap.date);
        if (snap.candles && snap.candles.length > 0) {
          onHistorySyncRef.current(snap.candles, snap.symbol, snap.date);
        }
        if (snap.latestQuote) {
          setLatestQuote(snap.latestQuote);
        }
        if (snap.latestOptionQuote) {
          setLatestOptionQuote(snap.latestOptionQuote);
        }
        isStreamingRef.current = true;
        setIsStreaming(true);
        setInfoMsg(
          `Continuous server stream active for ${snap.symbol} — keeps running even if you refresh or close this tab.`
        );
        attachWebSocketListener();
      } else {
        isStreamingRef.current = false;
        setIsStreaming(false);
        detachLocalTransport();
      }
    } catch {
      // Ignore transient network errors
    }
  }, [attachWebSocketListener, detachLocalTransport]);

  const refreshStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/fyers/status', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as FyersStatus;
      if (!mountedRef.current) return;
      setStatus(data);
      if (data.istToday) {
        setDate((prev) => prev || data.istToday);
      }

      // Auto-reattach if server-side persistent stream is already active!
      if (data.authenticated && data.activeStream?.active && !isStreamingRef.current) {
        void hydrateRunningServerStream();
      }
    } catch {
      // Ignore transient network errors
    } finally {
      if (mountedRef.current) {
        setLoadingStatus(false);
      }
    }
  }, [hydrateRunningServerStream]);

  useEffect(() => {
    mountedRef.current = true;
    if (!authUserId) {
      isStreamingRef.current = false;
      setIsStreaming(false);
      detachLocalTransport();
      setStatus(null);
      setLoadingStatus(false);
      setLatestQuote(null);
      setLatestOptionQuote(null);
      setErrorMsg(null);
      setInfoMsg(null);
      return;
    }
    setLoadingStatus(true);
    void refreshStatus();

    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'FYERS_AUTH_SUCCESS') {
        setErrorMsg(null);
        setInfoMsg('Fyers account connected.');
        void refreshStatus();
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('message', onMessage);
      // IMPORTANT: Only detach local WS/poll listener on unmount/refresh — NEVER stop server stream!
      detachLocalTransport();
    };
  }, [authUserId, refreshStatus, detachLocalTransport]);

  const handleConnect = useCallback(async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const resp = await fetch('/api/fyers/auth/url', {
        credentials: 'include',
      });
      const data = (await resp.json()) as { url?: string; error?: string };
      if (!resp.ok || !data.url) {
        setErrorMsg(data.error || 'Could not generate Fyers login URL.');
        return;
      }

      const popup = window.open(
        data.url,
        'fyers_oauth_popup',
        'width=560,height=720,menubar=no,toolbar=no,status=no'
      );

      if (!popup) {
        window.location.href = data.url;
        return;
      }

      const pollTimer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(pollTimer);
          void refreshStatus();
        }
      }, 600);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to initiate Fyers login'
      );
    }
  }, [refreshStatus]);

  const stopStream = useCallback(() => {
    isStreamingRef.current = false;
    setIsStreaming(false);
    detachLocalTransport();
    setInfoMsg('Live server stream stopped.');
    void fetch('/api/fyers/stream/stop', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // ignore
    });
  }, [detachLocalTransport]);

  const handleDisconnect = useCallback(async () => {
    stopStream();
    try {
      await fetch('/api/fyers/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    setLatestQuote(null);
    setLatestOptionQuote(null);
    setInfoMsg('Disconnected from Fyers.');
    await refreshStatus();
  }, [refreshStatus, stopStream]);

  const saveFyersPin = useCallback(
    async (
      pin: string | null
    ): Promise<{ ok: boolean; refreshedNow?: boolean; error?: string }> => {
      try {
        const resp = await fetch('/api/fyers/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(pin ? { pin } : { clear: true }),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          refreshedNow?: boolean;
          error?: string;
        };
        if (!resp.ok || !data.ok) {
          return { ok: false, error: data.error || 'Could not save PIN.' };
        }
        await refreshStatus();
        return { ok: true, refreshedNow: data.refreshedNow };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Network error saving PIN.',
        };
      }
    },
    [refreshStatus]
  );

  const fetchHistoryForDate = useCallback(
    async (targetDate?: string, targetSymbol?: string) => {
      const sym = normalizeFyersSymbol(targetSymbol || activeSymbolRef.current);
      const dt = targetDate || date || status?.istToday || '';
      setErrorMsg(null);
      setInfoMsg(null);
      setLoadingHistory(true);
      try {
        const params = new URLSearchParams({ symbol: sym });
        if (dt) params.set('date', dt);
        const resp = await fetch(`/api/fyers/history?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = (await resp.json()) as {
          symbol?: string;
          date?: string;
          candles?: Candle[];
          source?: 'database' | 'fyers';
          error?: string;
        };
        if (!resp.ok) {
          setErrorMsg(data.error || 'Failed to load Fyers historical candles.');
          return;
        }
        const candles = data.candles || [];
        if (candles.length === 0) {
          setErrorMsg(
            `No 5-minute candles returned for ${sym} on ${
              data.date || dt
            }. Try a recent NSE trading weekday (Mon–Fri).`
          );
          return;
        }
        setLastDataSource(data.source === 'database' ? 'database' : 'fyers');
        const sourceTag =
          data.source === 'database' ? 'Loaded from local DB' : 'Synced from Fyers';
        onLoadCandlesRef.current(
          candles,
          `Fyers: ${data.symbol || sym} (${data.date || dt})`,
          `${candles.length} real 5-min bars · ${sourceTag} · ${data.date || dt}`,
          data.symbol || sym
        );
        setInfoMsg(
          `Loaded ${candles.length} 5-min bars for ${data.symbol || sym} (${
            data.date || dt
          }) · ${sourceTag}.`
        );
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Network error loading Fyers data'
        );
      } finally {
        setLoadingHistory(false);
      }
    },
    [date, status?.istToday]
  );

  const setStreamedOptionSymbol = useCallback((nextOptSymbol: string | null) => {
    const clean =
      typeof nextOptSymbol === 'string' && nextOptSymbol.trim()
        ? nextOptSymbol.trim().toUpperCase()
        : null;
    if (streamedOptionSymbolRef.current === clean) return;
    streamedOptionSymbolRef.current = clean;
    setStreamedOptionSymbolState(clean);
    setLatestOptionQuote(null);

    if (!isStreamingRef.current) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            action: 'set_option',
            optionSymbol: clean,
          })
        );
        return;
      } catch {
        // Fall through to HTTP endpoint
      }
    }

    void fetch('/api/fyers/stream/option-symbol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ optionSymbol: clean }),
    }).catch(() => {
      // ignore
    });
  }, []);

  const startPersistentStream = useCallback(
    async (targetSymbol?: string) => {
      const sym = normalizeFyersSymbol(targetSymbol || activeSymbolRef.current);
      setErrorMsg(null);
      setInfoMsg(`Starting continuous server stream for ${sym}...`);

      try {
        const resp = await fetch('/api/fyers/stream/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            symbol: sym,
            optionSymbol: streamedOptionSymbolRef.current,
          }),
        });
        const data = (await resp.json()) as StreamStateResponse & {
          error?: string;
        };
        if (!resp.ok) {
          setErrorMsg(data.error || 'Could not start live stream.');
          return;
        }
        if (data.date) setDate(data.date);
        if (data.candles && data.candles.length > 0) {
          onHistorySyncRef.current(data.candles, data.symbol, data.date);
        }
        if (data.latestQuote) {
          setLatestQuote(data.latestQuote);
        }
        if (data.latestOptionQuote) {
          setLatestOptionQuote(data.latestOptionQuote);
        }
        isStreamingRef.current = true;
        setIsStreaming(true);
        setInfoMsg(
          `Continuous server stream active for ${sym} — stays running across page refreshes until you click Stop.`
        );
        attachWebSocketListener();
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Failed to start live stream.'
        );
      }
    },
    [attachWebSocketListener]
  );

  // If user switches symbol while server stream is running, update the persistent server stream cleanly
  useEffect(() => {
    if (!isStreamingRef.current) return;
    if (!status?.authenticated) return;
    const sym = activeSymbol;
    if (latestQuote?.symbol && latestQuote.symbol === sym) return;
    const timer = window.setTimeout(() => {
      if (isStreamingRef.current) {
        void startPersistentStream(sym);
      }
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol]);

  const toggleStream = useCallback(() => {
    if (isStreamingRef.current) {
      stopStream();
    } else {
      void startPersistentStream();
    }
  }, [stopStream, startPersistentStream]);

  return {
    status,
    loadingStatus,
    symbol,
    setSymbol,
    customSymbol,
    setCustomSymbol,
    activeSymbol,
    date,
    setDate,
    tradeDate: date,
    setTradeDate: setDate,
    loadingHistory,
    fetchingHistory: loadingHistory,
    lastDataSource,
    isStreaming,
    streamTransport,
    latestQuote,
    latestOptionQuote,
    streamedOptionSymbol,
    setStreamedOptionSymbol,
    errorMsg,
    setErrorMsg,
    infoMsg,
    setInfoMsg,
    refreshStatus,
    handleConnect,
    handleDisconnect,
    saveFyersPin,
    fetchHistoryForDate,
    handleFetchHistory: fetchHistoryForDate,
    toggleStream,
    stopStream,
  };
}
