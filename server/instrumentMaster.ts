import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { normalizeFyersSymbol } from '../src/utils/fyersSymbols';
import {
  extractUnderlyingKey,
  getFallbackInstrumentMeta,
  InstrumentMeta,
  STATIC_FNO_REGISTRY,
} from '../src/utils/optionsEngine';

interface OptionContractEntry {
  symbol: string;
  strike: number;
  optionType: 'CE' | 'PE';
  expiryEpoch: number;
  expiryIso: string;
  lotSize: number;
}

interface UnderlyingMasterRecord {
  underlying: string;
  exchange: 'NSE' | 'BSE';
  lotSize: number;
  strikeStep: number;
  nearFuturesSymbol: string | null;
  nearFuturesExpiryIso: string | null;
  expiries: Array<{ epoch: number; isoDate: string; label: string }>;
  /** Indexed by `${expiryIso}_${strike}_${optionType}` -> Fyers symbol */
  optionSymbols: Record<string, string>;
}

interface PersistedInstrumentMaster {
  istDate: string;
  fetchedAt: number;
  underlyings: Record<string, UnderlyingMasterRecord>;
}

const FYERS_MASTER_URLS: Array<{ exchange: 'NSE' | 'BSE'; url: string }> = [
  {
    exchange: 'NSE',
    url: 'https://public.fyers.in/sym_details/NSE_FO.csv',
  },
  {
    exchange: 'BSE',
    url: 'https://public.fyers.in/sym_details/BSE_FO.csv',
  },
];

function getMasterCachePath(): string {
  const configured = process.env.DATA_DIR?.trim();
  const baseDir = path.resolve(process.cwd(), configured || 'data');
  return path.join(baseDir, 'instrument_master.json');
}

function getTodayIstDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatEpochToIstIso(epochSec: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochSec * 1000));
}

function formatExpiryLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(dt);
}

function atomicWrite(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const tmpPath = `${targetPath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  fs.renameSync(tmpPath, targetPath);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function inferStrikeStep(strikes: number[], fallback: number): number {
  if (strikes.length < 3) return fallback;
  const sorted = Array.from(new Set(strikes)).sort((a, b) => a - b);
  const diffCounts = new Map<number, number>();
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round((sorted[i] - sorted[i - 1]) * 100) / 100;
    if (diff > 0) {
      diffCounts.set(diff, (diffCounts.get(diff) || 0) + 1);
    }
  }
  let bestDiff = fallback;
  let bestCount = 0;
  for (const [diff, count] of diffCounts.entries()) {
    if (count > bestCount || (count === bestCount && diff < bestDiff)) {
      bestCount = count;
      bestDiff = diff;
    }
  }
  return bestDiff > 0 ? bestDiff : fallback;
}

class FyersInstrumentMasterStore {
  private cache: PersistedInstrumentMaster | null = null;
  private inflightRefresh: Promise<PersistedInstrumentMaster | null> | null =
    null;

  private loadFromDisk(): PersistedInstrumentMaster | null {
    const filePath = getMasterCachePath();
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedInstrumentMaster;
      if (parsed && parsed.istDate && parsed.underlyings) {
        return parsed;
      }
    } catch {
      // Ignore corrupt cache and refresh
    }
    return null;
  }

  private async fetchAndBuildMaster(): Promise<PersistedInstrumentMaster | null> {
    const todayIst = getTodayIstDate();
    const nowEpoch = Math.floor(Date.now() / 1000) - 12 * 3600; // include today's expiry

    interface TempAgg {
      underlying: string;
      exchange: 'NSE' | 'BSE';
      futures: Array<{ symbol: string; expiryEpoch: number; expiryIso: string; lotSize: number }>;
      options: OptionContractEntry[];
    }

    const aggMap = new Map<string, TempAgg>();

    const results = await Promise.allSettled(
      FYERS_MASTER_URLS.map(async ({ exchange, url }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const resp = await fetch(url, { signal: controller.signal });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const text = await resp.text();
          return { exchange, text };
        } finally {
          clearTimeout(timer);
        }
      })
    );

    let parsedAny = false;

    for (const res of results) {
      if (res.status !== 'fulfilled') continue;
      const { exchange, text } = res.value;
      const lines = text.split(/\r?\n/);

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const cols = parseCsvLine(line);
        if (cols.length < 17) continue;

        const lotSize = Number(cols[3]);
        const expiryEpoch = Number(cols[8]);
        const ticker = cols[9];
        const underlying = (cols[13] || '').trim().toUpperCase();
        const strike = Number(cols[15]);
        const optType = (cols[16] || '').trim().toUpperCase();

        if (!underlying || !ticker || !Number.isFinite(lotSize) || lotSize <= 0) {
          continue;
        }
        if (!Number.isFinite(expiryEpoch) || expiryEpoch < nowEpoch) {
          continue;
        }

        const expiryIso = formatEpochToIstIso(expiryEpoch);
        // Prefer NSE if same underlying exists on both, unless it's a BSE index like SENSEX/BANKEX
        const existing = aggMap.get(underlying);
        if (existing && existing.exchange === 'NSE' && exchange === 'BSE') {
          continue;
        }

        let bucket = existing;
        if (!bucket) {
          bucket = {
            underlying,
            exchange,
            futures: [],
            options: [],
          };
          aggMap.set(underlying, bucket);
        }

        if (optType === 'XX' || ticker.endsWith('FUT')) {
          bucket.futures.push({
            symbol: ticker,
            expiryEpoch,
            expiryIso,
            lotSize,
          });
          parsedAny = true;
        } else if ((optType === 'CE' || optType === 'PE') && Number.isFinite(strike) && strike > 0) {
          bucket.options.push({
            symbol: ticker,
            strike,
            optionType: optType,
            expiryEpoch,
            expiryIso,
            lotSize,
          });
          parsedAny = true;
        }
      }
    }

    if (!parsedAny || aggMap.size === 0) {
      return null;
    }

    const underlyings: Record<string, UnderlyingMasterRecord> = {};

    for (const [underlying, agg] of aggMap.entries()) {
      agg.futures.sort((a, b) => a.expiryEpoch - b.expiryEpoch);
      const nearFut = agg.futures[0] || null;

      // Distinct sorted option expiries (keep up to 4 nearest expiries to stay compact)
      const expiryMap = new Map<string, number>();
      for (const opt of agg.options) {
        const prev = expiryMap.get(opt.expiryIso);
        if (!prev || opt.expiryEpoch < prev) {
          expiryMap.set(opt.expiryIso, opt.expiryEpoch);
        }
      }
      const sortedExpiries = Array.from(expiryMap.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, 4)
        .map(([isoDate, epoch]) => ({
          epoch,
          isoDate,
          label: formatExpiryLabel(isoDate),
        }));

      const keptExpirySet = new Set(sortedExpiries.map((e) => e.isoDate));
      const nearExpiryIso = sortedExpiries[0]?.isoDate || null;
      const nearStrikes: number[] = [];
      const optionSymbols: Record<string, string> = {};

      for (const opt of agg.options) {
        if (!keptExpirySet.has(opt.expiryIso)) continue;
        optionSymbols[`${opt.expiryIso}_${opt.strike}_${opt.optionType}`] =
          opt.symbol;
        if (opt.expiryIso === nearExpiryIso) {
          nearStrikes.push(opt.strike);
        }
      }

      const fallbackSpec = STATIC_FNO_REGISTRY[underlying];
      const lotSize =
        nearFut?.lotSize ||
        agg.options[0]?.lotSize ||
        fallbackSpec?.lotSize ||
        1;
      const strikeStep = inferStrikeStep(
        nearStrikes,
        fallbackSpec?.strikeStep || 50
      );

      underlyings[underlying] = {
        underlying,
        exchange: agg.exchange,
        lotSize,
        strikeStep,
        nearFuturesSymbol: nearFut?.symbol || null,
        nearFuturesExpiryIso: nearFut?.expiryIso || null,
        expiries: sortedExpiries,
        optionSymbols,
      };
    }

    const built: PersistedInstrumentMaster = {
      istDate: todayIst,
      fetchedAt: Date.now(),
      underlyings,
    };

    try {
      atomicWrite(getMasterCachePath(), JSON.stringify(built));
    } catch {
      // Non-fatal if disk write fails
    }

    this.cache = built;
    return built;
  }

  private async ensureMaster(): Promise<PersistedInstrumentMaster | null> {
    const todayIst = getTodayIstDate();
    if (this.cache && this.cache.istDate === todayIst) {
      return this.cache;
    }

    const disk = this.loadFromDisk();
    if (disk && disk.istDate === todayIst) {
      this.cache = disk;
      return disk;
    }

    if (!this.inflightRefresh) {
      this.inflightRefresh = this.fetchAndBuildMaster().finally(() => {
        this.inflightRefresh = null;
      });
    }

    const refreshed = await this.inflightRefresh;
    if (refreshed) return refreshed;

    // Fallback to yesterday's disk cache if Fyers CDN was temporarily unreachable
    if (disk) {
      this.cache = disk;
      return disk;
    }
    return null;
  }

  public async getInstrumentMeta(rawSymbol: string): Promise<InstrumentMeta> {
    const normalized = normalizeFyersSymbol(rawSymbol);
    const underlying = extractUnderlyingKey(normalized);
    const fallback = getFallbackInstrumentMeta(normalized);
    const master = await this.ensureMaster();
    const rec = master?.underlyings[underlying];

    if (!rec) {
      return fallback;
    }

    const staticSpec = STATIC_FNO_REGISTRY[underlying];
    return {
      normalizedSymbol: normalized,
      underlying,
      displayName: staticSpec?.displayName || underlying,
      exchange: rec.exchange,
      fnoEnabled: true,
      isIndex: staticSpec?.isIndex ?? normalized.endsWith('-INDEX'),
      lotSize: rec.lotSize,
      strikeStep: rec.strikeStep,
      nearFuturesSymbol: rec.nearFuturesSymbol,
      nearExpiryIso: rec.expiries[0]?.isoDate || rec.nearFuturesExpiryIso || null,
      nextExpiryIso: rec.expiries[1]?.isoDate || null,
      availableExpiries: rec.expiries,
      recommendedSlPoints: staticSpec?.recommendedSlPoints ?? fallback.recommendedSlPoints,
      recommendedTargetPoints:
        staticSpec?.recommendedTargetPoints ?? fallback.recommendedTargetPoints,
      approxFuturesMargin:
        staticSpec?.approxFuturesMargin ?? fallback.approxFuturesMargin,
      source: 'fyers_master',
    };
  }

  public async lookupOptionContract(params: {
    symbol: string;
    strike: number;
    optionType: 'CE' | 'PE';
    expiryChoice?: 'current' | 'next';
  }): Promise<{
    fyersOptionSymbol: string | null;
    expiryIso: string | null;
    expiryLabel: string | null;
    isExpiryNearRisk: boolean;
  }> {
    const normalized = normalizeFyersSymbol(params.symbol);
    const underlying = extractUnderlyingKey(normalized);
    const master = await this.ensureMaster();
    const rec = master?.underlyings[underlying];

    if (!rec || rec.expiries.length === 0) {
      return {
        fyersOptionSymbol: null,
        expiryIso: null,
        expiryLabel: null,
        isExpiryNearRisk: false,
      };
    }

    const todayIst = getTodayIstDate();
    const firstExpiry = rec.expiries[0];
    const daysToFirst = firstExpiry
      ? Math.round(
          (Date.parse(`${firstExpiry.isoDate}T00:00:00Z`) -
            Date.parse(`${todayIst}T00:00:00Z`)) /
            (24 * 60 * 60 * 1000)
        )
      : 7;

    const isExpiryNearRisk = daysToFirst <= 1;
    const chosen =
      params.expiryChoice === 'next' && rec.expiries[1]
        ? rec.expiries[1]
        : rec.expiries[0];

    const exactKey = `${chosen.isoDate}_${params.strike}_${params.optionType}`;
    let fyersOptionSymbol = rec.optionSymbols[exactKey] || null;

    // If exact strike doesn't exist (e.g. non-standard strike grid), find closest available strike
    if (!fyersOptionSymbol) {
      const prefix = `${chosen.isoDate}_`;
      const suffix = `_${params.optionType}`;
      let bestDist = Infinity;
      for (const [k, sym] of Object.entries(rec.optionSymbols)) {
        if (!k.startsWith(prefix) || !k.endsWith(suffix)) continue;
        const strikeVal = Number(
          k.slice(prefix.length, k.length - suffix.length)
        );
        if (!Number.isFinite(strikeVal)) continue;
        const dist = Math.abs(strikeVal - params.strike);
        if (dist < bestDist) {
          bestDist = dist;
          fyersOptionSymbol = sym;
        }
      }
    }

    return {
      fyersOptionSymbol,
      expiryIso: chosen.isoDate,
      expiryLabel: chosen.label,
      isExpiryNearRisk,
    };
  }
}

export const instrumentMaster = new FyersInstrumentMasterStore();
