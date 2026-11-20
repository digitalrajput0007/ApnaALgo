import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OrderJournalPayload,
  PaperTradeSource,
  RecordedOrder,
  RecordedPosition,
  StrategyConfig,
  TradeRecord,
} from '../types/strategy';
import { getTodayIstYYYYMMDD } from './usePaperTradeJournal';
import { computeOptionRecommendation } from '../utils/optionsEngine';

const STORAGE_KEY_BASE = 'neoalgo_order_position_journal_v1';

function getStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY_BASE}_${userId}` : STORAGE_KEY_BASE;
}

function loadFromLocalStorage(userId?: string | null): OrderJournalPayload {
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return { orders: [], positions: [] };
    const parsed = JSON.parse(raw) as Partial<OrderJournalPayload>;
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
    };
  } catch {
    return { orders: [], positions: [] };
  }
}

function saveToLocalStorage(
  payload: OrderJournalPayload,
  userId?: string | null
): void {
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function formatStrategyConditionSummary(config: StrategyConfig): string {
  const trailLabel = config.trailToCostAtOneToOne ? '1:1 Cost Trail' : 'Fixed SL';
  return `Set ${config.requiredMajority}/${config.setSize} · RSI(${config.rsiLength}) <${config.rsiBuyThreshold}/>${config.rsiSellThreshold} · +${config.entryBufferPoints}pt · SL ${config.stopLossPoints}/Tgt ${config.targetPoints} · ${trailLabel}`;
}

export function buildOrdersAndPositionsFromSession(
  trades: TradeRecord[],
  opts: {
    symbol: string;
    fallbackDate?: string;
    latestPrice?: number | null;
    source: PaperTradeSource;
    sessionLabel: string;
    config: StrategyConfig;
  }
): OrderJournalPayload {
  const nowIso = new Date().toISOString();
  const qty = Math.max(1, opts.config.lots * opts.config.lotSize);
  const configSummary = formatStrategyConditionSummary(opts.config);
  const multiplier =
    opts.config.instrumentType === 'NIFTY_ATM_OPT'
      ? opts.config.optionDeltaEstimate
      : 1;

  const positions: RecordedPosition[] = [];
  const orders: RecordedOrder[] = [];

  for (const t of trades) {
    const tradeDate =
      t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
        ? t.date
        : opts.fallbackDate || getTodayIstYYYYMMDD();

    const isOptionMode = opts.config.instrumentType === 'NIFTY_ATM_OPT';
    const optionRec = isOptionMode
      ? computeOptionRecommendation({
          symbol: opts.symbol,
          spotPrice: t.entryPrice,
          direction: t.direction,
          targetDelta: opts.config.optionDeltaEstimate,
          slPoints: opts.config.stopLossPoints,
          targetPoints: opts.config.targetPoints,
          lotSize: opts.config.lotSize,
          lots: opts.config.lots,
        })
      : null;
    const tradeSymbol = optionRec ? optionRec.contractLabel : opts.symbol;

    // Deterministic key ties each order & position to its Strategy Lab trade
    const tradeKey = `${tradeDate}|${tradeSymbol}|${t.direction}|${t.entryTime}|${t.entryPrice.toFixed(
      2
    )}|${t.biasSetNumber}`;

    const isOpen = t.exitReason === 'OPEN';
    const currentMarkPrice = isOpen
      ? opts.latestPrice ?? t.exitPrice ?? t.entryPrice
      : t.exitPrice ?? t.entryPrice;

    const computedPnlPoints = isOpen
      ? t.direction === 'LONG'
        ? currentMarkPrice - t.entryPrice
        : t.entryPrice - currentMarkPrice
      : t.pnlPoints;

    const computedPnlRupees = isOpen
      ? computedPnlPoints * qty * multiplier
      : t.pnlRupees;

    positions.push({
      id: `pos_${tradeKey}`,
      tradeKey,
      tradeNumber: t.id,
      date: tradeDate,
      symbol: tradeSymbol,
      direction: t.direction,
      qty,
      lots: opts.config.lots,
      lotSize: opts.config.lotSize,
      avgEntryPrice: t.entryPrice,
      ltpOrExitPrice: currentMarkPrice,
      initialSlPrice: t.initialSlPrice,
      currentSlPrice: t.currentSlPrice,
      targetPrice: t.targetPrice,
      trailedToCost: t.trailedToCost,
      status: isOpen ? 'OPEN' : 'CLOSED',
      exitReason: t.exitReason,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      signalTime: t.signalTime,
      signalRsi: t.signalRsi,
      biasSetNumber: t.biasSetNumber,
      pnlPoints: Number(computedPnlPoints.toFixed(2)),
      pnlRupees: Math.round(computedPnlRupees),
      source: opts.source,
      sessionLabel: opts.sessionLabel,
      recordedAt: nowIso,
      configSummary,
    });

    // In Options Buying mode, both CE (LONG) and PE (SHORT) are BOUGHT on entry and SOLD on exit
    const entrySide: 'BUY' | 'SELL' = isOptionMode
      ? 'BUY'
      : t.direction === 'LONG'
      ? 'BUY'
      : 'SELL';
    const exitSide: 'BUY' | 'SELL' = isOptionMode
      ? 'SELL'
      : t.direction === 'LONG'
      ? 'SELL'
      : 'BUY';
    const rsiRule =
      t.direction === 'LONG'
        ? `RSI(${opts.config.rsiLength}) < ${opts.config.rsiBuyThreshold} (${t.signalRsi.toFixed(
            1
          )} @ ${t.signalTime})`
        : `RSI(${opts.config.rsiLength}) > ${opts.config.rsiSellThreshold} (${t.signalRsi.toFixed(
            1
          )} @ ${t.signalTime})`;

    // 1. Entry Order
    orders.push({
      id: `ord_${tradeKey}_ENTRY`,
      tradeKey,
      tradeNumber: t.id,
      date: tradeDate,
      time: t.entryTime,
      symbol: tradeSymbol,
      side: entrySide,
      leg: 'ENTRY',
      orderType: 'SL-M BREAKOUT',
      qty,
      price: t.entryPrice,
      triggerCondition: `${
        optionRec ? `${optionRec.moneynessLabel} (~${optionRec.effectiveDelta.toFixed(2)}Δ) · ` : ''
      }Set #${t.biasSetNumber} · ${rsiRule} · Spot ${t.triggerLevel.toFixed(2)}`,
      status: 'EXECUTED',
      source: opts.source,
      sessionLabel: opts.sessionLabel,
      recordedAt: nowIso,
      configSummary,
    });

    // 2. SL Trail to Cost Modification Order (if triggered)
    if (t.trailedToCost && t.trailTime) {
      orders.push({
        id: `ord_${tradeKey}_SL_MODIFY`,
        tradeKey,
        tradeNumber: t.id,
        date: tradeDate,
        time: t.trailTime,
        symbol: tradeSymbol,
        side: exitSide,
        leg: 'SL_MODIFY',
        orderType: 'SL MODIFY',
        qty,
        price: t.entryPrice,
        triggerCondition: `1:1 Profit (+${opts.config.stopLossPoints} pts) reached · SL moved ${t.initialSlPrice.toFixed(
          1
        )} → ${t.entryPrice.toFixed(2)}`,
        status: 'MODIFIED',
        source: opts.source,
        sessionLabel: opts.sessionLabel,
        recordedAt: nowIso,
        configSummary,
      });
    }

    // 3. Exit Order or Resting Protection Orders (if position is currently OPEN)
    if (t.exitReason === 'OPEN') {
      orders.push({
        id: `ord_${tradeKey}_RESTING_SL`,
        tradeKey,
        tradeNumber: t.id,
        date: tradeDate,
        time: t.trailTime || t.entryTime,
        symbol: tradeSymbol,
        side: exitSide,
        leg: 'RESTING_SL',
        orderType: 'SL-M',
        qty,
        price: t.currentSlPrice,
        triggerCondition: t.trailedToCost
          ? 'Active Cost-Trailed Stop Loss'
          : `Active Strict SL (${opts.config.stopLossPoints} pts)`,
        status: 'OPEN',
        source: opts.source,
        sessionLabel: opts.sessionLabel,
        recordedAt: nowIso,
        configSummary,
      });

      orders.push({
        id: `ord_${tradeKey}_RESTING_TARGET`,
        tradeKey,
        tradeNumber: t.id,
        date: tradeDate,
        time: t.entryTime,
        symbol: tradeSymbol,
        side: exitSide,
        leg: 'RESTING_TARGET',
        orderType: 'LIMIT TARGET',
        qty,
        price: t.targetPrice,
        triggerCondition: `Active Target (+${opts.config.targetPoints} pts)`,
        status: 'OPEN',
        source: opts.source,
        sessionLabel: opts.sessionLabel,
        recordedAt: nowIso,
        configSummary,
      });
    } else if (t.exitPrice !== undefined) {
      const legMap = {
        TARGET_HIT: {
          leg: 'TARGET_EXIT' as const,
          orderType: 'LIMIT TARGET' as const,
          trigger: `Target hit (+${opts.config.targetPoints} pts)`,
        },
        STRICT_SL_HIT: {
          leg: 'SL_EXIT' as const,
          orderType: 'SL-M' as const,
          trigger: `Strict Stop Loss hit (-${opts.config.stopLossPoints} pts)`,
        },
        TRAILED_COST_EXIT: {
          leg: 'COST_EXIT' as const,
          orderType: 'SL-M' as const,
          trigger: '1:1 Cost-Trailed Stop Loss hit (Breakeven)',
        },
        EOD_SQUARE_OFF: {
          leg: 'EOD_EXIT' as const,
          orderType: 'MARKET EOD' as const,
          trigger: `Intraday Square-Off @ ${opts.config.squareOffTime} IST`,
        },
      };
      const meta = legMap[t.exitReason];

      orders.push({
        id: `ord_${tradeKey}_EXIT`,
        tradeKey,
        tradeNumber: t.id,
        date: tradeDate,
        time: t.exitTime || t.entryTime,
        symbol: tradeSymbol,
        side: exitSide,
        leg: meta.leg,
        orderType: meta.orderType,
        qty,
        price: t.exitPrice,
        triggerCondition: meta.trigger,
        status: 'EXECUTED',
        source: opts.source,
        sessionLabel: opts.sessionLabel,
        recordedAt: nowIso,
        configSummary,
      });
    }
  }

  return { orders, positions };
}

export interface OrderPositionJournalController {
  orders: RecordedOrder[];
  positions: RecordedPosition[];
  openPositionsCount: number;
  closedPositionsCount: number;
  netPnlPoints: number;
  netPnlRupees: number;
  hydrateFromServer: (payload?: Partial<OrderJournalPayload> | null) => void;
  recordSession: (
    trades: TradeRecord[],
    opts: {
      symbol: string;
      fallbackDate?: string;
      latestPrice?: number | null;
      source: PaperTradeSource;
      sessionLabel: string;
      config: StrategyConfig;
    }
  ) => { positionsUpserted: number; ordersUpserted: number; newlyAdded: number };
  deleteByTradeKey: (tradeKey: string) => void;
  clearAll: () => void;
  exportCsv: (kind: 'positions' | 'orders') => void;
}

export function useOrderPositionJournal(
  userId?: string | null
): OrderPositionJournalController {
  const [data, setData] = useState<OrderJournalPayload>(() =>
    loadFromLocalStorage(userId)
  );
  const userIdRef = useRef<string | null | undefined>(userId);

  useEffect(() => {
    userIdRef.current = userId;
    setData(loadFromLocalStorage(userId));
  }, [userId]);

  const syncToServer = useCallback((next: OrderJournalPayload) => {
    const uid = userIdRef.current;
    saveToLocalStorage(next, uid);
    if (!uid) return;
    void fetch('/api/user/order-journal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(next),
    }).catch(() => {
      // Local copy persists even if temporarily offline
    });
  }, []);

  const hydrateFromServer = useCallback(
    (payload?: Partial<OrderJournalPayload> | null) => {
      const serverOrders = Array.isArray(payload?.orders) ? payload!.orders : [];
      const serverPositions = Array.isArray(payload?.positions)
        ? payload!.positions
        : [];
      setData((prev) => {
        if (
          serverOrders.length === 0 &&
          serverPositions.length === 0 &&
          (prev.orders.length > 0 || prev.positions.length > 0)
        ) {
          syncToServer(prev);
          return prev;
        }
        const next: OrderJournalPayload = {
          orders: serverOrders,
          positions: serverPositions,
        };
        saveToLocalStorage(next, userIdRef.current);
        return next;
      });
    },
    [syncToServer]
  );

  const recordSession = useCallback(
    (
      trades: TradeRecord[],
      opts: {
        symbol: string;
        fallbackDate?: string;
        latestPrice?: number | null;
        source: PaperTradeSource;
        sessionLabel: string;
        config: StrategyConfig;
      }
    ) => {
      if (trades.length === 0) {
        return { positionsUpserted: 0, ordersUpserted: 0, newlyAdded: 0 };
      }

      const incoming = buildOrdersAndPositionsFromSession(trades, opts);
      let newlyAdded = 0;

      setData((prev) => {
        const incomingKeys = new Set(incoming.positions.map((p) => p.tradeKey));
        const existingPosKeys = new Set(prev.positions.map((p) => p.tradeKey));

        for (const key of incomingKeys) {
          if (!existingPosKeys.has(key)) newlyAdded += 1;
        }

        // Replace positions & orders matching incoming tradeKeys (so OPEN -> CLOSED updates cleanly)
        const keptPositions = prev.positions.filter(
          (p) => !incomingKeys.has(p.tradeKey)
        );
        const keptOrders = prev.orders.filter(
          (o) => !incomingKeys.has(o.tradeKey)
        );

        const mergedPositions = [...incoming.positions, ...keptPositions].sort(
          (a, b) => {
            if (a.status !== b.status) return a.status === 'OPEN' ? -1 : 1;
            const dateCmp = b.date.localeCompare(a.date);
            if (dateCmp !== 0) return dateCmp;
            return b.entryTime.localeCompare(a.entryTime);
          }
        );

        const mergedOrders = [...incoming.orders, ...keptOrders].sort(
          (a, b) => {
            const dateCmp = b.date.localeCompare(a.date);
            if (dateCmp !== 0) return dateCmp;
            return b.time.localeCompare(a.time);
          }
        );

        const next: OrderJournalPayload = {
          positions: mergedPositions,
          orders: mergedOrders,
        };
        syncToServer(next);
        return next;
      });

      return {
        positionsUpserted: incoming.positions.length,
        ordersUpserted: incoming.orders.length,
        newlyAdded,
      };
    },
    [syncToServer]
  );

  const deleteByTradeKey = useCallback(
    (tradeKey: string) => {
      setData((prev) => {
        const next: OrderJournalPayload = {
          positions: prev.positions.filter((p) => p.tradeKey !== tradeKey),
          orders: prev.orders.filter((o) => o.tradeKey !== tradeKey),
        };
        syncToServer(next);
        return next;
      });
    },
    [syncToServer]
  );

  const clearAll = useCallback(() => {
    const empty: OrderJournalPayload = { orders: [], positions: [] };
    setData(empty);
    syncToServer(empty);
  }, [syncToServer]);

  const exportCsv = useCallback(
    (kind: 'positions' | 'orders') => {
      const escape = (val: string | number | undefined) => {
        const str = val === undefined ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };

      let lines: string[];
      if (kind === 'positions') {
        lines = [
          'Date,Symbol,Direction,Qty,AvgEntry,LTP_or_Exit,InitialSL,CurrentSL,Target,Status,ExitReason,EntryTime,ExitTime,BiasSet,SignalRSI,PnL_Points,PnL_Rupees,Source,Conditions',
          ...data.positions.map((p) =>
            [
              p.date,
              p.symbol,
              p.direction,
              p.qty,
              p.avgEntryPrice.toFixed(2),
              p.ltpOrExitPrice.toFixed(2),
              p.initialSlPrice.toFixed(2),
              p.currentSlPrice.toFixed(2),
              p.targetPrice.toFixed(2),
              p.status,
              p.exitReason,
              p.entryTime,
              p.exitTime ?? '',
              `Set ${p.biasSetNumber}`,
              p.signalRsi.toFixed(1),
              p.pnlPoints.toFixed(2),
              p.pnlRupees,
              p.source,
              p.configSummary,
            ]
              .map(escape)
              .join(',')
          ),
        ];
      } else {
        lines = [
          'Date,Time,Symbol,Side,Leg,OrderType,Qty,Price,Status,TriggerCondition,Source,Conditions',
          ...data.orders.map((o) =>
            [
              o.date,
              o.time,
              o.symbol,
              o.side,
              o.leg,
              o.orderType,
              o.qty,
              o.price.toFixed(2),
              o.status,
              o.triggerCondition,
              o.source,
              o.configSummary,
            ]
              .map(escape)
              .join(',')
          ),
        ];
      }

      const blob = new Blob([lines.join('\n')], {
        type: 'text/csv;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `neoalgo_${kind}_${getTodayIstYYYYMMDD()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [data.orders, data.positions]
  );

  const summary = useMemo(() => {
    let openPositionsCount = 0;
    let closedPositionsCount = 0;
    let netPnlPoints = 0;
    let netPnlRupees = 0;
    for (const p of data.positions) {
      if (p.status === 'OPEN') openPositionsCount += 1;
      else closedPositionsCount += 1;
      netPnlPoints += p.pnlPoints;
      netPnlRupees += p.pnlRupees;
    }
    return {
      openPositionsCount,
      closedPositionsCount,
      netPnlPoints: Number(netPnlPoints.toFixed(2)),
      netPnlRupees: Math.round(netPnlRupees),
    };
  }, [data.positions]);

  return {
    orders: data.orders,
    positions: data.positions,
    ...summary,
    hydrateFromServer,
    recordSession,
    deleteByTradeKey,
    clearAll,
    exportCsv,
  };
}
