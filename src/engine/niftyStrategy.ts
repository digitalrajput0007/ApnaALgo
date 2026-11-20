import {
  BacktestMetrics,
  BacktestResult,
  BiasDirection,
  Candle,
  CandleColor,
  CandleSetSummary,
  DailyBacktestSummary,
  EnrichedCandle,
  MonthlyBacktestSummary,
  MultiDayBacktestResult,
  ScenarioPreset,
  StrategyConfig,
  StrategyEvent,
  StrategyStage,
  TradeRecord,
} from '../types/strategy';

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  setSize: 4,
  requiredMajority: 3,
  timeframeMinutes: 5,
  rsiLength: 2,
  rsiBuyThreshold: 12,
  rsiSellThreshold: 89,
  entryBufferPoints: 1,
  stopLossPoints: 20,
  targetPoints: 60,
  trailToCostAtOneToOne: true,
  updateTriggerWhileInRsiZone: true,
  biasMode: 'LOCK_FOR_DAY',
  maxTradesPerDay: 4,
  stopAfterTargetHit: true,
  lotSize: 65,
  lots: 1,
  instrumentType: 'NIFTY_FUT',
  optionDeltaEstimate: 0.65,
  squareOffTime: '15:15',
};

export function getCandleColor(candle: Candle): CandleColor {
  if (candle.close > candle.open) return 'GREEN';
  if (candle.close < candle.open) return 'RED';
  return 'DOJI';
}

/**
 * Standard Wilder's Smoothing RSI (matches TradingView & Fyers Web RSI).
 */
export function calculateWilderRSI(closes: number[], length: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= length || length < 1) {
    return result;
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / length;
  let avgLoss = lossSum / length;

  result[length] =
    avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = length + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;

    if (avgLoss === 0 && avgGain === 0) {
      result[i] = 50;
    } else if (avgLoss === 0) {
      result[i] = 100;
    } else if (avgGain === 0) {
      result[i] = 0;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }

  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

interface ArmedSetupState {
  direction: 'LONG' | 'SHORT';
  rawTriggerLevel: number;
  triggerLevel: number;
  signalCandleIndex: number;
  signalTime: string;
  signalRsi: number;
  biasSetNumber: number;
}

export function runNiftyStrategy(
  rawCandles: Candle[],
  config: StrategyConfig,
  maxCandleCount?: number,
  precomputedRsiSeries?: (number | null)[]
): BacktestResult {
  const candles =
    typeof maxCandleCount === 'number'
      ? rawCandles.slice(0, Math.max(0, maxCandleCount))
      : rawCandles;

  const closes = candles.map((c) => c.close);
  const rsiSeries =
    precomputedRsiSeries ?? calculateWilderRSI(closes, config.rsiLength);

  const sets: CandleSetSummary[] = [];
  const trades: TradeRecord[] = [];
  const events: StrategyEvent[] = [];
  const enriched: EnrichedCandle[] = [];

  let activeBias: BiasDirection = 'PENDING';
  let biasDecidedSet: number | null = null;
  let biasDecidedTime: string | null = null;

  let armedSetup: ArmedSetupState | null = null;

  let openTrade: TradeRecord | null = null;
  let dayHaltedByTarget = false;
  const stopAfterTarget = config.stopAfterTargetHit ?? true;
  const squareOffMins = toMinutes(config.squareOffTime);
  const multiplier = config.lotSize * config.lots;
  const buffer = Math.max(0, config.entryBufferPoints);

  const computeRupees = (pts: number) => {
    const effectivePts =
      config.instrumentType === 'NIFTY_ATM_OPT'
        ? pts * config.optionDeltaEstimate
        : pts;
    return round2(effectivePts * multiplier);
  };

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const color = getCandleColor(candle);
    const rsi2 = rsiSeries[i] !== null ? round2(rsiSeries[i] as number) : null;
    const setNumber = Math.floor(i / config.setSize) + 1;
    const positionInSet = (i % config.setSize) + 1;
    const candleMins = toMinutes(candle.time);

    // 1. Manage existing open trade during current candle
    if (openTrade) {
      if (openTrade.direction === 'LONG') {
        openTrade.maxFavorableExcursion = round2(
          Math.max(openTrade.maxFavorableExcursion, candle.high - openTrade.entryPrice)
        );
        openTrade.maxAdverseExcursion = round2(
          Math.max(openTrade.maxAdverseExcursion, openTrade.entryPrice - candle.low)
        );

        const slTriggeredFirst = candle.low <= openTrade.currentSlPrice;
        const oneToOneLevel = openTrade.entryPrice + config.stopLossPoints;

        if (candle.open <= openTrade.currentSlPrice) {
          const exitPx = candle.open;
          const pts = round2(exitPx - openTrade.entryPrice);
          openTrade.exitCandleIndex = i;
          openTrade.exitTime = candle.time;
          openTrade.exitPrice = exitPx;
          openTrade.exitReason = openTrade.trailedToCost
            ? 'TRAILED_COST_EXIT'
            : 'STRICT_SL_HIT';
          openTrade.pnlPoints = pts;
          openTrade.pnlRupees = computeRupees(pts);
          events.push({
            candleIndex: i,
            time: candle.time,
            type: openTrade.trailedToCost ? 'TRAIL_COST_HIT' : 'SL_HIT',
            title: openTrade.trailedToCost
              ? `Trade #${openTrade.id} Cost SL Exit`
              : `Trade #${openTrade.id} Strict SL Hit`,
            detail: `Exited LONG at ${exitPx.toFixed(2)} (${
              pts >= 0 ? '+' : ''
            }${pts.toFixed(2)} pts)`,
            sentiment: openTrade.trailedToCost ? 'warning' : 'bearish',
          });
          trades.push({ ...openTrade });
          openTrade = null;
        } else if (
          slTriggeredFirst &&
          (!openTrade.trailedToCost || candle.close < candle.open)
        ) {
          const exitPx = openTrade.currentSlPrice;
          const pts = round2(exitPx - openTrade.entryPrice);
          openTrade.exitCandleIndex = i;
          openTrade.exitTime = candle.time;
          openTrade.exitPrice = exitPx;
          openTrade.exitReason = openTrade.trailedToCost
            ? 'TRAILED_COST_EXIT'
            : 'STRICT_SL_HIT';
          openTrade.pnlPoints = pts;
          openTrade.pnlRupees = computeRupees(pts);
          events.push({
            candleIndex: i,
            time: candle.time,
            type: openTrade.trailedToCost ? 'TRAIL_COST_HIT' : 'SL_HIT',
            title: openTrade.trailedToCost
              ? `Trade #${openTrade.id} Cost SL Exit`
              : `Trade #${openTrade.id} Strict SL Hit`,
            detail: `Low ${candle.low.toFixed(2)} hit ${
              openTrade.trailedToCost ? 'Trailed Cost SL' : 'Strict SL'
            } ${exitPx.toFixed(2)} (${pts >= 0 ? '+' : ''}${pts.toFixed(2)} pts)`,
            sentiment: openTrade.trailedToCost ? 'warning' : 'bearish',
          });
          trades.push({ ...openTrade });
          openTrade = null;
        } else {
          if (
            config.trailToCostAtOneToOne &&
            !openTrade.trailedToCost &&
            candle.high >= oneToOneLevel
          ) {
            openTrade.trailedToCost = true;
            openTrade.currentSlPrice = openTrade.entryPrice;
            openTrade.trailCandleIndex = i;
            openTrade.trailTime = candle.time;
            events.push({
              candleIndex: i,
              time: candle.time,
              type: 'SL_TRAILED_COST',
              title: `Trade #${openTrade.id} SL Trailed to Cost`,
              detail: `1:1 (+${config.stopLossPoints} pts) achieved at ${oneToOneLevel.toFixed(
                2
              )}. SL moved to ${openTrade.entryPrice.toFixed(2)}.`,
              sentiment: 'warning',
            });
          }

          if (openTrade && candle.high >= openTrade.targetPrice) {
            const exitPx = openTrade.targetPrice;
            const pts = round2(exitPx - openTrade.entryPrice);
            openTrade.exitCandleIndex = i;
            openTrade.exitTime = candle.time;
            openTrade.exitPrice = exitPx;
            openTrade.exitReason = 'TARGET_HIT';
            openTrade.pnlPoints = pts;
            openTrade.pnlRupees = computeRupees(pts);
            events.push({
              candleIndex: i,
              time: candle.time,
              type: 'TARGET_HIT',
              title: `Trade #${openTrade.id} Target Achieved`,
              detail: `High ${candle.high.toFixed(2)} reached Target ${exitPx.toFixed(
                2
              )} (+${pts.toFixed(2)} pts)${
                stopAfterTarget ? ' · Day complete (no more trades after target).' : ''
              }`,
              sentiment: 'bullish',
            });
            trades.push({ ...openTrade });
            openTrade = null;
            if (stopAfterTarget) {
              dayHaltedByTarget = true;
              armedSetup = null;
            }
          }
        }
      } else {
        openTrade.maxFavorableExcursion = round2(
          Math.max(openTrade.maxFavorableExcursion, openTrade.entryPrice - candle.low)
        );
        openTrade.maxAdverseExcursion = round2(
          Math.max(openTrade.maxAdverseExcursion, candle.high - openTrade.entryPrice)
        );

        const slTriggeredFirst = candle.high >= openTrade.currentSlPrice;
        const oneToOneLevel = openTrade.entryPrice - config.stopLossPoints;

        if (candle.open >= openTrade.currentSlPrice) {
          const exitPx = candle.open;
          const pts = round2(openTrade.entryPrice - exitPx);
          openTrade.exitCandleIndex = i;
          openTrade.exitTime = candle.time;
          openTrade.exitPrice = exitPx;
          openTrade.exitReason = openTrade.trailedToCost
            ? 'TRAILED_COST_EXIT'
            : 'STRICT_SL_HIT';
          openTrade.pnlPoints = pts;
          openTrade.pnlRupees = computeRupees(pts);
          events.push({
            candleIndex: i,
            time: candle.time,
            type: openTrade.trailedToCost ? 'TRAIL_COST_HIT' : 'SL_HIT',
            title: openTrade.trailedToCost
              ? `Trade #${openTrade.id} Cost SL Exit`
              : `Trade #${openTrade.id} Strict SL Hit`,
            detail: `Exited SHORT at ${exitPx.toFixed(2)} (${
              pts >= 0 ? '+' : ''
            }${pts.toFixed(2)} pts)`,
            sentiment: openTrade.trailedToCost ? 'warning' : 'bearish',
          });
          trades.push({ ...openTrade });
          openTrade = null;
        } else if (
          slTriggeredFirst &&
          (!openTrade.trailedToCost || candle.close > candle.open)
        ) {
          const exitPx = openTrade.currentSlPrice;
          const pts = round2(openTrade.entryPrice - exitPx);
          openTrade.exitCandleIndex = i;
          openTrade.exitTime = candle.time;
          openTrade.exitPrice = exitPx;
          openTrade.exitReason = openTrade.trailedToCost
            ? 'TRAILED_COST_EXIT'
            : 'STRICT_SL_HIT';
          openTrade.pnlPoints = pts;
          openTrade.pnlRupees = computeRupees(pts);
          events.push({
            candleIndex: i,
            time: candle.time,
            type: openTrade.trailedToCost ? 'TRAIL_COST_HIT' : 'SL_HIT',
            title: openTrade.trailedToCost
              ? `Trade #${openTrade.id} Cost SL Exit`
              : `Trade #${openTrade.id} Strict SL Hit`,
            detail: `High ${candle.high.toFixed(2)} hit ${
              openTrade.trailedToCost ? 'Trailed Cost SL' : 'Strict SL'
            } ${exitPx.toFixed(2)} (${pts >= 0 ? '+' : ''}${pts.toFixed(2)} pts)`,
            sentiment: openTrade.trailedToCost ? 'warning' : 'bearish',
          });
          trades.push({ ...openTrade });
          openTrade = null;
        } else {
          if (
            config.trailToCostAtOneToOne &&
            !openTrade.trailedToCost &&
            candle.low <= oneToOneLevel
          ) {
            openTrade.trailedToCost = true;
            openTrade.currentSlPrice = openTrade.entryPrice;
            openTrade.trailCandleIndex = i;
            openTrade.trailTime = candle.time;
            events.push({
              candleIndex: i,
              time: candle.time,
              type: 'SL_TRAILED_COST',
              title: `Trade #${openTrade.id} SL Trailed to Cost`,
              detail: `1:1 (+${config.stopLossPoints} pts) achieved at ${oneToOneLevel.toFixed(
                2
              )}. SL moved to ${openTrade.entryPrice.toFixed(2)}.`,
              sentiment: 'warning',
            });
          }

          if (openTrade && candle.low <= openTrade.targetPrice) {
            const exitPx = openTrade.targetPrice;
            const pts = round2(openTrade.entryPrice - exitPx);
            openTrade.exitCandleIndex = i;
            openTrade.exitTime = candle.time;
            openTrade.exitPrice = exitPx;
            openTrade.exitReason = 'TARGET_HIT';
            openTrade.pnlPoints = pts;
            openTrade.pnlRupees = computeRupees(pts);
            events.push({
              candleIndex: i,
              time: candle.time,
              type: 'TARGET_HIT',
              title: `Trade #${openTrade.id} Target Achieved`,
              detail: `Low ${candle.low.toFixed(2)} reached Target ${exitPx.toFixed(
                2
              )} (+${pts.toFixed(2)} pts)${
                stopAfterTarget ? ' · Day complete (no more trades after target).' : ''
              }`,
              sentiment: 'bullish',
            });
            trades.push({ ...openTrade });
            openTrade = null;
            if (stopAfterTarget) {
              dayHaltedByTarget = true;
              armedSetup = null;
            }
          }
        }
      }
    }

    // 2. Square off at EOD squareOffTime if still open
    if (openTrade && candleMins >= squareOffMins) {
      const exitPx = candle.close;
      const pts =
        openTrade.direction === 'LONG'
          ? round2(exitPx - openTrade.entryPrice)
          : round2(openTrade.entryPrice - exitPx);
      openTrade.exitCandleIndex = i;
      openTrade.exitTime = candle.time;
      openTrade.exitPrice = exitPx;
      openTrade.exitReason = 'EOD_SQUARE_OFF';
      openTrade.pnlPoints = pts;
      openTrade.pnlRupees = computeRupees(pts);
      events.push({
        candleIndex: i,
        time: candle.time,
        type: 'SQUARE_OFF',
        title: `Trade #${openTrade.id} EOD Square-Off`,
        detail: `MIS square-off at ${exitPx.toFixed(2)} (${
          pts >= 0 ? '+' : ''
        }${pts.toFixed(2)} pts)`,
        sentiment: 'neutral',
      });
      trades.push({ ...openTrade });
      openTrade = null;
      armedSetup = null;
    }

    // 3. Check if an armed RSI setup triggers breakout entry on this candle (with Entry Buffer)
    if (
      !openTrade &&
      !dayHaltedByTarget &&
      armedSetup &&
      candleMins < squareOffMins &&
      trades.length < config.maxTradesPerDay
    ) {
      const longTriggered =
        armedSetup.direction === 'LONG' &&
        (buffer > 0
          ? candle.high >= armedSetup.triggerLevel
          : candle.high > armedSetup.triggerLevel);

      const shortTriggered =
        armedSetup.direction === 'SHORT' &&
        (buffer > 0
          ? candle.low <= armedSetup.triggerLevel
          : candle.low < armedSetup.triggerLevel);

      if (longTriggered) {
        const minFill =
          buffer > 0
            ? armedSetup.triggerLevel
            : round2(armedSetup.triggerLevel + 0.05);
        const entryPrice = round2(Math.max(candle.open, minFill));
        const slPrice = round2(entryPrice - config.stopLossPoints);
        const targetPrice = round2(entryPrice + config.targetPoints);

        const newTrade: TradeRecord = {
          id: trades.length + 1,
          date: candle.date,
          direction: 'LONG',
          biasSetNumber: armedSetup.biasSetNumber,
          signalCandleIndex: armedSetup.signalCandleIndex,
          signalTime: armedSetup.signalTime,
          signalRsi: armedSetup.signalRsi,
          rawTriggerLevel: armedSetup.rawTriggerLevel,
          triggerLevel: armedSetup.triggerLevel,
          entryCandleIndex: i,
          entryTime: candle.time,
          entryPrice,
          initialSlPrice: slPrice,
          currentSlPrice: slPrice,
          targetPrice,
          trailedToCost: false,
          exitReason: 'OPEN',
          pnlPoints: 0,
          pnlRupees: 0,
          maxFavorableExcursion: round2(Math.max(0, candle.high - entryPrice)),
          maxAdverseExcursion: round2(Math.max(0, entryPrice - candle.low)),
        };

        events.push({
          candleIndex: i,
          time: candle.time,
          type: 'ENTRY_EXECUTED',
          title: `Trade #${newTrade.id} LONG Executed`,
          detail: `Crossed ${armedSetup.rawTriggerLevel.toFixed(
            2
          )} (+${buffer}pt buf → ${armedSetup.triggerLevel.toFixed(
            2
          )}). Entry ${entryPrice.toFixed(2)} · SL ${slPrice.toFixed(
            2
          )} · Target ${targetPrice.toFixed(2)}`,
          sentiment: 'bullish',
        });

        if (candle.low <= slPrice && candle.close < entryPrice) {
          newTrade.exitCandleIndex = i;
          newTrade.exitTime = candle.time;
          newTrade.exitPrice = slPrice;
          newTrade.exitReason = 'STRICT_SL_HIT';
          newTrade.pnlPoints = -config.stopLossPoints;
          newTrade.pnlRupees = computeRupees(-config.stopLossPoints);
          events.push({
            candleIndex: i,
            time: candle.time,
            type: 'SL_HIT',
            title: `Trade #${newTrade.id} Strict SL Hit`,
            detail: `Intrabar reversal hit SL ${slPrice.toFixed(
              2
            )} (-${config.stopLossPoints} pts)`,
            sentiment: 'bearish',
          });
          trades.push(newTrade);
        } else {
          const oneToOne = entryPrice + config.stopLossPoints;
          if (config.trailToCostAtOneToOne && candle.high >= oneToOne) {
            newTrade.trailedToCost = true;
            newTrade.currentSlPrice = entryPrice;
            newTrade.trailCandleIndex = i;
            newTrade.trailTime = candle.time;
            events.push({
              candleIndex: i,
              time: candle.time,
              type: 'SL_TRAILED_COST',
              title: `Trade #${newTrade.id} SL Trailed to Cost`,
              detail: `1:1 (+${config.stopLossPoints} pts) reached on entry bar. SL moved to ${entryPrice.toFixed(
                2
              )}.`,
              sentiment: 'warning',
            });
          }
          if (candle.high >= targetPrice) {
            newTrade.exitCandleIndex = i;
            newTrade.exitTime = candle.time;
            newTrade.exitPrice = targetPrice;
            newTrade.exitReason = 'TARGET_HIT';
            newTrade.pnlPoints = config.targetPoints;
            newTrade.pnlRupees = computeRupees(config.targetPoints);
            events.push({
              candleIndex: i,
              time: candle.time,
              type: 'TARGET_HIT',
              title: `Trade #${newTrade.id} Target Achieved`,
              detail: `Reached Target ${targetPrice.toFixed(
                2
              )} (+${config.targetPoints} pts)${
                stopAfterTarget ? ' · Day complete (no more trades after target).' : ''
              }`,
              sentiment: 'bullish',
            });
            trades.push(newTrade);
            if (stopAfterTarget) {
              dayHaltedByTarget = true;
            }
          } else {
            openTrade = newTrade;
          }
        }
        armedSetup = null;
      } else if (shortTriggered) {
        const maxFill =
          buffer > 0
            ? armedSetup.triggerLevel
            : round2(armedSetup.triggerLevel - 0.05);
        const entryPrice = round2(Math.min(candle.open, maxFill));
        const slPrice = round2(entryPrice + config.stopLossPoints);
        const targetPrice = round2(entryPrice - config.targetPoints);

        const newTrade: TradeRecord = {
          id: trades.length + 1,
          date: candle.date,
          direction: 'SHORT',
          biasSetNumber: armedSetup.biasSetNumber,
          signalCandleIndex: armedSetup.signalCandleIndex,
          signalTime: armedSetup.signalTime,
          signalRsi: armedSetup.signalRsi,
          rawTriggerLevel: armedSetup.rawTriggerLevel,
          triggerLevel: armedSetup.triggerLevel,
          entryCandleIndex: i,
          entryTime: candle.time,
          entryPrice,
          initialSlPrice: slPrice,
          currentSlPrice: slPrice,
          targetPrice,
          trailedToCost: false,
          exitReason: 'OPEN',
          pnlPoints: 0,
          pnlRupees: 0,
          maxFavorableExcursion: round2(Math.max(0, entryPrice - candle.low)),
          maxAdverseExcursion: round2(Math.max(0, candle.high - entryPrice)),
        };

        events.push({
          candleIndex: i,
          time: candle.time,
          type: 'ENTRY_EXECUTED',
          title: `Trade #${newTrade.id} SHORT Executed`,
          detail: `Crossed ${armedSetup.rawTriggerLevel.toFixed(
            2
          )} (-${buffer}pt buf → ${armedSetup.triggerLevel.toFixed(
            2
          )}). Entry ${entryPrice.toFixed(2)} · SL ${slPrice.toFixed(
            2
          )} · Target ${targetPrice.toFixed(2)}`,
          sentiment: 'bearish',
        });

        if (candle.high >= slPrice && candle.close > entryPrice) {
          newTrade.exitCandleIndex = i;
          newTrade.exitTime = candle.time;
          newTrade.exitPrice = slPrice;
          newTrade.exitReason = 'STRICT_SL_HIT';
          newTrade.pnlPoints = -config.stopLossPoints;
          newTrade.pnlRupees = computeRupees(-config.stopLossPoints);
          events.push({
            candleIndex: i,
            time: candle.time,
            type: 'SL_HIT',
            title: `Trade #${newTrade.id} Strict SL Hit`,
            detail: `Intrabar reversal hit SL ${slPrice.toFixed(
              2
            )} (-${config.stopLossPoints} pts)`,
            sentiment: 'bearish',
          });
          trades.push(newTrade);
        } else {
          const oneToOne = entryPrice - config.stopLossPoints;
          if (config.trailToCostAtOneToOne && candle.low <= oneToOne) {
            newTrade.trailedToCost = true;
            newTrade.currentSlPrice = entryPrice;
            newTrade.trailCandleIndex = i;
            newTrade.trailTime = candle.time;
            events.push({
              candleIndex: i,
              time: candle.time,
              type: 'SL_TRAILED_COST',
              title: `Trade #${newTrade.id} SL Trailed to Cost`,
              detail: `1:1 (+${config.stopLossPoints} pts) reached on entry bar. SL moved to ${entryPrice.toFixed(
                2
              )}.`,
              sentiment: 'warning',
            });
          }
          if (candle.low <= targetPrice) {
            newTrade.exitCandleIndex = i;
            newTrade.exitTime = candle.time;
            newTrade.exitPrice = targetPrice;
            newTrade.exitReason = 'TARGET_HIT';
            newTrade.pnlPoints = config.targetPoints;
            newTrade.pnlRupees = computeRupees(config.targetPoints);
            events.push({
              candleIndex: i,
              time: candle.time,
              type: 'TARGET_HIT',
              title: `Trade #${newTrade.id} Target Achieved`,
              detail: `Reached Target ${targetPrice.toFixed(
                2
              )} (+${config.targetPoints} pts)${
                stopAfterTarget ? ' · Day complete (no more trades after target).' : ''
              }`,
              sentiment: 'bullish',
            });
            trades.push(newTrade);
            if (stopAfterTarget) {
              dayHaltedByTarget = true;
            }
          } else {
            openTrade = newTrade;
          }
        }
        armedSetup = null;
      }
    }

    // 4. Evaluate 4-Candle Set at the close of the 4th candle
    if (positionInSet === config.setSize) {
      const startIdx = i - config.setSize + 1;
      const setSlice = candles.slice(startIdx, i + 1);
      let greenCount = 0;
      let redCount = 0;
      let dojiCount = 0;

      for (const sc of setSlice) {
        const cColor = getCandleColor(sc);
        if (cColor === 'GREEN') greenCount++;
        else if (cColor === 'RED') redCount++;
        else dojiCount++;
      }

      let outcome: CandleSetSummary['outcome'] = 'UNDECIDED';
      if (greenCount >= config.requiredMajority) outcome = 'BULLISH';
      else if (redCount >= config.requiredMajority) outcome = 'BEARISH';

      const shouldApplyBias =
        activeBias === 'PENDING' ||
        (config.biasMode === 'ROLLING_SETS' && !openTrade);

      sets.push({
        setNumber,
        startIndex: startIdx,
        endIndex: i,
        startTime: setSlice[0].time,
        endTime: setSlice[setSlice.length - 1].time,
        greenCount,
        redCount,
        dojiCount,
        outcome,
        appliedForBias: shouldApplyBias && outcome !== 'UNDECIDED',
      });

      if (shouldApplyBias) {
        if (outcome === 'BULLISH') {
          if (activeBias !== 'BULLISH') {
            armedSetup = null;
          }
          activeBias = 'BULLISH';
          if (biasDecidedSet === null) {
            biasDecidedSet = setNumber;
            biasDecidedTime = candle.time;
          }
          events.push({
            candleIndex: i,
            time: candle.time,
            type: 'BIAS_DECIDED',
            title: `Set #${setNumber}: Bullish Bias Confirmed`,
            detail: `${greenCount} Green / ${redCount} Red out of ${config.setSize} candles (${setSlice[0].time}–${candle.time}). Waiting for RSI(${config.rsiLength}) < ${config.rsiBuyThreshold}.`,
            sentiment: 'bullish',
          });
        } else if (outcome === 'BEARISH') {
          if (activeBias !== 'BEARISH') {
            armedSetup = null;
          }
          activeBias = 'BEARISH';
          if (biasDecidedSet === null) {
            biasDecidedSet = setNumber;
            biasDecidedTime = candle.time;
          }
          events.push({
            candleIndex: i,
            time: candle.time,
            type: 'BIAS_DECIDED',
            title: `Set #${setNumber}: Bearish Bias Confirmed`,
            detail: `${redCount} Red / ${greenCount} Green out of ${config.setSize} candles (${setSlice[0].time}–${candle.time}). Waiting for RSI(${config.rsiLength}) > ${config.rsiSellThreshold}.`,
            sentiment: 'bearish',
          });
        } else if (activeBias === 'PENDING') {
          events.push({
            candleIndex: i,
            time: candle.time,
            type: 'SET_SKIPPED',
            title: `Set #${setNumber}: No Bias (${greenCount}G / ${redCount}R)`,
            detail: `Required ≥${config.requiredMajority} same-color candles. Moving to Set #${setNumber + 1}.`,
            sentiment: 'neutral',
          });
        }
      }
    }

    // 5. At candle close:
    //    (a) If setup is already armed and did NOT trigger on this candle, trail the base candle
    //        whenever a Lower High forms (for LONG) or a Higher Low forms (for SHORT),
    //        continuing until a subsequent candle breaks above/below the base candle.
    //    (b) If no setup is armed yet, check if RSI(2) enters Buy (<12) or Sell (>89) zone.
    if (
      !openTrade &&
      !dayHaltedByTarget &&
      activeBias !== 'PENDING' &&
      candleMins < squareOffMins &&
      trades.length < config.maxTradesPerDay
    ) {
      if (armedSetup) {
        const currentArmed: ArmedSetupState = armedSetup;
        if (
          currentArmed.direction === 'LONG' &&
          config.updateTriggerWhileInRsiZone &&
          candle.high < currentArmed.rawTriggerLevel
        ) {
          const nextTrigger = round2(candle.high + buffer);
          armedSetup = {
            ...currentArmed,
            rawTriggerLevel: candle.high,
            triggerLevel: nextTrigger,
            signalCandleIndex: i,
            signalTime: candle.time,
            signalRsi: rsi2 ?? currentArmed.signalRsi,
          };
          events.push({
            candleIndex: i,
            time: candle.time,
            type: 'RSI_ARMED',
            title: `Base Candle Shifted (Lower High)`,
            detail: `Lower high ${candle.high.toFixed(
              2
            )} became new LONG base candle. Trigger updated to ${nextTrigger.toFixed(
              2
            )} (+${buffer}pt buf).`,
            sentiment: 'bullish',
          });
        } else if (
          currentArmed.direction === 'SHORT' &&
          config.updateTriggerWhileInRsiZone &&
          candle.low > currentArmed.rawTriggerLevel
        ) {
          const nextTrigger = round2(candle.low - buffer);
          armedSetup = {
            ...currentArmed,
            rawTriggerLevel: candle.low,
            triggerLevel: nextTrigger,
            signalCandleIndex: i,
            signalTime: candle.time,
            signalRsi: rsi2 ?? currentArmed.signalRsi,
          };
          events.push({
            candleIndex: i,
            time: candle.time,
            type: 'RSI_ARMED',
            title: `Base Candle Shifted (Higher Low)`,
            detail: `Higher low ${candle.low.toFixed(
              2
            )} became new SHORT base candle. Trigger updated to ${nextTrigger.toFixed(
              2
            )} (-${buffer}pt buf).`,
            sentiment: 'bearish',
          });
        }
      } else if (rsi2 !== null) {
        if (activeBias === 'BULLISH' && rsi2 < config.rsiBuyThreshold) {
          const triggerWithBuf = round2(candle.high + buffer);
          armedSetup = {
            direction: 'LONG',
            rawTriggerLevel: candle.high,
            triggerLevel: triggerWithBuf,
            signalCandleIndex: i,
            signalTime: candle.time,
            signalRsi: rsi2,
            biasSetNumber: biasDecidedSet ?? setNumber,
          };
          events.push({
            candleIndex: i,
            time: candle.time,
            type: 'RSI_ARMED',
            title: `Buy Setup Armed (RSI ${rsi2.toFixed(1)})`,
            detail: `RSI(${config.rsiLength}) = ${rsi2.toFixed(2)} < ${
              config.rsiBuyThreshold
            }. Base High ${candle.high.toFixed(
              2
            )} + ${buffer}pt buffer = ${triggerWithBuf.toFixed(2)}.`,
            sentiment: 'bullish',
          });
        } else if (activeBias === 'BEARISH' && rsi2 > config.rsiSellThreshold) {
          const triggerWithBuf = round2(candle.low - buffer);
          armedSetup = {
            direction: 'SHORT',
            rawTriggerLevel: candle.low,
            triggerLevel: triggerWithBuf,
            signalCandleIndex: i,
            signalTime: candle.time,
            signalRsi: rsi2,
            biasSetNumber: biasDecidedSet ?? setNumber,
          };
          events.push({
            candleIndex: i,
            time: candle.time,
            type: 'RSI_ARMED',
            title: `Sell Setup Armed (RSI ${rsi2.toFixed(1)})`,
            detail: `RSI(${config.rsiLength}) = ${rsi2.toFixed(2)} > ${
              config.rsiSellThreshold
            }. Base Low ${candle.low.toFixed(
              2
            )} - ${buffer}pt buffer = ${triggerWithBuf.toFixed(2)}.`,
            sentiment: 'bearish',
          });
        }
      }
    }

    let stageAtClose: StrategyStage = 'EVALUATING_SET';
    if (openTrade) {
      stageAtClose = openTrade.trailedToCost ? 'SL_TRAILED_TO_COST' : 'IN_TRADE';
    } else if (armedSetup) {
      stageAtClose = 'SETUP_ARMED';
    } else if (activeBias !== 'PENDING') {
      stageAtClose = 'WAITING_RSI_ZONE';
    }
    if (candleMins >= squareOffMins || dayHaltedByTarget) {
      stageAtClose = 'COMPLETED_DAY';
    }

    enriched.push({
      ...candle,
      color,
      rsi2,
      setNumber,
      positionInSet,
      biasAtClose: activeBias,
      armedTriggerLevel: armedSetup ? armedSetup.triggerLevel : null,
      armedDirection: armedSetup ? armedSetup.direction : null,
      stageAtClose,
    });
  }

  // Handle incomplete trailing set
  if (candles.length % config.setSize !== 0) {
    const startIdx = Math.floor(candles.length / config.setSize) * config.setSize;
    const setSlice = candles.slice(startIdx);
    let greenCount = 0;
    let redCount = 0;
    let dojiCount = 0;
    for (const sc of setSlice) {
      const cColor = getCandleColor(sc);
      if (cColor === 'GREEN') greenCount++;
      else if (cColor === 'RED') redCount++;
      else dojiCount++;
    }
    sets.push({
      setNumber: Math.floor(candles.length / config.setSize) + 1,
      startIndex: startIdx,
      endIndex: candles.length - 1,
      startTime: setSlice[0].time,
      endTime: setSlice[setSlice.length - 1].time,
      greenCount,
      redCount,
      dojiCount,
      outcome: 'INCOMPLETE',
      appliedForBias: false,
    });
  }

  const allTrades = [...trades];
  if (openTrade && candles.length > 0) {
    const lastClose = candles[candles.length - 1].close;
    const floatingPts =
      openTrade.direction === 'LONG'
        ? round2(lastClose - openTrade.entryPrice)
        : round2(openTrade.entryPrice - lastClose);
    allTrades.push({
      ...openTrade,
      pnlPoints: floatingPts,
      pnlRupees: computeRupees(floatingPts),
    });
  }

  const closedTrades = trades;
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let netPoints = 0;
  let netRupees = 0;
  let grossProfitPoints = 0;
  let grossLossPoints = 0;
  let peak = 0;
  let equity = 0;
  let maxDrawdownPoints = 0;

  for (const t of closedTrades) {
    netPoints = round2(netPoints + t.pnlPoints);
    netRupees = round2(netRupees + t.pnlRupees);
    equity = round2(equity + t.pnlPoints);
    if (equity > peak) peak = equity;
    const dd = round2(peak - equity);
    if (dd > maxDrawdownPoints) maxDrawdownPoints = dd;

    if (t.pnlPoints > 0.5) {
      wins++;
      grossProfitPoints = round2(grossProfitPoints + t.pnlPoints);
    } else if (t.pnlPoints < -0.5) {
      losses++;
      grossLossPoints = round2(grossLossPoints + Math.abs(t.pnlPoints));
    } else {
      breakevens++;
    }
  }

  const metrics: BacktestMetrics = {
    totalTrades: allTrades.length,
    wins,
    losses,
    breakevens,
    winRatePct:
      closedTrades.length > 0 ? round2((wins / closedTrades.length) * 100) : 0,
    netPoints,
    netRupees,
    grossProfitPoints,
    grossLossPoints,
    profitFactor:
      grossLossPoints > 0
        ? round2(grossProfitPoints / grossLossPoints)
        : grossProfitPoints > 0
        ? 99.9
        : 0,
    maxDrawdownPoints,
    setsEvaluated: sets.filter((s) => s.outcome !== 'INCOMPLETE').length,
    setsSkipped: sets.filter((s) => s.outcome === 'UNDECIDED').length,
  };

  return {
    candles: enriched,
    sets,
    trades: allTrades,
    events,
    finalBias: activeBias,
    biasDecidedSet,
    biasDecidedTime,
    metrics,
  };
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function runMultiDayBacktest(
  allCandles: Candle[],
  config: StrategyConfig
): MultiDayBacktestResult {
  if (allCandles.length === 0) {
    return {
      totalDays: 0,
      winningDays: 0,
      losingDays: 0,
      flatDays: 0,
      dayWinRatePct: 0,
      totalCandles: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      winRatePct: 0,
      accuracyExclBreakevenPct: 0,
      netPoints: 0,
      netRupees: 0,
      grossProfitPoints: 0,
      grossLossPoints: 0,
      avgWinPoints: 0,
      avgLossPoints: 0,
      bestDayPoints: 0,
      worstDayPoints: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      profitFactor: 0,
      maxDrawdownPoints: 0,
      expectancyPoints: 0,
      avgTradesPerDay: 0,
      dailySummaries: [],
      monthlySummaries: [],
      allTrades: [],
    };
  }

  // Precompute continuous Wilder RSI across all bars so morning candles have full warm-up
  const continuousRsi = calculateWilderRSI(
    allCandles.map((c) => c.close),
    config.rsiLength
  );

  // Group candles chronologically by IST date
  const dayBuckets: Array<{
    date: string;
    candles: Candle[];
    rsiSlice: (number | null)[];
  }> = [];

  for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    const dateKey = c.date || 'Session';
    let lastBucket = dayBuckets[dayBuckets.length - 1];
    if (!lastBucket || lastBucket.date !== dateKey) {
      lastBucket = { date: dateKey, candles: [], rsiSlice: [] };
      dayBuckets.push(lastBucket);
    }
    lastBucket.candles.push({
      ...c,
      index: lastBucket.candles.length,
    });
    lastBucket.rsiSlice.push(continuousRsi[i]);
  }

  const dailySummaries: DailyBacktestSummary[] = [];
  const monthMap = new Map<string, MonthlyBacktestSummary>();
  const allTrades: TradeRecord[] = [];

  let cumulativePoints = 0;
  let cumulativeRupees = 0;
  let peakEquity = 0;
  let maxDrawdownPoints = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalBreakevens = 0;
  let grossProfitPoints = 0;
  let grossLossPoints = 0;

  for (const bucket of dayBuckets) {
    const dayRes = runNiftyStrategy(
      bucket.candles,
      config,
      undefined,
      bucket.rsiSlice
    );

    const closedTrades = dayRes.trades.filter((t) => t.exitReason !== 'OPEN');
    for (const t of closedTrades) {
      allTrades.push({
        ...t,
        id: allTrades.length + 1,
        date: bucket.date,
      });
    }

    cumulativePoints = round2(cumulativePoints + dayRes.metrics.netPoints);
    cumulativeRupees = round2(cumulativeRupees + dayRes.metrics.netRupees);
    if (cumulativePoints > peakEquity) peakEquity = cumulativePoints;
    const dd = round2(cumulativePoints - peakEquity);
    if (Math.abs(dd) > maxDrawdownPoints) {
      maxDrawdownPoints = round2(Math.abs(dd));
    }

    totalWins += dayRes.metrics.wins;
    totalLosses += dayRes.metrics.losses;
    totalBreakevens += dayRes.metrics.breakevens;
    grossProfitPoints = round2(
      grossProfitPoints + dayRes.metrics.grossProfitPoints
    );
    grossLossPoints = round2(grossLossPoints + dayRes.metrics.grossLossPoints);

    dailySummaries.push({
      date: bucket.date,
      bias: dayRes.finalBias,
      biasSetNumber: dayRes.biasDecidedSet,
      tradesCount: closedTrades.length,
      wins: dayRes.metrics.wins,
      losses: dayRes.metrics.losses,
      breakevens: dayRes.metrics.breakevens,
      dayPoints: dayRes.metrics.netPoints,
      dayRupees: dayRes.metrics.netRupees,
      cumulativePoints,
      cumulativeRupees,
      drawdownPoints: dd,
      candles: bucket.candles,
    });

    const monthKey = bucket.date.slice(0, 7);
    const existingMonth = monthMap.get(monthKey);
    const [yyyy, mm] = monthKey.split('-');
    const monthLabel =
      yyyy && mm && MONTH_NAMES[Number(mm) - 1]
        ? `${MONTH_NAMES[Number(mm) - 1]} ${yyyy}`
        : monthKey;

    if (existingMonth) {
      existingMonth.tradingDays += 1;
      existingMonth.tradesCount += closedTrades.length;
      existingMonth.wins += dayRes.metrics.wins;
      existingMonth.losses += dayRes.metrics.losses;
      existingMonth.netPoints = round2(
        existingMonth.netPoints + dayRes.metrics.netPoints
      );
      existingMonth.netRupees = round2(
        existingMonth.netRupees + dayRes.metrics.netRupees
      );
    } else {
      monthMap.set(monthKey, {
        month: monthKey,
        label: monthLabel,
        tradingDays: 1,
        tradesCount: closedTrades.length,
        wins: dayRes.metrics.wins,
        losses: dayRes.metrics.losses,
        netPoints: dayRes.metrics.netPoints,
        netRupees: dayRes.metrics.netRupees,
      });
    }
  }

  const totalTrades = allTrades.length;
  const winRatePct =
    totalTrades > 0 ? round2((totalWins / totalTrades) * 100) : 0;
  const decisiveTrades = totalWins + totalLosses;
  const accuracyExclBreakevenPct =
    decisiveTrades > 0 ? round2((totalWins / decisiveTrades) * 100) : 0;
  const profitFactor =
    grossLossPoints > 0
      ? round2(grossProfitPoints / grossLossPoints)
      : grossProfitPoints > 0
      ? 99.9
      : 0;
  const expectancyPoints =
    totalTrades > 0 ? round2(cumulativePoints / totalTrades) : 0;
  const avgTradesPerDay =
    dayBuckets.length > 0 ? round2(totalTrades / dayBuckets.length) : 0;
  const avgWinPoints =
    totalWins > 0 ? round2(grossProfitPoints / totalWins) : 0;
  const avgLossPoints =
    totalLosses > 0 ? round2(grossLossPoints / totalLosses) : 0;

  let winningDays = 0;
  let losingDays = 0;
  let flatDays = 0;
  let bestDayPoints = dailySummaries[0]?.dayPoints ?? 0;
  let worstDayPoints = dailySummaries[0]?.dayPoints ?? 0;

  for (const d of dailySummaries) {
    if (d.dayPoints > 0.5) winningDays++;
    else if (d.dayPoints < -0.5) losingDays++;
    else flatDays++;
    if (d.dayPoints > bestDayPoints) bestDayPoints = d.dayPoints;
    if (d.dayPoints < worstDayPoints) worstDayPoints = d.dayPoints;
  }

  const activeTradingDays = winningDays + losingDays;
  const dayWinRatePct =
    activeTradingDays > 0 ? round2((winningDays / activeTradingDays) * 100) : 0;

  let curWinStreak = 0;
  let curLossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  for (const t of allTrades) {
    if (t.pnlPoints > 0.5) {
      curWinStreak++;
      curLossStreak = 0;
      if (curWinStreak > maxConsecutiveWins) maxConsecutiveWins = curWinStreak;
    } else if (t.pnlPoints < -0.5) {
      curLossStreak++;
      curWinStreak = 0;
      if (curLossStreak > maxConsecutiveLosses) {
        maxConsecutiveLosses = curLossStreak;
      }
    }
  }

  return {
    totalDays: dayBuckets.length,
    winningDays,
    losingDays,
    flatDays,
    dayWinRatePct,
    totalCandles: allCandles.length,
    totalTrades,
    wins: totalWins,
    losses: totalLosses,
    breakevens: totalBreakevens,
    winRatePct,
    accuracyExclBreakevenPct,
    netPoints: cumulativePoints,
    netRupees: cumulativeRupees,
    grossProfitPoints,
    grossLossPoints,
    avgWinPoints,
    avgLossPoints,
    bestDayPoints: round2(bestDayPoints),
    worstDayPoints: round2(worstDayPoints),
    maxConsecutiveWins,
    maxConsecutiveLosses,
    profitFactor,
    maxDrawdownPoints,
    expectancyPoints,
    avgTradesPerDay,
    dailySummaries,
    monthlySummaries: Array.from(monthMap.values()),
    allTrades,
  };
}

function buildCandle(
  index: number,
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
): Candle {
  return { index, time, open, high, low, close, volume };
}

export function getScenarioPresets(): ScenarioPreset[] {
  const todayBullish: Candle[] = [
    buildCandle(0, '09:15', 24150, 24171, 24146, 24168, 184200),
    buildCandle(1, '09:20', 24168, 24172, 24151, 24154, 151800),
    buildCandle(2, '09:25', 24154, 24174, 24152, 24171, 143500),
    buildCandle(3, '09:30', 24171, 24173, 24155, 24158, 136900),
    buildCandle(4, '09:35', 24158, 24176, 24156, 24174, 162400),
    buildCandle(5, '09:40', 24174, 24191, 24172, 24189, 178100),
    buildCandle(6, '09:45', 24189, 24209, 24187, 24206, 195300),
    buildCandle(7, '09:50', 24206, 24225, 24203, 24222, 211000),
    buildCandle(8, '09:55', 24222, 24224, 24205, 24208, 149000),
    buildCandle(9, '10:00', 24208, 24211, 24183, 24186, 168400),
    buildCandle(10, '10:05', 24186, 24190, 24171, 24174, 157200),
    buildCandle(11, '10:10', 24174, 24179, 24165, 24168, 163100),
    buildCandle(12, '10:15', 24169, 24192, 24167, 24188, 198400),
    buildCandle(13, '10:20', 24188, 24190, 24154, 24157, 224900),
    buildCandle(14, '10:25', 24157, 24162, 24146, 24149, 171200),
    buildCandle(15, '10:30', 24149, 24155, 24138, 24141, 189400),
    buildCandle(16, '10:35', 24142, 24171, 24140, 24168, 214600),
    buildCandle(17, '10:40', 24168, 24184, 24163, 24181, 205100),
    buildCandle(18, '10:45', 24181, 24183, 24166, 24174, 152800),
    buildCandle(19, '10:50', 24174, 24202, 24172, 24198, 228900),
    buildCandle(20, '10:55', 24198, 24221, 24195, 24218, 246300),
    buildCandle(21, '11:00', 24218, 24234, 24214, 24230, 219400),
    buildCandle(22, '11:05', 24230, 24242, 24225, 24238, 204800),
    buildCandle(23, '11:10', 24238, 24240, 24228, 24231, 148200),
  ];

  const bearishReversal: Candle[] = [
    buildCandle(0, '09:15', 24410, 24416, 24388, 24392, 192400),
    buildCandle(1, '09:20', 24392, 24398, 24376, 24379, 174200),
    buildCandle(2, '09:25', 24379, 24389, 24374, 24386, 142100),
    buildCandle(3, '09:30', 24386, 24388, 24362, 24365, 188500),
    buildCandle(4, '09:35', 24365, 24382, 24363, 24380, 154300),
    buildCandle(5, '09:40', 24380, 24396, 24378, 24394, 161200),
    buildCandle(6, '09:45', 24394, 24405, 24391, 24403, 148900),
    buildCandle(7, '09:50', 24401, 24403, 24378, 24381, 210400),
    buildCandle(8, '09:55', 24381, 24385, 24364, 24367, 224000),
    buildCandle(9, '10:00', 24367, 24376, 24359, 24362, 181200),
    buildCandle(10, '10:05', 24362, 24365, 24341, 24344, 208900),
    buildCandle(11, '10:10', 24344, 24348, 24326, 24329, 234100),
    buildCandle(12, '10:15', 24329, 24336, 24318, 24324, 179400),
    buildCandle(13, '10:20', 24324, 24339, 24321, 24335, 145600),
    buildCandle(14, '10:25', 24335, 24344, 24331, 24341, 138400),
    buildCandle(15, '10:30', 24341, 24343, 24327, 24330, 149200),
  ];

  const choppyGuard: Candle[] = [
    buildCandle(0, '09:15', 23980, 23996, 23975, 23992, 141200),
    buildCandle(1, '09:20', 23992, 23995, 23978, 23981, 134500),
    buildCandle(2, '09:25', 23981, 23998, 23979, 23994, 129800),
    buildCandle(3, '09:30', 23994, 23997, 23980, 23983, 131400),
    buildCandle(4, '09:35', 23983, 23999, 23981, 23995, 126500),
    buildCandle(5, '09:40', 23995, 23998, 23982, 23985, 128900),
    buildCandle(6, '09:45', 23985, 24001, 23983, 23997, 134200),
    buildCandle(7, '09:50', 23997, 24000, 23984, 23986, 125600),
    buildCandle(8, '09:55', 23986, 24004, 23985, 24002, 152100),
    buildCandle(9, '10:00', 24002, 24016, 24000, 24014, 161800),
    buildCandle(10, '10:05', 24014, 24017, 24005, 24008, 140200),
    buildCandle(11, '10:10', 24008, 24024, 24007, 24021, 168900),
    buildCandle(12, '10:15', 24021, 24023, 24001, 24004, 158400),
    buildCandle(13, '10:20', 24004, 24007, 23988, 23991, 164200),
    buildCandle(14, '10:25', 23991, 23995, 23981, 23984, 171100),
    buildCandle(15, '10:30', 23985, 24010, 23983, 24007, 193200),
    buildCandle(16, '10:35', 24007, 24021, 24004, 24016, 187400),
    buildCandle(17, '10:40', 24016, 24018, 23991, 23993, 205600),
    buildCandle(18, '10:45', 23993, 23996, 23978, 23981, 169000),
    buildCandle(19, '10:50', 23981, 23985, 23971, 23974, 173800),
    buildCandle(20, '10:55', 23975, 24001, 23974, 23998, 212400),
    buildCandle(21, '11:00', 23998, 24018, 23995, 24015, 224100),
    buildCandle(22, '11:05', 24015, 24049, 24013, 24046, 248900),
    buildCandle(23, '11:10', 24046, 24055, 24038, 24049, 178500),
  ];

  return [
    {
      id: 'today_bullish',
      name: "Today's NIFTY Walkthrough",
      subtitle:
        'Set 1 skipped (2G/2R) · Set 2 Bullish (4G) · Trade 1 SL (-20) · Trade 2 Runner (+60/+80)',
      dateLabel: '5m NSE Session',
      candles: todayBullish,
    },
    {
      id: 'bearish_reversal',
      name: 'Bearish Set 1 + RSI > 89',
      subtitle:
        'Set 1 Bearish (3R/1G) · Bounce to RSI(2) > 89 · Breakdown Short (+60 pts)',
      dateLabel: '5m Bearish Session',
      candles: bearishReversal,
    },
    {
      id: 'choppy_guard',
      name: 'Choppy Open & 1:1 Cost Guard',
      subtitle:
        'Sets 1 & 2 skipped (2G/2R) · Set 3 Bullish · 1:1 Trail saves 20pt loss before +60 win',
      dateLabel: '5m Choppy Session',
      candles: choppyGuard,
    },
  ];
}

export function parseCsvCandles(rawText: string): { candles: Candle[]; error?: string } {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 6) {
    return { candles: [], error: 'Provide at least 6 rows of 5-minute OHLC data.' };
  }

  const parsed: Candle[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const cols = line.split(/[,\t;]+/).map((c) => c.trim());
    if (idx === 0 && Number.isNaN(Number(cols[1]))) {
      continue;
    }
    if (cols.length < 5) {
      return {
        candles: [],
        error: `Row ${idx + 1} has fewer than 5 columns. Expected: time,open,high,low,close[,volume]`,
      };
    }
    const rawTime = cols[0];
    const dateMatch = rawTime.match(/(\d{4}-\d{2}-\d{2})/);
    const time = rawTime.slice(-5);
    const open = Number(cols[1]);
    const high = Number(cols[2]);
    const low = Number(cols[3]);
    const close = Number(cols[4]);
    const volume = cols[5] ? Number(cols[5]) || 100000 : 100000;

    if ([open, high, low, close].some((v) => Number.isNaN(v))) {
      return {
        candles: [],
        error: `Row ${idx + 1} contains invalid OHLC numeric values.`,
      };
    }

    parsed.push({
      index: parsed.length,
      date: dateMatch ? dateMatch[1] : undefined,
      time,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  if (parsed.length < 6) {
    return { candles: [], error: 'Parsed fewer than 6 valid candle rows.' };
  }

  return { candles: parsed };
}
