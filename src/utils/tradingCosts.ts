import {
  MultiDayBacktestResult,
  StrategyConfig,
  TradeExitReason,
} from '../types/strategy';

/**
 * Indian NSE / BSE F&O Statutory Charge Rates (Effective April 1, 2026)
 *
 * Sources: NSE SEBI True-to-Label circular & Union Budget FY 2026-27 STT revision:
 * - Brokerage: Flat ₹20/order on Options; min(₹20, 0.03%) per order on Futures (Fyers / Zerodha)
 * - STT (Sell side only): 0.15% on Options premium | 0.05% on Futures contract value
 * - NSE Exchange Txn (Buy & Sell): 0.03503% on Options premium | 0.00173% on Futures turnover
 * - SEBI Turnover Fee (Buy & Sell): ₹10 per crore (0.0001%)
 * - NSE IPFT (Buy & Sell): ₹50 per crore (0.0005%) Options | ₹10 per crore (0.0001%) Futures
 * - Stamp Duty (Buy side only): 0.003% Options premium | 0.002% Futures turnover
 * - GST: 18% on (Brokerage + Exchange Txn + SEBI + IPFT)
 */
export const INDIAN_FO_RATES_2026 = {
  options: {
    sttSellRate: 0.0015, // 0.15% on sell premium (eff. Apr 1, 2026)
    exchangeTxnRate: 0.0003503, // 0.03503% NSE True-to-Label
    sebiRate: 0.000001, // ₹10 / crore
    ipftRate: 0.000005, // ₹50 / crore on premium
    stampDutyBuyRate: 0.00003, // 0.003% on buy premium
    gstRate: 0.18,
  },
  futures: {
    brokerageCapRate: 0.0003, // 0.03% capped at flat ₹20/order
    sttSellRate: 0.0005, // 0.05% on sell turnover (eff. Apr 1, 2026)
    exchangeTxnRate: 0.0000173, // 0.00173% NSE True-to-Label
    sebiRate: 0.000001, // ₹10 / crore
    ipftRate: 0.000001, // ₹10 / crore
    stampDutyBuyRate: 0.00002, // 0.002% on buy turnover
    gstRate: 0.18,
    marginRate: 0.12, // ~12% SPAN + Exposure margin estimate for NSE index futures
  },
} as const;

export type CapitalSizingMode = 'compounding_risk' | 'fixed_lots';

export interface TraderJourneySettings {
  startingCapital: number;
  includeCosts: boolean;
  brokeragePerOrder: number; // Default ₹20 per executed order (₹40 round-trip)
  slippagePoints: number; // Default 1.0 pt round-trip on traded instrument (0.5 entry + 0.5 exit)
  sizingMode: CapitalSizingMode;
  riskPerTradePct: number; // Used in compounding_risk mode (e.g. 2%)
  maxCapitalDeployPct: number; // Max % of live capital deployable in a single trade (e.g. 80%)
  maxLotsCap: number; // Realistic retail cap so compounding stays grounded (e.g. 25 lots)
}

export const DEFAULT_TRADER_JOURNEY_SETTINGS: Omit<
  TraderJourneySettings,
  'startingCapital'
> = {
  includeCosts: true,
  brokeragePerOrder: 20,
  slippagePoints: 1.0,
  sizingMode: 'compounding_risk',
  riskPerTradePct: 2,
  maxCapitalDeployPct: 80,
  maxLotsCap: 25,
};

export interface TradeCostBreakdown {
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebi: number;
  ipft: number;
  stampDuty: number;
  gst: number;
  statutoryCharges: number; // brokerage + all govt/exchange taxes
  slippage: number; // bid-ask + market order execution slippage in ₹
  totalFriction: number; // statutoryCharges + slippage
  buyTurnover: number;
  sellTurnover: number;
}

/**
 * Realistic ATM (0.5 delta) weekly/near-expiry option premium estimate
 * when backtesting from index spot/futures 5m candles (~0.65% of index spot).
 * Examples: Nifty 24,000 -> ~₹156 | Bank Nifty 52,000 -> ~₹338 | Sensex 80,000 -> ~₹520
 */
export function estimateAtmOptionPremium(spotPrice: number): number {
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) return 150;
  return Math.max(40, Math.round(spotPrice * 0.0065));
}

/**
 * Calculates exact Indian NSE/BSE F&O brokerage, statutory taxes, and execution slippage
 * for a single completed round-trip trade.
 */
export function calculateTradeCosts(params: {
  instrumentType: StrategyConfig['instrumentType'];
  entrySpotPrice: number;
  pnlPoints: number;
  qty: number;
  optionDelta: number;
  brokeragePerOrder: number;
  slippagePoints: number;
}): TradeCostBreakdown {
  const {
    instrumentType,
    entrySpotPrice,
    pnlPoints,
    qty,
    optionDelta,
    brokeragePerOrder,
    slippagePoints,
  } = params;

  if (qty <= 0) {
    return {
      brokerage: 0,
      stt: 0,
      exchangeTxn: 0,
      sebi: 0,
      ipft: 0,
      stampDuty: 0,
      gst: 0,
      statutoryCharges: 0,
      slippage: 0,
      totalFriction: 0,
      buyTurnover: 0,
      sellTurnover: 0,
    };
  }

  const cleanBrokerage = Math.max(0, brokeragePerOrder);
  const cleanSlippagePts = Math.max(0, slippagePoints);
  const slippage = cleanSlippagePts * qty;

  if (instrumentType === 'NIFTY_ATM_OPT') {
    const rates = INDIAN_FO_RATES_2026.options;
    const entryPrem = estimateAtmOptionPremium(entrySpotPrice);
    const rawExitPrem = entryPrem + pnlPoints * optionDelta - cleanSlippagePts;
    const exitPrem = Math.max(1, rawExitPrem);

    const buyTurnover = entryPrem * qty;
    const sellTurnover = exitPrem * qty;
    const totalTurnover = buyTurnover + sellTurnover;

    const brokerage = cleanBrokerage * 2; // Buy CE/PE + Sell CE/PE
    const stt = sellTurnover * rates.sttSellRate;
    const exchangeTxn = totalTurnover * rates.exchangeTxnRate;
    const sebi = totalTurnover * rates.sebiRate;
    const ipft = totalTurnover * rates.ipftRate;
    const stampDuty = buyTurnover * rates.stampDutyBuyRate;
    const gst = (brokerage + exchangeTxn + sebi + ipft) * rates.gstRate;

    const statutoryCharges =
      brokerage + stt + exchangeTxn + sebi + ipft + stampDuty + gst;

    return {
      brokerage,
      stt,
      exchangeTxn,
      sebi,
      ipft,
      stampDuty,
      gst,
      statutoryCharges,
      slippage,
      totalFriction: statutoryCharges + slippage,
      buyTurnover,
      sellTurnover,
    };
  }

  // Futures / Index linear contract
  const rates = INDIAN_FO_RATES_2026.futures;
  const entryPrice = Math.max(1, entrySpotPrice);
  const exitPrice = Math.max(1, entryPrice + pnlPoints - cleanSlippagePts);

  const buyTurnover = entryPrice * qty;
  const sellTurnover = exitPrice * qty;
  const totalTurnover = buyTurnover + sellTurnover;

  const buyBrok = Math.min(cleanBrokerage, buyTurnover * rates.brokerageCapRate);
  const sellBrok = Math.min(
    cleanBrokerage,
    sellTurnover * rates.brokerageCapRate
  );
  const brokerage = buyBrok + sellBrok;
  const stt = sellTurnover * rates.sttSellRate;
  const exchangeTxn = totalTurnover * rates.exchangeTxnRate;
  const sebi = totalTurnover * rates.sebiRate;
  const ipft = totalTurnover * rates.ipftRate;
  const stampDuty = buyTurnover * rates.stampDutyBuyRate;
  const gst = (brokerage + exchangeTxn + sebi + ipft) * rates.gstRate;

  const statutoryCharges =
    brokerage + stt + exchangeTxn + sebi + ipft + stampDuty + gst;

  return {
    brokerage,
    stt,
    exchangeTxn,
    sebi,
    ipft,
    stampDuty,
    gst,
    statutoryCharges,
    slippage,
    totalFriction: statutoryCharges + slippage,
    buyTurnover,
    sellTurnover,
  };
}

export interface TradeCapitalPoint {
  seq: number;
  label: string;
  tradeId: number;
  date: string;
  entryTime: string;
  exitTime: string;
  direction: 'LONG' | 'SHORT';
  exitReason: TradeExitReason;
  lotsTraded: number;
  qtyTraded: number;
  skippedInsufficientCapital: boolean;
  pnlPoints: number;
  grossGainRupees: number;
  chargesRupees: number;
  slippageRupees: number;
  totalFrictionRupees: number;
  gainRupees: number; // Net after costs (or gross if includeCosts=false)
  periodReturnPct: number;
  capitalBefore: number;
  capitalAfter: number;
  grossCapitalAfter: number;
  cumulativeGainRupees: number;
  cumulativeReturnPct: number;
}

export interface DayCapitalPoint {
  date: string;
  label: string;
  bias: string;
  tradesCount: number;
  executedTrades: number;
  skippedTrades: number;
  avgLots: number;
  wins: number;
  losses: number;
  breakevens: number;
  dayPoints: number;
  grossGainRupees: number;
  chargesRupees: number;
  slippageRupees: number;
  totalFrictionRupees: number;
  gainRupees: number; // Net gain/loss
  periodReturnPct: number;
  capitalBefore: number;
  capitalAfter: number;
  grossCapitalAfter: number;
  cumulativeGainRupees: number;
  cumulativeReturnPct: number;
  drawdownRupees: number;
}

export interface MonthCapitalPoint {
  month: string;
  label: string;
  tradingDays: number;
  tradesCount: number;
  executedTrades: number;
  skippedTrades: number;
  avgLots: number;
  wins: number;
  losses: number;
  netPoints: number;
  grossGainRupees: number;
  chargesRupees: number;
  slippageRupees: number;
  totalFrictionRupees: number;
  gainRupees: number; // Net gain/loss
  periodReturnPct: number;
  capitalBefore: number;
  capitalAfter: number;
  grossCapitalAfter: number;
  cumulativeGainRupees: number;
  cumulativeReturnPct: number;
}

export interface AggregateCostTotals {
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebi: number;
  ipft: number;
  stampDuty: number;
  gst: number;
  statutoryCharges: number;
  slippage: number;
  totalFriction: number;
  avgFrictionPerTrade: number;
  avgStatutoryPerTrade: number;
  avgSlippagePerTrade: number;
  frictionPctOfStartingCapital: number;
  breakevenPointsPerTrade: number;
}

export interface TraderJourneyResult {
  tradeSeries: TradeCapitalPoint[];
  daySeries: DayCapitalPoint[];
  monthSeries: MonthCapitalPoint[];
  costs: AggregateCostTotals;
  summary: {
    startingCapital: number;
    grossEndingCapital: number;
    netEndingCapital: number;
    grossGain: number;
    netGain: number;
    grossRoiPct: number;
    netRoiPct: number;
    peakNetCapital: number;
    maxDrawdownRupees: number;
    maxDrawdownPct: number;
    executedTrades: number;
    skippedTrades: number;
    minLots: number;
    maxLots: number;
    avgLots: number;
    avgNetPerTrade: number;
    avgNetPerDay: number;
    avgNetPerMonth: number;
    estimatedMarginPerLot: number;
    canAffordInitialLot: boolean;
    bestMonth: MonthCapitalPoint | null;
    worstMonth: MonthCapitalPoint | null;
  };
}

/**
 * Simulates a real-life trader's capital journey trade-by-trade across a backtest,
 * factoring in live compounding position sizing (or fixed lots), margin affordability,
 * FY 2026 Indian NSE/BSE brokerage & taxes, and execution slippage.
 */
export function simulateTraderCapitalJourney(
  backtest: MultiDayBacktestResult,
  config: StrategyConfig,
  settings: TraderJourneySettings
): TraderJourneyResult {
  const startingCapital = Math.max(1000, Math.round(settings.startingCapital));
  const isOptionBuying = config.instrumentType === 'NIFTY_ATM_OPT';
  const deltaFactor = isOptionBuying
    ? Math.max(0.1, config.optionDeltaEstimate || 0.5)
    : 1;
  const lotSize = Math.max(1, config.lotSize || 75);
  const fixedLots = Math.max(1, config.lots || 1);

  const firstTradeSpot =
    backtest.allTrades[0]?.entryPrice ??
    backtest.dailySummaries[0]?.candles[0]?.close ??
    24000;

  const estimateMarginForSpot = (spot: number): number => {
    if (isOptionBuying) {
      return estimateAtmOptionPremium(spot) * lotSize;
    }
    return Math.round(
      Math.max(1, spot) * lotSize * INDIAN_FO_RATES_2026.futures.marginRate
    );
  };

  const initialMarginPerLot = estimateMarginForSpot(firstTradeSpot);
  const canAffordInitialLot =
    startingCapital * (settings.maxCapitalDeployPct / 100) >=
    initialMarginPerLot;

  let runningNetCapital = startingCapital;
  let runningGrossCapital = startingCapital;
  let peakNetCapital = startingCapital;
  let maxDrawdownRupees = 0;
  let maxDrawdownPct = 0;

  // Cost accumulators
  let sumBrokerage = 0;
  let sumStt = 0;
  let sumExchangeTxn = 0;
  let sumSebi = 0;
  let sumIpft = 0;
  let sumStampDuty = 0;
  let sumGst = 0;
  let sumStatutory = 0;
  let sumSlippage = 0;
  let sumTotalFriction = 0;
  let sumGrossGain = 0;
  let sumNetGain = 0;

  let executedTrades = 0;
  let skippedTrades = 0;
  let minLots = Number.POSITIVE_INFINITY;
  let maxLots = 0;
  let sumLots = 0;
  let sumQtyExecuted = 0;

  const tradeSeries: TradeCapitalPoint[] = [];
  const tradesByDate = new Map<string, TradeCapitalPoint[]>();

  for (let idx = 0; idx < backtest.allTrades.length; idx++) {
    const t = backtest.allTrades[idx];
    const before = runningNetCapital;
    const marginPerLot = estimateMarginForSpot(t.entryPrice);

    let lots = fixedLots;
    let skipped = false;

    if (settings.sizingMode === 'compounding_risk') {
      if (runningNetCapital <= 0) {
        lots = 0;
        skipped = true;
      } else {
        const deployableCapital =
          runningNetCapital *
          (Math.max(10, Math.min(100, settings.maxCapitalDeployPct)) / 100);
        const affordableLots = Math.floor(
          deployableCapital / Math.max(1, marginPerLot)
        );
        if (affordableLots < 1) {
          lots = 0;
          skipped = true;
        } else {
          const riskBudget =
            (runningNetCapital * Math.max(0.25, settings.riskPerTradePct)) / 100;
          const slPointsInstrument =
            config.stopLossPoints * deltaFactor +
            (settings.includeCosts ? Math.max(0, settings.slippagePoints) : 0);
          const riskPerLot = Math.max(1, slPointsInstrument * lotSize);
          const riskSizedLots = Math.floor(riskBudget / riskPerLot);
          lots = Math.max(
            1,
            Math.min(
              Math.max(1, settings.maxLotsCap),
              affordableLots,
              Math.max(1, riskSizedLots)
            )
          );
        }
      }
    }

    const qty = lots * lotSize;
    const grossGain = skipped
      ? 0
      : Math.round(t.pnlPoints * qty * deltaFactor);

    const costBreakdown = skipped
      ? calculateTradeCosts({
          instrumentType: config.instrumentType,
          entrySpotPrice: t.entryPrice,
          pnlPoints: 0,
          qty: 0,
          optionDelta: deltaFactor,
          brokeragePerOrder: settings.brokeragePerOrder,
          slippagePoints: settings.slippagePoints,
        })
      : calculateTradeCosts({
          instrumentType: config.instrumentType,
          entrySpotPrice: t.entryPrice,
          pnlPoints: t.pnlPoints,
          qty,
          optionDelta: deltaFactor,
          brokeragePerOrder: settings.brokeragePerOrder,
          slippagePoints: settings.slippagePoints,
        });

    const chargesRounded = Math.round(costBreakdown.statutoryCharges);
    const slippageRounded = Math.round(costBreakdown.slippage);
    const totalFrictionRounded = chargesRounded + slippageRounded;
    const netGain = settings.includeCosts
      ? grossGain - totalFrictionRounded
      : grossGain;

    if (skipped) {
      skippedTrades += 1;
    } else {
      executedTrades += 1;
      sumLots += lots;
      sumQtyExecuted += qty;
      if (lots < minLots) minLots = lots;
      if (lots > maxLots) maxLots = lots;

      sumBrokerage += costBreakdown.brokerage;
      sumStt += costBreakdown.stt;
      sumExchangeTxn += costBreakdown.exchangeTxn;
      sumSebi += costBreakdown.sebi;
      sumIpft += costBreakdown.ipft;
      sumStampDuty += costBreakdown.stampDuty;
      sumGst += costBreakdown.gst;
      sumStatutory += costBreakdown.statutoryCharges;
      sumSlippage += costBreakdown.slippage;
      sumTotalFriction += costBreakdown.totalFriction;
    }

    sumGrossGain += grossGain;
    sumNetGain += netGain;

    runningGrossCapital += grossGain;
    runningNetCapital += netGain;

    if (runningNetCapital > peakNetCapital) {
      peakNetCapital = runningNetCapital;
    }
    const dd = peakNetCapital - runningNetCapital;
    if (dd > maxDrawdownRupees) {
      maxDrawdownRupees = dd;
      maxDrawdownPct = peakNetCapital > 0 ? (dd / peakNetCapital) * 100 : 0;
    }

    const periodReturnPct = before > 0 ? (netGain / before) * 100 : 0;
    const cumGain = runningNetCapital - startingCapital;
    const cumRet =
      startingCapital > 0 ? (cumGain / startingCapital) * 100 : 0;

    const point: TradeCapitalPoint = {
      seq: idx + 1,
      label: `#${idx + 1}`,
      tradeId: t.id,
      date: t.date || '—',
      entryTime: t.entryTime,
      exitTime: t.exitTime || '—',
      direction: t.direction,
      exitReason: t.exitReason,
      lotsTraded: lots,
      qtyTraded: qty,
      skippedInsufficientCapital: skipped,
      pnlPoints: t.pnlPoints,
      grossGainRupees: grossGain,
      chargesRupees: chargesRounded,
      slippageRupees: slippageRounded,
      totalFrictionRupees: totalFrictionRounded,
      gainRupees: netGain,
      periodReturnPct,
      capitalBefore: before,
      capitalAfter: runningNetCapital,
      grossCapitalAfter: runningGrossCapital,
      cumulativeGainRupees: cumGain,
      cumulativeReturnPct: cumRet,
    };

    tradeSeries.push(point);
    const key = t.date || '—';
    const arr = tradesByDate.get(key) ?? [];
    arr.push(point);
    tradesByDate.set(key, arr);
  }

  // Aggregate Day-wise series aligned with backtest.dailySummaries
  let dayRunningNet = startingCapital;
  let dayRunningGross = startingCapital;
  let dayPeak = startingCapital;
  const daySeries: DayCapitalPoint[] = backtest.dailySummaries.map((d) => {
    const dayTrades = tradesByDate.get(d.date) ?? [];
    const before = dayRunningNet;
    const grossDay = dayTrades.reduce((acc, t) => acc + t.grossGainRupees, 0);
    const chargesDay = dayTrades.reduce((acc, t) => acc + t.chargesRupees, 0);
    const slippageDay = dayTrades.reduce((acc, t) => acc + t.slippageRupees, 0);
    const frictionDay = chargesDay + slippageDay;
    const netDay = dayTrades.reduce((acc, t) => acc + t.gainRupees, 0);
    const execCount = dayTrades.filter((t) => !t.skippedInsufficientCapital).length;
    const skipCount = dayTrades.length - execCount;
    const avgLotsDay =
      execCount > 0
        ? dayTrades.reduce((acc, t) => acc + t.lotsTraded, 0) / execCount
        : 0;

    dayRunningGross += grossDay;
    dayRunningNet += netDay;
    if (dayRunningNet > dayPeak) dayPeak = dayRunningNet;
    const dd = dayPeak - dayRunningNet;

    const periodRet = before > 0 ? (netDay / before) * 100 : 0;
    const cumGain = dayRunningNet - startingCapital;
    const cumRet =
      startingCapital > 0 ? (cumGain / startingCapital) * 100 : 0;

    return {
      date: d.date,
      label: d.date.slice(5),
      bias: d.bias,
      tradesCount: d.tradesCount,
      executedTrades: execCount,
      skippedTrades: skipCount,
      avgLots: avgLotsDay,
      wins: d.wins,
      losses: d.losses,
      breakevens: d.breakevens,
      dayPoints: d.dayPoints,
      grossGainRupees: grossDay,
      chargesRupees: chargesDay,
      slippageRupees: slippageDay,
      totalFrictionRupees: frictionDay,
      gainRupees: netDay,
      periodReturnPct: periodRet,
      capitalBefore: before,
      capitalAfter: dayRunningNet,
      grossCapitalAfter: dayRunningGross,
      cumulativeGainRupees: cumGain,
      cumulativeReturnPct: cumRet,
      drawdownRupees: dd,
    };
  });

  // Aggregate Month-wise series aligned with backtest.monthlySummaries
  let monthRunningNet = startingCapital;
  let monthRunningGross = startingCapital;
  const monthSeries: MonthCapitalPoint[] = backtest.monthlySummaries.map((m) => {
    const monthDays = daySeries.filter((d) => d.date.startsWith(m.month));
    const before = monthRunningNet;
    const grossMonth = monthDays.reduce((acc, d) => acc + d.grossGainRupees, 0);
    const chargesMonth = monthDays.reduce((acc, d) => acc + d.chargesRupees, 0);
    const slippageMonth = monthDays.reduce((acc, d) => acc + d.slippageRupees, 0);
    const frictionMonth = chargesMonth + slippageMonth;
    const netMonth = monthDays.reduce((acc, d) => acc + d.gainRupees, 0);
    const execCount = monthDays.reduce((acc, d) => acc + d.executedTrades, 0);
    const skipCount = monthDays.reduce((acc, d) => acc + d.skippedTrades, 0);
    const monthTrades = tradeSeries.filter(
      (t) => t.date.startsWith(m.month) && !t.skippedInsufficientCapital
    );
    const avgLotsMonth =
      monthTrades.length > 0
        ? monthTrades.reduce((acc, t) => acc + t.lotsTraded, 0) /
          monthTrades.length
        : 0;

    monthRunningGross += grossMonth;
    monthRunningNet += netMonth;

    const periodRet = before > 0 ? (netMonth / before) * 100 : 0;
    const cumGain = monthRunningNet - startingCapital;
    const cumRet =
      startingCapital > 0 ? (cumGain / startingCapital) * 100 : 0;

    return {
      month: m.month,
      label: m.label,
      tradingDays: m.tradingDays,
      tradesCount: m.tradesCount,
      executedTrades: execCount,
      skippedTrades: skipCount,
      avgLots: avgLotsMonth,
      wins: m.wins,
      losses: m.losses,
      netPoints: m.netPoints,
      grossGainRupees: grossMonth,
      chargesRupees: chargesMonth,
      slippageRupees: slippageMonth,
      totalFrictionRupees: frictionMonth,
      gainRupees: netMonth,
      periodReturnPct: periodRet,
      capitalBefore: before,
      capitalAfter: monthRunningNet,
      grossCapitalAfter: monthRunningGross,
      cumulativeGainRupees: cumGain,
      cumulativeReturnPct: cumRet,
    };
  });

  const avgFrictionPerTrade =
    executedTrades > 0 ? sumTotalFriction / executedTrades : 0;
  const avgStatutoryPerTrade =
    executedTrades > 0 ? sumStatutory / executedTrades : 0;
  const avgSlippagePerTrade =
    executedTrades > 0 ? sumSlippage / executedTrades : 0;
  const avgQty = executedTrades > 0 ? sumQtyExecuted / executedTrades : lotSize;
  // Index-equivalent points eaten per trade by brokerage + taxes + slippage
  const breakevenPointsPerTrade =
    avgQty * deltaFactor > 0
      ? avgFrictionPerTrade / (avgQty * deltaFactor)
      : 0;

  const bestMonth =
    monthSeries.length > 0
      ? monthSeries.reduce((a, b) => (b.gainRupees > a.gainRupees ? b : a))
      : null;
  const worstMonth =
    monthSeries.length > 0
      ? monthSeries.reduce((a, b) => (b.gainRupees < a.gainRupees ? b : a))
      : null;

  return {
    tradeSeries,
    daySeries,
    monthSeries,
    costs: {
      brokerage: Math.round(sumBrokerage),
      stt: Math.round(sumStt),
      exchangeTxn: Math.round(sumExchangeTxn),
      sebi: Math.round(sumSebi),
      ipft: Math.round(sumIpft),
      stampDuty: Math.round(sumStampDuty),
      gst: Math.round(sumGst),
      statutoryCharges: Math.round(sumStatutory),
      slippage: Math.round(sumSlippage),
      totalFriction: Math.round(sumTotalFriction),
      avgFrictionPerTrade,
      avgStatutoryPerTrade,
      avgSlippagePerTrade,
      frictionPctOfStartingCapital:
        startingCapital > 0 ? (sumTotalFriction / startingCapital) * 100 : 0,
      breakevenPointsPerTrade,
    },
    summary: {
      startingCapital,
      grossEndingCapital: runningGrossCapital,
      netEndingCapital: runningNetCapital,
      grossGain: sumGrossGain,
      netGain: sumNetGain,
      grossRoiPct:
        startingCapital > 0 ? (sumGrossGain / startingCapital) * 100 : 0,
      netRoiPct:
        startingCapital > 0 ? (sumNetGain / startingCapital) * 100 : 0,
      peakNetCapital,
      maxDrawdownRupees,
      maxDrawdownPct,
      executedTrades,
      skippedTrades,
      minLots: executedTrades > 0 ? minLots : 0,
      maxLots,
      avgLots: executedTrades > 0 ? sumLots / executedTrades : 0,
      avgNetPerTrade: executedTrades > 0 ? sumNetGain / executedTrades : 0,
      avgNetPerDay: daySeries.length > 0 ? sumNetGain / daySeries.length : 0,
      avgNetPerMonth:
        monthSeries.length > 0 ? sumNetGain / monthSeries.length : 0,
      estimatedMarginPerLot: initialMarginPerLot,
      canAffordInitialLot,
      bestMonth,
      worstMonth,
    },
  };
}
