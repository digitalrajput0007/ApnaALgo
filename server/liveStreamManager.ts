import { WebSocket } from 'ws';
import {
  DEFAULT_STRATEGY_CONFIG,
  isLastCandleFormingNow,
  runNiftyStrategy,
} from '../src/engine/niftyStrategy';
import { StrategyConfig } from '../src/types/strategy';
import { normalizeFyersSymbol } from '../src/utils/fyersSymbols';
import { getFallbackInstrumentMeta } from '../src/utils/optionsEngine';
import { candleStore } from './candleStore';
import { PersistedLiveStreamState, saasStore } from './saasStore';
import {
  TelegramAlertEventType,
  TelegramAlertPayload,
  TelegramDeliveryLogEntry,
} from './telegramService';

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
  dispatchTelegramAlert?: (
    userId: string,
    payload: TelegramAlertPayload
  ) => Promise<{
    ok?: boolean;
    skipped?: boolean;
    reason?: string;
    logEntry?: TelegramDeliveryLogEntry;
  }>;
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
  initialHistorySyncDone: boolean;
  alertBaselineSeededDate: string | null;
  alertSeenKeys: Set<string>;
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
      initialHistorySyncDone: false,
      alertBaselineSeededDate: null,
      alertSeenKeys: new Set<string>(),
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

  private resolveStrategyConfigForSymbol(
    userId: string,
    symbol: string
  ): StrategyConfig {
    const workspace = saasStore.getWorkspace(userId);
    const normalizedSymbol = normalizeFyersSymbol(symbol);
    const attachedRaw = workspace.perIndexConfigs?.[normalizedSymbol];
    if (attachedRaw && typeof attachedRaw === 'object') {
      return {
        ...DEFAULT_STRATEGY_CONFIG,
        ...(attachedRaw as Partial<StrategyConfig>),
      };
    }

    const fallbackMeta = getFallbackInstrumentMeta(normalizedSymbol);
    const globalRaw =
      workspace.strategyConfig && typeof workspace.strategyConfig === 'object'
        ? (workspace.strategyConfig as Partial<StrategyConfig>)
        : {};
    const lotSize =
      normalizedSymbol === 'NSE:NIFTY50-INDEX' &&
      typeof globalRaw.lotSize === 'number' &&
      globalRaw.lotSize > 0
        ? globalRaw.lotSize
        : fallbackMeta.lotSize;

    return {
      ...DEFAULT_STRATEGY_CONFIG,
      ...globalRaw,
      lotSize,
    };
  }

  /**
   * Headless server-side strategy evaluation & Telegram alert dispatcher.
   * Runs inside Node.js on every live stream poll cycle so alerts deliver
   * immediately even when the user's browser tab is closed or sleeping.
   */
  private async evaluateAndDispatchTelegramAlerts(
    stream: ActiveUserStream
  ): Promise<void> {
    if (!this.deps?.dispatchTelegramAlert) return;
    if (!stream.initialHistorySyncDone) return;

    const normalizedSymbol = normalizeFyersSymbol(stream.symbol);
    const sessionDate =
      stream.candles.find((c) => c.date)?.date || stream.date;

    // If no candles yet (e.g. stream started before 09:15 IST), mark today's empty baseline
    // so the very first 09:35 Bias confirmation fires immediately.
    if (stream.candles.length === 0) {
      if (stream.alertBaselineSeededDate !== stream.date) {
        stream.alertBaselineSeededDate = stream.date;
        stream.alertSeenKeys.clear();
      }
      return;
    }

    const strategyConfig = this.resolveStrategyConfigForSymbol(
      stream.userId,
      normalizedSymbol
    );
    const lastCandleIsForming = isLastCandleFormingNow(
      stream.candles,
      true,
      stream.latestQuote
    );
    const evalResult = runNiftyStrategy(
      stream.candles,
      strategyConfig,
      undefined,
      undefined,
      { lastCandleIsForming }
    );

    const streamSessionId = `${stream.userId}|${normalizedSymbol}|${sessionDate}`;
    const candidatePayloads: TelegramAlertPayload[] = [];

    if (
      evalResult.finalBias !== 'PENDING' &&
      evalResult.biasDecidedSet !== null &&
      evalResult.biasDecidedTime
    ) {
      const decidingSet = evalResult.sets.find(
        (s) => s.setNumber === evalResult.biasDecidedSet
      );
      candidatePayloads.push({
        eventKey: `${streamSessionId}|BIAS|${evalResult.finalBias}|set${evalResult.biasDecidedSet}`,
        eventType: 'BIAS_CONFIRMED',
        symbol: normalizedSymbol,
        sessionDate,
        time: evalResult.biasDecidedTime,
        bias: {
          direction: evalResult.finalBias,
          setNumber: evalResult.biasDecidedSet,
          greenCount: decidingSet?.greenCount ?? 0,
          redCount: decidingSet?.redCount ?? 0,
          rsiLength: strategyConfig.rsiLength,
          rsiThreshold:
            evalResult.finalBias === 'BULLISH'
              ? strategyConfig.rsiBuyThreshold
              : strategyConfig.rsiSellThreshold,
        },
      });
    }

    const lotQty = strategyConfig.lotSize * strategyConfig.lots;
    for (const trade of evalResult.trades) {
      candidatePayloads.push({
        eventKey: `${streamSessionId}|ENTRY|t${trade.id}|${trade.entryTime}`,
        eventType: 'ENTRY_CONFIRMED',
        symbol: normalizedSymbol,
        sessionDate: trade.date || sessionDate,
        time: trade.entryTime,
        trade: {
          id: trade.id,
          direction: trade.direction,
          entryPrice: trade.entryPrice,
          stopLossPrice: trade.initialSlPrice,
          targetPrice: trade.targetPrice,
          signalRsi: trade.signalRsi,
          lotQty,
        },
      });

      if (trade.exitReason !== 'OPEN' && trade.exitTime) {
        const exitEventType: TelegramAlertEventType =
          trade.exitReason === 'TARGET_HIT'
            ? 'TARGET_HIT'
            : trade.exitReason === 'STRICT_SL_HIT'
            ? 'SL_HIT'
            : trade.exitReason === 'TRAILED_COST_EXIT'
            ? 'TRAILED_COST_EXIT'
            : 'EOD_SQUARE_OFF';

        candidatePayloads.push({
          eventKey: `${streamSessionId}|EXIT|t${trade.id}|${trade.exitReason}|${trade.exitTime}`,
          eventType: exitEventType,
          symbol: normalizedSymbol,
          sessionDate: trade.date || sessionDate,
          time: trade.exitTime,
          trade: {
            id: trade.id,
            direction: trade.direction,
            entryPrice: trade.entryPrice,
            stopLossPrice: trade.currentSlPrice,
            targetPrice: trade.targetPrice,
            exitPrice: trade.exitPrice,
            pnlPoints: trade.pnlPoints,
            pnlRupees: trade.pnlRupees,
            stopAfterTargetHit: strategyConfig.stopAfterTargetHit,
            tradesUsed: evalResult.trades.length,
            maxTradesPerDay: strategyConfig.maxTradesPerDay,
            lotQty,
          },
        });
      }
    }

    // First sync when stream starts mid-day: seed already-past events so we don't spam historical alerts
    if (stream.alertBaselineSeededDate !== stream.date) {
      stream.alertBaselineSeededDate = stream.date;
      for (const p of candidatePayloads) {
        stream.alertSeenKeys.add(p.eventKey);
      }
      return;
    }

    const newlyConfirmed = candidatePayloads.filter(
      (p) => !stream.alertSeenKeys.has(p.eventKey)
    );
    if (newlyConfirmed.length === 0) return;

    for (const payload of newlyConfirmed) {
      stream.alertSeenKeys.add(payload.eventKey);
      try {
        const outcome = await this.deps.dispatchTelegramAlert(
          stream.userId,
          payload
        );
        if (outcome?.logEntry) {
          this.broadcast(stream, {
            type: 'telegram_delivery',
            logEntry: outcome.logEntry,
          });
        }
      } catch {
        // Non-fatal Telegram delivery failure; keep live stream running
      }
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
        // New trading day rollover: start with an empty baseline so all morning signals fire
        stream.alertBaselineSeededDate = todayIst;
        stream.alertSeenKeys.clear();
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
          stream.initialHistorySyncDone = true;
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
          if (!stream.initialHistorySyncDone) {
            stream.lastSyncedBucket = '';
          }
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

      // Evaluate strategy & dispatch Telegram alerts server-side (works with browser closed)
      await this.evaluateAndDispatchTelegramAlerts(stream);
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
