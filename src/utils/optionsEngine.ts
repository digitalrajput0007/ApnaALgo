import { normalizeFyersSymbol } from './fyersSymbols';

export interface UnderlyingStaticSpec {
  underlying: string;
  exchange: 'NSE' | 'BSE';
  displayName: string;
  fyersSpotSymbol: string;
  lotSize: number;
  strikeStep: number;
  recommendedSlPoints: number;
  recommendedTargetPoints: number;
  approxFuturesMargin: number;
  isIndex: boolean;
}

export interface InstrumentMeta {
  normalizedSymbol: string;
  underlying: string;
  displayName: string;
  exchange: 'NSE' | 'BSE' | 'MCX';
  fnoEnabled: boolean;
  isIndex: boolean;
  lotSize: number;
  strikeStep: number;
  nearFuturesSymbol: string | null;
  nearExpiryIso: string | null;
  nextExpiryIso: string | null;
  availableExpiries: Array<{ epoch: number; isoDate: string; label: string }>;
  recommendedSlPoints: number;
  recommendedTargetPoints: number;
  approxFuturesMargin: number;
  source: 'fyers_master' | 'sebi_2026_registry' | 'cash_equity';
}

export interface OptionStrikeRecommendation {
  underlying: string;
  direction: 'LONG' | 'SHORT';
  optionType: 'CE' | 'PE';
  spotPrice: number;
  atmStrike: number;
  selectedStrike: number;
  strikeStep: number;
  itmSteps: number;
  moneynessLabel: string;
  targetDelta: number;
  effectiveDelta: number;
  contractLabel: string;
  fyersOptionSymbol: string | null;
  expiryLabel: string;
  expiryIso: string | null;
  isExpiryNearRisk: boolean;
  lotSize: number;
  lots: number;
  totalQty: number;
  /** Live Fyers LTP if available, otherwise realistic Black-Scholes-style estimate */
  optionEntryPrice: number;
  isLivePrice: boolean;
  optionSlPoints: number;
  optionTargetPoints: number;
  optionSlPrice: number;
  optionTrailTriggerPrice: number;
  optionTargetPrice: number;
  capitalRequired: number;
  riskRupees: number;
  rewardRupees: number;
  riskRewardRatio: number;
  approxFuturesMargin: number;
  capitalSavedPct: number;
  deltaGuidance: string;
}

/**
 * 2026 SEBI-revised Indian F&O lot sizes & strike intervals (used as instant baseline
 * and fallback if the daily Fyers Symbol Master CSV is unavailable).
 */
export const STATIC_FNO_REGISTRY: Record<string, UnderlyingStaticSpec> = {
  NIFTY: {
    underlying: 'NIFTY',
    exchange: 'NSE',
    displayName: 'NIFTY 50',
    fyersSpotSymbol: 'NSE:NIFTY50-INDEX',
    lotSize: 65,
    strikeStep: 50,
    recommendedSlPoints: 20,
    recommendedTargetPoints: 60,
    approxFuturesMargin: 155000,
    isIndex: true,
  },
  BANKNIFTY: {
    underlying: 'BANKNIFTY',
    exchange: 'NSE',
    displayName: 'BANK NIFTY',
    fyersSpotSymbol: 'NSE:NIFTYBANK-INDEX',
    lotSize: 30,
    strikeStep: 100,
    recommendedSlPoints: 45,
    recommendedTargetPoints: 135,
    approxFuturesMargin: 165000,
    isIndex: true,
  },
  FINNIFTY: {
    underlying: 'FINNIFTY',
    exchange: 'NSE',
    displayName: 'FIN NIFTY',
    fyersSpotSymbol: 'NSE:FINNIFTY-INDEX',
    lotSize: 60,
    strikeStep: 50,
    recommendedSlPoints: 25,
    recommendedTargetPoints: 75,
    approxFuturesMargin: 150000,
    isIndex: true,
  },
  MIDCPNIFTY: {
    underlying: 'MIDCPNIFTY',
    exchange: 'NSE',
    displayName: 'MIDCAP NIFTY',
    fyersSpotSymbol: 'NSE:MIDCPNIFTY-INDEX',
    lotSize: 120,
    strikeStep: 25,
    recommendedSlPoints: 15,
    recommendedTargetPoints: 45,
    approxFuturesMargin: 145000,
    isIndex: true,
  },
  NIFTYNXT50: {
    underlying: 'NIFTYNXT50',
    exchange: 'NSE',
    displayName: 'NIFTY NEXT 50',
    fyersSpotSymbol: 'NSE:NIFTYNXT50-INDEX',
    lotSize: 25,
    strikeStep: 100,
    recommendedSlPoints: 40,
    recommendedTargetPoints: 120,
    approxFuturesMargin: 155000,
    isIndex: true,
  },
  SENSEX: {
    underlying: 'SENSEX',
    exchange: 'BSE',
    displayName: 'SENSEX',
    fyersSpotSymbol: 'BSE:SENSEX-INDEX',
    lotSize: 20,
    strikeStep: 100,
    recommendedSlPoints: 60,
    recommendedTargetPoints: 180,
    approxFuturesMargin: 165000,
    isIndex: true,
  },
  BANKEX: {
    underlying: 'BANKEX',
    exchange: 'BSE',
    displayName: 'BANKEX',
    fyersSpotSymbol: 'BSE:BANKEX-INDEX',
    lotSize: 30,
    strikeStep: 100,
    recommendedSlPoints: 45,
    recommendedTargetPoints: 135,
    approxFuturesMargin: 155000,
    isIndex: true,
  },
  // Popular NSE F&O stocks (fallback if Fyers live CSV is unreachable)
  SBIN: {
    underlying: 'SBIN',
    exchange: 'NSE',
    displayName: 'SBIN',
    fyersSpotSymbol: 'NSE:SBIN-EQ',
    lotSize: 750,
    strikeStep: 10,
    recommendedSlPoints: 6,
    recommendedTargetPoints: 18,
    approxFuturesMargin: 145000,
    isIndex: false,
  },
  RELIANCE: {
    underlying: 'RELIANCE',
    exchange: 'NSE',
    displayName: 'RELIANCE',
    fyersSpotSymbol: 'NSE:RELIANCE-EQ',
    lotSize: 500,
    strikeStep: 20,
    recommendedSlPoints: 10,
    recommendedTargetPoints: 30,
    approxFuturesMargin: 150000,
    isIndex: false,
  },
  HDFCBANK: {
    underlying: 'HDFCBANK',
    exchange: 'NSE',
    displayName: 'HDFCBANK',
    fyersSpotSymbol: 'NSE:HDFCBANK-EQ',
    lotSize: 550,
    strikeStep: 20,
    recommendedSlPoints: 12,
    recommendedTargetPoints: 36,
    approxFuturesMargin: 155000,
    isIndex: false,
  },
  ICICIBANK: {
    underlying: 'ICICIBANK',
    exchange: 'NSE',
    displayName: 'ICICIBANK',
    fyersSpotSymbol: 'NSE:ICICIBANK-EQ',
    lotSize: 700,
    strikeStep: 20,
    recommendedSlPoints: 10,
    recommendedTargetPoints: 30,
    approxFuturesMargin: 155000,
    isIndex: false,
  },
  INFY: {
    underlying: 'INFY',
    exchange: 'NSE',
    displayName: 'INFY',
    fyersSpotSymbol: 'NSE:INFY-EQ',
    lotSize: 400,
    strikeStep: 20,
    recommendedSlPoints: 12,
    recommendedTargetPoints: 36,
    approxFuturesMargin: 150000,
    isIndex: false,
  },
  TCS: {
    underlying: 'TCS',
    exchange: 'NSE',
    displayName: 'TCS',
    fyersSpotSymbol: 'NSE:TCS-EQ',
    lotSize: 175,
    strikeStep: 50,
    recommendedSlPoints: 25,
    recommendedTargetPoints: 75,
    approxFuturesMargin: 150000,
    isIndex: false,
  },
  AXISBANK: {
    underlying: 'AXISBANK',
    exchange: 'NSE',
    displayName: 'AXISBANK',
    fyersSpotSymbol: 'NSE:AXISBANK-EQ',
    lotSize: 625,
    strikeStep: 20,
    recommendedSlPoints: 10,
    recommendedTargetPoints: 30,
    approxFuturesMargin: 150000,
    isIndex: false,
  },
  KOTAKBANK: {
    underlying: 'KOTAKBANK',
    exchange: 'NSE',
    displayName: 'KOTAKBANK',
    fyersSpotSymbol: 'NSE:KOTAKBANK-EQ',
    lotSize: 400,
    strikeStep: 20,
    recommendedSlPoints: 15,
    recommendedTargetPoints: 45,
    approxFuturesMargin: 155000,
    isIndex: false,
  },
  BAJFINANCE: {
    underlying: 'BAJFINANCE',
    exchange: 'NSE',
    displayName: 'BAJFINANCE',
    fyersSpotSymbol: 'NSE:BAJFINANCE-EQ',
    lotSize: 125,
    strikeStep: 100,
    recommendedSlPoints: 45,
    recommendedTargetPoints: 135,
    approxFuturesMargin: 165000,
    isIndex: false,
  },
  TATAMOTORS: {
    underlying: 'TATAMOTORS',
    exchange: 'NSE',
    displayName: 'TATAMOTORS',
    fyersSpotSymbol: 'NSE:TATAMOTORS-EQ',
    lotSize: 550,
    strikeStep: 10,
    recommendedSlPoints: 8,
    recommendedTargetPoints: 24,
    approxFuturesMargin: 145000,
    isIndex: false,
  },
  ITC: {
    underlying: 'ITC',
    exchange: 'NSE',
    displayName: 'ITC',
    fyersSpotSymbol: 'NSE:ITC-EQ',
    lotSize: 1600,
    strikeStep: 5,
    recommendedSlPoints: 4,
    recommendedTargetPoints: 12,
    approxFuturesMargin: 145000,
    isIndex: false,
  },
  LT: {
    underlying: 'LT',
    exchange: 'NSE',
    displayName: 'LT',
    fyersSpotSymbol: 'NSE:LT-EQ',
    lotSize: 150,
    strikeStep: 50,
    recommendedSlPoints: 25,
    recommendedTargetPoints: 75,
    approxFuturesMargin: 150000,
    isIndex: false,
  },
  BHARTIARTL: {
    underlying: 'BHARTIARTL',
    exchange: 'NSE',
    displayName: 'BHARTIARTL',
    fyersSpotSymbol: 'NSE:BHARTIARTL-EQ',
    lotSize: 475,
    strikeStep: 20,
    recommendedSlPoints: 12,
    recommendedTargetPoints: 36,
    approxFuturesMargin: 155000,
    isIndex: false,
  },
  TATASTEEL: {
    underlying: 'TATASTEEL',
    exchange: 'NSE',
    displayName: 'TATASTEEL',
    fyersSpotSymbol: 'NSE:TATASTEEL-EQ',
    lotSize: 5500,
    strikeStep: 2.5,
    recommendedSlPoints: 1.5,
    recommendedTargetPoints: 4.5,
    approxFuturesMargin: 155000,
    isIndex: false,
  },
};

export interface OptionDeltaPreset {
  id: 'atm' | 'itm_recommended' | 'deep_itm';
  label: string;
  delta: number;
  itmSteps: number;
  summary: string;
}

export const OPTION_DELTA_PRESETS: OptionDeltaPreset[] = [
  {
    id: 'atm',
    label: 'ATM (~0.52Δ)',
    delta: 0.52,
    itmSteps: 0,
    summary: 'Lowest upfront capital, but higher theta decay during pullbacks.',
  },
  {
    id: 'itm_recommended',
    label: 'ITM 1–2 (~0.65Δ)',
    delta: 0.65,
    itmSteps: 2,
    summary:
      'Recommended sweet spot: low theta bleed, clean 1:1 cost trail & 1:3 RR.',
  },
  {
    id: 'deep_itm',
    label: 'Deep ITM (~0.75Δ)',
    delta: 0.75,
    itmSteps: 3,
    summary: 'Closest to Futures movement with minimal time decay.',
  },
];

/**
 * Extract the canonical F&O underlying name from any Fyers symbol or scenario label.
 * Examples:
 * - "NSE:NIFTY50-INDEX"   -> "NIFTY"
 * - "NSE:NIFTYBANK-INDEX" -> "BANKNIFTY"
 * - "NSE:FINNIFTY-INDEX"  -> "FINNIFTY"
 * - "NSE:MIDCPNIFTY-INDEX"-> "MIDCPNIFTY"
 * - "BSE:SENSEX-INDEX"    -> "SENSEX"
 * - "NSE:SBIN-EQ"         -> "SBIN"
 * - "Fyers Live: NSE:NIFTYBANK-INDEX" -> "BANKNIFTY"
 */
export function extractUnderlyingKey(rawSymbol: string | null | undefined): string {
  const cleaned = (rawSymbol || '')
    .replace(/^Fyers\s+Live:\s*/i, '')
    .trim();
  if (!cleaned) return 'NIFTY';

  // Detect preset scenario names like "Bullish Trend Day · 4-Candle Lock"
  if (/\bNIFTY\b/i.test(cleaned) && !cleaned.includes(':') && !/BANK|FIN|MID/i.test(cleaned)) {
    return 'NIFTY';
  }

  const normalized = normalizeFyersSymbol(cleaned);
  const [, rawTicker = ''] = normalized.split(':');
  const base = rawTicker.replace(/-(INDEX|EQ|BE|SM|A|B)$/i, '');

  if (base === 'NIFTY50' || base === 'NIFTY') return 'NIFTY';
  if (base === 'NIFTYBANK' || base === 'BANKNIFTY') return 'BANKNIFTY';
  if (base === 'FINNIFTY' || base === 'NIFTYFIN') return 'FINNIFTY';
  if (base === 'MIDCPNIFTY' || base === 'MIDCAPNIFTY') return 'MIDCPNIFTY';
  if (base === 'NIFTYNXT50') return 'NIFTYNXT50';
  if (base === 'SENSEX') return 'SENSEX';
  if (base === 'BANKEX') return 'BANKEX';

  // Strip F&O expiry/strike suffix if user typed an F&O contract like NIFTY26NOVFUT or SBIN26NOV800CE
  const foMatch = base.match(/^([A-Z&-]+?)\d{2}[A-Z0-9]+(FUT|CE|PE)$/);
  if (foMatch) {
    return foMatch[1];
  }

  return base || 'NIFTY';
}

export function getFallbackInstrumentMeta(rawSymbol: string): InstrumentMeta {
  const normalized = normalizeFyersSymbol(rawSymbol);
  const underlying = extractUnderlyingKey(normalized);
  const spec = STATIC_FNO_REGISTRY[underlying];

  if (spec) {
    return {
      normalizedSymbol: normalized,
      underlying: spec.underlying,
      displayName: spec.displayName,
      exchange: spec.exchange,
      fnoEnabled: true,
      isIndex: spec.isIndex,
      lotSize: spec.lotSize,
      strikeStep: spec.strikeStep,
      nearFuturesSymbol: null,
      nearExpiryIso: null,
      nextExpiryIso: null,
      availableExpiries: [],
      recommendedSlPoints: spec.recommendedSlPoints,
      recommendedTargetPoints: spec.recommendedTargetPoints,
      approxFuturesMargin: spec.approxFuturesMargin,
      source: 'sebi_2026_registry',
    };
  }

  const exchange = normalized.startsWith('BSE:')
    ? 'BSE'
    : normalized.startsWith('MCX:')
    ? 'MCX'
    : 'NSE';

  return {
    normalizedSymbol: normalized,
    underlying,
    displayName: underlying,
    exchange,
    fnoEnabled: false,
    isIndex: false,
    lotSize: 1,
    strikeStep: 10,
    nearFuturesSymbol: null,
    nearExpiryIso: null,
    nextExpiryIso: null,
    availableExpiries: [],
    recommendedSlPoints: 10,
    recommendedTargetPoints: 30,
    approxFuturesMargin: 100000,
    source: 'cash_equity',
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Map a target option delta (0.45 - 0.85) to ITM strike steps.
 */
export function deltaToItmSteps(targetDelta: number): {
  itmSteps: number;
  effectiveDelta: number;
  moneynessLabel: string;
} {
  const d = Math.max(0.4, Math.min(0.85, targetDelta));
  if (d < 0.55) {
    return { itmSteps: 0, effectiveDelta: d, moneynessLabel: 'ATM' };
  }
  if (d < 0.62) {
    return { itmSteps: 1, effectiveDelta: d, moneynessLabel: '1 Strike ITM' };
  }
  if (d < 0.72) {
    return { itmSteps: 2, effectiveDelta: d, moneynessLabel: '2 Strikes ITM' };
  }
  if (d < 0.8) {
    return { itmSteps: 3, effectiveDelta: d, moneynessLabel: '3 Strikes ITM' };
  }
  return { itmSteps: 4, effectiveDelta: d, moneynessLabel: '4 Strikes ITM (Deep)' };
}

/**
 * Estimate realistic near-weekly Indian index/stock option premium when live LTP is unavailable
 * (historical replay or Fyers disconnected). Intrinsic + ~0.48% spot ATM extrinsic decayed by ITM depth.
 */
function estimateOptionPremium(
  spotPrice: number,
  selectedStrike: number,
  optionType: 'CE' | 'PE',
  itmSteps: number
): number {
  const intrinsic =
    optionType === 'CE'
      ? Math.max(0, spotPrice - selectedStrike)
      : Math.max(0, selectedStrike - spotPrice);
  const atmExtrinsic = Math.max(12, spotPrice * 0.0046);
  const extrinsicDecayFactor = Math.max(0.45, 1 - itmSteps * 0.14);
  return round2(intrinsic + atmExtrinsic * extrinsicDecayFactor);
}

/**
 * Compute an actionable CE/PE option buying recommendation for any index/stock signal.
 */
export function computeOptionRecommendation(params: {
  symbol: string;
  spotPrice: number;
  direction: 'LONG' | 'SHORT';
  targetDelta: number;
  slPoints: number;
  targetPoints: number;
  lotSize: number;
  lots: number;
  strikeStep?: number;
  approxFuturesMargin?: number;
  liveOptionLtp?: number | null;
  liveOptionSymbol?: string | null;
  expiryLabel?: string | null;
  expiryIso?: string | null;
  isExpiryNearRisk?: boolean;
}): OptionStrikeRecommendation {
  const fallback = getFallbackInstrumentMeta(params.symbol);
  const underlying = fallback.underlying;
  const strikeStep =
    params.strikeStep && params.strikeStep > 0
      ? params.strikeStep
      : fallback.strikeStep;
  const optionType: 'CE' | 'PE' = params.direction === 'LONG' ? 'CE' : 'PE';
  const atmStrike = Math.round(params.spotPrice / strikeStep) * strikeStep;

  const { itmSteps, effectiveDelta, moneynessLabel } = deltaToItmSteps(
    params.targetDelta
  );

  const selectedStrike =
    optionType === 'CE'
      ? atmStrike - itmSteps * strikeStep
      : atmStrike + itmSteps * strikeStep;

  const hasLive =
    typeof params.liveOptionLtp === 'number' && params.liveOptionLtp > 0;
  const optionEntryPrice = hasLive
    ? round2(params.liveOptionLtp as number)
    : estimateOptionPremium(
        params.spotPrice,
        selectedStrike,
        optionType,
        itmSteps
      );

  const optionSlPoints = Math.max(
    1,
    round1(params.slPoints * effectiveDelta)
  );
  const optionTargetPoints = Math.max(
    2,
    round1(params.targetPoints * effectiveDelta)
  );
  const optionSlPrice = round2(Math.max(0.5, optionEntryPrice - optionSlPoints));
  const optionTrailTriggerPrice = round2(optionEntryPrice + optionSlPoints);
  const optionTargetPrice = round2(optionEntryPrice + optionTargetPoints);

  const totalQty = Math.max(1, params.lotSize * params.lots);
  const capitalRequired = Math.round(optionEntryPrice * totalQty);
  const riskRupees = Math.round(optionSlPoints * totalQty);
  const rewardRupees = Math.round(optionTargetPoints * totalQty);
  const riskRewardRatio = round2(optionTargetPoints / Math.max(0.5, optionSlPoints));

  const approxFuturesMargin =
    (params.approxFuturesMargin || fallback.approxFuturesMargin) *
    Math.max(1, params.lots);
  const capitalSavedPct = Math.max(
    0,
    Math.min(
      96,
      Math.round(((approxFuturesMargin - capitalRequired) / approxFuturesMargin) * 100)
    )
  );

  let deltaGuidance =
    'Sweet spot (0.60–0.70Δ): intrinsic-heavy ITM minimizes theta decay during RSI pullbacks and keeps 1:1 cost trail clean.';
  if (effectiveDelta < 0.56) {
    deltaGuidance =
      'ATM (~0.50Δ): lower capital needed, but watch theta bleed if price consolidates for 20+ mins after entry.';
  } else if (effectiveDelta >= 0.72) {
    deltaGuidance =
      'Deep ITM (0.75Δ+): tracks spot closely like a mini-future with almost zero theta drag; slightly higher upfront premium.';
  }

  return {
    underlying,
    direction: params.direction,
    optionType,
    spotPrice: round2(params.spotPrice),
    atmStrike,
    selectedStrike,
    strikeStep,
    itmSteps,
    moneynessLabel,
    targetDelta: params.targetDelta,
    effectiveDelta,
    contractLabel: `${underlying} ${selectedStrike} ${optionType}`,
    fyersOptionSymbol: params.liveOptionSymbol || null,
    expiryLabel: params.expiryLabel || 'Nearest Weekly / Monthly',
    expiryIso: params.expiryIso || null,
    isExpiryNearRisk: Boolean(params.isExpiryNearRisk),
    lotSize: params.lotSize,
    lots: params.lots,
    totalQty,
    optionEntryPrice,
    isLivePrice: hasLive,
    optionSlPoints,
    optionTargetPoints,
    optionSlPrice,
    optionTrailTriggerPrice,
    optionTargetPrice,
    capitalRequired,
    riskRupees,
    rewardRupees,
    riskRewardRatio,
    approxFuturesMargin,
    capitalSavedPct,
    deltaGuidance,
  };
}
