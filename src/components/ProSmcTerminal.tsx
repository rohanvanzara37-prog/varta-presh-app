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
  ArrowUpRight,
  Check,
  ChevronDown,
  Columns2,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Ruler,
  Settings,
  Share2,
  SkipForward,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { ThemeMode } from '../types/news';
import {
  DEMO_SYMBOL_SPECS,
  calcLotsForDollarRisk,
  calcPositionPnl,
  formatUsd,
  getBidAskPrices,
  type BrokerSimMode,
  type DemoAccountMetrics,
  type DemoClosedTrade,
  type DemoLimitOrder,
  type DemoPosition,
  type TrailingMode,
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
  buildGhostCandles,
  computeElliottWyckoff,
  computeFibConfluence,
  computeKeyLevels,
  computeMtfMatrix,
  computeOrderFlowMetrics,
  computeZoneMitigations,
  detectLiquidityPools,
  detectSpikeCatalysts,
  evaluateBreakoutVsFakeout,
  toHeikinAshi,
  type ChartDrawingItem,
  type ChartVisualMode,
  type DrawingToolType,
} from '../utils/institutionalEngine';
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
  | 'US30'
  | 'USOIL';

export type SmcTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export interface ExecuteOrderOptions {
  tp?: number;
  sl?: number;
  trailingMode?: TrailingMode;
  autoBreakeven?: boolean;
  note?: string;
}

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
  demoPendingOrders?: DemoLimitOrder[];
  demoHistory?: DemoClosedTrade[];
  demoMetrics?: DemoAccountMetrics;
  demoDefaultLot?: number;
  simMode?: BrokerSimMode;
  marginCallActive?: boolean;
  onExecuteDemoOrder?: (
    symbol: SmcSymbol,
    side: 'BUY' | 'SELL',
    lots: number,
    opts?: ExecuteOrderOptions
  ) => string | null;
  onPlaceLimitOrder?: (
    symbol: SmcSymbol,
    side: 'BUY' | 'SELL',
    lots: number,
    limitPrice: number,
    tp?: number,
    sl?: number,
    label?: string
  ) => string | null;
  onCancelLimitOrder?: (orderId: string) => void;
  onCloseDemoPosition?: (positionId: string) => void;
  onPartialCloseDemoPosition?: (positionId: string, pct: 0.25 | 0.5) => void;
  onReverseDemoPosition?: (positionId: string) => void;
  onHedgeDemoPosition?: (positionId: string) => void;
  onCloseProfitablePositions?: () => void;
  onCloseLosingPositions?: () => void;
  onCloseAllPositions?: () => void;
  onUpdateDemoPositionTpSl?: (positionId: string, tp: number | undefined, sl: number | undefined) => void;
  onToggleDemoTrailingStop?: (positionId: string, mode?: TrailingMode) => void;
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
    return { label: 'NY Open', dotColor: '#089981', bgColor: 'rgba(8,153,129,0.16)', textColor: '#089981' };
  }
  if (utcHour >= 8 && utcHour < 13) {
    return { label: 'London', dotColor: '#F59E0B', bgColor: 'rgba(245,158,11,0.16)', textColor: '#F59E0B' };
  }
  return { label: 'Asian', dotColor: '#F59E0B', bgColor: 'rgba(255,255,255,0.08)', textColor: 'var(--vp-text)' };
}

function getChartThemeOptions(themeMode: ThemeMode, showGrid = true) {
  const isDark = themeMode === 'dark';
  const gridCol = showGrid
    ? isDark
      ? 'rgba(255, 255, 255, 0.05)'
      : 'rgba(19, 23, 34, 0.045)'
    : 'rgba(0, 0, 0, 0)';
  return {
    layout: {
      background: { type: ColorType.Solid, color: isDark ? '#060911' : '#FFFFFF' },
      textColor: isDark ? '#FFFFFF' : '#131722',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    },
    grid: {
      vertLines: {
        color: gridCol,
        style: LineStyle.Solid,
      },
      horzLines: {
        color: gridCol,
        style: LineStyle.Solid,
      },
    },
    crosshair: {
      vertLine: {
        color: isDark ? 'rgba(245, 158, 11, 0.65)' : 'rgba(180, 83, 9, 0.45)',
        labelBackgroundColor: isDark ? '#0F1626' : '#131722',
      },
      horzLine: {
        color: isDark ? 'rgba(245, 158, 11, 0.65)' : 'rgba(180, 83, 9, 0.45)',
        labelBackgroundColor: isDark ? '#0F1626' : '#131722',
      },
    },
    timeScale: {
      borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#E5E7EB',
    },
    rightPriceScale: {
      borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#E5E7EB',
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
  { value: 'US30', tvSymbol: 'TVC:DJI', shortLabel: 'US30', label: 'US30 · Dow Jones', isCrypto: false, precision: 2, minMove: 0.1 },
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
  if (tvSymbol.includes('DJI') || tvSymbol.includes('US30')) return 'US30';
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

const DRAWINGS_STORAGE_KEY = 'tredaura_drawings_v1';
const TERMINAL_TF_STORAGE_KEY = 'tredaura_terminal_tf_v1';

function loadSavedTimeframe(): SmcTimeframe {
  try {
    const raw = localStorage.getItem(TERMINAL_TF_STORAGE_KEY);
    if (raw && raw in TIMEFRAME_SECONDS) return raw as SmcTimeframe;
  } catch {
    // ignore storage errors
  }
  return '15m';
}

function loadSavedDrawings(): ChartDrawingItem[] {
  try {
    const raw = localStorage.getItem(DRAWINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 80) : [];
  } catch {
    return [];
  }
}

const ProSmcTerminalInner: React.FC<ProSmcTerminalProps> = ({
  externalTvSymbol,
  onSelectTvSymbol,
  onTelemetryChange,
  themeMode = 'light',
  onChangeThemeMode,
  demoPositions = [],
  demoPendingOrders = [],
  demoHistory = [],
  demoMetrics,
  demoDefaultLot = 0.1,
  simMode = 'real',
  marginCallActive = false,
  onExecuteDemoOrder,
  onPlaceLimitOrder,
  onCancelLimitOrder,
  onCloseDemoPosition,
  onPartialCloseDemoPosition,
  onReverseDemoPosition,
  onHedgeDemoPosition,
  onCloseProfitablePositions,
  onCloseLosingPositions,
  onCloseAllPositions,
  onUpdateDemoPositionTpSl,
  onToggleDemoTrailingStop,
  onChangeDemoDefaultLot,
  onOpenDemoDrawer,
  onLivePriceTick,
}) => {
  const [symbol, setSymbol] = useState<SmcSymbol>(() => mapTvSymbolToSmc(externalTvSymbol) ?? 'XAUUSD');
  const [timeframe, setTimeframe] = useState<SmcTimeframe>(() => loadSavedTimeframe());
  const [chartVisualMode, setChartVisualMode] = useState<ChartVisualMode>('candles');
  const [focusMode, setFocusMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [splitScreen, setSplitScreen] = useState(false);
  const [splitTf, setSplitTf] = useState<SmcTimeframe>('1h');
  const [showMtfMatrix, setShowMtfMatrix] = useState(false);

  const [showSupportResistance, setShowSupportResistance] = useState(true);
  const [showPatterns, setShowPatterns] = useState(true);
  const [showSwingLabels, setShowSwingLabels] = useState(false);
  const [showBosChoch, setShowBosChoch] = useState(true);
  const [showKeyLevels, setShowKeyLevels] = useState(false);
  const [showLiquidityPools, setShowLiquidityPools] = useState(false);
  const [showFibWaves, setShowFibWaves] = useState(false);
  const [showGhostCandles, setShowGhostCandles] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // On-Chart Technical Indicators & Expanded Drawing Suite (persisted in localStorage)
  const [showEma20, setShowEma20] = useState(false);
  const [showEma50, setShowEma50] = useState(false);
  const [showEma200, setShowEma200] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showRsi, setShowRsi] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [activeDrawTool, setActiveDrawTool] = useState<DrawingToolType>('none');
  const [userDrawings, setUserDrawings] = useState<ChartDrawingItem[]>(() => loadSavedDrawings());
  const [pendingTrendPoint, setPendingTrendPoint] = useState<{ t1: UTCTimestamp; p1: number } | null>(null);
  const [tradesStripTab, setTradesStripTab] = useState<'open' | 'limits' | 'history' | null>(null);
  const [liveRsi, setLiveRsi] = useState<number | null>(null);
  const [quickOrderNote, setQuickOrderNote] = useState<string | null>(null);
  const [customLotInput, setCustomLotInput] = useState<string>(() => demoDefaultLot.toFixed(2));
  const [sessionBadge, setSessionBadge] = useState(() => getMarketSessionBadge());
  const [crosshairXray, setCrosshairXray] = useState<{
    range: string;
    pips: string;
    body: string;
    bodyPct: number;
    wickPct: number;
    buyerPct: number;
    sellerPct: number;
    isBull: boolean;
    spikeCatalyst?: string;
  } | null>(null);
  const [quickLimitTap, setQuickLimitTap] = useState<{ price: number } | null>(null);

  // Bar Replay & Full-Screen
  const [replayActive, setReplayActive] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayTotal, setReplayTotal] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const [liveQuote, setLiveQuote] = useState<{ symbol: SmcSymbol; price: number } | null>(null);
  const livePrice =
    liveQuote && liveQuote.symbol === symbol && Number.isFinite(liveQuote.price) && liveQuote.price > 0
      ? liveQuote.price
      : null;
  const [isBullTick, setIsBullTick] = useState<boolean>(true);
  const [latestBarSnapshot, setLatestBarSnapshot] = useState<TerminalCandle | null>(null);
  const [streamStatus, setStreamStatus] = useState<'CONNECTING' | 'LIVE WS' | 'RECONNECTING'>('CONNECTING');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [smc, setSmc] = useState<SmcAnalysisState | null>(null);
  const [structureOverlay, setStructureOverlay] = useState<ChartStructureOverlayData | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiScalpAnalysisState | null>(null);
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
  const splitChartWrapRef = useRef<HTMLDivElement | null>(null);
  const splitChartApiRef = useRef<IChartApi | null>(null);
  const splitSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const lineModeSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const chartVisualModeRef = useRef<ChartVisualMode>(chartVisualMode);
  chartVisualModeRef.current = chartVisualMode;

  const terminalSectionRef = useRef<HTMLElement | null>(null);
  const layersBtnRef = useRef<HTMLButtonElement | null>(null);
  const layersMenuRef = useRef<HTMLDivElement | null>(null);
  const htfTrendRef = useRef<HtfTrendSummary | null>(null);
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

  const symbolMeta = SYMBOL_OPTIONS.find((s) => s.value === symbol) ?? SYMBOL_OPTIONS[0];
  const latestBarTime = latestBarSnapshot?.time;
  const precisionRef = useRef<number>(symbolMeta.precision);
  precisionRef.current = symbolMeta.precision;
  const timeframeRef = useRef<SmcTimeframe>(timeframe);
  timeframeRef.current = timeframe;
  const symbolRef = useRef<SmcSymbol>(symbol);
  symbolRef.current = symbol;

  useEffect(() => {
    try {
      localStorage.setItem(TERMINAL_TF_STORAGE_KEY, timeframe);
    } catch {
      // ignore storage errors
    }
  }, [timeframe]);

  useEffect(() => {
    const handleRefreshCharts = () => {
      setReloadNonce((n) => n + 1);
    };
    window.addEventListener('tredaura-refresh-charts', handleRefreshCharts);
    return () => window.removeEventListener('tredaura-refresh-charts', handleRefreshCharts);
  }, []);

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
    if (liveQuote && liveQuote.symbol === symbol && Number.isFinite(liveQuote.price) && liveQuote.price > 0) {
      onLivePriceTick?.(symbol, liveQuote.price);
    }
  }, [symbol, liveQuote, onLivePriceTick]);

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

    const initialChartTheme = getChartThemeOptions(themeMode, showGrid);

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

    const lineModeSeries = chart.addSeries(LineSeries, {
      color: '#089981',
      lineWidth: 2,
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      priceLineColor: '#089981',
      lastValueVisible: true,
      visible: false,
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
    lineModeSeriesRef.current = lineModeSeries;
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
        setCrosshairXray((prev) => (prev === null ? prev : null));
        return;
      }
      const rawBar = latestCandlesRef.current.find((c) => c.time === param.time);
      const rawData = param.seriesData.get(candleSeries) as
        | { open?: number; high?: number; low?: number; close?: number }
        | undefined;
      const bar =
        rawBar ??
        (rawData &&
        typeof rawData.open === 'number' &&
        typeof rawData.high === 'number' &&
        typeof rawData.low === 'number' &&
        typeof rawData.close === 'number'
          ? rawData
          : null);
      if (!bar || typeof bar.open !== 'number' || typeof bar.high !== 'number' || typeof bar.low !== 'number' || typeof bar.close !== 'number') {
        setCrosshairXray((prev) => (prev === null ? prev : null));
        return;
      }
      const prec = precisionRef.current;
      const totalRng = Math.max(1e-6, bar.high - bar.low);
      const rangeVal = totalRng.toFixed(prec);
      const bodyDiff = bar.close - bar.open;
      const bodyStr = `${bodyDiff >= 0 ? '+' : '-'}${Math.abs(bodyDiff).toFixed(prec)}`;
      const isBull = bodyDiff >= 0;
      const bodyPct = Math.round((Math.abs(bodyDiff) / totalRng) * 100);
      const wickPct = Math.max(0, 100 - bodyPct);
      const buyerPct = Math.max(10, Math.min(90, Math.round(((bar.close - bar.low) / totalRng) * 100)));
      const sellerPct = 100 - buyerPct;
      const spec = DEMO_SYMBOL_SPECS[symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
      const pips = (totalRng / Math.max(1e-6, spec.pipSize)).toFixed(1);
      const spk = detectSpikeCatalysts(latestCandlesRef.current).find((s) => s.time === param.time);
      setCrosshairXray({
        range: rangeVal,
        pips,
        body: bodyStr,
        bodyPct,
        wickPct,
        buyerPct,
        sellerPct,
        isBull,
        spikeCatalyst: spk?.catalyst,
      });
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
      lineModeSeriesRef.current = null;
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
    chartApiRef.current?.applyOptions(getChartThemeOptions(themeMode, showGrid));
    candleSeriesRef.current?.applyOptions(getCandleStyleOptions(themeMode));
    scheduleOverlayRafRef.current?.();
  }, [themeMode, showGrid]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify(userDrawings));
    } catch {
      // ignore storage quota errors
    }
  }, [userDrawings]);

  useEffect(() => {
    const candles = latestCandlesRef.current;
    const cs = candleSeriesRef.current;
    const ls = lineModeSeriesRef.current;
    if (!cs || !ls) return;
    if (chartVisualMode === 'line') {
      cs.applyOptions({ visible: false });
      ls.applyOptions({ visible: true });
      ls.setData(candles.map((c) => ({ time: c.time, value: c.close })));
    } else if (chartVisualMode === 'heikin') {
      ls.applyOptions({ visible: false });
      cs.applyOptions({ visible: true });
      cs.setData(toHeikinAshi(candles).map(toPureCandle));
    } else {
      ls.applyOptions({ visible: false });
      cs.applyOptions({ visible: true });
      cs.setData(candles.map(toPureCandle));
    }
    scheduleOverlayRafRef.current?.();
  }, [chartVisualMode]);

  useEffect(() => {
    if (!splitScreen) {
      if (splitChartApiRef.current) {
        splitChartApiRef.current.remove();
        splitChartApiRef.current = null;
        splitSeriesRef.current = null;
      }
      return;
    }
    const el = splitChartWrapRef.current;
    if (!el) return;
    const themeOpts = getChartThemeOptions(themeMode, showGrid);
    const sc = createChart(el, {
      autoSize: true,
      layout: { ...themeOpts.layout, fontSize: 9.5, attributionLogo: false },
      grid: themeOpts.grid,
      timeScale: { ...themeOpts.timeScale, timeVisible: true, rightOffset: 4, barSpacing: 5 },
      rightPriceScale: { ...themeOpts.rightPriceScale, minimumWidth: 54 },
    });
    const sSeries = sc.addSeries(CandlestickSeries, {
      ...getCandleStyleOptions(themeMode),
      priceLineVisible: true,
      lastValueVisible: true,
    });
    splitChartApiRef.current = sc;
    splitSeriesRef.current = sSeries;

    const controller = new AbortController();
    const syncSplit = async () => {
      try {
        const res = await fetchCandles(symbol, splitTf, controller.signal, { limit: 120 });
        if (res.candles.length > 0 && splitSeriesRef.current) {
          splitSeriesRef.current.setData(res.candles.map(toPureCandle));
          sc.timeScale().fitContent();
        }
      } catch {
        // ignore abort
      }
    };
    void syncSplit();
    const timer = window.setInterval(() => void syncSplit(), 10_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      sc.remove();
      splitChartApiRef.current = null;
      splitSeriesRef.current = null;
    };
  }, [splitScreen, symbol, splitTf, themeMode, showGrid]);

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

      const themeOpts = getChartThemeOptions(themeMode);
      chart.applyOptions({
        ...themeOpts,
        layout: {
          ...themeOpts.layout,
          attributionLogo: false,
        },
      });
      series?.applyOptions(getCandleStyleOptions(themeMode));

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
    showKeyLevels,
    showLiquidityPools,
    showFibWaves,
    showGhostCandles,
    focusMode,
    userDrawings,
    pendingTrendPoint,
    chartVisualMode,
    timeframe,
    symbol,
  ]);

  const runSmcAnalysis = useCallback((candles: TerminalCandle[], targetSym?: SmcSymbol) => {
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
    if (Number.isFinite(latest.close) && latest.close > 0) {
      setLiveQuote({ symbol: targetSym ?? symbolRef.current, price: latest.close });
    }
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

  const syncMainVisualSeries = useCallback((candles: TerminalCandle[]) => {
    const cs = candleSeriesRef.current;
    const ls = lineModeSeriesRef.current;
    if (!cs) return;
    if (chartVisualModeRef.current === 'line') {
      cs.applyOptions({ visible: false });
      ls?.applyOptions({ visible: true });
      ls?.setData(candles.map((c) => ({ time: c.time, value: c.close })));
    } else if (chartVisualModeRef.current === 'heikin') {
      ls?.applyOptions({ visible: false });
      cs.applyOptions({ visible: true });
      cs.setData(toHeikinAshi(candles).map(toPureCandle));
    } else {
      ls?.applyOptions({ visible: false });
      cs.applyOptions({ visible: true });
      cs.setData(candles.map(toPureCandle));
    }
  }, []);

  // Replay Mode helpers & timer
  const applyReplaySlice = useCallback(
    (nextIdx: number) => {
      const full = fullCandlesRef.current;
      if (full.length === 0 || !candleSeriesRef.current) return;
      const clamped = Math.max(20, Math.min(full.length, nextIdx));
      const sliced = full.slice(0, clamped);
      latestCandlesRef.current = sliced;
      syncMainVisualSeries(sliced);
      const last = sliced[sliced.length - 1];
      candleSeriesRef.current.applyOptions({
        priceLineColor: last.close >= last.open ? '#089981' : '#F23645',
      });
      syncTechnicalIndicators(sliced, false);
      runSmcAnalysis(sliced);
      setReplayIndex(clamped);
    },
    [runSmcAnalysis, syncTechnicalIndicators, syncMainVisualSeries]
  );

  const toggleReplayMode = useCallback(() => {
    if (replayActive) {
      setReplayPlaying(false);
      setReplayActive(false);
      const full = fullCandlesRef.current;
      if (full.length > 0 && candleSeriesRef.current) {
        latestCandlesRef.current = full;
        syncMainVisualSeries(full);
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
  }, [replayActive, applyReplaySlice, runSmcAnalysis, syncTechnicalIndicators, syncMainVisualSeries]);

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
        syncMainVisualSeries(sliced);
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
  }, [replayActive, replayPlaying, replaySpeed, runSmcAnalysis, syncTechnicalIndicators, syncMainVisualSeries]);

  // Real-Time WebSocket Engine + Backward Infinite Scroll + Gap Sync on Wake
  useEffect(() => {
    const activeSym = symbol;
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
        if (chartVisualModeRef.current === 'line') {
          lineModeSeriesRef.current?.update({ time: animCurrentCandle.time, value: animCurrentCandle.close });
        } else {
          candleSeriesRef.current.update(toPureCandle(animCurrentCandle));
        }
        if (lastPriceLineBullRef.current !== isBullAnim) {
          lastPriceLineBullRef.current = isBullAnim;
          candleSeriesRef.current.applyOptions({
            priceLineColor: isBullAnim ? '#089981' : '#F23645',
          });
          lineModeSeriesRef.current?.applyOptions({
            priceLineColor: isBullAnim ? '#089981' : '#F23645',
          });
        }
        const nowPerf = performance.now();
        if (nowPerf - lastStatePushMs >= 100 || animCurrentCandle.close === animTargetCandle.close) {
          lastStatePushMs = nowPerf;
          if (Number.isFinite(animCurrentCandle.close) && animCurrentCandle.close > 0) {
            setLiveQuote({ symbol: activeSym, price: animCurrentCandle.close });
          }
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
        const candles = res.candles;
        if (candles.length === 0) {
          setLoadError(`Unable to load live ${symbol} candlesticks.`);
          return;
        }

        fullCandlesRef.current = [...candles];
        latestCandlesRef.current = [...candles];
        setReplayTotal(candles.length);
        if (chartVisualModeRef.current === 'heikin') {
          candleSeriesRef.current?.setData(toHeikinAshi(candles).map(toPureCandle));
        } else {
          candleSeriesRef.current?.setData(candles.map(toPureCandle));
        }
        lineModeSeriesRef.current?.setData(candles.map((c) => ({ time: c.time, value: c.close })));
        const latest = candles[candles.length - 1];
        lastRealClosePrice = latest.close;
        animTargetCandle = latest;
        animCurrentCandle = { ...latest };
        const initBull = latest.close >= latest.open;
        lastPriceLineBullRef.current = initBull;
        candleSeriesRef.current?.applyOptions({
          priceLineColor: initBull ? '#089981' : '#F23645',
        });
        lineModeSeriesRef.current?.applyOptions({
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
    const matchingLimits = demoPendingOrders.filter((o) => o.symbol === symbol);

    if (matching.length > 0) {
      const mark = livePrice ?? matching[0].entryPrice;
      for (const pos of matching.slice(0, 6)) {
        const pnl = calcPositionPnl(pos, mark, simMode);
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
    }

    for (const ord of matchingLimits.slice(0, 6)) {
      try {
        const limitLine = series.createPriceLine({
          price: ord.limitPrice,
          color: ord.side === 'BUY' ? '#089981' : '#F23645',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${ord.side} LMT ${ord.lots.toFixed(2)}`,
        });
        primaryPositionLinesRef.current.push(limitLine);
      } catch {
        // ignore if series disposed
      }
    }
    tradeOverlaySyncRef.current?.();
  }, [demoPositions, demoPendingOrders, symbol, livePrice, dragPreview, simMode]);

  const activeSpec = DEMO_SYMBOL_SPECS[symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const bidAsk = getBidAskPrices(symbol, livePrice ?? activeSpec.defaultPrice, { simMode });
  const activePositions = useMemo(
    () => demoPositions.filter((p) => p.symbol === symbol),
    [demoPositions, symbol]
  );
  const activeFloatingPnl = useMemo(() => {
    const mark = livePrice ?? activeSpec.defaultPrice;
    return activePositions.reduce((sum, p) => sum + calcPositionPnl(p, mark, simMode), 0);
  }, [activePositions, livePrice, activeSpec.defaultPrice, simMode]);

  const totalFloatingPnl = demoMetrics?.floatingPnl ?? 0;
  const displayEquity = demoMetrics?.equity ?? 1000;
  const displayBalance = demoMetrics?.balance ?? 1000;

  // Institutional Overlays + Order Flow + Key Levels + Fib/Elliott/Wyckoff + Ghost Path
  const institutional = useMemo(() => {
    const bars = latestCandlesRef.current;
    const pools = detectLiquidityPools(bars, symbolMeta.precision);
    const orderFlow = computeOrderFlowMetrics(bars);
    const keyLevels = computeKeyLevels(bars, symbolMeta.precision);
    const fibData = computeFibConfluence(bars, symbolMeta.precision);
    const elliottWyckoff = computeElliottWyckoff(bars, structureOverlay);
    const zoneMitigations = computeZoneMitigations(bars, structureOverlay);
    const ghostPath = buildGhostCandles(bars, aiAnalysis, symbolMeta.precision);
    const spikeMarkers = detectSpikeCatalysts(bars);
    const breakoutFilter = evaluateBreakoutVsFakeout(bars, pools);
    const mtfMatrix = computeMtfMatrix(bars);
    return {
      pools,
      orderFlow,
      keyLevels,
      fibData,
      elliottWyckoff,
      zoneMitigations,
      ghostPath,
      spikeMarkers,
      breakoutFilter,
      mtfMatrix,
    };
  }, [symbol, timeframe, latestBarSnapshot, structureOverlay, aiAnalysis, symbolMeta.precision]);

  const handleChartDrawingTap = useCallback(
    (clientX: number, clientY: number) => {
      if (activeDrawTool === 'none') return;
      const chart = chartApiRef.current;
      const series = candleSeriesRef.current;
      const wrap = chartWrapRef.current;
      if (!chart || !series || !wrap) return;

      const rect = wrap.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const price = series.coordinateToPrice(localY);
      const timeRaw = chart.timeScale().coordinateToTime(localX);
      if (price === null || !Number.isFinite(Number(price)) || timeRaw === null) return;

      const cleanTime = Number(timeRaw) as UTCTimestamp;
      const cleanPrice = Number(Number(price).toFixed(symbolMeta.precision));

      if (activeDrawTool === 'hline' || activeDrawTool === 'anchored_vwap') {
        setUserDrawings((prev) => [
          ...prev,
          {
            id: `dr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            symbol,
            type: activeDrawTool,
            t1: cleanTime,
            p1: cleanPrice,
            color: activeDrawTool === 'hline' ? '#38BDF8' : '#06B6D4',
          },
        ]);
        setActiveDrawTool('none');
        return;
      }

      if (!pendingTrendPoint) {
        setPendingTrendPoint({ t1: cleanTime, p1: cleanPrice });
      } else {
        const isLongRr = activeDrawTool === 'long_rr';
        const isShortRr = activeDrawTool === 'short_rr';
        const p3 = isLongRr
          ? Number((pendingTrendPoint.p1 + Math.abs(pendingTrendPoint.p1 - cleanPrice) * 2).toFixed(symbolMeta.precision))
          : isShortRr
            ? Number(Math.max(symbolMeta.minMove, pendingTrendPoint.p1 - Math.abs(cleanPrice - pendingTrendPoint.p1) * 2).toFixed(symbolMeta.precision))
            : undefined;
        setUserDrawings((prev) => [
          ...prev,
          {
            id: `dr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            symbol,
            type: activeDrawTool,
            t1: pendingTrendPoint.t1,
            p1: pendingTrendPoint.p1,
            t2: cleanTime,
            p2: cleanPrice,
            p3,
            color: activeDrawTool === 'ruler' ? '#0284C7' : '#F59E0B',
          },
        ]);
        setPendingTrendPoint(null);
        setActiveDrawTool('none');
      }
    },
    [activeDrawTool, pendingTrendPoint, symbol, symbolMeta.precision, symbolMeta.minMove]
  );

  const handleChartDoubleClick = useCallback(
    (clientY: number) => {
      if (activeDrawTool !== 'none' || !onPlaceLimitOrder) return;
      const series = candleSeriesRef.current;
      const wrap = chartWrapRef.current;
      if (!series || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      const price = series.coordinateToPrice(clientY - rect.top);
      if (price === null || !Number.isFinite(Number(price)) || Number(price) <= 0) return;
      setQuickLimitTap({ price: Number(Number(price).toFixed(symbolMeta.precision)) });
    },
    [activeDrawTool, onPlaceLimitOrder, symbolMeta.precision]
  );

  const handleSetRiskLot = useCallback(
    (riskDollars: 10 | 25) => {
      const entry = livePrice ?? activeSpec.defaultPrice;
      const slEst = smc?.sl ?? Number((entry * 0.996).toFixed(activeSpec.precision));
      const nextLot = calcLotsForDollarRisk(symbol, entry, slEst, riskDollars);
      onChangeDemoDefaultLot?.(nextLot);
      setCustomLotInput(nextLot.toFixed(2));
      setQuickOrderNote(`Risk $${riskDollars} -> ${nextLot.toFixed(2)}`);
    },
    [livePrice, activeSpec.defaultPrice, activeSpec.precision, smc?.sl, symbol, onChangeDemoDefaultLot]
  );

  const handleStepCornerLot = useCallback(
    (delta: number) => {
      const next = Math.max(0.01, Math.min(10, Number((demoDefaultLot + delta).toFixed(2))));
      onChangeDemoDefaultLot?.(next);
      setCustomLotInput(next.toFixed(2));
    },
    [demoDefaultLot, onChangeDemoDefaultLot]
  );

  const handleQuickDemoOrder = (side: 'BUY' | 'SELL') => {
    if (!onExecuteDemoOrder) return;
    if (marginCallActive || displayBalance <= 0 || displayEquity <= 0) {
      setQuickOrderNote('Margin Call: Balance Depleted');
      return;
    }
    const parsedLot = Number.parseFloat(customLotInput);
    const chosenLot = Number.isFinite(parsedLot) && parsedLot >= 0.01 ? Math.min(10, Number(parsedLot.toFixed(2))) : Number(demoDefaultLot.toFixed(2));
    onChangeDemoDefaultLot?.(chosenLot);
    const err = onExecuteDemoOrder(symbol, side, chosenLot);
    if (err) {
      setQuickOrderNote(err);
    } else {
      const px = side === 'BUY' ? bidAsk.ask : bidAsk.bid;
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
              backgroundColor: 'var(--vp-canvas)',
            }
          : { backgroundColor: 'var(--vp-canvas)' }
      }
      className={
        isFullScreen
          ? 'vp-fullscreen-root flex flex-col bg-[var(--vp-canvas)] text-[var(--vp-text)] overflow-hidden'
          : 'h-full min-h-0 flex-1 flex flex-col gap-1 bg-[var(--vp-canvas)] text-[var(--vp-text)] w-full overflow-hidden'
      }
    >
      {/* Initial Single-Screen Workspace (Maximized Chart + Compact Trades Bar) */}
      <div
        className={
          isFullScreen
            ? 'flex-1 min-h-0 flex flex-col w-full h-full bg-[var(--vp-canvas)]'
            : 'flex-1 min-h-0 flex flex-col gap-1 w-full h-full overflow-hidden'
        }
      >
      {/* 1. Maximized Primary Chart Area (~85% height) */}
      <div
        className={
          isFullScreen
            ? 'flex-1 min-h-0 flex flex-col w-full h-full bg-[var(--vp-canvas)]'
            : 'flex-1 min-h-0 flex flex-col w-full'
        }
      >
        <div
          className={
            isFullScreen
              ? 'relative flex-1 flex flex-col min-w-0 min-h-0 h-full w-full overflow-hidden bg-[var(--vp-canvas)]'
              : 'flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--vp-border)] bg-[var(--vp-canvas)] shadow-[var(--vp-card-shadow)] overflow-hidden min-w-0'
          }
        >
          {/* Dedicated 48px Full-Screen Header Bar */}
          {isFullScreen && (
            <div className="h-[48px] shrink-0 border-b border-[var(--vp-border)] bg-[var(--vp-surface)] px-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-xs text-[var(--vp-text)] whitespace-nowrap">
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
                            ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]'
                            : 'bg-[var(--vp-elevated)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
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
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2.5 text-xs font-bold text-[var(--vp-text)] cursor-pointer shrink-0 whitespace-nowrap hover:opacity-90"
              >
                <Minimize2 className="h-3.5 w-3.5 text-[var(--vp-text)]" />
                <span>Exit</span>
              </button>
            </div>
          )}

          {/* Clean Non-Overlapping Institutional Header */}
          {!isFullScreen && (
            <div className="shrink-0 border-b border-[var(--vp-border)] bg-[var(--vp-surface)] px-2 py-1 space-y-1">
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
                    className="min-w-0 flex-1 max-w-[128px] rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] px-1.5 py-0.5 text-[11px] font-bold outline-none cursor-pointer hover:border-[#F59E0B] truncate"
                  >
                    {SYMBOL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <span
                    aria-label="Active trading session"
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--vp-border)] px-1.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap shrink-0"
                    style={{ backgroundColor: sessionBadge.bgColor, color: sessionBadge.textColor }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: sessionBadge.dotColor }} />
                    {sessionBadge.label}
                  </span>
                </div>

                <div className="flex items-center gap-[6px] shrink-0">
                  <span
                    className="font-mono-tabular text-[11px] sm:text-xs font-bold whitespace-nowrap shrink-0"
                    style={{ color: isBullTick ? '#10B981' : '#F43F5E' }}
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
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:border-[#F59E0B] text-[var(--vp-text)] cursor-pointer"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleFullScreen}
                    aria-label="Enter Full Screen"
                    title="Full Screen"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:border-[#F59E0B] text-[var(--vp-text)] cursor-pointer"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    aria-label="Chart Settings"
                    title="Chart Settings"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:border-[#F59E0B] text-[var(--vp-text)] cursor-pointer"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Clean 1m–4H Timeframe Bar + Chart Visual Mode + Indicators + Pro Drawing Suite + Split + Focus + Layers */}
              <div className="flex items-center justify-between gap-1.5 flex-wrap sm:flex-nowrap">
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
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          active
                            ? 'border-[#F59E0B] bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]'
                            : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                        }`}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
                  {/* Chart Mode: Candles / Heikin-Ashi / Line */}
                  <div className="inline-flex items-center rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] p-0.5 shrink-0 shadow-xs">
                    {(
                      [
                        { id: 'candles', label: 'Cdl' },
                        { id: 'heikin', label: 'HA' },
                        { id: 'line', label: 'Line' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setChartVisualMode(m.id)}
                        title={`Chart Style: ${m.id}`}
                        className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold cursor-pointer transition-colors ${
                          chartVisualMode === m.id
                            ? 'bg-[#F59E0B] text-[#060911]'
                            : 'text-[var(--vp-text)] hover:text-[#F59E0B]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    aria-pressed={showEma20 || showEma50}
                    onClick={() => {
                      const next = !(showEma20 || showEma50);
                      setShowEma20(next);
                      setShowEma50(next);
                    }}
                    title="Toggle EMA 20 & 50"
                    className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-mono-tabular font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-xs ${
                      showEma20 || showEma50
                        ? 'border-[#F59E0B] bg-[#F59E0B]/20 text-[#F59E0B]'
                        : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                    }`}
                  >
                    EMA
                  </button>
                  <button
                    type="button"
                    aria-pressed={showRsi}
                    onClick={() => setShowRsi((v) => !v)}
                    title="Toggle RSI (14)"
                    className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-mono-tabular font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-xs ${
                      showRsi
                        ? 'border-[#A78BFA] bg-[#A78BFA]/20 text-[#A78BFA]'
                        : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                    }`}
                  >
                    RSI{liveRsi !== null ? ` ${liveRsi.toFixed(0)}` : ''}
                  </button>

                  {/* Pro Drawing Suite */}
                  {(
                    [
                      { id: 'trendline', label: 'Line', icon: Pencil, title: 'Trendline (2 taps)' },
                      { id: 'hline', label: 'H-Lvl', icon: Crosshair, title: 'Horizontal Level (1 tap)' },
                      { id: 'long_rr', label: 'L-RR', icon: ArrowUpRight, title: 'Long Risk/Reward Box (2 taps)' },
                      { id: 'short_rr', label: 'S-RR', icon: Zap, title: 'Short Risk/Reward Box (2 taps)' },
                      { id: 'ruler', label: 'Ruler', icon: Ruler, title: 'Pip / $ Distance Ruler (2 taps)' },
                      { id: 'anchored_vwap', label: 'AVWAP', icon: Sparkles, title: 'Anchored VWAP (1 tap)' },
                    ] as const
                  ).map((tool) => {
                    const ToolIcon = tool.icon;
                    const active = activeDrawTool === tool.id;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setPendingTrendPoint(null);
                          setActiveDrawTool((curr) => (curr === tool.id ? 'none' : tool.id));
                        }}
                        title={tool.title}
                        className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-xs ${
                          active
                            ? 'border-[#F59E0B] bg-[#F59E0B] text-[#060911]'
                            : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                        }`}
                      >
                        <ToolIcon className="h-2.5 w-2.5" />
                        <span>{tool.label}</span>
                      </button>
                    );
                  })}

                  {userDrawings.some((d) => d.symbol === symbol) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setUserDrawings((prev) => {
                            const lastIdx = [...prev].reverse().findIndex((d) => d.symbol === symbol);
                            if (lastIdx === -1) return prev;
                            const removeIdx = prev.length - 1 - lastIdx;
                            return prev.filter((_, idx) => idx !== removeIdx);
                          });
                        }}
                        title="Undo last drawing"
                        className="inline-flex items-center justify-center rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1 py-0.5 text-[9.5px] font-bold text-[var(--vp-text)] hover:border-[#F59E0B] shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUserDrawings((prev) => prev.filter((d) => d.symbol !== symbol));
                          setPendingTrendPoint(null);
                        }}
                        title="Clear symbol drawings"
                        aria-label="Clear symbol drawings"
                        className="inline-flex items-center justify-center rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1 py-0.5 text-[9.5px] text-[#F43F5E] shrink-0 cursor-pointer hover:opacity-85"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </>
                  )}

                  {/* Focus Mode (Hide drawings cleanly) */}
                  <button
                    type="button"
                    aria-pressed={focusMode}
                    onClick={() => setFocusMode((v) => !v)}
                    title={focusMode ? 'Exit Focus Mode (Show overlays)' : 'Focus Mode (Hide overlays)'}
                    className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer shadow-xs ${
                      focusMode
                        ? 'border-[#F59E0B] bg-[#F59E0B]/20 text-[#F59E0B]'
                        : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                    }`}
                  >
                    {focusMode ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                    <span className="hidden sm:inline">Focus</span>
                  </button>

                  {/* Multi-Chart Split Screen */}
                  <button
                    type="button"
                    aria-pressed={splitScreen}
                    onClick={() => setSplitScreen((v) => !v)}
                    title="Toggle Dual Timeframe Split Screen"
                    className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer shadow-xs ${
                      splitScreen
                        ? 'border-[#10B981] bg-[#10B981]/20 text-[#10B981]'
                        : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                    }`}
                  >
                    <Columns2 className="h-2.5 w-2.5" />
                    <span className="hidden sm:inline">Split</span>
                  </button>

                  {/* MTF Matrix Drawer Toggle */}
                  <button
                    type="button"
                    aria-pressed={showMtfMatrix}
                    onClick={() => setShowMtfMatrix((v) => !v)}
                    title="Toggle 1m–4H Multi-Timeframe Matrix"
                    className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer shadow-xs ${
                      showMtfMatrix
                        ? 'border-[#F59E0B] bg-[#F59E0B]/20 text-[#F59E0B]'
                        : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                    }`}
                  >
                    MTF
                  </button>

                  <button
                    ref={layersBtnRef}
                    type="button"
                    aria-expanded={layersOpen}
                    aria-label="Toggle Chart Layers"
                    onClick={() => setLayersOpen((o) => !o)}
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-xs ${
                      layersOpen || activeLayerCount < 3
                        ? 'border-[#F59E0B] bg-[#F59E0B] text-[#060911]'
                        : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
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
                  className="flex items-center justify-between gap-1.5 rounded-md border border-[#F59E0B]/45 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] font-bold text-[#D97706]"
                >
                  <span className="truncate">{newsShieldAlert.bannerText}</span>
                  <span className="font-mono-tabular text-[9.5px] shrink-0">
                    {newsShieldAlert.event.currency} · {newsShieldAlert.event.title}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Primary + Optional Split Chart Canvas Container */}
          <div
            className={`relative flex-1 min-w-0 min-h-0 flex ${
              splitScreen && !isFullScreen ? 'flex-col md:flex-row' : 'flex-col'
            }`}
          >
          <div
            style={
              isFullScreen
                ? { height: 'calc(100dvh - 48px)', backgroundColor: 'var(--vp-canvas)' }
                : { backgroundColor: 'var(--vp-canvas)' }
            }
            onDoubleClick={(e) => handleChartDoubleClick(e.clientY)}
            className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-[var(--vp-canvas)]"
          >
            <div ref={chartWrapRef} className="smc-chart-host absolute inset-0 z-[1] bg-[var(--vp-canvas)] touch-none" />

            {/* Interactive Drawing Suite Tap Layer */}
            {activeDrawTool !== 'none' && (
              <div
                role="button"
                aria-label="Tap chart to place drawing point"
                onClick={(e) => {
                  e.stopPropagation();
                  handleChartDrawingTap(e.clientX, e.clientY);
                }}
                className="absolute inset-0 z-[23] cursor-crosshair"
              >
                <div className="pointer-events-none absolute top-11 left-1/2 -translate-x-1/2 rounded-full border border-[#F59E0B] bg-[var(--vp-surface)]/95 px-2.5 py-0.5 text-[10px] font-bold text-[#F59E0B] shadow-md whitespace-nowrap">
                  {activeDrawTool === 'hline' || activeDrawTool === 'anchored_vwap'
                    ? `Tap Chart to Anchor ${activeDrawTool.toUpperCase()}`
                    : pendingTrendPoint
                      ? 'Tap End Point on Chart'
                      : 'Tap Start Point on Chart'}
                </div>
              </div>
            )}

            {/* Tiny Sleek Horizontal Double-Tap Limit Order Pill */}
            {quickLimitTap && onPlaceLimitOrder && !isFullScreen && (
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="absolute top-9 left-2 z-[46] inline-flex items-center gap-1 rounded-full border border-[var(--vp-border)] bg-[var(--vp-surface)] px-2 py-0.5 shadow-[var(--vp-card-shadow)] backdrop-blur-md whitespace-nowrap"
              >
                <span className="font-mono-tabular text-[9.5px] font-bold text-[var(--vp-text)]">
                  Limit @ ${quickLimitTap.price.toFixed(symbolMeta.precision)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const err = onPlaceLimitOrder(symbol, 'BUY', demoDefaultLot, quickLimitTap.price, undefined, undefined, 'Chart Double-Tap');
                    setQuickOrderNote(err ?? `Buy Limit @ $${quickLimitTap.price.toFixed(symbolMeta.precision)}`);
                    setQuickLimitTap(null);
                  }}
                  className="rounded-full bg-[#10B981] hover:brightness-110 px-1.5 py-0.5 text-[8.5px] font-extrabold text-[#FFFFFF] shadow-[0_0_12px_rgba(16,185,129,0.6)] cursor-pointer leading-none"
                >
                  BUY LIMIT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const err = onPlaceLimitOrder(symbol, 'SELL', demoDefaultLot, quickLimitTap.price, undefined, undefined, 'Chart Double-Tap');
                    setQuickOrderNote(err ?? `Sell Limit @ $${quickLimitTap.price.toFixed(symbolMeta.precision)}`);
                    setQuickLimitTap(null);
                  }}
                  className="rounded-full bg-[#F43F5E] hover:brightness-110 px-1.5 py-0.5 text-[8.5px] font-extrabold text-[#FFFFFF] shadow-[0_0_12px_rgba(244,63,94,0.6)] cursor-pointer leading-none"
                >
                  SELL LIMIT
                </button>
                <button
                  type="button"
                  aria-label="Close limit popup"
                  onClick={() => setQuickLimitTap(null)}
                  className="text-[11px] font-bold text-[var(--vp-text)] hover:text-[#F59E0B] px-0.5 cursor-pointer leading-none"
                >
                  ×
                </button>
              </div>
            )}

            {/* Ultra-Compact Sharp Floating SELL | Lot | BUY Bar in Top-Left Corner */}
            {!isFullScreen && !isDepleted && (
              <div className="absolute top-1.5 left-2 z-[30] inline-flex items-center gap-1 rounded-md border border-[var(--vp-border)] bg-[var(--vp-surface)] px-1 py-0.5 shadow-[var(--vp-card-shadow)] backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => handleQuickDemoOrder('SELL')}
                  title={`Sell @ Bid $${bidAsk.bid.toFixed(symbolMeta.precision)}`}
                  className="h-5 px-1.5 rounded bg-[#F43F5E] hover:brightness-110 text-[9.5px] font-extrabold text-[#FFFFFF] cursor-pointer shadow-[0_0_14px_rgba(244,63,94,0.55)] active:scale-[0.98] leading-none flex items-center gap-1"
                >
                  <span>SELL</span>
                  <span className="font-mono-tabular font-bold hidden sm:inline">{bidAsk.bid.toFixed(symbolMeta.precision)}</span>
                </button>
                <div className="flex items-center rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] overflow-hidden">
                  <button
                    type="button"
                    aria-label="Decrease lot size"
                    onClick={() => handleStepCornerLot(-0.01)}
                    className="h-5 w-4 flex items-center justify-center text-[10px] font-bold text-[var(--vp-text)] hover:bg-[#F59E0B]/20 cursor-pointer border-r border-[var(--vp-border)]"
                  >
                    −
                  </button>
                  <select
                    aria-label="Lot Size"
                    value={Number(demoDefaultLot.toFixed(2))}
                    onChange={(e) => {
                      const val = Number.parseFloat(e.target.value);
                      if (Number.isFinite(val) && val >= 0.01) {
                        const rounded = Math.min(10, Number(val.toFixed(2)));
                        onChangeDemoDefaultLot?.(rounded);
                        setCustomLotInput(rounded.toFixed(2));
                      }
                    }}
                    className="h-5 bg-[var(--vp-elevated)] px-1 text-[9.5px] font-mono-tabular font-bold text-[var(--vp-text)] outline-none cursor-pointer"
                  >
                    {[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0].map((lot) => (
                      <option key={lot} value={lot}>
                        {lot.toFixed(2)}
                      </option>
                    ))}
                    {![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0].includes(Number(demoDefaultLot.toFixed(2))) && (
                      <option value={Number(demoDefaultLot.toFixed(2))}>{demoDefaultLot.toFixed(2)}</option>
                    )}
                  </select>
                  <button
                    type="button"
                    aria-label="Increase lot size"
                    onClick={() => handleStepCornerLot(0.01)}
                    className="h-5 w-4 flex items-center justify-center text-[10px] font-bold text-[var(--vp-text)] hover:bg-[#F59E0B]/20 cursor-pointer border-l border-[var(--vp-border)]"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleSetRiskLot(10)}
                  title="Auto-calculate lot for $10 Risk to SL"
                  className="h-5 rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1 text-[8.5px] font-mono-tabular font-bold text-[var(--vp-text)] hover:border-[#F59E0B] cursor-pointer"
                >
                  $10R
                </button>
                <button
                  type="button"
                  onClick={() => handleSetRiskLot(25)}
                  title="Auto-calculate lot for $25 Risk to SL"
                  className="h-5 rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1 text-[8.5px] font-mono-tabular font-bold text-[var(--vp-text)] hover:border-[#F59E0B] cursor-pointer hidden sm:inline-flex items-center"
                >
                  $25R
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemoOrder('BUY')}
                  title={`Buy @ Ask $${bidAsk.ask.toFixed(symbolMeta.precision)}`}
                  className="h-5 px-1.5 rounded bg-[#10B981] hover:brightness-110 text-[9.5px] font-extrabold text-[#FFFFFF] cursor-pointer shadow-[0_0_14px_rgba(16,185,129,0.55)] active:scale-[0.98] leading-none flex items-center gap-1"
                >
                  <span>BUY</span>
                  <span className="font-mono-tabular font-bold hidden sm:inline">{bidAsk.ask.toFixed(symbolMeta.precision)}</span>
                </button>
                <span
                  title={`Simulated Spread (${simMode === 'zero' ? 'Zero' : 'Real Broker'}): ${bidAsk.spread}`}
                  className="hidden md:inline-block px-1 text-[8.5px] font-mono-tabular font-bold text-[var(--vp-text)]"
                >
                  Sp {bidAsk.spread}
                </span>
              </div>
            )}

            {quickOrderNote && !isFullScreen && (
              <div className="pointer-events-none absolute top-9 right-2 z-[29] rounded border border-[var(--vp-border)] bg-[var(--vp-surface)]/95 px-2 py-0.5 text-[9px] font-mono-tabular font-bold text-[var(--vp-text)] shadow-sm">
                {quickOrderNote}
              </div>
            )}

            {/* Compact Layers Visibility Popover (SMC Zones / Auto Trendlines / Key Levels / Liquidity / Fib+Waves / Ghost) */}
            {!isFullScreen && layersOpen && (
              <div
                ref={layersMenuRef}
                role="menu"
                aria-label="Chart Layer Visibility"
                className="absolute top-1.5 right-2 z-[45] w-56 rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-2 shadow-xl space-y-1.5"
              >
                <div className="flex items-center justify-between px-1 pb-1 border-b border-[var(--vp-border)]">
                  <span className="text-[10.5px] font-bold text-[var(--vp-text)]">Chart Layers</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeLayerCount > 0) {
                        setShowBosChoch(false);
                        setShowSwingLabels(false);
                        setShowPatterns(false);
                        setShowSupportResistance(false);
                        setShowAiSignals(false);
                        setShowKeyLevels(false);
                        setShowLiquidityPools(false);
                        setShowFibWaves(false);
                        setShowGhostCandles(false);
                      } else {
                        setShowBosChoch(true);
                        setShowPatterns(true);
                        setShowSupportResistance(true);
                        setShowAiSignals(true);
                        setShowGhostCandles(true);
                      }
                    }}
                    className="text-[10px] font-bold text-[var(--vp-accent-text)] hover:underline cursor-pointer"
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
                    sub: 'Patterns & S/R Touches',
                    enabled: autoTrendlinesOn,
                    onToggle: () => {
                      const next = !autoTrendlinesOn;
                      setShowPatterns(next);
                      setShowSupportResistance(next);
                    },
                  },
                  {
                    id: 'ai',
                    label: 'AI Signals & Ghost Path',
                    sub: 'Sniper + What-If Paths',
                    enabled: showAiSignals,
                    onToggle: () => {
                      const next = !showAiSignals;
                      setShowAiSignals(next);
                      setShowGhostCandles(next);
                    },
                  },
                  {
                    id: 'keylevels',
                    label: 'Key Levels',
                    sub: 'PDH/PDL, VWAP, Asia H/L',
                    enabled: showKeyLevels,
                    onToggle: () => setShowKeyLevels((v) => !v),
                  },
                  {
                    id: 'liquidity',
                    label: 'Liquidity Heatmap',
                    sub: 'BSL/SSL Pools & Sweeps',
                    enabled: showLiquidityPools,
                    onToggle: () => setShowLiquidityPools((v) => !v),
                  },
                  {
                    id: 'fibwaves',
                    label: 'Fib 50% + Elliott + Wyckoff',
                    sub: 'EQ, Harmonics & Phases',
                    enabled: showFibWaves,
                    onToggle: () => setShowFibWaves((v) => !v),
                  },
                ].map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={layer.enabled}
                    onClick={layer.onToggle}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:opacity-90 px-2 py-1 text-left cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="block text-[10.5px] font-bold text-[var(--vp-text)] leading-tight">
                        {layer.label}
                      </span>
                      <span className="block text-[9px] text-[var(--vp-muted)] truncate">
                        {layer.sub}
                      </span>
                    </div>
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-mono-tabular font-bold shrink-0"
                      style={{
                        backgroundColor: layer.enabled ? '#089981' : 'var(--vp-control)',
                        color: layer.enabled ? '#FFFFFF' : 'var(--vp-muted)',
                      }}
                    >
                      {layer.enabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Compact AI Signal Chip on Chart (positioned below top-left order pill) */}
            {showAiSignals && aiAnalysis?.actionable && (
              <div
                className="pointer-events-none absolute top-9 left-2 z-[26] inline-flex items-center gap-1 rounded border border-[var(--vp-border)] bg-[var(--vp-surface)]/92 px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold shadow-sm"
                style={{
                  borderColor: aiAnalysis.direction === 'BUY' ? 'rgba(8,153,129,0.5)' : 'rgba(242,54,69,0.5)',
                  color: aiAnalysis.direction === 'BUY' ? '#089981' : '#F23645',
                }}
              >
                <span>AI {aiAnalysis.direction}</span>
                <span className="text-[var(--vp-muted)]">·</span>
                <span className="text-[var(--vp-text)]">{aiAnalysis.score}%</span>
              </div>
            )}

            {/* Candle Anatomy X-Ray + Spike Catalyst Tooltip */}
            {crosshairXray && (
              <div className="pointer-events-none absolute top-1.5 right-16 z-[28] max-w-[260px] rounded-lg border border-[var(--vp-border)] bg-[var(--vp-surface)]/95 px-2 py-1 font-mono-tabular text-[8.5px] font-bold text-[var(--vp-text)] shadow-sm">
                <div className="whitespace-nowrap">
                  R: {crosshairXray.range} ({crosshairXray.pips}p) ·{' '}
                  <span style={{ color: crosshairXray.isBull ? '#089981' : '#F23645' }}>
                    Body {crosshairXray.bodyPct}%
                  </span>{' '}
                  · Wick {crosshairXray.wickPct}%
                </div>
                <div className="text-[8px] text-[var(--vp-muted)]">
                  Buy {crosshairXray.buyerPct}% / Sell {crosshairXray.sellerPct}%
                </div>
                {crosshairXray.spikeCatalyst && (
                  <div className="text-[8px] text-[#F59E0B] truncate mt-0.5">
                    ⚡ {crosshairXray.spikeCatalyst}
                  </div>
                )}
              </div>
            )}

            {/* High-DPI Canvas SMC + Institutional + Drawing Suite Overlay */}
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
              showKeyLevels={showKeyLevels}
              showLiquidityPools={showLiquidityPools}
              showFibWaves={showFibWaves}
              showGhostCandles={showGhostCandles && showAiSignals}
              focusMode={focusMode}
              keyLevels={institutional.keyLevels}
              liquidityPools={institutional.pools}
              orderFlow={institutional.orderFlow}
              fibData={institutional.fibData}
              elliottWyckoff={institutional.elliottWyckoff}
              zoneMitigations={institutional.zoneMitigations}
              ghostPath={institutional.ghostPath}
              spikeMarkers={institutional.spikeMarkers}
              userDrawings={userDrawings}
              pendingTrendPoint={pendingTrendPoint}
              pipSize={activeSpec.pipSize}
              contractSize={activeSpec.contractSize}
              defaultLot={demoDefaultLot}
              precision={symbolMeta.precision}
              themeMode={themeMode}
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

            {/* Far-Right Edge Mini Entry Badges & Directly Draggable + Manually Editable TP/SL */}
            <TradeLinesOverlay
              syncRef={tradeOverlaySyncRef}
              chart={chartApiRef.current}
              candleSeries={candleSeriesRef.current}
              positions={activePositions}
              livePrice={livePrice}
              simMode={simMode}
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
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-[var(--vp-surface)]/95 px-3 py-1 shadow-md">
                <button
                  type="button"
                  onClick={() => setReplayPlaying((p) => !p)}
                  className="vp-pill-btn inline-flex h-6 items-center gap-1 bg-[#F59E0B] px-2 text-[10px] font-bold text-[#0B0E14] cursor-pointer"
                >
                  {replayPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {replayPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={() => applyReplaySlice(replayIndex + 1)}
                  disabled={replayIndex >= replayTotal}
                  className="vp-pill-btn inline-flex h-6 items-center gap-0.5 bg-[var(--vp-elevated)] px-2 text-[10px] font-semibold text-[var(--vp-text)] cursor-pointer"
                >
                  <SkipForward className="h-3 w-3" />
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setReplaySpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
                  className="vp-pill-btn h-6 bg-[var(--vp-elevated)] px-2 text-[10px] font-mono-tabular font-bold text-[#0284C7] cursor-pointer"
                >
                  {replaySpeed}x
                </button>
                <button
                  type="button"
                  onClick={() => applyReplaySlice(Math.max(24, Math.floor(replayTotal * 0.55)))}
                  title="Restart Replay"
                  className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[var(--vp-elevated)] text-[var(--vp-text)] cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={toggleReplayMode}
                  title="Exit Replay"
                  className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[#F23645]/15 text-[#F23645] cursor-pointer"
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
                className="absolute bottom-7 left-2 z-[25] flex items-center gap-1 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-surface)]/95 p-0.5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={handleZoomIn}
                  aria-label="Zoom In"
                  className="flex h-5 w-5 items-center justify-center rounded bg-[var(--vp-elevated)] text-[11px] font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  aria-label="Zoom Out"
                  className="flex h-5 w-5 items-center justify-center rounded bg-[var(--vp-elevated)] text-[11px] font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  aria-label="Fit All"
                  className="flex h-5 items-center justify-center rounded bg-[var(--vp-elevated)] px-1.5 text-[9.5px] font-semibold text-[var(--vp-accent-text)] hover:opacity-85 cursor-pointer"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={handleJumpLive}
                  aria-label="Snap Live"
                  className="flex h-5 items-center justify-center rounded bg-[var(--vp-elevated)] px-1.5 text-[9.5px] font-semibold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                >
                  Live
                </button>
              </div>
            )}

            {loadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--vp-canvas)]/95 p-4 text-center text-xs text-[var(--vp-muted)] z-30">
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
            {showMtfMatrix && !isFullScreen && (
              <div className="pointer-events-auto absolute bottom-8 left-2 right-2 z-[28] rounded-lg border border-[var(--vp-border)] bg-[var(--vp-surface)]/95 p-1.5 shadow-lg backdrop-blur-md">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 text-[9px] font-mono-tabular">
                  {institutional.mtfMatrix.rows.map((r) => (
                    <div
                      key={r.tf}
                      className="rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1.5 py-1 text-center"
                    >
                      <div className="font-extrabold text-[var(--vp-text)]">{r.tf.toUpperCase()}</div>
                      <div style={{ color: r.trend === 'UP' ? '#089981' : r.trend === 'DOWN' ? '#F23645' : 'var(--vp-muted)' }}>
                        {r.trend} · {r.macdBias}
                      </div>
                      <div className="text-[var(--vp-muted)]">
                        R{r.rsi} · K{r.stochK}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Secondary Multi-Chart Split Screen Pane */}
          {splitScreen && !isFullScreen && (
            <div className="relative h-40 md:h-auto md:w-[38%] shrink-0 border-t md:border-t-0 md:border-l border-[var(--vp-border)] bg-[var(--vp-canvas)] flex flex-col min-h-0">
              <div className="h-6 shrink-0 border-b border-[var(--vp-border)] bg-[var(--vp-surface)] px-2 flex items-center justify-between text-[9.5px] font-mono-tabular">
                <span className="font-bold text-[var(--vp-text)]">
                  {symbolMeta.shortLabel} · {splitTf.toUpperCase()} HTF
                </span>
                <div className="flex items-center gap-1">
                  {(['1h', '4h'] as SmcTimeframe[]).map((tfOption) => (
                    <button
                      key={tfOption}
                      type="button"
                      onClick={() => setSplitTf(tfOption)}
                      className={`rounded px-1.5 py-0.2 font-bold cursor-pointer ${
                        splitTf === tfOption
                          ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]'
                          : 'text-[var(--vp-muted)]'
                      }`}
                    >
                      {tfOption.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={splitChartWrapRef} className="relative flex-1 min-h-0 bg-[var(--vp-canvas)]" />
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Compact Position / Limits / History / PnL Bar Below Chart */}
      {!isFullScreen && (
        <div className="shrink-0 rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] shadow-[var(--vp-card-shadow)] overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setTradesStripTab((prev) => (prev === 'open' ? null : 'open'))}
                className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  tradesStripTab === 'open'
                    ? 'border-[#F59E0B] bg-[#F59E0B] text-[#060911]'
                    : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                }`}
              >
                Open ({demoPositions.length})
              </button>
              <button
                type="button"
                onClick={() => setTradesStripTab((prev) => (prev === 'limits' ? null : 'limits'))}
                className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  tradesStripTab === 'limits'
                    ? 'border-[#F59E0B] bg-[#F59E0B] text-[#060911]'
                    : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                }`}
              >
                Limits ({demoPendingOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setTradesStripTab((prev) => (prev === 'history' ? null : 'history'))}
                className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  tradesStripTab === 'history'
                    ? 'border-[#F59E0B] bg-[#F59E0B] text-[#060911]'
                    : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] hover:border-[#F59E0B]'
                }`}
              >
                History ({demoHistory.length})
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[10.5px] shrink-0">
              <span
                className="font-mono-tabular font-bold"
                style={{
                  color:
                    (activePositions.length > 0 ? activeFloatingPnl : totalFloatingPnl) > 0.005
                      ? '#10B981'
                      : (activePositions.length > 0 ? activeFloatingPnl : totalFloatingPnl) < -0.005
                        ? '#F43F5E'
                        : 'var(--vp-text)',
                }}
              >
                PnL {formatUsd(activePositions.length > 0 ? activeFloatingPnl : totalFloatingPnl, true)}
              </span>
              {onOpenDemoDrawer && (
                <button
                  type="button"
                  onClick={onOpenDemoDrawer}
                  className="rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--vp-text)] cursor-pointer hover:border-[#F59E0B]"
                >
                  Pro Account
                </button>
              )}
            </div>
          </div>

          {tradesStripTab === 'open' && (
            <div className="max-h-36 overflow-y-auto border-t border-[var(--vp-border)] px-2 py-1.5 space-y-1">
              {demoPositions.length > 0 && (
                <div className="flex items-center justify-end gap-1 pb-0.5">
                  <button
                    type="button"
                    onClick={onCloseProfitablePositions}
                    className="rounded border border-[#089981]/40 bg-[#089981]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#089981] cursor-pointer"
                  >
                    Close +
                  </button>
                  <button
                    type="button"
                    onClick={onCloseLosingPositions}
                    className="rounded border border-[#F23645]/40 bg-[#F23645]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#F23645] cursor-pointer"
                  >
                    Close -
                  </button>
                  <button
                    type="button"
                    onClick={onCloseAllPositions}
                    className="rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--vp-text)] cursor-pointer"
                  >
                    Close All
                  </button>
                </div>
              )}

              {demoPositions.length === 0 ? (
                <p className="text-[10.5px] text-[var(--vp-muted)] text-center py-1">
                  No open positions. Use SELL / BUY in the chart corner or double-tap chart for a Limit Order.
                </p>
              ) : (
                demoPositions.map((pos) => {
                  const posSpec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
                  const mark = pos.symbol === symbol && livePrice ? livePrice : pos.entryPrice;
                  const pnl = calcPositionPnl(pos, mark, simMode);
                  return (
                    <div
                      key={pos.id}
                      className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-mono-tabular rounded-lg bg-[var(--vp-elevated)] px-2 py-1"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span
                          className="font-extrabold"
                          style={{ color: pos.side === 'BUY' ? '#089981' : '#F23645' }}
                        >
                          {pos.side}
                        </span>
                        <span className="font-bold text-[var(--vp-text)]">{posSpec.shortLabel}</span>
                        <span className="text-[var(--vp-muted)]">{pos.lots.toFixed(2)}</span>
                        <span className="text-[var(--vp-muted)] hidden sm:inline">
                          @{pos.entryPrice.toFixed(posSpec.precision)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 flex-wrap">
                        <span
                          className="font-bold mr-1"
                          style={{ color: pnl >= 0 ? '#089981' : '#F23645' }}
                        >
                          {formatUsd(pnl, true)}
                        </span>
                        {pos.lots >= 0.02 && (
                          <>
                            <button
                              type="button"
                              onClick={() => onPartialCloseDemoPosition?.(pos.id, 0.25)}
                              className="rounded border border-[var(--vp-border)] bg-[var(--vp-surface)] px-1 py-0.5 text-[8.5px] font-bold text-[var(--vp-text)] cursor-pointer"
                            >
                              25%
                            </button>
                            <button
                              type="button"
                              onClick={() => onPartialCloseDemoPosition?.(pos.id, 0.5)}
                              className="rounded border border-[var(--vp-border)] bg-[var(--vp-surface)] px-1 py-0.5 text-[8.5px] font-bold text-[var(--vp-text)] cursor-pointer"
                            >
                              50%
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => onUpdateDemoPositionTpSl?.(pos.id, pos.tp, pos.entryPrice)}
                          title="Move SL to Breakeven"
                          className="rounded border border-[#089981]/40 bg-[#089981]/10 px-1 py-0.5 text-[8.5px] font-bold text-[#089981] cursor-pointer"
                        >
                          BE
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleDemoTrailingStop?.(pos.id)}
                          className={`rounded border px-1 py-0.5 text-[8.5px] font-bold cursor-pointer ${
                            pos.trailingDistance
                              ? 'border-[#F59E0B] bg-[#F59E0B] text-[#0B0E14]'
                              : 'border-[var(--vp-border)] bg-[var(--vp-surface)] text-[var(--vp-muted)]'
                          }`}
                        >
                          TS
                        </button>
                        <button
                          type="button"
                          onClick={() => onReverseDemoPosition?.(pos.id)}
                          title="Reverse Position"
                          className="rounded border border-[var(--vp-border)] bg-[var(--vp-surface)] px-1 py-0.5 text-[8.5px] font-bold text-[#0284C7] cursor-pointer"
                        >
                          Rev
                        </button>
                        <button
                          type="button"
                          onClick={() => onHedgeDemoPosition?.(pos.id)}
                          title="Hedge / Lock Position"
                          className="rounded border border-[var(--vp-border)] bg-[var(--vp-surface)] px-1 py-0.5 text-[8.5px] font-bold text-[#F59E0B] cursor-pointer"
                        >
                          Hedge
                        </button>
                        <button
                          type="button"
                          onClick={() => onCloseDemoPosition?.(pos.id)}
                          className="rounded border border-[#F23645]/40 bg-[#F23645]/10 px-1.5 py-0.5 text-[8.5px] font-sans font-bold text-[#F23645] cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tradesStripTab === 'limits' && (
            <div className="max-h-32 overflow-y-auto border-t border-[var(--vp-border)] px-2 py-1.5 space-y-1">
              {demoPendingOrders.length === 0 ? (
                <p className="text-[10.5px] text-[var(--vp-muted)] text-center py-1">
                  No pending limit orders. Double-tap chart or place from AI Suite.
                </p>
              ) : (
                demoPendingOrders.map((ord) => {
                  const ordSpec = DEMO_SYMBOL_SPECS[ord.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
                  return (
                    <div
                      key={ord.id}
                      className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular rounded-lg bg-[var(--vp-elevated)] px-2 py-1"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span style={{ color: ord.side === 'BUY' ? '#089981' : '#F23645' }} className="font-extrabold">
                          {ord.side} LIMIT
                        </span>
                        <span className="font-bold text-[var(--vp-text)]">{ordSpec.shortLabel}</span>
                        <span className="text-[var(--vp-muted)]">
                          {ord.lots.toFixed(2)} @ {ord.limitPrice.toFixed(ordSpec.precision)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCancelLimitOrder?.(ord.id)}
                        className="rounded border border-[var(--vp-border)] bg-[var(--vp-surface)] px-1.5 py-0.5 text-[9px] font-bold text-[#F23645] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tradesStripTab === 'history' && (
            <div className="max-h-32 overflow-y-auto border-t border-[var(--vp-border)] px-2 py-1.5 space-y-1">
              {demoHistory.length === 0 ? (
                <p className="text-[10.5px] text-[var(--vp-muted)] text-center py-1">
                  No closed trades yet. Past PnL and AI reviews appear here.
                </p>
              ) : (
                demoHistory.slice(0, 20).map((tr) => {
                  const trSpec = DEMO_SYMBOL_SPECS[tr.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
                  return (
                    <div
                      key={tr.id}
                      title={tr.aiReview}
                      className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular rounded-lg bg-[var(--vp-elevated)] px-2 py-1"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span
                          className="font-extrabold"
                          style={{ color: tr.side === 'BUY' ? '#089981' : '#F23645' }}
                        >
                          {tr.side}
                        </span>
                        <span className="font-bold text-[var(--vp-text)]">{trSpec.shortLabel}</span>
                        <span className="text-[var(--vp-muted)]">{tr.lots.toFixed(2)}</span>
                        <span className="text-[var(--vp-muted)] truncate">
                          {tr.entryPrice.toFixed(trSpec.precision)}→{tr.closePrice.toFixed(trSpec.precision)}
                        </span>
                        {tr.emotionTag && (
                          <span className="rounded bg-[var(--vp-surface)] px-1 py-0.2 text-[8.5px] text-[var(--vp-muted)]">
                            {tr.emotionTag}
                          </span>
                        )}
                      </div>
                      <span
                        className="font-bold shrink-0"
                        style={{ color: tr.pnl >= 0 ? '#089981' : '#F23645' }}
                      >
                        {formatUsd(tr.pnl, true)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {/* 1-Tap Share Setup Viral Modal (WhatsApp / Telegram / Copy) */}
      {shareModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share TREDAURA Trade Setup"
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 backdrop-blur-[1px] p-4"
          onClick={() => setShareModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-4 shadow-2xl space-y-3 text-[var(--vp-text)]"
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
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:opacity-85 text-[var(--vp-muted)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <pre className="whitespace-pre-wrap rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] p-3 font-mono-tabular text-[11px] leading-relaxed text-[var(--vp-text)] select-all">
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
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:opacity-90 px-3 py-2 text-xs font-bold text-[var(--vp-text)] cursor-pointer"
              >
                {shareCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#089981]" />
                    <span className="text-[#089981]">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[var(--vp-muted)]" />
                    <span>Copy Setup</span>
                  </>
                )}
              </button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={handleNativeShareSetup}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--vp-primary)] hover:brightness-110 px-3 py-2 text-xs font-bold text-[var(--vp-primary-fg)] cursor-pointer"
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
          showKeyLevels,
          onToggleKeyLevels: () => setShowKeyLevels((v) => !v),
          showLiquidityPools,
          onToggleLiquidityPools: () => setShowLiquidityPools((v) => !v),
          showFibWaves,
          onToggleFibWaves: () => setShowFibWaves((v) => !v),
          showGhostCandles,
          onToggleGhostCandles: () => setShowGhostCandles((v) => !v),
          showGrid,
          onToggleGrid: () => setShowGrid((v) => !v),
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
  simMode?: BrokerSimMode;
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
    simMode = 'real',
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
      simMode,
      precision,
      dragPreview,
    });
    propsRef.current = {
      chart,
      candleSeries,
      positions,
      livePrice,
      simMode,
      precision,
      dragPreview,
    };

    const recomputeLayout = useCallback(() => {
      const {
        chart: c,
        candleSeries: s,
        positions: posList,
        livePrice: lp,
        simMode: sm,
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
        const pnl = calcPositionPnl(pos, mark, sm);
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
              pnl: calcPositionPnl(pos, activeTp, sm),
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
              pnl: calcPositionPnl(pos, activeSl, sm),
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
    }, [syncRef, recomputeLayout, chart, candleSeries, positions, livePrice, simMode, precision, dragPreview]);

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
    const [editingLevel, setEditingLevel] = useState<{
      positionId: string;
      kind: 'tp' | 'sl';
      value: string;
    } | null>(null);

    const beginDragTpSl = useCallback(
      (
        startClientY: number,
        pos: DemoPosition,
        kind: 'tp' | 'sl',
        pointerId?: number,
        targetEl?: HTMLElement,
        openManualOnTap = false
      ) => {
        if (isDraggingRef.current) return;
        const series = propsRef.current.candleSeries;
        const wrap = rootRef.current;
        if (!series || !wrap) return;
        isDraggingRef.current = true;

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
          if (movedPx < 4 && openManualOnTap && existing !== undefined) {
            setEditingLevel({
              positionId: pos.id,
              kind,
              value: existing.toFixed(precision),
            });
            return;
          }

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

    const { paneWidth, scaleWidth, axisBadges, plotHandles } = layoutState;
    const badgeWidth = Math.max(46, scaleWidth - 2);

    return (
      <div
        ref={rootRef}
        className="pointer-events-none absolute inset-0 z-[24] overflow-hidden"
      >
        {/* Ultra-Slim Right-Edge Price Axis Badges */}
        {paneWidth > 0 &&
          axisBadges.map((b) => (
            <div
              key={b.key}
              style={{
                transform: `translate3d(${paneWidth + 1}px, ${Math.round(b.y - 7)}px, 0)`,
                width: `${badgeWidth}px`,
                backgroundColor: b.bg,
              }}
              className="pointer-events-none absolute top-0 left-0 flex h-[14px] items-center justify-center rounded-[2px] px-0.5 font-mono-tabular text-[8px] font-bold leading-none text-[#FFFFFF] shadow-xs truncate"
            >
              {b.label}
            </div>
          ))}

        {/* Far-Right Edge Mini Entry Badges & Directly Draggable + Manually Editable TP/SL */}
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
                    transform: `translate3d(0, ${Math.round(h.y - 7.5)}px, 0)`,
                    right: `${scaleWidth + 2}px`,
                  }}
                  className="pointer-events-auto absolute top-0 flex items-center gap-0.5 select-none"
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
                          ? 'Stop Loss locked at Breakeven'
                          : 'Move Stop Loss to Breakeven'
                      }
                      className={`inline-flex h-[14px] items-center justify-center rounded-[2px] border px-1 font-mono-tabular text-[7.5px] font-extrabold leading-none cursor-pointer transition-colors ${
                        isAtBreakeven
                          ? 'border-[#089981] bg-[#089981] text-[#FFFFFF]'
                          : 'border-[#089981]/60 bg-[#089981]/15 text-[#089981] hover:bg-[#089981] hover:text-[#FFFFFF]'
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
                      title={trailingActive ? 'Trailing Stop Active' : 'Enable Trailing Stop'}
                      className={`inline-flex h-[14px] items-center justify-center rounded-[2px] border px-1 font-mono-tabular text-[7.5px] font-extrabold leading-none cursor-pointer transition-colors ${
                        trailingActive
                          ? 'border-[#B45309] bg-[#F59E0B] text-[#FFFFFF]'
                          : 'border-[var(--vp-border)] bg-[var(--vp-surface)] text-[var(--vp-muted)]'
                      }`}
                    >
                      {trailingActive ? 'TS✓' : 'TS'}
                    </button>
                  )}

                  <div
                    style={{ borderColor: accentColor }}
                    className="inline-flex h-[15px] items-center rounded-[3px] border bg-[var(--vp-surface)]/95 shadow-xs overflow-hidden font-mono-tabular text-[8px] font-bold"
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
                      title="Drag vertically to set/move Take Profit"
                      className={`h-full px-1 flex items-center border-r border-[var(--vp-border)] cursor-ns-resize touch-none transition-colors ${
                        hasTp
                          ? 'bg-[#089981] text-[#FFFFFF]'
                          : 'bg-[#089981]/15 text-[#089981]'
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
                      title="Drag vertically to set/move Stop Loss"
                      className={`h-full px-1 flex items-center border-r border-[var(--vp-border)] cursor-ns-resize touch-none transition-colors ${
                        hasSl
                          ? 'bg-[#F23645] text-[#FFFFFF]'
                          : 'bg-[#F23645]/15 text-[#F23645]'
                      }`}
                    >
                      SL
                    </button>

                    <span className="px-1 text-[var(--vp-text)] leading-none">
                      {h.lots.toFixed(2)}
                    </span>
                    <span
                      className="pr-1 leading-none"
                      style={{ color: accentColor }}
                    >
                      {formatUsd(h.pnl, true)}
                    </span>
                    <button
                      type="button"
                      aria-label="Close trade"
                      title="Close trade"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClosePosition?.(pos.id);
                      }}
                      className="h-full px-1 flex items-center justify-center border-l border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[#F23645] cursor-pointer leading-none text-[9.5px]"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            }

            const isTp = h.kind === 'tp';
            const levelKind = h.kind as 'tp' | 'sl';
            const isDraggingThis =
              dragPreview?.positionId === pos.id && dragPreview.kind === levelKind;
            const isEditingThis =
              editingLevel?.positionId === pos.id && editingLevel.kind === levelKind;

            return (
              <div
                key={h.key}
                style={{
                  transform: `translate3d(0, ${Math.round(h.y - 8)}px, 0)`,
                  right: `${scaleWidth + 4}px`,
                }}
                className="pointer-events-none absolute top-0 flex items-center select-none"
              >
                {isEditingThis ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const val = Number.parseFloat(editingLevel.value);
                      if (Number.isFinite(val) && val > 0 && onUpdateTpSl) {
                        if (isTp) {
                          onUpdateTpSl(pos.id, val, pos.sl);
                        } else {
                          onUpdateTpSl(pos.id, pos.tp, val);
                        }
                      }
                      setEditingLevel(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="pointer-events-auto inline-flex h-[18px] items-center rounded-[3px] border border-[var(--vp-border)] bg-[var(--vp-surface)] px-1 gap-1 shadow-md"
                  >
                    <span
                      className="font-mono-tabular text-[8px] font-bold"
                      style={{ color: isTp ? '#089981' : '#F23645' }}
                    >
                      {isTp ? 'TP' : 'SL'}
                    </span>
                    <input
                      type="number"
                      step="any"
                      autoFocus
                      aria-label={`Edit ${isTp ? 'TP' : 'SL'} price`}
                      value={editingLevel.value}
                      onChange={(e) =>
                        setEditingLevel((prev) =>
                          prev ? { ...prev, value: e.target.value } : null
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingLevel(null);
                      }}
                      className="w-16 bg-transparent font-mono-tabular text-[9px] font-bold text-[var(--vp-text)] outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded bg-[#089981] px-1 text-[8px] font-bold text-white cursor-pointer"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingLevel(null)}
                      className="text-[9px] font-bold text-[var(--vp-muted)] cursor-pointer"
                    >
                      ×
                    </button>
                  </form>
                ) : (
                  <div
                    style={{
                      backgroundColor: isTp ? '#089981' : '#F23645',
                    }}
                    className={`pointer-events-auto inline-flex h-[16px] items-center rounded-[3px] font-mono-tabular text-[8.5px] font-bold text-[#FFFFFF] shadow-xs overflow-hidden select-none ${
                      isDraggingThis ? 'ring-2 ring-white/50' : ''
                    }`}
                  >
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        beginDragTpSl(e.clientY, pos, levelKind, e.pointerId, e.currentTarget, true);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        if (e.touches.length > 0) {
                          beginDragTpSl(e.touches[0].clientY, pos, levelKind, undefined, undefined, true);
                        }
                      }}
                      onWheel={(e) => handleWheelNudgeTpSl(e, pos, levelKind)}
                      title={`Drag vertically to move ${isTp ? 'TP' : 'SL'}, or tap to type exact price`}
                      className="h-full px-1.5 flex items-center gap-1 cursor-ns-resize touch-none"
                    >
                      <span>{isTp ? 'TP' : 'SL'}</span>
                      <span>{h.price.toFixed(precision)}</span>
                      <span className="opacity-90">({formatUsd(h.pnl, true)})</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${isTp ? 'TP' : 'SL'}`}
                      title={`Remove ${isTp ? 'TP' : 'SL'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isTp) {
                          onUpdateTpSl?.(pos.id, undefined, pos.sl);
                        } else {
                          onUpdateTpSl?.(pos.id, pos.tp, undefined);
                        }
                      }}
                      className="h-full px-1 flex items-center justify-center border-l border-[#FFFFFF]/25 hover:bg-black/15 cursor-pointer text-[9.5px] leading-none"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    );
  }
);
