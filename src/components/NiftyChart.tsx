import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickData,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramData,
  HistogramSeries,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LastPriceAnimationMode,
  LineData,
  LineSeries,
  LineStyle,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import {
  ArrowRightToLine,
  Magnet,
  Maximize2,
  Moon,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BacktestResult,
  EnrichedCandle,
  StrategyConfig,
  TradeRecord,
} from '../types/strategy';
import { FyersQuoteTick } from './FyersLiveBar';

interface NiftyChartProps {
  result: BacktestResult;
  totalCandlesInScenario: number;
  config: StrategyConfig;
  selectedTradeId: number | null;
  onSelectTrade: (id: number | null) => void;
  scenarioKey: string;
  symbolLabel: string;
  isLiveStreaming?: boolean;
  liveTick?: FyersQuoteTick | null;
  isFormingCandle?: boolean;
}

/**
 * Convert candle date + HH:MM (IST wall-clock) into a unique UTC timestamp so
 * TradingView Lightweight Charts renders exact IST session times (09:15..15:25)
 * regardless of the user's browser timezone.
 */
function buildChartTimestamps(candles: EnrichedCandle[]): UTCTimestamp[] {
  const result: UTCTimestamp[] = [];
  let prevTs = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const [hhRaw, mmRaw] = c.time.split(':').map(Number);
    const hh = Number.isNaN(hhRaw) ? 9 : hhRaw;
    const mm = Number.isNaN(mmRaw) ? 15 : mmRaw;

    let year = 2026;
    let month = 11;
    let day = 18;
    if (c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date)) {
      const [y, m, d] = c.date.split('-').map(Number);
      year = y;
      month = m;
      day = d;
    }

    let ts = Math.floor(Date.UTC(year, month - 1, day, hh, mm, 0) / 1000);
    if (prevTs > 0 && ts <= prevTs) {
      ts = prevTs + 300;
    }
    prevTs = ts;
    result.push(ts as UTCTimestamp);
  }

  return result;
}

function getRemainingFiveMinCountdown(): string {
  const now = new Date();
  const istParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const min = Number(istParts.find((p) => p.type === 'minute')?.value ?? 0);
  const sec = Number(istParts.find((p) => p.type === 'second')?.value ?? 0);
  const elapsedInBucket = (min % 5) * 60 + sec;
  const remaining = Math.max(0, 300 - elapsedInBucket);
  const rm = Math.floor(remaining / 60);
  const rs = remaining % 60;
  return `${String(rm).padStart(2, '0')}:${String(rs).padStart(2, '0')}`;
}

export const NiftyChart: React.FC<NiftyChartProps> = ({
  result,
  totalCandlesInScenario,
  config,
  selectedTradeId,
  onSelectTrade,
  scenarioKey,
  symbolLabel,
  isLiveStreaming = false,
  liveTick = null,
  isFormingCandle = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const priceLinesRef = useRef<IPriceLine[]>([]);
  const rsiLinesRef = useRef<IPriceLine[]>([]);
  const tsToCandleRef = useRef<Map<number, EnrichedCandle>>(new Map());
  const prevScenarioKeyRef = useRef<string>('');
  const prevLenRef = useRef<number>(0);

  const [chartTheme, setChartTheme] = useState<'light' | 'dark'>('light');
  const [magnetMode, setMagnetMode] = useState<boolean>(false);
  const [showSets, setShowSets] = useState<boolean>(true);
  const [showTrades, setShowTrades] = useState<boolean>(true);
  const [showVolume, setShowVolume] = useState<boolean>(true);
  const [hoveredCandle, setHoveredCandle] = useState<EnrichedCandle | null>(
    null
  );
  const [countdown, setCountdown] = useState<string>(() =>
    getRemainingFiveMinCountdown()
  );

  const candles = result.candles;

  const timestamps = useMemo(() => buildChartTimestamps(candles), [candles]);

  const focusedTrade: TradeRecord | null = useMemo(() => {
    if (selectedTradeId !== null) {
      return result.trades.find((t) => t.id === selectedTradeId) ?? null;
    }
    const openTrade = result.trades.find((t) => t.exitReason === 'OPEN');
    if (openTrade) return openTrade;
    return result.trades.length > 0
      ? result.trades[result.trades.length - 1]
      : null;
  }, [result.trades, selectedTradeId]);

  const activeArmedCandle = useMemo(() => {
    if (candles.length === 0) return null;
    const last = candles[candles.length - 1];
    return last.armedTriggerLevel !== null ? last : null;
  }, [candles]);

  // Live 5-minute countdown timer
  useEffect(() => {
    if (!isLiveStreaming) return;
    setCountdown(getRemainingFiveMinCountdown());
    const id = window.setInterval(() => {
      setCountdown(getRemainingFiveMinCountdown());
    }, 1000);
    return () => window.clearInterval(id);
  }, [isLiveStreaming]);

  // Initialize TradingView Lightweight Chart once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth || 920,
      height: 520,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#475569',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        panes: {
          separatorColor: '#e2e8f0',
          separatorHoverColor: '#94a3b8',
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0f172a',
        },
        horzLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0f172a',
        },
      },
      rightPriceScale: {
        borderColor: '#e2e8f0',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#e2e8f0',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 14,
        minBarSpacing: 4,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Pane 0: Main Candlestick Series
    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: '#059669',
        downColor: '#dc2626',
        borderVisible: true,
        borderUpColor: '#047857',
        borderDownColor: '#b91c1c',
        wickUpColor: '#047857',
        wickDownColor: '#b91c1c',
        priceLineVisible: true,
        priceLineColor: '#2563eb',
        priceLineWidth: 1,
        priceLineStyle: LineStyle.Dotted,
        lastValueVisible: true,
      },
      0
    );

    // Pane 0: Volume Histogram (bottom 18%)
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      },
      0
    );
    chart.priceScale('volume', 0).applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: false,
    });

    // Pane 1: Synchronized Wilder RSI(2) Pane
    const rsiSeries = chart.addSeries(
      LineSeries,
      {
        color: '#2563eb',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        lastPriceAnimation: LastPriceAnimationMode.Continuous,
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 0, maxValue: 100 },
        }),
        priceFormat: {
          type: 'price',
          precision: 1,
          minMove: 0.1,
        },
      },
      1
    );

    const panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(3);
    if (panes[1]) panes[1].setStretchFactor(1);

    const markersPlugin = createSeriesMarkers(candleSeries, []);

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        setHoveredCandle(null);
        return;
      }
      const tsNum = typeof param.time === 'number' ? param.time : null;
      if (tsNum === null) {
        setHoveredCandle(null);
        return;
      }
      const match = tsToCandleRef.current.get(tsNum) ?? null;
      setHoveredCandle(match);
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    rsiSeriesRef.current = rsiSeries;
    markersPluginRef.current = markersPlugin;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.floor(entry.contentRect.width);
      if (nextWidth > 0) {
        chart.applyOptions({ width: nextWidth });
      }
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      rsiSeriesRef.current = null;
      markersPluginRef.current = null;
      priceLinesRef.current = [];
      rsiLinesRef.current = [];
    };
  }, []);

  // Apply Light/Dark TradingView Theme & Magnet Crosshair mode dynamically
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isDark = chartTheme === 'dark';

    chart.applyOptions({
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? '#131722' : '#ffffff',
        },
        textColor: isDark ? '#94a3b8' : '#475569',
        panes: {
          separatorColor: isDark ? '#2a2e39' : '#e2e8f0',
          separatorHoverColor: isDark ? '#475569' : '#94a3b8',
        },
      },
      grid: {
        vertLines: { color: isDark ? '#1e222d' : '#f1f5f9' },
        horzLines: { color: isDark ? '#1e222d' : '#f1f5f9' },
      },
      crosshair: {
        mode: magnetMode ? CrosshairMode.Magnet : CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#64748b' : '#64748b',
          labelBackgroundColor: isDark ? '#334155' : '#0f172a',
        },
        horzLine: {
          color: isDark ? '#64748b' : '#64748b',
          labelBackgroundColor: isDark ? '#334155' : '#0f172a',
        },
      },
      rightPriceScale: {
        borderColor: isDark ? '#2a2e39' : '#e2e8f0',
      },
      timeScale: {
        borderColor: isDark ? '#2a2e39' : '#e2e8f0',
      },
    });
  }, [chartTheme, magnetMode]);

  // Toggle Volume visibility
  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  // Sync Candle, Volume, and RSI(2) series data (preserving zoom/pan on live ticks!)
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const rsiSeries = rsiSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !rsiSeries || !chart) return;

    const map = new Map<number, EnrichedCandle>();
    for (let i = 0; i < candles.length; i++) {
      map.set(timestamps[i], candles[i]);
    }
    tsToCandleRef.current = map;

    const isSameScenario = prevScenarioKeyRef.current === scenarioKey;
    const prevLen = prevLenRef.current;
    const isIncrementalTickUpdate =
      isSameScenario &&
      prevLen > 0 &&
      candles.length >= prevLen &&
      candles.length <= prevLen + 1;

    const toBar = (i: number): CandlestickData<Time> => ({
      time: timestamps[i],
      open: candles[i].open,
      high: candles[i].high,
      low: candles[i].low,
      close: candles[i].close,
    });

    const toVol = (i: number): HistogramData<Time> => ({
      time: timestamps[i],
      value: candles[i].volume || 0,
      color:
        candles[i].close >= candles[i].open
          ? 'rgba(5, 150, 105, 0.25)'
          : 'rgba(220, 38, 38, 0.25)',
    });

    if (isIncrementalTickUpdate && candles.length > 0) {
      // Smooth 60fps TradingView live candle formation without resetting zoom/pan!
      const lastIdx = candles.length - 1;
      if (candles.length === prevLen + 1 && lastIdx - 1 >= 0) {
        candleSeries.update(toBar(lastIdx - 1));
        volumeSeries.update(toVol(lastIdx - 1));
        const prevRsi = candles[lastIdx - 1].rsi2;
        if (prevRsi !== null) {
          rsiSeries.update({ time: timestamps[lastIdx - 1], value: prevRsi });
        }
      }
      candleSeries.update(toBar(lastIdx));
      volumeSeries.update(toVol(lastIdx));
      const lastRsi = candles[lastIdx].rsi2;
      if (lastRsi !== null) {
        rsiSeries.update({ time: timestamps[lastIdx], value: lastRsi });
      }
    } else {
      const candleData: CandlestickData<Time>[] = candles.map((_, i) =>
        toBar(i)
      );
      const volData: HistogramData<Time>[] = candles.map((_, i) => toVol(i));
      const rsiData: LineData<Time>[] = [];
      for (let i = 0; i < candles.length; i++) {
        const val = candles[i].rsi2;
        if (val !== null) {
          rsiData.push({ time: timestamps[i], value: val });
        }
      }

      candleSeries.setData(candleData);
      volumeSeries.setData(volData);
      rsiSeries.setData(rsiData);

      if (
        !isSameScenario ||
        prevLen === 0 ||
        Math.abs(candles.length - prevLen) > 2
      ) {
        chart.timeScale().fitContent();
      }
    }

    prevScenarioKeyRef.current = scenarioKey;
    prevLenRef.current = candles.length;
  }, [candles, timestamps, scenarioKey]);

  // Update RSI(2) horizontal threshold lines (<12 Buy, >89 Sell, 50 midline)
  useEffect(() => {
    const rsiSeries = rsiSeriesRef.current;
    if (!rsiSeries) return;

    for (const line of rsiLinesRef.current) {
      rsiSeries.removePriceLine(line);
    }
    rsiLinesRef.current = [];

    const sellLine = rsiSeries.createPriceLine({
      price: config.rsiSellThreshold,
      color: '#dc2626',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: `Sell >${config.rsiSellThreshold}`,
    });

    const midLine = rsiSeries.createPriceLine({
      price: 50,
      color: '#94a3b8',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: '',
    });

    const buyLine = rsiSeries.createPriceLine({
      price: config.rsiBuyThreshold,
      color: '#059669',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: `Buy <${config.rsiBuyThreshold}`,
    });

    rsiLinesRef.current = [sellLine, midLine, buyLine];
  }, [config.rsiBuyThreshold, config.rsiSellThreshold]);

  // Update Strategy Markers (4-Candle Sets, RSI Armed, Entries, 1:1 Trail, SL/Target)
  useEffect(() => {
    const markersPlugin = markersPluginRef.current;
    if (!markersPlugin) return;

    const rawMarkers: Array<SeriesMarker<Time> & { _ts: number; _order: number }> = [];

    if (showSets) {
      for (const s of result.sets) {
        const ts = timestamps[s.endIndex];
        if (!ts) continue;
        if (s.outcome === 'BULLISH' && s.appliedForBias) {
          rawMarkers.push({
            _ts: ts,
            _order: 1,
            time: ts,
            position: 'aboveBar',
            color: '#059669',
            shape: 'circle',
            text: `S${s.setNumber} BULL (${s.greenCount}G)`,
          });
        } else if (s.outcome === 'BEARISH' && s.appliedForBias) {
          rawMarkers.push({
            _ts: ts,
            _order: 1,
            time: ts,
            position: 'aboveBar',
            color: '#dc2626',
            shape: 'circle',
            text: `S${s.setNumber} BEAR (${s.redCount}R)`,
          });
        } else if (s.outcome === 'UNDECIDED') {
          rawMarkers.push({
            _ts: ts,
            _order: 1,
            time: ts,
            position: 'aboveBar',
            color: '#64748b',
            shape: 'square',
            text: `S${s.setNumber} Skip`,
          });
        }
      }
    }

    if (showTrades) {
      for (const t of result.trades) {
        const entryTs = timestamps[t.entryCandleIndex];
        if (entryTs) {
          rawMarkers.push({
            _ts: entryTs,
            _order: 2,
            time: entryTs,
            position: t.direction === 'LONG' ? 'belowBar' : 'aboveBar',
            color: t.direction === 'LONG' ? '#059669' : '#dc2626',
            shape: t.direction === 'LONG' ? 'arrowUp' : 'arrowDown',
            text: `${t.direction === 'LONG' ? 'BUY' : 'SELL'} #${t.id}`,
          });
        }

        if (
          t.trailedToCost &&
          typeof t.trailCandleIndex === 'number' &&
          timestamps[t.trailCandleIndex]
        ) {
          const trailTs = timestamps[t.trailCandleIndex];
          rawMarkers.push({
            _ts: trailTs,
            _order: 3,
            time: trailTs,
            position: t.direction === 'LONG' ? 'aboveBar' : 'belowBar',
            color: '#d97706',
            shape: 'circle',
            text: `1:1 COST`,
          });
        }

        if (
          typeof t.exitCandleIndex === 'number' &&
          timestamps[t.exitCandleIndex] &&
          t.exitReason !== 'OPEN'
        ) {
          const exitTs = timestamps[t.exitCandleIndex];
          const isWin = t.exitReason === 'TARGET_HIT';
          const isCost = t.exitReason === 'TRAILED_COST_EXIT';
          rawMarkers.push({
            _ts: exitTs,
            _order: 4,
            time: exitTs,
            position: t.direction === 'LONG' ? 'aboveBar' : 'belowBar',
            color: isWin ? '#059669' : isCost ? '#d97706' : '#dc2626',
            shape: isWin ? 'arrowDown' : 'circle',
            text: isWin
              ? `TGT +${t.pnlPoints.toFixed(0)}`
              : isCost
              ? `COST 0`
              : `SL ${t.pnlPoints.toFixed(0)}`,
          });
        }
      }
    }

    rawMarkers.sort((a, b) => a._ts - b._ts || a._order - b._order);

    const cleanMarkers: SeriesMarker<Time>[] = rawMarkers.map(
      ({ _ts: _ignoreTs, _order: _ignoreOrder, ...marker }) => marker
    );
    markersPlugin.setMarkers(cleanMarkers);
  }, [result.sets, result.trades, timestamps, showSets, showTrades]);

  // Update Horizontal Price Lines (Armed Trigger + Focused Trade Entry/SL/Target)
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    for (const line of priceLinesRef.current) {
      candleSeries.removePriceLine(line);
    }
    priceLinesRef.current = [];

    if (!showTrades) return;

    if (activeArmedCandle && activeArmedCandle.armedTriggerLevel !== null) {
      const armedLine = candleSeries.createPriceLine({
        price: activeArmedCandle.armedTriggerLevel,
        color: '#2563eb',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${activeArmedCandle.armedDirection} Trigger (+${config.entryBufferPoints}buf)`,
      });
      priceLinesRef.current.push(armedLine);
    }

    if (focusedTrade) {
      const entryLine = candleSeries.createPriceLine({
        price: focusedTrade.entryPrice,
        color: '#2563eb',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `Entry #${focusedTrade.id}`,
      });

      const slLine = candleSeries.createPriceLine({
        price: focusedTrade.currentSlPrice,
        color: focusedTrade.trailedToCost ? '#d97706' : '#dc2626',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: focusedTrade.trailedToCost
          ? `Cost SL #${focusedTrade.id}`
          : `SL -${config.stopLossPoints}`,
      });

      const tgtLine = candleSeries.createPriceLine({
        price: focusedTrade.targetPrice,
        color: '#059669',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Target +${config.targetPoints}`,
      });

      priceLinesRef.current.push(entryLine, slLine, tgtLine);
    }
  }, [
    focusedTrade,
    activeArmedCandle,
    showTrades,
    config.entryBufferPoints,
    config.stopLossPoints,
    config.targetPoints,
  ]);

  const handleZoom = (factor: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const span = range.to - range.from;
    const center = (range.from + range.to) / 2;
    const nextHalf = Math.max(4, (span * factor) / 2);
    chart.timeScale().setVisibleLogicalRange({
      from: center - nextHalf,
      to: center + nextHalf,
    });
  };

  const handleFitAll = () => {
    chartRef.current?.timeScale().fitContent();
  };

  const handleScrollToLive = () => {
    chartRef.current?.timeScale().scrollToRealTime();
  };

  const handleJumpToSet = (startIndex: number, endIndex: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const pad = 6;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(-2, startIndex - pad),
      to: endIndex + pad,
    });
  };

  const displayCandle =
    hoveredCandle ?? (candles.length > 0 ? candles[candles.length - 1] : null);
  const candleDelta = displayCandle
    ? displayCandle.close - displayCandle.open
    : 0;
  const candleDeltaPct =
    displayCandle && displayCandle.open > 0
      ? (candleDelta / displayCandle.open) * 100
      : 0;

  const isDark = chartTheme === 'dark';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* TradingView Chart Toolbar */}
      <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            {symbolLabel} · 5m
          </h2>

          {isLiveStreaming && (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums font-semibold text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE</span>
              {liveTick && (
                <span>
                  · {liveTick.ltp.toFixed(2)}
                  {liveTick.istTimeSec ? ` (${liveTick.istTimeSec})` : ''}
                </span>
              )}
              <span className="text-slate-400 font-normal">
                · Bar closes in {countdown}
              </span>
            </span>
          )}

          {!isLiveStreaming && isFormingCandle && (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums font-semibold text-blue-700">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Forming 5m Candle</span>
            </span>
          )}

          {!isLiveStreaming && !isFormingCandle && (
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {candles.length}/{totalCandlesInScenario} bars · Wilder RSI(
              {config.rsiLength})
            </span>
          )}
        </div>

        {/* Interactive Overlay & TradingView Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Overlay toggles */}
          <button
            type="button"
            onClick={() => setShowSets((v) => !v)}
            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
              showSets
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            Sets
          </button>
          <button
            type="button"
            onClick={() => setShowTrades((v) => !v)}
            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
              showTrades
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            Trades
          </button>
          <button
            type="button"
            onClick={() => setShowVolume((v) => !v)}
            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
              showVolume
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            Vol
          </button>

          <span className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden="true" />

          <button
            type="button"
            onClick={() => setMagnetMode((v) => !v)}
            title="Toggle OHLC Magnet Crosshair"
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
              magnetMode
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Magnet</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setChartTheme((t) => (t === 'light' ? 'dark' : 'light'))
            }
            title="Switch Light / Dark TradingView Theme"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {isDark ? (
              <Sun className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Moon className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {isDark ? 'Light' : 'Dark'}
            </span>
          </button>

          <span className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden="true" />

          <button
            type="button"
            onClick={() => handleZoom(0.75)}
            title="Zoom In"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1.33)}
            title="Zoom Out"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleFitAll}
            title="Fit All Candles"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" aria-hidden="true" />
            <span>Fit</span>
          </button>
          <button
            type="button"
            onClick={handleScrollToLive}
            title="Scroll to Latest Candle"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
          >
            <ArrowRightToLine className="w-3 h-3" aria-hidden="true" />
            <span>Latest</span>
          </button>
        </div>
      </div>

      {/* TradingView Chart Canvas + Floating OHLCV / RSI Legend */}
      <div className="relative">
        {displayCandle && (
          <div
            className={`pointer-events-none absolute top-2.5 left-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 rounded-md text-[11px] font-mono tabular-nums backdrop-blur-xs border ${
              isDark
                ? 'bg-[#131722]/85 border-slate-700/70 text-slate-200'
                : 'bg-white/90 border-slate-200/80 text-slate-700'
            }`}
          >
            <span className="font-semibold">
              {displayCandle.date ? `${displayCandle.date} ` : ''}
              {displayCandle.time} IST
            </span>
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
              Set {displayCandle.setNumber} ({displayCandle.positionInSet}/
              {config.setSize})
            </span>
            <span>
              O{' '}
              <strong className={isDark ? 'text-white' : 'text-slate-900'}>
                {displayCandle.open.toFixed(2)}
              </strong>
            </span>
            <span>
              H{' '}
              <strong className={isDark ? 'text-white' : 'text-slate-900'}>
                {displayCandle.high.toFixed(2)}
              </strong>
            </span>
            <span>
              L{' '}
              <strong className={isDark ? 'text-white' : 'text-slate-900'}>
                {displayCandle.low.toFixed(2)}
              </strong>
            </span>
            <span>
              C{' '}
              <strong
                className={
                  candleDelta >= 0 ? 'text-emerald-600' : 'text-red-500'
                }
              >
                {displayCandle.close.toFixed(2)} ({candleDelta >= 0 ? '+' : ''}
                {candleDelta.toFixed(2)} / {candleDeltaPct >= 0 ? '+' : ''}
                {candleDeltaPct.toFixed(2)}%)
              </strong>
            </span>
            <span>
              RSI({config.rsiLength}){' '}
              <strong
                className={
                  displayCandle.rsi2 === null
                    ? ''
                    : displayCandle.rsi2 < config.rsiBuyThreshold
                    ? 'text-emerald-600'
                    : displayCandle.rsi2 > config.rsiSellThreshold
                    ? 'text-red-500'
                    : 'text-blue-500'
                }
              >
                {displayCandle.rsi2 !== null
                  ? displayCandle.rsi2.toFixed(2)
                  : '--'}
              </strong>
            </span>
            <span
              className={
                displayCandle.biasAtClose === 'BULLISH'
                  ? 'text-emerald-600 font-semibold'
                  : displayCandle.biasAtClose === 'BEARISH'
                  ? 'text-red-500 font-semibold'
                  : isDark
                  ? 'text-slate-400'
                  : 'text-slate-500'
              }
            >
              {displayCandle.biasAtClose}
            </span>
          </div>
        )}

        {/* Active Trade / Armed Status Footer Hint inside Chart */}
        {focusedTrade && selectedTradeId !== null && (
          <div className="absolute top-2.5 right-16 z-10 flex items-center gap-2 bg-white/95 border border-slate-200 rounded-md px-2.5 py-1 text-[11px] font-mono tabular-nums text-slate-700 shadow-xs">
            <span>
              Focused Trade #{focusedTrade.id} ({focusedTrade.direction})
            </span>
            <button
              type="button"
              onClick={() => onSelectTrade(null)}
              className="text-blue-600 hover:underline font-sans font-medium cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}

        <div
          ref={containerRef}
          className="w-full"
          style={{ height: 520 }}
          aria-label="TradingView NIFTY 5-minute Candlestick and RSI Chart"
        />
      </div>

      {/* Interactive 4-Candle Set Strip */}
      {result.sets.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">
              4-Candle Sets:
            </span>
            {result.sets.slice(0, 8).map((s) => (
              <button
                key={s.setNumber}
                type="button"
                onClick={() => handleJumpToSet(s.startIndex, s.endIndex)}
                className={`px-2 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                  s.outcome === 'BULLISH'
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'
                    : s.outcome === 'BEARISH'
                    ? 'border-red-200 bg-red-50/70 text-red-800 hover:bg-red-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                S{s.setNumber} ({s.startTime}): {s.greenCount}G/{s.redCount}R{' '}
                {s.outcome === 'UNDECIDED' ? 'Skip' : s.outcome.slice(0, 4)}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-500">
            Scroll to zoom · Drag to pan · Drag price/time axis to scale ·
            Powered by TradingView Lightweight Charts
          </span>
        </div>
      )}
    </div>
  );
};
