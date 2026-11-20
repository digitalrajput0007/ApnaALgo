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
    label: 'ATM (0.50Δ)',
    delta: 0.5,
    itmSteps: 0,
    summary:
      'Default Options Buy setup: exact 0.50Δ so a 20pt index SL = 10pt option SL with top ATM liquidity.',
  },
  {
    id: 'itm_recommended',
    label: 'ITM 1 (~0.60Δ)',
    delta: 0.6,
    itmSteps: 1,
    summary:
      'Lower theta decay with intrinsic value; 20pt index move ≈ 12pt option move.',
  },
  {
    id: 'deep_itm',
    label: 'Deep ITM (~0.70Δ)',
    delta: 0.7,
    itmSteps: 2,
    summary: 'Closest to index movement with minimal time decay; higher premium per lot.',
  },
];

export interface RiskBasedLotCalculation {
  optionSlPoints: number;
  riskPerLotRupees: number;
  allowedRiskRupees: number;
  allowedDailyRiskRupees: number;
  remainingDailyRiskRupees: number;
  effectiveRiskBudgetRupees: number;
  rawLotsByRisk: number;
  optionLtpUsed: number | null;
  isOptionLtpLive: boolean;
  capitalPerLotRupees: number | null;
  affordableLots: number | null;
  recommendedLots: number;
  executableLots: number;
  totalRiskAtRecommendedLots: number;
  totalCapitalRequired: number | null;
  cappedByCapital: boolean;
  cappedByMaxLots: boolean;
  cappedByDailyRisk: boolean;
  insufficientCapital: boolean;
  dailyLimitReached: boolean;
}

export function calculateRiskBasedLots(params: {
  startingCapital: number;
  liveEquity: number;
  riskMode: 'FIXED_INR' | 'PERCENT_CAPITAL';
  riskPerTradeRupees: number;
  riskPerTradePct: number;
  dailyRiskMode?: 'FIXED_INR' | 'PERCENT_CAPITAL';
  maxDailyLossRupees?: number;
  maxDailyLossPct?: number;
  todayNetPnl?: number;
  maxLotsCap: number;
  indexStopLossPoints: number;
  optionDelta: number;
  isOptionBuying: boolean;
  lotSize: number;
  optionLtp?: number | null;
  isOptionLtpLive?: boolean;
}): RiskBasedLotCalculation {
  const effectiveDelta = params.isOptionBuying
    ? Math.max(0.2, Math.min(1, params.optionDelta || 0.5))
    : 1;
  const lotSize = Math.max(1, Math.round(params.lotSize || 1));

  const hasValidLtp =
    params.isOptionBuying &&
    typeof params.optionLtp === 'number' &&
    Number.isFinite(params.optionLtp) &&
    params.optionLtp > 0;
  const optionLtpUsed = hasValidLtp
    ? Math.round((params.optionLtp as number) * 100) / 100
    : null;

  // For option buying, option SL cannot exceed the live traded option premium itself
  const rawOptionSlPoints = Math.max(
    0.5,
    Math.round(params.indexStopLossPoints * effectiveDelta * 100) / 100
  );
  const optionSlPoints =
    optionLtpUsed !== null
      ? Math.max(0.5, Math.min(rawOptionSlPoints, optionLtpUsed))
      : rawOptionSlPoints;

  const riskPerLotRupees = Math.max(
    1,
    Math.round(optionSlPoints * lotSize * 100) / 100
  );

  const equityBase = Math.max(0, params.liveEquity || params.startingCapital);
  const allowedRiskRupees =
    params.riskMode === 'PERCENT_CAPITAL'
      ? Math.max(
          100,
          Math.round((equityBase * Math.max(0.1, params.riskPerTradePct)) / 100)
        )
      : Math.max(100, Math.round(params.riskPerTradeRupees || 100));

  const dailyMode = params.dailyRiskMode || 'FIXED_INR';
  const allowedDailyRiskRupees =
    dailyMode === 'PERCENT_CAPITAL'
      ? Math.max(
          200,
          Math.round(
            (equityBase * Math.max(0.25, params.maxDailyLossPct ?? 5)) / 100
          )
        )
      : Math.max(200, Math.round(params.maxDailyLossRupees || 5000));

  const todayLossUsed =
    typeof params.todayNetPnl === 'number' && params.todayNetPnl < 0
      ? Math.abs(params.todayNetPnl)
      : 0;
  const remainingDailyRiskRupees = Math.max(
    0,
    Math.round(allowedDailyRiskRupees - todayLossUsed)
  );
  const dailyLimitReached = remainingDailyRiskRupees <= 0;

  const cappedByDailyRisk =
    !dailyLimitReached && remainingDailyRiskRupees < allowedRiskRupees;
  const effectiveRiskBudgetRupees = Math.min(
    allowedRiskRupees,
    remainingDailyRiskRupees
  );

  const rawLotsByRisk = Math.floor(
    effectiveRiskBudgetRupees / riskPerLotRupees
  );
  const maxLotsCap = Math.max(1, Math.floor(params.maxLotsCap || 20));

  const capitalPerLotRupees =
    optionLtpUsed !== null
      ? Math.round(optionLtpUsed * lotSize * 100) / 100
      : null;
  const affordableLots =
    capitalPerLotRupees !== null && capitalPerLotRupees > 0
      ? Math.floor(equityBase / capitalPerLotRupees)
      : null;
  const insufficientCapital =
    affordableLots !== null && affordableLots < 1;

  let cappedByMaxLots = false;
  let cappedByCapital = false;

  // Executable lots can be 0 when daily loss limit is breached or wallet cannot buy 1 lot at live option LTP
  let executableLots = dailyLimitReached || insufficientCapital ? 0 : Math.max(1, rawLotsByRisk);
  if (executableLots > maxLotsCap) {
    executableLots = maxLotsCap;
    cappedByMaxLots = true;
  }
  if (
    affordableLots !== null &&
    executableLots > affordableLots
  ) {
    executableLots = Math.max(0, affordableLots);
    cappedByCapital = true;
  }

  // Strategy engine backtest requires >= 1 lot; UI displays executableLots when blocked
  const recommendedLots = Math.max(1, executableLots);

  return {
    optionSlPoints,
    riskPerLotRupees,
    allowedRiskRupees,
    allowedDailyRiskRupees,
    remainingDailyRiskRupees,
    effectiveRiskBudgetRupees,
    rawLotsByRisk: Math.max(0, rawLotsByRisk),
    optionLtpUsed,
    isOptionLtpLive: Boolean(hasValidLtp && params.isOptionLtpLive),
    capitalPerLotRupees,
    affordableLots,
    recommendedLots,
    executableLots,
    totalRiskAtRecommendedLots: Math.round(recommendedLots * riskPerLotRupees),
    totalCapitalRequired:
      capitalPerLotRupees !== null
        ? Math.round(recommendedLots * capitalPerLotRupees)
        : null,
    cappedByCapital,
    cappedByMaxLots,
    cappedByDailyRisk,
    insufficientCapital,
    dailyLimitReached,
  };
}

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
    '0.50Δ ATM (Recommended): 20pt index SL maps cleanly to a 10pt option SL. Auto-expiry rolls to Next Expiry on expiry day to protect delta.';
  if (effectiveDelta >= 0.56 && effectiveDelta < 0.7) {
    deltaGuidance =
      'ITM (~0.60Δ): intrinsic cushion reduces theta bleed; 20pt index move ≈ 12pt option move.';
  } else if (effectiveDelta >= 0.7) {
    deltaGuidance =
      'Deep ITM (0.70Δ+): tracks spot closely with minimal time decay; higher capital per lot.';
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
