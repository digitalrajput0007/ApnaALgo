import React from 'react';
import { ArrowRight } from 'lucide-react';
import { StrategyConfig } from '../types/strategy';

interface ModificationGuideProps {
  config: StrategyConfig;
  onJumpToCode: () => void;
}

export const ModificationGuide: React.FC<ModificationGuideProps> = ({
  config,
  onJumpToCode,
}) => {
  const codePill =
    'bg-slate-100 dark:bg-[#161D2B] text-slate-800 dark:text-slate-200 px-1 py-0.5 rounded font-mono';

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Modifying Your Existing Fyers Neo Algo
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
            Because Fyers authentication and WebSocket connectivity are already
            configured in your existing Neo Algo, keep your auth/token layer
            intact and replace only the signal generator and order-management
            hooks with the 4-Candle Bias and RSI({config.rsiLength}) state
            machine.
          </p>
        </div>

        <button
          type="button"
          onClick={onJumpToCode}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Open Generated Code</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Section 1: Architecture Swap Table */}
      <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            01. What to Keep vs. Replace in Neo Algo
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E131D] text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-6">Neo Algo Module</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-6">Implementation Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              <tr>
                <td className="py-3.5 px-6 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  Fyers Auth &amp; Access Token
                </td>
                <td className="py-3.5 px-4 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  Keep As-Is
                </td>
                <td className="py-3.5 px-6 text-slate-600 dark:text-slate-400 leading-relaxed">
                  Do not alter your TOTP login, app_id, or daily{' '}
                  <code className={codePill}>access_token</code> generator.
                  Simply pass the initialized{' '}
                  <code className={codePill}>fyersModel.FyersModel</code>{' '}
                  instance into{' '}
                  <code className={codePill}>
                    NiftyFourCandleRsi2NeoStrategy(fyers)
                  </code>
                  .
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-6 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  FyersDataSocket Tick Listener
                </td>
                <td className="py-3.5 px-4 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                  Wire Hook
                </td>
                <td className="py-3.5 px-6 text-slate-600 dark:text-slate-400 leading-relaxed">
                  Subscribe to{' '}
                  <code className={codePill}>NSE:NIFTY50-INDEX</code> and
                  forward every incoming <code className={codePill}>ltp</code> to{' '}
                  <code className={codePill}>strategy.on_tick(ltp)</code>.
                  Filter out pre-market ticks before{' '}
                  <code className={codePill}>09:15 IST</code>.
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-6 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  Old Signal / Indicator Logic
                </td>
                <td className="py-3.5 px-4 font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                  Replace
                </td>
                <td className="py-3.5 px-6 text-slate-600 dark:text-slate-400 leading-relaxed">
                  Replace your prior entry rules with the 4-Candle Set evaluator
                  ({config.requiredMajority}/{config.setSize} majority) + Wilder
                  RSI({config.rsiLength}) thresholds (&lt;{' '}
                  {config.rsiBuyThreshold} / &gt; {config.rsiSellThreshold}) +
                  previous candle High/Low breakout trigger.
                </td>
              </tr>
              <tr>
                <td className="py-3.5 px-6 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  SL &amp; Trailing Manager
                </td>
                <td className="py-3.5 px-4 font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                  Replace
                </td>
                <td className="py-3.5 px-6 text-slate-600 dark:text-slate-400 leading-relaxed">
                  Store the returned{' '}
                  <code className={codePill}>sl_order_id</code> when placing the
                  strict {config.stopLossPoints}-pt protective SL-M order. On
                  tick reaching 1:1 (+{config.stopLossPoints} pts), call{' '}
                  <code className={codePill}>fyers.modify_order()</code> to move{' '}
                  <code className={codePill}>stopPrice</code> to{' '}
                  <code className={codePill}>entry_price</code>.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Critical Indian Market Implementation Nuances */}
      <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
        <div className="px-6 py-4">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            02. Critical Production Guards for NSE NIFTY
          </h2>
        </div>

        <div className="px-6 py-5 grid md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              1. Spot vs. Option Premium Point Scaling
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Your 4-candle bias and RSI(2) signals should always be computed on{' '}
              <strong className="text-slate-900 dark:text-slate-200">
                NIFTY 50 Spot Index
              </strong>{' '}
              (<code className={codePill}>NSE:NIFTY50-INDEX</code>) so wick
              noise from option illiquidity does not distort RSI(2). However,
              when executing{' '}
              <strong className="text-slate-900 dark:text-slate-200">
                ATM Options (CE/PE)
              </strong>
              , a 20-point move on NIFTY Spot translates to roughly 10–11 points
              on an ATM option (delta ~0.52). Decide explicitly whether your{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-200">
                {config.stopLossPoints} pt SL / {config.targetPoints} pt Target
              </strong>{' '}
              is measured on Spot Index (recommended for exact chart sync) or
              directly on the Option premium.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              2. Exact 09:15 IST 5-Minute Bucket Alignment
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              NSE opens at <code className={codePill}>09:15:00 IST</code>, and
              pre-open price discovery ticks arrive between{' '}
              <code className={codePill}>09:07–09:08</code>. Ensure your candle
              aggregator ignores ticks prior to{' '}
              <code className={codePill}>09:15:00</code> so Set 1 always
              contains strictly{' '}
              <code className={codePill}>09:15, 09:20, 09:25, 09:30</code>. A
              single pre-open tick can corrupt Candle #1&apos;s Open and flip a
              Red/Green count.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              3. Fyers Wilder RSI(2) Warm-Up Seed
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Wilder&apos;s RSI(2) relies on exponential smoothing. At market open
              (<code className={codePill}>09:15</code>), fetch the last 30
              candles of 5-min history once via{' '}
              <code className={codePill}>fyers.history()</code> before starting
              the WebSocket loop and feed those closes into{' '}
              <code className={codePill}>_update_wilder_rsi()</code>. This
              guarantees your RSI(2) matches TradingView and Fyers Web to the
              second decimal by Set 2 (<code className={codePill}>09:35</code>).
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              4. Re-Entry Only After SL &amp; Stop After Target Hit
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Once{' '}
              <strong className="text-slate-900 dark:text-slate-200">
                any trade hits Target
              </strong>{' '}
              (1st, 2nd, or 3rd),{' '}
              <code className={codePill}>target_hit_today</code> halts all
              further entries for the day. Re-entries happen only after a
              stoploss exit, verified via{' '}
              <code className={codePill}>fyers.orderbook()</code> and capped by{' '}
              <code className={codePill}>max_trades_per_day</code> (currently{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-200">
                {config.maxTradesPerDay}
              </strong>
              ).
            </p>
          </div>
        </div>
      </div>

      {/* Section 3: Integration Snippet */}
      <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            03. Wiring Into Your Existing Neo Algo Runner
          </h2>
        </div>
        <pre className="p-5 bg-[#080C14] text-slate-200 text-xs font-mono leading-relaxed overflow-x-auto">
          <code>{`from neo_nifty_4candle_rsi2 import NiftyFourCandleRsi2NeoStrategy

# 1. Keep your existing Neo Algo Fyers initialization:
# fyers = fyersModel.FyersModel(client_id=client_id, token=access_token, ...)

strategy = NiftyFourCandleRsi2NeoStrategy(
    fyers_client=fyers,
    signal_symbol="NSE:NIFTY50-INDEX",
    trade_symbol="NSE:NIFTY26NOVFUT",  # or dynamic ATM CE/PE symbol
    qty=${config.lotSize * config.lots},
    sl_points=${config.stopLossPoints},
    target_points=${config.targetPoints},
    trail_to_cost=${config.trailToCostAtOneToOne ? 'True' : 'False'},
    stop_after_target_hit=${config.stopAfterTargetHit ? 'True' : 'False'},
    paper_mode=True,  # Switch to False only after verifying paper logs
)

# 2. Inside your existing FyersDataSocket on_message(message) callback:
def on_message(message):
    if message.get("symbol") == "NSE:NIFTY50-INDEX" and "ltp" in message:
        strategy.on_tick(float(message["ltp"]))`}</code>
        </pre>
      </div>
    </div>
  );
};
