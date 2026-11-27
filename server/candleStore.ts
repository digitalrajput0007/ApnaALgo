import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface StoredCandleBar {
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

interface SymbolCandleDbFile {
  symbol: string;
  updatedAt: number;
  /** IST date (YYYY-MM-DD) -> strictly sorted, deduplicated 5m bars */
  days: Record<string, StoredCandleBar[]>;
  /** Confirmed past holidays/weekends/no-data dates so we skip re-fetching them */
  emptyDates: Record<string, true>;
  /** Dates confirmed as complete historical downloads (not partial intraday live snapshots) */
  completeDays?: Record<string, true>;
}

export interface DateGapRange {
  fromDate: string;
  toDate: string;
}

function getCandleDbDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  const baseDir = path.resolve(process.cwd(), configured || 'data');
  return path.join(baseDir, 'candle_db');
}

function ensureCandleDbDir(): string {
  const dir = getCandleDbDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function symbolToFileName(symbol: string): string {
  const safe = symbol
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, '__');
  return `${safe || 'UNKNOWN'}.json`;
}

function atomicWriteFile(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const tmpPath = `${targetPath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  fs.renameSync(tmpPath, targetPath);
}

function addDaysYYYYMMDD(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function isWeekendDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

function deduplicateAndSortDay(bars: StoredCandleBar[]): StoredCandleBar[] {
  const byBucket = new Map<string, StoredCandleBar>();
  for (const bar of bars) {
    byBucket.set(`${bar.date}_${bar.time}`, bar);
  }
  return Array.from(byBucket.values())
    .sort((a, b) => a.epoch - b.epoch)
    .map((bar, idx) => ({ ...bar, index: idx }));
}

class CandleDatabaseStore {
  private memCache = new Map<string, SymbolCandleDbFile>();

  private loadSymbolDb(symbol: string): SymbolCandleDbFile {
    const key = symbol.trim().toUpperCase();
    const existing = this.memCache.get(key);
    if (existing) return existing;

    const filePath = path.join(ensureCandleDbDir(), symbolToFileName(key));
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<SymbolCandleDbFile>;
        const db: SymbolCandleDbFile = {
          symbol: key,
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
          days:
            parsed.days && typeof parsed.days === 'object' ? parsed.days : {},
          emptyDates:
            parsed.emptyDates && typeof parsed.emptyDates === 'object'
              ? parsed.emptyDates
              : {},
          completeDays:
            parsed.completeDays && typeof parsed.completeDays === 'object'
              ? parsed.completeDays
              : {},
        };
        this.memCache.set(key, db);
        return db;
      }
    } catch {
      // Fall through to clean DB object if file was corrupted
    }

    const fresh: SymbolCandleDbFile = {
      symbol: key,
      updatedAt: Date.now(),
      days: {},
      emptyDates: {},
      completeDays: {},
    };
    this.memCache.set(key, fresh);
    return fresh;
  }

  private persistSymbolDb(db: SymbolCandleDbFile): void {
    db.updatedAt = Date.now();
    const filePath = path.join(
      ensureCandleDbDir(),
      symbolToFileName(db.symbol)
    );
    try {
      atomicWriteFile(filePath, JSON.stringify(db));
    } catch {
      // Keep in-memory cache intact even if disk write fails
    }
  }

  /**
   * Check whether a single IST trading day is already completely stored in the DB.
   * - Past dates (`date < todayIst`) are immutable once stored (or marked holiday/empty).
   * - Today (`date === todayIst`) is treated as complete only after NSE close (15:35 IST)
   *   and once the closing 15:25 candle is present.
   */
  public getCachedDay(
    symbol: string,
    dateStr: string,
    todayIst: string,
    isMarketClosedToday: boolean
  ): { hit: boolean; candles: StoredCandleBar[] } {
    const db = this.loadSymbolDb(symbol);
    const storedBars = db.days[dateStr];

    if (dateStr < todayIst) {
      if (storedBars && storedBars.length > 0) {
        const lastBar = storedBars[storedBars.length - 1];
        const isConfirmedComplete =
          Boolean(db.completeDays?.[dateStr]) ||
          (Boolean(lastBar) && lastBar.time >= '15:15');
        if (isConfirmedComplete) {
          return { hit: true, candles: storedBars };
        }
        // Incomplete partial intraday snapshot from a previous live session: re-fetch full day
        return { hit: false, candles: [] };
      }
      if (db.emptyDates[dateStr] || isWeekendDate(dateStr)) {
        return { hit: true, candles: [] };
      }
      return { hit: false, candles: [] };
    }

    if (dateStr === todayIst && isMarketClosedToday && storedBars && storedBars.length > 0) {
      const lastBar = storedBars[storedBars.length - 1];
      if (lastBar && lastBar.time >= '15:25') {
        return { hit: true, candles: storedBars };
      }
    }

    return { hit: false, candles: [] };
  }

  /**
   * Upsert newly fetched candles (single day or multi-day range) into the symbol's DB.
   * Optionally mark requested past weekdays that returned 0 bars as empty/holidays.
   */
  public upsertCandles(
    symbol: string,
    candles: StoredCandleBar[],
    coveredRange?: { fromDate: string; toDate: string; todayIst: string }
  ): void {
    const db = this.loadSymbolDb(symbol);
    if (!db.completeDays) db.completeDays = {};
    const grouped = new Map<string, StoredCandleBar[]>();

    for (const c of candles) {
      if (!c.date) continue;
      const list = grouped.get(c.date);
      if (list) list.push(c);
      else grouped.set(c.date, [c]);
    }

    let dirty = false;

    for (const [dateStr, bars] of grouped.entries()) {
      // When upserting partial intraday live bars (no coveredRange), merge with existing bars
      const combined = coveredRange
        ? bars
        : [...(db.days[dateStr] || []), ...bars];
      const normalized = deduplicateAndSortDay(combined);
      if (normalized.length > 0) {
        db.days[dateStr] = normalized;
        if (db.emptyDates[dateStr]) {
          delete db.emptyDates[dateStr];
        }
        if (coveredRange && dateStr < coveredRange.todayIst) {
          db.completeDays[dateStr] = true;
        } else if (
          normalized[normalized.length - 1] &&
          normalized[normalized.length - 1].time >= '15:25'
        ) {
          db.completeDays[dateStr] = true;
        }
        dirty = true;
      }
    }

    // Mark past weekdays within the fetched range that had 0 bars as holidays/empty
    if (coveredRange) {
      let cursor = coveredRange.fromDate;
      while (cursor <= coveredRange.toDate) {
        if (
          cursor < coveredRange.todayIst &&
          !isWeekendDate(cursor) &&
          !grouped.has(cursor) &&
          !(db.days[cursor] && db.days[cursor].length > 0)
        ) {
          db.emptyDates[cursor] = true;
          dirty = true;
        }
        cursor = addDaysYYYYMMDD(cursor, 1);
      }
    }

    if (dirty) {
      this.persistSymbolDb(db);
    }
  }

  /**
   * Compute minimal missing weekday date ranges in [fromDate..toDate] that are not yet stored in DB.
   */
  public getMissingRanges(
    symbol: string,
    fromDate: string,
    toDate: string,
    todayIst: string,
    isMarketClosedToday: boolean
  ): DateGapRange[] {
    const db = this.loadSymbolDb(symbol);
    const missingDates: string[] = [];

    let cursor = fromDate;
    while (cursor <= toDate) {
      if (!isWeekendDate(cursor)) {
        const check = this.getCachedDay(
          symbol,
          cursor,
          todayIst,
          isMarketClosedToday
        );
        if (!check.hit && cursor <= todayIst) {
          // Only fetch up to todayIst (never query future dates)
          missingDates.push(cursor);
        }
      }
      cursor = addDaysYYYYMMDD(cursor, 1);
    }

    if (missingDates.length === 0) return [];

    // Merge nearby missing dates (<= 3 calendar days apart, e.g. across a weekend)
    // into compact contiguous fetch ranges to minimize Fyers API calls.
    const ranges: DateGapRange[] = [];
    let start = missingDates[0];
    let prev = missingDates[0];

    for (let i = 1; i < missingDates.length; i++) {
      const cur = missingDates[i];
      const gapMs =
        Date.parse(`${cur}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`);
      const gapDays = Math.round(gapMs / (24 * 60 * 60 * 1000));
      if (gapDays <= 4) {
        prev = cur;
      } else {
        ranges.push({ fromDate: start, toDate: prev });
        start = cur;
        prev = cur;
      }
    }
    ranges.push({ fromDate: start, toDate: prev });

    // Ensure loaded db ref stays warm
    void db;
    return ranges;
  }

  /**
   * Read all stored candles for [fromDate..toDate] sorted chronologically.
   */
  public getRangeCandles(
    symbol: string,
    fromDate: string,
    toDate: string
  ): StoredCandleBar[] {
    const db = this.loadSymbolDb(symbol);
    const dates = Object.keys(db.days)
      .filter((d) => d >= fromDate && d <= toDate)
      .sort();

    const combined: StoredCandleBar[] = [];
    for (const d of dates) {
      const bars = db.days[d];
      if (bars && bars.length > 0) {
        for (const bar of bars) {
          combined.push(bar);
        }
      }
    }

    return combined
      .sort((a, b) => a.epoch - b.epoch)
      .map((bar, idx) => ({ ...bar, index: idx }));
  }

  public getStats(): { symbols: number; totalDays: number } {
    try {
      const dir = ensureCandleDbDir();
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'));
      let totalDays = 0;
      for (const file of files) {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        const parsed = JSON.parse(raw) as Partial<SymbolCandleDbFile>;
        if (parsed.days && typeof parsed.days === 'object') {
          totalDays += Object.keys(parsed.days).length;
        }
      }
      return { symbols: files.length, totalDays };
    } catch {
      return { symbols: 0, totalDays: 0 };
    }
  }
}

export const candleStore = new CandleDatabaseStore();
