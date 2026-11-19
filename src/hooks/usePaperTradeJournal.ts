import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PaperTradeEntry,
  PaperTradeSource,
  StrategyConfig,
  TradeRecord,
} from '../types/strategy';

const PAPER_JOURNAL_STORAGE_KEY = 'neoalgo_paper_trade_journal_v1';

export interface SaveBatchOutcome {
  added: number;
  skippedDuplicates: number;
  latestMonth: string | null;
}

export interface DailyPaperBucket {
  date: string; // YYYY-MM-DD
  trades: PaperTradeEntry[];
  netPoints: number;
  netRupees: number;
  wins: number;
  losses: number;
  breakevens: number;
}

export interface MonthlyPaperBucket {
  month: string; // YYYY-MM
  label: string;
  tradesCount: number;
  tradingDays: number;
  winningDays: number;
  losingDays: number;
  wins: number;
  losses: number;
  breakevens: number;
  netPoints: number;
  netRupees: number;
  winRatePct: number;
  profitFactor: number;
}

export interface PaperJournalStats {
  totalTrades: number;
  tradingDays: number;
  winningDays: number;
  losingDays: number;
  flatDays: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRatePct: number;
  netPoints: number;
  netRupees: number;
  grossProfitPoints: number;
  grossLossPoints: number;
  profitFactor: number;
  maxDrawdownPoints: number;
  bestDay: { date: string; points: number; rupees: number } | null;
  worstDay: { date: string; points: number; rupees: number } | null;
}

function buildDedupeSignature(entry: {
  date: string;
  symbol: string;
  direction: string;
  entryTime: string;
  entryPrice: number;
}): string {
  return `${entry.date}|${entry.symbol}|${entry.direction}|${entry.entryTime}|${entry.entryPrice.toFixed(
    2
  )}`;
}

function loadPaperTrades(): PaperTradeEntry[] {
  try {
    const raw = window.localStorage.getItem(PAPER_JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PaperTradeEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function formatMonthLabel(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return yearMonth;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function getTodayIstYYYYMMDD(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function tradeRecordsToPaperEntries(
  trades: TradeRecord[],
  options: {
    symbol: string;
    fallbackDate?: string;
    source: PaperTradeSource;
    batchLabel?: string;
    config?: StrategyConfig;
  }
): PaperTradeEntry[] {
  const nowIso = new Date().toISOString();
  const fallback = options.fallbackDate || getTodayIstYYYYMMDD();
  const configSnapshot = options.config
    ? {
        stopLossPoints: options.config.stopLossPoints,
        targetPoints: options.config.targetPoints,
        rsiBuyThreshold: options.config.rsiBuyThreshold,
        rsiSellThreshold: options.config.rsiSellThreshold,
        entryBufferPoints: options.config.entryBufferPoints,
        maxTradesPerDay: options.config.maxTradesPerDay,
      }
    : undefined;

  return trades.map((t, idx) => {
    const date =
      t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : fallback;
    return {
      id: `pt_${date}_${t.entryTime.replace(':', '')}_${idx}_${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      date,
      symbol: options.symbol,
      direction: t.direction,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      exitReason: t.exitReason,
      pnlPoints: t.pnlPoints,
      pnlRupees: t.pnlRupees,
      trailedToCost: t.trailedToCost,
      signalRsi: t.signalRsi,
      biasSetNumber: t.biasSetNumber,
      source: options.source,
      batchLabel: options.batchLabel,
      savedAt: nowIso,
      configSnapshot,
    };
  });
}

export function computePaperJournalStats(
  entries: PaperTradeEntry[]
): PaperJournalStats {
  const byDate = new Map<string, DailyPaperBucket>();

  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let grossProfitPoints = 0;
  let grossLossPoints = 0;
  let netPoints = 0;
  let netRupees = 0;

  for (const e of entries) {
    netPoints += e.pnlPoints;
    netRupees += e.pnlRupees;
    if (e.pnlPoints > 0.5) {
      wins += 1;
      grossProfitPoints += e.pnlPoints;
    } else if (e.pnlPoints < -0.5) {
      losses += 1;
      grossLossPoints += Math.abs(e.pnlPoints);
    } else {
      breakevens += 1;
    }

    const existing = byDate.get(e.date);
    if (existing) {
      existing.trades.push(e);
      existing.netPoints += e.pnlPoints;
      existing.netRupees += e.pnlRupees;
      if (e.pnlPoints > 0.5) existing.wins += 1;
      else if (e.pnlPoints < -0.5) existing.losses += 1;
      else existing.breakevens += 1;
    } else {
      byDate.set(e.date, {
        date: e.date,
        trades: [e],
        netPoints: e.pnlPoints,
        netRupees: e.pnlRupees,
        wins: e.pnlPoints > 0.5 ? 1 : 0,
        losses: e.pnlPoints < -0.5 ? 1 : 0,
        breakevens: Math.abs(e.pnlPoints) <= 0.5 ? 1 : 0,
      });
    }
  }

  const sortedDays = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  let winningDays = 0;
  let losingDays = 0;
  let flatDays = 0;
  let cumPts = 0;
  let peakPts = 0;
  let maxDrawdownPoints = 0;
  let bestDay: { date: string; points: number; rupees: number } | null = null;
  let worstDay: { date: string; points: number; rupees: number } | null = null;

  for (const d of sortedDays) {
    if (d.netPoints > 0.5) winningDays += 1;
    else if (d.netPoints < -0.5) losingDays += 1;
    else flatDays += 1;

    cumPts += d.netPoints;
    if (cumPts > peakPts) peakPts = cumPts;
    const dd = peakPts - cumPts;
    if (dd > maxDrawdownPoints) maxDrawdownPoints = dd;

    if (!bestDay || d.netPoints > bestDay.points) {
      bestDay = { date: d.date, points: d.netPoints, rupees: d.netRupees };
    }
    if (!worstDay || d.netPoints < worstDay.points) {
      worstDay = { date: d.date, points: d.netPoints, rupees: d.netRupees };
    }
  }

  const totalTrades = entries.length;
  const winRatePct = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor =
    grossLossPoints > 0
      ? grossProfitPoints / grossLossPoints
      : grossProfitPoints > 0
      ? 9.99
      : 0;

  return {
    totalTrades,
    tradingDays: sortedDays.length,
    winningDays,
    losingDays,
    flatDays,
    wins,
    losses,
    breakevens,
    winRatePct,
    netPoints,
    netRupees,
    grossProfitPoints,
    grossLossPoints,
    profitFactor,
    maxDrawdownPoints,
    bestDay,
    worstDay,
  };
}

export function groupPaperTradesByDate(
  entries: PaperTradeEntry[]
): Map<string, DailyPaperBucket> {
  const map = new Map<string, DailyPaperBucket>();
  for (const e of entries) {
    const existing = map.get(e.date);
    if (existing) {
      existing.trades.push(e);
      existing.netPoints += e.pnlPoints;
      existing.netRupees += e.pnlRupees;
      if (e.pnlPoints > 0.5) existing.wins += 1;
      else if (e.pnlPoints < -0.5) existing.losses += 1;
      else existing.breakevens += 1;
    } else {
      map.set(e.date, {
        date: e.date,
        trades: [e],
        netPoints: e.pnlPoints,
        netRupees: e.pnlRupees,
        wins: e.pnlPoints > 0.5 ? 1 : 0,
        losses: e.pnlPoints < -0.5 ? 1 : 0,
        breakevens: Math.abs(e.pnlPoints) <= 0.5 ? 1 : 0,
      });
    }
  }
  for (const bucket of map.values()) {
    bucket.trades.sort((a, b) => a.entryTime.localeCompare(b.entryTime));
  }
  return map;
}

export function groupPaperTradesByMonth(
  entries: PaperTradeEntry[]
): MonthlyPaperBucket[] {
  const monthEntries = new Map<string, PaperTradeEntry[]>();
  for (const e of entries) {
    const ym = e.date.slice(0, 7);
    const list = monthEntries.get(ym);
    if (list) list.push(e);
    else monthEntries.set(ym, [e]);
  }

  return Array.from(monthEntries.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, list]) => {
      const stats = computePaperJournalStats(list);
      return {
        month,
        label: formatMonthLabel(month),
        tradesCount: stats.totalTrades,
        tradingDays: stats.tradingDays,
        winningDays: stats.winningDays,
        losingDays: stats.losingDays,
        wins: stats.wins,
        losses: stats.losses,
        breakevens: stats.breakevens,
        netPoints: stats.netPoints,
        netRupees: stats.netRupees,
        winRatePct: stats.winRatePct,
        profitFactor: stats.profitFactor,
      };
    });
}

export function usePaperTradeJournal(userId: string | null = null) {
  const [entries, setEntries] = useState<PaperTradeEntry[]>([]);
  const hydratedRef = useRef<boolean>(false);
  const currentUserRef = useRef<string | null>(userId);

  const storageKey = userId
    ? `${PAPER_JOURNAL_STORAGE_KEY}_${userId}`
    : PAPER_JOURNAL_STORAGE_KEY;

  useEffect(() => {
    currentUserRef.current = userId;
    hydratedRef.current = false;
    if (!userId) {
      setEntries([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as PaperTradeEntry[];
        setEntries(Array.isArray(parsed) ? parsed : []);
      } else {
        setEntries([]);
      }
    } catch {
      setEntries([]);
    }
  }, [userId, storageKey]);

  const hydrateFromServer = useCallback(
    (serverEntries: PaperTradeEntry[]) => {
      hydratedRef.current = true;
      const valid = Array.isArray(serverEntries) ? serverEntries : [];
      // One-time migration: if server is empty and user had pre-SaaS local paper trades, migrate them
      if (valid.length === 0) {
        const legacy = loadPaperTrades();
        if (legacy.length > 0) {
          setEntries(legacy);
          try {
            window.localStorage.removeItem(PAPER_JOURNAL_STORAGE_KEY);
          } catch {
            // ignore
          }
          if (currentUserRef.current) {
            void fetch('/api/user/paper-trades', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ entries: legacy }),
            });
          }
          return;
        }
      }
      setEntries(valid);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(valid));
      } catch {
        // ignore
      }
    },
    [storageKey]
  );

  const persistEntries = useCallback(
    (next: PaperTradeEntry[]) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }
      if (currentUserRef.current) {
        void fetch('/api/user/paper-trades', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ entries: next }),
        }).catch(() => {
          // Keep local cache if temporarily offline
        });
      }
    },
    [storageKey]
  );

  const saveEntries = useCallback(
    (incoming: PaperTradeEntry[]): SaveBatchOutcome => {
      if (incoming.length === 0) {
        return { added: 0, skippedDuplicates: 0, latestMonth: null };
      }

      const existingSigs = new Set(entries.map(buildDedupeSignature));
      let syncAdded = 0;
      let syncSkipped = 0;
      let syncLatest = '';
      const toAdd: PaperTradeEntry[] = [];

      for (const item of incoming) {
        const sig = buildDedupeSignature(item);
        if (existingSigs.has(sig)) {
          syncSkipped += 1;
        } else {
          existingSigs.add(sig);
          toAdd.push(item);
          syncAdded += 1;
          if (item.date > syncLatest) syncLatest = item.date;
        }
      }

      if (toAdd.length > 0) {
        setEntries((prev) => {
          const prevSigs = new Set(prev.map(buildDedupeSignature));
          const uniqueNew = toAdd.filter((i) => !prevSigs.has(buildDedupeSignature(i)));
          if (uniqueNew.length === 0) return prev;
          const next = [...prev, ...uniqueNew].sort((a, b) => {
            const d = b.date.localeCompare(a.date);
            if (d !== 0) return d;
            return b.entryTime.localeCompare(a.entryTime);
          });
          persistEntries(next);
          return next;
        });
      }

      return {
        added: syncAdded,
        skippedDuplicates: syncSkipped,
        latestMonth: syncLatest
          ? syncLatest.slice(0, 7)
          : incoming[0].date.slice(0, 7),
      };
    },
    [entries, persistEntries]
  );

  const addManualEntry = useCallback(
    (entry: Omit<PaperTradeEntry, 'id' | 'savedAt' | 'source'>) => {
      const nextItem: PaperTradeEntry = {
        ...entry,
        id: `pt_manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        source: 'MANUAL',
        savedAt: new Date().toISOString(),
      };
      setEntries((prev) => {
        const next = [nextItem, ...prev].sort((a, b) => {
          const d = b.date.localeCompare(a.date);
          if (d !== 0) return d;
          return b.entryTime.localeCompare(a.entryTime);
        });
        persistEntries(next);
        return next;
      });
      return nextItem;
    },
    [persistEntries]
  );

  const updateNote = useCallback(
    (id: string, note: string) => {
      setEntries((prev) => {
        const next = prev.map((e) => (e.id === id ? { ...e, note } : e));
        persistEntries(next);
        return next;
      });
    },
    [persistEntries]
  );

  const deleteEntry = useCallback(
    (id: string) => {
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== id);
        persistEntries(next);
        return next;
      });
    },
    [persistEntries]
  );

  const deleteDayEntries = useCallback(
    (date: string) => {
      setEntries((prev) => {
        const next = prev.filter((e) => e.date !== date);
        persistEntries(next);
        return next;
      });
    },
    [persistEntries]
  );

  const deleteMonthEntries = useCallback(
    (yearMonth: string) => {
      setEntries((prev) => {
        const next = prev.filter((e) => !e.date.startsWith(yearMonth));
        persistEntries(next);
        return next;
      });
    },
    [persistEntries]
  );

  const clearAllEntries = useCallback(() => {
    setEntries([]);
    persistEntries([]);
  }, [persistEntries]);

  const stats = useMemo(() => computePaperJournalStats(entries), [entries]);
  const monthlyBuckets = useMemo(
    () => groupPaperTradesByMonth(entries),
    [entries]
  );
  const dailyMap = useMemo(() => groupPaperTradesByDate(entries), [entries]);

  return {
    entries,
    stats,
    monthlyBuckets,
    dailyMap,
    hydrateFromServer,
    saveEntries,
    addManualEntry,
    updateNote,
    deleteEntry,
    deleteDayEntries,
    deleteMonthEntries,
    clearAllEntries,
  };
}

export type PaperTradeJournalController = ReturnType<typeof usePaperTradeJournal>;
