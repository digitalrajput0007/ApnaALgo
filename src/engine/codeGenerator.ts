import { StrategyConfig } from '../types/strategy';

export function generatePythonNeoAlgo(config: StrategyConfig): string {
  const qty = config.lotSize * config.lots;
  const spotVsOptNote =
    config.instrumentType === 'NIFTY_ATM_OPT'
      ? `Option Buying Mode (Delta ~${config.optionDeltaEstimate.toFixed(2)}): Monitor ${config.stopLossPoints}pt SL & ${config.targetPoints}pt Target on NIFTY Index Spot, or scale option premium SL/Target accordingly.`
      : `Index/Futures Mode: ${config.stopLossPoints}pt SL & ${config.targetPoints}pt Target tracked directly on execution symbol.`;

  return `"""
Neo Algo Extension: NIFTY 5-Min 4-Candle Bias + Wilder RSI(${config.rsiLength}) Strategy
Compatible with existing Fyers API v3 (fyers-apiv3) authentication & Neo Algo runner.

Generated Parameters:
- Timeframe            : ${config.timeframeMinutes} min (09:15 IST aligned)
- Bias Rule            : >= ${config.requiredMajority} of ${config.setSize} candles same color (2G/2R skips to next set)
- Bias Mode            : ${config.biasMode}
- RSI(${config.rsiLength}) Buy Zone    : < ${config.rsiBuyThreshold}
- RSI(${config.rsiLength}) Sell Zone   : > ${config.rsiSellThreshold}
- Entry Buffer         : ${config.entryBufferPoints} points
- Strict Stop Loss     : ${config.stopLossPoints} points
- Target               : ${config.targetPoints} points
- Max Trades / Day     : ${config.maxTradesPerDay}
- Stop After Target    : ${config.stopAfterTargetHit ? 'ENABLED (No more trades once any trade hits Target; re-enter only on SL)' : 'DISABLED'}
- 1:1 Trail to Cost    : ${config.trailToCostAtOneToOne ? 'ENABLED' : 'DISABLED'} (SL moves to Entry at +${config.stopLossPoints} pts)
- Quantity             : ${qty} (${config.lots} lot(s) x ${config.lotSize})
- ${spotVsOptNote}
"""

from dataclasses import dataclass
from datetime import datetime, time as dtime
from typing import List, Optional, Literal
from zoneinfo import ZoneInfo

# Uses your already-configured Fyers client from Neo Algo:
# from fyers_apiv3 import fyersModel
# from fyers_apiv3.FyersWebsocket import data_ws

IST = ZoneInfo("Asia/Kolkata")
BiasType = Literal["PENDING", "BULLISH", "BEARISH"]


@dataclass
class Candle:
    bucket_start: datetime
    open: float
    high: float
    low: float
    close: float

    @property
    def color(self) -> Literal["GREEN", "RED", "DOJI"]:
        if self.close > self.open:
            return "GREEN"
        if self.close < self.open:
            return "RED"
        return "DOJI"


@dataclass
class ArmedSetup:
    direction: Literal["LONG", "SHORT"]
    raw_base_level: float
    trigger_level: float
    signal_rsi: float
    signal_time: datetime


@dataclass
class ActivePosition:
    direction: Literal["LONG", "SHORT"]
    symbol: str
    qty: int
    entry_price: float
    sl_price: float
    target_price: float
    trailed_to_cost: bool = False
    sl_order_id: Optional[str] = None
    target_order_id: Optional[str] = None


class NiftyFourCandleRsi2NeoStrategy:
    """
    Drop-in strategy module for an existing Fyers-authenticated Neo Algo setup.
    Pass your initialized fyers (FyersModel) instance directly into __init__.
    """

    def __init__(
        self,
        fyers_client,
        signal_symbol: str = "NSE:NIFTY50-INDEX",
        trade_symbol: str = "NSE:NIFTY26NOVFUT",  # Or resolve ATM CE/PE dynamically
        qty: int = ${qty},
        set_size: int = ${config.setSize},
        required_majority: int = ${config.requiredMajority},
        rsi_length: int = ${config.rsiLength},
        rsi_buy_zone: float = ${config.rsiBuyThreshold},
        rsi_sell_zone: float = ${config.rsiSellThreshold},
        entry_buffer_points: float = ${config.entryBufferPoints},
        sl_points: float = ${config.stopLossPoints},
        target_points: float = ${config.targetPoints},
        trail_to_cost: bool = ${config.trailToCostAtOneToOne ? 'True' : 'False'},
        update_trigger_in_zone: bool = ${config.updateTriggerWhileInRsiZone ? 'True' : 'False'},
        bias_mode: str = "${config.biasMode}",
        max_trades_per_day: int = ${config.maxTradesPerDay},
        stop_after_target_hit: bool = ${config.stopAfterTargetHit ? 'True' : 'False'},
        square_off_hhmm: str = "${config.squareOffTime}",
        paper_mode: bool = True,
    ):
        self.fyers = fyers_client
        self.signal_symbol = signal_symbol
        self.trade_symbol = trade_symbol
        self.qty = qty
        self.set_size = set_size
        self.required_majority = required_majority
        self.rsi_length = rsi_length
        self.rsi_buy_zone = rsi_buy_zone
        self.rsi_sell_zone = rsi_sell_zone
        self.entry_buffer_points = entry_buffer_points
        self.sl_points = sl_points
        self.target_points = target_points
        self.trail_to_cost = trail_to_cost
        self.update_trigger_in_zone = update_trigger_in_zone
        self.bias_mode = bias_mode
        self.max_trades_per_day = max_trades_per_day
        self.stop_after_target_hit = stop_after_target_hit
        h, m = map(int, square_off_hhmm.split(":"))
        self.square_off_time = dtime(h, m)
        self.paper_mode = paper_mode

        # Internal state
        self.closed_candles: List[Candle] = []
        self.current_candle: Optional[Candle] = None
        self.bias: BiasType = "PENDING"
        self.armed_setup: Optional[ArmedSetup] = None
        self.position: Optional[ActivePosition] = None
        self.trades_today: int = 0
        self.target_hit_today: bool = False

        # Wilder's RSI(2) state
        self._avg_gain: Optional[float] = None
        self._avg_loss: Optional[float] = None
        self.current_rsi: Optional[float] = None

    def _get_5m_bucket(self, dt: datetime) -> datetime:
        """Align timestamps to 09:15 IST 5-minute candle boundaries."""
        dt_ist = dt.astimezone(IST)
        minute_floor = (dt_ist.minute // ${config.timeframeMinutes}) * ${config.timeframeMinutes}
        return dt_ist.replace(minute=minute_floor, second=0, microsecond=0)

    def _update_wilder_rsi(self, closes: List[float]) -> Optional[float]:
        """Exact Wilder's RSI matching TradingView and Fyers charts."""
        n = self.rsi_length
        if len(closes) <= n:
            return None

        if self._avg_gain is None or self._avg_loss is None:
            gains, losses = [], []
            for i in range(1, n + 1):
                diff = closes[i] - closes[i - 1]
                gains.append(max(diff, 0.0))
                losses.append(abs(min(diff, 0.0)))
            self._avg_gain = sum(gains) / n
            self._avg_loss = sum(losses) / n
        else:
            diff = closes[-1] - closes[-2]
            gain = max(diff, 0.0)
            loss = abs(min(diff, 0.0))
            self._avg_gain = ((self._avg_gain * (n - 1)) + gain) / n
            self._avg_loss = ((self._avg_loss * (n - 1)) + loss) / n

        if self._avg_loss == 0 and self._avg_gain == 0:
            return 50.0
        if self._avg_loss == 0:
            return 100.0
        if self._avg_gain == 0:
            return 0.0
        rs = self._avg_gain / self._avg_loss
        return round(100.0 - (100.0 / (1.0 + rs)), 2)

    def on_tick(self, ltp: float, tick_time: Optional[datetime] = None) -> None:
        """
        Hook this directly into your existing FyersDataSocket on_message callback
        whenever a tick arrives for self.signal_symbol.
        """
        now = (tick_time or datetime.now(IST)).astimezone(IST)
        if now.time() < dtime(9, 15):
            return

        # 1. Square-off guard
        if now.time() >= self.square_off_time:
            if self.position:
                self._close_position(ltp, reason="EOD_SQUARE_OFF")
            self.armed_setup = None
            return

        # 2. Live intrabar management for open trade (SL, 1:1 Cost Trail, Target)
        if self.position:
            self._manage_open_position_tick(ltp)

        # 3. Live intrabar breakout entry check when RSI(2) setup is armed
        if (
            not self.position
            and not self.target_hit_today
            and self.armed_setup
            and self.trades_today < self.max_trades_per_day
        ):
            long_hit = ltp >= self.armed_setup.trigger_level if self.entry_buffer_points > 0 else ltp > self.armed_setup.trigger_level
            short_hit = ltp <= self.armed_setup.trigger_level if self.entry_buffer_points > 0 else ltp < self.armed_setup.trigger_level
            if self.armed_setup.direction == "LONG" and long_hit:
                self._enter_trade("LONG", ltp)
                self.armed_setup = None
            elif self.armed_setup.direction == "SHORT" and short_hit:
                self._enter_trade("SHORT", ltp)
                self.armed_setup = None

        # 4. Build / close 5-minute candle
        bucket = self._get_5m_bucket(now)
        if self.current_candle is None:
            self.current_candle = Candle(bucket, ltp, ltp, ltp, ltp)
            return

        if bucket == self.current_candle.bucket_start:
            self.current_candle.high = max(self.current_candle.high, ltp)
            self.current_candle.low = min(self.current_candle.low, ltp)
            self.current_candle.close = ltp
        else:
            # Previous 5m candle just closed!
            closed = self.current_candle
            self.closed_candles.append(closed)
            self._on_candle_close(closed)
            self.current_candle = Candle(bucket, ltp, ltp, ltp, ltp)

    def _on_candle_close(self, candle: Candle) -> None:
        closes = [c.close for c in self.closed_candles]
        self.current_rsi = self._update_wilder_rsi(closes)

        # Phase A: Evaluate 4-Candle Set Bias on every 4th completed candle
        total = len(self.closed_candles)
        if total % self.set_size == 0:
            should_eval = self.bias == "PENDING" or (
                self.bias_mode == "ROLLING_SETS" and self.position is None
            )
            if should_eval:
                block = self.closed_candles[-self.set_size:]
                greens = sum(1 for c in block if c.color == "GREEN")
                reds = sum(1 for c in block if c.color == "RED")

                if greens >= self.required_majority:
                    if self.bias != "BULLISH":
                        self.armed_setup = None
                    self.bias = "BULLISH"
                    print(f"[BIAS] {candle.bucket_start:%H:%M} BULLISH ({greens}G/{reds}R)")
                elif reds >= self.required_majority:
                    if self.bias != "BEARISH":
                        self.armed_setup = None
                    self.bias = "BEARISH"
                    print(f"[BIAS] {candle.bucket_start:%H:%M} BEARISH ({reds}R/{greens}G)")
                else:
                    print(f"[BIAS] {candle.bucket_start:%H:%M} SKIPPED ({greens}G/{reds}R) -> Next set")

        # Phase B: Trail base candle on Lower High (LONG) / Higher Low (SHORT) or arm on RSI(2)
        if self.position or self.bias == "PENDING" or self.target_hit_today:
            return
        if self.trades_today >= self.max_trades_per_day:
            return

        if self.armed_setup is not None:
            if (
                self.armed_setup.direction == "LONG"
                and self.update_trigger_in_zone
                and candle.high < self.armed_setup.raw_base_level
            ):
                trigger_lvl = round(candle.high + self.entry_buffer_points, 2)
                self.armed_setup.raw_base_level = candle.high
                self.armed_setup.trigger_level = trigger_lvl
                self.armed_setup.signal_time = candle.bucket_start
                print(
                    f"[BASE SHIFT LONG] {candle.bucket_start:%H:%M} Lower High {candle.high} -> "
                    f"New Trigger >= {trigger_lvl}"
                )
            elif (
                self.armed_setup.direction == "SHORT"
                and self.update_trigger_in_zone
                and candle.low > self.armed_setup.raw_base_level
            ):
                trigger_lvl = round(candle.low - self.entry_buffer_points, 2)
                self.armed_setup.raw_base_level = candle.low
                self.armed_setup.trigger_level = trigger_lvl
                self.armed_setup.signal_time = candle.bucket_start
                print(
                    f"[BASE SHIFT SHORT] {candle.bucket_start:%H:%M} Higher Low {candle.low} -> "
                    f"New Trigger <= {trigger_lvl}"
                )
            return

        if self.current_rsi is None:
            return

        if self.bias == "BULLISH" and self.current_rsi < self.rsi_buy_zone:
            trigger_lvl = round(candle.high + self.entry_buffer_points, 2)
            self.armed_setup = ArmedSetup(
                direction="LONG",
                raw_base_level=candle.high,
                trigger_level=trigger_lvl,
                signal_rsi=self.current_rsi,
                signal_time=candle.bucket_start,
            )
            print(
                f"[ARMED LONG] {candle.bucket_start:%H:%M} RSI(2)={self.current_rsi} < {self.rsi_buy_zone} | "
                f"Trigger >= {trigger_lvl} (High {candle.high} + {self.entry_buffer_points} buf)"
            )

        elif self.bias == "BEARISH" and self.current_rsi > self.rsi_sell_zone:
            trigger_lvl = round(candle.low - self.entry_buffer_points, 2)
            self.armed_setup = ArmedSetup(
                direction="SHORT",
                raw_base_level=candle.low,
                trigger_level=trigger_lvl,
                signal_rsi=self.current_rsi,
                signal_time=candle.bucket_start,
            )
            print(
                f"[ARMED SHORT] {candle.bucket_start:%H:%M} RSI(2)={self.current_rsi} > {self.rsi_sell_zone} | "
                f"Trigger <= {trigger_lvl} (Low {candle.low} - {self.entry_buffer_points} buf)"
            )

    def _enter_trade(self, direction: Literal["LONG", "SHORT"], ltp: float) -> None:
        self.trades_today += 1
        sl = ltp - self.sl_points if direction == "LONG" else ltp + self.sl_points
        tgt = ltp + self.target_points if direction == "LONG" else ltp - self.target_points
        side = 1 if direction == "LONG" else -1

        sl_order_id = None
        if not self.paper_mode:
            # 1. Place Market Entry Order on Fyers
            entry_resp = self.fyers.place_order({
                "symbol": self.trade_symbol,
                "qty": self.qty,
                "type": 2,           # 2 = Market
                "side": side,        # 1 = Buy, -1 = Sell
                "productType": "INTRADAY",
                "validity": "DAY",
            })
            print("[FYERS ENTRY]", entry_resp)

            # 2. Place Strict Protective SL-M Order on Fyers
            sl_resp = self.fyers.place_order({
                "symbol": self.trade_symbol,
                "qty": self.qty,
                "type": 3,           # 3 = SL-M
                "side": -side,
                "productType": "INTRADAY",
                "stopPrice": round(sl, 1),
                "validity": "DAY",
            })
            sl_order_id = sl_resp.get("id")
            print("[FYERS SL]", sl_resp)

        self.position = ActivePosition(
            direction=direction,
            symbol=self.trade_symbol,
            qty=self.qty,
            entry_price=ltp,
            sl_price=sl,
            target_price=tgt,
            sl_order_id=sl_order_id,
        )
        print(f"[ENTRY #{self.trades_today}] {direction} @ {ltp:.2f} | SL={sl:.2f} | TGT={tgt:.2f}")

    def _manage_open_position_tick(self, ltp: float) -> None:
        pos = self.position
        if not pos:
            return

        if pos.direction == "LONG":
            # 1:1 Trail SL to Cost
            if self.trail_to_cost and not pos.trailed_to_cost and ltp >= pos.entry_price + self.sl_points:
                pos.trailed_to_cost = True
                pos.sl_price = pos.entry_price
                self._modify_fyers_sl_to_cost(pos)

            if ltp <= pos.sl_price:
                self._close_position(ltp, reason="COST_SL_HIT" if pos.trailed_to_cost else "STRICT_SL_HIT")
            elif ltp >= pos.target_price:
                self._close_position(ltp, reason="TARGET_HIT")
        else:
            if self.trail_to_cost and not pos.trailed_to_cost and ltp <= pos.entry_price - self.sl_points:
                pos.trailed_to_cost = True
                pos.sl_price = pos.entry_price
                self._modify_fyers_sl_to_cost(pos)

            if ltp >= pos.sl_price:
                self._close_position(ltp, reason="COST_SL_HIT" if pos.trailed_to_cost else "STRICT_SL_HIT")
            elif ltp <= pos.target_price:
                self._close_position(ltp, reason="TARGET_HIT")

    def _modify_fyers_sl_to_cost(self, pos: ActivePosition) -> None:
        print(f"[TRAIL TO COST] 1:1 Reached! Moving SL to Entry {pos.entry_price:.2f}")
        if not self.paper_mode and pos.sl_order_id:
            resp = self.fyers.modify_order({
                "id": pos.sl_order_id,
                "type": 3,
                "stopPrice": round(pos.entry_price, 1),
                "qty": pos.qty,
            })
            print("[FYERS MODIFY SL]", resp)

    def _close_position(self, ltp: float, reason: str) -> None:
        pos = self.position
        if not pos:
            return
        pnl = (ltp - pos.entry_price) if pos.direction == "LONG" else (pos.entry_price - ltp)
        print(f"[EXIT: {reason}] {pos.direction} @ {ltp:.2f} | PnL: {pnl:+.2f} pts")

        if not self.paper_mode:
            if pos.sl_order_id and reason in ("TARGET_HIT", "EOD_SQUARE_OFF"):
                self.fyers.cancel_order({"id": pos.sl_order_id})
            if reason in ("TARGET_HIT", "EOD_SQUARE_OFF"):
                self.fyers.place_order({
                    "symbol": pos.symbol,
                    "qty": pos.qty,
                    "type": 2,
                    "side": -1 if pos.direction == "LONG" else 1,
                    "productType": "INTRADAY",
                    "validity": "DAY",
                })
        self.position = None
        if reason == "TARGET_HIT" and self.stop_after_target_hit:
            self.target_hit_today = True
            self.armed_setup = None
            print("[DAY COMPLETE] Target achieved — halting further entries for today.")
`;
}

export function generateTypeScriptNeoAlgo(config: StrategyConfig): string {
  const qty = config.lotSize * config.lots;
  return `/**
 * Neo Algo TypeScript Module (Node.js / fyers-api-v3)
 * NIFTY ${config.timeframeMinutes}m 4-Candle Bias + Wilder RSI(${config.rsiLength}) Strategy
 */

export interface NeoCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface NeoPosition {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  slPrice: number;
  targetPrice: number;
  trailedToCost: boolean;
  slOrderId?: string;
}

export class NiftyNeoStrategy {
  private candles: NeoCandle[] = [];
  private bias: 'PENDING' | 'BULLISH' | 'BEARISH' = 'PENDING';
  private armedTrigger: { direction: 'LONG' | 'SHORT'; rawBase: number; level: number } | null = null;
  private position: NeoPosition | null = null;
  private avgGain: number | null = null;
  private avgLoss: number | null = null;
  private tradesToday = 0;
  private targetHitToday = false;

  constructor(
    private readonly fyers: {
      place_order: (payload: Record<string, unknown>) => Promise<{ id?: string }>;
      modify_order: (payload: Record<string, unknown>) => Promise<unknown>;
      cancel_order: (payload: Record<string, unknown>) => Promise<unknown>;
    },
    private readonly tradeSymbol = 'NSE:NIFTY26NOVFUT',
    private readonly qty = ${qty},
    private readonly paperMode = true
  ) {}

  private updateWilderRsi(closes: number[]): number | null {
    const n = ${config.rsiLength};
    if (closes.length <= n) return null;

    if (this.avgGain === null || this.avgLoss === null) {
      let g = 0;
      let l = 0;
      for (let i = 1; i <= n; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) g += diff;
        else l += Math.abs(diff);
      }
      this.avgGain = g / n;
      this.avgLoss = l / n;
    } else {
      const diff = closes[closes.length - 1] - closes[closes.length - 2];
      this.avgGain = (this.avgGain * (n - 1) + Math.max(diff, 0)) / n;
      this.avgLoss = (this.avgLoss * (n - 1) + Math.abs(Math.min(diff, 0))) / n;
    }

    if (this.avgLoss === 0) return this.avgGain === 0 ? 50 : 100;
    const rs = this.avgGain / this.avgLoss;
    return Number((100 - 100 / (1 + rs)).toFixed(2));
  }

  public async onTick(ltp: number): Promise<void> {
    if (this.position) {
      await this.manageOpenPosition(ltp);
    }

    if (
      !this.position &&
      !this.targetHitToday &&
      this.armedTrigger &&
      this.tradesToday < ${config.maxTradesPerDay}
    ) {
      const longHit = ${config.entryBufferPoints} > 0 ? ltp >= this.armedTrigger.level : ltp > this.armedTrigger.level;
      const shortHit = ${config.entryBufferPoints} > 0 ? ltp <= this.armedTrigger.level : ltp < this.armedTrigger.level;
      if (this.armedTrigger.direction === 'LONG' && longHit) {
        await this.enterTrade('LONG', ltp);
        this.armedTrigger = null;
      } else if (this.armedTrigger.direction === 'SHORT' && shortHit) {
        await this.enterTrade('SHORT', ltp);
        this.armedTrigger = null;
      }
    }
  }

  public on5MinCandleClose(candle: NeoCandle): void {
    this.candles.push(candle);
    const rsi2 = this.updateWilderRsi(this.candles.map((c) => c.close));

    if (this.candles.length % ${config.setSize} === 0) {
      const shouldEval =
        this.bias === 'PENDING' || (${config.biasMode === 'ROLLING_SETS'} && !this.position);

      if (shouldEval) {
        const block = this.candles.slice(-${config.setSize});
        const greens = block.filter((c) => c.close > c.open).length;
        const reds = block.filter((c) => c.close < c.open).length;

        if (greens >= ${config.requiredMajority}) {
          this.bias = 'BULLISH';
        } else if (reds >= ${config.requiredMajority}) {
          this.bias = 'BEARISH';
        }
      }
    }

    if (this.position || this.bias === 'PENDING' || this.targetHitToday) return;

    if (this.armedTrigger) {
      if (this.armedTrigger.direction === 'LONG' && ${config.updateTriggerWhileInRsiZone} && candle.high < this.armedTrigger.rawBase) {
        this.armedTrigger = {
          direction: 'LONG',
          rawBase: candle.high,
          level: Number((candle.high + ${config.entryBufferPoints}).toFixed(2)),
        };
      } else if (this.armedTrigger.direction === 'SHORT' && ${config.updateTriggerWhileInRsiZone} && candle.low > this.armedTrigger.rawBase) {
        this.armedTrigger = {
          direction: 'SHORT',
          rawBase: candle.low,
          level: Number((candle.low - ${config.entryBufferPoints}).toFixed(2)),
        };
      }
      return;
    }

    if (rsi2 === null) return;

    if (this.bias === 'BULLISH' && rsi2 < ${config.rsiBuyThreshold}) {
      this.armedTrigger = {
        direction: 'LONG',
        rawBase: candle.high,
        level: Number((candle.high + ${config.entryBufferPoints}).toFixed(2)),
      };
    } else if (this.bias === 'BEARISH' && rsi2 > ${config.rsiSellThreshold}) {
      this.armedTrigger = {
        direction: 'SHORT',
        rawBase: candle.low,
        level: Number((candle.low - ${config.entryBufferPoints}).toFixed(2)),
      };
    }
  }

  private async enterTrade(direction: 'LONG' | 'SHORT', ltp: number): Promise<void> {
    this.tradesToday += 1;
    const slPrice =
      direction === 'LONG' ? ltp - ${config.stopLossPoints} : ltp + ${config.stopLossPoints};
    const targetPrice =
      direction === 'LONG' ? ltp + ${config.targetPoints} : ltp - ${config.targetPoints};
    const side = direction === 'LONG' ? 1 : -1;

    let slOrderId: string | undefined;
    if (!this.paperMode) {
      await this.fyers.place_order({
        symbol: this.tradeSymbol,
        qty: this.qty,
        type: 2,
        side,
        productType: 'INTRADAY',
        validity: 'DAY',
      });
      const slRes = await this.fyers.place_order({
        symbol: this.tradeSymbol,
        qty: this.qty,
        type: 3,
        side: -side,
        productType: 'INTRADAY',
        stopPrice: Number(slPrice.toFixed(1)),
        validity: 'DAY',
      });
      slOrderId = slRes?.id;
    }

    this.position = {
      direction,
      entryPrice: ltp,
      slPrice,
      targetPrice,
      trailedToCost: false,
      slOrderId,
    };
  }

  private async manageOpenPosition(ltp: number): Promise<void> {
    const pos = this.position;
    if (!pos) return;

    const reachedOneToOne =
      pos.direction === 'LONG'
        ? ltp >= pos.entryPrice + ${config.stopLossPoints}
        : ltp <= pos.entryPrice - ${config.stopLossPoints};

    if (${config.trailToCostAtOneToOne} && !pos.trailedToCost && reachedOneToOne) {
      pos.trailedToCost = true;
      pos.slPrice = pos.entryPrice;
      if (!this.paperMode && pos.slOrderId) {
        await this.fyers.modify_order({
          id: pos.slOrderId,
          type: 3,
          stopPrice: Number(pos.entryPrice.toFixed(1)),
          qty: this.qty,
        });
      }
    }

    const hitSl = pos.direction === 'LONG' ? ltp <= pos.slPrice : ltp >= pos.slPrice;
    const hitTarget = pos.direction === 'LONG' ? ltp >= pos.targetPrice : ltp <= pos.targetPrice;

    if (hitSl || hitTarget) {
      if (!this.paperMode && hitTarget) {
        if (pos.slOrderId) await this.fyers.cancel_order({ id: pos.slOrderId });
        await this.fyers.place_order({
          symbol: this.tradeSymbol,
          qty: this.qty,
          type: 2,
          side: pos.direction === 'LONG' ? -1 : 1,
          productType: 'INTRADAY',
          validity: 'DAY',
        });
      }
      this.position = null;
      if (hitTarget && ${config.stopAfterTargetHit}) {
        this.targetHitToday = true;
        this.armedTrigger = null;
      }
    }
  }
}
`;
}
