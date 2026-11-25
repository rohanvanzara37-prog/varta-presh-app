import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  Activity,
  BarChart2,
  Columns2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  SkipForward,
  X,
} from 'lucide-react';
import type { ThemeMode } from '../types/news';
import {
  analyzeChartStructure,
  calcBollingerSeries,
  calcEmaSeries,
  calcRsiSeries,
  computeOmyeSnapshot,
  sanitizeCandles,
  type ChartStructureOverlayData,
  type OmyeEngineState,
  type SmcAnalysisState,
  type TerminalCandle,
} from '../utils/chartAnalysis';
import { ChartCanvasOverlay } from './ChartCanvasOverlay';
import { ChartSettingsModal } from './ChartSettingsModal';

export type { OmyeEngineState, SmcAnalysisState, ZoneRange } from '../utils/chartAnalysis';

export type SmcSymbol =
  | 'XAUUSD'
  | 'XAGUSD'
  | 'BTCUSDT'
  | 'ETHUSDT'
  | 'SOLUSDT'
  | 'BNBUSDT'
  | 'XRPUSDT'
  | 'US500'
  | 'USOIL';

export type SmcTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export interface SmcTelemetrySnapshot {
  symbol: SmcSymbol;
  timeframe: SmcTimeframe;
  price: number | null;
  latestBarTime?: number;
  countdown?: string;
  smc: SmcAnalysisState | null;
  omye: OmyeEngineState | null;
}

interface ProSmcTerminalProps {
  externalTvSymbol?: string;
  onSelectTvSymbol?: (tvSymbol: string) => void;
  onTelemetryChange?: (snapshot: SmcTelemetrySnapshot) => void;
  themeMode?: ThemeMode;
  onChangeThemeMode?: (mode: ThemeMode) => void;
}

function getChartThemeOptions(themeMode: ThemeMode) {
  const isLight = themeMode === 'light';
  return {
    layout: {
      background: { type: ColorType.Solid, color: isLight ? '#FFFFFF' : '#0D1117' },
      textColor: isLight ? '#334155' : '#94A3B8',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    },
    grid: {
      vertLines: {
        color: isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(148, 163, 184, 0.06)',
        style: LineStyle.Solid,
      },
      horzLines: {
        color: isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(148, 163, 184, 0.06)',
        style: LineStyle.Solid,
      },
    },
    crosshair: {
      vertLine: {
        color: isLight ? 'rgba(180, 83, 9, 0.45)' : 'rgba(245, 158, 11, 0.45)',
        labelBackgroundColor: isLight ? '#0F172A' : '#1E2638',
      },
      horzLine: {
        color: isLight ? 'rgba(180, 83, 9, 0.45)' : 'rgba(245, 158, 11, 0.45)',
        labelBackgroundColor: isLight ? '#0F172A' : '#1E2638',
      },
    },
    timeScale: {
      borderColor: isLight ? '#E2E8F0' : '#1E2638',
    },
    rightPriceScale: {
      borderColor: isLight ? '#E2E8F0' : '#1E2638',
    },
  };
}

function getCandleStyleOptions(themeMode: ThemeMode) {
  const isLight = themeMode === 'light';
  return isLight
    ? {
        upColor: '#089981',
        downColor: '#F23645',
        borderUpColor: '#089981',
        borderDownColor: '#F23645',
        wickUpColor: '#067A66',
        wickDownColor: '#DC2626',
        borderVisible: false,
        wickVisible: true,
      }
    : {
        upColor: '#089981',
        downColor: '#F23645',
        borderUpColor: '#089981',
        borderDownColor: '#F23645',
        wickUpColor: '#10B981',
        wickDownColor: '#FB7185',
        borderVisible: false,
        wickVisible: true,
      };
}

interface SymbolMeta {
  value: SmcSymbol;
  shortLabel: string;
  label: string;
  isCrypto: boolean;
  precision: number;
  minMove: number;
}

const SYMBOL_OPTIONS: Array<SymbolMeta & { tvSymbol: string }> = [
  { value: 'XAUUSD', tvSymbol: 'OANDA:XAUUSD', shortLabel: 'XAU/USD', label: 'XAU/USD · Gold', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'XAGUSD', tvSymbol: 'OANDA:XAGUSD', shortLabel: 'XAG/USD', label: 'XAG/USD · Silver', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'BTCUSDT', tvSymbol: 'BINANCE:BTCUSDT', shortLabel: 'BTC/USDT', label: 'BTC/USDT · Bitcoin', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'ETHUSDT', tvSymbol: 'BINANCE:ETHUSDT', shortLabel: 'ETH/USDT', label: 'ETH/USDT · Ethereum', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'SOLUSDT', tvSymbol: 'BINANCE:SOLUSDT', shortLabel: 'SOL/USDT', label: 'SOL/USDT · Solana', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'US500', tvSymbol: 'FOREXCOM:SPXUSD', shortLabel: 'US500', label: 'US500 · S&P 500', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'USOIL', tvSymbol: 'TVC:USOIL', shortLabel: 'USOIL', label: 'USOIL · WTI Crude', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'BNBUSDT', tvSymbol: 'BINANCE:BNBUSDT', shortLabel: 'BNB/USDT', label: 'BNB/USDT · BNB', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'XRPUSDT', tvSymbol: 'BINANCE:XRPUSDT', shortLabel: 'XRP/USDT', label: 'XRP/USDT · Ripple', isCrypto: true, precision: 4, minMove: 0.0001 },
];

const TIMEFRAME_OPTIONS: { value: SmcTimeframe; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

const IN_CHART_TIMEFRAMES = TIMEFRAME_OPTIONS.filter((tf) => tf.value !== '1w');

function mapTvSymbolToSmc(tvSymbol?: string): SmcSymbol | null {
  if (!tvSymbol) return null;
  if (tvSymbol.includes('XAU')) return 'XAUUSD';
  if (tvSymbol.includes('XAG')) return 'XAGUSD';
  if (tvSymbol.includes('SPX') || tvSymbol.includes('US500')) return 'US500';
  if (tvSymbol.includes('USOIL')) return 'USOIL';
  if (tvSymbol.includes('BTC')) return 'BTCUSDT';
  if (tvSymbol.includes('ETH')) return 'ETHUSDT';
  if (tvSymbol.includes('SOL')) return 'SOLUSDT';
  if (tvSymbol.includes('BNB')) return 'BNBUSDT';
  if (tvSymbol.includes('XRP')) return 'XRPUSDT';
  return null;
}

interface CrosshairReadout {
  price: number;
  timeLabel: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

function toPureCandle(c: TerminalCandle): CandlestickData<UTCTimestamp> {
  return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
}

function formatUtcShort(ts: number): string {
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${d.getDate()} ${mon} ${hh}:${mm}`;
}

const TIMEFRAME_SECONDS: Record<SmcTimeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
};

export function formatCandleCountdown(
  timeframe: SmcTimeframe,
  latestBarTime?: number,
  nowMs = Date.now()
): string {
  const tfSec = TIMEFRAME_SECONDS[timeframe] ?? 900;
  const nowSec = Math.floor(nowMs / 1000);

  let nextCloseSec: number;
  if (timeframe === '1w') {
    const mondayEpochOffset = 345600; // 1970-01-05T00:00:00Z
    const weekStart = Math.floor((nowSec - mondayEpochOffset) / tfSec) * tfSec + mondayEpochOffset;
    nextCloseSec =
      latestBarTime && latestBarTime + tfSec > nowSec && latestBarTime >= weekStart - tfSec
        ? latestBarTime + tfSec
        : weekStart + tfSec;
  } else {
    const bucketStart = Math.floor(nowSec / tfSec) * tfSec;
    nextCloseSec =
      latestBarTime && latestBarTime + tfSec > nowSec && latestBarTime >= bucketStart - tfSec
        ? latestBarTime + tfSec
        : bucketStart + tfSec;
  }

  let remaining = nextCloseSec - nowSec;
  if (remaining <= 0 || remaining > tfSec) {
    remaining = tfSec - (nowSec % tfSec);
    if (remaining <= 0) remaining = tfSec;
  }

  if (remaining >= 86400) {
    const days = Math.floor(remaining / 86400);
    const rem = remaining % 86400;
    const hh = String(Math.floor(rem / 3600)).padStart(2, '0');
    const mm = String(Math.floor((rem % 3600) / 60)).padStart(2, '0');
    const ss = String(rem % 60).padStart(2, '0');
    return `${days}d ${hh}:${mm}:${ss}`;
  }

  if (tfSec >= 3600 || remaining >= 3600) {
    const hh = String(Math.floor(remaining / 3600)).padStart(2, '0');
    const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

const GOLD_CFD_PARAMS: Record<SmcTimeframe, { interval: string; range: string }> = {
  '1m': { interval: '1m', range: '5d' },
  '5m': { interval: '5m', range: '5d' },
  '15m': { interval: '15m', range: '1mo' },
  '30m': { interval: '30m', range: '1mo' },
  '1h': { interval: '60m', range: '3mo' },
  '4h': { interval: '4h', range: '6mo' },
  '1d': { interval: '1d', range: 'max' },
  '1w': { interval: '1w', range: 'max' },
};

interface FetchCandlesResult {
  candles: TerminalCandle[];
  hasMore: boolean;
  inceptionDate?: string;
}

async function fetchCandles(
  symbol: SmcSymbol,
  tf: SmcTimeframe,
  signal: AbortSignal,
  opts?: { before?: number; limit?: number }
): Promise<FetchCandlesResult> {
  const goldSpec = GOLD_CFD_PARAMS[tf];
  const beforeQs = opts?.before ? `&before=${Math.floor(opts.before)}` : '';
  const limitQs = `&limit=${opts?.limit ?? 1000}`;

  const endpointsToTry =
    symbol === 'XAUUSD' && !opts?.before
      ? [
          `/api/klines?symbol=${symbol}&interval=${tf}${limitQs}`,
          `/api/gold?interval=${goldSpec.interval}&range=${goldSpec.range}${limitQs}`,
        ]
      : [`/api/klines?symbol=${symbol}&interval=${tf}${beforeQs}${limitQs}`];

  for (const endpoint of endpointsToTry) {
    try {
      const res = await fetch(endpoint, { signal, cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as {
          candles?: Array<{
            time: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume?: number;
          }>;
          hasMore?: boolean;
          inceptionDate?: string;
        };
        if (Array.isArray(json.candles)) {
          const cleaned = sanitizeCandles(
            json.candles
              .filter((c) => !opts?.before || c.time < opts.before)
              .map((c) => ({
                time: c.time as UTCTimestamp,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume,
              }))
          );
          if (opts?.before || cleaned.length >= 10) {
            return {
              candles: cleaned,
              hasMore: Boolean(json.hasMore),
              inceptionDate: json.inceptionDate,
            };
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
    }
  }

  const meta = SYMBOL_OPTIONS.find((s) => s.value === symbol);
  if (!meta?.isCrypto) return { candles: [], hasMore: false };

  const fetchDirectBinance = async (endTimeMs?: number) => {
    const endQs = endTimeMs !== undefined ? `&endTime=${endTimeMs}` : '';
    const endpoints = [
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=1000${endQs}`,
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=1000${endQs}`,
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { signal });
        if (!res.ok) continue;
        const raw = (await res.json()) as [number, string, string, string, string, string][];
        if (!Array.isArray(raw)) continue;
        return sanitizeCandles(
          raw.map((d) => ({
            time: Math.floor(d[0] / 1000) as UTCTimestamp,
            open: Number(d[1]),
            high: Number(d[2]),
            low: Number(d[3]),
            close: Number(d[4]),
            volume: Number(d[5]),
          }))
        );
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') throw err;
      }
    }
    return null;
  };

  if (!opts?.before && (tf === '1d' || tf === '1w')) {
    const combined: TerminalCandle[] = [];
    let cursorEndMs: number | undefined;
    for (let page = 0; page < 6; page += 1) {
      const batch = await fetchDirectBinance(cursorEndMs);
      if (!batch || batch.length === 0) break;
      combined.push(...batch);
      if (batch.length < 1000) break;
      cursorEndMs = batch[0].time * 1000 - 1;
    }
    return { candles: sanitizeCandles(combined), hasMore: false };
  }

  const endMs = opts?.before ? (opts.before - 1) * 1000 : undefined;
  const batch = await fetchDirectBinance(endMs);
  if (!batch) return { candles: [], hasMore: false };
  const filtered = opts?.before ? batch.filter((c) => c.time < opts.before!) : batch;
  return {
    candles: sanitizeCandles(filtered),
    hasMore: batch.length >= 1000,
  };
}

function formatTerminalPrice(val: number | null, precision = 2): string {
  if (val === null || !Number.isFinite(val)) return '--.--';
  return val.toFixed(precision);
}

const ProSmcTerminalInner: React.FC<ProSmcTerminalProps> = ({
  externalTvSymbol,
  onSelectTvSymbol,
  onTelemetryChange,
  themeMode = 'light',
  onChangeThemeMode,
}) => {
  const [symbol, setSymbol] = useState<SmcSymbol>(() => mapTvSymbolToSmc(externalTvSymbol) ?? 'XAUUSD');
  const [timeframe, setTimeframe] = useState<SmcTimeframe>('15m');
  const [showSupportResistance, setShowSupportResistance] = useState(true);
  const [showPatterns, setShowPatterns] = useState(true);
  const [showSwingLabels, setShowSwingLabels] = useState(false);
  const [showBosChoch, setShowBosChoch] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // On-Chart Technical Indicators (all disabled by default)
  const [showEma20, setShowEma20] = useState(false);
  const [showEma50, setShowEma50] = useState(false);
  const [showEma200, setShowEma200] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showRsi, setShowRsi] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [liveRsi, setLiveRsi] = useState<number | null>(null);
  const [indicatorValues, setIndicatorValues] = useState<{
    ema20?: number;
    ema50?: number;
    ema200?: number;
    bbUpper?: number;
    bbLower?: number;
  }>({});

  const [crosshairReadout, setCrosshairReadout] = useState<CrosshairReadout | null>(null);

  // Bar Replay, Full-Screen & 2-Chart Split View
  const [replayActive, setReplayActive] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayTotal, setReplayTotal] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);
  const [splitView, setSplitView] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [isBullTick, setIsBullTick] = useState<boolean>(true);
  const [latestBarSnapshot, setLatestBarSnapshot] = useState<TerminalCandle | null>(null);
  const [streamStatus, setStreamStatus] = useState<'CONNECTING' | 'LIVE WS' | 'RECONNECTING'>('CONNECTING');
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [smc, setSmc] = useState<SmcAnalysisState | null>(null);
  const [structureOverlay, setStructureOverlay] = useState<ChartStructureOverlayData | null>(null);
  const [omye, setOmye] = useState<OmyeEngineState | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadedSpanInfo, setLoadedSpanInfo] = useState<{
    oldestTs: number;
    count: number;
    inceptionDate?: string;
  } | null>(null);

  const terminalSectionRef = useRef<HTMLElement | null>(null);
  const enteredNativeFsRef = useRef(false);
  const savedScrollYRef = useRef<number>(0);
  const lastPriceLineBullRef = useRef<boolean | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbBasisSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);

  const bbUpperPointsRef = useRef<Array<{ time: UTCTimestamp; value: number }>>([]);
  const bbLowerPointsRef = useRef<Array<{ time: UTCTimestamp; value: number }>>([]);
  const fullCandlesRef = useRef<TerminalCandle[]>([]);
  const latestCandlesRef = useRef<TerminalCandle[]>([]);
  const historicalLoadedRef = useRef<boolean>(false);
  const hasMoreHistoryRef = useRef<boolean>(true);
  const isLoadingHistoryRef = useRef<boolean>(false);
  const loadMoreHistoryRef = useRef<(() => void) | null>(null);
  const omyeCandlesRef = useRef<TerminalCandle[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const omyeWsRef = useRef<WebSocket | null>(null);
  const replayActiveRef = useRef<boolean>(replayActive);
  const scheduleOverlayRafRef = useRef<(() => void) | null>(null);
  const overlayRedrawRef = useRef<(() => void) | null>(null);
  const countdownSyncRef = useRef<(() => void) | null>(null);
  const isTouchPanningRef = useRef<boolean>(false);
  const touchPanCooldownUntilRef = useRef<number>(0);
  const lastCrosshairKeyRef = useRef<string>('');
  const lastCrosshairCommitAtRef = useRef<number>(0);

  useEffect(() => {
    replayActiveRef.current = replayActive;
  }, [replayActive]);

  const symbolMeta = SYMBOL_OPTIONS.find((s) => s.value === symbol) ?? SYMBOL_OPTIONS[0];
  const latestBarTime = latestBarSnapshot?.time;

  useEffect(() => {
    onTelemetryChange?.({
      symbol,
      timeframe,
      price: livePrice,
      latestBarTime,
      smc,
      omye,
    });
  }, [symbol, timeframe, livePrice, latestBarTime, smc, omye, onTelemetryChange]);

  useEffect(() => {
    const mapped = mapTvSymbolToSmc(externalTvSymbol);
    if (mapped && mapped !== symbol) {
      setSymbol(mapped);
    }
  }, [externalTvSymbol]);

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;

    const initialChartTheme = getChartThemeOptions(themeMode);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        ...initialChartTheme.layout,
        fontSize: 10.5,
        attributionLogo: false,
      },
      grid: initialChartTheme.grid,
      crosshair: {
        mode: CrosshairMode.Normal,
        ...initialChartTheme.crosshair,
      },
      handleScroll: {
        horzTouchDrag: true,
        vertTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        axisDoubleClickReset: {
          time: true,
          price: true,
        },
      },
      kineticScroll: {
        touch: true,
        mouse: true,
      },
      timeScale: {
        ...initialChartTheme.timeScale,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 7.5,
        minBarSpacing: 1.5,
        maxBarSpacing: 20,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        shiftVisibleRangeOnNewBar: true,
      },
      rightPriceScale: {
        visible: true,
        autoScale: true,
        ...initialChartTheme.rightPriceScale,
        ticksVisible: true,
        entireTextOnly: true,
        alignLabels: true,
        minimumWidth: 64,
        scaleMargins: { top: 0.16, bottom: 0.16 },
      },
    });

    // Native TradingView-synchronized candlesticks + crisp borders/wicks & real-time priceLine
    const candleSeries = chart.addSeries(CandlestickSeries, {
      ...getCandleStyleOptions(themeMode),
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      priceLineColor: '#089981',
      lastValueVisible: true,
    });

    const ema20Series = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 1,
      title: '',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const ema50Series = chart.addSeries(LineSeries, {
      color: '#38BDF8',
      lineWidth: 1,
      title: '',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const ema200Series = chart.addSeries(LineSeries, {
      color: '#C084FC',
      lineWidth: 2,
      title: '',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const bbUpperSeries = chart.addSeries(LineSeries, {
      color: 'rgba(96, 165, 250, 0.85)',
      lineWidth: 1,
      title: '',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const bbBasisSeries = chart.addSeries(LineSeries, {
      color: 'rgba(96, 165, 250, 0.5)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: '',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const bbLowerSeries = chart.addSeries(LineSeries, {
      color: 'rgba(96, 165, 250, 0.85)',
      lineWidth: 1,
      title: '',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;
    ema200SeriesRef.current = ema200Series;
    bbUpperSeriesRef.current = bbUpperSeries;
    bbBasisSeriesRef.current = bbBasisSeries;
    bbLowerSeriesRef.current = bbLowerSeries;

    let rafId: number | null = null;
    const scheduleOverlayTick = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        overlayRedrawRef.current?.();
        countdownSyncRef.current?.();
      });
    };
    scheduleOverlayRafRef.current = scheduleOverlayTick;

    // Passive native listeners keep canvas overlays & countdown locked 1:1 during vertical/price-axis touch drag without React re-renders
    const handleTouchStart = () => {
      isTouchPanningRef.current = true;
      scheduleOverlayTick();
    };
    const handleTouchMove = () => {
      scheduleOverlayTick();
    };
    const handleTouchEnd = () => {
      isTouchPanningRef.current = false;
      touchPanCooldownUntilRef.current = performance.now() + 90;
      scheduleOverlayTick();
    };
    const handlePointerMove = (e: PointerEvent) => {
      if (e.buttons > 0 || e.pointerType === 'touch') {
        scheduleOverlayTick();
      }
    };
    const handleWheel = () => {
      scheduleOverlayTick();
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    el.addEventListener('pointermove', handlePointerMove, { passive: true });
    el.addEventListener('wheel', handleWheel, { passive: true });

    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      scheduleOverlayTick();
      if (
        logicalRange &&
        logicalRange.from < 40 &&
        historicalLoadedRef.current &&
        hasMoreHistoryRef.current &&
        !isLoadingHistoryRef.current &&
        !replayActiveRef.current
      ) {
        loadMoreHistoryRef.current?.();
      }
    });

    chart.subscribeCrosshairMove((param) => {
      scheduleOverlayTick();
      if (!param.point) {
        if (lastCrosshairKeyRef.current !== '') {
          lastCrosshairKeyRef.current = '';
          setCrosshairReadout(null);
        }
        return;
      }

      const now = performance.now();
      // Skip coordinate lookups & React OHLCV updates while actively dragging with finger on mobile
      if (isTouchPanningRef.current || now < touchPanCooldownUntilRef.current) {
        return;
      }

      const priceVal = candleSeries.coordinateToPrice(param.point.y);
      const candleDatum = param.seriesData.get(candleSeries) as
        | CandlestickData<UTCTimestamp>
        | undefined;

      if (priceVal !== null && Number.isFinite(Number(priceVal))) {
        const numericTime = typeof param.time === 'number' ? param.time : null;
        const readoutKey = `${numericTime ?? 'cursor'}|${candleDatum ? `${candleDatum.open}|${candleDatum.close}` : Math.round(Number(priceVal) * 10)}`;
        if (
          readoutKey !== lastCrosshairKeyRef.current &&
          now - lastCrosshairCommitAtRef.current >= 90
        ) {
          lastCrosshairKeyRef.current = readoutKey;
          lastCrosshairCommitAtRef.current = now;
          setCrosshairReadout({
            price: Number(priceVal),
            timeLabel: numericTime ? formatUtcShort(numericTime) : 'Cursor',
            open: candleDatum?.open,
            high: candleDatum?.high,
            low: candleDatum?.low,
            close: candleDatum?.close,
          });
        }
      }
    });

    const syncRetinaSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        chart.resize(Math.floor(w), Math.floor(h));
        scheduleOverlayTick();
      }
    };

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        chart.resize(Math.floor(rect.width), Math.floor(rect.height));
        scheduleOverlayTick();
      }
    });
    ro.observe(el);
    window.addEventListener('resize', syncRetinaSize);
    window.visualViewport?.addEventListener('resize', syncRetinaSize);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      scheduleOverlayRafRef.current = null;
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', syncRetinaSize);
      window.visualViewport?.removeEventListener('resize', syncRetinaSize);
      ro.disconnect();
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema50SeriesRef.current = null;
      ema200SeriesRef.current = null;
      bbUpperSeriesRef.current = null;
      bbBasisSeriesRef.current = null;
      bbLowerSeriesRef.current = null;
      rsiSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartApiRef.current?.applyOptions(getChartThemeOptions(themeMode));
    candleSeriesRef.current?.applyOptions(getCandleStyleOptions(themeMode));
    scheduleOverlayRafRef.current?.();
  }, [themeMode]);

  useEffect(() => {
    candleSeriesRef.current?.applyOptions({
      priceFormat: {
        type: 'price',
        precision: symbolMeta.precision,
        minMove: symbolMeta.minMove,
      },
    });
  }, [symbolMeta.precision, symbolMeta.minMove]);

  const fitCandlesToViewport = useCallback((preserveHistoryIfScrolled = false) => {
    const chart = chartApiRef.current;
    const candles = latestCandlesRef.current;
    if (!chart || candles.length === 0) return;

    const containerW = chartWrapRef.current?.clientWidth || chart.paneSize(0).width || 360;
    const plotW = Math.max(200, containerW - 64);
    const targetVisibleBars = Math.max(38, Math.min(candles.length, 110, Math.round(plotW / 8)));

    chart.priceScale('right').applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.16, bottom: 0.16 },
    });

    if (preserveHistoryIfScrolled) {
      const currentRange = chart.timeScale().getVisibleLogicalRange();
      if (currentRange && currentRange.to < candles.length - 12) {
        const rightIdx = Math.min(candles.length - 1, Math.max(20, currentRange.to));
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, rightIdx - targetVisibleBars),
          to: rightIdx,
        });
        scheduleOverlayRafRef.current?.();
        return;
      }
    }

    if (candles.length > targetVisibleBars) {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - targetVisibleBars),
        to: candles.length - 1 + 5.5,
      });
    } else {
      chart.timeScale().fitContent();
    }
    scheduleOverlayRafRef.current?.();
  }, []);

  const handleZoomIn = useCallback(() => {
    const chart = chartApiRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const span = range.to - range.from;
    const nextSpan = Math.max(16, span * 0.72);
    ts.setVisibleLogicalRange({
      from: range.to - nextSpan,
      to: range.to,
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    const chart = chartApiRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const span = range.to - range.from;
    const maxSpan = Math.max(180, latestCandlesRef.current.length + 10);
    const nextSpan = Math.min(maxSpan, span * 1.38);
    ts.setVisibleLogicalRange({
      from: range.to - nextSpan,
      to: range.to,
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    const chart = chartApiRef.current;
    if (!chart) return;
    chart.priceScale('right').applyOptions({ autoScale: true });
    chart.timeScale().fitContent();
    scheduleOverlayRafRef.current?.();
  }, []);

  const handleJumpLive = useCallback(() => {
    fitCandlesToViewport(false);
  }, [fitCandlesToViewport]);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => {
      const next = !prev;
      if (next) {
        savedScrollYRef.current = window.scrollY || window.pageYOffset || 0;
        const el = terminalSectionRef.current;
        if (el?.requestFullscreen) {
          el.requestFullscreen()
            .then(() => {
              enteredNativeFsRef.current = true;
            })
            .catch(() => {
              enteredNativeFsRef.current = false;
            });
        }
      } else {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        enteredNativeFsRef.current = false;
      }
      return next;
    });
  }, []);

  const prevFullScreenRef = useRef<boolean>(isFullScreen);
  useEffect(() => {
    if (isFullScreen) {
      document.body.classList.add('chart-fullscreen-active');
    } else {
      document.body.classList.remove('chart-fullscreen-active');
    }

    let raf1: number | null = null;
    let raf2: number | null = null;
    const timers: number[] = [];

    const syncChartAfterViewportChange = (refitCandles: boolean) => {
      const el = chartWrapRef.current;
      const chart = chartApiRef.current;
      if (el && chart && el.clientWidth > 0 && el.clientHeight > 0) {
        chart.resize(Math.floor(el.clientWidth), Math.floor(el.clientHeight));
        if (refitCandles) {
          fitCandlesToViewport(true);
        } else {
          chart.priceScale('right').applyOptions({ autoScale: true });
          scheduleOverlayRafRef.current?.();
        }
      }
    };

    if (prevFullScreenRef.current !== isFullScreen) {
      const exitedFullScreen = prevFullScreenRef.current && !isFullScreen;
      prevFullScreenRef.current = isFullScreen;

      if (exitedFullScreen) {
        const restoreY = savedScrollYRef.current;
        if (restoreY > 0) {
          window.requestAnimationFrame(() => window.scrollTo(0, restoreY));
        }
      }

      raf1 = window.requestAnimationFrame(() => {
        syncChartAfterViewportChange(true);
        raf2 = window.requestAnimationFrame(() => syncChartAfterViewportChange(true));
      });
      timers.push(window.setTimeout(() => syncChartAfterViewportChange(true), 120));
      timers.push(window.setTimeout(() => syncChartAfterViewportChange(true), 320));
    }

    if (!isFullScreen) {
      return () => {
        if (raf1 !== null) window.cancelAnimationFrame(raf1);
        if (raf2 !== null) window.cancelAnimationFrame(raf2);
        timers.forEach((id) => window.clearTimeout(id));
        document.body.classList.remove('chart-fullscreen-active');
      };
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        enteredNativeFsRef.current = false;
        setIsFullScreen(false);
      }
    };

    const handleFsChange = () => {
      if (enteredNativeFsRef.current && !document.fullscreenElement) {
        enteredNativeFsRef.current = false;
        setIsFullScreen(false);
        return;
      }
      window.setTimeout(() => syncChartAfterViewportChange(true), 80);
    };

    const handleViewportChange = () => {
      window.setTimeout(() => syncChartAfterViewportChange(true), 100);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('orientationchange', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      if (raf1 !== null) window.cancelAnimationFrame(raf1);
      if (raf2 !== null) window.cancelAnimationFrame(raf2);
      timers.forEach((id) => window.clearTimeout(id));
      document.body.classList.remove('chart-fullscreen-active');
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('orientationchange', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [isFullScreen, fitCandlesToViewport]);

  const syncTechnicalIndicators = useCallback(
    (candles: TerminalCandle[], incrementalTickOnly = false) => {
      const chart = chartApiRef.current;
      if (!chart || candles.length === 0) return;

      // Fast O(1) incremental tick update for EMA & BB when only latest candle close moved
      if (incrementalTickOnly && candles.length >= 200) {
        const tail = candles.slice(-220);
        const lastIdx = tail.length - 1;
        const valsNext: typeof indicatorValues = {};
        if (showEma20 && ema20SeriesRef.current) {
          const pts = calcEmaSeries(tail, 20);
          const pt = pts[pts.length - 1];
          if (pt) {
            ema20SeriesRef.current.update(pt);
            valsNext.ema20 = pt.value;
          }
        }
        if (showEma50 && ema50SeriesRef.current) {
          const pts = calcEmaSeries(tail, 50);
          const pt = pts[pts.length - 1];
          if (pt) {
            ema50SeriesRef.current.update(pt);
            valsNext.ema50 = pt.value;
          }
        }
        if (showBollinger && bbUpperSeriesRef.current && bbBasisSeriesRef.current && bbLowerSeriesRef.current) {
          const bb = calcBollingerSeries(tail, 20, 2);
          const u = bb.upper[bb.upper.length - 1];
          const b = bb.basis[bb.basis.length - 1];
          const l = bb.lower[bb.lower.length - 1];
          if (u && b && l) {
            bbUpperSeriesRef.current.update(u);
            bbBasisSeriesRef.current.update(b);
            bbLowerSeriesRef.current.update(l);
            if (bbUpperPointsRef.current.length > 0 && bbUpperPointsRef.current[bbUpperPointsRef.current.length - 1].time === u.time) {
              bbUpperPointsRef.current[bbUpperPointsRef.current.length - 1] = u;
              bbLowerPointsRef.current[bbLowerPointsRef.current.length - 1] = l;
            }
            valsNext.bbUpper = u.value;
            valsNext.bbLower = l.value;
          }
        }
        if (showRsi && rsiSeriesRef.current) {
          const rsiSlice = calcRsiSeries(candles.slice(-120), 14);
          const lastRsi = rsiSlice[rsiSlice.length - 1];
          if (lastRsi) {
            rsiSeriesRef.current.update(lastRsi);
            setLiveRsi(lastRsi.value);
          }
        }
        if (lastIdx >= 0 && Object.keys(valsNext).length > 0) {
          setIndicatorValues((prev) => ({ ...prev, ...valsNext }));
        }
        scheduleOverlayRafRef.current?.();
        return;
      }

      const nextVals: {
        ema20?: number;
        ema50?: number;
        ema200?: number;
        bbUpper?: number;
        bbLower?: number;
      } = {};

      if (ema20SeriesRef.current) {
        ema20SeriesRef.current.applyOptions({ visible: showEma20 });
        const pts = showEma20 ? calcEmaSeries(candles, 20) : [];
        ema20SeriesRef.current.setData(pts);
        if (pts.length > 0) nextVals.ema20 = pts[pts.length - 1].value;
      }
      if (ema50SeriesRef.current) {
        ema50SeriesRef.current.applyOptions({ visible: showEma50 });
        const pts = showEma50 ? calcEmaSeries(candles, 50) : [];
        ema50SeriesRef.current.setData(pts);
        if (pts.length > 0) nextVals.ema50 = pts[pts.length - 1].value;
      }
      if (ema200SeriesRef.current) {
        ema200SeriesRef.current.applyOptions({ visible: showEma200 });
        const pts = showEma200 ? calcEmaSeries(candles, 200) : [];
        ema200SeriesRef.current.setData(pts);
        if (pts.length > 0) nextVals.ema200 = pts[pts.length - 1].value;
      }

      if (bbUpperSeriesRef.current && bbBasisSeriesRef.current && bbLowerSeriesRef.current) {
        bbUpperSeriesRef.current.applyOptions({ visible: showBollinger });
        bbBasisSeriesRef.current.applyOptions({ visible: showBollinger });
        bbLowerSeriesRef.current.applyOptions({ visible: showBollinger });
        if (showBollinger) {
          const bb = calcBollingerSeries(candles, 20, 2);
          bbUpperSeriesRef.current.setData(bb.upper);
          bbBasisSeriesRef.current.setData(bb.basis);
          bbLowerSeriesRef.current.setData(bb.lower);
          bbUpperPointsRef.current = bb.upper;
          bbLowerPointsRef.current = bb.lower;
          if (bb.upper.length > 0) nextVals.bbUpper = bb.upper[bb.upper.length - 1].value;
          if (bb.lower.length > 0) nextVals.bbLower = bb.lower[bb.lower.length - 1].value;
        } else {
          bbUpperSeriesRef.current.setData([]);
          bbBasisSeriesRef.current.setData([]);
          bbLowerSeriesRef.current.setData([]);
          bbUpperPointsRef.current = [];
          bbLowerPointsRef.current = [];
        }
      }

      setIndicatorValues(nextVals);

      if (showRsi) {
        if (!rsiSeriesRef.current) {
          const rsiSeries = chart.addSeries(
            LineSeries,
            {
              color: '#A78BFA',
              lineWidth: 2,
              title: 'RSI(14)',
              priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
              lastValueVisible: true,
              priceLineVisible: false,
            },
            1
          );
          rsiSeries.createPriceLine({
            price: 70,
            color: 'rgba(242, 54, 69, 0.7)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: '70',
          });
          rsiSeries.createPriceLine({
            price: 50,
            color: 'rgba(139, 149, 165, 0.35)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
          });
          rsiSeries.createPriceLine({
            price: 30,
            color: 'rgba(8, 153, 129, 0.7)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: '30',
          });
          rsiSeriesRef.current = rsiSeries;
          chart.panes()[1]?.setHeight(96);
        }
        const rsiData = calcRsiSeries(candles, 14);
        rsiSeriesRef.current.setData(rsiData);
        setLiveRsi(rsiData.length > 0 ? rsiData[rsiData.length - 1].value : null);
      } else {
        if (rsiSeriesRef.current) {
          try {
            chart.removeSeries(rsiSeriesRef.current);
          } catch {
            // already removed
          }
          rsiSeriesRef.current = null;
        }
        setLiveRsi(null);
      }

      scheduleOverlayRafRef.current?.();
    },
    [showEma20, showEma50, showEma200, showBollinger, showRsi]
  );

  useEffect(() => {
    if (latestCandlesRef.current.length > 0) {
      syncTechnicalIndicators(latestCandlesRef.current, false);
    }
  }, [syncTechnicalIndicators]);

  useEffect(() => {
    scheduleOverlayRafRef.current?.();
  }, [
    showVolumeProfile,
    showSupportResistance,
    showPatterns,
    showSwingLabels,
    showBosChoch,
    timeframe,
    symbol,
  ]);

  const runSmcAnalysis = useCallback((candles: TerminalCandle[]) => {
    if (candles.length < 14) {
      setStructureOverlay(null);
      return;
    }
    const result = analyzeChartStructure(candles);
    if (!result) return;
    setStructureOverlay(result);
    setSmc(result.smc);
    const latest = candles[candles.length - 1];
    setLivePrice(latest.close);
    setIsBullTick(latest.close >= latest.open);
    setLatestBarSnapshot(latest);
    scheduleOverlayRafRef.current?.();
  }, []);

  const syncTechnicalIndicatorsRef = useRef(syncTechnicalIndicators);
  const runSmcAnalysisRef = useRef(runSmcAnalysis);

  useEffect(() => {
    syncTechnicalIndicatorsRef.current = syncTechnicalIndicators;
  }, [syncTechnicalIndicators]);

  useEffect(() => {
    runSmcAnalysisRef.current = runSmcAnalysis;
  }, [runSmcAnalysis]);

  // Replay Mode helpers & timer
  const applyReplaySlice = useCallback(
    (nextIdx: number) => {
      const full = fullCandlesRef.current;
      if (full.length === 0 || !candleSeriesRef.current) return;
      const clamped = Math.max(20, Math.min(full.length, nextIdx));
      const sliced = full.slice(0, clamped);
      latestCandlesRef.current = sliced;
      candleSeriesRef.current.setData(sliced.map(toPureCandle));
      const last = sliced[sliced.length - 1];
      candleSeriesRef.current.applyOptions({
        priceLineColor: last.close >= last.open ? '#089981' : '#F23645',
      });
      syncTechnicalIndicators(sliced, false);
      runSmcAnalysis(sliced);
      setReplayIndex(clamped);
    },
    [runSmcAnalysis, syncTechnicalIndicators]
  );

  const toggleReplayMode = useCallback(() => {
    if (replayActive) {
      setReplayPlaying(false);
      setReplayActive(false);
      const full = fullCandlesRef.current;
      if (full.length > 0 && candleSeriesRef.current) {
        latestCandlesRef.current = full;
        candleSeriesRef.current.setData(full.map(toPureCandle));
        const last = full[full.length - 1];
        candleSeriesRef.current.applyOptions({
          priceLineColor: last.close >= last.open ? '#089981' : '#F23645',
        });
        syncTechnicalIndicators(full, false);
        runSmcAnalysis(full);
      }
      return;
    }

    const full = fullCandlesRef.current;
    if (full.length < 25) return;
    setReplayTotal(full.length);
    setReplayActive(true);
    setReplayPlaying(false);
    const startIdx = Math.max(24, Math.floor(full.length * 0.55));
    applyReplaySlice(startIdx);
  }, [replayActive, applyReplaySlice, runSmcAnalysis, syncTechnicalIndicators]);

  useEffect(() => {
    if (!replayActive || !replayPlaying) return;
    const ms = replaySpeed === 1 ? 700 : replaySpeed === 2 ? 350 : 160;
    const timer = window.setInterval(() => {
      const fullLen = fullCandlesRef.current.length;
      setReplayIndex((curr) => {
        if (curr >= fullLen) {
          setReplayPlaying(false);
          return curr;
        }
        const next = curr + 1;
        const sliced = fullCandlesRef.current.slice(0, next);
        latestCandlesRef.current = sliced;
        candleSeriesRef.current?.setData(sliced.map(toPureCandle));
        const last = sliced[sliced.length - 1];
        candleSeriesRef.current?.applyOptions({
          priceLineColor: last.close >= last.open ? '#089981' : '#F23645',
        });
        syncTechnicalIndicators(sliced, false);
        runSmcAnalysis(sliced);
        if (next >= fullLen) setReplayPlaying(false);
        return next;
      });
    }, ms);
    return () => window.clearInterval(timer);
  }, [replayActive, replayPlaying, replaySpeed, runSmcAnalysis, syncTechnicalIndicators]);

  // Real-Time WebSocket Engine + Backward Infinite Scroll + Gap Sync on Wake
  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer: number | null = null;
    let watchdogTimer: number | null = null;
    let tickDrawCount = 0;
    let reconnectAttempt = 0;
    let lastMessageAt = Date.now();
    let disposed = false;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setLoadError(null);
    setIsLoadingInitial(true);
    setStreamStatus('CONNECTING');
    setReplayActive(false);
    setReplayPlaying(false);

    historicalLoadedRef.current = false;
    hasMoreHistoryRef.current = true;
    isLoadingHistoryRef.current = false;
    setHasMoreHistory(true);
    setIsLoadingHistory(false);
    setLoadedSpanInfo(null);
    setStructureOverlay(null);
    fullCandlesRef.current = [];
    latestCandlesRef.current = [];
    candleSeriesRef.current?.setData([]);
    ema20SeriesRef.current?.setData([]);
    ema50SeriesRef.current?.setData([]);
    ema200SeriesRef.current?.setData([]);
    bbUpperSeriesRef.current?.setData([]);
    bbBasisSeriesRef.current?.setData([]);
    bbLowerSeriesRef.current?.setData([]);
    rsiSeriesRef.current?.setData([]);
    bbUpperPointsRef.current = [];
    bbLowerPointsRef.current = [];

    const loadOlderHistoryChunk = async () => {
      if (
        disposed ||
        !historicalLoadedRef.current ||
        !hasMoreHistoryRef.current ||
        isLoadingHistoryRef.current ||
        replayActiveRef.current
      ) {
        return;
      }
      const existing = fullCandlesRef.current;
      if (existing.length === 0) return;
      const oldestTs = existing[0].time;

      isLoadingHistoryRef.current = true;
      setIsLoadingHistory(true);

      try {
        const res = await fetchCandles(symbol, timeframe, controller.signal, {
          before: oldestTs,
          limit: 1000,
        });
        if (disposed) return;

        const older = res.candles.filter((c) => c.time < oldestTs);
        if (older.length === 0) {
          hasMoreHistoryRef.current = false;
          setHasMoreHistory(false);
          return;
        }

        const chart = chartApiRef.current;
        const prevRange = chart?.timeScale().getVisibleLogicalRange();

        const prevLen = fullCandlesRef.current.length;
        const merged = sanitizeCandles([...older, ...fullCandlesRef.current]);
        const addedCount = merged.length - prevLen;

        fullCandlesRef.current = merged;
        latestCandlesRef.current = merged;
        setReplayTotal(merged.length);
        candleSeriesRef.current?.setData(merged.map(toPureCandle));

        if (chart && prevRange && addedCount > 0) {
          chart.timeScale().setVisibleLogicalRange({
            from: prevRange.from + addedCount,
            to: prevRange.to + addedCount,
          });
        }

        hasMoreHistoryRef.current = res.hasMore && addedCount > 0;
        setHasMoreHistory(hasMoreHistoryRef.current);
        setLoadedSpanInfo((prev) => ({
          oldestTs: merged[0].time,
          count: merged.length,
          inceptionDate: res.inceptionDate ?? prev?.inceptionDate,
        }));

        syncTechnicalIndicatorsRef.current(merged, false);
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          hasMoreHistoryRef.current = false;
          setHasMoreHistory(false);
        }
      } finally {
        if (!disposed) {
          isLoadingHistoryRef.current = false;
          setIsLoadingHistory(false);
        }
      }
    };

    loadMoreHistoryRef.current = () => {
      void loadOlderHistoryChunk();
    };

    const applyIncomingCandle = (incomingRaw: TerminalCandle, isClosed: boolean) => {
      if (disposed || !candleSeriesRef.current || !historicalLoadedRef.current) return;
      if (
        !Number.isFinite(incomingRaw.time) ||
        !Number.isFinite(incomingRaw.open) ||
        !Number.isFinite(incomingRaw.high) ||
        !Number.isFinite(incomingRaw.low) ||
        !Number.isFinite(incomingRaw.close) ||
        incomingRaw.close <= 0
      ) {
        return;
      }

      const fullArr = fullCandlesRef.current;
      let liveCandle: TerminalCandle = {
        ...incomingRaw,
        high: Math.max(incomingRaw.high, incomingRaw.open, incomingRaw.close),
        low: Math.min(incomingRaw.low, incomingRaw.open, incomingRaw.close),
      };

      if (fullArr.length > 0) {
        const lastFull = fullArr[fullArr.length - 1];
        if (liveCandle.time < lastFull.time) {
          return;
        }
        if (lastFull.time === liveCandle.time) {
          liveCandle = {
            ...liveCandle,
            open: lastFull.open,
            high: Math.max(lastFull.high, liveCandle.high),
            low: Math.min(lastFull.low, liveCandle.low),
          };
          fullArr[fullArr.length - 1] = liveCandle;
        } else {
          fullArr.push(liveCandle);
        }
      } else {
        fullArr.push(liveCandle);
      }

      if (replayActiveRef.current) {
        setReplayTotal(fullArr.length);
        return;
      }

      // Update Lightweight Charts series & only mutate priceLineColor when bull/bear flips
      const isBull = liveCandle.close >= liveCandle.open;
      candleSeriesRef.current.update(toPureCandle(liveCandle));
      if (lastPriceLineBullRef.current !== isBull) {
        lastPriceLineBullRef.current = isBull;
        candleSeriesRef.current.applyOptions({
          priceLineColor: isBull ? '#089981' : '#F23645',
        });
      }

      const arr = latestCandlesRef.current;
      let isNewBar = false;
      if (arr.length > 0) {
        const last = arr[arr.length - 1];
        if (last.time === liveCandle.time) {
          arr[arr.length - 1] = liveCandle;
        } else if (liveCandle.time > last.time) {
          arr.push(liveCandle);
          isNewBar = true;
        }
      } else {
        arr.push(liveCandle);
      }

      setLivePrice(liveCandle.close);
      setIsBullTick(isBull);
      setLatestBarSnapshot(liveCandle);

      setSmc((prev) => {
        if (!prev) return prev;
        const entry = liveCandle.close;
        if (prev.trend === 1) {
          const sl = prev.sl < entry ? prev.sl : entry * 0.992;
          const risk = Math.max(entry * 0.0025, entry - sl);
          return { ...prev, entry, sl, tp: entry + risk * 2 };
        }
        const sl = prev.sl > entry ? prev.sl : entry * 1.008;
        const risk = Math.max(entry * 0.0025, sl - entry);
        return { ...prev, entry, sl, tp: Math.max(0.0001, entry - risk * 2) };
      });

      if (timeframe === '1m') {
        const snap = computeOmyeSnapshot(arr, 'LIVE 1m WS');
        if (snap) setOmye(snap);
      }

      tickDrawCount += 1;
      // Refresh canvas overlay on every single tick for zero-lag live price beam sync
      scheduleOverlayRafRef.current?.();

      if (isClosed || isNewBar) {
        syncTechnicalIndicatorsRef.current(arr, false);
        runSmcAnalysisRef.current(arr);
        setLoadedSpanInfo((prev) =>
          prev ? { ...prev, count: fullCandlesRef.current.length } : prev
        );
      } else if (tickDrawCount % 3 === 0 && arr.length >= 2) {
        syncTechnicalIndicatorsRef.current(arr, true);
      }
    };

    const syncMissedBarsAfterWake = async () => {
      if (disposed || !historicalLoadedRef.current || replayActiveRef.current) return;
      try {
        const fresh = await fetchCandles(symbol, timeframe, controller.signal, { limit: 250 });
        if (disposed || fresh.candles.length === 0) return;
        const chart = chartApiRef.current;
        const prevRange = chart?.timeScale().getVisibleLogicalRange();
        const prevLen = fullCandlesRef.current.length;
        const merged = sanitizeCandles([...fullCandlesRef.current, ...fresh.candles]);
        if (merged.length >= prevLen) {
          fullCandlesRef.current = merged;
          latestCandlesRef.current = merged;
          setReplayTotal(merged.length);
          candleSeriesRef.current?.setData(merged.map(toPureCandle));
          if (chart && prevRange) {
            chart.timeScale().setVisibleLogicalRange(prevRange);
          }
          syncTechnicalIndicatorsRef.current(merged, false);
          runSmcAnalysisRef.current(merged);
          setLoadedSpanInfo((prev) =>
            prev ? { ...prev, count: merged.length } : prev
          );
        }
      } catch {
        // ignore transient wake-sync failure
      }
    };

    let goldPollTimer: number | null = null;
    const startGoldFallbackPoll = () => {
      if (goldPollTimer !== null || disposed) return;
      goldPollTimer = window.setInterval(() => {
        if (disposed) return;
        fetchCandles(symbol, timeframe, controller.signal, { limit: 50 })
          .then((fresh) => {
            if (disposed || fresh.candles.length === 0) return;
            lastMessageAt = Date.now();
            const latest = fresh.candles[fresh.candles.length - 1];
            applyIncomingCandle(latest, false);
          })
          .catch(() => {
            // ignore poll errors
          });
      }, 2500);
    };

    const scheduleReconnect = (connectFn: () => void) => {
      if (disposed) return;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      const delay = Math.min(5000, 800 * Math.pow(1.6, reconnectAttempt));
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connectFn, delay);
    };

    const connectBackendMarketWs = () => {
      if (disposed) return;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${wsProto}//${window.location.host}/ws/market?symbol=${encodeURIComponent(
        symbol
      )}&interval=${encodeURIComponent(timeframe)}`;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (disposed) return;
          reconnectAttempt = 0;
          lastMessageAt = Date.now();
          setStreamStatus('LIVE WS');
          if (goldPollTimer !== null) {
            window.clearInterval(goldPollTimer);
            goldPollTimer = null;
          }
        };

        ws.onmessage = (event) => {
          if (disposed) return;
          lastMessageAt = Date.now();
          try {
            const parsed = JSON.parse(event.data as string) as {
              type?: string;
              candle?: {
                time: number;
                open: number;
                high: number;
                low: number;
                close: number;
                volume?: number;
              };
              isClosed?: boolean;
            };
            if (parsed.type === 'heartbeat') {
              setStreamStatus('LIVE WS');
              return;
            }
            if (parsed.type === 'kline' && parsed.candle) {
              setStreamStatus('LIVE WS');
              applyIncomingCandle(
                {
                  time: parsed.candle.time as UTCTimestamp,
                  open: parsed.candle.open,
                  high: parsed.candle.high,
                  low: parsed.candle.low,
                  close: parsed.candle.close,
                  volume: parsed.candle.volume,
                },
                Boolean(parsed.isClosed)
              );
            }
          } catch {
            // ignore malformed frame
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          setStreamStatus('RECONNECTING');
          startGoldFallbackPoll();
          scheduleReconnect(connectBackendMarketWs);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setStreamStatus('RECONNECTING');
        startGoldFallbackPoll();
        scheduleReconnect(connectBackendMarketWs);
      }
    };

    const connectWebSocket = () => {
      if (disposed) return;
      if (symbolMeta.isCrypto) {
        const stream = `${symbol.toLowerCase()}@kline_${timeframe}`;
        try {
          const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
          wsRef.current = ws;

          ws.onopen = () => {
            if (!disposed) {
              reconnectAttempt = 0;
              lastMessageAt = Date.now();
              setStreamStatus('LIVE WS');
            }
          };

          ws.onmessage = (event) => {
            if (disposed) return;
            lastMessageAt = Date.now();
            try {
              const parsed = JSON.parse(event.data as string) as {
                k?: { t: number; o: string; h: string; l: string; c: string; v?: string; x?: boolean };
              };
              const k = parsed?.k;
              if (!k) return;
              applyIncomingCandle(
                {
                  time: Math.floor(k.t / 1000) as UTCTimestamp,
                  open: parseFloat(k.o),
                  high: parseFloat(k.h),
                  low: parseFloat(k.l),
                  close: parseFloat(k.c),
                  volume: k.v ? parseFloat(k.v) : undefined,
                },
                Boolean(k.x)
              );
            } catch {
              // ignore
            }
          };

          ws.onerror = () => {
            ws.close();
          };

          ws.onclose = () => {
            if (!disposed) {
              setStreamStatus('RECONNECTING');
              connectBackendMarketWs();
            }
          };
          return;
        } catch {
          // fallback to backend relay
        }
      }
      connectBackendMarketWs();
    };

    // Heartbeat watchdog: auto-recover frozen or half-open sockets after 11s silence
    watchdogTimer = window.setInterval(() => {
      if (disposed || !historicalLoadedRef.current) return;
      if (Date.now() - lastMessageAt > 11000) {
        setStreamStatus('RECONNECTING');
        if (wsRef.current) {
          try {
            wsRef.current.close();
          } catch {
            // ignore
          }
          wsRef.current = null;
        }
        connectWebSocket();
      }
    }, 5000);

    const handleVisibilityOrOnline = () => {
      if (disposed) return;
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        void syncMissedBarsAfterWake();
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connectWebSocket();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);

    fetchCandles(symbol, timeframe, controller.signal)
      .then((res) => {
        if (disposed) return;
        setIsLoadingInitial(false);
        const candles = res.candles;
        if (candles.length === 0) {
          setLoadError(`Unable to load live ${symbol} candlesticks.`);
          return;
        }

        fullCandlesRef.current = [...candles];
        latestCandlesRef.current = [...candles];
        setReplayTotal(candles.length);
        candleSeriesRef.current?.setData(candles.map(toPureCandle));
        const latest = candles[candles.length - 1];
        const initBull = latest.close >= latest.open;
        lastPriceLineBullRef.current = initBull;
        candleSeriesRef.current?.applyOptions({
          priceLineColor: initBull ? '#089981' : '#F23645',
        });

        historicalLoadedRef.current = true;
        hasMoreHistoryRef.current = res.hasMore;
        setHasMoreHistory(res.hasMore);
        setLoadedSpanInfo({
          oldestTs: candles[0].time,
          count: candles.length,
          inceptionDate: res.inceptionDate,
        });

        const applyInitialRange = () => {
          if (disposed) return;
          fitCandlesToViewport(false);
        };

        applyInitialRange();
        window.requestAnimationFrame(applyInitialRange);
        syncTechnicalIndicatorsRef.current(candles, false);
        runSmcAnalysisRef.current(candles);
        connectWebSocket();
      })
      .catch((err) => {
        if (!disposed && (err as Error)?.name !== 'AbortError') {
          setIsLoadingInitial(false);
          setLoadError(`Failed to load ${symbol} chart data.`);
        }
      });

    return () => {
      disposed = true;
      loadMoreHistoryRef.current = null;
      controller.abort();
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (watchdogTimer !== null) window.clearInterval(watchdogTimer);
      if (goldPollTimer !== null) window.clearInterval(goldPollTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, timeframe, symbolMeta.isCrypto, reloadNonce]);

  // Dedicated Live OMYE (One-Minute Market Engine) WebSocket feed when main chart is > 1m
  useEffect(() => {
    if (timeframe === '1m') {
      if (omyeWsRef.current) {
        omyeWsRef.current.close();
        omyeWsRef.current = null;
      }
      if (latestCandlesRef.current.length >= 16) {
        const snap = computeOmyeSnapshot(latestCandlesRef.current, 'LIVE 1m WS');
        if (snap) setOmye(snap);
      }
      return;
    }

    const controller = new AbortController();
    let reconnectTimer: number | null = null;
    let disposed = false;

    const apply1mCandle = (bar: TerminalCandle) => {
      if (disposed) return;
      const arr = omyeCandlesRef.current;
      if (arr.length > 0) {
        const last = arr[arr.length - 1];
        if (last.time === bar.time) {
          arr[arr.length - 1] = bar;
        } else if (bar.time > last.time) {
          arr.push(bar);
          if (arr.length > 90) arr.shift();
        }
      } else {
        arr.push(bar);
      }
      const snap = computeOmyeSnapshot(arr, 'LIVE 1m WS');
      if (snap) setOmye(snap);
    };

    const connectBackend1mWs = () => {
      if (disposed) return;
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${wsProto}//${window.location.host}/ws/market?symbol=${encodeURIComponent(
        symbol
      )}&interval=1m`;
      try {
        const ws = new WebSocket(url);
        omyeWsRef.current = ws;
        ws.onmessage = (ev) => {
          if (disposed) return;
          try {
            const parsed = JSON.parse(ev.data as string) as {
              type?: string;
              candle?: { time: number; open: number; high: number; low: number; close: number };
            };
            if (parsed.type === 'kline' && parsed.candle) {
              apply1mCandle({
                time: parsed.candle.time as UTCTimestamp,
                open: parsed.candle.open,
                high: parsed.candle.high,
                low: parsed.candle.low,
                close: parsed.candle.close,
              });
            }
          } catch {
            // ignore
          }
        };
        ws.onclose = () => {
          if (!disposed) reconnectTimer = window.setTimeout(connectBackend1mWs, 2500);
        };
        ws.onerror = () => ws.close();
      } catch {
        // ignore
      }
    };

    const connect1mStream = () => {
      if (disposed) return;
      if (symbolMeta.isCrypto) {
        try {
          const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_1m`);
          omyeWsRef.current = ws;
          ws.onmessage = (ev) => {
            if (disposed) return;
            try {
              const k = (JSON.parse(ev.data as string) as {
                k?: { t: number; o: string; h: string; l: string; c: string };
              })?.k;
              if (!k) return;
              apply1mCandle({
                time: Math.floor(k.t / 1000) as UTCTimestamp,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
              });
            } catch {
              // ignore
            }
          };
          ws.onclose = () => {
            if (!disposed) connectBackend1mWs();
          };
          ws.onerror = () => ws.close();
          return;
        } catch {
          // fallback
        }
      }
      connectBackend1mWs();
    };

    fetchCandles(symbol, '1m', controller.signal)
      .then((res) => {
        if (disposed) return;
        const bars = res.candles;
        if (bars.length > 0) {
          omyeCandlesRef.current = bars.slice(-90);
          const snap = computeOmyeSnapshot(omyeCandlesRef.current, 'SYNCING');
          if (snap) setOmye(snap);
        }
        connect1mStream();
      })
      .catch(() => {
        if (!disposed) connect1mStream();
      });

    return () => {
      disposed = true;
      controller.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (omyeWsRef.current) {
        omyeWsRef.current.close();
        omyeWsRef.current = null;
      }
    };
  }, [symbol, timeframe, symbolMeta.isCrypto, reloadNonce]);

  const activeLegendBar = useMemo(() => {
    if (crosshairReadout?.open !== undefined) {
      return {
        open: crosshairReadout.open,
        high: crosshairReadout.high ?? crosshairReadout.open,
        low: crosshairReadout.low ?? crosshairReadout.open,
        close: crosshairReadout.close ?? crosshairReadout.open,
      };
    }
    return latestBarSnapshot;
  }, [crosshairReadout, latestBarSnapshot]);

  const activeLegendDeltaPct = useMemo(() => {
    if (!activeLegendBar || activeLegendBar.open <= 0) return null;
    return ((activeLegendBar.close - activeLegendBar.open) / activeLegendBar.open) * 100;
  }, [activeLegendBar]);

  const liveCandleMove = useMemo(() => {
    if (!latestBarSnapshot) return null;
    const delta = latestBarSnapshot.close - latestBarSnapshot.open;
    const range = Math.max(0, latestBarSnapshot.high - latestBarSnapshot.low);
    return {
      delta,
      range,
      isBull: delta >= 0,
    };
  }, [latestBarSnapshot]);

  const currentTfLabel = TIMEFRAME_OPTIONS.find((t) => t.value === timeframe)?.label ?? timeframe;

  return (
    <section
      ref={terminalSectionRef}
      aria-label="Varta Presh Trading Terminal"
      className={
        isFullScreen
          ? 'fixed inset-0 z-[200] flex flex-col w-full h-full bg-[var(--vp-canvas)] text-[var(--vp-text)] overflow-hidden'
          : 'vp-glass-card rounded-2xl overflow-hidden text-[var(--vp-text)]'
      }
    >
      {/* Top Controls Bar — hidden in Full Screen */}
      {!isFullScreen && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-[var(--vp-header)] border-b border-[var(--vp-border)] transition-colors duration-200">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto no-scrollbar">
            <select
              aria-label="Select trading symbol"
              value={symbol}
              onChange={(e) => {
                const nextSym = e.target.value as SmcSymbol;
                setSymbol(nextSym);
                const found = SYMBOL_OPTIONS.find((opt) => opt.value === nextSym);
                if (found) onSelectTvSymbol?.(found.tvSymbol);
              }}
              className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-control)] text-[var(--vp-text)] px-2.5 py-1.5 text-xs font-bold outline-none cursor-pointer transition-colors hover:border-[#F59E0B]/50 shrink-0"
            >
              {SYMBOL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label="Chart timeframes"
              className="flex items-center gap-0.5 rounded-lg bg-[var(--vp-canvas)]/70 p-0.5 border border-[var(--vp-border)] shrink-0"
            >
              {TIMEFRAME_OPTIONS.map((tf) => {
                const active = timeframe === tf.value;
                return (
                  <button
                    key={tf.value}
                    type="button"
                    onClick={() => setTimeframe(tf.value)}
                    aria-pressed={active}
                    className={`rounded-md px-2.5 py-1 text-xs font-mono-tabular font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#FACC15] text-[#0B0E14] shadow-sm'
                        : 'text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
                    }`}
                  >
                    {tf.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono-tabular font-semibold">
              <span
                className={`h-2 w-2 rounded-full ${
                  streamStatus === 'LIVE WS'
                    ? 'bg-[#089981] animate-pulse shadow-[0_0_8px_#089981]'
                    : 'bg-[#F59E0B]'
                }`}
              />
              <span style={{ color: streamStatus === 'LIVE WS' ? 'var(--vp-bull)' : 'var(--vp-accent-text)' }}>
                {streamStatus}
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5">
              <div
                className="font-mono-tabular text-[15px] font-bold tracking-tight"
                style={{ color: isBullTick ? 'var(--vp-bull)' : 'var(--vp-bear)' }}
              >
                ${formatTerminalPrice(livePrice, symbolMeta.precision)}
              </div>
              <HeaderCountdownChip
                timeframe={timeframe}
                latestBarTime={latestBarTime}
                currentTfLabel={currentTfLabel}
                isBullTick={isBullTick}
              />
            </div>

            <button
              type="button"
              onClick={toggleFullScreen}
              aria-label="Enter Full Screen"
              title="Full Screen"
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2.5 text-xs font-semibold text-[var(--vp-text)] hover:border-[#F59E0B]/60 cursor-pointer whitespace-nowrap"
            >
              <Maximize2 className="h-3.5 w-3.5 text-[var(--vp-accent-text)]" />
              <span className="hidden sm:inline">Full Screen</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Chart Settings"
              title="Chart Settings"
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2.5 text-xs font-semibold text-[var(--vp-text)] hover:border-[#F59E0B]/60 cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5 text-[var(--vp-accent-text)]" />
            </button>
          </div>
        </div>
      )}

      {/* Indicators, Structure Overlays & Tools Bar — hidden in Full Screen */}
      {!isFullScreen && (
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 bg-[var(--vp-surface)] border-b border-[var(--vp-border)] overflow-x-auto no-scrollbar transition-colors duration-200">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowSupportResistance((v) => !v)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showSupportResistance
                  ? 'bg-[#089981]/15 border-[#089981]/55 text-[var(--vp-bull)]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)]'
              }`}
            >
              S/R
            </button>
            <button
              type="button"
              onClick={() => setShowPatterns((v) => !v)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showPatterns
                  ? 'bg-[#F59E0B]/15 border-[#F59E0B]/55 text-[var(--vp-accent-text)]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)]'
              }`}
            >
              Patterns
            </button>
            <button
              type="button"
              onClick={() => setShowSwingLabels((v) => !v)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showSwingLabels
                  ? 'bg-[#089981]/15 border-[#089981]/55 text-[var(--vp-bull)]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)]'
              }`}
            >
              HH/HL/LH/LL
            </button>
            <button
              type="button"
              onClick={() => setShowBosChoch((v) => !v)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showBosChoch
                  ? 'bg-[#F59E0B]/15 border-[#F59E0B]/55 text-[var(--vp-accent-text)]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)]'
              }`}
            >
              BOS/CHoCH
            </button>

            <span className="h-4 w-[1px] bg-[var(--vp-border)] mx-0.5" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setShowEma20((v) => !v)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showEma20
                  ? 'bg-[#F59E0B]/15 border-[#F59E0B]/60 text-[var(--vp-accent-text)]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
              }`}
            >
              EMA 20
            </button>
            <button
              type="button"
              onClick={() => setShowEma50((v) => !v)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showEma50
                  ? 'bg-[#38BDF8]/15 border-[#38BDF8]/60 text-[#0284C7] dark:text-[#38BDF8]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
              }`}
            >
              EMA 50
            </button>
            <button
              type="button"
              onClick={() => setShowEma200((v) => !v)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showEma200
                  ? 'bg-[#C084FC]/15 border-[#C084FC]/60 text-[#9333EA] dark:text-[#C084FC]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
              }`}
            >
              EMA 200
            </button>
            <button
              type="button"
              onClick={() => setShowBollinger((v) => !v)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showBollinger
                  ? 'bg-[#60A5FA]/15 border-[#60A5FA]/60 text-[#2563EB] dark:text-[#60A5FA]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
              }`}
            >
              BB (20,2)
            </button>
            <button
              type="button"
              onClick={() => setShowRsi((v) => !v)}
              className={`rounded-md inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showRsi
                  ? 'bg-[#A78BFA]/15 border-[#A78BFA]/60 text-[#7C3AED] dark:text-[#A78BFA]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
              }`}
            >
              <Activity className="h-3 w-3" />
              <span className="font-mono-tabular">
                RSI{showRsi && liveRsi !== null ? ` ${liveRsi.toFixed(1)}` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowVolumeProfile((v) => !v)}
              className={`rounded-md inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                showVolumeProfile
                  ? 'bg-[#089981]/15 border-[#089981]/60 text-[var(--vp-bull)]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
              }`}
            >
              <BarChart2 className="h-3 w-3" />
              Vol Profile
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleReplayMode}
              className={`rounded-md inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                replayActive
                  ? 'bg-[#F59E0B] border-[#F59E0B] text-[#0B0E14]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-text)] hover:border-[#F59E0B]/60'
              }`}
            >
              <Play className="h-3 w-3" />
              Replay
            </button>
            <button
              type="button"
              onClick={() => setSplitView((v) => !v)}
              className={`rounded-md inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap cursor-pointer border transition-colors ${
                splitView
                  ? 'bg-[#089981]/15 border-[#089981]/60 text-[var(--vp-bull)]'
                  : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-text)] hover:border-[#089981]/60'
              }`}
            >
              <Columns2 className="h-3 w-3" />
              Split
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace: Chart(s) + Compact Live OMYE & SMC Sidebar */}
      <div className={isFullScreen ? 'flex-1 min-h-0 flex w-full h-full' : 'flex flex-col lg:flex-row lg:h-[580px]'}>
        <div
          className={`flex-1 min-w-0 min-h-0 ${
            isFullScreen
              ? 'flex h-full w-full'
              : `grid gap-0 border-b lg:border-b-0 lg:border-r border-[var(--vp-border)] ${
                  splitView ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                }`
          }`}
        >
          {/* Primary Chart Pane */}
          <div
            className={`relative min-w-0 min-h-0 overflow-hidden ${
              isFullScreen ? 'flex-1 h-full w-full' : 'h-[400px] sm:h-[460px] lg:h-full'
            } ${splitView && !isFullScreen ? 'border-b md:border-b-0 md:border-r border-[var(--vp-border)]' : ''}`}
          >
            <div ref={chartWrapRef} className="smc-chart-host absolute inset-0 touch-none" />

            {/* Full Screen Top Bar inside Chart: Permanent 1m–1D Timeframe Selector + Exit Full Screen */}
            {isFullScreen && (
              <div className="pointer-events-none absolute top-2 left-2 right-[66px] z-[60] flex items-center justify-between gap-1.5">
                <div
                  role="group"
                  aria-label="In-chart timeframe selector"
                  className="pointer-events-auto inline-flex min-w-0 flex-1 max-w-fit items-center gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar rounded-lg border border-[var(--vp-border)] bg-[var(--vp-header)]/95 p-0.5 sm:p-1 shadow-xl touch-pan-x"
                >
                  {IN_CHART_TIMEFRAMES.map((tf) => {
                    const active = timeframe === tf.value;
                    return (
                      <button
                        key={`in-chart-fs-${tf.value}`}
                        type="button"
                        onClick={() => setTimeframe(tf.value)}
                        aria-pressed={active}
                        className={`rounded-md px-2 sm:px-2.5 py-1 text-[11px] font-mono-tabular font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#FACC15] text-[#0B0E14] shadow-[0_0_12px_rgba(250,204,21,0.45)]'
                            : 'text-[var(--vp-muted)] hover:text-[var(--vp-text)] hover:bg-[var(--vp-control)]/70'
                        }`}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={toggleFullScreen}
                  aria-label="Exit Full Screen"
                  className="pointer-events-auto inline-flex min-h-[34px] sm:min-h-[38px] items-center gap-1.5 rounded-full border border-[#F59E0B]/70 bg-[var(--vp-header)]/95 px-2.5 sm:px-3.5 py-1 text-[11px] sm:text-xs font-bold text-[var(--vp-text)] shadow-2xl hover:opacity-90 active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--vp-accent-text)]" />
                  <span className="sm:hidden">Exit</span>
                  <span className="hidden sm:inline">Exit Full Screen</span>
                </button>
              </div>
            )}

            {/* 4K Retina High-DPI Collision-Free Canvas Layer (Indicators, VPVR, S/R, SMC, Patterns, Live Beam) */}
            <ChartCanvasOverlay
              redrawRef={overlayRedrawRef}
              chart={chartApiRef.current}
              candleSeries={candleSeriesRef.current}
              candles={latestCandlesRef.current}
              symbol={symbol}
              timeframe={timeframe}
              structure={structureOverlay}
              bbUpper={bbUpperPointsRef.current}
              bbLower={bbLowerPointsRef.current}
              showBollinger={showBollinger}
              showVolumeProfile={showVolumeProfile}
              showSupportResistance={showSupportResistance}
              showPatterns={showPatterns}
              showSwingLabels={showSwingLabels}
              showBosChoch={showBosChoch}
              precision={symbolMeta.precision}
              themeMode={themeMode}
              livePrice={livePrice}
              isBullTick={isBullTick}
            />

            {/* TradingView-Style Candle Closing Countdown Stacked Directly Under Right-Axis Live Price */}
            <PriceAxisCountdownTag
              syncRef={countdownSyncRef}
              chart={chartApiRef.current}
              candleSeries={candleSeriesRef.current}
              livePrice={livePrice}
              isBullTick={isBullTick}
              timeframe={timeframe}
              latestBarTime={latestBarTime}
            />

            {/* Top-Left Inside-Chart Stack: 1m–1D Timeframe Selector + OHLCV Legend + Active Indicators + Live Candle Points — hidden in Full Screen */}
            {!isFullScreen && (
              <div className="pointer-events-none absolute top-2 left-2 right-16 z-[25] flex flex-col items-start gap-1.5">
                {/* Floating In-Chart Timeframe Selector (1m..1D) at Top Side of Chart */}
                <div
                  role="group"
                  aria-label="In-chart timeframe selector"
                  className="pointer-events-auto inline-flex max-w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-lg border border-[var(--vp-border)] bg-[var(--vp-header)]/95 p-1 shadow-lg touch-pan-x"
                >
                  {IN_CHART_TIMEFRAMES.map((tf) => {
                    const active = timeframe === tf.value;
                    return (
                      <button
                        key={`in-chart-${tf.value}`}
                        type="button"
                        onClick={() => setTimeframe(tf.value)}
                        aria-pressed={active}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-mono-tabular font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#FACC15] text-[#0B0E14] shadow-[0_0_12px_rgba(250,204,21,0.45)]'
                            : 'text-[var(--vp-muted)] hover:text-[var(--vp-text)] hover:bg-[var(--vp-control)]/70'
                        }`}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-mono-tabular">
                    <span className="font-sans font-bold text-[var(--vp-text)]">
                      {symbolMeta.shortLabel} · {currentTfLabel}
                    </span>
                    {activeLegendBar && (
                      <div className="flex flex-wrap items-center gap-x-2 text-[10.5px]">
                        <span className="text-[var(--vp-muted)]">
                          O<span className="text-[var(--vp-text)] ml-0.5">{activeLegendBar.open.toFixed(symbolMeta.precision)}</span>
                        </span>
                        <span className="text-[var(--vp-muted)]">
                          H<span className="text-[var(--vp-bull)] ml-0.5">{activeLegendBar.high.toFixed(symbolMeta.precision)}</span>
                        </span>
                        <span className="text-[var(--vp-muted)]">
                          L<span className="text-[var(--vp-bear)] ml-0.5">{activeLegendBar.low.toFixed(symbolMeta.precision)}</span>
                        </span>
                        <span className="text-[var(--vp-muted)]">
                          C<span className="text-[var(--vp-text)] ml-0.5">{activeLegendBar.close.toFixed(symbolMeta.precision)}</span>
                        </span>
                        {activeLegendDeltaPct !== null && (
                          <span
                            className="font-semibold"
                            style={{ color: activeLegendDeltaPct >= 0 ? 'var(--vp-bull)' : 'var(--vp-bear)' }}
                          >
                            {activeLegendDeltaPct >= 0 ? '+' : ''}
                            {activeLegendDeltaPct.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {(showEma20 || showEma50 || showEma200 || showBollinger || showRsi) && (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] font-mono-tabular">
                      {showEma20 && indicatorValues.ema20 !== undefined && (
                        <span className="text-[#F59E0B]">
                          EMA20 {indicatorValues.ema20.toFixed(symbolMeta.precision)}
                        </span>
                      )}
                      {showEma50 && indicatorValues.ema50 !== undefined && (
                        <span className="text-[#38BDF8]">
                          EMA50 {indicatorValues.ema50.toFixed(symbolMeta.precision)}
                        </span>
                      )}
                      {showEma200 && indicatorValues.ema200 !== undefined && (
                        <span className="text-[#C084FC]">
                          EMA200 {indicatorValues.ema200.toFixed(symbolMeta.precision)}
                        </span>
                      )}
                      {showBollinger && indicatorValues.bbUpper !== undefined && indicatorValues.bbLower !== undefined && (
                        <span className="text-[#60A5FA]">
                          BB {indicatorValues.bbUpper.toFixed(symbolMeta.precision)} / {indicatorValues.bbLower.toFixed(symbolMeta.precision)}
                        </span>
                      )}
                      {showRsi && liveRsi !== null && (
                        <span className="text-[#A78BFA]">RSI(14) {liveRsi.toFixed(1)}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Compact Live Forming Candle Points Badge */}
                {liveCandleMove && (
                  <div
                    aria-label="Live candle points moved"
                    className="pointer-events-none inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9.5px] leading-tight font-mono-tabular font-bold shadow-sm"
                    style={{
                      borderColor: liveCandleMove.isBull
                        ? 'rgba(8, 153, 129, 0.45)'
                        : 'rgba(242, 54, 69, 0.45)',
                      backgroundColor: 'var(--vp-header)',
                      color: liveCandleMove.isBull ? 'var(--vp-bull)' : 'var(--vp-bear)',
                    }}
                  >
                    <span
                      className="h-1 w-1 rounded-full shrink-0"
                      style={{
                        backgroundColor: liveCandleMove.isBull ? '#089981' : '#F23645',
                      }}
                    />
                    <span>
                      {liveCandleMove.delta >= 0 ? '+' : '-'}
                      {Math.abs(liveCandleMove.delta).toFixed(symbolMeta.precision)} pts
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Floating Bar Replay Simulator Controls — hidden in Full Screen */}
            {!isFullScreen && replayActive && (
              <div className="absolute top-24 sm:top-20 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-[var(--vp-header)]/95 px-3 py-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => setReplayPlaying((p) => !p)}
                  className="vp-pill-btn inline-flex h-6 items-center gap-1 bg-[#F59E0B] px-2.5 text-[11px] font-bold text-[#0B0E14] cursor-pointer"
                >
                  {replayPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {replayPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={() => applyReplaySlice(replayIndex + 1)}
                  disabled={replayIndex >= replayTotal}
                  className="vp-pill-btn inline-flex h-6 items-center gap-0.5 bg-[var(--vp-control)] px-2 text-[11px] font-semibold text-[var(--vp-text)] hover:opacity-85 disabled:opacity-40 cursor-pointer"
                >
                  <SkipForward className="h-3 w-3" />
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setReplaySpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
                  className="vp-pill-btn h-6 bg-[var(--vp-control)] px-2 text-[10px] font-mono-tabular font-bold text-[#0284C7] dark:text-[#38BDF8] cursor-pointer"
                >
                  {replaySpeed}x
                </button>
                <input
                  type="range"
                  aria-label="Replay bar position"
                  min={20}
                  max={Math.max(20, replayTotal)}
                  value={replayIndex}
                  onChange={(e) => {
                    setReplayPlaying(false);
                    applyReplaySlice(Number(e.target.value));
                  }}
                  className="w-20 sm:w-28 accent-[#F59E0B] cursor-pointer"
                />
                <span className="font-mono-tabular text-[10px] text-[var(--vp-muted)]">
                  {replayIndex}/{replayTotal}
                </span>
                <button
                  type="button"
                  onClick={() => applyReplaySlice(Math.max(24, Math.floor(replayTotal * 0.55)))}
                  title="Restart Replay"
                  className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[var(--vp-control)] text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={toggleReplayMode}
                  title="Exit Replay"
                  className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[var(--vp-control)] text-[var(--vp-bear)] hover:bg-[#F23645]/20 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Bottom In-Chart Controls: Zoom & History Span (Normal Mode) */}
            {!isFullScreen && (
              <div className="absolute bottom-8 left-2.5 right-16 z-[25] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                <div
                  role="group"
                  aria-label="Chart zoom and history controls"
                  className="pointer-events-auto flex items-center gap-1 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-header)]/95 p-1 shadow-md"
                >
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    title="Zoom In"
                    aria-label="Zoom In"
                    className="flex h-6 w-6 items-center justify-center rounded bg-[var(--vp-control)] text-xs font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    title="Zoom Out"
                    aria-label="Zoom Out"
                    className="flex h-6 w-6 items-center justify-center rounded bg-[var(--vp-control)] text-xs font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomReset}
                    title="Fit All Loaded History"
                    aria-label="Fit All Loaded History"
                    className="flex h-6 items-center justify-center rounded bg-[var(--vp-control)] px-2 text-[10px] font-semibold text-[var(--vp-accent-text)] hover:opacity-85 cursor-pointer"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={handleJumpLive}
                    title="Snap to Live Candles"
                    aria-label="Snap to Live Candles"
                    className="flex h-6 items-center justify-center rounded bg-[var(--vp-control)] px-2 text-[10px] font-semibold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                  >
                    Live
                  </button>
                </div>

                {(isLoadingHistory || loadedSpanInfo) && (
                  <div className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-header)]/95 px-2.5 py-1 text-[10px] font-mono-tabular text-[var(--vp-muted)] shadow-md">
                    {isLoadingHistory ? (
                      <span className="text-[var(--vp-accent-text)] font-semibold">
                        Loading older history...
                      </span>
                    ) : loadedSpanInfo ? (
                      <>
                        <span>
                          Since{' '}
                          <strong className="text-[var(--vp-text)]">
                            {new Date(loadedSpanInfo.oldestTs * 1000).toLocaleDateString('en-US', {
                              month: 'short',
                              year: 'numeric',
                              timeZone: 'UTC',
                            })}
                          </strong>{' '}
                          · {loadedSpanInfo.count.toLocaleString()} bars
                        </span>
                        {!hasMoreHistory && timeframe !== '1d' && timeframe !== '1w' && (
                          <button
                            type="button"
                            onClick={() => setTimeframe('1d')}
                            className="rounded bg-[#F59E0B]/15 border border-[#F59E0B]/45 px-1.5 py-0.5 text-[10px] font-bold text-[var(--vp-accent-text)] cursor-pointer hover:bg-[#F59E0B]/25"
                          >
                            1D Inception ({loadedSpanInfo.inceptionDate ?? 'Full'})
                          </button>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* Initial Loading Overlay */}
            {isLoadingInitial && !loadError && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--vp-canvas)]/55">
                <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-header)]/95 px-4 py-2 text-xs font-semibold text-[var(--vp-text)] shadow-lg">
                  Loading live {symbolMeta.shortLabel} ({currentTfLabel})...
                </div>
              </div>
            )}

            {loadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--vp-canvas)]/90 p-4 text-center text-xs text-[var(--vp-muted)] z-30">
                <span>{loadError}</span>
                <button
                  type="button"
                  onClick={() => setReloadNonce((n) => n + 1)}
                  className="vp-pill-btn bg-[#F59E0B] px-3.5 py-1.5 font-semibold text-[#0B0E14] cursor-pointer"
                >
                  Retry Chart
                </button>
              </div>
            )}
          </div>

          {/* Secondary Chart Pane (2-Chart Split View) */}
          {!isFullScreen && splitView && (
            <SecondarySplitChart
              defaultSymbol={symbol === 'BTCUSDT' ? 'XAUUSD' : 'BTCUSDT'}
              defaultTimeframe={timeframe === '1h' ? '15m' : '1h'}
              showEma20={showEma20}
              showEma50={showEma50}
              showBollinger={showBollinger}
              themeMode={themeMode}
            />
          )}
        </div>

        {/* Compact Live Sidebar: OMYE + Smart Money Concepts + Auto Entry/TP/SL — hidden in Full Screen */}
        {!isFullScreen && (
          <aside
            aria-label="Live OMYE and Smart Money Concepts Sidebar"
            className="w-full lg:w-[310px] shrink-0 bg-[var(--vp-surface)] p-2.5 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5 lg:overflow-y-auto transition-colors duration-200"
          >
            {/* 1. Live Auto-Updating Entry / Target / Stop-Loss */}
            <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-2.5 flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--vp-muted)]">
                  Live Setup (1:2 R:R)
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    !smc
                      ? 'bg-[var(--vp-control)] text-[var(--vp-text)]'
                      : smc.trend === 1
                        ? 'bg-[#089981]/15 text-[var(--vp-bull)]'
                        : 'bg-[#F23645]/15 text-[var(--vp-bear)]'
                  }`}
                >
                  {!smc ? 'SCANNING' : smc.trend === 1 ? 'BUY SETUP' : 'SELL SETUP'}
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--vp-muted)]">Entry (Live)</span>
                  <span className="font-mono-tabular font-bold text-[var(--vp-accent-text)]">
                    ${formatTerminalPrice(smc?.entry ?? null, symbolMeta.precision)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--vp-muted)]">Target (TP)</span>
                  <span className="font-mono-tabular font-bold text-[var(--vp-bull)]">
                    ${formatTerminalPrice(smc?.tp ?? null, symbolMeta.precision)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--vp-muted)]">Stop Loss (SL)</span>
                  <span className="font-mono-tabular font-bold text-[var(--vp-bear)]">
                    ${formatTerminalPrice(smc?.sl ?? null, symbolMeta.precision)}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. OMYE (One-Minute Market Engine) */}
            <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-2.5 flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#089981] animate-pulse shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--vp-text)] truncate">
                    OMYE · 1m Engine
                  </span>
                </div>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                    !omye || omye.signal === 'NEUTRAL'
                      ? 'bg-[var(--vp-control)] text-[var(--vp-accent-text)]'
                      : omye.signal.includes('BUY')
                        ? 'bg-[#089981]/15 text-[var(--vp-bull)]'
                        : 'bg-[#F23645]/15 text-[var(--vp-bear)]'
                  }`}
                >
                  {omye?.signal ?? 'SYNCING'}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div>
                  <div className="flex items-center justify-between text-[10px] text-[var(--vp-muted)] mb-0.5 font-mono-tabular">
                    <span>Bull {omye?.bullPressurePct ?? 50}%</span>
                    <span>RSI(1m): {omye ? omye.rsi1m.toFixed(1) : '--'}</span>
                    <span>Bear {100 - (omye?.bullPressurePct ?? 50)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#F23645]/60 overflow-hidden">
                    <div
                      className="h-full bg-[#089981] transition-all duration-300"
                      style={{ width: `${omye?.bullPressurePct ?? 50}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1 pt-0.5 text-[10px] font-mono-tabular">
                  <div className="rounded bg-[var(--vp-surface)] px-1.5 py-1">
                    <span className="block text-[var(--vp-muted)]">1m Entry</span>
                    <span className="font-bold text-[var(--vp-accent-text)]">
                      {formatTerminalPrice(omye?.entry ?? null, symbolMeta.precision)}
                    </span>
                  </div>
                  <div className="rounded bg-[var(--vp-surface)] px-1.5 py-1">
                    <span className="block text-[var(--vp-muted)]">1m TP</span>
                    <span className="font-bold text-[var(--vp-bull)]">
                      {formatTerminalPrice(omye?.tp ?? null, symbolMeta.precision)}
                    </span>
                  </div>
                  <div className="rounded bg-[var(--vp-surface)] px-1.5 py-1">
                    <span className="block text-[var(--vp-muted)]">1m SL</span>
                    <span className="font-bold text-[var(--vp-bear)]">
                      {formatTerminalPrice(omye?.sl ?? null, symbolMeta.precision)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Smart Money Concepts */}
            <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-2.5 flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--vp-muted)]">
                  Smart Money (SMC)
                </span>
                <span className="text-[10px] font-bold text-[var(--vp-accent-text)] truncate">
                  {smc?.pattern ? smc.pattern.name : 'Structure'}
                </span>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--vp-muted)]">Order Block</span>
                  {smc?.orderBlock ? (
                    <span
                      className="font-mono-tabular font-semibold"
                      style={{ color: smc.orderBlock.type === 'Bullish' ? 'var(--vp-bull)' : 'var(--vp-bear)' }}
                    >
                      {smc.orderBlock.type === 'Bullish' ? 'OB+' : 'OB-'}{' '}
                      {formatTerminalPrice(smc.orderBlock.low, symbolMeta.precision)}–
                      {formatTerminalPrice(smc.orderBlock.high, symbolMeta.precision)}
                    </span>
                  ) : (
                    <span className="font-mono-tabular text-[var(--vp-muted)]">Forming</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--vp-muted)]">FVG Zone</span>
                  {smc?.fvg ? (
                    <span
                      className="font-mono-tabular font-semibold"
                      style={{ color: smc.fvg.type === 'Bullish' ? 'var(--vp-bull)' : 'var(--vp-bear)' }}
                    >
                      {smc.fvg.type === 'Bullish' ? '+FVG' : '-FVG'}{' '}
                      {formatTerminalPrice(smc.fvg.low, symbolMeta.precision)}–
                      {formatTerminalPrice(smc.fvg.high, symbolMeta.precision)}
                    </span>
                  ) : (
                    <span className="font-mono-tabular text-[var(--vp-muted)]">Balanced</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--vp-muted)]">BOS / CHoCH</span>
                  <span
                    className="font-mono-tabular font-bold"
                    style={{ color: smc?.trend === -1 ? 'var(--vp-bear)' : 'var(--vp-bull)' }}
                  >
                    {smc?.lastEvent ?? 'BOS'} ({smc ? `${smc.bosCount}/${smc.chochCount}` : '0/0'})
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-[var(--vp-border)]">
                  <span className="font-mono-tabular text-[var(--vp-bull)]">
                    S1: {formatTerminalPrice(smc?.supportPrice ?? null, symbolMeta.precision)}
                  </span>
                  <span className="font-mono-tabular text-[var(--vp-bear)]">
                    R1: {formatTerminalPrice(smc?.resistancePrice ?? null, symbolMeta.precision)}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      <ChartSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeMode={themeMode}
        onChangeThemeMode={(mode) => onChangeThemeMode?.(mode)}
        overlays={{
          showSupportResistance,
          onToggleSupportResistance: () => setShowSupportResistance((v) => !v),
          showPatterns,
          onTogglePatterns: () => setShowPatterns((v) => !v),
          showSwingLabels,
          onToggleSwingLabels: () => setShowSwingLabels((v) => !v),
          showBosChoch,
          onToggleBosChoch: () => setShowBosChoch((v) => !v),
          showEma20,
          onToggleEma20: () => setShowEma20((v) => !v),
          showEma50,
          onToggleEma50: () => setShowEma50((v) => !v),
          showEma200,
          onToggleEma200: () => setShowEma200((v) => !v),
          showBollinger,
          onToggleBollinger: () => setShowBollinger((v) => !v),
          showRsi,
          onToggleRsi: () => setShowRsi((v) => !v),
          showVolumeProfile,
          onToggleVolumeProfile: () => setShowVolumeProfile((v) => !v),
        }}
      />
    </section>
  );
};

export const ProSmcTerminal = memo(ProSmcTerminalInner);

interface HeaderCountdownChipProps {
  timeframe: SmcTimeframe;
  latestBarTime?: number;
  currentTfLabel: string;
  isBullTick: boolean;
}

const HeaderCountdownChip: React.FC<HeaderCountdownChipProps> = memo(
  ({ timeframe, latestBarTime, currentTfLabel, isBullTick }) => {
    const [text, setText] = useState(() => formatCandleCountdown(timeframe, latestBarTime));

    useEffect(() => {
      const update = () => {
        const next = formatCandleCountdown(timeframe, latestBarTime);
        setText((prev) => (prev === next ? prev : next));
      };
      update();
      const timer = window.setInterval(update, 250);
      return () => window.clearInterval(timer);
    }, [timeframe, latestBarTime]);

    return (
      <span
        aria-label="Candle closing countdown"
        title={`Time remaining until current ${currentTfLabel} candle closes`}
        className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono-tabular text-[11px] font-bold tracking-tight"
        style={{
          borderColor: isBullTick ? 'rgba(8, 153, 129, 0.45)' : 'rgba(242, 54, 69, 0.45)',
          backgroundColor: isBullTick ? 'rgba(8, 153, 129, 0.12)' : 'rgba(242, 54, 69, 0.12)',
          color: isBullTick ? 'var(--vp-bull)' : 'var(--vp-bear)',
        }}
      >
        {text}
      </span>
    );
  }
);

interface PriceAxisCountdownTagProps {
  syncRef?: React.MutableRefObject<(() => void) | null>;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick', Time> | null;
  livePrice: number | null;
  isBullTick: boolean;
  timeframe: SmcTimeframe;
  latestBarTime?: number;
}

const PriceAxisCountdownTag: React.FC<PriceAxisCountdownTagProps> = memo(
  ({ syncRef, chart, candleSeries, livePrice, isBullTick, timeframe, latestBarTime }) => {
    const elRef = useRef<HTMLDivElement | null>(null);
    const propsRef = useRef({ chart, candleSeries, livePrice, isBullTick, timeframe, latestBarTime });
    propsRef.current = { chart, candleSeries, livePrice, isBullTick, timeframe, latestBarTime };

    const syncDom = useCallback(() => {
      const el = elRef.current;
      if (!el) return;
      const { chart: c, candleSeries: s, livePrice: lp, isBullTick: bull, timeframe: tf, latestBarTime: lbt } =
        propsRef.current;

      if (!c || !s || lp === null || !Number.isFinite(lp)) {
        if (el.style.display !== 'none') el.style.display = 'none';
        return;
      }

      const pane = c.paneSize(0);
      if (!pane || pane.width <= 0 || pane.height <= 0) {
        if (el.style.display !== 'none') el.style.display = 'none';
        return;
      }

      const scaleWidth = c.priceScale('right').width();
      if (!scaleWidth || scaleWidth < 24) {
        if (el.style.display !== 'none') el.style.display = 'none';
        return;
      }

      const rawY = s.priceToCoordinate(lp);
      if (rawY === null || !Number.isFinite(Number(rawY))) {
        if (el.style.display !== 'none') el.style.display = 'none';
        return;
      }

      const liveY = Number(rawY);
      const badgeH = 16;
      // Stack flush directly below Lightweight Charts' ~18px live price label (centered at liveY)
      let top = liveY + 9;
      if (top + badgeH > pane.height - 2) {
        top = Math.min(pane.height - badgeH - 2, Math.max(2, liveY - 9 - badgeH));
      } else if (top < 2) {
        top = 2;
      }

      const left = Math.floor(pane.width) + 1;
      const width = Math.max(48, Math.floor(scaleWidth) - 2);
      const nextTransform = `translate3d(${left}px, ${Math.round(top)}px, 0)`;
      const nextBg = bull ? '#067A66' : '#C92534';
      const nextText = formatCandleCountdown(tf, lbt);

      if (el.style.display !== 'flex') el.style.display = 'flex';
      if (el.style.transform !== nextTransform) el.style.transform = nextTransform;
      const wStr = `${width}px`;
      if (el.style.width !== wStr) el.style.width = wStr;
      if (el.style.backgroundColor !== nextBg) el.style.backgroundColor = nextBg;
      if (el.textContent !== nextText) el.textContent = nextText;
    }, []);

    useEffect(() => {
      if (syncRef) {
        syncRef.current = syncDom;
      }
      syncDom();
      const timer = window.setInterval(() => {
        const el = elRef.current;
        if (!el) return;
        const next = formatCandleCountdown(
          propsRef.current.timeframe,
          propsRef.current.latestBarTime
        );
        if (el.textContent !== next) el.textContent = next;
      }, 250);

      return () => {
        window.clearInterval(timer);
        if (syncRef && syncRef.current === syncDom) {
          syncRef.current = null;
        }
      };
    }, [syncRef, syncDom, chart, candleSeries, livePrice, isBullTick, timeframe, latestBarTime]);

    return (
      <div
        ref={elRef}
        aria-label="Candle closing countdown"
        className="pointer-events-none absolute top-0 left-0 z-[22] hidden h-[16px] items-center justify-center rounded-[3px] font-mono-tabular text-[9.5px] font-bold leading-none text-white shadow-sm will-change-transform"
      />
    );
  }
);

interface SecondarySplitChartProps {
  defaultSymbol: SmcSymbol;
  defaultTimeframe: SmcTimeframe;
  showEma20: boolean;
  showEma50: boolean;
  showBollinger: boolean;
  themeMode: ThemeMode;
}

const SecondarySplitChart: React.FC<SecondarySplitChartProps> = memo(({
  defaultSymbol,
  defaultTimeframe,
  showEma20,
  showEma50,
  showBollinger,
  themeMode,
}) => {
  const [subSymbol, setSubSymbol] = useState<SmcSymbol>(defaultSymbol);
  const [subTf, setSubTf] = useState<SmcTimeframe>(defaultTimeframe);
  const [subPrice, setSubPrice] = useState<number | null>(null);
  const [subBull, setSubBull] = useState(true);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line', Time> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbUpRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbLowRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const candlesRef = useRef<TerminalCandle[]>([]);
  const subHistoricalLoadedRef = useRef<boolean>(false);

  const subLastBullRef = useRef<boolean | null>(null);
  const subMeta = SYMBOL_OPTIONS.find((s) => s.value === subSymbol) ?? SYMBOL_OPTIONS[2];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const initialSubTheme = getChartThemeOptions(themeMode);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        ...initialSubTheme.layout,
        fontSize: 10,
        attributionLogo: false,
      },
      grid: initialSubTheme.grid,
      crosshair: {
        mode: CrosshairMode.Normal,
        ...initialSubTheme.crosshair,
      },
      handleScroll: {
        horzTouchDrag: true,
        vertTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
      kineticScroll: { touch: true, mouse: true },
      timeScale: {
        ...initialSubTheme.timeScale,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 7.5,
        minBarSpacing: 1.5,
        maxBarSpacing: 20,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        shiftVisibleRangeOnNewBar: true,
      },
      rightPriceScale: {
        visible: true,
        autoScale: true,
        ...initialSubTheme.rightPriceScale,
        ticksVisible: true,
        entireTextOnly: true,
        alignLabels: true,
        minimumWidth: 56,
        scaleMargins: { top: 0.16, bottom: 0.16 },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      ...getCandleStyleOptions(themeMode),
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      lastValueVisible: true,
    });
    ema20Ref.current = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: '#38BDF8',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    bbUpRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(96, 165, 250, 0.75)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    bbLowRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(96, 165, 250, 0.75)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });

    chartRef.current = chart;
    candleRef.current = candles;

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        chart.resize(Math.floor(rect.width), Math.floor(rect.height));
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
  }, []);

  const syncSubIndicators = useCallback(
    (bars: TerminalCandle[]) => {
      if (bars.length === 0) return;
      ema20Ref.current?.applyOptions({ visible: showEma20 });
      ema20Ref.current?.setData(showEma20 ? calcEmaSeries(bars, 20) : []);
      ema50Ref.current?.applyOptions({ visible: showEma50 });
      ema50Ref.current?.setData(showEma50 ? calcEmaSeries(bars, 50) : []);
      bbUpRef.current?.applyOptions({ visible: showBollinger });
      bbLowRef.current?.applyOptions({ visible: showBollinger });
      if (showBollinger) {
        const bb = calcBollingerSeries(bars, 20, 2);
        bbUpRef.current?.setData(bb.upper);
        bbLowRef.current?.setData(bb.lower);
      } else {
        bbUpRef.current?.setData([]);
        bbLowRef.current?.setData([]);
      }
    },
    [showEma20, showEma50, showBollinger]
  );

  const syncSubIndicatorsRef = useRef(syncSubIndicators);
  useEffect(() => {
    syncSubIndicatorsRef.current = syncSubIndicators;
    syncSubIndicators(candlesRef.current);
  }, [syncSubIndicators]);

  useEffect(() => {
    chartRef.current?.applyOptions(getChartThemeOptions(themeMode));
    candleRef.current?.applyOptions(getCandleStyleOptions(themeMode));
  }, [themeMode]);

  useEffect(() => {
    candleRef.current?.applyOptions({
      priceFormat: { type: 'price', precision: subMeta.precision, minMove: subMeta.minMove },
    });
  }, [subMeta.precision, subMeta.minMove]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    subHistoricalLoadedRef.current = false;
    candlesRef.current = [];
    candleRef.current?.setData([]);
    ema20Ref.current?.setData([]);
    ema50Ref.current?.setData([]);
    bbUpRef.current?.setData([]);
    bbLowRef.current?.setData([]);

    const applyBar = (rawBar: TerminalCandle) => {
      if (disposed || !candleRef.current || !subHistoricalLoadedRef.current) return;
      if (!Number.isFinite(rawBar.time) || !Number.isFinite(rawBar.close) || rawBar.close <= 0) return;
      const arr = candlesRef.current;
      if (arr.length > 0 && rawBar.time < arr[arr.length - 1].time) return;
      const bar =
        arr.length > 0 && arr[arr.length - 1].time === rawBar.time
          ? {
              ...rawBar,
              open: arr[arr.length - 1].open,
              high: Math.max(arr[arr.length - 1].high, rawBar.high),
              low: Math.min(arr[arr.length - 1].low, rawBar.low),
            }
          : rawBar;
      const bull = bar.close >= bar.open;
      candleRef.current.update(toPureCandle(bar));
      if (subLastBullRef.current !== bull) {
        subLastBullRef.current = bull;
        candleRef.current.applyOptions({ priceLineColor: bull ? '#089981' : '#F23645' });
      }
      if (arr.length > 0 && arr[arr.length - 1].time === bar.time) {
        arr[arr.length - 1] = bar;
      } else {
        arr.push(bar);
      }
      setSubPrice(bar.close);
      setSubBull(bull);
    };

    const connectWs = () => {
      if (disposed) return;
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = subMeta.isCrypto
        ? `wss://stream.binance.com:9443/ws/${subSymbol.toLowerCase()}@kline_${subTf}`
        : `${wsProto}//${window.location.host}/ws/market?symbol=${encodeURIComponent(
            subSymbol
          )}&interval=${encodeURIComponent(subTf)}`;
      try {
        ws = new WebSocket(url);
        ws.onmessage = (ev) => {
          if (disposed) return;
          try {
            const data = JSON.parse(ev.data as string) as {
              k?: { t: number; o: string; h: string; l: string; c: string };
              type?: string;
              candle?: { time: number; open: number; high: number; low: number; close: number };
            };
            if (data.k) {
              applyBar({
                time: Math.floor(data.k.t / 1000) as UTCTimestamp,
                open: parseFloat(data.k.o),
                high: parseFloat(data.k.h),
                low: parseFloat(data.k.l),
                close: parseFloat(data.k.c),
              });
            } else if (data.type === 'kline' && data.candle) {
              applyBar({
                time: data.candle.time as UTCTimestamp,
                open: data.candle.open,
                high: data.candle.high,
                low: data.candle.low,
                close: data.candle.close,
              });
            }
          } catch {
            // ignore
          }
        };
        ws.onclose = () => {
          if (!disposed) reconnectTimer = window.setTimeout(connectWs, 3000);
        };
      } catch {
        // ignore
      }
    };

    fetchCandles(subSymbol, subTf, controller.signal)
      .then((res) => {
        const bars = res.candles;
        if (disposed || bars.length === 0) return;
        candlesRef.current = [...bars];
        candleRef.current?.setData(bars.map(toPureCandle));
        subHistoricalLoadedRef.current = true;
        const last = bars[bars.length - 1];
        const bull = last.close >= last.open;
        subLastBullRef.current = bull;
        setSubPrice(last.close);
        setSubBull(bull);
        candleRef.current?.applyOptions({
          priceLineColor: bull ? '#089981' : '#F23645',
        });

        const applySubRange = () => {
          const chart = chartRef.current;
          if (!chart || disposed) return;
          chart.priceScale('right').applyOptions({ autoScale: true });
          const chartWidth = wrapRef.current?.clientWidth || 320;
          const visibleBars = Math.max(36, Math.min(bars.length, 102, Math.round(Math.max(180, chartWidth - 60) / 8)));
          if (bars.length > visibleBars) {
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(0, bars.length - visibleBars),
              to: bars.length - 1 + 5.5,
            });
          } else {
            chart.timeScale().fitContent();
          }
        };

        applySubRange();
        window.requestAnimationFrame(applySubRange);
        syncSubIndicatorsRef.current(bars);
        connectWs();
      })
      .catch(() => {
        // ignore abort
      });

    return () => {
      disposed = true;
      controller.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [subSymbol, subTf, subMeta.isCrypto]);

  const zoomSecondary = (factor: number) => {
    const ts = chartRef.current?.timeScale();
    const range = ts?.getVisibleLogicalRange();
    if (!ts || !range) return;
    const span = range.to - range.from;
    const maxSpan = Math.max(180, candlesRef.current.length + 20);
    const nextSpan = Math.max(16, Math.min(maxSpan, span * factor));
    ts.setVisibleLogicalRange({ from: range.to - nextSpan, to: range.to });
  };

  return (
    <div className="relative flex flex-col h-[340px] sm:h-[400px] lg:h-full min-w-0 bg-[var(--vp-canvas)] transition-colors duration-200">
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 bg-[var(--vp-header)] border-b border-[var(--vp-border)] transition-colors">
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Secondary chart symbol"
            value={subSymbol}
            onChange={(e) => setSubSymbol(e.target.value as SmcSymbol)}
            className="rounded bg-[var(--vp-control)] text-[var(--vp-text)] px-2 py-0.5 text-[11px] font-semibold outline-none cursor-pointer"
          >
            {SYMBOL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Secondary chart timeframe"
            value={subTf}
            onChange={(e) => setSubTf(e.target.value as SmcTimeframe)}
            className="rounded bg-[var(--vp-control)] text-[var(--vp-accent-text)] px-1.5 py-0.5 text-[11px] font-semibold outline-none cursor-pointer"
          >
            {TIMEFRAME_OPTIONS.map((tf) => (
              <option key={tf.value} value={tf.value}>
                {tf.label}
              </option>
            ))}
          </select>
        </div>
        <span
          className="font-mono-tabular text-xs font-bold"
          style={{ color: subBull ? 'var(--vp-bull)' : 'var(--vp-bear)' }}
        >
          ${formatTerminalPrice(subPrice, subMeta.precision)}
        </span>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div ref={wrapRef} className="smc-chart-host absolute inset-0 touch-none" />
        <div className="absolute bottom-8 left-2.5 z-10 flex items-center gap-1 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-header)]/95 p-1 shadow-md">
          <button
            type="button"
            onClick={() => zoomSecondary(0.72)}
            aria-label="Secondary Zoom In"
            className="flex h-6 w-6 items-center justify-center rounded bg-[var(--vp-control)] text-xs font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomSecondary(1.38)}
            aria-label="Secondary Zoom Out"
            className="flex h-6 w-6 items-center justify-center rounded bg-[var(--vp-control)] text-xs font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => {
              chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
              chartRef.current?.timeScale().fitContent();
            }}
            aria-label="Secondary Reset"
            className="flex h-6 items-center justify-center rounded bg-[var(--vp-control)] px-2 text-[10px] font-semibold text-[var(--vp-accent-text)] hover:opacity-85 cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
});
