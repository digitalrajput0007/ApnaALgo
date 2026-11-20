import { WebSocket } from 'ws';
import { normalizeFyersSymbol } from '../src/utils/fyersSymbols';
import { candleStore } from './candleStore';
import { PersistedLiveStreamState, saasStore } from './saasStore';

export interface StreamCandleBar {
  index: number;
  date: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  epoch: number;
}

export interface StreamQuoteTick {
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
  istDate: string;
  istTime: string;
  istTimeSec: string;
}

export interface LiveStreamSnapshot {
  active: boolean;
  symbol: string;
  optionSymbol: string | null;
  startedAt: number | null;
  date: string;
  latestQuote: StreamQuoteTick | null;
  latestOptionQuote: StreamQuoteTick | null;
  candles: StreamCandleBar[];
  lastError: string | null;
  connectedClients: number;
}

export interface LiveStreamDependencies {
  fetchHistory: (
    userId: string,
    symbol: string,
    dateStr: string
  ) => Promise<StreamCandleBar[]>;
  fetchQuotesBatch: (
    userId: string,
    symbols: string[]
  ) => Promise<Record<string, StreamQuoteTick>>;
  getCurrentIstDate: () => string;
  formatIstHHMM: (epochSec: number) => string;
}

interface ActiveUserStream {
  userId: string;
  symbol: string;
  optionSymbol: string | null;
  startedAt: number;
  date: string;
  latestQuote: StreamQuoteTick | null;
  latestOptionQuote: StreamQuoteTick | null;
  candles: StreamCandleBar[];
  lastError: string | null;
  lastSyncedBucket: string;
  pollTimer: NodeJS.Timeout | null;
  pollingInFlight: boolean;
  clients: Set<WebSocket>;
}

/**
 * Persistent server-side Fyers live stream manager.
 * Streams continue running in Node.js across browser refreshes, closed tabs,
 * and even auto-resume after PM2 restarts until the user explicitly clicks Stop.
 */
export class LiveStreamManager {
  private streams = new Map<string, ActiveUserStream>();
  private deps: LiveStreamDependencies | null = null;

  configure(deps: LiveStreamDependencies): void {
    this.deps = deps;
  }

  /**
   * Auto-resume streams that were marked active before server restart / PM2 reload.
   */
  resumePersistedStreams(): void {
    if (!this.deps) return;
    const activeEntries = saasStore.getAllActiveLiveStreams();
    for (const { userId, state } of activeEntries) {
      const conn = saasStore.getBrokerConnection(userId, 'fyers');
      if (!conn) continue;
      void this.startStream(userId, state.symbol, state.optionSymbol ?? null, {
        persist: false,
        startedAt: state.startedAt,
      });
    }
  }

  getSnapshot(userId: string): LiveStreamSnapshot {
    const active = this.streams.get(userId);
    if (active) {
      return {
        active: true,
        symbol: active.symbol,
        optionSymbol: active.optionSymbol,
        startedAt: active.startedAt,
        date: active.date,
        latestQuote: active.latestQuote,
        latestOptionQuote: active.latestOptionQuote,
        candles: active.candles,
        lastError: active.lastError,
        connectedClients: active.clients.size,
      };
    }

    const persisted = saasStore.getWorkspace(userId).liveStreamState;
    return {
      active: false,
      symbol: persisted?.symbol || 'NSE:NIFTY50-INDEX',
      optionSymbol: persisted?.optionSymbol ?? null,
      startedAt: null,
      date: this.deps?.getCurrentIstDate() ?? '',
      latestQuote: null,
      latestOptionQuote: null,
      candles: [],
      lastError: null,
      connectedClients: 0,
    };
  }

  async startStream(
    userId: string,
    rawSymbol: string,
    rawOptionSymbol?: string | null,
    opts?: { persist?: boolean; startedAt?: number }
  ): Promise<LiveStreamSnapshot> {
    if (!this.deps) {
      throw new Error('LiveStreamManager is not configured.');
    }

    const symbol = normalizeFyersSymbol(rawSymbol);
    const optionSymbol =
      typeof rawOptionSymbol === 'string' && rawOptionSymbol.trim()
        ? rawOptionSymbol.trim().toUpperCase()
        : null;
    const todayIst = this.deps.getCurrentIstDate();
    const existing = this.streams.get(userId);

    // If already streaming the exact same symbol, just update optionSymbol if provided
    if (existing && existing.symbol === symbol) {
      if (rawOptionSymbol !== undefined && existing.optionSymbol !== optionSymbol) {
        existing.optionSymbol = optionSymbol;
        existing.latestOptionQuote = null;
        if (opts?.persist !== false) {
          this.persistState(userId, {
            active: true,
            symbol: existing.symbol,
            optionSymbol: existing.optionSymbol,
            startedAt: existing.startedAt,
          });
        }
      }
      void this.runPollTick(existing);
      return this.getSnapshot(userId);
    }

    // Preserve any attached browser WebSocket clients across symbol switches
    const preservedClients = existing ? new Set(existing.clients) : new Set<WebSocket>();
    if (existing?.pollTimer) {
      clearInterval(existing.pollTimer);
    }

    const startedAt = opts?.startedAt ?? Date.now();
    const cachedToday = candleStore.getRangeCandles(
      symbol,
      todayIst,
      todayIst
    ) as StreamCandleBar[];

    const stream: ActiveUserStream = {
      userId,
      symbol,
      optionSymbol:
        rawOptionSymbol !== undefined
          ? optionSymbol
          : existing?.symbol === symbol
          ? existing.optionSymbol
          : null,
      startedAt,
      date: todayIst,
      latestQuote: null,
      latestOptionQuote: null,
      candles: cachedToday.length > 0 ? [...cachedToday] : [],
      lastError: null,
      lastSyncedBucket: '',
      pollTimer: null,
      pollingInFlight: false,
      clients: preservedClients,
    };

    this.streams.set(userId, stream);

    if (opts?.persist !== false) {
      this.persistState(userId, {
        active: true,
        symbol: stream.symbol,
        optionSymbol: stream.optionSymbol,
        startedAt: stream.startedAt,
      });
    }

    this.broadcast(stream, {
      type: 'stream_state',
      active: true,
      symbol: stream.symbol,
      optionSymbol: stream.optionSymbol,
      startedAt: stream.startedAt,
      date: stream.date,
    });

    // Immediate sync + continuous 1.5s background polling loop
    void this.runPollTick(stream);
    stream.pollTimer = setInterval(() => {
      void this.runPollTick(stream);
    }, 1500);

    return this.getSnapshot(userId);
  }

  setOptionSymbol(userId: string, rawOptionSymbol: string | null): LiveStreamSnapshot {
    const clean =
      typeof rawOptionSymbol === 'string' && rawOptionSymbol.trim()
        ? rawOptionSymbol.trim().toUpperCase()
        : null;
    const stream = this.streams.get(userId);
    if (!stream) {
      return this.getSnapshot(userId);
    }
    if (stream.optionSymbol !== clean) {
      stream.optionSymbol = clean;
      stream.latestOptionQuote = null;
      this.persistState(userId, {
        active: true,
        symbol: stream.symbol,
        optionSymbol: stream.optionSymbol,
        startedAt: stream.startedAt,
      });
      this.broadcast(stream, {
        type: 'stream_state',
        active: true,
        symbol: stream.symbol,
        optionSymbol: stream.optionSymbol,
        startedAt: stream.startedAt,
        date: stream.date,
      });
      void this.runPollTick(stream);
    }
    return this.getSnapshot(userId);
  }

  stopStream(userId: string): LiveStreamSnapshot {
    const stream = this.streams.get(userId);
    if (stream) {
      if (stream.pollTimer) {
        clearInterval(stream.pollTimer);
        stream.pollTimer = null;
      }
      this.broadcast(stream, {
        type: 'stream_state',
        active: false,
        symbol: stream.symbol,
        optionSymbol: stream.optionSymbol,
        startedAt: null,
        date: stream.date,
      });
      this.streams.delete(userId);
    }

    const prev = saasStore.getWorkspace(userId).liveStreamState;
    this.persistState(userId, {
      active: false,
      symbol: stream?.symbol || prev?.symbol || 'NSE:NIFTY50-INDEX',
      optionSymbol: null,
      startedAt: 0,
    });

    return this.getSnapshot(userId);
  }

  attachClient(userId: string, ws: WebSocket): void {
    const stream = this.streams.get(userId);
    if (!stream) {
      this.safeSend(ws, {
        type: 'stream_state',
        active: false,
        symbol:
          saasStore.getWorkspace(userId).liveStreamState?.symbol ||
          'NSE:NIFTY50-INDEX',
        optionSymbol: null,
        startedAt: null,
        date: this.deps?.getCurrentIstDate() ?? '',
      });
      return;
    }

    stream.clients.add(ws);
    this.safeSend(ws, {
      type: 'stream_state',
      active: true,
      symbol: stream.symbol,
      optionSymbol: stream.optionSymbol,
      startedAt: stream.startedAt,
      date: stream.date,
    });

    if (stream.candles.length > 0) {
      this.safeSend(ws, {
        type: 'history_sync',
        symbol: stream.symbol,
        date: stream.date,
        candles: stream.candles,
      });
    }
    if (stream.latestQuote) {
      this.safeSend(ws, {
        type: 'quote',
        data: stream.latestQuote,
      });
    }
    if (stream.latestOptionQuote) {
      this.safeSend(ws, {
        type: 'option_quote',
        data: stream.latestOptionQuote,
      });
    }
  }

  detachClient(userId: string, ws: WebSocket): void {
    const stream = this.streams.get(userId);
    if (!stream) return;
    // IMPORTANT: Detaching a closed/refreshed browser tab NEVER stops the server stream!
    stream.clients.delete(ws);
  }

  private persistState(userId: string, state: PersistedLiveStreamState): void {
    saasStore.updateWorkspace(userId, {
      liveStreamState: state,
    });
  }

  private safeSend(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        // Ignore broken socket
      }
    }
  }

  private broadcast(stream: ActiveUserStream, payload: unknown): void {
    const raw = JSON.stringify(payload);
    for (const client of stream.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(raw);
        } catch {
          stream.clients.delete(client);
        }
      } else if (client.readyState !== WebSocket.CONNECTING) {
        stream.clients.delete(client);
      }
    }
  }

  private foldTickIntoCandles(stream: ActiveUserStream, tick: StreamQuoteTick): void {
    if (!tick.ltp || !tick.istTime) return;
    const [hh, mm] = tick.istTime.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const mins = hh * 60 + mm;
    if (mins < 9 * 60 + 15 || mins > 15 * 60 + 29) return;

    const bucketMin = Math.floor(mm / 5) * 5;
    const bucketTime = `${String(hh).padStart(2, '0')}:${String(
      bucketMin
    ).padStart(2, '0')}`;
    const istDate = tick.istDate || stream.date;

    const last = stream.candles[stream.candles.length - 1];
    if (last && last.date && last.date !== istDate) {
      stream.candles = [];
    }

    const tail = stream.candles[stream.candles.length - 1];
    if (tail && tail.time === bucketTime) {
      stream.candles[stream.candles.length - 1] = {
        ...tail,
        high: Math.max(tail.high, tick.ltp),
        low: Math.min(tail.low, tick.ltp),
        close: tick.ltp,
        volume: tick.volume || tail.volume,
      };
    } else if (!tail || bucketTime > tail.time) {
      stream.candles.push({
        index: stream.candles.length,
        date: istDate,
        time: bucketTime,
        open: tick.ltp,
        high: tick.ltp,
        low: tick.ltp,
        close: tick.ltp,
        volume: tick.volume || 0,
        epoch: tick.epoch,
      });
    }
  }

  private async runPollTick(stream: ActiveUserStream): Promise<void> {
    if (!this.deps) return;
    // Verify stream is still the active instance for this user
    if (this.streams.get(stream.userId) !== stream) return;
    if (stream.pollingInFlight) return;
    stream.pollingInFlight = true;

    try {
      const todayIst = this.deps.getCurrentIstDate();
      if (stream.date !== todayIst) {
        stream.date = todayIst;
        stream.candles = [];
        stream.lastSyncedBucket = '';
      }

      const nowIst = this.deps.formatIstHHMM(Math.floor(Date.now() / 1000));
      const [hh, mm] = nowIst.split(':').map(Number);
      const bucketMin = Math.floor(mm / 5) * 5;
      const currentBucket = `${todayIst}_${String(hh).padStart(2, '0')}:${String(
        bucketMin
      ).padStart(2, '0')}`;

      if (currentBucket !== stream.lastSyncedBucket) {
        stream.lastSyncedBucket = currentBucket;
        try {
          const candles = await this.deps.fetchHistory(
            stream.userId,
            stream.symbol,
            stream.date
          );
          if (candles.length > 0) {
            candleStore.upsertCandles(stream.symbol, candles);
            stream.candles = candles;
            this.broadcast(stream, {
              type: 'history_sync',
              symbol: stream.symbol,
              date: stream.date,
              candles,
            });
          }
        } catch (histErr) {
          stream.lastError =
            histErr instanceof Error ? histErr.message : 'History sync failed';
        }
      }

      const symbolsToFetch = [stream.symbol];
      if (stream.optionSymbol && stream.optionSymbol !== stream.symbol) {
        symbolsToFetch.push(stream.optionSymbol);
      }

      const quotesMap = await this.deps.fetchQuotesBatch(
        stream.userId,
        symbolsToFetch
      );

      const mainQuote = quotesMap[stream.symbol] ?? Object.values(quotesMap)[0];
      if (mainQuote) {
        stream.latestQuote = mainQuote;
        stream.lastError = null;
        this.foldTickIntoCandles(stream, mainQuote);
        this.broadcast(stream, { type: 'quote', data: mainQuote });
      }

      if (stream.optionSymbol) {
        const optQuote = quotesMap[stream.optionSymbol];
        if (optQuote) {
          stream.latestOptionQuote = optQuote;
          this.broadcast(stream, { type: 'option_quote', data: optQuote });
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Fyers stream poll error';
      stream.lastError = msg;
      this.broadcast(stream, { type: 'error', message: msg });
    } finally {
      stream.pollingInFlight = false;
    }
  }
}

export const liveStreamManager = new LiveStreamManager();
