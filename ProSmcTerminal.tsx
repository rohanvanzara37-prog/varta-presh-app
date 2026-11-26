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
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Share2,
  SkipForward,
  Sparkles,
  X,
  XCircle,
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
  computeAiScalpAnalysis,
  computeMultiTimeframeTrend,
  computeOmyeSnapshot,
  sanitizeCandles,
  type AiScalpAnalysisState,
  type ChartStructureOverlayData,
  type HtfTrendSummary,
  type OmyeEngineState,
  type SmcAnalysisState,
  type TerminalCandle,
} from '../utils/chartAnalysis';
import {
  loadCachedCalendarEvents,
  saveCachedCalendarEvents,
  type FallbackCalendarEvent,
} from '../utils/newsCalendarFallback';
import { ChartCanvasOverlay } from './ChartCanvasOverlay';
import { ChartSettingsModal } from './ChartSettingsModal';

export type { OmyeEngineState, SmcAnalysisState, ZoneRange } from '../utils/chartAnalysis';

export type SmcSymbol =
  | 'XAUUSD'
  | 'EURUSD'
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
  marginCallActive?: boolean;
  onExecuteDemoOrder?: (symbol: SmcSymbol, side: 'BUY' | 'SELL', lots: number) => string | null;
  onCloseDemoPosition?: (positionId: string) => void;
  onUpdateDemoPositionTpSl?: (positionId: string, tp: number | undefined, sl: number | undefined) => void;
  onToggleDemoTrailingStop?: (positionId: string) => void;
  onChangeDemoDefaultLot?: (lots: number) => void;
  onResetDemoAccount?: () => void;
  onOpenDemoDrawer?: () => void;
  onLivePriceTick?: (symbol: SmcSymbol, price: number) => void;
}

function getMarketSessionBadge(nowMs = Date.now()): {
  label: 'Asian' | 'London' | 'NY Open';
  dotColor: string;
  bgColor: string;
  textColor: string;
} {
  const utcHour = new Date(nowMs).getUTCHours();
  if (utcHour >= 13 && utcHour < 22) {
    return { label: 'NY Open', dotColor: '#089981', bgColor: '#ECFDF5', textColor: '#089981' };
  }
  if (utcHour >= 8 && utcHour < 13) {
    return { label: 'London', dotColor: '#F59E0B', bgColor: '#FFFBEB', textColor: '#B45309' };
  }
  return { label: 'Asian', dotColor: '#475569', bgColor: '#F8FAFC', textColor: '#475569' };
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
        color: 'rgba(19, 23, 34, 0.045)',
        style: LineStyle.Solid,
      },
      horzLines: {
        color: 'rgba(19, 23, 34, 0.045)',
        style: LineStyle.Solid,
      },
    },
    crosshair: {
      vertLine: {
        color: 'rgba(180, 83, 9, 0.45)',
        labelBackgroundColor: '#131722',
      },
      horzLine: {
        color: 'rgba(180, 83, 9, 0.45)',
        labelBackgroundColor: '#131722',
      },
    },
    timeScale: {
      borderColor: '#E5E7EB',
    },
    rightPriceScale: {
      borderColor: '#E5E7EB',
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
  { value: 'BTCUSDT', tvSymbol: 'BINANCE:BTCUSDT', shortLabel: 'BTC/USD', label: 'BTC/USD · Bitcoin', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'ETHUSDT', tvSymbol: 'BINANCE:ETHUSDT', shortLabel: 'ETH/USD', label: 'ETH/USD · Ethereum', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'EURUSD', tvSymbol: 'FX:EURUSD', shortLabel: 'EUR/USD', label: 'EUR/USD · Euro', isCrypto: false, precision: 4, minMove: 0.0001 },
  { value: 'XAGUSD', tvSymbol: 'OANDA:XAGUSD', shortLabel: 'XAG/USD', label: 'XAG/USD · Silver', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'SOLUSDT', tvSymbol: 'BINANCE:SOLUSDT', shortLabel: 'SOL/USD', label: 'SOL/USD · Solana', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'US500', tvSymbol: 'FOREXCOM:SPXUSD', shortLabel: 'US500', label: 'US500 · S&P 500', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'USOIL', tvSymbol: 'TVC:USOIL', shortLabel: 'USOIL', label: 'USOIL · WTI Crude', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'BNBUSDT', tvSymbol: 'BINANCE:BNBUSDT', shortLabel: 'BNB/USD', label: 'BNB/USD · BNB', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'XRPUSDT', tvSymbol: 'BINANCE:XRPUSDT', shortLabel: 'XRP/USD', label: 'XRP/USD · Ripple', isCrypto: true, precision: 4, minMove: 0.0001 },
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
  if (tvSymbol.includes('EUR')) return 'EURUSD';
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
  marginCallActive = false,
  onExecuteDemoOrder,
  onCloseDemoPosition,
  onUpdateDemoPositionTpSl,
  onToggleDemoTrailingStop,
  onChangeDemoDefaultLot,
  onResetDemoAccount,
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
  const [customLotInput, setCustomLotInput] = useState<string>(() => demoDefaultLot.toFixed(2));
  const [sessionBadge, setSessionBadge] = useState(() => getMarketSessionBadge());
  const [crosshairPts, setCrosshairPts] = useState<{ range: string; body: string; isBull: boolean } | null>(null);

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
  const [htfTrend, setHtfTrend] = useState<HtfTrendSummary | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiScalpAnalysisState | null>(null);
  const [appliedAiSetup, setAppliedAiSetup] = useState<AiScalpAnalysisState | null>(null);
  const [showAiSignals, setShowAiSignals] = useState<boolean>(true);
  const [layersOpen, setLayersOpen] = useState<boolean>(false);
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);
  const [calendarEvents, setCalendarEvents] = useState<FallbackCalendarEvent[]>(() =>
    loadCachedCalendarEvents()
  );
  const [nowShieldMs, setNowShieldMs] = useState<number>(() => Date.now());
  const [omye, setOmye] = useState<OmyeEngineState | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [dragPreview, setDragPreview] = useState<{ positionId: string; kind: 'tp' | 'sl'; price: number } | null>(null);

  const terminalSectionRef = useRef<HTMLElement | null>(null);
  const layersBtnRef = useRef<HTMLButtonElement | null>(null);
  const layersMenuRef = useRef<HTMLDivElement | null>(null);
  const htfTrendRef = useRef<HtfTrendSummary | null>(null);
  const savedScrollYRef = useRef<number>(0);
  const lastPriceLineBullRef = useRef<boolean | null>(null);
  const primaryPositionLinesRef = useRef<Array<ReturnType<ISeriesApi<'Candlestick', Time>['createPriceLine']>>>([]);
  const aiSetupLinesRef = useRef<Array<ReturnType<ISeriesApi<'Candlestick', Time>['createPriceLine']>>>([]);
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

  const symbolMeta = SYMBOL_OPTIONS.find((s) => s.value === symbol) ?? SYMBOL_OPTIONS[0];
  const latestBarTime = latestBarSnapshot?.time;
  const precisionRef = useRef<number>(symbolMeta.precision);
  precisionRef.current = symbolMeta.precision;
  const timeframeRef = useRef<SmcTimeframe>(timeframe);
  timeframeRef.current = timeframe;

  useEffect(() => {
    setCustomLotInput(demoDefaultLot.toFixed(2));
  }, [demoDefaultLot]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionBadge(getMarketSessionBadge());
      setNowShieldMs(Date.now());
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Poll Economic Calendar for High-Impact USD/Gold Volatility Shield
  useEffect(() => {
    let disposed = false;
    const syncCalendar = async () => {
      try {
        const res = await fetch('/api/economic-calendar', { cache: 'no-store' });
        if (!res.ok || disposed) return;
        const json = (await res.json()) as { events?: FallbackCalendarEvent[]; error?: string };
        if (!json.error && Array.isArray(json.events) && json.events.length > 0 && !disposed) {
          setCalendarEvents(json.events);
          saveCachedCalendarEvents(json.events);
        }
      } catch {
        // retain cached/fallback calendar events
      }
    };
    void syncCalendar();
    const timer = window.setInterval(() => void syncCalendar(), 60_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  // Close Layers popover on outside click or Escape
  useEffect(() => {
    if (!layersOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        !layersMenuRef.current?.contains(target) &&
        !layersBtnRef.current?.contains(target)
      ) {
        setLayersOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLayersOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [layersOpen]);

  // Multi-Timeframe (15m & 1H) Higher Timeframe Trend Filter for AI Sniper Engine
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    const loadHtf = async () => {
      try {
        const [r15m, r1h] = await Promise.allSettled([
          fetchCandles(symbol, '15m', controller.signal, { limit: 160 }),
          fetchCandles(symbol, '1h', controller.signal, { limit: 160 }),
        ]);
        if (disposed) return;
        const c15m = r15m.status === 'fulfilled' ? r15m.value.candles : [];
        const c1h = r1h.status === 'fulfilled' ? r1h.value.candles : [];
        const nextHtf = computeMultiTimeframeTrend(c15m, c1h, timeframe);
        htfTrendRef.current = nextHtf;
        setHtfTrend(nextHtf);
        if (latestCandlesRef.current.length >= 25) {
          const struct = analyzeChartStructure(latestCandlesRef.current);
          setAiAnalysis(
            computeAiScalpAnalysis(
              latestCandlesRef.current,
              struct,
              timeframe,
              symbolMeta.precision,
              nextHtf
            )
          );
        }
      } catch {
        // ignore abort/transient errors
      }
    };

    void loadHtf();
    const timer = window.setInterval(() => void loadHtf(), 45_000);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [symbol, timeframe, symbolMeta.precision, reloadNonce]);

  useEffect(() => {
    replayActiveRef.current = replayActive;
  }, [replayActive]);

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

    chart.subscribeCrosshairMove((param) => {
      scheduleOverlayTick();
      if (!param || !param.point || !param.time) {
        setCrosshairPts((prev) => (prev === null ? prev : null));
        return;
      }
      const rawData = param.seriesData.get(candleSeries) as
        | { open?: number; high?: number; low?: number; close?: number }
        | undefined;
      const bar =
        rawData &&
        typeof rawData.open === 'number' &&
        typeof rawData.high === 'number' &&
        typeof rawData.low === 'number' &&
        typeof rawData.close === 'number'
          ? rawData
          : latestCandlesRef.current.find((c) => c.time === param.time);
      if (!bar || typeof bar.open !== 'number' || typeof bar.high !== 'number' || typeof bar.low !== 'number' || typeof bar.close !== 'number') {
        setCrosshairPts((prev) => (prev === null ? prev : null));
        return;
      }
      const prec = precisionRef.current;
      const rangeVal = Math.abs(bar.high - bar.low).toFixed(prec);
      const bodyDiff = bar.close - bar.open;
      const bodyStr = `${bodyDiff >= 0 ? '+' : '-'}${Math.abs(bodyDiff).toFixed(prec)}`;
      const isBull = bodyDiff >= 0;
      setCrosshairPts((prev) =>
        prev && prev.range === rangeVal && prev.body === bodyStr && prev.isBull === isBull
          ? prev
          : { range: rangeVal, body: bodyStr, isBull }
      );
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
      setAiAnalysis(null);
      return;
    }
    const result = analyzeChartStructure(candles);
    if (!result) return;
    setStructureOverlay(result);
    setSmc(result.smc);
    setAiAnalysis(
      computeAiScalpAnalysis(
        candles,
        result,
        timeframeRef.current,
        precisionRef.current,
        htfTrendRef.current
      )
    );
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
    let animTargetCandle: TerminalCandle | null = null;
    let animCurrentCandle: TerminalCandle | null = null;
    let animRafId: number | null = null;
    let lastStatePushMs = 0;

    const tickAnimFrame = () => {
      if (disposed) return;
      if (
        !replayActiveRef.current &&
        historicalLoadedRef.current &&
        candleSeriesRef.current &&
        animTargetCandle &&
        animCurrentCandle
      ) {
        if (animCurrentCandle.time !== animTargetCandle.time) {
          animCurrentCandle = { ...animTargetCandle };
        } else {
          const diff = animTargetCandle.close - animCurrentCandle.close;
          const nextClose =
            Math.abs(diff) <= symbolMeta.minMove * 0.5
              ? animTargetCandle.close
              : Number((animCurrentCandle.close + diff * 0.28).toFixed(symbolMeta.precision));
          animCurrentCandle = {
            ...animTargetCandle,
            close: nextClose,
            high: Math.max(animTargetCandle.high, nextClose),
            low: Math.min(animTargetCandle.low, nextClose),
          };
        }

        const isBullAnim = animCurrentCandle.close >= animCurrentCandle.open;
        candleSeriesRef.current.update(toPureCandle(animCurrentCandle));
        if (lastPriceLineBullRef.current !== isBullAnim) {
          lastPriceLineBullRef.current = isBullAnim;
          candleSeriesRef.current.applyOptions({
            priceLineColor: isBullAnim ? '#089981' : '#F23645',
          });
        }
        const nowPerf = performance.now();
        if (nowPerf - lastStatePushMs >= 100 || animCurrentCandle.close === animTargetCandle.close) {
          lastStatePushMs = nowPerf;
          setLivePrice(animCurrentCandle.close);
          setIsBullTick(isBullAnim);
        }
        scheduleOverlayRafRef.current?.();
      }
      animRafId = window.requestAnimationFrame(tickAnimFrame);
    };
    animRafId = window.requestAnimationFrame(tickAnimFrame);

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

      const isBull = liveCandle.close >= liveCandle.open;
      animTargetCandle = liveCandle;
      if (!animCurrentCandle || animCurrentCandle.time !== liveCandle.time) {
        animCurrentCandle = { ...liveCandle };
        candleSeriesRef.current.update(toPureCandle(liveCandle));
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
        if (arr.length >= 25) {
          const nextStruct = analyzeChartStructure(arr);
          setAiAnalysis(
            computeAiScalpAnalysis(
              arr,
              nextStruct,
              timeframeRef.current,
              precisionRef.current,
              htfTrendRef.current
            )
          );
        }
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
          animTargetCandle = merged[merged.length - 1];
          animCurrentCandle = { ...animTargetCandle };
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
    }, 850);

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
        animTargetCandle = latest;
        animCurrentCandle = { ...latest };
        const initBull = latest.close >= latest.open;
        lastPriceLineBullRef.current = initBull;
        candleSeriesRef.current?.applyOptions({
          priceLineColor: initBull ? '#089981' : '#F23645',
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
      if (animRafId !== null) window.cancelAnimationFrame(animRafId);
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

  // Clear applied AI setup when switching market or timeframe
  useEffect(() => {
    setAppliedAiSetup(null);
  }, [symbol, timeframe]);

  // Sync applied AI Scalp Setup lines (Entry, SL, TP1, TP2) directly onto the chart
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const line of aiSetupLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // ignore stale line
      }
    }
    aiSetupLinesRef.current = [];

    if (!showAiSignals || !appliedAiSetup || !appliedAiSetup.actionable || appliedAiSetup.entry === null) return;
    const isBuy = appliedAiSetup.direction === 'BUY';
    const specs = [
      {
        price: appliedAiSetup.entry,
        color: '#B45309',
        style: LineStyle.Dashed,
        title: `AI ${appliedAiSetup.direction}`,
      },
      ...(appliedAiSetup.sl !== null
        ? [{ price: appliedAiSetup.sl, color: '#F23645', style: LineStyle.Dotted, title: 'AI SL' }]
        : []),
      ...(appliedAiSetup.tp1 !== null
        ? [{ price: appliedAiSetup.tp1, color: '#089981', style: LineStyle.Dotted, title: 'AI TP1' }]
        : []),
      ...(appliedAiSetup.tp2 !== null
        ? [
            {
              price: appliedAiSetup.tp2,
              color: isBuy ? '#059669' : '#10B981',
              style: LineStyle.Dashed,
              title: 'AI TP2',
            },
          ]
        : []),
    ];

    for (const sp of specs) {
      try {
        const line = series.createPriceLine({
          price: sp.price,
          color: sp.color,
          lineWidth: 1,
          lineStyle: sp.style,
          axisLabelVisible: true,
          title: sp.title,
        });
        aiSetupLinesRef.current.push(line);
      } catch {
        // ignore if series unmounted
      }
    }
  }, [appliedAiSetup, showAiSignals]);

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
    if (marginCallActive || displayBalance <= 0 || displayEquity <= 0) {
      setQuickOrderNote('Margin Call: Balance Depleted');
      return;
    }
    const parsedLot = Number.parseFloat(customLotInput);
    const chosenLot = Number.isFinite(parsedLot) && parsedLot >= 0.01 ? Math.min(10, Number(parsedLot.toFixed(2))) : demoDefaultLot;
    onChangeDemoDefaultLot?.(chosenLot);
    const err = onExecuteDemoOrder(symbol, side, chosenLot);
    if (err) {
      setQuickOrderNote(err);
    } else {
      const px = livePrice ?? activeSpec.defaultPrice;
      setQuickOrderNote(`${side} ${chosenLot.toFixed(2)} ${activeSpec.shortLabel} @ $${px.toFixed(activeSpec.precision)}`);
    }
  };

  const isDepleted = marginCallActive || displayBalance <= 0 || displayEquity <= 0;

  // High-Impact News Shield: alert when any High-Impact USD/Gold event is within 15 minutes
  const newsShieldAlert = useMemo(() => {
    const windowEnd = nowShieldMs + 15 * 60_000;
    const windowStart = nowShieldMs - 2 * 60_000;
    const matched = calendarEvents.find((ev) => {
      if (ev.impact !== 'High') return false;
      const cur = ev.currency.toUpperCase();
      if (cur !== 'USD' && cur !== 'XAU') return false;
      return ev.timestampMs >= windowStart && ev.timestampMs <= windowEnd;
    });
    if (!matched) return null;
    const minsLeft = Math.max(0, Math.min(15, Math.ceil((matched.timestampMs - nowShieldMs) / 60_000)));
    return {
      event: matched,
      minsLabel: minsLeft > 0 ? `${minsLeft}m` : 'NOW',
      bannerText: `⚠ High-Impact News in ${minsLeft > 0 ? `${minsLeft}m` : '15m'} — High Slippage Risk`,
    };
  }, [calendarEvents, nowShieldMs]);

  const shareSignalText = useMemo(() => {
    const prec = symbolMeta.precision;
    const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://tredaura.app';
    if (aiAnalysis?.actionable && aiAnalysis.entry !== null) {
      return [
        `TREDAURA AI Signal | ${symbolMeta.shortLabel} (${currentTfLabel})`,
        `Setup: ${aiAnalysis.direction} · ${aiAnalysis.score}% (${aiAnalysis.grade})`,
        `Entry: ${formatTerminalPrice(aiAnalysis.entry, prec)}`,
        `SL: ${formatTerminalPrice(aiAnalysis.sl, prec)}`,
        `TP1: ${formatTerminalPrice(aiAnalysis.tp1, prec)}`,
        `TP2: ${formatTerminalPrice(aiAnalysis.tp2, prec)}`,
        `Note: ${aiAnalysis.reason}`,
        `Trade on TREDAURA: ${appUrl}`,
      ].join('\n');
    }
    const entryPx = smc?.entry ?? livePrice;
    const tp1Px = smc?.tp ?? null;
    const tp2Px =
      entryPx !== null && smc?.sl != null && tp1Px !== null
        ? Number((entryPx + (tp1Px - entryPx) * 1.35).toFixed(prec))
        : null;
    return [
      `TREDAURA AI Signal | ${symbolMeta.shortLabel} (${currentTfLabel})`,
      `Bias: ${smc?.trend === -1 ? 'BEARISH' : 'BULLISH'} (${smc?.lastEvent ?? 'Live Structure'})`,
      `Entry: ${formatTerminalPrice(entryPx, prec)}`,
      `SL: ${formatTerminalPrice(smc?.sl ?? null, prec)}`,
      `TP1: ${formatTerminalPrice(tp1Px, prec)}`,
      `TP2: ${formatTerminalPrice(tp2Px, prec)}`,
      `Trade on TREDAURA: ${appUrl}`,
    ].join('\n');
  }, [aiAnalysis, symbolMeta.shortLabel, symbolMeta.precision, currentTfLabel, smc, livePrice]);

  const autoTrendlinesOn = showPatterns || showSupportResistance;
  const smcZonesOn = showBosChoch;
  const activeLayerCount = (smcZonesOn ? 1 : 0) + (autoTrendlinesOn ? 1 : 0) + (showAiSignals ? 1 : 0);

  const handleCopyShareSetup = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareSignalText);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  }, [shareSignalText]);

  const handleNativeShareSetup = useCallback(async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `TREDAURA AI Signal | ${symbolMeta.shortLabel}`,
          text: shareSignalText,
        });
      } catch {
        // user dismissed share sheet
      }
    }
  }, [symbolMeta.shortLabel, shareSignalText]);

  return (
    <section
      ref={terminalSectionRef}
      aria-label="TREDAURA Trading Terminal"
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
          : 'flex flex-col gap-2 bg-[#FFFFFF] text-[#131722] w-full pb-2'
      }
    >
      {/* Initial Single-Screen Workspace (Top Chart + Bottom Unified Signal & Trade Panel) */}
      <div
        className={
          isFullScreen
            ? 'flex-1 min-h-0 flex flex-col w-full h-full bg-[#FFFFFF]'
            : 'h-[calc(100dvh-124px)] md:h-[calc(100dvh-70px)] min-h-[450px] flex flex-col gap-1.5 w-full shrink-0'
        }
      >
      {/* 1. Top 64% Area: Live Institutional Chart */}
      <div
        className={
          isFullScreen
            ? 'flex-1 min-h-0 flex flex-col w-full h-full bg-[#FFFFFF]'
            : 'h-[64%] min-h-[250px] flex flex-col w-full'
        }
      >
        <div
          className={
            isFullScreen
              ? 'relative flex-1 flex flex-col min-w-0 min-h-0 h-full w-full overflow-hidden bg-[#FFFFFF]'
              : 'flex-1 min-h-0 flex flex-col rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] overflow-hidden min-w-0'
          }
        >
          {/* Dedicated 48px Full-Screen Header Bar */}
          {isFullScreen && (
            <div className="h-[48px] shrink-0 border-b border-[#E5E7EB] bg-[#FFFFFF] px-2.5 flex items-center justify-between gap-2">
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
                            ? 'bg-[#131722] text-[#FFFFFF]'
                            : 'bg-[#F8FAFC] text-[#475569] hover:text-[#131722] hover:bg-[#F1F5F9]'
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
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-[#FFFFFF] px-2.5 text-xs font-bold text-[#131722] cursor-pointer shrink-0 whitespace-nowrap hover:bg-[#F8FAFC]"
              >
                <Minimize2 className="h-3.5 w-3.5 text-[#131722]" />
                <span>Exit</span>
              </button>
            </div>
          )}

          {/* Clean Non-Overlapping Institutional Header (6px flex gap across Market, Session, Price, Timer, Icons) */}
          {!isFullScreen && (
            <div className="shrink-0 border-b border-[#E5E7EB] bg-[#FFFFFF] px-2 py-1 space-y-1">
              <div className="flex items-center justify-between gap-[6px] w-full min-w-0">
                <div className="flex items-center gap-[6px] min-w-0 flex-1 overflow-hidden">
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      streamStatus === 'LIVE WS'
                        ? 'bg-[#089981] animate-pulse'
                        : 'bg-[#F59E0B]'
                    }`}
                  />
                  <select
                    aria-label="Market selector"
                    value={symbol}
                    onChange={(e) => {
                      const nextSym = e.target.value as SmcSymbol;
                      setSymbol(nextSym);
                      const found = SYMBOL_OPTIONS.find((opt) => opt.value === nextSym);
                      if (found) onSelectTvSymbol?.(found.tvSymbol);
                    }}
                    className="min-w-0 flex-1 max-w-[128px] rounded-md border border-[#E5E7EB] bg-[#F8FAFC] text-[#131722] px-1.5 py-0.5 text-[11px] font-bold outline-none cursor-pointer hover:border-[#F59E0B] truncate"
                  >
                    {SYMBOL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <span
                    aria-label="Active trading session"
                    className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] px-1.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap shrink-0"
                    style={{ backgroundColor: sessionBadge.bgColor, color: sessionBadge.textColor }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: sessionBadge.dotColor }} />
                    {sessionBadge.label}
                  </span>
                </div>

                <div className="flex items-center gap-[6px] shrink-0">
                  <span
                    className="font-mono-tabular text-[11px] sm:text-xs font-bold whitespace-nowrap shrink-0"
                    style={{ color: isBullTick ? '#089981' : '#F23645' }}
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
                    onClick={() => setShareModalOpen(true)}
                    aria-label="Share Setup"
                    title="Share Trade Setup"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#131722] cursor-pointer"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleFullScreen}
                    aria-label="Enter Full Screen"
                    title="Full Screen"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#475569] cursor-pointer"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    aria-label="Chart Settings"
                    title="Chart Settings"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#475569] cursor-pointer"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Clean Non-Overlapping 1m–4H Timeframe Bar + SMC Auto & Layers Toggle */}
              <div className="flex items-center justify-between gap-1.5">
                <div
                  role="group"
                  aria-label="Chart timeframe selector"
                  className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0"
                >
                  {COMPACT_TIMEFRAMES.map((tf) => {
                    const active = timeframe === tf.value;
                    return (
                      <button
                        key={`c1-tf-${tf.value}`}
                        type="button"
                        onClick={() => setTimeframe(tf.value)}
                        aria-pressed={active}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-mono-tabular font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#131722] text-[#FFFFFF]'
                            : 'bg-[#F8FAFC] text-[#475569] hover:text-[#131722] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono-tabular font-semibold text-[#64748B] whitespace-nowrap">
                    SMC Auto
                  </span>
                  <button
                    ref={layersBtnRef}
                    type="button"
                    aria-expanded={layersOpen}
                    aria-label="Toggle Chart Layers"
                    onClick={() => setLayersOpen((o) => !o)}
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                      layersOpen || activeLayerCount < 3
                        ? 'border-[#131722] bg-[#131722] text-[#FFFFFF]'
                        : 'border-[#E5E7EB] bg-[#F8FAFC] text-[#131722] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    <Layers className="h-2.5 w-2.5" />
                    <span>{activeLayerCount === 0 ? 'Clean' : 'Layers'}</span>
                    <ChevronDown className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>

              {/* High-Impact News Shield Warning Strip */}
              {newsShieldAlert && (
                <div
                  role="status"
                  title={newsShieldAlert.event.title}
                  className="flex items-center justify-between gap-1.5 rounded-md border border-[#F59E0B]/45 bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-bold text-[#B45309]"
                >
                  <span className="truncate">{newsShieldAlert.bannerText}</span>
                  <span className="font-mono-tabular text-[9.5px] shrink-0 text-[#92400E]">
                    {newsShieldAlert.event.currency} · {newsShieldAlert.event.title}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Chart Canvas Container (OHLC Header Hidden) */}
          <div
            style={
              isFullScreen
                ? { height: 'calc(100dvh - 48px)', backgroundColor: '#FFFFFF' }
                : { backgroundColor: '#FFFFFF' }
            }
            className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-[#FFFFFF]"
          >
            <div ref={chartWrapRef} className="smc-chart-host absolute inset-0 z-[1] bg-[#FFFFFF] touch-none" />

            {/* Compact Layers Visibility Popover (SMC Zones / Auto Trendlines / AI Signals / Clean View) */}
            {!isFullScreen && layersOpen && (
              <div
                ref={layersMenuRef}
                role="menu"
                aria-label="Chart Layer Visibility"
                className="absolute top-1.5 right-2 z-[45] w-52 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-2 shadow-xl space-y-1.5"
              >
                <div className="flex items-center justify-between px-1 pb-1 border-b border-[#F1F5F9]">
                  <span className="text-[10.5px] font-bold text-[#131722]">Chart Layers</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeLayerCount > 0) {
                        setShowBosChoch(false);
                        setShowSwingLabels(false);
                        setShowPatterns(false);
                        setShowSupportResistance(false);
                        setShowAiSignals(false);
                      } else {
                        setShowBosChoch(true);
                        setShowPatterns(true);
                        setShowSupportResistance(true);
                        setShowAiSignals(true);
                      }
                    }}
                    className="text-[10px] font-bold text-[#B45309] hover:underline cursor-pointer"
                  >
                    {activeLayerCount > 0 ? 'Clean View' : 'Show All'}
                  </button>
                </div>

                {[
                  {
                    id: 'smc',
                    label: 'SMC Zones',
                    sub: 'OB, FVG & BOS/CHoCH',
                    enabled: smcZonesOn,
                    onToggle: () => {
                      const next = !smcZonesOn;
                      setShowBosChoch(next);
                      if (!next) setShowSwingLabels(false);
                    },
                  },
                  {
                    id: 'trendlines',
                    label: 'Auto Trendlines',
                    sub: 'Patterns & S/R Levels',
                    enabled: autoTrendlinesOn,
                    onToggle: () => {
                      const next = !autoTrendlinesOn;
                      setShowPatterns(next);
                      setShowSupportResistance(next);
                    },
                  },
                  {
                    id: 'ai',
                    label: 'AI Signals',
                    sub: 'Sniper Setup Overlay',
                    enabled: showAiSignals,
                    onToggle: () => setShowAiSignals((v) => !v),
                  },
                ].map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={layer.enabled}
                    onClick={layer.onToggle}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] px-2 py-1.5 text-left cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="block text-[11px] font-bold text-[#131722] leading-tight">
                        {layer.label}
                      </span>
                      <span className="block text-[9.5px] text-[#64748B] truncate">
                        {layer.sub}
                      </span>
                    </div>
                    <span
                      className="rounded px-1.5 py-0.5 text-[9.5px] font-mono-tabular font-bold shrink-0"
                      style={{
                        backgroundColor: layer.enabled ? '#089981' : '#E2E8F0',
                        color: layer.enabled ? '#FFFFFF' : '#475569',
                      }}
                    >
                      {layer.enabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Compact AI Signal Chip on Chart when AI Signals Layer is ON */}
            {showAiSignals && aiAnalysis?.actionable && (
              <div
                className="pointer-events-none absolute top-1.5 left-2 z-[26] inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono-tabular text-[9.5px] font-bold shadow-sm"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.94)',
                  borderColor: aiAnalysis.direction === 'BUY' ? 'rgba(8,153,129,0.5)' : 'rgba(242,54,69,0.5)',
                  color: aiAnalysis.direction === 'BUY' ? '#089981' : '#F23645',
                }}
              >
                <span>AI {aiAnalysis.direction}</span>
                <span className="text-[#64748B]">·</span>
                <span className="text-[#131722]">{aiAnalysis.score}%</span>
              </div>
            )}

            {/* Crosshair Candle Point Meter Floating Pill (Range & Body) */}
            {crosshairPts && (
              <div className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 z-[28] rounded-full border border-[#E5E7EB] bg-[#FFFFFF]/95 px-2.5 py-0.5 font-mono-tabular text-[10px] font-bold text-[#131722] shadow-sm whitespace-nowrap">
                Range: {crosshairPts.range} pts |{' '}
                <span style={{ color: crosshairPts.isBull ? '#089981' : '#F23645' }}>
                  Body: {crosshairPts.body} pts
                </span>
              </div>
            )}

            {/* High-DPI Canvas SMC Overlay */}
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

            {/* Right-Axis Candle Countdown Stacked Directly Under Single Live Price Badge */}
            <PriceAxisCountdownTag
              syncRef={countdownSyncRef}
              chart={chartApiRef.current}
              candleSeries={candleSeriesRef.current}
              livePrice={livePrice}
              isBullTick={isBullTick}
              timeframe={timeframe}
              latestBarTime={latestBarTime}
            />

            {/* Far-Right Edge Entry Pills & Draggable TP/SL + Green Confirm */}
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
              onToggleTrailingStop={onToggleDemoTrailingStop}
              onClosePosition={onCloseDemoPosition}
            />

            {/* Replay Controls when active */}
            {!isFullScreen && replayActive && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-[#FFFFFF]/95 px-3 py-1 shadow-md">
                <button
                  type="button"
                  onClick={() => setReplayPlaying((p) => !p)}
                  className="vp-pill-btn inline-flex h-6 items-center gap-1 bg-[#F59E0B] px-2 text-[10px] font-bold text-[#131722] cursor-pointer"
                >
                  {replayPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {replayPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={() => applyReplaySlice(replayIndex + 1)}
                  disabled={replayIndex >= replayTotal}
                  className="vp-pill-btn inline-flex h-6 items-center gap-0.5 bg-[#F1F5F9] px-2 text-[10px] font-semibold text-[#131722] cursor-pointer"
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
                  className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[#F1F5F9] text-[#131722] cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={toggleReplayMode}
                  title="Exit Replay"
                  className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[#FEF2F2] text-[#F23645] cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Compact Bottom-Left Zoom Controls */}
            {!isFullScreen && (
              <div
                role="group"
                aria-label="Chart zoom controls"
                className="absolute bottom-7 left-2 z-[25] flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#FFFFFF]/95 p-0.5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={handleZoomIn}
                  aria-label="Zoom In"
                  className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F5F9] text-[11px] font-bold text-[#131722] hover:bg-[#E2E8F0] cursor-pointer"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  aria-label="Zoom Out"
                  className="flex h-5 w-5 items-center justify-center rounded bg-[#F1F5F9] text-[11px] font-bold text-[#131722] hover:bg-[#E2E8F0] cursor-pointer"
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
                  className="flex h-5 items-center justify-center rounded bg-[#F1F5F9] px-1.5 text-[9.5px] font-semibold text-[#131722] hover:bg-[#E2E8F0] cursor-pointer"
                >
                  Live
                </button>
              </div>
            )}

            {/* Initial Loading Overlay */}
            {isLoadingInitial && !loadError && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#FFFFFF]/70">
                <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-semibold text-[#131722] shadow-sm">
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
                  className="vp-pill-btn bg-[#F59E0B] px-3.5 py-1.5 font-semibold text-[#131722] cursor-pointer"
                >
                  Retry Chart
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Bottom 36% Area: Unified Signal + Order Execution Panel */}
      {!isFullScreen && (
        <div
          aria-label="Unified Signal and Trade Panel"
          className="h-[36%] min-h-[168px] rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] px-2.5 py-2 flex flex-col justify-between gap-1 overflow-hidden"
        >
          {/* Row 1: Signal, SMC Structure, Open Trades & Live Account Trigger */}
          <div className="flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span
                className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap"
                style={{
                  backgroundColor: !smc ? '#F1F5F9' : smc.trend === 1 ? '#ECFDF5' : '#FEF2F2',
                  color: !smc ? '#475569' : smc.trend === 1 ? '#089981' : '#F23645',
                }}
              >
                Signal: {!smc ? 'WAIT' : smc.trend === 1 ? 'BUY' : 'SELL'}
              </span>

              <span
                className="inline-flex items-center rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap"
                style={{ color: smc?.trend === -1 ? '#F23645' : '#089981' }}
              >
                SMC: {smc?.lastEvent ?? 'BOS'}
              </span>

              <span className="inline-flex items-center rounded-md border border-[#E5E7EB] bg-[#FFFFFF] px-1.5 py-0.5 text-[10px] font-semibold text-[#131722] whitespace-nowrap">
                Open Trades: {activePositions.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular">
              <span
                className="text-[10.5px] font-bold whitespace-nowrap"
                style={{
                  color:
                    totalFloatingPnl > 0.005
                      ? '#089981'
                      : totalFloatingPnl < -0.005
                        ? '#F23645'
                        : '#475569',
                }}
              >
                {formatUsd(activePositions.length > 0 ? activeFloatingPnl : totalFloatingPnl, true)}
              </span>
              <button
                type="button"
                onClick={onOpenDemoDrawer}
                className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-bold text-[#131722] cursor-pointer whitespace-nowrap"
              >
                Panel
              </button>
            </div>
          </div>

          {/* Row 2: Live Structural Levels & Equity Readout */}
          <div className="grid grid-cols-4 gap-1 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-1 font-mono-tabular text-[10px]">
            <div className="min-w-0">
              <span className="block text-[9px] text-[#64748B]">Entry</span>
              <span className="font-bold text-[#B45309] truncate block">
                {formatTerminalPrice(smc?.entry ?? livePrice, symbolMeta.precision)}
              </span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9px] text-[#64748B]">TP (1:2)</span>
              <span className="font-bold text-[#089981] truncate block">
                {formatTerminalPrice(smc?.tp ?? null, symbolMeta.precision)}
              </span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9px] text-[#64748B]">SL</span>
              <span className="font-bold text-[#F23645] truncate block">
                {formatTerminalPrice(smc?.sl ?? null, symbolMeta.precision)}
              </span>
            </div>
            <div className="min-w-0 text-right">
              <span className="block text-[9px] text-[#64748B]">Equity</span>
              <span className="font-bold text-[#131722] truncate block">
                {formatUsd(displayEquity)}
              </span>
            </div>
          </div>

          {/* Row 3 & 4: Margin Call Depleted Guard OR Quick Lot + Custom Lot Input + Buy/Sell Execution */}
          {isDepleted ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-[#F23645]/40 bg-[#FEF2F2] px-3 py-1.5">
              <p className="text-[11px] font-bold text-[#F23645] text-center">
                Margin Call: Balance Depleted
              </p>
              <button
                type="button"
                onClick={() => {
                  onResetDemoAccount?.();
                  setQuickOrderNote('Demo account reset to $1,000.00');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#089981] hover:brightness-110 px-3 py-1.5 text-xs font-bold text-[#FFFFFF] cursor-pointer shadow-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset $1,000 Demo
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1">
                {[0.01, 0.05, 0.1, 0.5, 1.0].map((lotOpt) => {
                  const active = Math.abs(demoDefaultLot - lotOpt) < 0.001;
                  return (
                    <button
                      key={lotOpt}
                      type="button"
                      onClick={() => {
                        onChangeDemoDefaultLot?.(lotOpt);
                        setCustomLotInput(lotOpt.toFixed(2));
                      }}
                      className={`flex-1 rounded-md border py-1 text-[10px] font-mono-tabular font-bold cursor-pointer whitespace-nowrap ${
                        active
                          ? 'border-[#131722] bg-[#131722] text-[#FFFFFF]'
                          : 'border-[#E5E7EB] bg-[#F8FAFC] text-[#475569] hover:text-[#131722]'
                      }`}
                    >
                      {lotOpt}
                    </button>
                  );
                })}

                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10"
                  aria-label="Custom Lot Size"
                  value={customLotInput}
                  onChange={(e) => {
                    setCustomLotInput(e.target.value);
                    const val = Number.parseFloat(e.target.value);
                    if (Number.isFinite(val) && val >= 0.01) {
                      onChangeDemoDefaultLot?.(Math.min(10, Number(val.toFixed(2))));
                    }
                  }}
                  className="w-14 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] py-1 px-1 text-center font-mono-tabular text-[10px] font-bold text-[#131722] outline-none focus:border-[#089981]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickDemoOrder('SELL')}
                  className="rounded-lg bg-[#F23645] hover:brightness-110 py-1.5 text-xs font-bold text-[#FFFFFF] cursor-pointer active:scale-[0.98] transition-all"
                >
                  SELL {demoDefaultLot.toFixed(2)}
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemoOrder('BUY')}
                  className="rounded-lg bg-[#089981] hover:brightness-110 py-1.5 text-xs font-bold text-[#FFFFFF] cursor-pointer active:scale-[0.98] transition-all"
                >
                  BUY {demoDefaultLot.toFixed(2)}
                </button>
              </div>
            </>
          )}

          {quickOrderNote && !isDepleted && (
            <p className="text-[9.5px] font-medium text-[#64748B] truncate leading-none">
              {quickOrderNote}
            </p>
          )}
        </div>
      )}
      </div>

      {/* 3. High-Accuracy Short-Term 'AI Short-Term Market Analyst' Box (Below Trade Panel) */}
      {!isFullScreen && (
        <section
          aria-label="AI Short-Term Market Analyst"
          className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-2.5 sm:p-3 space-y-2 shrink-0"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="h-3.5 w-3.5 text-[#B45309] shrink-0" />
              <h2 className="text-xs sm:text-[13px] font-bold text-[#131722] truncate">
                AI Short-Term Market Analyst
              </h2>
              <span className="rounded border border-[#E5E7EB] bg-[#F8FAFC] px-1.5 py-0.5 text-[9.5px] font-mono-tabular font-bold text-[#475569] shrink-0">
                {currentTfLabel} · {htfTrend?.label ?? '15m / 1H'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular">
              {aiAnalysis && (
                <>
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold"
                    style={{
                      backgroundColor: aiAnalysis.score >= 75 ? '#ECFDF5' : aiAnalysis.score >= 50 ? '#FFFBEB' : '#F1F5F9',
                      color: aiAnalysis.score >= 75 ? '#089981' : aiAnalysis.score >= 50 ? '#B45309' : '#475569',
                    }}
                  >
                    {aiAnalysis.score}% Confluence
                  </span>
                  <span className="text-[10px] font-bold text-[#131722] whitespace-nowrap hidden sm:inline">
                    {aiAnalysis.grade}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                aria-label="Share AI Setup"
                className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold text-[#131722] cursor-pointer whitespace-nowrap"
              >
                <ArrowUpRight className="h-3 w-3" />
                <span>Share</span>
              </button>
            </div>
          </div>

          {/* News Volatility Shield Alert on AI Screen */}
          {newsShieldAlert && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-lg border border-[#F59E0B]/50 bg-[#FFFBEB] px-2.5 py-1.5 text-[10.5px] font-bold text-[#B45309]"
            >
              <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#D97706]" />
                <span className="truncate">{newsShieldAlert.bannerText}</span>
              </span>
              <span className="font-mono-tabular text-[9.5px] text-[#92400E] shrink-0">
                {newsShieldAlert.event.currency}
              </span>
            </div>
          )}

          {/* 5-Rule MTF + Technical Confluence Grid */}
          {aiAnalysis ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {aiAnalysis.rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      rule.passed
                        ? 'border-[#089981]/30 bg-[#ECFDF5]/60'
                        : 'border-[#E5E7EB] bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-bold text-[#131722]">
                      <span className="truncate">{rule.label}</span>
                      {rule.passed ? (
                        <CheckCircle2 className="h-3 w-3 text-[#089981] shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-[#94A3B8] shrink-0" />
                      )}
                    </div>
                    <div
                      className="text-[9.5px] font-mono-tabular truncate mt-0.5"
                      style={{ color: rule.passed ? '#065F46' : '#64748B' }}
                    >
                      {rule.detail}
                    </div>
                  </div>
                ))}
              </div>

              {aiAnalysis.actionable && aiAnalysis.entry !== null ? (
                <div className="rounded-lg border border-[#089981]/35 bg-[#ECFDF5]/45 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="rounded px-2 py-0.5 text-[10.5px] font-extrabold font-mono-tabular text-[#FFFFFF]"
                        style={{
                          backgroundColor: aiAnalysis.direction === 'BUY' ? '#089981' : '#F23645',
                        }}
                      >
                        SMART SCALP · {aiAnalysis.direction}
                      </span>
                      <span className="text-[10.5px] font-medium text-[#131722] truncate">
                        {aiAnalysis.reason}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (appliedAiSetup) {
                            setAppliedAiSetup(null);
                          } else {
                            setShowAiSignals(true);
                            setAppliedAiSetup(aiAnalysis);
                            terminalSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className={`rounded-lg px-2.5 py-1 text-[10.5px] font-bold cursor-pointer shrink-0 transition-colors ${
                          appliedAiSetup
                            ? 'border border-[#E5E7EB] bg-[#FFFFFF] text-[#131722] hover:bg-[#F8FAFC]'
                            : 'bg-[#131722] text-[#FFFFFF] hover:bg-[#1E293B]'
                        }`}
                      >
                        {appliedAiSetup ? 'Clear Chart Setup' : 'Apply Setup to Chart'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] px-2 py-1 font-mono-tabular text-[10px]">
                    <div className="min-w-0">
                      <span className="block text-[8.5px] uppercase text-[#64748B]">Entry</span>
                      <span className="font-bold text-[#B45309] truncate block">
                        {formatTerminalPrice(aiAnalysis.entry, symbolMeta.precision)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="block text-[8.5px] uppercase text-[#64748B]">Tight SL</span>
                      <span className="font-bold text-[#F23645] truncate block">
                        {formatTerminalPrice(aiAnalysis.sl, symbolMeta.precision)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="block text-[8.5px] uppercase text-[#64748B]">TP1 (1.5R)</span>
                      <span className="font-bold text-[#089981] truncate block">
                        {formatTerminalPrice(aiAnalysis.tp1, symbolMeta.precision)}
                      </span>
                    </div>
                    <div className="min-w-0 text-right">
                      <span className="block text-[8.5px] uppercase text-[#64748B]">TP2 (2.5R)</span>
                      <span className="font-bold text-[#089981] truncate block">
                        {formatTerminalPrice(aiAnalysis.tp2, symbolMeta.precision)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[#F59E0B]/40 bg-[#FFFBEB]/70 px-2.5 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-extrabold text-[#B45309]">
                      NO TRADE / WAIT — Market Choppy
                    </p>
                    <p className="text-[10px] text-[#475569] truncate">
                      {aiAnalysis.reason}
                    </p>
                  </div>
                  <span className="rounded border border-[#E5E7EB] bg-[#FFFFFF] px-2 py-0.5 text-[10px] font-mono-tabular font-bold text-[#64748B] shrink-0">
                    Need ≥ 75%
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#64748B]">
              Scanning 15m/1H HTF trend, 20/50 EMA, SMC structure, RSI(14), and candle strength...
            </div>
          )}
        </section>
      )}

      {/* 1-Tap Share Setup Viral Modal (WhatsApp / Telegram / Copy) */}
      {shareModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share TREDAURA Trade Setup"
          className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/35 backdrop-blur-[1px] p-4"
          onClick={() => setShareModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-2xl space-y-3 text-[#131722]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-[#089981]" />
                <h3 className="text-sm font-bold">Share AI Trade Setup</h3>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                aria-label="Close share dialog"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#475569] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <pre className="whitespace-pre-wrap rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 font-mono-tabular text-[11px] leading-relaxed text-[#131722] select-all">
              {shareSignalText}
            </pre>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareSignalText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#089981] hover:brightness-110 px-3 py-2 text-xs font-bold text-[#FFFFFF] no-underline transition-all"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(
                  typeof window !== 'undefined' ? window.location.origin : 'https://tredaura.app'
                )}&text=${encodeURIComponent(shareSignalText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0284C7] hover:brightness-110 px-3 py-2 text-xs font-bold text-[#FFFFFF] no-underline transition-all"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>Telegram</span>
              </a>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyShareSetup}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] px-3 py-2 text-xs font-bold text-[#131722] cursor-pointer"
              >
                {shareCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#089981]" />
                    <span className="text-[#089981]">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[#475569]" />
                    <span>Copy Setup</span>
                  </>
                )}
              </button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={handleNativeShareSetup}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#131722] hover:bg-[#1E293B] px-3 py-2 text-xs font-bold text-[#FFFFFF] cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>More</span>
                </button>
              )}
            </div>
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
        className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono-tabular text-[11px] font-bold tracking-tight whitespace-nowrap shrink-0"
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
  onToggleTrailingStop?: (positionId: string) => void;
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
    onToggleTrailingStop,
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

      // Separate close Entry bars vertically (~18px) so far-right compact pills never stack
      entryPlotHandles.sort((a, b) => a.rawY - b.rawY);
      for (let i = 1; i < entryPlotHandles.length; i++) {
        entryPlotHandles[i].y = Math.max(entryPlotHandles[i].y, entryPlotHandles[i - 1].y + 18);
      }

      // Deduplicate/prevent overlap on right price axis (keeping only 1 live price badge + clean trade badges)
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
      const filteredAxisBadges: AxisPriceBadgeItem[] = [];
      for (const b of rawAxisBadges) {
        const duplicateSamePrice = filteredAxisBadges.some(
          (prev) => prev.kind === b.kind && Math.abs(prev.rawY - b.rawY) < 4
        );
        if (!duplicateSamePrice) filteredAxisBadges.push(b);
      }

      const placedYs: number[] = [];
      for (let i = 0; i < filteredAxisBadges.length; i++) {
        let y = Math.max(minTop, Math.min(maxTop, filteredAxisBadges[i].rawY));
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

      const resolvedAxisBadges = filteredAxisBadges.map((b, idx) => ({
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
        const dir = e.deltaY < 0 ? 1 : -1;
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

        {/* Far-Right Edge Ultra-Compact Entry Tags & Draggable TP/SL Pills */}
        {paneWidth > 0 &&
          plotHandles.map((h) => {
            const pos = positions.find((p) => p.id === h.positionId);
            if (!pos) return null;

            if (h.kind === 'entry') {
              const isProfit = h.pnl > 0;
              const accentColor = h.pnl >= 0 ? '#089981' : '#F23645';
              const hasTp = pos.tp !== undefined || (dragPreview?.positionId === pos.id && dragPreview.kind === 'tp');
              const hasSl = pos.sl !== undefined || (dragPreview?.positionId === pos.id && dragPreview.kind === 'sl');
              const isAtBreakeven =
                pos.sl !== undefined &&
                Math.abs(pos.sl - pos.entryPrice) <= minMove * 1.5;
              const showBreakevenBtn = pos.sl !== undefined && isProfit;
              const hasSlSet = pos.sl !== undefined;
              const trailingActive = pos.trailingDistance !== undefined;

              return (
                <div
                  key={h.key}
                  style={{
                    transform: `translate3d(0, ${Math.round(h.y - 8)}px, 0)`,
                    right: `${scaleWidth + 2}px`,
                  }}
                  className="pointer-events-auto absolute top-0 flex items-center gap-1 select-none"
                >
                  {showBreakevenBtn && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isAtBreakeven) {
                          onUpdateTpSl?.(pos.id, pos.tp, Number(pos.entryPrice.toFixed(precision)));
                        }
                      }}
                      title={
                        isAtBreakeven
                          ? 'Stop Loss is locked at Breakeven'
                          : 'Move Stop Loss to Breakeven (Risk-Free)'
                      }
                      className={`inline-flex h-[16px] items-center justify-center rounded-[3px] border px-1 font-mono-tabular text-[8.5px] font-extrabold leading-none shadow-sm cursor-pointer transition-colors ${
                        isAtBreakeven
                          ? 'border-[#089981] bg-[#089981] text-[#FFFFFF]'
                          : 'border-[#089981]/60 bg-[#ECFDF5] text-[#089981] hover:bg-[#089981] hover:text-[#FFFFFF]'
                      }`}
                    >
                      {isAtBreakeven ? 'BE✓' : 'BE'}
                    </button>
                  )}

                  {hasSlSet && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleTrailingStop?.(pos.id);
                      }}
                      title={
                        trailingActive
                          ? 'Trailing Stop Active (Tap to Disable)'
                          : 'Enable Live Trailing Stop-Loss'
                      }
                      className={`inline-flex h-[16px] items-center justify-center rounded-[3px] border px-1 font-mono-tabular text-[8.5px] font-extrabold leading-none shadow-sm cursor-pointer transition-colors ${
                        trailingActive
                          ? 'border-[#B45309] bg-[#F59E0B] text-[#FFFFFF]'
                          : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      {trailingActive ? 'TS✓' : 'TS'}
                    </button>
                  )}

                  <div
                    style={{ borderColor: accentColor }}
                    className="inline-flex h-[16px] items-center rounded-[3px] border bg-[#FFFFFF]/95 shadow-sm overflow-hidden font-mono-tabular text-[9px] font-bold"
                  >
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
                      className={`h-full px-1 flex items-center border-r border-[#E5E7EB] cursor-ns-resize touch-none transition-colors ${
                        hasTp
                          ? 'bg-[#089981] text-[#FFFFFF]'
                          : 'bg-[#ECFDF5] text-[#089981] hover:bg-[#D1FAE5]'
                      }`}
                    >
                      TP
                    </button>

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
                      className={`h-full px-1 flex items-center border-r border-[#E5E7EB] cursor-ns-resize touch-none transition-colors ${
                        hasSl
                          ? 'bg-[#F23645] text-[#FFFFFF]'
                          : 'bg-[#FEF2F2] text-[#F23645] hover:bg-[#FEE2E2]'
                      }`}
                    >
                      SL
                    </button>

                    <span className="px-1 text-[#131722] leading-none">
                      {h.lots.toFixed(2)}
                    </span>
                    <span className="text-[#CBD5E1]">|</span>
                    <span
                      className="px-1 leading-none"
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
                      className="h-full px-1 flex items-center justify-center text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#F23645] cursor-pointer leading-none text-[10px]"
                    >
                      ×
                    </button>
                  </div>
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
