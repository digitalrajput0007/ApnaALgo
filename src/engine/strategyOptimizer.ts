import {
  calculateWilderRSI,
  getCandleColor,
  runMultiDayBacktest,
} from './niftyStrategy';
import {
  BiasDirection,
  Candle,
  MultiDayBacktestResult,
  StrategyConfig,
} from '../types/strategy';

export type OptimizationObjective =
  | 'CALMAR'
  | 'NET_POINTS'
  | 'PROFIT_FACTOR'
  | 'ACCURACY';

export interface RsiZonePair {
  buy: number;
  sell: number;
  label: string;
}

export interface OptimizerGridInput {
  stopLossValues: number[];
  targetValues: number[];
  maxTradesValues: number[];
  rsiLengths: number[];
  rsiPairs: RsiZonePair[];
  entryBufferValues: number[];
  objective: OptimizationObjective;
  minTrades: number;
}

export interface OptimizerCandidateResult {
  rank: number;
  config: StrategyConfig;
  objectiveScore: number;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRatePct: number;
  accuracyExclBreakevenPct: number;
  dayWinRatePct: number;
  winningDays: number;
  losingDays: number;
  netPoints: number;
  netRupees: number;
  profitFactor: number;
  maxDrawdownPoints: number;
  expectancyPoints: number;
  calmarRatio: number;
  h1NetPoints: number;
  h2NetPoints: number;
  h1ProfitFactor: number;
  h2ProfitFactor: number;
  bothHalvesProfitable: boolean;
}

export interface ParameterSensitivityItem {
  label: string;
  avgNetPoints: number;
  bestNetPoints: number;
  avgWinRatePct: number;
  count: number;
}

export interface OptimizationReport {
  testedCombinations: number;
  validCombinations: number;
  durationMs: number;
  objective: OptimizationObjective;
  walkForwardMidDate: string | null;
  currentBaseline: OptimizerCandidateResult;
  bestCandidate: OptimizerCandidateResult | null;
  robustCandidate: OptimizerCandidateResult | null;
  topCandidates: OptimizerCandidateResult[];
  sensitivity: {
    stopLoss: ParameterSensitivityItem[];
    target: ParameterSensitivityItem[];
    maxTrades: ParameterSensitivityItem[];
    rsiZone: ParameterSensitivityItem[];
  };
}

export const DEFAULT_RSI_PAIR_OPTIONS: RsiZonePair[] = [
  { buy: 8, sell: 92, label: '<8 / >92' },
  { buy: 10, sell: 90, label: '<10 / >90' },
  { buy: 12, sell: 89, label: '<12 / >89' },
  { buy: 15, sell: 85, label: '<15 / >85' },
  { buy: 20, sell: 80, label: '<20 / >80' },
  { buy: 25, sell: 75, label: '<25 / >75' },
];

export const DEFAULT_OPTIMIZER_GRID: OptimizerGridInput = {
  stopLossValues: [15, 20, 25, 30],
  targetValues: [40, 60, 80, 100],
  maxTradesValues: [1, 2, 3, 4],
  rsiLengths: [2],
  rsiPairs: [
    { buy: 8, sell: 92, label: '<8 / >92' },
    { buy: 12, sell: 89, label: '<12 / >89' },
    { buy: 15, sell: 85, label: '<15 / >85' },
    { buy: 20, sell: 80, label: '<20 / >80' },
  ],
  entryBufferValues: [1],
  objective: 'CALMAR',
  minTrades: 15,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

interface PrecomputedDayBucket {
  candles: Candle[];
  candleMins: number[];
  candleColors: ('GREEN' | 'RED' | 'DOJI')[];
  rsiByLength: Map<number, (number | null)[]>;
}

function buildPrecomputedDays(
  allCandles: Candle[],
  rsiLengths: number[]
): PrecomputedDayBucket[] {
  const uniqueLengths = Array.from(new Set(rsiLengths));

  const buckets: Array<{
    date: string;
    candles: Candle[];
    candleMins: number[];
    candleColors: ('GREEN' | 'RED' | 'DOJI')[];
    rsiByLength: Map<number, (number | null)[]>;
  }> = [];

  for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    const dateKey = c.date || 'Session';
    let last = buckets[buckets.length - 1];
    if (!last || last.date !== dateKey) {
      last = {
        date: dateKey,
        candles: [],
        candleMins: [],
        candleColors: [],
        rsiByLength: new Map<number, (number | null)[]>(),
      };
      buckets.push(last);
    }
    last.candles.push(c);
    last.candleMins.push(toMinutes(c.time));
    last.candleColors.push(getCandleColor(c));
  }

  // Compute Wilder RSI strictly per session day to match runNiftyStrategy & Live Strategy Lab
  for (const bucket of buckets) {
    const dayCloses = bucket.candles.map((c) => c.close);
    for (const len of uniqueLengths) {
      const series = calculateWilderRSI(dayCloses, len).map((val) =>
        val !== null ? round2(val) : null
      );
      bucket.rsiByLength.set(len, series);
    }
  }

  return buckets;
}

interface FastMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRatePct: number;
  accuracyExclBreakevenPct: number;
  netPoints: number;
  grossProfitPoints: number;
  grossLossPoints: number;
  profitFactor: number;
  maxDrawdownPoints: number;
  calmarRatio: number;
}

/**
 * Zero-allocation fast simulation mirroring runNiftyStrategy exactly for grid sweeps.
 * Top candidates are subsequently re-verified through runMultiDayBacktest.
 */
function evaluateConfigFast(
  days: PrecomputedDayBucket[],
  config: StrategyConfig
): FastMetrics {
  const squareOffMins = toMinutes(config.squareOffTime);
  const buffer = Math.max(0, config.entryBufferPoints);
  const stopAfterTarget = config.stopAfterTargetHit ?? true;
  const setSize = config.setSize;
  const reqMaj = config.requiredMajority;
  const slPts = config.stopLossPoints;
  const tgtPts = config.targetPoints;
  const maxTrades = config.maxTradesPerDay;
  const trailCost = config.trailToCostAtOneToOne;
  const shiftBase = config.updateTriggerWhileInRsiZone;
  const rollingSets = config.biasMode === 'ROLLING_SETS';
  const buyThresh = config.rsiBuyThreshold;
  const sellThresh = config.rsiSellThreshold;

  let cumulativePoints = 0;
  let peakEquity = 0;
  let maxDrawdownPoints = 0;
  let totalTrades = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalBreakevens = 0;
  let grossProfitPoints = 0;
  let grossLossPoints = 0;

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const candles = day.candles;
    const mins = day.candleMins;
    const colors = day.candleColors;
    const rsiSlice = day.rsiByLength.get(config.rsiLength)!;

    let activeBias: BiasDirection = 'PENDING';
    let dayHaltedByTarget = false;
    let tradesToday = 0;
    let dayPoints = 0;

    // Armed setup scalars
    let hasArmed = false;
    let armedDir: 'LONG' | 'SHORT' = 'LONG';
    let armedRaw = 0;
    let armedTrigger = 0;

    // Open trade scalars
    let hasOpen = false;
    let openDir: 'LONG' | 'SHORT' = 'LONG';
    let openEntry = 0;
    let openSl = 0;
    let openTarget = 0;
    let openTrailed = false;

    const recordExit = (pts: number, isTarget: boolean) => {
      totalTrades++;
      dayPoints += pts;
      if (pts > 0.5) {
        totalWins++;
        grossProfitPoints += pts;
      } else if (pts < -0.5) {
        totalLosses++;
        grossLossPoints += Math.abs(pts);
      } else {
        totalBreakevens++;
      }
      if (isTarget && stopAfterTarget) {
        dayHaltedByTarget = true;
        hasArmed = false;
      }
    };

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const candleMins = mins[i];
      const rsi2 = rsiSlice[i];
      const positionInSet = (i % setSize) + 1;

      // 1. Manage existing open trade
      if (hasOpen) {
        if (openDir === 'LONG') {
          const slTriggeredFirst = candle.low <= openSl;
          const oneToOneLevel = openEntry + slPts;
          if (candle.open <= openSl) {
            recordExit(round2(candle.open - openEntry), false);
            hasOpen = false;
          } else if (slTriggeredFirst) {
            recordExit(round2(openSl - openEntry), false);
            hasOpen = false;
          } else {
            if (trailCost && !openTrailed && candle.high >= oneToOneLevel) {
              openTrailed = true;
              openSl = openEntry;
            }
            if (openTrailed && candle.close <= openEntry) {
              recordExit(0, false);
              hasOpen = false;
            } else if (candle.high >= openTarget) {
              recordExit(round2(openTarget - openEntry), true);
              hasOpen = false;
            }
          }
        } else {
          const slTriggeredFirst = candle.high >= openSl;
          const oneToOneLevel = openEntry - slPts;
          if (candle.open >= openSl) {
            recordExit(round2(openEntry - candle.open), false);
            hasOpen = false;
          } else if (slTriggeredFirst) {
            recordExit(round2(openEntry - openSl), false);
            hasOpen = false;
          } else {
            if (trailCost && !openTrailed && candle.low <= oneToOneLevel) {
              openTrailed = true;
              openSl = openEntry;
            }
            if (openTrailed && candle.close >= openEntry) {
              recordExit(0, false);
              hasOpen = false;
            } else if (candle.low <= openTarget) {
              recordExit(round2(openEntry - openTarget), true);
              hasOpen = false;
            }
          }
        }
      }

      // 2. EOD square-off
      if (hasOpen && candleMins >= squareOffMins) {
        const pts =
          openDir === 'LONG'
            ? round2(candle.close - openEntry)
            : round2(openEntry - candle.close);
        recordExit(pts, false);
        hasOpen = false;
        hasArmed = false;
      }

      // 3. Breakout entry check
      if (
        !hasOpen &&
        !dayHaltedByTarget &&
        hasArmed &&
        candleMins < squareOffMins &&
        tradesToday < maxTrades
      ) {
        const longTriggered =
          armedDir === 'LONG' &&
          (buffer > 0 ? candle.high >= armedTrigger : candle.high > armedTrigger);
        const shortTriggered =
          armedDir === 'SHORT' &&
          (buffer > 0 ? candle.low <= armedTrigger : candle.low < armedTrigger);

        if (longTriggered) {
          tradesToday++;
          const minFill =
            buffer > 0 ? armedTrigger : round2(armedTrigger + 0.05);
          const entryPrice = round2(Math.max(candle.open, minFill));
          const slPrice = round2(entryPrice - slPts);
          const targetPrice = round2(entryPrice + tgtPts);

          if (
            candle.low <= slPrice &&
            (candle.open >= minFill || candle.close < entryPrice)
          ) {
            recordExit(-slPts, false);
          } else {
            let trailed = false;
            let curSl = slPrice;
            if (trailCost && candle.high >= entryPrice + slPts) {
              trailed = true;
              curSl = entryPrice;
            }
            if (trailed && candle.close <= entryPrice) {
              recordExit(0, false);
            } else if (candle.high >= targetPrice) {
              recordExit(tgtPts, true);
            } else {
              hasOpen = true;
              openDir = 'LONG';
              openEntry = entryPrice;
              openSl = curSl;
              openTarget = targetPrice;
              openTrailed = trailed;
            }
          }
          hasArmed = false;
        } else if (shortTriggered) {
          tradesToday++;
          const maxFill =
            buffer > 0 ? armedTrigger : round2(armedTrigger - 0.05);
          const entryPrice = round2(Math.min(candle.open, maxFill));
          const slPrice = round2(entryPrice + slPts);
          const targetPrice = round2(entryPrice - tgtPts);

          if (
            candle.high >= slPrice &&
            (candle.open <= maxFill || candle.close > entryPrice)
          ) {
            recordExit(-slPts, false);
          } else {
            let trailed = false;
            let curSl = slPrice;
            if (trailCost && candle.low <= entryPrice - slPts) {
              trailed = true;
              curSl = entryPrice;
            }
            if (trailed && candle.close >= entryPrice) {
              recordExit(0, false);
            } else if (candle.low <= targetPrice) {
              recordExit(tgtPts, true);
            } else {
              hasOpen = true;
              openDir = 'SHORT';
              openEntry = entryPrice;
              openSl = curSl;
              openTarget = targetPrice;
              openTrailed = trailed;
            }
          }
          hasArmed = false;
        }
      }

      // 4. Evaluate 4-Candle Set
      if (positionInSet === setSize) {
        const shouldApplyBias =
          activeBias === 'PENDING' || (rollingSets && !hasOpen);
        if (shouldApplyBias) {
          let greens = 0;
          let reds = 0;
          const startIdx = i - setSize + 1;
          for (let k = startIdx; k <= i; k++) {
            if (colors[k] === 'GREEN') greens++;
            else if (colors[k] === 'RED') reds++;
          }
          if (greens >= reqMaj) {
            if (activeBias !== 'BULLISH') hasArmed = false;
            activeBias = 'BULLISH';
          } else if (reds >= reqMaj) {
            if (activeBias !== 'BEARISH') hasArmed = false;
            activeBias = 'BEARISH';
          }
        }
      }

      // 5. Shift base candle or arm RSI(2) setup
      if (
        !hasOpen &&
        !dayHaltedByTarget &&
        activeBias !== 'PENDING' &&
        candleMins < squareOffMins &&
        tradesToday < maxTrades
      ) {
        if (hasArmed) {
          if (armedDir === 'LONG' && shiftBase && candle.high < armedRaw) {
            armedRaw = candle.high;
            armedTrigger = round2(candle.high + buffer);
          } else if (armedDir === 'SHORT' && shiftBase && candle.low > armedRaw) {
            armedRaw = candle.low;
            armedTrigger = round2(candle.low - buffer);
          }
        } else if (rsi2 !== null) {
          if (activeBias === 'BULLISH' && rsi2 < buyThresh) {
            hasArmed = true;
            armedDir = 'LONG';
            armedRaw = candle.high;
            armedTrigger = round2(candle.high + buffer);
          } else if (activeBias === 'BEARISH' && rsi2 > sellThresh) {
            hasArmed = true;
            armedDir = 'SHORT';
            armedRaw = candle.low;
            armedTrigger = round2(candle.low - buffer);
          }
        }
      }
    }

    cumulativePoints = round2(cumulativePoints + dayPoints);
    if (cumulativePoints > peakEquity) peakEquity = cumulativePoints;
    const dd = Math.abs(round2(cumulativePoints - peakEquity));
    if (dd > maxDrawdownPoints) maxDrawdownPoints = dd;
  }

  const winRatePct =
    totalTrades > 0 ? round2((totalWins / totalTrades) * 100) : 0;
  const decisive = totalWins + totalLosses;
  const accuracyExclBreakevenPct =
    decisive > 0 ? round2((totalWins / decisive) * 100) : 0;
  const profitFactor =
    grossLossPoints > 0
      ? round2(grossProfitPoints / grossLossPoints)
      : grossProfitPoints > 0
      ? 99.9
      : 0;
  const calmarRatio = round2(
    cumulativePoints / Math.max(maxDrawdownPoints, 20)
  );

  return {
    totalTrades,
    wins: totalWins,
    losses: totalLosses,
    breakevens: totalBreakevens,
    winRatePct,
    accuracyExclBreakevenPct,
    netPoints: cumulativePoints,
    grossProfitPoints: round2(grossProfitPoints),
    grossLossPoints: round2(grossLossPoints),
    profitFactor,
    maxDrawdownPoints: round2(maxDrawdownPoints),
    calmarRatio,
  };
}

function scoreForObjective(
  m: {
    netPoints: number;
    profitFactor: number;
    accuracyExclBreakevenPct: number;
    calmarRatio: number;
  },
  objective: OptimizationObjective
): number {
  switch (objective) {
    case 'NET_POINTS':
      return m.netPoints;
    case 'PROFIT_FACTOR':
      return m.profitFactor * 1000 + m.netPoints * 0.01;
    case 'ACCURACY':
      return m.accuracyExclBreakevenPct * 1000 + m.netPoints * 0.01;
    case 'CALMAR':
    default:
      return m.calmarRatio * 1000 + m.netPoints * 0.01;
  }
}

function toCandidateFromFullResult(
  config: StrategyConfig,
  res: MultiDayBacktestResult,
  objective: OptimizationObjective,
  rank: number,
  h1Res?: MultiDayBacktestResult | null,
  h2Res?: MultiDayBacktestResult | null
): OptimizerCandidateResult {
  const calmarRatio = round2(
    res.netPoints / Math.max(res.maxDrawdownPoints, 20)
  );
  const h1NetPoints = h1Res ? h1Res.netPoints : 0;
  const h2NetPoints = h2Res ? h2Res.netPoints : 0;
  const h1ProfitFactor = h1Res ? h1Res.profitFactor : 0;
  const h2ProfitFactor = h2Res ? h2Res.profitFactor : 0;
  return {
    rank,
    config,
    objectiveScore: scoreForObjective(
      {
        netPoints: res.netPoints,
        profitFactor: res.profitFactor,
        accuracyExclBreakevenPct: res.accuracyExclBreakevenPct,
        calmarRatio,
      },
      objective
    ),
    totalTrades: res.totalTrades,
    wins: res.wins,
    losses: res.losses,
    breakevens: res.breakevens,
    winRatePct: res.winRatePct,
    accuracyExclBreakevenPct: res.accuracyExclBreakevenPct,
    dayWinRatePct: res.dayWinRatePct,
    winningDays: res.winningDays,
    losingDays: res.losingDays,
    netPoints: res.netPoints,
    netRupees: res.netRupees,
    profitFactor: res.profitFactor,
    maxDrawdownPoints: res.maxDrawdownPoints,
    expectancyPoints: res.expectancyPoints,
    calmarRatio,
    h1NetPoints,
    h2NetPoints,
    h1ProfitFactor,
    h2ProfitFactor,
    bothHalvesProfitable: Boolean(
      h1Res && h2Res && h1NetPoints > 0 && h2NetPoints > 0
    ),
  };
}

export function countGridCombinations(grid: OptimizerGridInput): number {
  let count = 0;
  for (const sl of grid.stopLossValues) {
    for (const tgt of grid.targetValues) {
      if (tgt <= sl) continue;
      count +=
        grid.maxTradesValues.length *
        grid.rsiLengths.length *
        grid.rsiPairs.length *
        grid.entryBufferValues.length;
    }
  }
  return count;
}

export async function runStrategyOptimization(
  allCandles: Candle[],
  baseConfig: StrategyConfig,
  grid: OptimizerGridInput,
  onProgress?: (completed: number, total: number) => void
): Promise<OptimizationReport> {
  const t0 = performance.now();

  const allLengths = Array.from(
    new Set([baseConfig.rsiLength, ...grid.rsiLengths])
  );
  const precomputedDays = buildPrecomputedDays(allCandles, allLengths);

  const combos: StrategyConfig[] = [];
  for (const sl of grid.stopLossValues) {
    for (const tgt of grid.targetValues) {
      if (tgt <= sl) continue;
      for (const maxTrades of grid.maxTradesValues) {
        for (const rsiLen of grid.rsiLengths) {
          for (const pair of grid.rsiPairs) {
            for (const buf of grid.entryBufferValues) {
              combos.push({
                ...baseConfig,
                stopLossPoints: sl,
                targetPoints: tgt,
                maxTradesPerDay: maxTrades,
                rsiLength: rsiLen,
                rsiBuyThreshold: pair.buy,
                rsiSellThreshold: pair.sell,
                entryBufferPoints: buf,
              });
            }
          }
        }
      }
    }
  }

  const scored: Array<{
    config: StrategyConfig;
    fast: FastMetrics;
    score: number;
  }> = [];

  // Sensitivity accumulators
  const slAcc = new Map<string, { sumPts: number; bestPts: number; sumWr: number; count: number }>();
  const tgtAcc = new Map<string, { sumPts: number; bestPts: number; sumWr: number; count: number }>();
  const maxAcc = new Map<string, { sumPts: number; bestPts: number; sumWr: number; count: number }>();
  const rsiAcc = new Map<string, { sumPts: number; bestPts: number; sumWr: number; count: number }>();

  const pushAcc = (
    map: Map<string, { sumPts: number; bestPts: number; sumWr: number; count: number }>,
    key: string,
    pts: number,
    wr: number
  ) => {
    const prev = map.get(key);
    if (prev) {
      prev.sumPts += pts;
      prev.bestPts = Math.max(prev.bestPts, pts);
      prev.sumWr += wr;
      prev.count += 1;
    } else {
      map.set(key, { sumPts: pts, bestPts: pts, sumWr: wr, count: 1 });
    }
  };

  const effectiveMinTrades = Math.min(
    grid.minTrades,
    Math.max(3, Math.floor(precomputedDays.length * 0.25))
  );

  const CHUNK_SIZE = 40;
  for (let i = 0; i < combos.length; i++) {
    const cfg = combos[i];
    const fast = evaluateConfigFast(precomputedDays, cfg);

    if (fast.totalTrades >= effectiveMinTrades) {
      const score = scoreForObjective(fast, grid.objective);
      scored.push({ config: cfg, fast, score });

      pushAcc(slAcc, `${cfg.stopLossPoints} pts`, fast.netPoints, fast.accuracyExclBreakevenPct);
      pushAcc(tgtAcc, `${cfg.targetPoints} pts`, fast.netPoints, fast.accuracyExclBreakevenPct);
      pushAcc(maxAcc, `${cfg.maxTradesPerDay} / day`, fast.netPoints, fast.accuracyExclBreakevenPct);
      pushAcc(
        rsiAcc,
        `RSI(${cfg.rsiLength}) <${cfg.rsiBuyThreshold}/>${cfg.rsiSellThreshold}`,
        fast.netPoints,
        fast.accuracyExclBreakevenPct
      );
    }

    if ((i + 1) % CHUNK_SIZE === 0 || i === combos.length - 1) {
      onProgress?.(i + 1, combos.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Fallback if minTrades filtered everything out (e.g., very short 5-day range)
  if (scored.length === 0 && combos.length > 0) {
    for (const cfg of combos) {
      const fast = evaluateConfigFast(precomputedDays, cfg);
      if (fast.totalTrades > 0) {
        scored.push({
          config: cfg,
          fast,
          score: scoreForObjective(fast, grid.objective),
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Split dataset chronologically into H1 (first half) and H2 (second half) for out-of-sample walk-forward verification
  const uniqueDates = Array.from(
    new Set(allCandles.map((c) => c.date || 'Session'))
  ).sort();
  const walkForwardMidDate =
    uniqueDates.length >= 10
      ? uniqueDates[Math.floor(uniqueDates.length / 2)]
      : null;
  const h1Candles = walkForwardMidDate
    ? allCandles.filter((c) => (c.date || 'Session') < walkForwardMidDate)
    : null;
  const h2Candles = walkForwardMidDate
    ? allCandles.filter((c) => (c.date || 'Session') >= walkForwardMidDate)
    : null;

  // Re-verify top 15 with full canonical runMultiDayBacktest + H1/H2 walk-forward check
  const topSlice = scored.slice(0, 15);
  const topCandidates: OptimizerCandidateResult[] = topSlice.map((item, idx) => {
    const verified = runMultiDayBacktest(allCandles, item.config);
    const h1Res = h1Candles ? runMultiDayBacktest(h1Candles, item.config) : null;
    const h2Res = h2Candles ? runMultiDayBacktest(h2Candles, item.config) : null;
    return toCandidateFromFullResult(
      item.config,
      verified,
      grid.objective,
      idx + 1,
      h1Res,
      h2Res
    );
  });

  // Sort verified top 15 again by exact objective score
  topCandidates.sort((a, b) => b.objectiveScore - a.objectiveScore);
  topCandidates.forEach((c, idx) => {
    c.rank = idx + 1;
  });

  const baselineFull = runMultiDayBacktest(allCandles, baseConfig);
  const baselineH1 = h1Candles ? runMultiDayBacktest(h1Candles, baseConfig) : null;
  const baselineH2 = h2Candles ? runMultiDayBacktest(h2Candles, baseConfig) : null;
  const currentBaseline = toCandidateFromFullResult(
    baseConfig,
    baselineFull,
    grid.objective,
    0,
    baselineH1,
    baselineH2
  );

  const robustCandidate =
    topCandidates.find((c) => c.bothHalvesProfitable) ??
    topCandidates[0] ??
    null;

  const mapToList = (
    map: Map<string, { sumPts: number; bestPts: number; sumWr: number; count: number }>
  ): ParameterSensitivityItem[] =>
    Array.from(map.entries())
      .map(([label, v]) => ({
        label,
        avgNetPoints: round2(v.sumPts / Math.max(1, v.count)),
        bestNetPoints: round2(v.bestPts),
        avgWinRatePct: round2(v.sumWr / Math.max(1, v.count)),
        count: v.count,
      }))
      .sort((a, b) => b.avgNetPoints - a.avgNetPoints);

  return {
    testedCombinations: combos.length,
    validCombinations: scored.length,
    durationMs: Math.round(performance.now() - t0),
    objective: grid.objective,
    walkForwardMidDate,
    currentBaseline,
    bestCandidate: topCandidates[0] ?? null,
    robustCandidate,
    topCandidates,
    sensitivity: {
      stopLoss: mapToList(slAcc),
      target: mapToList(tgtAcc),
      maxTrades: mapToList(maxAcc),
      rsiZone: mapToList(rsiAcc),
    },
  };
}
