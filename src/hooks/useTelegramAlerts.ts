import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isLastCandleFormingNow,
  runNiftyStrategy,
} from '../engine/niftyStrategy';
import { Candle, StrategyConfig } from '../types/strategy';
import { normalizeFyersSymbol } from '../utils/fyersSymbols';

export type TelegramChatType = 'private' | 'group' | 'channel';

export type TelegramAlertEventType =
  | 'BIAS_CONFIRMED'
  | 'ENTRY_CONFIRMED'
  | 'SL_HIT'
  | 'TRAILED_COST_EXIT'
  | 'TARGET_HIT'
  | 'EOD_SQUARE_OFF'
  | 'TEST';

export interface TelegramDestination {
  id: string;
  label: string;
  chatId: string;
  type: TelegramChatType;
  enabled: boolean;
}

export interface TelegramTriggerFlags {
  biasConfirmed: boolean;
  entryConfirmed: boolean;
  slHit: boolean;
  targetHit: boolean;
  trailedCostExit: boolean;
  eodSquareOff: boolean;
}

export interface PublicTelegramConfig {
  enabled: boolean;
  hasBotToken: boolean;
  maskedToken: string | null;
  botUsername: string | null;
  botFirstName: string | null;
  destinations: TelegramDestination[];
  triggers: TelegramTriggerFlags;
  updatedAt: number;
}

export interface TelegramDeliveryResult {
  chatId: string;
  label: string;
  type: TelegramChatType;
  ok: boolean;
  messageId?: number;
  error?: string;
}

export interface TelegramDeliveryLogEntry {
  id: string;
  timestamp: string;
  eventType: TelegramAlertEventType;
  symbol: string;
  summary: string;
  totalTargets: number;
  deliveredCount: number;
  failedCount: number;
  results: TelegramDeliveryResult[];
}

export interface DiscoveredTelegramChat {
  chatId: string;
  title: string;
  username?: string;
  type: TelegramChatType;
}

export interface TelegramAlertPayload {
  eventKey: string;
  eventType: TelegramAlertEventType;
  symbol: string;
  sessionDate: string;
  time: string;
  isSample?: boolean;
  bias?: {
    direction: 'BULLISH' | 'BEARISH';
    setNumber: number;
    greenCount: number;
    redCount: number;
    rsiLength: number;
    rsiThreshold: number;
  };
  trade?: {
    id: number;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLossPrice: number;
    targetPrice: number;
    exitPrice?: number;
    signalRsi?: number;
    pnlPoints?: number;
    pnlRupees?: number;
    stopAfterTargetHit?: boolean;
    tradesUsed?: number;
    maxTradesPerDay?: number;
    lotQty?: number;
  };
}

export interface SaveTelegramConfigInput {
  enabled?: boolean;
  botToken?: string;
  clearBotToken?: boolean;
  destinations?: TelegramDestination[];
  triggers?: Partial<TelegramTriggerFlags>;
}

export interface TelegramAlertsController {
  config: PublicTelegramConfig;
  recentDeliveries: TelegramDeliveryLogEntry[];
  loading: boolean;
  saving: boolean;
  discovering: boolean;
  testing: boolean;
  error: string | null;
  activeDestinationCount: number;
  isArmedForLive: boolean;
  refreshConfig: () => Promise<void>;
  saveConfig: (
    patch: SaveTelegramConfigInput
  ) => Promise<{ ok: boolean; error?: string }>;
  discoverChats: (
    botTokenOverride?: string
  ) => Promise<{ ok: boolean; chats: DiscoveredTelegramChat[]; error?: string }>;
  sendTestAlert: (options?: {
    chatId?: string;
    samplePayload?: TelegramAlertPayload;
  }) => Promise<{
    ok: boolean;
    deliveredCount: number;
    failedCount: number;
    results: TelegramDeliveryResult[];
    error?: string;
  }>;
}

const EMPTY_CONFIG: PublicTelegramConfig = {
  enabled: false,
  hasBotToken: false,
  maskedToken: null,
  botUsername: null,
  botFirstName: null,
  destinations: [],
  triggers: {
    biasConfirmed: true,
    entryConfirmed: true,
    slHit: true,
    targetHit: true,
    trailedCostExit: true,
    eodSquareOff: false,
  },
  updatedAt: 0,
};

interface UseTelegramAlertsOptions {
  userId: string | null;
  isLiveStreaming: boolean;
  liveCandles: Candle[];
  activeSymbol: string;
  strategyConfig: StrategyConfig;
}

function getTodayIstString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function useTelegramAlerts({
  userId,
  isLiveStreaming,
  liveCandles,
  activeSymbol,
  strategyConfig,
}: UseTelegramAlertsOptions): TelegramAlertsController {
  const [config, setConfig] = useState<PublicTelegramConfig>(EMPTY_CONFIG);
  const [recentDeliveries, setRecentDeliveries] = useState<
    TelegramDeliveryLogEntry[]
  >([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [discovering, setDiscovering] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const seenEventKeysRef = useRef<Set<string>>(new Set());
  const baselineSeededForStreamRef = useRef<string | null>(null);

  const refreshConfig = useCallback(async () => {
    if (!userId) {
      setConfig(EMPTY_CONFIG);
      setRecentDeliveries([]);
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch('/api/telegram/config', {
        credentials: 'include',
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        config?: PublicTelegramConfig;
        recentDeliveries?: TelegramDeliveryLogEntry[];
      };
      if (data.config) setConfig(data.config);
      if (Array.isArray(data.recentDeliveries)) {
        setRecentDeliveries(data.recentDeliveries);
      }
    } catch {
      // ignore transient offline error
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    seenEventKeysRef.current.clear();
    baselineSeededForStreamRef.current = null;
    void refreshConfig();
  }, [refreshConfig]);

  const saveConfig = useCallback(
    async (
      patch: SaveTelegramConfigInput
    ): Promise<{ ok: boolean; error?: string }> => {
      setSaving(true);
      setError(null);
      try {
        const resp = await fetch('/api/telegram/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(patch),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          error?: string;
          config?: PublicTelegramConfig;
          recentDeliveries?: TelegramDeliveryLogEntry[];
        };
        if (!resp.ok) {
          const msg = data.error || 'Failed to save Telegram settings.';
          setError(msg);
          return { ok: false, error: msg };
        }
        if (data.config) setConfig(data.config);
        if (Array.isArray(data.recentDeliveries)) {
          setRecentDeliveries(data.recentDeliveries);
        }
        return { ok: true };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Network error while saving.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const discoverChats = useCallback(
    async (botTokenOverride?: string) => {
      setDiscovering(true);
      setError(null);
      try {
        const resp = await fetch('/api/telegram/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            botToken: botTokenOverride?.trim() || undefined,
          }),
        });
        const data = (await resp.json()) as {
          chats?: DiscoveredTelegramChat[];
          error?: string;
        };
        if (!resp.ok) {
          const msg = data.error || 'Could not detect Telegram chats.';
          setError(msg);
          return { ok: false, chats: [], error: msg };
        }
        return { ok: true, chats: data.chats || [] };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Network error detecting chats.';
        setError(msg);
        return { ok: false, chats: [], error: msg };
      } finally {
        setDiscovering(false);
      }
    },
    []
  );

  const sendTestAlert = useCallback(
    async (options?: {
      chatId?: string;
      samplePayload?: TelegramAlertPayload;
    }) => {
      setTesting(true);
      setError(null);
      try {
        const resp = await fetch('/api/telegram/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(options || {}),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          deliveredCount?: number;
          failedCount?: number;
          results?: TelegramDeliveryResult[];
          logEntry?: TelegramDeliveryLogEntry;
          error?: string;
        };
        if (!resp.ok) {
          const msg = data.error || 'Failed to send test alert.';
          setError(msg);
          return {
            ok: false,
            deliveredCount: 0,
            failedCount: 0,
            results: [],
            error: msg,
          };
        }
        if (data.logEntry) {
          setRecentDeliveries((prev) => [data.logEntry!, ...prev].slice(0, 40));
        }
        return {
          ok: Boolean(data.ok),
          deliveredCount: data.deliveredCount ?? 0,
          failedCount: data.failedCount ?? 0,
          results: data.results ?? [],
        };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to send test alert.';
        setError(msg);
        return {
          ok: false,
          deliveredCount: 0,
          failedCount: 0,
          results: [],
          error: msg,
        };
      } finally {
        setTesting(false);
      }
    },
    []
  );

  const activeDestinationCount = useMemo(
    () => config.destinations.filter((d) => d.enabled).length,
    [config.destinations]
  );

  const isArmedForLive =
    config.enabled && config.hasBotToken && activeDestinationCount > 0;

  // Compute live strategy state independently of active tab so alerts run continuously
  const liveStrategyResult = useMemo(() => {
    if (!isLiveStreaming || liveCandles.length === 0) return null;
    const lastCandleIsForming = isLastCandleFormingNow(
      liveCandles,
      isLiveStreaming
    );
    return runNiftyStrategy(liveCandles, strategyConfig, undefined, undefined, {
      lastCandleIsForming,
    });
  }, [isLiveStreaming, liveCandles, strategyConfig]);

  // Reset baseline marker whenever streaming stops
  useEffect(() => {
    if (!isLiveStreaming) {
      baselineSeededForStreamRef.current = null;
    }
  }, [isLiveStreaming]);

  // Real-time event watcher: dispatches immediately when Bias, Entry, SL, or Target confirms
  useEffect(() => {
    if (!userId || !isLiveStreaming || !liveStrategyResult) return;

    const normalizedSymbol = normalizeFyersSymbol(activeSymbol);
    const sessionDate =
      liveCandles.find((c) => c.date)?.date || getTodayIstString();
    const streamSessionId = `${userId}|${normalizedSymbol}|${sessionDate}`;

    // Build all currently confirmed events from the live session
    const candidatePayloads: TelegramAlertPayload[] = [];

    if (
      liveStrategyResult.finalBias !== 'PENDING' &&
      liveStrategyResult.biasDecidedSet !== null &&
      liveStrategyResult.biasDecidedTime
    ) {
      const decidingSet = liveStrategyResult.sets.find(
        (s) => s.setNumber === liveStrategyResult.biasDecidedSet
      );
      candidatePayloads.push({
        eventKey: `${streamSessionId}|BIAS|${liveStrategyResult.finalBias}|set${liveStrategyResult.biasDecidedSet}`,
        eventType: 'BIAS_CONFIRMED',
        symbol: normalizedSymbol,
        sessionDate,
        time: liveStrategyResult.biasDecidedTime,
        bias: {
          direction: liveStrategyResult.finalBias,
          setNumber: liveStrategyResult.biasDecidedSet,
          greenCount: decidingSet?.greenCount ?? 0,
          redCount: decidingSet?.redCount ?? 0,
          rsiLength: strategyConfig.rsiLength,
          rsiThreshold:
            liveStrategyResult.finalBias === 'BULLISH'
              ? strategyConfig.rsiBuyThreshold
              : strategyConfig.rsiSellThreshold,
        },
      });
    }

    const lotQty = strategyConfig.lotSize * strategyConfig.lots;
    for (const trade of liveStrategyResult.trades) {
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
            tradesUsed: liveStrategyResult.trades.length,
            maxTradesPerDay: strategyConfig.maxTradesPerDay,
            lotQty,
          },
        });
      }
    }

    // First sync when live streaming starts: seed baseline so old historical events from earlier today don't spam
    if (baselineSeededForStreamRef.current !== streamSessionId) {
      baselineSeededForStreamRef.current = streamSessionId;
      for (const p of candidatePayloads) {
        seenEventKeysRef.current.add(p.eventKey);
      }
      return;
    }

    // Any brand-new event confirmed after stream baseline fires immediately
    const newlyConfirmed = candidatePayloads.filter(
      (p) => !seenEventKeysRef.current.has(p.eventKey)
    );
    if (newlyConfirmed.length === 0) return;

    for (const p of newlyConfirmed) {
      seenEventKeysRef.current.add(p.eventKey);
    }

    if (!isArmedForLive) return;

    for (const payload of newlyConfirmed) {
      void fetch('/api/telegram/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            data: {
              logEntry?: TelegramDeliveryLogEntry;
            } | null
          ) => {
            if (data?.logEntry) {
              setRecentDeliveries((prev) =>
                [data.logEntry!, ...prev].slice(0, 40)
              );
            }
          }
        )
        .catch(() => {
          // Non-fatal network error
        });
    }
  }, [
    userId,
    isLiveStreaming,
    isArmedForLive,
    liveStrategyResult,
    liveCandles,
    activeSymbol,
    strategyConfig,
  ]);

  return {
    config,
    recentDeliveries,
    loading,
    saving,
    discovering,
    testing,
    error,
    activeDestinationCount,
    isArmedForLive,
    refreshConfig,
    saveConfig,
    discoverChats,
    sendTestAlert,
  };
}
