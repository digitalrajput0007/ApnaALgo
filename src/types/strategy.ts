export type BiasDirection = 'PENDING' | 'BULLISH' | 'BEARISH';

export type CandleColor = 'GREEN' | 'RED' | 'DOJI';

export type BiasEvaluationMode = 'LOCK_FOR_DAY' | 'ROLLING_SETS';

export type InstrumentType = 'NIFTY_FUT' | 'NIFTY_ATM_OPT' | 'NIFTY_SPOT_SIM';

export interface Candle {
  index: number;
  date?: string; // YYYY-MM-DD IST
  time: string; // HH:MM IST
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyConfig {
  setSize: number;
  requiredMajority: number;
  timeframeMinutes: number;
  rsiLength: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  entryBufferPoints: number;
  stopLossPoints: number;
  targetPoints: number;
  trailToCostAtOneToOne: boolean;
  updateTriggerWhileInRsiZone: boolean;
  biasMode: BiasEvaluationMode;
  maxTradesPerDay: number;
  stopAfterTargetHit: boolean;
  lotSize: number;
  lots: number;
  instrumentType: InstrumentType;
  optionDeltaEstimate: number;
  squareOffTime: string;
}

export interface CandleSetSummary {
  setNumber: number;
  startIndex: number;
  endIndex: number;
  startTime: string;
  endTime: string;
  greenCount: number;
  redCount: number;
  dojiCount: number;
  outcome: 'BULLISH' | 'BEARISH' | 'UNDECIDED' | 'INCOMPLETE';
  appliedForBias: boolean;
}

export type TradeExitReason =
  | 'TARGET_HIT'
  | 'STRICT_SL_HIT'
  | 'TRAILED_COST_EXIT'
  | 'EOD_SQUARE_OFF'
  | 'OPEN';

export interface TradeRecord {
  id: number;
  date?: string;
  direction: 'LONG' | 'SHORT';
  biasSetNumber: number;
  signalCandleIndex: number;
  signalTime: string;
  signalRsi: number;
  rawTriggerLevel: number;
  triggerLevel: number;
  entryCandleIndex: number;
  entryTime: string;
  entryPrice: number;
  initialSlPrice: number;
  currentSlPrice: number;
  targetPrice: number;
  trailedToCost: boolean;
  trailCandleIndex?: number;
  trailTime?: string;
  exitCandleIndex?: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason: TradeExitReason;
  pnlPoints: number;
  pnlRupees: number;
  maxFavorableExcursion: number;
  maxAdverseExcursion: number;
}

export type StrategyStage =
  | 'EVALUATING_SET'
  | 'WAITING_RSI_ZONE'
  | 'SETUP_ARMED'
  | 'IN_TRADE'
  | 'SL_TRAILED_TO_COST'
  | 'COMPLETED_DAY';

export interface StrategyEvent {
  candleIndex: number;
  time: string;
  type:
    | 'SET_SKIPPED'
    | 'BIAS_DECIDED'
    | 'RSI_ARMED'
    | 'ENTRY_EXECUTED'
    | 'SL_TRAILED_COST'
    | 'SL_HIT'
    | 'TRAIL_COST_HIT'
    | 'TARGET_HIT'
    | 'SQUARE_OFF';
  title: string;
  detail: string;
  sentiment: 'neutral' | 'bullish' | 'bearish' | 'warning';
}

export interface EnrichedCandle extends Candle {
  color: CandleColor;
  rsi2: number | null;
  setNumber: number;
  positionInSet: number;
  biasAtClose: BiasDirection;
  armedTriggerLevel: number | null;
  armedDirection: 'LONG' | 'SHORT' | null;
  stageAtClose: StrategyStage;
}

export interface BacktestMetrics {
  totalTrades: number;
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
  setsEvaluated: number;
  setsSkipped: number;
}

export interface BacktestResult {
  candles: EnrichedCandle[];
  sets: CandleSetSummary[];
  trades: TradeRecord[];
  events: StrategyEvent[];
  finalBias: BiasDirection;
  biasDecidedSet: number | null;
  biasDecidedTime: string | null;
  metrics: BacktestMetrics;
}

export interface DailyBacktestSummary {
  date: string;
  bias: BiasDirection;
  biasSetNumber: number | null;
  tradesCount: number;
  wins: number;
  losses: number;
  breakevens: number;
  dayPoints: number;
  dayRupees: number;
  cumulativePoints: number;
  cumulativeRupees: number;
  drawdownPoints: number;
  candles: Candle[];
}

export interface MonthlyBacktestSummary {
  month: string; // YYYY-MM
  label: string; // e.g. Nov 2026
  tradingDays: number;
  tradesCount: number;
  wins: number;
  losses: number;
  netPoints: number;
  netRupees: number;
}

export interface MultiDayBacktestResult {
  totalDays: number;
  winningDays: number;
  losingDays: number;
  flatDays: number;
  dayWinRatePct: number;
  totalCandles: number;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRatePct: number;
  accuracyExclBreakevenPct: number;
  netPoints: number;
  netRupees: number;
  grossProfitPoints: number;
  grossLossPoints: number;
  avgWinPoints: number;
  avgLossPoints: number;
  bestDayPoints: number;
  worstDayPoints: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  profitFactor: number;
  maxDrawdownPoints: number;
  expectancyPoints: number;
  avgTradesPerDay: number;
  dailySummaries: DailyBacktestSummary[];
  monthlySummaries: MonthlyBacktestSummary[];
  allTrades: TradeRecord[];
}

export interface SavedBacktestReport {
  id: string;
  name: string;
  savedAt: string;
  symbol: string;
  fromDate: string;
  toDate: string;
  config: StrategyConfig;
  summary: {
    totalDays: number;
    winningDays: number;
    losingDays: number;
    totalTrades: number;
    wins: number;
    losses: number;
    breakevens: number;
    winRatePct: number;
    accuracyExclBreakevenPct: number;
    netPoints: number;
    netRupees: number;
    profitFactor: number;
    maxDrawdownPoints: number;
    expectancyPoints: number;
    avgWinPoints: number;
    avgLossPoints: number;
  };
  monthlySummaries: MonthlyBacktestSummary[];
}

export interface ScenarioPreset {
  id: string;
  name: string;
  subtitle: string;
  dateLabel: string;
  recommendedTargetPoints?: number;
  candles: Candle[];
}

export type PaperTradeSource =
  | 'BACKTEST_1Y'
  | 'STRATEGY_LAB'
  | 'LIVE_SESSION'
  | 'MANUAL';

export interface PaperTradeEntry {
  id: string;
  date: string; // YYYY-MM-DD (IST)
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryTime: string;
  exitTime?: string;
  entryPrice: number;
  exitPrice?: number;
  exitReason: TradeExitReason;
  pnlPoints: number;
  pnlRupees: number;
  trailedToCost: boolean;
  signalRsi: number;
  biasSetNumber: number;
  source: PaperTradeSource;
  batchLabel?: string;
  savedAt: string; // ISO timestamp
  note?: string;
  configSnapshot?: {
    stopLossPoints: number;
    targetPoints: number;
    rsiBuyThreshold: number;
    rsiSellThreshold: number;
    entryBufferPoints: number;
    maxTradesPerDay: number;
  };
}

export type OrderLegType =
  | 'ENTRY'
  | 'SL_MODIFY'
  | 'TARGET_EXIT'
  | 'SL_EXIT'
  | 'COST_EXIT'
  | 'EOD_EXIT'
  | 'RESTING_SL'
  | 'RESTING_TARGET';

export type OrderStatus = 'EXECUTED' | 'OPEN' | 'MODIFIED';

export interface RecordedOrder {
  id: string;
  tradeKey: string;
  tradeNumber: number;
  date: string; // YYYY-MM-DD IST
  time: string; // HH:MM IST
  symbol: string;
  side: 'BUY' | 'SELL';
  leg: OrderLegType;
  orderType:
    | 'SL-M BREAKOUT'
    | 'SL-M'
    | 'LIMIT TARGET'
    | 'MARKET EOD'
    | 'SL MODIFY';
  qty: number;
  price: number;
  triggerCondition: string;
  status: OrderStatus;
  source: PaperTradeSource;
  sessionLabel: string;
  recordedAt: string;
  configSummary: string;
}

export interface RecordedPosition {
  id: string;
  tradeKey: string;
  tradeNumber: number;
  date: string; // YYYY-MM-DD IST
  symbol: string;
  direction: 'LONG' | 'SHORT';
  qty: number;
  lots: number;
  lotSize: number;
  avgEntryPrice: number;
  ltpOrExitPrice: number;
  initialSlPrice: number;
  currentSlPrice: number;
  targetPrice: number;
  trailedToCost: boolean;
  status: 'OPEN' | 'CLOSED';
  exitReason: TradeExitReason;
  entryTime: string;
  exitTime?: string;
  signalTime: string;
  signalRsi: number;
  biasSetNumber: number;
  pnlPoints: number;
  pnlRupees: number;
  source: PaperTradeSource;
  sessionLabel: string;
  recordedAt: string;
  configSummary: string;
}

export interface OrderJournalPayload {
  orders: RecordedOrder[];
  positions: RecordedPosition[];
}

