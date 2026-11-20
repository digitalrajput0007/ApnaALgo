import React from 'react';
import {
  AlertTriangle,
  Calculator,
  RotateCcw,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { PaperWalletConfig, StrategyConfig } from '../types/strategy';
import { formatINR } from '../utils/formatters';
import {
  InstrumentMeta,
  RiskBasedLotCalculation,
} from '../utils/optionsEngine';

interface PaperWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: PaperWalletConfig;
  onUpdateWallet: (patch: Partial<PaperWalletConfig>) => void;
  onResetWallet: () => void;
  realizedPnl: number;
  todayRealizedPnl: number;
  liveOpenMtm: number;
  openPositionsCount: number;
  config: StrategyConfig;
  instrumentMeta: InstrumentMeta;
  lotCalculation: RiskBasedLotCalculation;
  liveOptionLtp: number | null;
  onApplyRecommendedLots?: (lots: number) => void;
  canEditStrategy?: boolean;
}

const CAPITAL_PRESETS = [
  { label: '₹50K', value: 50000 },
  { label: '₹1L', value: 100000 },
  { label: '₹2L', value: 200000 },
  { label: '₹5L', value: 500000 },
  { label: '₹10L', value: 1000000 },
];

export const PaperWalletModal: React.FC<PaperWalletModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onUpdateWallet,
  onResetWallet,
  realizedPnl,
  todayRealizedPnl,
  liveOpenMtm,
  openPositionsCount,
  config,
  instrumentMeta,
  lotCalculation,
  liveOptionLtp,
  onApplyRecommendedLots,
  canEditStrategy = true,
}) => {
  if (!isOpen) return null;

  const liveBalance = wallet.startingCapital + realizedPnl + liveOpenMtm;
  const totalPnl = realizedPnl + liveOpenMtm;
  const totalPnlPct =
    wallet.startingCapital > 0 ? (totalPnl / wallet.startingCapital) * 100 : 0;
  const todayNetPnl = todayRealizedPnl + liveOpenMtm;
  const dailyLossUsed = todayNetPnl < 0 ? Math.abs(todayNetPnl) : 0;
  const dailyLossPct =
    wallet.maxDailyLossRupees > 0
      ? Math.min(100, (dailyLossUsed / wallet.maxDailyLossRupees) * 100)
      : 0;
  const dailyLossBreached =
    wallet.maxDailyLossRupees > 0 && dailyLossUsed >= wallet.maxDailyLossRupees;

  const isOptionBuying = config.instrumentType === 'NIFTY_ATM_OPT';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-wallet-modal-title"
    >
      <div className="bg-white dark:bg-[#111622] border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Wallet
                className="w-4 h-4 text-blue-600 dark:text-blue-400"
                aria-hidden="true"
              />
            </div>
            <div>
              <h2
                id="paper-wallet-modal-title"
                className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                Paper Trading Wallet &amp; Risk Management
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Define virtual capital, risk per trade, and auto-calculate option
                buying lots
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Paper Wallet modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Live Wallet Balance Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="px-4 py-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Live Wallet Balance
              </div>
              <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100">
                {formatINR(liveBalance, { signed: false, decimals: 0 })}
              </div>
              <div
                className={`text-[11px] font-mono tabular-nums font-medium mt-0.5 ${
                  totalPnl > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : totalPnl < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {totalPnlPct >= 0 ? '+' : ''}
                {totalPnlPct.toFixed(2)}% overall
              </div>
            </div>

            <div className="px-4 py-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Starting Capital
              </div>
              <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-800 dark:text-slate-200">
                {formatINR(wallet.startingCapital, { signed: false, decimals: 0 })}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Paper virtual fund
              </div>
            </div>

            <div className="px-4 py-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Realized P&amp;L
              </div>
              <div
                className={`mt-1 font-mono tabular-nums text-base font-semibold ${
                  realizedPnl > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : realizedPnl < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {formatINR(realizedPnl, { signed: true, decimals: 0 })}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Closed trades
              </div>
            </div>

            <div className="px-4 py-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span>Live Open MTM</span>
                {openPositionsCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
              <div
                className={`mt-1 font-mono tabular-nums text-base font-semibold ${
                  liveOpenMtm > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : liveOpenMtm < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {formatINR(liveOpenMtm, { signed: true, decimals: 0 })}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {openPositionsCount} open position{openPositionsCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {/* Daily Loss Guard Bar */}
          <div
            className={`px-4 py-3 rounded-xl border ${
              dailyLossBreached
                ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
                : 'bg-slate-50 dark:bg-[#0E131D] border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                {dailyLossBreached ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                <span>Daily Loss Limit Guard</span>
              </span>
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                Today: {formatINR(todayNetPnl, { signed: true, decimals: 0 })} / Max
                Loss -{formatINR(wallet.maxDailyLossRupees, { signed: false, decimals: 0 })}
              </span>
            </div>
            <div className="mt-2 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  dailyLossBreached
                    ? 'bg-red-600'
                    : dailyLossPct > 65
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${dailyLossPct}%` }}
              />
            </div>
          </div>

          {/* Wallet & Risk Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Starting Capital */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Starting Paper Capital (₹)
              </label>
              <input
                type="number"
                min={5000}
                step={10000}
                value={wallet.startingCapital}
                onChange={(e) =>
                  onUpdateWallet({
                    startingCapital: Math.max(5000, Number(e.target.value) || 50000),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <div className="flex flex-wrap gap-1.5">
                {CAPITAL_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onUpdateWallet({ startingCapital: p.value })}
                    className={`px-2 py-1 text-[11px] font-mono rounded-md border transition-colors cursor-pointer ${
                      wallet.startingCapital === p.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-[#161D2B] text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Risk Per Trade Mode & Amount */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Risk Per Trade
                </label>
                <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-[#161D2B] rounded-md border border-slate-200 dark:border-slate-700 text-[10px]">
                  <button
                    type="button"
                    onClick={() => onUpdateWallet({ riskMode: 'FIXED_INR' })}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      wallet.riskMode === 'FIXED_INR'
                        ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Fixed ₹
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateWallet({ riskMode: 'PERCENT_CAPITAL' })
                    }
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                      wallet.riskMode === 'PERCENT_CAPITAL'
                        ? 'bg-white dark:bg-[#1F293B] text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    % Capital
                  </button>
                </div>
              </div>

              {wallet.riskMode === 'FIXED_INR' ? (
                <input
                  type="number"
                  min={100}
                  step={250}
                  value={wallet.riskPerTradeRupees}
                  onChange={(e) =>
                    onUpdateWallet({
                      riskPerTradeRupees: Math.max(
                        100,
                        Number(e.target.value) || 500
                      ),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              ) : (
                <input
                  type="number"
                  min={0.25}
                  max={20}
                  step={0.25}
                  value={wallet.riskPerTradePct}
                  onChange={(e) =>
                    onUpdateWallet({
                      riskPerTradePct: Math.max(
                        0.25,
                        Math.min(20, Number(e.target.value) || 1)
                      ),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              )}
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Allowed risk / trade:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {formatINR(lotCalculation.allowedRiskRupees, {
                    signed: false,
                    decimals: 0,
                  })}
                </strong>
              </div>
            </div>

            {/* Max Daily Loss */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Max Daily Loss Limit (₹)
              </label>
              <input
                type="number"
                min={500}
                step={500}
                value={wallet.maxDailyLossRupees}
                onChange={(e) =>
                  onUpdateWallet({
                    maxDailyLossRupees: Math.max(
                      500,
                      Number(e.target.value) || 2000
                    ),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            {/* Max Lots Cap */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Maximum Lots Cap
              </label>
              <input
                type="number"
                min={1}
                max={200}
                step={1}
                value={wallet.maxLotsCap}
                onChange={(e) =>
                  onUpdateWallet({
                    maxLotsCap: Math.max(
                      1,
                      Math.min(200, Math.floor(Number(e.target.value) || 1))
                    ),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 bg-white dark:bg-[#161D2B] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
          </div>

          {/* Live Position Sizing Calculator Preview */}
          <div className="bg-slate-50 dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <Calculator className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>
                  Auto Lot Sizing Preview · {instrumentMeta.displayName} (Lot{' '}
                  {config.lotSize})
                </span>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={wallet.autoSizeLots}
                  onChange={(e) =>
                    onUpdateWallet({ autoSizeLots: e.target.checked })
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600"
                />
                <span>Auto-apply lots from risk</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
              <div className="bg-white dark:bg-[#161D2B] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
                <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                  {isOptionBuying ? 'Option SL (Δ-Adjusted)' : 'Index SL'}
                </div>
                <div className="mt-0.5 font-semibold text-red-600 dark:text-red-400">
                  {lotCalculation.optionSlPoints} pts
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {config.stopLossPoints}pt ×{' '}
                  {isOptionBuying ? `${config.optionDeltaEstimate}Δ` : '1.0'}
                </div>
              </div>

              <div className="bg-white dark:bg-[#161D2B] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
                <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                  Risk per 1 Lot
                </div>
                <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                  {formatINR(lotCalculation.riskPerLotRupees, {
                    signed: false,
                    decimals: 0,
                  })}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {lotCalculation.optionSlPoints} × {config.lotSize} qty
                </div>
              </div>

              <div className="bg-white dark:bg-[#161D2B] border border-blue-200 dark:border-blue-500/40 rounded-lg px-3 py-2">
                <div className="text-[10px] font-sans text-blue-600 dark:text-blue-400 font-medium">
                  Calculated Lots
                </div>
                <div className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {lotCalculation.recommendedLots} lot
                  {lotCalculation.recommendedLots === 1 ? '' : 's'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {lotCalculation.recommendedLots * config.lotSize} qty · Risk{' '}
                  {formatINR(lotCalculation.totalRiskAtRecommendedLots, {
                    signed: false,
                    decimals: 0,
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-[#161D2B] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
                <div className="text-[10px] font-sans text-slate-500 dark:text-slate-400">
                  Est. Option Capital
                </div>
                <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                  {lotCalculation.totalCapitalRequired !== null
                    ? formatINR(lotCalculation.totalCapitalRequired, {
                        signed: false,
                        decimals: 0,
                      })
                    : '—'}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {liveOptionLtp
                    ? `@ ₹${liveOptionLtp.toFixed(1)} LTP`
                    : 'Connect feed for LTP'}
                </div>
              </div>
            </div>

            {(lotCalculation.cappedByCapital || lotCalculation.cappedByMaxLots) && (
              <div className="text-[11px] text-amber-700 dark:text-amber-300">
                {lotCalculation.cappedByCapital
                  ? 'Lots were capped to fit within your available Paper Wallet balance.'
                  : `Lots were capped at your Max Lots limit (${wallet.maxLotsCap}).`}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-[#0E131D] border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onResetWallet}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            {canEditStrategy &&
              onApplyRecommendedLots &&
              config.lots !== lotCalculation.recommendedLots && (
                <button
                  type="button"
                  onClick={() =>
                    onApplyRecommendedLots(lotCalculation.recommendedLots)
                  }
                  className="px-3.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-500/25 rounded-lg cursor-pointer"
                >
                  Apply {lotCalculation.recommendedLots} Lots Now
                </button>
              )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
