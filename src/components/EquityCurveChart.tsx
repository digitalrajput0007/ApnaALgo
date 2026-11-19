import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BacktestResult, StrategyConfig } from '../types/strategy';

interface EquityCurveChartProps {
  result: BacktestResult;
  config: StrategyConfig;
}

interface EquityPoint {
  index: number;
  time: string;
  equityPoints: number;
  realizedPoints: number;
  floatingPoints: number;
  equityRupees: number;
  drawdownPoints: number;
  note: string | null;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({
  result,
  config,
}) => {
  const [unit, setUnit] = useState<'points' | 'rupees'>('points');

  const multiplier = useMemo(() => {
    const base = config.lotSize * config.lots;
    return config.instrumentType === 'NIFTY_ATM_OPT'
      ? base * config.optionDeltaEstimate
      : base;
  }, [config]);

  const { series, peakPoints, troughPoints, maxDdPoints, zeroOffset } =
    useMemo(() => {
      const points: EquityPoint[] = [];
      let peak = 0;
      let maxVal = 0;
      let minVal = 0;
      let maxDd = 0;

      for (let i = 0; i < result.candles.length; i++) {
        const candle = result.candles[i];
        let realized = 0;
        let floating = 0;
        let note: string | null = null;

        for (const t of result.trades) {
          if (t.exitCandleIndex !== undefined && t.exitCandleIndex <= i) {
            realized += t.pnlPoints;
            if (t.exitCandleIndex === i) {
              note =
                t.exitReason === 'TARGET_HIT'
                  ? `Trade #${t.id} Target (+${t.pnlPoints.toFixed(1)} pts)`
                  : t.exitReason === 'STRICT_SL_HIT'
                  ? `Trade #${t.id} Strict SL (${t.pnlPoints.toFixed(1)} pts)`
                  : t.exitReason === 'TRAILED_COST_EXIT'
                  ? `Trade #${t.id} Cost SL Exit (0.0 pts)`
                  : `Trade #${t.id} Exit (${t.pnlPoints.toFixed(1)} pts)`;
            }
          } else if (
            t.entryCandleIndex <= i &&
            (t.exitCandleIndex === undefined || t.exitCandleIndex > i)
          ) {
            floating +=
              t.direction === 'LONG'
                ? candle.close - t.entryPrice
                : t.entryPrice - candle.close;
            if (t.trailCandleIndex === i) {
              note = `Trade #${t.id} SL Trailed to Cost`;
            } else if (t.entryCandleIndex === i) {
              note = `Trade #${t.id} ${t.direction} Entered`;
            }
          }
        }

        const eqPts = round2(realized + floating);
        const eqRs = round2(eqPts * multiplier);
        peak = Math.max(peak, eqPts);
        const ddPts = round2(eqPts - peak);

        if (eqPts > maxVal) maxVal = eqPts;
        if (eqPts < minVal) minVal = eqPts;
        if (ddPts < maxDd) maxDd = ddPts;

        points.push({
          index: i,
          time: candle.time,
          equityPoints: eqPts,
          realizedPoints: round2(realized),
          floatingPoints: round2(floating),
          equityRupees: eqRs,
          drawdownPoints: ddPts,
          note,
        });
      }

      let offset = 1;
      if (maxVal <= 0) {
        offset = 0;
      } else if (minVal >= 0) {
        offset = 1;
      } else {
        offset = maxVal / (maxVal - minVal);
      }

      return {
        series: points,
        peakPoints: round2(maxVal),
        troughPoints: round2(minVal),
        maxDdPoints: round2(Math.abs(maxDd)),
        zeroOffset: offset,
      };
    }, [result.candles, result.trades, multiplier]);

  const dataKey = unit === 'points' ? 'equityPoints' : 'equityRupees';
  const latestPoint = series.length > 0 ? series[series.length - 1] : null;

  const formatMetric = (pts: number, rs: number) => {
    if (unit === 'points') {
      return `${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts`;
    }
    return `${rs >= 0 ? '+₹' : '-₹'}${Math.abs(rs).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
    })}`;
  };

  return (
    <section
      aria-label="Daily Equity Curve"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Header Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Daily Intraday Equity Curve
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            {latestPoint ? (
              <>
                Current:{' '}
                <span
                  className={
                    latestPoint.equityPoints >= 0
                      ? 'text-emerald-700 font-semibold'
                      : 'text-red-600 font-semibold'
                  }
                >
                  {formatMetric(
                    latestPoint.equityPoints,
                    latestPoint.equityRupees
                  )}
                </span>{' '}
                · Peak: +{peakPoints.toFixed(1)} pts · Trough:{' '}
                {troughPoints.toFixed(1)} pts · Max DD: -
                {maxDdPoints.toFixed(1)} pts
              </>
            ) : (
              'Awaiting 5-minute candle data'
            )}
          </p>
        </div>

        {/* Interactive Unit Toggle */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setUnit('points')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              unit === 'points'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Points (pts)
          </button>
          <button
            type="button"
            onClick={() => setUnit('rupees')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              unit === 'rupees'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rupees (₹)
          </button>
        </div>
      </div>

      {/* Recharts Container */}
      <div className="px-4 pt-5 pb-3">
        {series.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-500">
            No candles available to plot the intraday equity curve.
          </div>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 8, right: 16, left: 6, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="equityStrokeSplit"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset={zeroOffset} stopColor="#16a34a" stopOpacity={1} />
                    <stop offset={zeroOffset} stopColor="#dc2626" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient
                    id="equityFillSplit"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset={0} stopColor="#16a34a" stopOpacity={0.22} />
                    <stop
                      offset={zeroOffset}
                      stopColor="#16a34a"
                      stopOpacity={0.03}
                    />
                    <stop
                      offset={zeroOffset}
                      stopColor="#dc2626"
                      stopOpacity={0.03}
                    />
                    <stop offset={1} stopColor="#dc2626" stopOpacity={0.22} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />

                <XAxis
                  dataKey="time"
                  tick={{
                    fontSize: 11,
                    fill: '#64748b',
                    fontFamily: 'var(--font-mono)',
                  }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  minTickGap={24}
                />

                <YAxis
                  tick={{
                    fontSize: 11,
                    fill: '#64748b',
                    fontFamily: 'var(--font-mono)',
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                  tickFormatter={(val: number) =>
                    unit === 'points'
                      ? `${val > 0 ? '+' : ''}${val}`
                      : `${val >= 0 ? '₹' : '-₹'}${Math.abs(val).toLocaleString(
                          'en-IN'
                        )}`
                  }
                />

                <ReferenceLine
                  y={0}
                  stroke="#94a3b8"
                  strokeDasharray="4 3"
                  strokeWidth={1.25}
                />

                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) {
                      return null;
                    }
                    const pt = payload[0].payload as EquityPoint;
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs space-y-1">
                        <div className="font-mono font-semibold text-slate-900">
                          {pt.time} IST
                        </div>
                        <div className="flex items-center justify-between gap-5 font-mono tabular-nums">
                          <span className="text-slate-500">Total Equity</span>
                          <span
                            className={`font-semibold ${
                              pt.equityPoints >= 0
                                ? 'text-emerald-700'
                                : 'text-red-600'
                            }`}
                          >
                            {formatMetric(pt.equityPoints, pt.equityRupees)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-5 font-mono tabular-nums">
                          <span className="text-slate-500">Realized</span>
                          <span className="text-slate-800">
                            {pt.realizedPoints >= 0 ? '+' : ''}
                            {pt.realizedPoints.toFixed(1)} pts
                          </span>
                        </div>
                        {pt.floatingPoints !== 0 && (
                          <div className="flex items-center justify-between gap-5 font-mono tabular-nums">
                            <span className="text-slate-500">Open MTM</span>
                            <span className="text-slate-800">
                              {pt.floatingPoints >= 0 ? '+' : ''}
                              {pt.floatingPoints.toFixed(1)} pts
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-5 font-mono tabular-nums">
                          <span className="text-slate-500">Drawdown</span>
                          <span className="text-slate-700">
                            {pt.drawdownPoints.toFixed(1)} pts
                          </span>
                        </div>
                        {pt.note && (
                          <div className="pt-1 mt-1 border-t border-slate-100 text-[11px] font-medium text-blue-700">
                            {pt.note}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />

                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke="url(#equityStrokeSplit)"
                  strokeWidth={2.25}
                  fill="url(#equityFillSplit)"
                  isAnimationActive={false}
                  dot={(props) => {
                    const { cx, cy, payload } = props as {
                      cx?: number;
                      cy?: number;
                      payload?: EquityPoint;
                    };
                    if (
                      cx === undefined ||
                      cy === undefined ||
                      !payload ||
                      !payload.note
                    ) {
                      return <g key={`empty-dot-${payload?.index ?? 0}`} />;
                    }
                    const fillColor =
                      payload.equityPoints >= 0 ? '#16a34a' : '#dc2626';
                    return (
                      <circle
                        key={`event-dot-${payload.index}`}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill={fillColor}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={{
                    r: 4.5,
                    fill: '#0f172a',
                    stroke: '#ffffff',
                    strokeWidth: 1.5,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
};
