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
  DEMO_SYMBOL_SPECS,
  calcPositionPnl,
  formatUsd,
  type DemoAccountMetrics,
  type DemoPosition,
} from '../utils/demoAccount';
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
  demoPositions?: DemoPosition[];
  demoMetrics?: DemoAccountMetrics;
  demoDefaultLot?: number;
  onExecuteDemoOrder?: (symbol: SmcSymbol, side: 'BUY' | 'SELL', lots: number) => string | null;
  onCloseDemoPosition?: (positionId: string) => void;
  onUpdateDemoPositionTpSl?: (positionId: string, tp: number | undefined, sl: number | undefined) => void;
  onChangeDemoDefaultLot?: (lots: number) => void;
  onOpenDemoDrawer?: () => void;
  onLivePriceTick?: (symbol: SmcSymbol, price: number) => void;
}

function getChartThemeOptions(_themeMode: ThemeMode) {
  return {
    layout: {
      background: { type: ColorType.Solid, color: '#FFFFFF' },
      textColor: '#131722',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    },
    grid: {
      vertLines: {
        color: 'rgba(15, 23, 42, 0.05)',
        style: LineStyle.Solid,
      },
      horzLines: {
        color: 'rgba(15, 23, 42, 0.05)',
        style: LineStyle.Solid,
      },
    },
    crosshair: {
      vertLine: {
        color: 'rgba(180, 83, 9, 0.45)',
        labelBackgroundColor: '#0F172A',
      },
      horzLine: {
        color: 'rgba(180, 83, 9, 0.45)',
        labelBackgroundColor: '#0F172A',
      },
    },
    timeScale: {
      borderColor: '#E2E8F0',
    },
    rightPriceScale: {
      borderColor: '#E2E8F0',
    },
  };
}

function getCandleStyleOptions(_themeMode: ThemeMode) {
  return {
    upColor: '#089981',
    downColor: '#F23645',
    borderUpColor: '#089981',
    borderDownColor: '#F23645',
    wickUpColor: '#089981',
    wickDownColor: '#F23645',
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

const COMPACT_TIMEFRAMES: { value: SmcTimeframe; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
];

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

function toPureCandle(c: TerminalCandle): CandlestickData<UTCTimestamp> {
  return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
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

  const tfSec = TIMEFRAME_SECONDS[tf] ?? 900;

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
              })),
            tfSec
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
          })),
          tfSec
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
    return { candles: sanitizeCandles(combined, tfSec), hasMore: false };
  }

  const endMs = opts?.before ? (opts.before - 1) * 1000 : undefined;
  const batch = await fetchDirectBinance(endMs);
  if (!batch) return { candles: [], hasMore: false };
  const filtered = opts?.before ? batch.filter((c) => c.time < opts.before!) : batch;
  return {
    candles: sanitizeCandles(filtered, tfSec),
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
  demoPositions = [],
  demoMetrics,
  demoDefaultLot = 0.1,
  onExecuteDemoOrder,
  onCloseDemoPosition,
  onUpdateDemoPositionTpSl,
  onChangeDemoDefaultLot,
  onOpenDemoDrawer,
  onLivePriceTick,
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
  const [quickOrderNote, setQuickOrderNote] = useState<string | null>(null);

  // Bar Replay & Full-Screen
  const [replayActive, setReplayActive] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayTotal, setReplayTotal] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);
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
  const [dragPreview, setDragPreview] = useState<{ positionId: string; kind: 'tp' | 'sl'; price: number } | null>(null);

  const terminalSectionRef = useRef<HTMLElement | null>(null);
  const savedScrollYRef = useRef<number>(0);
  const lastPriceLineBullRef = useRef<boolean | null>(null);
  const primaryPositionLinesRef = useRef<Array<ReturnType<ISeriesApi<'Candlestick', Time>['createPriceLine']>>>([]);
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
  const tradeOverlaySyncRef = useRef<(() => void) | null>(null);
  const isTouchPanningRef = useRef<boolean>(false);
  const touchPanCooldownUntilRef = useRef<number>(0);

  useEffect(() => {
    replayActiveRef.current = replayActive;
  }, [replayActive]);

  const symbolMeta = SYMBOL_OPTIONS.find((s) => s.value === symbol) ?? SYMBOL_OPTIONS[0];
  const latestBarTime = latestBarSnapshot?.time;

  useEffect(() => {
    if (livePrice !== null && Number.isFinite(livePrice)) {
      onLivePriceTick?.(symbol, livePrice);
    }
  }, [symbol, livePrice, onLivePriceTick]);

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
        tradeOverlaySyncRef.current?.();
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

    chart.subscribeCrosshairMove(() => {
      scheduleOverlayTick();
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
      const series = candleSeriesRef.current;
      if (!chart) return;

      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: '#FFFFFF' },
          textColor: '#131722',
          attributionLogo: false,
        },
      });
      series?.applyOptions(getCandleStyleOptions('light'));

      const targetW = isFullScreen
        ? Math.max(240, Math.floor(window.innerWidth))
        : Math.floor(el?.clientWidth || 0);
      const targetH = isFullScreen
        ? Math.max(240, Math.floor(window.innerHeight - 48))
        : Math.floor(el?.clientHeight || 0);

      if (targetW > 0 && targetH > 0) {
        chart.resize(targetW, targetH);
        chart.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: { top: 0.16, bottom: 0.16 },
        });
        if (refitCandles) {
          chart.timeScale().fitContent();
          const candles = latestCandlesRef.current;
          const plotW = Math.max(200, targetW - 64);
          const targetVisibleBars = Math.max(38, Math.min(candles.length, 115, Math.round(plotW / 8)));
          if (candles.length > targetVisibleBars) {
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(0, candles.length - targetVisibleBars),
              to: candles.length - 1 + 5.5,
            });
          }
        }
        scheduleOverlayRafRef.current?.();
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

      // Immediately apply resize & solid white background, then refine on next frames
      syncChartAfterViewportChange(true);
      raf1 = window.requestAnimationFrame(() => {
        syncChartAfterViewportChange(true);
        raf2 = window.requestAnimationFrame(() => syncChartAfterViewportChange(true));
      });
      timers.push(window.setTimeout(() => syncChartAfterViewportChange(true), 60));
      timers.push(window.setTimeout(() => syncChartAfterViewportChange(true), 180));
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
        setIsFullScreen(false);
      }
    };

    const handleViewportChange = () => {
      window.setTimeout(() => syncChartAfterViewportChange(true), 50);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    return () => {
      if (raf1 !== null) window.cancelAnimationFrame(raf1);
      if (raf2 !== null) window.cancelAnimationFrame(raf2);
      timers.forEach((id) => window.clearTimeout(id));
      document.body.classList.remove('chart-fullscreen-active');
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
    };
  }, [isFullScreen, fitCandlesToViewport]);

  const syncTechnicalIndicators = useCallback(
    (candles: TerminalCandle[], incrementalTickOnly = false) => {
      const chart = chartApiRef.current;
      if (!chart || candles.length === 0) return;

      // Fast O(1) incremental tick update for EMA & BB when only latest candle close moved
      if (incrementalTickOnly && candles.length >= 200) {
        const tail = candles.slice(-220);
        if (showEma20 && ema20SeriesRef.current) {
          const pts = calcEmaSeries(tail, 20);
          const pt = pts[pts.length - 1];
          if (pt) ema20SeriesRef.current.update(pt);
        }
        if (showEma50 && ema50SeriesRef.current) {
          const pts = calcEmaSeries(tail, 50);
          const pt = pts[pts.length - 1];
          if (pt) ema50SeriesRef.current.update(pt);
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
        scheduleOverlayRafRef.current?.();
        return;
      }

      if (ema20SeriesRef.current) {
        ema20SeriesRef.current.applyOptions({ visible: showEma20 });
        ema20SeriesRef.current.setData(showEma20 ? calcEmaSeries(candles, 20) : []);
      }
      if (ema50SeriesRef.current) {
        ema50SeriesRef.current.applyOptions({ visible: showEma50 });
        ema50SeriesRef.current.setData(showEma50 ? calcEmaSeries(candles, 50) : []);
      }
      if (ema200SeriesRef.current) {
        ema200SeriesRef.current.applyOptions({ visible: showEma200 });
        ema200SeriesRef.current.setData(showEma200 ? calcEmaSeries(candles, 200) : []);
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
        } else {
          bbUpperSeriesRef.current.setData([]);
          bbBasisSeriesRef.current.setData([]);
          bbLowerSeriesRef.current.setData([]);
          bbUpperPointsRef.current = [];
          bbLowerPointsRef.current = [];
        }
      }

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
        priceLineColor: last.close >= last.open ? '#059669' : '#DC2626',
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

      try {
        const res = await fetchCandles(symbol, timeframe, controller.signal, {
          before: oldestTs,
          limit: 1000,
        });
        if (disposed) return;

        const older = res.candles.filter((c) => c.time < oldestTs);
        if (older.length === 0) {
          hasMoreHistoryRef.current = false;
          return;
        }

        const chart = chartApiRef.current;
        const prevRange = chart?.timeScale().getVisibleLogicalRange();

        const prevLen = fullCandlesRef.current.length;
        const tfSec = TIMEFRAME_SECONDS[timeframe] ?? 900;
        const merged = sanitizeCandles([...older, ...fullCandlesRef.current], tfSec);
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
        syncTechnicalIndicatorsRef.current(merged, false);
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          hasMoreHistoryRef.current = false;
        }
      } finally {
        if (!disposed) {
          isLoadingHistoryRef.current = false;
        }
      }
    };

    loadMoreHistoryRef.current = () => {
      void loadOlderHistoryChunk();
    };

    const tfSec = TIMEFRAME_SECONDS[timeframe] ?? 900;
    let lastRealClosePrice: number | null = null;
    let smoothTickTimer: number | null = null;

    const applyIncomingCandle = (
      incomingRaw: TerminalCandle,
      isClosed: boolean,
      isSimulatedTick = false
    ) => {
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

      if (!isSimulatedTick) {
        lastRealClosePrice = incomingRaw.close;
      }

      // Strictly align bar timestamp to exact timeframe bucket (60s for 1m, 300s for 5m, etc.)
      const alignedTime = (Math.floor(Number(incomingRaw.time) / tfSec) * tfSec) as UTCTimestamp;
      const fullArr = fullCandlesRef.current;
      let liveCandle: TerminalCandle = {
        ...incomingRaw,
        time: alignedTime,
        high: Math.max(incomingRaw.high, incomingRaw.open, incomingRaw.close),
        low: Math.min(incomingRaw.low, incomingRaw.open, incomingRaw.close),
      };

      if (fullArr.length > 0) {
        const lastFull = fullArr[fullArr.length - 1];
        if (alignedTime < lastFull.time) {
          return;
        }
        if (lastFull.time === alignedTime) {
          liveCandle = {
            ...liveCandle,
            open: lastFull.open,
            high: Math.max(lastFull.high, liveCandle.high, lastFull.open, liveCandle.close),
            low: Math.min(lastFull.low, liveCandle.low, lastFull.open, liveCandle.close),
            volume: liveCandle.volume ?? lastFull.volume,
          };
          fullArr[fullArr.length - 1] = liveCandle;
        } else {
          // Permanent gap fix: every new candle's open strictly equals the previous candle's close
          const connectedOpen = lastFull.close;
          liveCandle = {
            ...liveCandle,
            open: connectedOpen,
            high: Math.max(connectedOpen, liveCandle.high, liveCandle.close),
            low: Math.min(connectedOpen, liveCandle.low, liveCandle.close),
          };
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
      scheduleOverlayRafRef.current?.();

      if (isClosed || isNewBar) {
        syncTechnicalIndicatorsRef.current(arr, false);
        runSmcAnalysisRef.current(arr);
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
        const merged = sanitizeCandles([...fullCandlesRef.current, ...fresh.candles], tfSec);
        if (merged.length >= prevLen) {
          fullCandlesRef.current = merged;
          latestCandlesRef.current = merged;
          lastRealClosePrice = merged[merged.length - 1].close;
          setReplayTotal(merged.length);
          candleSeriesRef.current?.setData(merged.map(toPureCandle));
          if (chart && prevRange) {
            chart.timeScale().setVisibleLogicalRange(prevRange);
          }
          syncTechnicalIndicatorsRef.current(merged, false);
          runSmcAnalysisRef.current(merged);
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
            setStreamStatus('LIVE WS');
            const latest = fresh.candles[fresh.candles.length - 1];
            applyIncomingCandle(latest, false, false);
          })
          .catch(() => {
            // ignore poll errors
          });
      }, 2500);
    };

    // Fallback smooth micro-tick generator + bucket rollover so live updates NEVER freeze on WS jitter
    smoothTickTimer = window.setInterval(() => {
      if (disposed || !historicalLoadedRef.current || replayActiveRef.current) return;
      const fullArr = fullCandlesRef.current;
      if (fullArr.length === 0) return;

      const nowMs = Date.now();
      const lastBar = fullArr[fullArr.length - 1];
      const currentBucket = (Math.floor(Math.floor(nowMs / 1000) / tfSec) * tfSec) as UTCTimestamp;
      const silenceMs = nowMs - lastMessageAt;

      if (silenceMs < 1800 && currentBucket <= lastBar.time) return;

      const anchor = lastRealClosePrice ?? lastBar.close;
      const stepScale = Math.max(symbolMeta.minMove, anchor * 0.000045);
      const meanPull = (anchor - lastBar.close) * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * stepScale;
      const maxBand = Math.max(symbolMeta.minMove * 6, anchor * 0.00035);
      const nextCloseRaw = lastBar.close + meanPull + jitter;
      const clampedClose = Math.max(anchor - maxBand, Math.min(anchor + maxBand, nextCloseRaw));
      const nextClose = Number(clampedClose.toFixed(symbolMeta.precision));

      if (currentBucket > lastBar.time) {
        applyIncomingCandle(
          {
            time: currentBucket,
            open: lastBar.close,
            high: Math.max(lastBar.close, nextClose),
            low: Math.min(lastBar.close, nextClose),
            close: nextClose,
          },
          true,
          true
        );
      } else {
        applyIncomingCandle(
          {
            time: currentBucket,
            open: lastBar.open,
            high: Math.max(lastBar.high, nextClose),
            low: Math.min(lastBar.low, nextClose),
            close: nextClose,
          },
          false,
          true
        );
      }
    }, 1000);

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
                Boolean(parsed.isClosed),
                false
              );
            }
          } catch {
            // ignore malformed frame
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          // Silent background reconnect without freezing or showing error banner
          if (!historicalLoadedRef.current) setStreamStatus('CONNECTING');
          startGoldFallbackPoll();
          scheduleReconnect(connectBackendMarketWs);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
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
            setStreamStatus('LIVE WS');
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
                Boolean(k.x),
                false
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
              // Silent handover to backend WS relay + fallback poll
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

    // Silent background watchdog: recovers stalled sockets seamlessly without showing 'RECONNECTING' freeze
    watchdogTimer = window.setInterval(() => {
      if (disposed || !historicalLoadedRef.current) return;
      if (Date.now() - lastMessageAt > 11000) {
        if (wsRef.current) {
          try {
            wsRef.current.close();
          } catch {
            // ignore
          }
          wsRef.current = null;
        }
        startGoldFallbackPoll();
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
        lastRealClosePrice = latest.close;
        const initBull = latest.close >= latest.open;
        lastPriceLineBullRef.current = initBull;
        candleSeriesRef.current?.applyOptions({
          priceLineColor: initBull ? '#059669' : '#DC2626',
        });

        historicalLoadedRef.current = true;
        setStreamStatus('LIVE WS');
        hasMoreHistoryRef.current = res.hasMore;

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
      if (smoothTickTimer !== null) window.clearInterval(smoothTickTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, timeframe, symbolMeta.isCrypto, symbolMeta.precision, symbolMeta.minMove, reloadNonce]);

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

  const currentTfLabel = TIMEFRAME_OPTIONS.find((t) => t.value === timeframe)?.label ?? timeframe;

  // Live Demo Position Entry, TP, and SL Price Lines synced directly onto Primary Chart
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const line of primaryPositionLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // ignore stale price line
      }
    }
    primaryPositionLinesRef.current = [];

    const matching = demoPositions.filter((p) => p.symbol === symbol);
    if (matching.length === 0) return;

    const mark = livePrice ?? matching[0].entryPrice;
    for (const pos of matching.slice(0, 6)) {
      const pnl = calcPositionPnl(pos, mark);
      const isProfit = pnl >= 0;
      const color = isProfit ? '#089981' : '#F23645';
      try {
        const entryLine = series.createPriceLine({
          price: pos.entryPrice,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: '',
        });
        primaryPositionLinesRef.current.push(entryLine);

        const activeTp =
          dragPreview && dragPreview.positionId === pos.id && dragPreview.kind === 'tp'
            ? dragPreview.price
            : pos.tp;
        if (activeTp !== undefined && Number.isFinite(activeTp)) {
          const tpLine = series.createPriceLine({
            price: activeTp,
            color: '#089981',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: '',
          });
          primaryPositionLinesRef.current.push(tpLine);
        }

        const activeSl =
          dragPreview && dragPreview.positionId === pos.id && dragPreview.kind === 'sl'
            ? dragPreview.price
            : pos.sl;
        if (activeSl !== undefined && Number.isFinite(activeSl)) {
          const slLine = series.createPriceLine({
            price: activeSl,
            color: '#F23645',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: '',
          });
          primaryPositionLinesRef.current.push(slLine);
        }
      } catch {
        // ignore if series disposed
      }
    }
    tradeOverlaySyncRef.current?.();
  }, [demoPositions, symbol, livePrice, dragPreview]);

  const activeSpec = DEMO_SYMBOL_SPECS[symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const activePositions = useMemo(
    () => demoPositions.filter((p) => p.symbol === symbol),
    [demoPositions, symbol]
  );
  const activeFloatingPnl = useMemo(() => {
    const mark = livePrice ?? activeSpec.defaultPrice;
    return activePositions.reduce((sum, p) => sum + calcPositionPnl(p, mark), 0);
  }, [activePositions, livePrice, activeSpec.defaultPrice]);

  const totalFloatingPnl = demoMetrics?.floatingPnl ?? 0;
  const displayEquity = demoMetrics?.equity ?? 1000;
  const displayBalance = demoMetrics?.balance ?? 1000;

  const handleQuickDemoOrder = (side: 'BUY' | 'SELL') => {
    if (!onExecuteDemoOrder) return;
    const err = onExecuteDemoOrder(symbol, side, demoDefaultLot);
    if (err) {
      setQuickOrderNote(err);
    } else {
      const px = livePrice ?? activeSpec.defaultPrice;
      setQuickOrderNote(`${side} ${demoDefaultLot.toFixed(2)} ${activeSpec.shortLabel} @ $${px.toFixed(activeSpec.precision)}`);
    }
  };

  return (
    <section
      ref={terminalSectionRef}
      aria-label="Varta Presh Trading Terminal"
      style={
        isFullScreen
          ? {
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100dvh',
              zIndex: 9999,
              backgroundColor: '#FFFFFF',
            }
          : { backgroundColor: '#FFFFFF' }
      }
      className={
        isFullScreen
          ? 'vp-fullscreen-root flex flex-col bg-[#FFFFFF] text-[#131722] overflow-hidden'
          : 'space-y-2.5 bg-[#FFFFFF] text-[#0F172A] w-full overflow-x-hidden'
      }
    >
      {/* 1. Top Row: Primary Live Chart */}
      <div
        className={
          isFullScreen
            ? 'flex-1 min-h-0 flex flex-col w-full h-full bg-[#FFFFFF]'
            : 'w-full'
        }
      >
        {/* Chart 1 (Primary) */}
        <div
          className={
            isFullScreen
              ? 'relative flex-1 flex flex-col min-w-0 min-h-0 h-full w-full overflow-hidden bg-[#FFFFFF]'
              : 'flex flex-col rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm overflow-hidden min-w-0'
          }
        >
          {/* Dedicated 48px Full-Screen Header Bar */}
          {isFullScreen && (
            <div className="h-[48px] shrink-0 border-b border-[#E2E8F0] bg-[#FFFFFF] px-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-xs text-[#131722] whitespace-nowrap">
                  {symbolMeta.shortLabel}
                </span>
                <span
                  className="font-mono-tabular text-xs font-bold whitespace-nowrap"
                  style={{ color: isBullTick ? '#089981' : '#F23645' }}
                >
                  ${formatTerminalPrice(livePrice, symbolMeta.precision)}
                </span>
                <div
                  role="group"
                  aria-label="Full screen timeframe selector"
                  className="inline-flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar touch-pan-x"
                >
                  {COMPACT_TIMEFRAMES.map((tf) => {
                    const active = timeframe === tf.value;
                    return (
                      <button
                        key={`in-chart-fs-${tf.value}`}
                        type="button"
                        onClick={() => setTimeframe(tf.value)}
                        aria-pressed={active}
                        className={`rounded-md px-2 py-1 text-[11px] font-mono-tabular font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#0F172A] text-[#FFFFFF]'
                            : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={toggleFullScreen}
                aria-label="Exit Full Screen"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-[#FFFFFF] px-2.5 text-xs font-bold text-[#131722] shadow-sm cursor-pointer shrink-0 whitespace-nowrap hover:bg-[#F8FAFC]"
              >
                <Minimize2 className="h-3.5 w-3.5 text-[#131722]" />
                <span>Exit</span>
              </button>
            </div>
          )}

          {/* Dedicated Non-Overlapping Chart 1 Header (Symbol + Live Price + 1m-4H Timeframe Buttons) */}
          {!isFullScreen && (
            <div className="shrink-0 border-b border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      streamStatus === 'LIVE WS'
                        ? 'bg-[#059669] animate-pulse'
                        : 'bg-[#F59E0B]'
                    }`}
                  />
                  <select
                    aria-label="Chart 1 symbol"
                    value={symbol}
                    onChange={(e) => {
                      const nextSym = e.target.value as SmcSymbol;
                      setSymbol(nextSym);
                      const found = SYMBOL_OPTIONS.find((opt) => opt.value === nextSym);
                      if (found) onSelectTvSymbol?.(found.tvSymbol);
                    }}
                    className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] px-2 py-0.5 text-[11px] font-bold outline-none cursor-pointer hover:border-[#F59E0B] truncate max-w-[140px]"
                  >
                    {SYMBOL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="font-mono-tabular text-xs sm:text-[13px] font-bold"
                    style={{ color: isBullTick ? '#059669' : '#DC2626' }}
                  >
                    ${formatTerminalPrice(livePrice, symbolMeta.precision)}
                  </span>
                  <HeaderCountdownChip
                    timeframe={timeframe}
                    latestBarTime={latestBarTime}
                    currentTfLabel={currentTfLabel}
                    isBullTick={isBullTick}
                  />
                  <button
                    type="button"
                    onClick={toggleFullScreen}
                    aria-label="Enter Full Screen"
                    title="Full Screen"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#475569] cursor-pointer"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    aria-label="Chart Settings"
                    title="Chart Settings"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#475569] cursor-pointer"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Clean Non-Overlapping 1m–4H Buttons */}
              <div
                role="group"
                aria-label="Chart 1 timeframe selector"
                className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar"
              >
                <div className="flex items-center gap-1">
                  {COMPACT_TIMEFRAMES.map((tf) => {
                    const active = timeframe === tf.value;
                    return (
                      <button
                        key={`c1-tf-${tf.value}`}
                        type="button"
                        onClick={() => setTimeframe(tf.value)}
                        aria-pressed={active}
                        className={`rounded-md px-2 py-0.5 text-[10.5px] font-mono-tabular font-bold whitespace-nowrap cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#0F172A] text-[#FFFFFF] shadow-sm'
                            : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10px] font-mono-tabular font-semibold text-[#64748B] whitespace-nowrap shrink-0">
                  SMC Auto
                </span>
              </div>
            </div>
          )}

          {/* Chart 1 Canvas Container */}
          <div
            style={
              isFullScreen
                ? { height: 'calc(100dvh - 48px)', backgroundColor: '#FFFFFF' }
                : { backgroundColor: '#FFFFFF' }
            }
            className={`relative min-w-0 min-h-0 overflow-hidden bg-[#FFFFFF] ${
              isFullScreen ? 'flex-1 w-full' : 'h-[265px] sm:h-[320px] lg:h-[370px]'
            }`}
          >
            <div ref={chartWrapRef} className="smc-chart-host absolute inset-0 z-[1] bg-[#FFFFFF] touch-none" />

            {/* High-DPI Canvas SMC Overlay (CHoCH, OB+, S1, S2, Patterns, Live Pulse) */}
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
              themeMode="light"
              livePrice={livePrice}
              isBullTick={isBullTick}
            />

            {/* Right-Axis Candle Countdown Stacked Under Live Price */}
            <PriceAxisCountdownTag
              syncRef={countdownSyncRef}
              chart={chartApiRef.current}
              candleSeries={candleSeriesRef.current}
              livePrice={livePrice}
              isBullTick={isBullTick}
              timeframe={timeframe}
              latestBarTime={latestBarTime}
            />

            {/* Collision-Free Right-Edge Trade Price Badges + TradingView-Style Draggable Entry/TP/SL Handles */}
            <TradeLinesOverlay
              syncRef={tradeOverlaySyncRef}
              chart={chartApiRef.current}
              candleSeries={candleSeriesRef.current}
              positions={activePositions}
              livePrice={livePrice}
              precision={symbolMeta.precision}
              minMove={symbolMeta.minMove}
              dragPreview={dragPreview}
              onDragPreviewChange={setDragPreview}
              onUpdateTpSl={onUpdateDemoPositionTpSl}
              onClosePosition={onCloseDemoPosition}
            />

            {/* Replay Controls when active */}
            {!isFullScreen && replayActive && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-[#FFFFFF]/95 px-3 py-1 shadow-md">
                <button
                  type="button"
                  onClick={() => setReplayPlaying((p) => !p)}
                  className="vp-pill-btn inline-flex h-6 items-center gap-1 bg-[#F59E0B] px-2 text-[10px] font-bold text-[#0F172A] cursor-pointer"
                >
                  {replayPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {replayPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={() => applyReplaySlice(replayIndex + 1)}
                  disabled={replayIndex >= replayTotal}
                  className="vp-pill-btn inline-flex h-6 items-center gap-0.5 bg-[#F1F5F9] px-2 text-[10px] font-semibold text-[#0F172A] cursor-pointer"
                >
                  <SkipForward className="h-3 w-3" />
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setReplaySpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
                  className="vp-pill-btn h-6 bg-[#F1F5F9] px-2 text-[10px] font-mono-tabular font-bold text-[#0284C7] cursor-pointer"
                >
                  {replaySpeed}x
                </button>
                <button
                  type="button"
                  onClick={() => applyReplaySlice(Math.max(24, Math.floor(replayTotal * 0.55)))}
                  title="Restart Replay"
                  className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[#F1F5F9] text-[#0F172A] cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={toggleReplayMode}
                  title="Exit Replay"
                  className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[#FEF2F2] text-[#DC2626] cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Compact Bottom-Left Zoom Controls */}
            {!isFullScreen && (
              <div
                role="group"
                aria-label="Chart 1 zoom controls"
                className="absolute bottom-7 left-2 z-[25] flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF]/95 p-0.5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={handleZoomIn}
                  aria-label="Zoom In"
                  className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F5F9] text-[11px] font-bold text-[#0F172A] hover:bg-[#E2E8F0] cursor-pointer"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  aria-label="Zoom Out"
                  className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F5F9] text-[11px] font-bold text-[#0F172A] hover:bg-[#E2E8F0] cursor-pointer"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  aria-label="Fit All"
                  className="flex h-5 items-center justify-center rounded bg-[#F1F5F9] px-1.5 text-[9.5px] font-semibold text-[#B45309] hover:bg-[#E2E8F0] cursor-pointer"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={handleJumpLive}
                  aria-label="Snap Live"
                  className="flex h-5 items-center justify-center rounded bg-[#F1F5F9] px-1.5 text-[9.5px] font-semibold text-[#0F172A] hover:bg-[#E2E8F0] cursor-pointer"
                >
                  Live
                </button>
              </div>
            )}

            {/* Initial Loading Overlay */}
            {isLoadingInitial && !loadError && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#FFFFFF]/70">
                <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-semibold text-[#0F172A] shadow-sm">
                  Loading {symbolMeta.shortLabel} ({currentTfLabel})...
                </div>
              </div>
            )}

            {loadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#FFFFFF]/95 p-4 text-center text-xs text-[#475569] z-30">
                <span>{loadError}</span>
                <button
                  type="button"
                  onClick={() => setReloadNonce((n) => n + 1)}
                  className="vp-pill-btn bg-[#F59E0B] px-3.5 py-1.5 font-semibold text-[#0F172A] cursor-pointer"
                >
                  Retry Chart
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 2. Bottom Row: ONLY a 2x2 Grid of 4 Compact Info / Signal & Demo Execution Boxes */}
      {!isFullScreen && (
        <div
          aria-label="Live Signal and Demo Execution 2x2 Grid"
          className="grid grid-cols-2 gap-2.5 w-full"
        >
          {/* Box 1: Live Setup (1:2 R:R) */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2.5 shadow-sm flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] truncate">
                {symbolMeta.shortLabel} · Setup (1:2)
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-bold shrink-0 ${
                  !smc
                    ? 'bg-[#F1F5F9] text-[#475569]'
                    : smc.trend === 1
                      ? 'bg-[#ECFDF5] text-[#059669]'
                      : 'bg-[#FEF2F2] text-[#DC2626]'
                }`}
              >
                {!smc ? 'SCANNING' : smc.trend === 1 ? 'BUY' : 'SELL'}
              </span>
            </div>

            <div className="space-y-1 text-[11px] sm:text-xs">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[#64748B] truncate">Entry</span>
                <span className="font-mono-tabular font-bold text-[#B45309]">
                  ${formatTerminalPrice(smc?.entry ?? null, symbolMeta.precision)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[#64748B] truncate">Target (TP)</span>
                <span className="font-mono-tabular font-bold text-[#059669]">
                  ${formatTerminalPrice(smc?.tp ?? null, symbolMeta.precision)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[#64748B] truncate">Stop (SL)</span>
                <span className="font-mono-tabular font-bold text-[#DC2626]">
                  ${formatTerminalPrice(smc?.sl ?? null, symbolMeta.precision)}
                </span>
              </div>
            </div>
          </div>

          {/* Box 2: OMYE · 1m Engine */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2.5 shadow-sm flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <div className="flex items-center gap-1 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-[#059669] animate-pulse shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0F172A] truncate">
                  OMYE · 1m
                </span>
              </div>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-bold shrink-0 ${
                  !omye || omye.signal === 'NEUTRAL'
                    ? 'bg-[#F1F5F9] text-[#B45309]'
                    : omye.signal.includes('BUY')
                      ? 'bg-[#ECFDF5] text-[#059669]'
                      : 'bg-[#FEF2F2] text-[#DC2626]'
                }`}
              >
                {omye?.signal ?? 'SYNC'}
              </span>
            </div>

            <div className="space-y-1.5 text-[10.5px]">
              <div>
                <div className="flex items-center justify-between text-[9.5px] text-[#64748B] mb-0.5 font-mono-tabular">
                  <span>Bull {omye?.bullPressurePct ?? 50}%</span>
                  <span>RSI {omye ? omye.rsi1m.toFixed(1) : '--'}</span>
                  <span>Bear {100 - (omye?.bullPressurePct ?? 50)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#DC2626]/45 overflow-hidden">
                  <div
                    className="h-full bg-[#059669] transition-all duration-300"
                    style={{ width: `${omye?.bullPressurePct ?? 50}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 text-[9.5px] sm:text-[10px] font-mono-tabular">
                <div className="rounded bg-[#F8FAFC] border border-[#F1F5F9] px-1 py-0.5 truncate">
                  <span className="block text-[#64748B] text-[9px]">Entry</span>
                  <span className="font-bold text-[#B45309]">
                    {formatTerminalPrice(omye?.entry ?? null, symbolMeta.precision)}
                  </span>
                </div>
                <div className="rounded bg-[#F8FAFC] border border-[#F1F5F9] px-1 py-0.5 truncate">
                  <span className="block text-[#64748B] text-[9px]">TP</span>
                  <span className="font-bold text-[#059669]">
                    {formatTerminalPrice(omye?.tp ?? null, symbolMeta.precision)}
                  </span>
                </div>
                <div className="rounded bg-[#F8FAFC] border border-[#F1F5F9] px-1 py-0.5 truncate">
                  <span className="block text-[#64748B] text-[9px]">SL</span>
                  <span className="font-bold text-[#DC2626]">
                    {formatTerminalPrice(omye?.sl ?? null, symbolMeta.precision)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Box 3: Smart Money (SMC) Levels & Zones */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2.5 shadow-sm flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] truncate">
                Smart Money (SMC)
              </span>
              <span className="text-[10px] font-bold text-[#B45309] truncate">
                {smc?.pattern ? smc.pattern.name : 'Structure'}
              </span>
            </div>

            <div className="space-y-1 text-[10.5px] sm:text-[11px]">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[#64748B] shrink-0">OB</span>
                {smc?.orderBlock ? (
                  <span
                    className="font-mono-tabular font-semibold truncate"
                    style={{ color: smc.orderBlock.type === 'Bullish' ? '#059669' : '#DC2626' }}
                  >
                    {smc.orderBlock.type === 'Bullish' ? 'OB+' : 'OB-'}{' '}
                    {formatTerminalPrice(smc.orderBlock.low, symbolMeta.precision)}
                  </span>
                ) : (
                  <span className="font-mono-tabular text-[#64748B]">Forming</span>
                )}
              </div>

              <div className="flex items-center justify-between gap-1">
                <span className="text-[#64748B] shrink-0">Event</span>
                <span
                  className="font-mono-tabular font-bold truncate"
                  style={{ color: smc?.trend === -1 ? '#DC2626' : '#059669' }}
                >
                  {smc?.lastEvent ?? 'BOS'} ({smc ? `${smc.bosCount}/${smc.chochCount}` : '0/0'})
                </span>
              </div>

              <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-[#F1F5F9] font-mono-tabular text-[10px]">
                <span className="text-[#059669] font-semibold truncate">
                  S1 {formatTerminalPrice(smc?.supportPrice ?? null, symbolMeta.precision)}
                </span>
                <span className="text-[#DC2626] font-semibold truncate">
                  R1 {formatTerminalPrice(smc?.resistancePrice ?? null, symbolMeta.precision)}
                </span>
              </div>
            </div>
          </div>

          {/* Box 4: $1,000 Demo Quick Trade & Live P&L */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2.5 shadow-sm flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-1.5 mb-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="rounded bg-[#ECFDF5] border border-[#059669]/30 px-1 py-0.5 text-[9px] font-extrabold text-[#059669] shrink-0">
                  DEMO
                </span>
                <span className="font-mono-tabular text-[10.5px] font-bold text-[#0F172A] truncate">
                  {formatUsd(displayEquity)}
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenDemoDrawer}
                className="text-[10px] font-bold text-[#B45309] hover:underline cursor-pointer whitespace-nowrap shrink-0"
              >
                Panel ({demoPositions.length})
              </button>
            </div>

            <div className="flex items-center justify-between gap-1 text-[10px] font-mono-tabular mb-1.5">
              <span className="text-[#64748B] truncate">
                {activePositions.length > 0
                  ? `${activePositions.length} open · Bal ${formatUsd(displayBalance)}`
                  : `Lot ${demoDefaultLot.toFixed(2)} · Ready`}
              </span>
              <span
                className="font-bold shrink-0"
                style={{
                  color:
                    totalFloatingPnl > 0.005
                      ? '#059669'
                      : totalFloatingPnl < -0.005
                        ? '#DC2626'
                        : '#475569',
                }}
              >
                P&L {formatUsd(activePositions.length > 0 ? activeFloatingPnl : totalFloatingPnl, true)}
              </span>
            </div>

            <div className="flex items-center gap-1 mb-1.5">
              {[0.05, 0.1, 0.25].map((lotOpt) => {
                const active = Math.abs(demoDefaultLot - lotOpt) < 0.001;
                return (
                  <button
                    key={lotOpt}
                    type="button"
                    onClick={() => onChangeDemoDefaultLot?.(lotOpt)}
                    className={`flex-1 rounded border py-0.5 text-[9.5px] font-mono-tabular font-bold cursor-pointer ${
                      active
                        ? 'border-[#0F172A] bg-[#0F172A] text-[#FFFFFF]'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]'
                    }`}
                  >
                    {lotOpt}
                  </button>
                );
              })}
              {activePositions.length > 0 && onCloseDemoPosition && (
                <button
                  type="button"
                  onClick={() => onCloseDemoPosition(activePositions[0].id)}
                  className="rounded border border-[#DC2626]/40 bg-[#FEF2F2] px-1.5 py-0.5 text-[9.5px] font-bold text-[#DC2626] cursor-pointer whitespace-nowrap"
                >
                  Close
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickDemoOrder('SELL')}
                className="rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] py-1 text-[10.5px] font-bold text-[#FFFFFF] cursor-pointer active:scale-[0.98]"
              >
                SELL {demoDefaultLot.toFixed(2)}
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemoOrder('BUY')}
                className="rounded-lg bg-[#059669] hover:bg-[#047857] py-1 text-[10.5px] font-bold text-[#FFFFFF] cursor-pointer active:scale-[0.98]"
              >
                BUY {demoDefaultLot.toFixed(2)}
              </button>
            </div>

            {quickOrderNote && (
              <p className="mt-1 text-[9.5px] font-medium text-[#475569] truncate">
                {quickOrderNote}
              </p>
            )}
          </div>
        </div>
      )}

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
      const nextBg = bull ? '#089981' : '#F23645';
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
        className="pointer-events-none absolute top-0 left-0 z-[22] hidden h-[16px] items-center justify-center rounded-[3px] font-mono-tabular text-[9.5px] font-bold leading-none text-[#FFFFFF] shadow-sm will-change-transform"
      />
    );
  }
);

interface TradeLinesOverlayProps {
  syncRef: React.MutableRefObject<(() => void) | null>;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick', Time> | null;
  positions: DemoPosition[];
  livePrice: number | null;
  precision: number;
  minMove: number;
  dragPreview: { positionId: string; kind: 'tp' | 'sl'; price: number } | null;
  onDragPreviewChange: (val: { positionId: string; kind: 'tp' | 'sl'; price: number } | null) => void;
  onUpdateTpSl?: (positionId: string, tp: number | undefined, sl: number | undefined) => void;
  onClosePosition?: (positionId: string) => void;
}

interface AxisPriceBadgeItem {
  key: string;
  positionId: string;
  kind: 'entry' | 'tp' | 'sl';
  price: number;
  rawY: number;
  y: number;
  bg: string;
  label: string;
}

interface PlotHandleItem {
  key: string;
  positionId: string;
  kind: 'entry' | 'tp' | 'sl';
  rawY: number;
  y: number;
  price: number;
  pnl: number;
  side: 'BUY' | 'SELL';
  lots: number;
}

const TradeLinesOverlay: React.FC<TradeLinesOverlayProps> = memo(
  ({
    syncRef,
    chart,
    candleSeries,
    positions,
    livePrice,
    precision,
    minMove,
    dragPreview,
    onDragPreviewChange,
    onUpdateTpSl,
    onClosePosition,
  }) => {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [layoutState, setLayoutState] = useState<{
      paneWidth: number;
      paneHeight: number;
      scaleWidth: number;
      axisBadges: AxisPriceBadgeItem[];
      plotHandles: PlotHandleItem[];
    }>({
      paneWidth: 0,
      paneHeight: 0,
      scaleWidth: 64,
      axisBadges: [],
      plotHandles: [],
    });

    const propsRef = useRef({
      chart,
      candleSeries,
      positions,
      livePrice,
      precision,
      dragPreview,
    });
    propsRef.current = {
      chart,
      candleSeries,
      positions,
      livePrice,
      precision,
      dragPreview,
    };

    const recomputeLayout = useCallback(() => {
      const {
        chart: c,
        candleSeries: s,
        positions: posList,
        livePrice: lp,
        precision: prec,
        dragPreview: preview,
      } = propsRef.current;

      if (!c || !s || posList.length === 0) {
        setLayoutState((prev) =>
          prev.axisBadges.length === 0 && prev.plotHandles.length === 0
            ? prev
            : { paneWidth: 0, paneHeight: 0, scaleWidth: 64, axisBadges: [], plotHandles: [] }
        );
        return;
      }

      const pane = c.paneSize(0);
      const scaleWidth = c.priceScale('right').width();
      if (!pane || pane.width <= 0 || pane.height <= 0 || scaleWidth < 20) return;

      const rawAxisBadges: AxisPriceBadgeItem[] = [];
      const entryPlotHandles: PlotHandleItem[] = [];
      const targetPlotHandles: PlotHandleItem[] = [];
      const mark = lp ?? posList[0].entryPrice;

      for (const pos of posList.slice(0, 6)) {
        const entryYRaw = s.priceToCoordinate(pos.entryPrice);
        const pnl = calcPositionPnl(pos, mark);
        const isProfit = pnl >= 0;
        if (entryYRaw !== null && Number.isFinite(Number(entryYRaw))) {
          const rawY = Number(entryYRaw);
          if (rawY >= -16 && rawY <= pane.height + 16) {
            rawAxisBadges.push({
              key: `entry-${pos.id}`,
              positionId: pos.id,
              kind: 'entry',
              price: pos.entryPrice,
              rawY,
              y: rawY,
              bg: isProfit ? '#089981' : '#F23645',
              label: pos.entryPrice.toFixed(prec),
            });
            const clampedEntryY = Math.max(13, Math.min(pane.height - 15, rawY));
            entryPlotHandles.push({
              key: `pill-entry-${pos.id}`,
              positionId: pos.id,
              kind: 'entry',
              rawY: clampedEntryY,
              y: clampedEntryY,
              price: pos.entryPrice,
              pnl,
              side: pos.side,
              lots: pos.lots,
            });
          }
        }

        const activeTp =
          preview && preview.positionId === pos.id && preview.kind === 'tp' ? preview.price : pos.tp;
        if (activeTp !== undefined && Number.isFinite(activeTp)) {
          const tpYRaw = s.priceToCoordinate(activeTp);
          if (tpYRaw !== null && Number.isFinite(Number(tpYRaw))) {
            const rawY = Number(tpYRaw);
            const clampedY = Math.max(13, Math.min(pane.height - 15, rawY));
            rawAxisBadges.push({
              key: `tp-${pos.id}`,
              positionId: pos.id,
              kind: 'tp',
              price: activeTp,
              rawY,
              y: clampedY,
              bg: '#089981',
              label: activeTp.toFixed(prec),
            });
            targetPlotHandles.push({
              key: `pill-tp-${pos.id}`,
              positionId: pos.id,
              kind: 'tp',
              rawY: clampedY,
              y: clampedY,
              price: activeTp,
              pnl: calcPositionPnl(pos, activeTp),
              side: pos.side,
              lots: pos.lots,
            });
          }
        }

        const activeSl =
          preview && preview.positionId === pos.id && preview.kind === 'sl' ? preview.price : pos.sl;
        if (activeSl !== undefined && Number.isFinite(activeSl)) {
          const slYRaw = s.priceToCoordinate(activeSl);
          if (slYRaw !== null && Number.isFinite(Number(slYRaw))) {
            const rawY = Number(slYRaw);
            const clampedY = Math.max(13, Math.min(pane.height - 15, rawY));
            rawAxisBadges.push({
              key: `sl-${pos.id}`,
              positionId: pos.id,
              kind: 'sl',
              price: activeSl,
              rawY,
              y: clampedY,
              bg: '#F23645',
              label: activeSl.toFixed(prec),
            });
            targetPlotHandles.push({
              key: `pill-sl-${pos.id}`,
              positionId: pos.id,
              kind: 'sl',
              rawY: clampedY,
              y: clampedY,
              price: activeSl,
              pnl: calcPositionPnl(pos, activeSl),
              side: pos.side,
              lots: pos.lots,
            });
          }
        }
      }

      // Separate close Entry bars vertically (~24px) so compact pills never stack on top of each other
      entryPlotHandles.sort((a, b) => a.rawY - b.rawY);
      for (let i = 1; i < entryPlotHandles.length; i++) {
        entryPlotHandles[i].y = Math.max(entryPlotHandles[i].y, entryPlotHandles[i - 1].y + 24);
      }

      // Resolve vertical collisions on right price axis (including avoiding live price + countdown band)
      const MIN_GAP = 19;
      const minTop = 10;
      const maxTop = Math.max(minTop + MIN_GAP, pane.height - 12);

      let reservedMin = -9999;
      let reservedMax = -9999;
      if (lp !== null && Number.isFinite(lp)) {
        const liveYRaw = s.priceToCoordinate(lp);
        if (liveYRaw !== null && Number.isFinite(Number(liveYRaw))) {
          const ly = Number(liveYRaw);
          reservedMin = ly - 15;
          reservedMax = ly + 31;
        }
      }

      rawAxisBadges.sort((a, b) => a.rawY - b.rawY);
      const placedYs: number[] = [];
      for (let i = 0; i < rawAxisBadges.length; i++) {
        let y = Math.max(minTop, Math.min(maxTop, rawAxisBadges[i].rawY));
        if (i > 0) {
          y = Math.max(y, placedYs[i - 1] + MIN_GAP);
        }
        if (y > reservedMin && y < reservedMax) {
          const above = reservedMin - 2;
          const below = reservedMax + 2;
          const canGoAbove =
            above >= minTop && (i === 0 || above >= placedYs[i - 1] + MIN_GAP);
          y = canGoAbove ? above : below;
        }
        placedYs.push(y);
      }

      if (placedYs.length > 0 && placedYs[placedYs.length - 1] > maxTop) {
        placedYs[placedYs.length - 1] = maxTop;
        for (let i = placedYs.length - 2; i >= 0; i--) {
          placedYs[i] = Math.min(placedYs[i], placedYs[i + 1] - MIN_GAP);
        }
      }

      const resolvedAxisBadges = rawAxisBadges.map((b, idx) => ({
        ...b,
        y: Math.max(minTop, Math.min(maxTop, placedYs[idx] ?? b.y)),
      }));

      setLayoutState({
        paneWidth: Math.floor(pane.width),
        paneHeight: Math.floor(pane.height),
        scaleWidth: Math.floor(scaleWidth),
        axisBadges: resolvedAxisBadges,
        plotHandles: [...entryPlotHandles, ...targetPlotHandles],
      });
    }, []);

    useEffect(() => {
      syncRef.current = recomputeLayout;
      recomputeLayout();
      return () => {
        if (syncRef.current === recomputeLayout) {
          syncRef.current = null;
        }
      };
    }, [syncRef, recomputeLayout, chart, candleSeries, positions, livePrice, precision, dragPreview]);

    const getDefaultLevelPrice = useCallback(
      (pos: DemoPosition, kind: 'tp' | 'sl'): number => {
        const step = Math.max(minMove * 25, pos.entryPrice * 0.0022);
        if (kind === 'tp') {
          return pos.side === 'BUY'
            ? Number((pos.entryPrice + step * 1.5).toFixed(precision))
            : Number(Math.max(minMove, pos.entryPrice - step * 1.5).toFixed(precision));
        }
        return pos.side === 'BUY'
          ? Number(Math.max(minMove, pos.entryPrice - step).toFixed(precision))
          : Number((pos.entryPrice + step).toFixed(precision));
      },
      [minMove, precision]
    );

    const isDraggingRef = useRef(false);
    const [unlockedKeys, setUnlockedKeys] = useState<Record<string, boolean>>({});

    const beginDragTpSl = useCallback(
      (startClientY: number, pos: DemoPosition, kind: 'tp' | 'sl', pointerId?: number, targetEl?: HTMLElement) => {
        if (isDraggingRef.current) return;
        const series = propsRef.current.candleSeries;
        const wrap = rootRef.current;
        if (!series || !wrap) return;
        isDraggingRef.current = true;
        const levelKey = `${pos.id}:${kind}`;
        setUnlockedKeys((prev) => (prev[levelKey] ? prev : { ...prev, [levelKey]: true }));

        if (pointerId !== undefined && targetEl) {
          try {
            targetEl.setPointerCapture(pointerId);
          } catch {
            // ignore
          }
        }

        const calcPriceFromClientY = (clientY: number): number | null => {
          const rect = wrap.getBoundingClientRect();
          const localY = Math.max(6, Math.min(rect.height - 6, clientY - rect.top));
          const p = series.coordinateToPrice(localY);
          if (p === null || !Number.isFinite(Number(p)) || Number(p) <= 0) return null;
          return Number(Number(p).toFixed(precision));
        };

        let movedPx = 0;
        let latestPrice: number | null =
          (kind === 'tp' ? pos.tp : pos.sl) ?? calcPriceFromClientY(startClientY);

        if (latestPrice !== null) {
          onDragPreviewChange({ positionId: pos.id, kind, price: latestPrice });
        }

        const onPointerMove = (mv: PointerEvent) => {
          mv.stopPropagation();
          movedPx = Math.max(movedPx, Math.abs(mv.clientY - startClientY));
          if (movedPx >= 3) {
            const p = calcPriceFromClientY(mv.clientY);
            if (p !== null) {
              latestPrice = p;
              onDragPreviewChange({ positionId: pos.id, kind, price: p });
            }
          }
        };

        const onTouchMoveWin = (tv: TouchEvent) => {
          if (tv.touches.length === 0) return;
          tv.stopPropagation();
          if (tv.cancelable) tv.preventDefault();
          const cy = tv.touches[0].clientY;
          movedPx = Math.max(movedPx, Math.abs(cy - startClientY));
          if (movedPx >= 3) {
            const p = calcPriceFromClientY(cy);
            if (p !== null) {
              latestPrice = p;
              onDragPreviewChange({ positionId: pos.id, kind, price: p });
            }
          }
        };

        const finish = () => {
          isDraggingRef.current = false;
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', onPointerUp);
          window.removeEventListener('touchmove', onTouchMoveWin);
          window.removeEventListener('touchend', onTouchEndWin);
          window.removeEventListener('touchcancel', onTouchEndWin);
          onDragPreviewChange(null);

          if (!onUpdateTpSl) return;

          // If user simply tapped [TP] or [SL] without dragging and line wasn't active yet, pull out a clean default line
          const existing = kind === 'tp' ? pos.tp : pos.sl;
          let finalPrice = latestPrice;
          if (movedPx < 4 && existing === undefined) {
            finalPrice = getDefaultLevelPrice(pos, kind);
          }

          if (finalPrice !== null && Number.isFinite(finalPrice)) {
            if (kind === 'tp') {
              onUpdateTpSl(pos.id, finalPrice, pos.sl);
            } else {
              onUpdateTpSl(pos.id, pos.tp, finalPrice);
            }
          }
        };

        const onPointerUp = (up: PointerEvent) => {
          up.stopPropagation();
          finish();
        };

        const onTouchEndWin = (te: TouchEvent) => {
          te.stopPropagation();
          finish();
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        window.addEventListener('touchmove', onTouchMoveWin, { passive: false });
        window.addEventListener('touchend', onTouchEndWin);
        window.addEventListener('touchcancel', onTouchEndWin);
      },
      [precision, getDefaultLevelPrice, onDragPreviewChange, onUpdateTpSl]
    );

    const handleWheelNudgeTpSl = useCallback(
      (e: React.WheelEvent, pos: DemoPosition, kind: 'tp' | 'sl') => {
        e.stopPropagation();
        if (!onUpdateTpSl) return;
        const levelKey = `${pos.id}:${kind}`;
        setUnlockedKeys((prev) => (prev[levelKey] ? prev : { ...prev, [levelKey]: true }));
        const base =
          (kind === 'tp' ? pos.tp : pos.sl) ?? getDefaultLevelPrice(pos, kind);
        const step = Math.max(minMove * 5, base * 0.00035);
        const dir = e.deltaY < 0 ? 1 : -1; // Scroll up raises price, scroll down lowers price
        const nextPrice = Number(Math.max(minMove, base + dir * step).toFixed(precision));
        if (kind === 'tp') {
          onUpdateTpSl(pos.id, nextPrice, pos.sl);
        } else {
          onUpdateTpSl(pos.id, pos.tp, nextPrice);
        }
      },
      [minMove, precision, getDefaultLevelPrice, onUpdateTpSl]
    );

    if (positions.length === 0) return null;

    const { paneWidth, paneHeight, scaleWidth, axisBadges, plotHandles } = layoutState;
    const badgeWidth = Math.max(48, scaleWidth - 2);

    return (
      <div
        ref={rootRef}
        className="pointer-events-none absolute inset-0 z-[24] overflow-hidden"
      >
        {/* Right-Edge Price Axis Badges (Collision-Free) */}
        {paneWidth > 0 &&
          axisBadges.map((b) => (
            <div
              key={b.key}
              style={{
                transform: `translate3d(${paneWidth + 1}px, ${Math.round(b.y - 8.5)}px, 0)`,
                width: `${badgeWidth}px`,
                backgroundColor: b.bg,
              }}
              className="pointer-events-none absolute top-0 left-0 flex h-[17px] items-center justify-center rounded-[3px] px-1 font-mono-tabular text-[9px] font-bold leading-none text-[#FFFFFF] shadow-sm truncate"
            >
              {b.label}
            </div>
          ))}

        {/* Slim TradingView-Style Entry Bar & Draggable TP/SL Line Pills */}
        {paneWidth > 0 &&
          plotHandles.map((h) => {
            const pos = positions.find((p) => p.id === h.positionId);
            if (!pos) return null;

            if (h.kind === 'entry') {
              const isProfit = h.pnl >= 0;
              const accentColor = isProfit ? '#089981' : '#F23645';
              const hasTp = pos.tp !== undefined || (dragPreview?.positionId === pos.id && dragPreview.kind === 'tp');
              const hasSl = pos.sl !== undefined || (dragPreview?.positionId === pos.id && dragPreview.kind === 'sl');

              return (
                <div
                  key={h.key}
                  style={{
                    transform: `translate3d(0, ${Math.round(h.y - 11)}px, 0)`,
                    right: `${scaleWidth + 6}px`,
                    borderColor: accentColor,
                  }}
                  className="pointer-events-auto absolute top-0 inline-flex h-[22px] items-center rounded-[4px] border bg-[#FFFFFF] shadow-sm overflow-hidden font-mono-tabular text-[9.5px] font-bold select-none"
                >
                  {/* Draggable / Scrollable [ TP ] handle */}
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      beginDragTpSl(e.clientY, pos, 'tp', e.pointerId, e.currentTarget);
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      if (e.touches.length > 0) {
                        beginDragTpSl(e.touches[0].clientY, pos, 'tp');
                      }
                    }}
                    onWheel={(e) => handleWheelNudgeTpSl(e, pos, 'tp')}
                    title="Drag or scroll up/down to pull Take Profit line"
                    className={`h-full px-1.5 flex items-center border-r border-[#E2E8F0] cursor-ns-resize touch-none transition-colors ${
                      hasTp
                        ? 'bg-[#089981] text-[#FFFFFF]'
                        : 'bg-[#ECFDF5] text-[#089981] hover:bg-[#D1FAE5]'
                    }`}
                  >
                    TP
                  </button>

                  {/* Draggable / Scrollable [ SL ] handle */}
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      beginDragTpSl(e.clientY, pos, 'sl', e.pointerId, e.currentTarget);
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      if (e.touches.length > 0) {
                        beginDragTpSl(e.touches[0].clientY, pos, 'sl');
                      }
                    }}
                    onWheel={(e) => handleWheelNudgeTpSl(e, pos, 'sl')}
                    title="Drag or scroll up/down to pull Stop Loss line"
                    className={`h-full px-1.5 flex items-center border-r border-[#E2E8F0] cursor-ns-resize touch-none transition-colors ${
                      hasSl
                        ? 'bg-[#F23645] text-[#FFFFFF]'
                        : 'bg-[#FEF2F2] text-[#F23645] hover:bg-[#FEE2E2]'
                    }`}
                  >
                    SL
                  </button>

                  {/* Compact [ 0.01 | -$2.19 | × ] segment */}
                  <span className="px-1.5 text-[#0F172A] leading-none">
                    {h.lots.toFixed(2)}
                  </span>
                  <span className="text-[#CBD5E1]">|</span>
                  <span
                    className="px-1.5 leading-none"
                    style={{ color: accentColor }}
                  >
                    {formatUsd(h.pnl, true)}
                  </span>
                  <span className="text-[#CBD5E1]">|</span>
                  <button
                    type="button"
                    aria-label="Close trade"
                    title="Close trade"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClosePosition?.(pos.id);
                    }}
                    className="h-full px-1.5 flex items-center justify-center text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#F23645] cursor-pointer leading-none text-[11px]"
                  >
                    ×
                  </button>
                </div>
              );
            }

            const isTp = h.kind === 'tp';
            const levelKind = h.kind as 'tp' | 'sl';
            const levelKey = `${pos.id}:${levelKind}`;
            const isDraggingThis =
              dragPreview?.positionId === pos.id && dragPreview.kind === levelKind;
            const isUnlocked = Boolean(unlockedKeys[levelKey]) || isDraggingThis;
            const placeConfirmAbove = paneHeight > 0 && h.y > paneHeight - 36;

            return (
              <div
                key={h.key}
                style={{
                  transform: `translate3d(0, ${Math.round(h.y - 10.5)}px, 0)`,
                  right: `${scaleWidth + 6}px`,
                }}
                className="pointer-events-none absolute top-0 flex flex-col items-end select-none"
              >
                {isUnlocked && placeConfirmAbove && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setUnlockedKeys((prev) => ({ ...prev, [levelKey]: false }));
                    }}
                    style={{ backgroundColor: '#089981' }}
                    className="pointer-events-auto mb-0.5 inline-flex h-[18px] items-center justify-center rounded-full px-2 text-[10px] font-bold leading-none text-[#FFFFFF] shadow-sm cursor-pointer hover:brightness-110 active:scale-95"
                  >
                    ✓ Confirm
                  </button>
                )}

                <div
                  style={{
                    backgroundColor: isTp ? '#089981' : '#F23645',
                  }}
                  className={`pointer-events-auto inline-flex h-[21px] items-center rounded-[4px] font-mono-tabular text-[9.5px] font-bold text-[#FFFFFF] shadow-sm overflow-hidden select-none ${
                    isUnlocked ? 'ring-2 ring-[#0F172A]/25' : ''
                  }`}
                >
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (!isUnlocked) return;
                      e.preventDefault();
                      beginDragTpSl(e.clientY, pos, levelKind, e.pointerId, e.currentTarget);
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      if (!isUnlocked) return;
                      if (e.touches.length > 0) {
                        beginDragTpSl(e.touches[0].clientY, pos, levelKind);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isUnlocked) {
                        setUnlockedKeys((prev) => ({ ...prev, [levelKey]: true }));
                      }
                    }}
                    onWheel={(e) => {
                      if (!isUnlocked) return;
                      handleWheelNudgeTpSl(e, pos, levelKind);
                    }}
                    title={
                      isUnlocked
                        ? `Drag or scroll vertically to move ${isTp ? 'TP' : 'SL'}`
                        : `Tap to unlock and adjust ${isTp ? 'TP' : 'SL'}`
                    }
                    className={`h-full px-2 flex items-center gap-1 ${
                      isUnlocked ? 'cursor-ns-resize touch-none' : 'cursor-pointer'
                    }`}
                  >
                    <span>{isTp ? 'TP' : 'SL'}</span>
                    <span>{h.price.toFixed(precision)}</span>
                    <span className="opacity-95">({formatUsd(h.pnl, true)})</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${isTp ? 'TP' : 'SL'}`}
                    title={`Remove ${isTp ? 'TP' : 'SL'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setUnlockedKeys((prev) => ({ ...prev, [levelKey]: false }));
                      if (isTp) {
                        onUpdateTpSl?.(pos.id, undefined, pos.sl);
                      } else {
                        onUpdateTpSl?.(pos.id, pos.tp, undefined);
                      }
                    }}
                    className="h-full px-1.5 flex items-center justify-center border-l border-[#FFFFFF]/25 hover:bg-black/15 cursor-pointer text-[11px] leading-none"
                  >
                    ×
                  </button>
                </div>

                {isUnlocked && !placeConfirmAbove && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setUnlockedKeys((prev) => ({ ...prev, [levelKey]: false }));
                    }}
                    style={{ backgroundColor: '#089981' }}
                    className="pointer-events-auto mt-0.5 inline-flex h-[18px] items-center justify-center rounded-full px-2 text-[10px] font-bold leading-none text-[#FFFFFF] shadow-sm cursor-pointer hover:brightness-110 active:scale-95"
                  >
                    ✓ Confirm
                  </button>
                )}
              </div>
            );
          })}
      </div>
    );
  }
);

interface SecondarySplitChartProps {
  defaultSymbol: SmcSymbol;
  defaultTimeframe: SmcTimeframe;
  showSupportResistance: boolean;
  showPatterns: boolean;
  showSwingLabels: boolean;
  showBosChoch: boolean;
  showEma20: boolean;
  showEma50: boolean;
  showBollinger: boolean;
  showVolumeProfile: boolean;
  themeMode: ThemeMode;
  demoPositions?: DemoPosition[];
  onLivePriceTick?: (symbol: SmcSymbol, price: number) => void;
}

const SecondarySplitChart: React.FC<SecondarySplitChartProps> = memo(({
  defaultSymbol,
  defaultTimeframe,
  showSupportResistance,
  showPatterns,
  showSwingLabels,
  showBosChoch,
  showEma20,
  showEma50,
  showBollinger,
  showVolumeProfile,
  themeMode,
  demoPositions = [],
  onLivePriceTick,
}) => {
  const [subSymbol, setSubSymbol] = useState<SmcSymbol>(defaultSymbol);
  const [subTf, setSubTf] = useState<SmcTimeframe>(defaultTimeframe);
  const [subPrice, setSubPrice] = useState<number | null>(null);
  const [subBull, setSubBull] = useState(true);
  const [subLatestTime, setSubLatestTime] = useState<number | undefined>(undefined);
  const [subStructure, setSubStructure] = useState<ChartStructureOverlayData | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line', Time> | null>(null);
  const ema50Ref = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbUpRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbLowRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbUpPtsRef = useRef<Array<{ time: UTCTimestamp; value: number }>>([]);
  const bbLowPtsRef = useRef<Array<{ time: UTCTimestamp; value: number }>>([]);
  const candlesRef = useRef<TerminalCandle[]>([]);
  const subHistoricalLoadedRef = useRef<boolean>(false);
  const subOverlayRedrawRef = useRef<(() => void) | null>(null);
  const subCountdownSyncRef = useRef<(() => void) | null>(null);
  const subScheduleRafRef = useRef<(() => void) | null>(null);
  const subPosLinesRef = useRef<Array<ReturnType<ISeriesApi<'Candlestick', Time>['createPriceLine']>>>([]);

  const subLastBullRef = useRef<boolean | null>(null);
  const subMeta = SYMBOL_OPTIONS.find((s) => s.value === subSymbol) ?? SYMBOL_OPTIONS[2];
  const subTfLabel = TIMEFRAME_OPTIONS.find((t) => t.value === subTf)?.label ?? subTf;

  useEffect(() => {
    if (subPrice !== null && Number.isFinite(subPrice)) {
      onLivePriceTick?.(subSymbol, subPrice);
    }
  }, [subSymbol, subPrice, onLivePriceTick]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const initialSubTheme = getChartThemeOptions(themeMode);

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        ...initialSubTheme.layout,
        fontSize: 10.5,
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
        minimumWidth: 62,
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

    let rafId: number | null = null;
    const scheduleSubRaf = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        subOverlayRedrawRef.current?.();
        subCountdownSyncRef.current?.();
      });
    };
    subScheduleRafRef.current = scheduleSubRaf;

    const onPassiveTouch = () => scheduleSubRaf();
    el.addEventListener('touchstart', onPassiveTouch, { passive: true });
    el.addEventListener('touchmove', onPassiveTouch, { passive: true });
    el.addEventListener('touchend', onPassiveTouch, { passive: true });
    el.addEventListener('wheel', onPassiveTouch, { passive: true });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => scheduleSubRaf());
    chart.subscribeCrosshairMove(() => scheduleSubRaf());

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        chart.resize(Math.floor(rect.width), Math.floor(rect.height));
        scheduleSubRaf();
      }
    });
    ro.observe(el);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      subScheduleRafRef.current = null;
      el.removeEventListener('touchstart', onPassiveTouch);
      el.removeEventListener('touchmove', onPassiveTouch);
      el.removeEventListener('touchend', onPassiveTouch);
      el.removeEventListener('wheel', onPassiveTouch);
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
        bbUpPtsRef.current = bb.upper;
        bbLowPtsRef.current = bb.lower;
      } else {
        bbUpRef.current?.setData([]);
        bbLowRef.current?.setData([]);
        bbUpPtsRef.current = [];
        bbLowPtsRef.current = [];
      }
      subScheduleRafRef.current?.();
    },
    [showEma20, showEma50, showBollinger]
  );

  const syncSubIndicatorsRef = useRef(syncSubIndicators);
  useEffect(() => {
    syncSubIndicatorsRef.current = syncSubIndicators;
    syncSubIndicators(candlesRef.current);
  }, [syncSubIndicators]);

  useEffect(() => {
    subScheduleRafRef.current?.();
  }, [showSupportResistance, showPatterns, showSwingLabels, showBosChoch, showVolumeProfile, subSymbol, subTf]);

  useEffect(() => {
    chartRef.current?.applyOptions(getChartThemeOptions(themeMode));
    candleRef.current?.applyOptions(getCandleStyleOptions(themeMode));
    subScheduleRafRef.current?.();
  }, [themeMode]);

  useEffect(() => {
    candleRef.current?.applyOptions({
      priceFormat: { type: 'price', precision: subMeta.precision, minMove: subMeta.minMove },
    });
  }, [subMeta.precision, subMeta.minMove]);

  // Live Demo Position P&L lines for Chart 2 symbol
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;

    for (const line of subPosLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // ignore
      }
    }
    subPosLinesRef.current = [];

    const matching = demoPositions.filter((p) => p.symbol === subSymbol);
    if (matching.length === 0) return;

    const mark = subPrice ?? matching[0].entryPrice;
    for (const pos of matching.slice(0, 6)) {
      const pnl = calcPositionPnl(pos, mark);
      const color = pnl >= 0 ? '#059669' : '#DC2626';
      try {
        const line = series.createPriceLine({
          price: pos.entryPrice,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${pos.side} ${pos.lots.toFixed(2)} · ${formatUsd(pnl, true)}`,
        });
        subPosLinesRef.current.push(line);
      } catch {
        // ignore
      }
    }
  }, [demoPositions, subSymbol, subPrice]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const subTfSec = TIMEFRAME_SECONDS[subTf] ?? 900;
    let lastSubMsgAt = Date.now();
    let lastSubRealPrice: number | null = null;
    let subSmoothTimer: number | null = null;

    subHistoricalLoadedRef.current = false;
    candlesRef.current = [];
    setSubStructure(null);
    candleRef.current?.setData([]);
    ema20Ref.current?.setData([]);
    ema50Ref.current?.setData([]);
    bbUpRef.current?.setData([]);
    bbLowRef.current?.setData([]);

    const applyBar = (rawBar: TerminalCandle, isSim = false) => {
      if (disposed || !candleRef.current || !subHistoricalLoadedRef.current) return;
      if (!Number.isFinite(rawBar.time) || !Number.isFinite(rawBar.close) || rawBar.close <= 0) return;
      if (!isSim) lastSubRealPrice = rawBar.close;

      const alignedTime = (Math.floor(Number(rawBar.time) / subTfSec) * subTfSec) as UTCTimestamp;
      const arr = candlesRef.current;
      if (arr.length > 0 && alignedTime < arr[arr.length - 1].time) return;

      let bar: TerminalCandle;
      let isNewBar = false;
      if (arr.length > 0 && arr[arr.length - 1].time === alignedTime) {
        const prevSame = arr[arr.length - 1];
        bar = {
          ...rawBar,
          time: alignedTime,
          open: prevSame.open,
          high: Math.max(prevSame.high, rawBar.high, prevSame.open, rawBar.close),
          low: Math.min(prevSame.low, rawBar.low, prevSame.open, rawBar.close),
        };
      } else if (arr.length > 0) {
        isNewBar = true;
        const connectedOpen = arr[arr.length - 1].close;
        bar = {
          ...rawBar,
          time: alignedTime,
          open: connectedOpen,
          high: Math.max(connectedOpen, rawBar.high, rawBar.close),
          low: Math.min(connectedOpen, rawBar.low, rawBar.close),
        };
      } else {
        bar = { ...rawBar, time: alignedTime };
      }

      const bull = bar.close >= bar.open;
      candleRef.current.update(toPureCandle(bar));
      if (subLastBullRef.current !== bull) {
        subLastBullRef.current = bull;
        candleRef.current.applyOptions({ priceLineColor: bull ? '#059669' : '#DC2626' });
      }
      if (arr.length > 0 && arr[arr.length - 1].time === bar.time) {
        arr[arr.length - 1] = bar;
      } else {
        arr.push(bar);
      }
      setSubPrice(bar.close);
      setSubBull(bull);
      setSubLatestTime(bar.time);
      if (isNewBar && arr.length >= 14) {
        const nextStruct = analyzeChartStructure(arr);
        if (nextStruct) setSubStructure(nextStruct);
      }
      subScheduleRafRef.current?.();
    };

    subSmoothTimer = window.setInterval(() => {
      if (disposed || !subHistoricalLoadedRef.current || candlesRef.current.length === 0) return;
      const nowMs = Date.now();
      const last = candlesRef.current[candlesRef.current.length - 1];
      const bucketTime = (Math.floor(Math.floor(nowMs / 1000) / subTfSec) * subTfSec) as UTCTimestamp;
      if (nowMs - lastSubMsgAt < 1800 && bucketTime <= last.time) return;

      const anchor = lastSubRealPrice ?? last.close;
      const stepScale = Math.max(subMeta.minMove, anchor * 0.000045);
      const meanPull = (anchor - last.close) * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * stepScale;
      const maxBand = Math.max(subMeta.minMove * 6, anchor * 0.00035);
      const nextClose = Number(
        Math.max(anchor - maxBand, Math.min(anchor + maxBand, last.close + meanPull + jitter)).toFixed(
          subMeta.precision
        )
      );

      applyBar(
        {
          time: bucketTime,
          open: bucketTime > last.time ? last.close : last.open,
          high: Math.max(bucketTime > last.time ? last.close : last.high, nextClose),
          low: Math.min(bucketTime > last.time ? last.close : last.low, nextClose),
          close: nextClose,
        },
        true
      );
    }, 1000);

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
          lastSubMsgAt = Date.now();
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
        lastSubRealPrice = last.close;
        const bull = last.close >= last.open;
        subLastBullRef.current = bull;
        setSubPrice(last.close);
        setSubBull(bull);
        setSubLatestTime(last.time);
        candleRef.current?.applyOptions({
          priceLineColor: bull ? '#059669' : '#DC2626',
        });

        if (bars.length >= 14) {
          const struct = analyzeChartStructure(bars);
          if (struct) setSubStructure(struct);
        }

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
          subScheduleRafRef.current?.();
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
      if (subSmoothTimer !== null) window.clearInterval(subSmoothTimer);
      ws?.close();
    };
  }, [subSymbol, subTf, subMeta.isCrypto, subMeta.precision, subMeta.minMove]);

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
    <div className="flex flex-col rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm overflow-hidden min-w-0">
      {/* Dedicated Non-Overlapping Chart 2 Header */}
      <div className="shrink-0 border-b border-[#E2E8F0] bg-[#FFFFFF] px-2.5 py-1.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="h-2 w-2 rounded-full bg-[#059669] animate-pulse shrink-0" />
            <select
              aria-label="Chart 2 symbol"
              value={subSymbol}
              onChange={(e) => setSubSymbol(e.target.value as SmcSymbol)}
              className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A] px-2 py-0.5 text-[11px] font-bold outline-none cursor-pointer hover:border-[#F59E0B] truncate max-w-[140px]"
            >
              {SYMBOL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="font-mono-tabular text-xs sm:text-[13px] font-bold"
              style={{ color: subBull ? '#059669' : '#DC2626' }}
            >
              ${formatTerminalPrice(subPrice, subMeta.precision)}
            </span>
            <HeaderCountdownChip
              timeframe={subTf}
              latestBarTime={subLatestTime}
              currentTfLabel={subTfLabel}
              isBullTick={subBull}
            />
          </div>
        </div>

        {/* Clean Non-Overlapping 1m–4H Buttons */}
        <div
          role="group"
          aria-label="Chart 2 timeframe selector"
          className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar"
        >
          <div className="flex items-center gap-1">
            {COMPACT_TIMEFRAMES.map((tf) => {
              const active = subTf === tf.value;
              return (
                <button
                  key={`c2-tf-${tf.value}`}
                  type="button"
                  onClick={() => setSubTf(tf.value)}
                  aria-pressed={active}
                  className={`rounded-md px-2 py-0.5 text-[10.5px] font-mono-tabular font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#0F172A] text-[#FFFFFF] shadow-sm'
                      : 'bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
          <span className="text-[10px] font-mono-tabular font-semibold text-[#64748B] whitespace-nowrap shrink-0">
            SMC Auto
          </span>
        </div>
      </div>

      {/* Chart 2 Canvas Container */}
      <div className="relative h-[245px] sm:h-[300px] lg:h-[350px] min-h-0 overflow-hidden bg-[#FFFFFF]">
        <div ref={wrapRef} className="smc-chart-host absolute inset-0 touch-none" />

        <ChartCanvasOverlay
          redrawRef={subOverlayRedrawRef}
          chart={chartRef.current}
          candleSeries={candleRef.current}
          candles={candlesRef.current}
          symbol={subSymbol}
          timeframe={subTf}
          structure={subStructure}
          bbUpper={bbUpPtsRef.current}
          bbLower={bbLowPtsRef.current}
          showBollinger={showBollinger}
          showVolumeProfile={showVolumeProfile}
          showSupportResistance={showSupportResistance}
          showPatterns={showPatterns}
          showSwingLabels={showSwingLabels}
          showBosChoch={showBosChoch}
          precision={subMeta.precision}
          themeMode="light"
          livePrice={subPrice}
          isBullTick={subBull}
        />

        <PriceAxisCountdownTag
          syncRef={subCountdownSyncRef}
          chart={chartRef.current}
          candleSeries={candleRef.current}
          livePrice={subPrice}
          isBullTick={subBull}
          timeframe={subTf}
          latestBarTime={subLatestTime}
        />

        <div className="absolute bottom-7 left-2 z-[25] flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF]/95 p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => zoomSecondary(0.72)}
            aria-label="Chart 2 Zoom In"
            className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F5F9] text-[11px] font-bold text-[#0F172A] hover:bg-[#E2E8F0] cursor-pointer"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomSecondary(1.38)}
            aria-label="Chart 2 Zoom Out"
            className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F5F9] text-[11px] font-bold text-[#0F172A] hover:bg-[#E2E8F0] cursor-pointer"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => {
              chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
              chartRef.current?.timeScale().fitContent();
              subScheduleRafRef.current?.();
            }}
            aria-label="Chart 2 Reset"
            className="flex h-5 items-center justify-center rounded bg-[#F1F5F9] px-1.5 text-[9.5px] font-semibold text-[#B45309] hover:bg-[#E2E8F0] cursor-pointer"
          >
            All
          </button>
        </div>
      </div>
    </div>
  );
});
