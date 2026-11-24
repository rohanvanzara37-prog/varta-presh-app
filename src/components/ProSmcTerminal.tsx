import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Logical,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  Activity,
  BarChart2,
  Columns2,
  Crosshair,
  Maximize2,
  Minimize2,
  Minus,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Settings,
  SkipForward,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import type { ThemeMode } from '../types/news';
import { ChartSettingsModal } from './ChartSettingsModal';

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

export interface ZoneRange {
  type: 'Bullish' | 'Bearish';
  low: number;
  high: number;
  mitigated: boolean;
}

export interface OmyeEngineState {
  price: number;
  signal: 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL';
  rsi1m: number;
  momentumPct: number;
  bullPressurePct: number;
  entry: number;
  tp: number;
  sl: number;
  streamStatus: 'LIVE 1m WS' | 'SYNCING';
}

export interface SmcAnalysisState {
  trend: 1 | -1;
  lastEvent: string;
  lastHighLabel: string;
  lastLowLabel: string;
  lastHighPrice: number | null;
  lastLowPrice: number | null;
  supportPrice: number | null;
  resistancePrice: number | null;
  pattern: DetectedPatternInfo | null;
  orderBlock: ZoneRange | null;
  fvg: ZoneRange | null;
  bosCount: number;
  chochCount: number;
  entry: number;
  tp: number;
  sl: number;
}

export interface SmcTelemetrySnapshot {
  symbol: SmcSymbol;
  timeframe: SmcTimeframe;
  price: number | null;
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
      background: { type: ColorType.Solid, color: isLight ? '#FFFFFF' : '#0B0E14' },
      textColor: isLight ? '#1E293B' : '#94A3B8',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    },
    grid: {
      vertLines: { color: isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.035)' },
      horzLines: { color: isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.035)' },
    },
    crosshair: {
      vertLine: {
        color: isLight ? 'rgba(180, 83, 9, 0.4)' : 'rgba(245, 158, 11, 0.42)',
        labelBackgroundColor: isLight ? '#0F172A' : '#1E2433',
      },
      horzLine: {
        color: isLight ? 'rgba(180, 83, 9, 0.4)' : 'rgba(245, 158, 11, 0.42)',
        labelBackgroundColor: isLight ? '#0F172A' : '#1E2433',
      },
    },
    timeScale: {
      borderColor: isLight ? '#E2E8F0' : '#1E2433',
    },
    rightPriceScale: {
      borderColor: isLight ? '#E2E8F0' : '#1E2433',
    },
  };
}

interface DetectedPatternInfo {
  name: string;
  bias: 'Bullish' | 'Bearish' | 'Breakout';
}

interface SymbolMeta {
  value: SmcSymbol;
  label: string;
  isCrypto: boolean;
  precision: number;
  minMove: number;
}

const SYMBOL_OPTIONS: Array<SymbolMeta & { tvSymbol: string }> = [
  { value: 'XAUUSD', tvSymbol: 'OANDA:XAUUSD', label: 'XAU/USD · Gold', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'XAGUSD', tvSymbol: 'OANDA:XAGUSD', label: 'XAG/USD · Silver', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'BTCUSDT', tvSymbol: 'BINANCE:BTCUSDT', label: 'BTC/USDT · Bitcoin', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'ETHUSDT', tvSymbol: 'BINANCE:ETHUSDT', label: 'ETH/USDT · Ethereum', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'SOLUSDT', tvSymbol: 'BINANCE:SOLUSDT', label: 'SOL/USDT · Solana', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'US500', tvSymbol: 'FOREXCOM:SPXUSD', label: 'US500 · S&P 500', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'USOIL', tvSymbol: 'TVC:USOIL', label: 'USOIL · WTI Crude', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'BNBUSDT', tvSymbol: 'BINANCE:BNBUSDT', label: 'BNB/USDT · BNB', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'XRPUSDT', tvSymbol: 'BINANCE:XRPUSDT', label: 'XRP/USDT · Ripple', isCrypto: true, precision: 4, minMove: 0.0001 },
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

interface TerminalCandle extends CandlestickData<UTCTimestamp> {
  volume?: number;
}

type DrawingTool = 'crosshair' | 'trendline' | 'hray' | 'fib' | 'brush' | 'text';

interface ChartAnchor {
  logical: number;
  price: number;
}

type ChartDrawing =
  | { id: string; kind: 'trendline'; a: ChartAnchor; b: ChartAnchor }
  | { id: string; kind: 'hray'; a: ChartAnchor }
  | { id: string; kind: 'fib'; a: ChartAnchor; b: ChartAnchor }
  | { id: string; kind: 'brush'; points: ChartAnchor[] }
  | { id: string; kind: 'text'; a: ChartAnchor; text: string };

interface CrosshairReadout {
  price: number;
  timeLabel: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

interface VolumeProfileBucket {
  low: number;
  high: number;
  bullVol: number;
  bearVol: number;
  totalVol: number;
  isPoc: boolean;
}

const FIB_LEVELS = [
  { ratio: 0, label: '0%', color: '#848E9C' },
  { ratio: 0.236, label: '23.6%', color: '#F6465D' },
  { ratio: 0.382, label: '38.2%', color: '#F0B90B' },
  { ratio: 0.5, label: '50.0%', color: '#00C087' },
  { ratio: 0.618, label: '61.8%', color: '#38BDF8' },
  { ratio: 0.786, label: '78.6%', color: '#C084FC' },
  { ratio: 1, label: '100%', color: '#848E9C' },
] as const;

function toPureCandle(c: TerminalCandle): CandlestickData<UTCTimestamp> {
  return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
}

function calcEmaPoints(
  candles: TerminalCandle[],
  period: number
): Array<{ time: UTCTimestamp; value: number }> {
  if (candles.length === 0) return [];
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  for (let i = 0; i < candles.length; i += 1) {
    ema = i === 0 ? candles[i].close : candles[i].close * k + ema * (1 - k);
    out.push({ time: candles[i].time, value: ema });
  }
  return out;
}

function calcBollingerPoints(candles: TerminalCandle[], period = 20, mult = 2) {
  const upper: Array<{ time: UTCTimestamp; value: number }> = [];
  const basis: Array<{ time: UTCTimestamp; value: number }> = [];
  const lower: Array<{ time: UTCTimestamp; value: number }> = [];
  if (candles.length === 0) return { upper, basis, lower };

  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < candles.length; i += 1) {
    const val = candles[i].close;
    sum += val;
    sumSq += val * val;
    if (i >= period) {
      const drop = candles[i - period].close;
      sum -= drop;
      sumSq -= drop * drop;
    }
    const count = Math.min(i + 1, period);
    const mean = sum / count;
    const variance = Math.max(0, sumSq / count - mean * mean);
    const std = Math.sqrt(variance);
    basis.push({ time: candles[i].time, value: mean });
    upper.push({ time: candles[i].time, value: mean + mult * std });
    lower.push({ time: candles[i].time, value: mean - mult * std });
  }
  return { upper, basis, lower };
}

function calcRsiPoints(
  candles: TerminalCandle[],
  period = 14
): Array<{ time: UTCTimestamp; value: number }> {
  if (candles.length < 2) return [];
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < candles.length; i += 1) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
        out.push({ time: candles[i].time, value: rsi });
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      out.push({ time: candles[i].time, value: rsi });
    }
  }
  return out;
}

function computeVisibleVolumeProfile(
  visibleCandles: TerminalCandle[],
  bucketCount = 22
): { buckets: VolumeProfileBucket[]; maxVol: number; pocPrice: number | null } {
  if (visibleCandles.length === 0) return { buckets: [], maxVol: 0, pocPrice: null };
  let minLow = Infinity;
  let maxHigh = -Infinity;
  for (const c of visibleCandles) {
    if (c.low < minLow) minLow = c.low;
    if (c.high > maxHigh) maxHigh = c.high;
  }
  if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh) || maxHigh <= minLow) {
    return { buckets: [], maxVol: 0, pocPrice: null };
  }

  const step = (maxHigh - minLow) / bucketCount;
  const buckets: VolumeProfileBucket[] = Array.from({ length: bucketCount }, (_, idx) => ({
    low: minLow + idx * step,
    high: minLow + (idx + 1) * step,
    bullVol: 0,
    bearVol: 0,
    totalVol: 0,
    isPoc: false,
  }));

  for (const c of visibleCandles) {
    const rawVol =
      c.volume && c.volume > 0
        ? c.volume
        : Math.max(1, (c.high - c.low) * 100 + Math.abs(c.close - c.open) * 160);
    const isBull = c.close >= c.open;
    const startIdx = Math.max(0, Math.min(bucketCount - 1, Math.floor((c.low - minLow) / step)));
    const endIdx = Math.max(startIdx, Math.min(bucketCount - 1, Math.floor((c.high - minLow) / step)));
    const span = endIdx - startIdx + 1;
    const perBucket = rawVol / span;
    for (let b = startIdx; b <= endIdx; b += 1) {
      if (isBull) buckets[b].bullVol += perBucket;
      else buckets[b].bearVol += perBucket;
      buckets[b].totalVol += perBucket;
    }
  }

  let maxVol = 0;
  let pocIdx = 0;
  buckets.forEach((b, idx) => {
    if (b.totalVol > maxVol) {
      maxVol = b.totalVol;
      pocIdx = idx;
    }
  });
  if (buckets[pocIdx]) buckets[pocIdx].isPoc = true;
  const pocPrice = buckets[pocIdx] ? (buckets[pocIdx].low + buckets[pocIdx].high) / 2 : null;
  return { buckets, maxVol, pocPrice };
}

function formatUtcShort(ts: number): string {
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const mon = d.toLocaleString('en-US', { month: 'short' });
  return `${d.getDate()} ${mon} ${hh}:${mm}`;
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

  // Use paginated /api/klines directly when scrolling back in history, or standard endpoints on initial load
  const endpointsToTry =
    symbol === 'XAUUSD' && !opts?.before
      ? [
          `/api/klines?symbol=${symbol}&interval=${tf}${limitQs}`,
          `/api/gold?interval=${goldSpec.interval}&range=${goldSpec.range}${limitQs}`,
        ]
      : [`/api/klines?symbol=${symbol}&interval=${tf}${beforeQs}${limitQs}`];

  for (const endpoint of endpointsToTry) {
    try {
      const res = await fetch(endpoint, {
        signal,
        cache: 'no-store',
      });
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
          const byTime = new Map<number, TerminalCandle>();
          for (const c of json.candles) {
            if (
              [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) &&
              (!opts?.before || c.time < opts.before)
            ) {
              byTime.set(c.time, {
                time: c.time as UTCTimestamp,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume,
              });
            }
          }
          const sorted = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
          if (opts?.before || sorted.length >= 10) {
            return {
              candles: sorted,
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
        const parsed: TerminalCandle[] = [];
        for (const d of raw) {
          const t = Math.floor(d[0] / 1000);
          const open = Number(d[1]);
          const high = Number(d[2]);
          const low = Number(d[3]);
          const close = Number(d[4]);
          const volume = Number(d[5]);
          if ([t, open, high, low, close].every(Number.isFinite)) {
            parsed.push({
              time: t as UTCTimestamp,
              open,
              high,
              low,
              close,
              volume: Number.isFinite(volume) ? volume : undefined,
            });
          }
        }
        return parsed;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') throw err;
      }
    }
    return null;
  };

  if (!opts?.before && (tf === '1d' || tf === '1w')) {
    const byTime = new Map<number, TerminalCandle>();
    let cursorEndMs: number | undefined;
    for (let page = 0; page < 6; page += 1) {
      const batch = await fetchDirectBinance(cursorEndMs);
      if (!batch || batch.length === 0) break;
      for (const b of batch) byTime.set(b.time, b);
      if (batch.length < 1000) break;
      cursorEndMs = batch[0].time * 1000 - 1;
    }
    return {
      candles: Array.from(byTime.values()).sort((a, b) => a.time - b.time),
      hasMore: false,
    };
  }

  const endMs = opts?.before ? (opts.before - 1) * 1000 : undefined;
  const batch = await fetchDirectBinance(endMs);
  if (!batch) return { candles: [], hasMore: false };
  const filtered = opts?.before ? batch.filter((c) => c.time < opts.before!) : batch;
  return {
    candles: filtered.sort((a, b) => a.time - b.time),
    hasMore: batch.length >= 1000,
  };
}

function formatTerminalPrice(val: number | null, precision = 2): string {
  if (val === null || !Number.isFinite(val)) return '--.--';
  return val.toFixed(precision);
}

function computeOmyeSnapshot(
  candles: CandlestickData<UTCTimestamp>[],
  streamStatus: 'LIVE 1m WS' | 'SYNCING'
): OmyeEngineState | null {
  if (candles.length < 16) return null;
  const recent = candles.slice(-30);
  const closes = recent.map((c) => c.close);
  const last = recent[recent.length - 1];
  const prevClose = recent[Math.max(0, recent.length - 6)].close;

  // EMA(9) & EMA(21)
  const calcEma = (vals: number[], period: number) => {
    const k = 2 / (period + 1);
    let ema = vals[0];
    for (let i = 1; i < vals.length; i += 1) {
      ema = vals[i] * k + ema * (1 - k);
    }
    return ema;
  };
  const ema9 = calcEma(closes, 9);
  const ema21 = calcEma(closes, 21);

  // RSI(14) on 1m
  let gains = 0;
  let losses = 0;
  const rsiSlice = recent.slice(-15);
  for (let i = 1; i < rsiSlice.length; i += 1) {
    const diff = rsiSlice[i].close - rsiSlice[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi1m = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  // Buying pressure over last 10 one-minute candles
  const pressureSlice = recent.slice(-10);
  let bullBody = 0;
  let totalBody = 0;
  for (const c of pressureSlice) {
    const body = Math.max(Math.abs(c.close - c.open), (c.high - c.low) * 0.25);
    totalBody += body;
    if (c.close >= c.open) bullBody += body;
  }
  const bullPressurePct = totalBody > 0 ? Math.round((bullBody / totalBody) * 100) : 50;
  const momentumPct = prevClose > 0 ? ((last.close - prevClose) / prevClose) * 100 : 0;

  let score = 0;
  if (ema9 > ema21) score += 1;
  else score -= 1;
  if (last.close > ema9) score += 1;
  else score -= 1;
  if (rsi1m > 55) score += 1;
  else if (rsi1m < 45) score -= 1;
  if (bullPressurePct >= 58) score += 1;
  else if (bullPressurePct <= 42) score -= 1;

  const signal: OmyeEngineState['signal'] =
    score >= 3
      ? 'STRONG BUY'
      : score >= 1
        ? 'BUY'
        : score <= -3
          ? 'STRONG SELL'
          : score <= -1
            ? 'SELL'
            : 'NEUTRAL';

  // Live 1m ATR-calibrated Entry / TP / SL (1:2 R:R)
  const atrBars = recent.slice(-14);
  const avgRange =
    atrBars.reduce((acc, c) => acc + Math.max(c.high - c.low, last.close * 0.0004), 0) /
    atrBars.length;
  const risk = Math.max(last.close * 0.0012, avgRange * 1.4);
  const isBear = score < 0;
  const entry = last.close;
  const sl = isBear ? entry + risk : Math.max(0.0001, entry - risk);
  const tp = isBear ? Math.max(0.0001, entry - risk * 2) : entry + risk * 2;

  return {
    price: last.close,
    signal,
    rsi1m,
    momentumPct,
    bullPressurePct,
    entry,
    tp,
    sl,
    streamStatus,
  };
}

interface PivotPoint {
  idx: number;
  time: UTCTimestamp;
  price: number;
}

export const ProSmcTerminal: React.FC<ProSmcTerminalProps> = ({
  externalTvSymbol,
  onSelectTvSymbol,
  onTelemetryChange,
  themeMode = 'dark',
  onChangeThemeMode,
}) => {
  const [symbol, setSymbol] = useState<SmcSymbol>(() => mapTvSymbolToSmc(externalTvSymbol) ?? 'XAUUSD');
  const [timeframe, setTimeframe] = useState<SmcTimeframe>('15m');
  const [showSupportResistance, setShowSupportResistance] = useState(true);
  const [showPatterns, setShowPatterns] = useState(true);
  const [showSwingLabels, setShowSwingLabels] = useState(true);
  const [showBosChoch, setShowBosChoch] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // On-Chart Technical Indicators
  const [showEma20, setShowEma20] = useState(false);
  const [showEma50, setShowEma50] = useState(false);
  const [showEma200, setShowEma200] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showRsi, setShowRsi] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [liveRsi, setLiveRsi] = useState<number | null>(null);

  // Drawing & Crosshair Tools
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawingTool>('crosshair');
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [draftAnchor, setDraftAnchor] = useState<ChartAnchor | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<ChartAnchor | null>(null);
  const [brushStroke, setBrushStroke] = useState<ChartAnchor[] | null>(null);
  const [pendingTextAnchor, setPendingTextAnchor] = useState<ChartAnchor | null>(null);
  const [pendingTextValue, setPendingTextValue] = useState('');
  const [crosshairReadout, setCrosshairReadout] = useState<CrosshairReadout | null>(null);
  const [overlayRenderTick, setOverlayRenderTick] = useState(0);

  // Bar Replay, Full-Screen Landscape & 2-Chart Split View
  const [replayActive, setReplayActive] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayTotal, setReplayTotal] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2 | 4>(1);
  const [splitView, setSplitView] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [isBullTick, setIsBullTick] = useState<boolean>(true);
  const [streamStatus, setStreamStatus] = useState<'CONNECTING' | 'LIVE WS' | 'RECONNECTING'>('CONNECTING');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [smc, setSmc] = useState<SmcAnalysisState | null>(null);
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
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<'Line', Time>[]>([]);
  const ema20SeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbBasisSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line', Time> | null>(null);

  const fullCandlesRef = useRef<TerminalCandle[]>([]);
  const latestCandlesRef = useRef<TerminalCandle[]>([]);
  const historicalLoadedRef = useRef<boolean>(false);
  const hasMoreHistoryRef = useRef<boolean>(true);
  const isLoadingHistoryRef = useRef<boolean>(false);
  const loadMoreHistoryRef = useRef<(() => void) | null>(null);
  const omyeCandlesRef = useRef<CandlestickData<UTCTimestamp>[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const omyeWsRef = useRef<WebSocket | null>(null);
  const activeToolRef = useRef<DrawingTool>(activeTool);
  const draftAnchorRef = useRef<ChartAnchor | null>(draftAnchor);
  const replayActiveRef = useRef<boolean>(replayActive);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    draftAnchorRef.current = draftAnchor;
  }, [draftAnchor]);

  useEffect(() => {
    replayActiveRef.current = replayActive;
  }, [replayActive]);

  const overlayPrefsRef = useRef({
    showSR: showSupportResistance,
    showPatterns,
    showSwing: showSwingLabels,
    showBos: showBosChoch,
  });

  useEffect(() => {
    overlayPrefsRef.current = {
      showSR: showSupportResistance,
      showPatterns,
      showSwing: showSwingLabels,
      showBos: showBosChoch,
    };
  }, [showSupportResistance, showPatterns, showSwingLabels, showBosChoch]);

  const symbolMeta = SYMBOL_OPTIONS.find((s) => s.value === symbol) ?? SYMBOL_OPTIONS[0];

  useEffect(() => {
    onTelemetryChange?.({
      symbol,
      timeframe,
      price: livePrice,
      smc,
      omye,
    });
  }, [symbol, timeframe, livePrice, smc, omye, onTelemetryChange]);

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
      width: el.clientWidth || 320,
      height: el.clientHeight || 340,
      layout: {
        ...initialChartTheme.layout,
        fontSize: 10,
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
        rightOffset: 8,
        barSpacing: 7,
        minBarSpacing: 0.2,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
      },
      rightPriceScale: {
        visible: true,
        autoScale: true,
        ...initialChartTheme.rightPriceScale,
        ticksVisible: false,
        entireTextOnly: true,
        alignLabels: true,
        minimumWidth: 48,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#F23645',
      borderUpColor: '#089981',
      borderDownColor: '#F23645',
      wickUpColor: '#089981',
      wickDownColor: '#F23645',
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const ema20Series = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 1,
      title: 'EMA20',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const ema50Series = chart.addSeries(LineSeries, {
      color: '#38BDF8',
      lineWidth: 1,
      title: 'EMA50',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const ema200Series = chart.addSeries(LineSeries, {
      color: '#C084FC',
      lineWidth: 2,
      title: 'EMA200',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const bbUpperSeries = chart.addSeries(LineSeries, {
      color: 'rgba(96, 165, 250, 0.85)',
      lineWidth: 1,
      title: 'BB+',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const bbBasisSeries = chart.addSeries(LineSeries, {
      color: 'rgba(96, 165, 250, 0.5)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: 'BB20',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });
    const bbLowerSeries = chart.addSeries(LineSeries, {
      color: 'rgba(96, 165, 250, 0.85)',
      lineWidth: 1,
      title: 'BB-',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      visible: false,
    });

    const markersPlugin = createSeriesMarkers(candleSeries, []);

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;
    ema200SeriesRef.current = ema200Series;
    bbUpperSeriesRef.current = bbUpperSeries;
    bbBasisSeriesRef.current = bbBasisSeries;
    bbLowerSeriesRef.current = bbLowerSeries;
    markersPluginRef.current = markersPlugin;

    let rafId: number | null = null;
    const scheduleOverlayTick = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setOverlayRenderTick((t) => t + 1);
      });
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      scheduleOverlayTick();
      if (
        logicalRange &&
        logicalRange.from < 35 &&
        historicalLoadedRef.current &&
        hasMoreHistoryRef.current &&
        !isLoadingHistoryRef.current &&
        !replayActiveRef.current
      ) {
        loadMoreHistoryRef.current?.();
      }
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.point) {
        setCrosshairReadout(null);
        setHoverAnchor(null);
        return;
      }
      const priceVal = candleSeries.coordinateToPrice(param.point.y);
      const logicalVal = chart.timeScale().coordinateToLogical(param.point.x);
      const candleDatum = param.seriesData.get(candleSeries) as
        | CandlestickData<UTCTimestamp>
        | undefined;

      if (priceVal !== null && Number.isFinite(Number(priceVal))) {
        const numericTime = typeof param.time === 'number' ? param.time : null;
        setCrosshairReadout({
          price: Number(priceVal),
          timeLabel: numericTime ? formatUtcShort(numericTime) : 'Cursor',
          open: candleDatum?.open,
          high: candleDatum?.high,
          low: candleDatum?.low,
          close: candleDatum?.close,
        });
      }

      if (
        draftAnchorRef.current &&
        logicalVal !== null &&
        priceVal !== null &&
        Number.isFinite(Number(priceVal))
      ) {
        setHoverAnchor({ logical: Number(logicalVal), price: Number(priceVal) });
      }
    });

    chart.subscribeClick((param) => {
      const tool = activeToolRef.current;
      if (tool === 'crosshair' || tool === 'brush' || !param.point) return;
      const logicalVal = chart.timeScale().coordinateToLogical(param.point.x);
      const priceVal = candleSeries.coordinateToPrice(param.point.y);
      if (logicalVal === null || priceVal === null || !Number.isFinite(Number(priceVal))) return;

      const anchor: ChartAnchor = { logical: Number(logicalVal), price: Number(priceVal) };
      if (tool === 'hray') {
        setDrawings((prev) => [
          ...prev,
          { id: `${Date.now()}-${Math.random()}`, kind: 'hray', a: anchor },
        ]);
        setDraftAnchor(null);
        setHoverAnchor(null);
        setActiveTool('crosshair');
        return;
      }

      if (tool === 'text') {
        setPendingTextAnchor(anchor);
        setPendingTextValue('');
        return;
      }

      if (!draftAnchorRef.current) {
        setDraftAnchor(anchor);
        setHoverAnchor(anchor);
      } else {
        const first = draftAnchorRef.current;
        setDrawings((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            kind: tool,
            a: first,
            b: anchor,
          },
        ]);
        setDraftAnchor(null);
        setHoverAnchor(null);
        setActiveTool('crosshair');
      }
    });

    const syncRetinaSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        // Trigger Lightweight Charts fancy-canvas DPR backing store refresh on resize / Retina DPI shifts
        void window.devicePixelRatio;
        chart.applyOptions({ width: Math.floor(w), height: Math.floor(h) });
        scheduleOverlayTick();
      }
    };

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        void window.devicePixelRatio;
        chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
        scheduleOverlayTick();
      }
    });
    ro.observe(el);
    window.addEventListener('resize', syncRetinaSize);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncRetinaSize);
      ro.disconnect();
      markersPlugin.detach();
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
      markersPluginRef.current = null;
      overlaySeriesRef.current = [];
    };
  }, []);

  useEffect(() => {
    chartApiRef.current?.applyOptions(getChartThemeOptions(themeMode));
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

  const handleZoomIn = useCallback(() => {
    const chart = chartApiRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const span = range.to - range.from;
    const nextSpan = Math.max(10, span * 0.72);
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
    const maxSpan = Math.max(180, latestCandlesRef.current.length + 20);
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
  }, []);

  const handleJumpLive = useCallback(() => {
    const chart = chartApiRef.current;
    const candles = latestCandlesRef.current;
    if (!chart || candles.length === 0) return;
    chart.priceScale('right').applyOptions({ autoScale: true });
    const chartWidth = chartWrapRef.current?.clientWidth || 360;
    const visibleBars = Math.max(60, Math.min(candles.length, Math.floor(chartWidth / 6)));
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, candles.length - visibleBars),
      to: candles.length - 1 + 8,
    });
  }, []);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => {
      const next = !prev;
      const orientation = (
        window.screen as Screen & {
          orientation?: { lock?: (mode: string) => Promise<void>; unlock?: () => void };
        }
      )?.orientation;

      if (next) {
        const el = terminalSectionRef.current;
        if (el?.requestFullscreen) {
          el.requestFullscreen()
            .then(() => {
              enteredNativeFsRef.current = true;
              orientation?.lock?.('landscape')?.catch(() => {});
            })
            .catch(() => {
              enteredNativeFsRef.current = false;
            });
        } else {
          orientation?.lock?.('landscape')?.catch(() => {});
        }
      } else {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        enteredNativeFsRef.current = false;
        try {
          orientation?.unlock?.();
        } catch {
          // ignore orientation unlock failure
        }
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

    let raf: number | null = null;
    if (prevFullScreenRef.current !== isFullScreen) {
      prevFullScreenRef.current = isFullScreen;
      raf = window.requestAnimationFrame(() => {
        chartApiRef.current?.priceScale('right').applyOptions({ autoScale: true });
        chartApiRef.current?.timeScale().fitContent();
      });
    }

    if (!isFullScreen) {
      return () => {
        if (raf !== null) window.cancelAnimationFrame(raf);
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      document.body.classList.remove('chart-fullscreen-active');
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [isFullScreen]);

  const syncTechnicalIndicators = useCallback(
    (candles: TerminalCandle[]) => {
      const chart = chartApiRef.current;
      if (!chart || candles.length === 0) return;

      if (ema20SeriesRef.current) {
        ema20SeriesRef.current.applyOptions({ visible: showEma20 });
        ema20SeriesRef.current.setData(showEma20 ? calcEmaPoints(candles, 20) : []);
      }
      if (ema50SeriesRef.current) {
        ema50SeriesRef.current.applyOptions({ visible: showEma50 });
        ema50SeriesRef.current.setData(showEma50 ? calcEmaPoints(candles, 50) : []);
      }
      if (ema200SeriesRef.current) {
        ema200SeriesRef.current.applyOptions({ visible: showEma200 });
        ema200SeriesRef.current.setData(showEma200 ? calcEmaPoints(candles, 200) : []);
      }

      if (bbUpperSeriesRef.current && bbBasisSeriesRef.current && bbLowerSeriesRef.current) {
        bbUpperSeriesRef.current.applyOptions({ visible: showBollinger });
        bbBasisSeriesRef.current.applyOptions({ visible: showBollinger });
        bbLowerSeriesRef.current.applyOptions({ visible: showBollinger });
        if (showBollinger) {
          const bb = calcBollingerPoints(candles, 20, 2);
          bbUpperSeriesRef.current.setData(bb.upper);
          bbBasisSeriesRef.current.setData(bb.basis);
          bbLowerSeriesRef.current.setData(bb.lower);
        } else {
          bbUpperSeriesRef.current.setData([]);
          bbBasisSeriesRef.current.setData([]);
          bbLowerSeriesRef.current.setData([]);
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
            color: 'rgba(246, 70, 93, 0.65)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: '70',
          });
          rsiSeries.createPriceLine({
            price: 50,
            color: 'rgba(132, 142, 156, 0.35)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
          });
          rsiSeries.createPriceLine({
            price: 30,
            color: 'rgba(0, 192, 135, 0.65)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: '30',
          });
          rsiSeriesRef.current = rsiSeries;
          chart.panes()[1]?.setHeight(96);
        }
        const rsiData = calcRsiPoints(candles, 14);
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

      setOverlayRenderTick((t) => t + 1);
    },
    [showEma20, showEma50, showEma200, showBollinger, showRsi]
  );

  useEffect(() => {
    if (latestCandlesRef.current.length > 0) {
      syncTechnicalIndicators(latestCandlesRef.current);
    }
  }, [syncTechnicalIndicators]);

  const clearOverlayLines = useCallback(() => {
    const chart = chartApiRef.current;
    if (!chart) return;
    overlaySeriesRef.current.forEach((line) => {
      try {
        chart.removeSeries(line);
      } catch {
        // already removed
      }
    });
    overlaySeriesRef.current = [];
  }, []);

  const addLineSegment = useCallback(
    (
      chart: IChartApi,
      points: Array<{ time: UTCTimestamp; value: number }>,
      options: {
        color: string;
        lineWidth: 1 | 2 | 3;
        lineStyle: LineStyle;
        title?: string;
        lastValueVisible?: boolean;
      }
    ) => {
      // LightweightCharts requires strictly ascending unique timestamps
      const sorted = [...points].sort((a, b) => a.time - b.time);
      const unique: Array<{ time: UTCTimestamp; value: number }> = [];
      for (const pt of sorted) {
        if (unique.length === 0 || pt.time > unique[unique.length - 1].time) {
          unique.push(pt);
        }
      }
      if (unique.length < 2) return;

      const line = chart.addSeries(LineSeries, {
        color: options.color,
        lineWidth: options.lineWidth,
        lineStyle: options.lineStyle,
        title: options.title,
        priceLineVisible: false,
        lastValueVisible: options.lastValueVisible ?? false,
        crosshairMarkerVisible: false,
      });
      line.setData(unique);
      overlaySeriesRef.current.push(line);
    },
    []
  );

  // Auto-draw Support (Green), Resistance (Red), Chart Patterns, HH/HL/LH/LL & BOS/CHoCH directly on candles
  const runSmcAndAutoDraw = useCallback(
    (
      rawCandles: CandlestickData<UTCTimestamp>[],
      prefs: { showSR: boolean; showPatterns: boolean; showSwing: boolean; showBos: boolean }
    ) => {
      const chart = chartApiRef.current;
      const markersPlugin = markersPluginRef.current;
      if (!chart || !markersPlugin || rawCandles.length < 12) return;

      // Analyze recent 600-bar window so 25,000+ inception bars stay silky 60fps when panning/zooming
      const candles = rawCandles.length > 600 ? rawCandles.slice(-600) : rawCandles;

      clearOverlayLines();

      const pivotLen = 4;
      const markers: SeriesMarker<Time>[] = [];
      const structureLinesQueue: Array<{
        t1: UTCTimestamp;
        t2: UTCTimestamp;
        price: number;
        color: string;
        style: LineStyle;
        width: 1 | 2;
      }> = [];

      const pivotHighs: PivotPoint[] = [];
      const pivotLows: PivotPoint[] = [];

      let prevSwingHigh: PivotPoint | null = null;
      let prevSwingLow: PivotPoint | null = null;
      let activeHigh: { time: UTCTimestamp; price: number; broken: boolean } | null = null;
      let activeLow: { time: UTCTimestamp; price: number; broken: boolean } | null = null;

      let lastHighLabel = 'HH';
      let lastLowLabel = 'HL';
      let trend: 1 | -1 = 1;
      let lastEvent = 'BOS (Bull)';
      let bosCount = 0;
      let chochCount = 0;

      for (let i = pivotLen; i < candles.length; i += 1) {
        const pivotIdx = i - pivotLen;
        if (pivotIdx >= pivotLen) {
          let isHigh = true;
          let isLow = true;
          for (let j = 1; j <= pivotLen; j += 1) {
            if (
              candles[pivotIdx].high <= candles[pivotIdx - j].high ||
              candles[pivotIdx].high < candles[pivotIdx + j].high
            ) {
              isHigh = false;
            }
            if (
              candles[pivotIdx].low >= candles[pivotIdx - j].low ||
              candles[pivotIdx].low > candles[pivotIdx + j].low
            ) {
              isLow = false;
            }
          }

          if (isHigh) {
            const label =
              prevSwingHigh === null
                ? 'HH'
                : candles[pivotIdx].high > prevSwingHigh.price
                  ? 'HH'
                  : 'LH';
            lastHighLabel = label;
            const pt: PivotPoint = {
              idx: pivotIdx,
              time: candles[pivotIdx].time,
              price: candles[pivotIdx].high,
            };
            pivotHighs.push(pt);
            prevSwingHigh = pt;
            activeHigh = { time: pt.time, price: pt.price, broken: false };

            if (prefs.showSwing) {
              markers.push({
                time: pt.time,
                position: 'aboveBar',
                color: label === 'HH' ? '#00C087' : '#F0B90B',
                shape: 'arrowDown',
                text: label,
              });
            }
          }

          if (isLow) {
            const label =
              prevSwingLow === null
                ? 'HL'
                : candles[pivotIdx].low < prevSwingLow.price
                  ? 'LL'
                  : 'HL';
            lastLowLabel = label;
            const pt: PivotPoint = {
              idx: pivotIdx,
              time: candles[pivotIdx].time,
              price: candles[pivotIdx].low,
            };
            pivotLows.push(pt);
            prevSwingLow = pt;
            activeLow = { time: pt.time, price: pt.price, broken: false };

            if (prefs.showSwing) {
              markers.push({
                time: pt.time,
                position: 'belowBar',
                color: label === 'LL' ? '#F6465D' : '#00C087',
                shape: 'arrowUp',
                text: label,
              });
            }
          }
        }

        const closePrice = candles[i].close;
        const barTime = candles[i].time;

        if (activeHigh && !activeHigh.broken && closePrice > activeHigh.price) {
          activeHigh.broken = true;
          const isChoch = trend === -1;
          trend = 1;
          if (isChoch) {
            chochCount += 1;
            lastEvent = 'CHoCH (Bull)';
          } else {
            bosCount += 1;
            lastEvent = 'BOS (Bull)';
          }

          if (prefs.showBos) {
            structureLinesQueue.push({
              t1: activeHigh.time,
              t2: barTime,
              price: activeHigh.price,
              color: '#00C087',
              style: isChoch ? LineStyle.Solid : LineStyle.Dashed,
              width: isChoch ? 2 : 1,
            });
            markers.push({
              time: barTime,
              position: 'aboveBar',
              color: '#00C087',
              shape: 'circle',
              text: isChoch ? 'CHoCH' : 'BOS',
            });
          }
        }

        if (activeLow && !activeLow.broken && closePrice < activeLow.price) {
          activeLow.broken = true;
          const isChoch = trend === 1;
          trend = -1;
          if (isChoch) {
            chochCount += 1;
            lastEvent = 'CHoCH (Bear)';
          } else {
            bosCount += 1;
            lastEvent = 'BOS (Bear)';
          }

          if (prefs.showBos) {
            structureLinesQueue.push({
              t1: activeLow.time,
              t2: barTime,
              price: activeLow.price,
              color: '#F6465D',
              style: isChoch ? LineStyle.Solid : LineStyle.Dashed,
              width: isChoch ? 2 : 1,
            });
            markers.push({
              time: barTime,
              position: 'belowBar',
              color: '#F6465D',
              shape: 'circle',
              text: isChoch ? 'CHoCH' : 'BOS',
            });
          }
        }
      }

      const latestIdx = candles.length - 1;
      const latestBar = candles[latestIdx];
      const lastClose = latestBar.close;

      // 1. BOS / CHoCH structure lines
      if (prefs.showBos) {
        for (const seg of structureLinesQueue.slice(-8)) {
          addLineSegment(
            chart,
            [
              { time: seg.t1, value: seg.price },
              { time: seg.t2, value: seg.price },
            ],
            {
              color: seg.color,
              lineWidth: seg.width,
              lineStyle: seg.style,
            }
          );
        }
      }

      // 2. Auto-draw Green Support Lines & Red Resistance Lines directly on candles
      const recentWindow = candles.slice(-70);
      const minLowBar = recentWindow.reduce((a, b) => (b.low < a.low ? b : a), recentWindow[0]);
      const maxHighBar = recentWindow.reduce((a, b) => (b.high > a.high ? b : a), recentWindow[0]);

      const supportCandidates = pivotLows
        .filter((p) => p.price <= lastClose * 1.002)
        .sort((a, b) => b.idx - a.idx);
      const primarySupport =
        supportCandidates[0] ?? {
          idx: Math.max(0, latestIdx - 25),
          time: minLowBar.time,
          price: minLowBar.low,
        };
      const secondarySupport = supportCandidates.find(
        (p) => Math.abs(p.price - primarySupport.price) / primarySupport.price > 0.0025
      );

      const resistanceCandidates = pivotHighs
        .filter((p) => p.price >= lastClose * 0.998)
        .sort((a, b) => b.idx - a.idx);
      const primaryResistance =
        resistanceCandidates[0] ?? {
          idx: Math.max(0, latestIdx - 25),
          time: maxHighBar.time,
          price: maxHighBar.high,
        };
      const secondaryResistance = resistanceCandidates.find(
        (p) => Math.abs(p.price - primaryResistance.price) / primaryResistance.price > 0.0025
      );

      if (prefs.showSR) {
        // Green Support Lines
        if (primarySupport.time < latestBar.time) {
          addLineSegment(
            chart,
            [
              { time: primarySupport.time, value: primarySupport.price },
              { time: latestBar.time, value: primarySupport.price },
            ],
            {
              color: '#00C087',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              title: 'S1',
              lastValueVisible: true,
            }
          );
        }
        if (secondarySupport && secondarySupport.time < latestBar.time) {
          addLineSegment(
            chart,
            [
              { time: secondarySupport.time, value: secondarySupport.price },
              { time: latestBar.time, value: secondarySupport.price },
            ],
            {
              color: 'rgba(0, 192, 135, 0.7)',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              title: 'S2',
              lastValueVisible: true,
            }
          );
        }

        // Red Resistance Lines
        if (primaryResistance.time < latestBar.time) {
          addLineSegment(
            chart,
            [
              { time: primaryResistance.time, value: primaryResistance.price },
              { time: latestBar.time, value: primaryResistance.price },
            ],
            {
              color: '#F6465D',
              lineWidth: 2,
              lineStyle: LineStyle.Solid,
              title: 'R1',
              lastValueVisible: true,
            }
          );
        }
        if (secondaryResistance && secondaryResistance.time < latestBar.time) {
          addLineSegment(
            chart,
            [
              { time: secondaryResistance.time, value: secondaryResistance.price },
              { time: latestBar.time, value: secondaryResistance.price },
            ],
            {
              color: 'rgba(246, 70, 93, 0.7)',
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              title: 'R2',
              lastValueVisible: true,
            }
          );
        }
      }

      // 3. Auto-detect & draw Chart Patterns directly across the candles
      let detectedPattern: DetectedPatternInfo | null = null;
      if (pivotHighs.length >= 2 && pivotLows.length >= 2) {
        const h1 = pivotHighs[pivotHighs.length - 2];
        const h2 = pivotHighs[pivotHighs.length - 1];
        const l1 = pivotLows[pivotLows.length - 2];
        const l2 = pivotLows[pivotLows.length - 1];

        const highDiffPct = Math.abs(h2.price - h1.price) / Math.max(0.0001, h1.price);
        const lowDiffPct = Math.abs(l2.price - l1.price) / Math.max(0.0001, l1.price);

        const midLow = pivotLows.find((l) => l.idx > h1.idx && l.idx < h2.idx);
        const midHigh = pivotHighs.find((h) => h.idx > l1.idx && h.idx < l2.idx);

        if (highDiffPct <= 0.0055 && midLow && h2.idx >= latestIdx - 42) {
          detectedPattern = { name: 'Double Top (M)', bias: 'Bearish' };
          if (prefs.showPatterns) {
            addLineSegment(
              chart,
              [
                { time: h1.time, value: h1.price },
                { time: midLow.time, value: midLow.price },
                { time: h2.time, value: h2.price },
                { time: latestBar.time, value: lastClose },
              ],
              { color: '#F0B90B', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'M' }
            );
            addLineSegment(
              chart,
              [
                { time: midLow.time, value: midLow.price },
                { time: latestBar.time, value: midLow.price },
              ],
              { color: '#F6465D', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'Neckline' }
            );
            markers.push({
              time: h2.time,
              position: 'aboveBar',
              color: '#F0B90B',
              shape: 'circle',
              text: 'Double Top',
            });
          }
        } else if (lowDiffPct <= 0.0055 && midHigh && l2.idx >= latestIdx - 42) {
          detectedPattern = { name: 'Double Bottom (W)', bias: 'Bullish' };
          if (prefs.showPatterns) {
            addLineSegment(
              chart,
              [
                { time: l1.time, value: l1.price },
                { time: midHigh.time, value: midHigh.price },
                { time: l2.time, value: l2.price },
                { time: latestBar.time, value: lastClose },
              ],
              { color: '#F0B90B', lineWidth: 2, lineStyle: LineStyle.Solid, title: 'W' }
            );
            addLineSegment(
              chart,
              [
                { time: midHigh.time, value: midHigh.price },
                { time: latestBar.time, value: midHigh.price },
              ],
              { color: '#00C087', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'Neckline' }
            );
            markers.push({
              time: l2.time,
              position: 'belowBar',
              color: '#F0B90B',
              shape: 'circle',
              text: 'Double Bottom',
            });
          }
        } else {
          // Trendline / Triangle / Wedge / Channel projection directly across pivot candles
          const spanH = Math.max(1, h2.idx - h1.idx);
          const spanL = Math.max(1, l2.idx - l1.idx);
          const slopeH = (h2.price - h1.price) / spanH;
          const slopeL = (l2.price - l1.price) / spanL;

          const projHigh = h2.price + slopeH * (latestIdx - h2.idx);
          const projLow = l2.price + slopeL * (latestIdx - l2.idx);

          const flatH = highDiffPct <= 0.003;
          const flatL = lowDiffPct <= 0.003;

          if (flatH && slopeL > 0) {
            detectedPattern = { name: 'Ascending Triangle', bias: 'Bullish' };
          } else if (flatL && slopeH < 0) {
            detectedPattern = { name: 'Descending Triangle', bias: 'Bearish' };
          } else if (slopeH < 0 && slopeL > 0) {
            detectedPattern = { name: 'Symmetrical Triangle', bias: 'Breakout' };
          } else if (slopeH < 0 && slopeL < 0 && slopeH < slopeL) {
            detectedPattern = { name: 'Falling Wedge', bias: 'Bullish' };
          } else if (slopeH > 0 && slopeL > 0 && slopeL > slopeH) {
            detectedPattern = { name: 'Rising Wedge', bias: 'Bearish' };
          } else if (slopeH > 0 && slopeL > 0) {
            detectedPattern = { name: 'Bullish Channel', bias: 'Bullish' };
          } else {
            detectedPattern = { name: 'Bearish Channel', bias: 'Bearish' };
          }

          if (prefs.showPatterns) {
            // Upper Resistance Pattern Trendline (Red)
            addLineSegment(
              chart,
              [
                { time: h1.time, value: h1.price },
                { time: h2.time, value: h2.price },
                { time: latestBar.time, value: projHigh },
              ],
              {
                color: '#F6465D',
                lineWidth: 2,
                lineStyle: LineStyle.Dashed,
                title: 'Pat-R',
              }
            );
            // Lower Support Pattern Trendline (Green)
            addLineSegment(
              chart,
              [
                { time: l1.time, value: l1.price },
                { time: l2.time, value: l2.price },
                { time: latestBar.time, value: projLow },
              ],
              {
                color: '#00C087',
                lineWidth: 2,
                lineStyle: LineStyle.Dashed,
                title: 'Pat-S',
              }
            );
            const anchorPivot = h2.idx >= l2.idx ? h2 : l2;
            markers.push({
              time: anchorPivot.time,
              position: h2.idx >= l2.idx ? 'aboveBar' : 'belowBar',
              color: '#F0B90B',
              shape: 'circle',
              text: detectedPattern.name,
            });
          }
        }
      }

      // 4. Detect Smart Money Concepts: Active Order Block (OB) & Fair Value Gap (FVG)
      let activeOrderBlock: ZoneRange | null = null;
      const startObIdx = Math.max(1, candles.length - 55);
      for (let i = candles.length - 3; i >= startObIdx; i -= 1) {
        const c = candles[i];
        const next1 = candles[i + 1];
        const next2 = candles[i + 2];
        const cRange = Math.max(0.0001, c.high - c.low);
        const impulseUp = next1.close > c.high && next2.close - c.close > cRange * 1.35;
        const impulseDown = next1.close < c.low && c.close - next2.close > cRange * 1.35;

        if (trend === 1 && c.close < c.open && impulseUp) {
          const mitigated = candles.slice(i + 2).some((bar) => bar.low < c.low);
          activeOrderBlock = { type: 'Bullish', low: c.low, high: c.high, mitigated };
          if (prefs.showBos && c.time < latestBar.time) {
            addLineSegment(
              chart,
              [
                { time: c.time, value: c.high },
                { time: latestBar.time, value: c.high },
              ],
              { color: 'rgba(0, 192, 135, 0.45)', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'OB+' }
            );
          }
          break;
        }
        if (trend === -1 && c.close > c.open && impulseDown) {
          const mitigated = candles.slice(i + 2).some((bar) => bar.high > c.high);
          activeOrderBlock = { type: 'Bearish', low: c.low, high: c.high, mitigated };
          if (prefs.showBos && c.time < latestBar.time) {
            addLineSegment(
              chart,
              [
                { time: c.time, value: c.low },
                { time: latestBar.time, value: c.low },
              ],
              { color: 'rgba(246, 70, 93, 0.45)', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'OB-' }
            );
          }
          break;
        }
      }

      let activeFvg: ZoneRange | null = null;
      const startFvgIdx = Math.max(2, candles.length - 40);
      for (let i = candles.length - 1; i >= startFvgIdx; i -= 1) {
        const prev2 = candles[i - 2];
        const curr = candles[i];
        if (curr.low > prev2.high) {
          const mitigated = candles.slice(i + 1).some((bar) => bar.low <= prev2.high);
          activeFvg = { type: 'Bullish', low: prev2.high, high: curr.low, mitigated };
          break;
        }
        if (curr.high < prev2.low) {
          const mitigated = candles.slice(i + 1).some((bar) => bar.high >= prev2.low);
          activeFvg = { type: 'Bearish', low: curr.high, high: prev2.low, mitigated };
          break;
        }
      }

      markers.sort((a, b) => Number(a.time) - Number(b.time));
      markersPlugin.setMarkers(markers);

      setLivePrice(lastClose);
      setIsBullTick(lastClose >= latestBar.open);

      const swingLowVal = prevSwingLow?.price ?? primarySupport.price;
      const swingHighVal = prevSwingHigh?.price ?? primaryResistance.price;

      if (trend === 1) {
        const rawSl = swingLowVal < lastClose ? swingLowVal : lastClose * 0.992;
        const risk = Math.max(lastClose * 0.0025, lastClose - rawSl);
        const tp = lastClose + risk * 2;
        setSmc({
          trend: 1,
          lastEvent,
          lastHighLabel,
          lastLowLabel,
          lastHighPrice: swingHighVal,
          lastLowPrice: swingLowVal,
          supportPrice: primarySupport.price,
          resistancePrice: primaryResistance.price,
          pattern: detectedPattern,
          orderBlock: activeOrderBlock,
          fvg: activeFvg,
          bosCount,
          chochCount,
          entry: lastClose,
          tp,
          sl: rawSl,
        });
      } else {
        const rawSl = swingHighVal > lastClose ? swingHighVal : lastClose * 1.008;
        const risk = Math.max(lastClose * 0.0025, rawSl - lastClose);
        const tp = Math.max(0.0001, lastClose - risk * 2);
        setSmc({
          trend: -1,
          lastEvent,
          lastHighLabel,
          lastLowLabel,
          lastHighPrice: swingHighVal,
          lastLowPrice: swingLowVal,
          supportPrice: primarySupport.price,
          resistancePrice: primaryResistance.price,
          pattern: detectedPattern,
          orderBlock: activeOrderBlock,
          fvg: activeFvg,
          bosCount,
          chochCount,
          entry: lastClose,
          tp,
          sl: rawSl,
        });
      }
    },
    [addLineSegment, clearOverlayLines]
  );

  const syncTechnicalIndicatorsRef = useRef(syncTechnicalIndicators);
  const runSmcAndAutoDrawRef = useRef(runSmcAndAutoDraw);

  useEffect(() => {
    syncTechnicalIndicatorsRef.current = syncTechnicalIndicators;
  }, [syncTechnicalIndicators]);

  useEffect(() => {
    runSmcAndAutoDrawRef.current = runSmcAndAutoDraw;
  }, [runSmcAndAutoDraw]);

  useEffect(() => {
    if (latestCandlesRef.current.length >= 12) {
      runSmcAndAutoDraw(latestCandlesRef.current, {
        showSR: showSupportResistance,
        showPatterns,
        showSwing: showSwingLabels,
        showBos: showBosChoch,
      });
    }
  }, [showSupportResistance, showPatterns, showSwingLabels, showBosChoch, runSmcAndAutoDraw]);

  // Replay Mode helpers & timer
  const applyReplaySlice = useCallback(
    (nextIdx: number) => {
      const full = fullCandlesRef.current;
      if (full.length === 0 || !candleSeriesRef.current) return;
      const clamped = Math.max(20, Math.min(full.length, nextIdx));
      const sliced = full.slice(0, clamped);
      latestCandlesRef.current = sliced;
      candleSeriesRef.current.setData(sliced.map(toPureCandle));
      syncTechnicalIndicators(sliced);
      if (sliced.length >= 12) {
        runSmcAndAutoDraw(sliced, overlayPrefsRef.current);
      }
      setReplayIndex(clamped);
    },
    [runSmcAndAutoDraw, syncTechnicalIndicators]
  );

  const toggleReplayMode = useCallback(() => {
    if (replayActive) {
      setReplayPlaying(false);
      setReplayActive(false);
      const full = fullCandlesRef.current;
      if (full.length > 0 && candleSeriesRef.current) {
        latestCandlesRef.current = full;
        candleSeriesRef.current.setData(full.map(toPureCandle));
        syncTechnicalIndicators(full);
        if (full.length >= 12) {
          runSmcAndAutoDraw(full, overlayPrefsRef.current);
        }
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
  }, [replayActive, applyReplaySlice, runSmcAndAutoDraw, syncTechnicalIndicators]);

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
        syncTechnicalIndicators(sliced);
        if (sliced.length >= 12) {
          runSmcAndAutoDraw(sliced, overlayPrefsRef.current);
        }
        if (next >= fullLen) setReplayPlaying(false);
        return next;
      });
    }, ms);
    return () => window.clearInterval(timer);
  }, [replayActive, replayPlaying, replaySpeed, runSmcAndAutoDraw, syncTechnicalIndicators]);

  // Real-Time WebSocket Engine for Gold, Silver, BTC, ETH, SOL, US500, USOIL (Zero Refresh)
  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer: number | null = null;
    let tickDrawCount = 0;
    let disposed = false;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setLoadError(null);
    setStreamStatus('CONNECTING');
    setReplayActive(false);
    setReplayPlaying(false);
    setDrawings([]);
    setDraftAnchor(null);

    // Clear old candles, indicators, markers & overlay lines immediately on timeframe/symbol switch
    historicalLoadedRef.current = false;
    hasMoreHistoryRef.current = true;
    isLoadingHistoryRef.current = false;
    setHasMoreHistory(true);
    setIsLoadingHistory(false);
    setLoadedSpanInfo(null);
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
    markersPluginRef.current?.setMarkers([]);
    clearOverlayLines();

    const shiftDrawingLogicalIndices = (addedCount: number) => {
      if (addedCount <= 0) return;
      const shiftAnchor = (a: ChartAnchor): ChartAnchor => ({ ...a, logical: a.logical + addedCount });
      setDrawings((prev) =>
        prev.length === 0
          ? prev
          : prev.map((d) => {
              if (d.kind === 'trendline' || d.kind === 'fib') {
                return { ...d, a: shiftAnchor(d.a), b: shiftAnchor(d.b) };
              }
              if (d.kind === 'hray' || d.kind === 'text') {
                return { ...d, a: shiftAnchor(d.a) };
              }
              return { ...d, points: d.points.map(shiftAnchor) };
            })
      );
      setDraftAnchor((prev) => (prev ? shiftAnchor(prev) : null));
      setBrushStroke((prev) => (prev ? prev.map(shiftAnchor) : null));
    };

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

        const byTime = new Map<number, TerminalCandle>();
        for (const c of older) byTime.set(c.time, c);
        for (const c of fullCandlesRef.current) byTime.set(c.time, c);
        const merged = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
        const addedCount = merged.length - fullCandlesRef.current.length;

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
        if (addedCount > 0) {
          shiftDrawingLogicalIndices(addedCount);
        }

        hasMoreHistoryRef.current = res.hasMore && addedCount > 0;
        setHasMoreHistory(hasMoreHistoryRef.current);
        setLoadedSpanInfo((prev) => ({
          oldestTs: merged[0].time,
          count: merged.length,
          inceptionDate: res.inceptionDate ?? prev?.inceptionDate,
        }));

        syncTechnicalIndicatorsRef.current(merged);
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

    const applyIncomingCandle = (incomingCandle: TerminalCandle, isClosed: boolean) => {
      if (disposed || !candleSeriesRef.current || !historicalLoadedRef.current) return;

      const fullArr = fullCandlesRef.current;
      let liveCandle = incomingCandle;
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

      candleSeriesRef.current.update(toPureCandle(liveCandle));

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
      setIsBullTick(liveCandle.close >= liveCandle.open);

      // Keep Smart Setup Entry / Target / Stop-Loss live-updating on every single tick without page refresh
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

      // If chart itself is on 1m, keep OMYE synced directly from the live 1m stream
      if (timeframe === '1m') {
        const snap = computeOmyeSnapshot(arr, 'LIVE 1m WS');
        if (snap) setOmye(snap);
      }

      tickDrawCount += 1;
      if ((isClosed || isNewBar || tickDrawCount % 10 === 0) && arr.length >= 2) {
        syncTechnicalIndicatorsRef.current(arr);
      }
      if ((isClosed || isNewBar) && arr.length >= 12) {
        runSmcAndAutoDrawRef.current(arr, overlayPrefsRef.current);
      }
    };

    let goldPollTimer: number | null = null;
    const startGoldFallbackPoll = () => {
      if (symbol !== 'XAUUSD' || goldPollTimer !== null || disposed) return;
      goldPollTimer = window.setInterval(() => {
        if (disposed) return;
        fetchCandles('XAUUSD', timeframe, controller.signal)
          .then((fresh) => {
            if (disposed || fresh.candles.length === 0) return;
            const latest = fresh.candles[fresh.candles.length - 1];
            applyIncomingCandle(latest, false);
          })
          .catch(() => {
            // ignore poll errors
          });
      }, 5000);
    };

    const connectBackendMarketWs = () => {
      if (disposed) return;
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${wsProto}//${window.location.host}/ws/market?symbol=${encodeURIComponent(
        symbol
      )}&interval=${encodeURIComponent(timeframe)}`;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (disposed) return;
          setStreamStatus('LIVE WS');
          if (goldPollTimer !== null) {
            window.clearInterval(goldPollTimer);
            goldPollTimer = null;
          }
        };

        ws.onmessage = (event) => {
          if (disposed) return;
          try {
            const parsed = JSON.parse(event.data as string) as {
              type?: string;
              candle?: { time: number; open: number; high: number; low: number; close: number };
              isClosed?: boolean;
            };
            if (parsed.type === 'kline' && parsed.candle) {
              applyIncomingCandle(
                {
                  time: parsed.candle.time as UTCTimestamp,
                  open: parsed.candle.open,
                  high: parsed.candle.high,
                  low: parsed.candle.low,
                  close: parsed.candle.close,
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
          reconnectTimer = window.setTimeout(connectBackendMarketWs, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setStreamStatus('RECONNECTING');
        startGoldFallbackPoll();
        reconnectTimer = window.setTimeout(connectBackendMarketWs, 3500);
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
            if (!disposed) setStreamStatus('LIVE WS');
          };

          ws.onmessage = (event) => {
            if (disposed) return;
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
              // ignore malformed frame
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
          // fallback cleanly to backend /ws/market relay
        }
      }
      connectBackendMarketWs();
    };

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
        candleSeriesRef.current?.setData(candles.map(toPureCandle));
        historicalLoadedRef.current = true;
        hasMoreHistoryRef.current = res.hasMore;
        setHasMoreHistory(res.hasMore);
        setLoadedSpanInfo({
          oldestTs: candles[0].time,
          count: candles.length,
          inceptionDate: res.inceptionDate,
        });

        const applyInitialRange = () => {
          const chart = chartApiRef.current;
          if (!chart || disposed) return;
          chart.priceScale('right').applyOptions({ autoScale: true });
          const chartWidth = chartWrapRef.current?.clientWidth || 360;
          const visibleBars = Math.max(60, Math.min(candles.length, Math.floor(chartWidth / 6)));
          if (candles.length > visibleBars) {
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(0, candles.length - visibleBars),
              to: candles.length - 1 + 6,
            });
          } else {
            chart.timeScale().fitContent();
          }
        };

        applyInitialRange();
        window.requestAnimationFrame(applyInitialRange);
        syncTechnicalIndicatorsRef.current(candles);
        runSmcAndAutoDrawRef.current(candles, overlayPrefsRef.current);
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
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
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

    const apply1mCandle = (bar: CandlestickData<UTCTimestamp>) => {
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

  return (
    <section
      ref={terminalSectionRef}
      aria-label="Live WebSocket Auto-Draw Trading Terminal"
      className={
        isFullScreen
          ? 'fixed inset-0 z-[100] flex flex-col w-screen h-screen bg-[var(--vp-canvas)] text-[var(--vp-text)] overflow-hidden transition-colors duration-200'
          : 'vp-glass-card rounded-2xl overflow-hidden text-[var(--vp-text)]'
      }
      style={isFullScreen ? { width: '100vw', height: '100vh' } : undefined}
    >
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[var(--vp-header)] border-b border-[var(--vp-border)] transition-colors duration-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="Select trading symbol"
            value={symbol}
            onChange={(e) => {
              const nextSym = e.target.value as SmcSymbol;
              setSymbol(nextSym);
              const found = SYMBOL_OPTIONS.find((opt) => opt.value === nextSym);
              if (found) onSelectTvSymbol?.(found.tvSymbol);
            }}
            className="rounded-full border border-[var(--vp-border)] bg-[var(--vp-control)] text-[var(--vp-text)] px-3 py-1.5 text-xs font-semibold outline-none cursor-pointer transition-colors hover:border-[#F59E0B]/50"
          >
            {SYMBOL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {TIMEFRAME_OPTIONS.map((tf) => {
              const active = timeframe === tf.value;
              return (
                <button
                  key={tf.value}
                  type="button"
                  onClick={() => setTimeframe(tf.value)}
                  className={`vp-pill-btn px-2.5 py-1 text-xs font-mono-tabular font-semibold cursor-pointer ${
                    active
                      ? 'bg-[#F59E0B] text-[#0B0E14] shadow-[0_0_14px_rgba(245,158,11,0.3)]'
                      : 'bg-[var(--vp-control)] text-[var(--vp-text)] hover:text-[#F59E0B]'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowSupportResistance((v) => !v)}
            className={`vp-pill-btn px-2.5 py-1 text-[11px] font-semibold cursor-pointer border ${
              showSupportResistance
                ? 'bg-[#089981]/15 border-[#089981]/55 text-[var(--vp-bull)]'
                : 'bg-[var(--vp-control)] border-transparent text-[var(--vp-muted)]'
            }`}
          >
            S/R Lines
          </button>

          <button
            type="button"
            onClick={() => setShowPatterns((v) => !v)}
            className={`vp-pill-btn px-2.5 py-1 text-[11px] font-semibold cursor-pointer border ${
              showPatterns
                ? 'bg-[#F59E0B]/15 border-[#F59E0B]/55 text-[var(--vp-accent-text)]'
                : 'bg-[var(--vp-control)] border-transparent text-[var(--vp-muted)]'
            }`}
          >
            Patterns
          </button>

          <button
            type="button"
            onClick={() => setShowSwingLabels((v) => !v)}
            className={`vp-pill-btn px-2.5 py-1 text-[11px] font-semibold cursor-pointer border ${
              showSwingLabels
                ? 'bg-[#089981]/15 border-[#089981]/55 text-[var(--vp-bull)]'
                : 'bg-[var(--vp-control)] border-transparent text-[var(--vp-muted)]'
            }`}
          >
            HH/HL/LH/LL
          </button>

          <button
            type="button"
            onClick={() => setShowBosChoch((v) => !v)}
            className={`vp-pill-btn px-2.5 py-1 text-[11px] font-semibold cursor-pointer border ${
              showBosChoch
                ? 'bg-[#F59E0B]/15 border-[#F59E0B]/55 text-[var(--vp-accent-text)]'
                : 'bg-[var(--vp-control)] border-transparent text-[var(--vp-muted)]'
            }`}
          >
            BOS/CHoCH
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-tabular font-semibold text-[var(--vp-bull)]">
            <span
              className={`h-2 w-2 rounded-full ${
                streamStatus === 'LIVE WS'
                  ? 'bg-[#089981] animate-pulse shadow-[0_0_8px_#089981]'
                  : 'bg-[#F59E0B]'
              }`}
            />
            {streamStatus}
          </span>
          <div
            className="font-mono-tabular text-[15px] font-bold tracking-tight"
            style={{ color: isBullTick ? 'var(--vp-bull)' : 'var(--vp-bear)' }}
          >
            ${formatTerminalPrice(livePrice, symbolMeta.precision)}
          </div>
        </div>
      </div>

      {/* On-Chart Indicator Bar + Replay Mode + 2-Chart Split Toggle + Chart Settings */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-3.5 py-2 bg-[var(--vp-surface)] border-b border-[var(--vp-border)] transition-colors duration-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--vp-muted)] mr-1">
            Indicators
          </span>
          <button
            type="button"
            onClick={() => setShowEma20((v) => !v)}
            className={`vp-pill-btn px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer border ${
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
            className={`vp-pill-btn px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer border ${
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
            className={`vp-pill-btn px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer border ${
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
            className={`vp-pill-btn px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer border ${
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
            className={`vp-pill-btn inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer border ${
              showRsi
                ? 'bg-[#A78BFA]/15 border-[#A78BFA]/60 text-[#7C3AED] dark:text-[#A78BFA]'
                : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
            }`}
          >
            <Activity className="h-3 w-3" />
            <span className="font-mono-tabular">
              RSI (14){showRsi && liveRsi !== null ? ` · ${liveRsi.toFixed(1)}` : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowVolumeProfile((v) => !v)}
            className={`vp-pill-btn inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer border ${
              showVolumeProfile
                ? 'bg-[#089981]/15 border-[#089981]/60 text-[var(--vp-bull)]'
                : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
            }`}
          >
            <BarChart2 className="h-3 w-3" />
            Vol Profile
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleReplayMode}
            className={`vp-pill-btn inline-flex items-center gap-1 px-3 py-0.5 text-[11px] font-semibold cursor-pointer border ${
              replayActive
                ? 'bg-[#F59E0B] border-[#F59E0B] text-[#0B0E14] shadow-[0_0_14px_rgba(245,158,11,0.3)]'
                : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-text)] hover:border-[#F59E0B]/60'
            }`}
          >
            <Play className="h-3 w-3" />
            Replay Mode
          </button>
          <button
            type="button"
            onClick={() => setSplitView((v) => !v)}
            className={`vp-pill-btn inline-flex items-center gap-1 px-3 py-0.5 text-[11px] font-semibold cursor-pointer border ${
              splitView
                ? 'bg-[#089981]/15 border-[#089981]/60 text-[var(--vp-bull)]'
                : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-text)] hover:border-[#089981]/60'
            }`}
          >
            <Columns2 className="h-3 w-3" />
            2-Chart Split View
          </button>
          <button
            type="button"
            onClick={toggleFullScreen}
            aria-label={isFullScreen ? 'Exit Full-Screen Landscape' : 'Full-Screen Landscape'}
            className={`vp-pill-btn inline-flex items-center gap-1 px-3 py-0.5 text-[11px] font-semibold cursor-pointer border ${
              isFullScreen
                ? 'bg-[#F59E0B] border-[#F59E0B] text-[#0B0E14] shadow-[0_0_14px_rgba(245,158,11,0.3)]'
                : 'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-text)] hover:border-[#F59E0B]/60'
            }`}
          >
            {isFullScreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            {isFullScreen ? 'Exit Full' : 'Full Screen'}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Chart Settings"
            title="Chart Settings"
            className="vp-pill-btn inline-flex items-center gap-1 px-3 py-0.5 text-[11px] font-semibold cursor-pointer border bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-text)] hover:border-[#F59E0B]/60"
          >
            <Settings className="h-3.5 w-3.5 text-[var(--vp-accent-text)]" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* Main Workspace: Chart(s) + Compact Live OMYE & SMC Sidebar */}
      <div className={isFullScreen ? 'flex-1 min-h-0 flex flex-col lg:flex-row' : 'flex flex-col lg:flex-row lg:h-[560px]'}>
        <div
          className={`flex-1 min-w-0 min-h-0 grid gap-0 border-b lg:border-b-0 lg:border-r border-[var(--vp-border)] ${
            isFullScreen ? 'h-full ' : ''
          }${splitView ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}
        >
          {/* Primary Chart Pane */}
          <div
            className={`relative min-w-0 min-h-0 ${
              isFullScreen ? 'h-full' : 'h-[360px] sm:h-[420px] lg:h-full'
            } ${splitView ? 'border-b md:border-b-0 md:border-r border-[var(--vp-border)]' : ''}`}
          >
            <div ref={chartWrapRef} className="smc-chart-host touch-none w-full h-full" />

            {/* Freehand Brush Capture Layer (active only when Brush tool is selected) */}
            {activeTool === 'brush' && (
              <div
                aria-label="Freehand brush drawing canvas"
                className="absolute inset-0 z-15 touch-none cursor-crosshair"
                onPointerDown={(e) => {
                  const chart = chartApiRef.current;
                  const series = candleSeriesRef.current;
                  const wrap = chartWrapRef.current;
                  if (!chart || !series || !wrap) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const rect = wrap.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const logicalVal = chart.timeScale().coordinateToLogical(x);
                  const priceVal = series.coordinateToPrice(y);
                  if (logicalVal !== null && priceVal !== null && Number.isFinite(Number(priceVal))) {
                    setBrushStroke([{ logical: Number(logicalVal), price: Number(priceVal) }]);
                  }
                }}
                onPointerMove={(e) => {
                  if (!brushStroke) return;
                  const chart = chartApiRef.current;
                  const series = candleSeriesRef.current;
                  const wrap = chartWrapRef.current;
                  if (!chart || !series || !wrap) return;
                  const rect = wrap.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const logicalVal = chart.timeScale().coordinateToLogical(x);
                  const priceVal = series.coordinateToPrice(y);
                  if (logicalVal !== null && priceVal !== null && Number.isFinite(Number(priceVal))) {
                    setBrushStroke((prev) =>
                      prev ? [...prev, { logical: Number(logicalVal), price: Number(priceVal) }] : prev
                    );
                  }
                }}
                onPointerUp={() => {
                  if (brushStroke && brushStroke.length >= 2) {
                    setDrawings((prev) => [
                      ...prev,
                      { id: `${Date.now()}-${Math.random()}`, kind: 'brush', points: brushStroke },
                    ]);
                  }
                  setBrushStroke(null);
                  setActiveTool('crosshair');
                }}
              />
            )}

            {/* Projected Volume Profile + Glowing Price Beam + Interactive Drawing Overlay */}
            <PrimaryChartSvgOverlay
              renderTick={overlayRenderTick}
              chart={chartApiRef.current}
              candleSeries={candleSeriesRef.current}
              candles={latestCandlesRef.current}
              precision={symbolMeta.precision}
              showVolumeProfile={showVolumeProfile}
              drawings={drawings}
              draftAnchor={draftAnchor}
              hoverAnchor={hoverAnchor}
              brushStroke={brushStroke}
              activeTool={activeTool}
              themeMode={themeMode}
              livePrice={livePrice}
              isBullTick={isBullTick}
            />

            {/* Crosshair Price Tracking HUD */}
            <div className="pointer-events-none absolute top-2 left-24 right-16 z-10 flex flex-wrap items-center gap-2 text-[10px] font-mono-tabular">
              {crosshairReadout ? (
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-[var(--vp-header)]/95 border border-[var(--vp-border)] px-2.5 py-0.5 text-[var(--vp-text)] backdrop-blur-md shadow-md">
                  <span className="font-semibold text-[var(--vp-accent-text)]">
                    Track: ${formatTerminalPrice(crosshairReadout.price, symbolMeta.precision)}
                  </span>
                  {crosshairReadout.open !== undefined && (
                    <span className="text-[var(--vp-muted)]">
                      O:{crosshairReadout.open.toFixed(symbolMeta.precision)} H:
                      {crosshairReadout.high?.toFixed(symbolMeta.precision)} L:
                      {crosshairReadout.low?.toFixed(symbolMeta.precision)} C:
                      {crosshairReadout.close?.toFixed(symbolMeta.precision)}
                    </span>
                  )}
                  <span className="text-[var(--vp-muted)]">{crosshairReadout.timeLabel}</span>
                </div>
              ) : (
                activeTool !== 'crosshair' && (
                  <div className="inline-flex items-center gap-1.5 rounded bg-[#F0B90B] px-2 py-0.5 font-semibold text-[#0B0E11]">
                    {activeTool === 'hray'
                      ? 'Tap chart to place Horizontal Ray'
                      : activeTool === 'brush'
                        ? 'Drag on chart to draw freehand'
                        : activeTool === 'text'
                          ? 'Tap chart to pin Text Note'
                          : draftAnchor
                            ? `Tap Point 2 for ${activeTool === 'trendline' ? 'Trendline' : 'Fibonacci'}`
                            : `Tap Point 1 for ${activeTool === 'trendline' ? 'Trendline' : 'Fibonacci'}`}
                  </div>
                )
              )}
            </div>

            {/* Inline Text Note Input Popover */}
            {pendingTextAnchor && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = pendingTextValue.trim();
                  if (trimmed) {
                    setDrawings((prev) => [
                      ...prev,
                      {
                        id: `${Date.now()}-${Math.random()}`,
                        kind: 'text',
                        a: pendingTextAnchor,
                        text: trimmed,
                      },
                    ]);
                  }
                  setPendingTextAnchor(null);
                  setPendingTextValue('');
                  setActiveTool('crosshair');
                }}
                className="absolute top-11 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-lg border border-[#F0B90B]/60 bg-[var(--vp-header)] px-2.5 py-1.5 shadow-xl"
              >
                <input
                  type="text"
                  autoFocus
                  maxLength={32}
                  value={pendingTextValue}
                  onChange={(e) => setPendingTextValue(e.target.value)}
                  placeholder="Chart note (e.g. Buy OB)"
                  className="w-40 rounded bg-[var(--vp-control)] px-2 py-1 text-xs text-[var(--vp-text)] outline-none placeholder:text-[var(--vp-muted)]"
                />
                <button
                  type="submit"
                  className="rounded bg-[#F0B90B] px-2 py-1 text-[11px] font-bold text-[#0B0E11] cursor-pointer"
                >
                  Pin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingTextAnchor(null);
                    setActiveTool('crosshair');
                  }}
                  className="rounded bg-[var(--vp-control)] px-1.5 py-1 text-[11px] text-[var(--vp-muted)] cursor-pointer"
                >
                  ✕
                </button>
              </form>
            )}

            {/* Collapsible '✏️ Tools' Button + Drawing Toolbar */}
            <div className="absolute top-2.5 left-2 z-20 flex flex-col items-start gap-1.5">
              <button
                type="button"
                onClick={() => setToolsOpen((v) => !v)}
                aria-expanded={toolsOpen}
                aria-label="Toggle drawing tools"
                className={`vp-pill-btn inline-flex items-center gap-1 border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md shadow-lg cursor-pointer ${
                  toolsOpen || activeTool !== 'crosshair'
                    ? 'border-[#F59E0B]/70 bg-[var(--vp-header)] text-[var(--vp-accent-text)]'
                    : 'border-[var(--vp-border)] bg-[var(--vp-header)]/90 text-[var(--vp-text)] hover:border-[#F59E0B]/50'
                }`}
              >
                <span>✏️ Tools</span>
              </button>

              {toolsOpen && (
                <div
                  role="toolbar"
                  aria-label="Chart drawing and crosshair tools"
                  className="flex flex-col gap-1 rounded-xl border border-[var(--vp-border)] bg-[var(--vp-header)]/95 p-1 backdrop-blur-md shadow-xl"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTool('crosshair');
                      setDraftAnchor(null);
                      setHoverAnchor(null);
                    }}
                    title="Crosshair Price Tracking"
                    aria-label="Crosshair Price Tracking"
                    className={`vp-pill-btn flex h-7 w-7 items-center justify-center cursor-pointer ${
                      activeTool === 'crosshair'
                        ? 'bg-[#F59E0B] text-[#0B0E14] shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                        : 'bg-[var(--vp-control)] text-[var(--vp-text)] hover:opacity-85'
                    }`}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTool('trendline');
                      setDraftAnchor(null);
                    }}
                    title="Trendline Drawing"
                    aria-label="Trendline Drawing"
                    className={`vp-pill-btn flex h-7 w-7 items-center justify-center cursor-pointer ${
                      activeTool === 'trendline'
                        ? 'bg-[#F59E0B] text-[#0B0E14]'
                        : 'bg-[var(--vp-control)] text-[var(--vp-text)] hover:opacity-85'
                    }`}
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTool('hray');
                      setDraftAnchor(null);
                    }}
                    title="Horizontal Ray"
                    aria-label="Horizontal Ray"
                    className={`vp-pill-btn flex h-7 w-7 items-center justify-center cursor-pointer ${
                      activeTool === 'hray'
                        ? 'bg-[#38BDF8] text-[#0B0E14]'
                        : 'bg-[var(--vp-control)] text-[var(--vp-text)] hover:opacity-85'
                    }`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTool('fib');
                      setDraftAnchor(null);
                    }}
                    title="Fibonacci Retracement"
                    aria-label="Fibonacci Retracement"
                    className={`vp-pill-btn flex h-7 w-7 items-center justify-center text-[10px] font-bold cursor-pointer ${
                      activeTool === 'fib'
                        ? 'bg-[#F59E0B] text-[#0B0E14]'
                        : 'bg-[var(--vp-control)] text-[var(--vp-text)] hover:opacity-85'
                    }`}
                  >
                    Fib
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTool('brush');
                      setDraftAnchor(null);
                    }}
                    title="Brush Freehand Draw"
                    aria-label="Brush Freehand Draw"
                    className={`vp-pill-btn flex h-7 w-7 items-center justify-center cursor-pointer ${
                      activeTool === 'brush'
                        ? 'bg-[#089981] text-[#0B0E14]'
                        : 'bg-[var(--vp-control)] text-[var(--vp-text)] hover:opacity-85'
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTool('text');
                      setDraftAnchor(null);
                    }}
                    title="Text Note Annotation"
                    aria-label="Text Note Annotation"
                    className={`vp-pill-btn flex h-7 w-7 items-center justify-center cursor-pointer ${
                      activeTool === 'text'
                        ? 'bg-[#C084FC] text-[#0B0E14]'
                        : 'bg-[var(--vp-control)] text-[var(--vp-text)] hover:opacity-85'
                    }`}
                  >
                    <Type className="h-3.5 w-3.5" />
                  </button>
                  {drawings.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDrawings((prev) => prev.slice(0, -1))}
                        title="Undo Last Drawing"
                        aria-label="Undo Last Drawing"
                        className="vp-pill-btn flex h-7 w-7 items-center justify-center bg-[var(--vp-control)] text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawings([]);
                          setDraftAnchor(null);
                          setHoverAnchor(null);
                          setBrushStroke(null);
                        }}
                        title="Clear Drawings"
                        aria-label="Clear Drawings"
                        className="vp-pill-btn flex h-7 w-7 items-center justify-center bg-[var(--vp-control)] text-[var(--vp-bear)] hover:bg-[#F23645]/20 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Floating Bar Replay Simulator Controls */}
            {replayActive && (
              <div className="absolute top-9 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-1.5 rounded-full border border-[#F59E0B]/50 bg-[var(--vp-header)]/95 px-3 py-1.5 backdrop-blur-md shadow-xl">
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

            {/* History Loading / Inception Span Indicator + Floating Zoom Controls */}
            <div className="absolute bottom-8 left-2.5 right-14 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div
                role="group"
                aria-label="Chart zoom and history controls"
                className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--vp-border)] bg-[var(--vp-header)]/90 p-1 backdrop-blur-md shadow-lg"
              >
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  aria-label="Zoom In"
                  className="vp-pill-btn flex h-7 w-7 items-center justify-center bg-[var(--vp-control)] text-sm font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  aria-label="Zoom Out"
                  className="vp-pill-btn flex h-7 w-7 items-center justify-center bg-[var(--vp-control)] text-sm font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  title="Fit All Loaded History (Inception to Live)"
                  aria-label="Fit All Loaded History"
                  className="vp-pill-btn flex h-7 items-center justify-center bg-[var(--vp-control)] px-2.5 text-[11px] font-semibold text-[var(--vp-accent-text)] hover:opacity-85 cursor-pointer"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={handleJumpLive}
                  title="Snap to Live Candles"
                  aria-label="Snap to Live Candles"
                  className="vp-pill-btn flex h-7 items-center justify-center bg-[var(--vp-control)] px-2.5 text-[11px] font-semibold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
                >
                  Live
                </button>
              </div>

              {(isLoadingHistory || loadedSpanInfo) && (
                <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--vp-border)] bg-[var(--vp-header)]/90 px-2.5 py-1 text-[10px] font-mono-tabular text-[var(--vp-muted)] backdrop-blur-md shadow-lg">
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
                          className="vp-pill-btn bg-[#F59E0B]/15 border border-[#F59E0B]/45 px-2 py-0.5 text-[10px] font-bold text-[var(--vp-accent-text)] cursor-pointer hover:bg-[#F59E0B]/25"
                        >
                          1D Inception ({loadedSpanInfo.inceptionDate ?? 'Full'})
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
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
          {splitView && (
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

        {/* Compact Live Sidebar: OMYE + Smart Money Concepts + Auto Entry/TP/SL */}
        {!isFullScreen && (
        <aside
          aria-label="Live OMYE and Smart Money Concepts Sidebar"
          className="w-full lg:w-[315px] shrink-0 bg-[var(--vp-surface)] p-2.5 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5 lg:overflow-y-auto transition-colors duration-200"
        >
          {/* 1. Live Auto-Updating Entry / Target / Stop-Loss */}
          <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-2.5 flex flex-col justify-between shadow-sm transition-colors">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--vp-muted)]">
                Live Setup (1:2 R:R)
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
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
          <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-2.5 flex flex-col justify-between shadow-sm transition-colors">
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-[#089981] animate-pulse shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--vp-text)] truncate">
                  OMYE · 1m Engine
                </span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${
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
              {/* 1m Bull vs Bear Pressure Meter */}
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

          {/* 3. Smart Money Concepts (Order Blocks, FVG, BOS & Auto Levels) */}
          <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-2.5 flex flex-col justify-between shadow-sm transition-colors">
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

interface PrimaryChartSvgOverlayProps {
  renderTick: number;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick', Time> | null;
  candles: TerminalCandle[];
  precision: number;
  showVolumeProfile: boolean;
  drawings: ChartDrawing[];
  draftAnchor: ChartAnchor | null;
  hoverAnchor: ChartAnchor | null;
  brushStroke: ChartAnchor[] | null;
  activeTool: DrawingTool;
  themeMode: ThemeMode;
  livePrice: number | null;
  isBullTick: boolean;
}

const PrimaryChartSvgOverlay: React.FC<PrimaryChartSvgOverlayProps> = ({
  renderTick,
  chart,
  candleSeries,
  candles,
  precision,
  showVolumeProfile,
  drawings,
  draftAnchor,
  hoverAnchor,
  brushStroke,
  activeTool,
  themeMode,
  livePrice,
  isBullTick,
}) => {
  const projected = useMemo(() => {
    void renderTick;
    if (!chart || !candleSeries) return null;
    const pane = chart.paneSize(0);
    if (!pane || pane.width <= 0 || pane.height <= 0) return null;

    const ts = chart.timeScale();
    const plotRight = Math.max(40, pane.width - 2);

    const projectPt = (pt: ChartAnchor) => {
      const x = ts.logicalToCoordinate(pt.logical as Logical);
      const y = candleSeries.priceToCoordinate(pt.price);
      if (x === null || y === null) return null;
      return { x: Number(x), y: Number(y), price: pt.price };
    };

    const rawPriceY = livePrice !== null ? candleSeries.priceToCoordinate(livePrice) : null;
    const livePriceY =
      rawPriceY !== null && Number.isFinite(Number(rawPriceY)) ? Number(rawPriceY) : null;

    let vpBars: Array<{
      y: number;
      h: number;
      bullW: number;
      bearW: number;
      isPoc: boolean;
    }> = [];
    let pocY: number | null = null;
    let pocPrice: number | null = null;

    if (showVolumeProfile && candles.length > 0) {
      const range = ts.getVisibleLogicalRange();
      const fromIdx = range ? Math.max(0, Math.floor(range.from)) : 0;
      const toIdx = range ? Math.min(candles.length - 1, Math.ceil(range.to)) : candles.length - 1;
      const visible = candles.slice(fromIdx, toIdx + 1);
      const vp = computeVisibleVolumeProfile(visible.length > 0 ? visible : candles);
      pocPrice = vp.pocPrice;
      if (vp.pocPrice !== null) {
        const yPoc = candleSeries.priceToCoordinate(vp.pocPrice);
        if (yPoc !== null) pocY = Number(yPoc);
      }
      if (vp.maxVol > 0) {
        const maxWidth = Math.min(82, pane.width * 0.18);
        vpBars = vp.buckets
          .map((b) => {
            const yTop = candleSeries.priceToCoordinate(b.high);
            const yBot = candleSeries.priceToCoordinate(b.low);
            if (yTop === null || yBot === null) return null;
            const y = Math.min(Number(yTop), Number(yBot));
            const h = Math.max(2, Math.abs(Number(yBot) - Number(yTop)) - 1);
            return {
              y,
              h,
              bullW: (b.bullVol / vp.maxVol) * maxWidth,
              bearW: (b.bearVol / vp.maxVol) * maxWidth,
              isPoc: b.isPoc,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
      }
    }

    const activePreview: ChartDrawing | null =
      draftAnchor && hoverAnchor && (activeTool === 'trendline' || activeTool === 'fib')
        ? { id: 'preview', kind: activeTool, a: draftAnchor, b: hoverAnchor }
        : brushStroke && brushStroke.length >= 2
          ? { id: 'brush-preview', kind: 'brush', points: brushStroke }
          : null;

    const allDrawings = activePreview ? [...drawings, activePreview] : drawings;

    return {
      width: pane.width,
      height: pane.height,
      plotRight,
      livePriceY,
      vpBars,
      pocY,
      pocPrice,
      projectPt,
      allDrawings,
    };
  }, [
    renderTick,
    chart,
    candleSeries,
    candles,
    showVolumeProfile,
    drawings,
    draftAnchor,
    hoverAnchor,
    brushStroke,
    activeTool,
    livePrice,
  ]);

  if (!projected) return null;

  const liveColor = isBullTick ? '#089981' : '#F23645';

  return (
    <svg
      width={projected.width}
      height={projected.height}
      className="pointer-events-none absolute top-0 left-0 z-10 overflow-hidden"
    >
      <defs>
        <filter id="vpLivePriceGlow" x="-20%" y="-400%" width="140%" height="900%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Smooth Glowing Current-Price Line (60fps GPU-composited glide) */}
      {projected.livePriceY !== null &&
        projected.livePriceY >= 0 &&
        projected.livePriceY <= projected.height && (
          <g
            style={{
              transform: `translateY(${projected.livePriceY}px)`,
              transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <line
              x1={0}
              y1={0}
              x2={projected.plotRight}
              y2={0}
              stroke={liveColor}
              strokeOpacity={0.34}
              strokeWidth={3.5}
              filter="url(#vpLivePriceGlow)"
            />
            <line
              x1={0}
              y1={0}
              x2={projected.plotRight}
              y2={0}
              stroke={liveColor}
              strokeOpacity={0.95}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <circle
              cx={Math.max(8, projected.plotRight - 5)}
              cy={0}
              r={5.5}
              fill={liveColor}
              fillOpacity={0.25}
            />
            <circle
              cx={Math.max(8, projected.plotRight - 5)}
              cy={0}
              r={2.5}
              fill={liveColor}
            />
          </g>
        )}

      {/* Visible Range Volume Profile */}
      {projected.vpBars.map((bar, idx) => (
        <g key={`vp-${idx}`}>
          {bar.bearW > 0 && (
            <rect
              x={projected.plotRight - bar.bullW - bar.bearW}
              y={bar.y}
              width={bar.bearW}
              height={bar.h}
              fill={bar.isPoc ? 'rgba(240, 185, 11, 0.55)' : 'rgba(246, 70, 93, 0.34)'}
            />
          )}
          {bar.bullW > 0 && (
            <rect
              x={projected.plotRight - bar.bullW}
              y={bar.y}
              width={bar.bullW}
              height={bar.h}
              fill={bar.isPoc ? 'rgba(240, 185, 11, 0.72)' : 'rgba(0, 192, 135, 0.38)'}
            />
          )}
        </g>
      ))}
      {projected.pocY !== null && projected.pocPrice !== null && (
        <g>
          <line
            x1={0}
            y1={projected.pocY}
            x2={projected.plotRight}
            y2={projected.pocY}
            stroke="#F0B90B"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text
            x={projected.plotRight - 4}
            y={projected.pocY - 3}
            textAnchor="end"
            fill="#F0B90B"
            fontSize="10"
            fontWeight="700"
          >
            POC {projected.pocPrice.toFixed(precision)}
          </text>
        </g>
      )}

      {/* User Drawings: Trendlines, Horizontal Rays, Fib, Brush & Text Notes */}
      {projected.allDrawings.map((d) => {
        if (d.kind === 'brush') {
          const pts = d.points
            .map(projected.projectPt)
            .filter((p): p is NonNullable<typeof p> => p !== null);
          if (pts.length < 2) return null;
          return (
            <polyline
              key={d.id}
              fill="none"
              stroke="#00C087"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            />
          );
        }

        const isPreview = d.id === 'preview';
        const p1 = projected.projectPt(d.a);
        if (!p1) return null;

        if (d.kind === 'text') {
          return (
            <g key={d.id}>
              <circle cx={p1.x} cy={p1.y} r={3} fill="#C084FC" />
              <rect
                x={p1.x + 6}
                y={p1.y - 16}
                width={Math.max(44, d.text.length * 6.8 + 12)}
                height={18}
                rx={4}
                fill={themeMode === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(22, 26, 30, 0.92)'}
                stroke="#C084FC"
                strokeWidth={1}
              />
              <text
                x={p1.x + 12}
                y={p1.y - 4}
                fill={themeMode === 'light' ? '#0F172A' : '#EAECEF'}
                fontSize="10"
                fontWeight="600"
              >
                {d.text}
              </text>
            </g>
          );
        }

        if (d.kind === 'hray') {
          return (
            <g key={d.id}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={projected.plotRight}
                y2={p1.y}
                stroke="#38BDF8"
                strokeWidth={1.6}
              />
              <circle cx={p1.x} cy={p1.y} r={3} fill="#38BDF8" />
              <text
                x={projected.plotRight - 4}
                y={p1.y - 4}
                textAnchor="end"
                fill="#38BDF8"
                fontSize="10"
                fontWeight="700"
              >
                Ray {p1.price.toFixed(precision)}
              </text>
            </g>
          );
        }

        const p2 = projected.projectPt(d.b);
        if (!p2) return null;

        if (d.kind === 'trendline') {
          return (
            <g key={d.id}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#F0B90B"
                strokeWidth={2}
                strokeDasharray={isPreview ? '5 4' : undefined}
              />
              <circle cx={p1.x} cy={p1.y} r={3.5} fill="#F0B90B" />
              <circle cx={p2.x} cy={p2.y} r={3.5} fill="#F0B90B" />
            </g>
          );
        }

        // Fibonacci Retracement
        const xLeft = Math.min(p1.x, p2.x);
        const xRight = Math.max(p1.x, p2.x, xLeft + 110);
        const diffPrice = d.b.price - d.a.price;

        return (
          <g key={d.id}>
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="rgba(240, 185, 11, 0.65)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {FIB_LEVELS.map((lvl) => {
              const lvlPrice = d.b.price - diffPrice * lvl.ratio;
              const lvlY = candleSeries?.priceToCoordinate(lvlPrice);
              if (lvlY === null || lvlY === undefined) return null;
              const yNum = Number(lvlY);
              return (
                <g key={`${d.id}-${lvl.ratio}`}>
                  <line
                    x1={xLeft}
                    y1={yNum}
                    x2={xRight}
                    y2={yNum}
                    stroke={lvl.color}
                    strokeWidth={lvl.ratio === 0.618 || lvl.ratio === 0.5 ? 1.5 : 1}
                    strokeDasharray={isPreview ? '4 3' : undefined}
                  />
                  <text
                    x={xLeft + 4}
                    y={yNum - 3}
                    fill={lvl.color}
                    fontSize="10"
                    fontWeight="600"
                  >
                    {lvl.label} ({lvlPrice.toFixed(precision)})
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
};

interface SecondarySplitChartProps {
  defaultSymbol: SmcSymbol;
  defaultTimeframe: SmcTimeframe;
  showEma20: boolean;
  showEma50: boolean;
  showBollinger: boolean;
  themeMode: ThemeMode;
}

const SecondarySplitChart: React.FC<SecondarySplitChartProps> = ({
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

  const subMeta = SYMBOL_OPTIONS.find((s) => s.value === subSymbol) ?? SYMBOL_OPTIONS[2];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const initialSubTheme = getChartThemeOptions(themeMode);

    const chart = createChart(el, {
      width: el.clientWidth || 300,
      height: el.clientHeight || 320,
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
        barSpacing: 6,
        minBarSpacing: 0.2,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
      },
      rightPriceScale: {
        visible: true,
        autoScale: true,
        ...initialSubTheme.rightPriceScale,
        ticksVisible: false,
        entireTextOnly: true,
        alignLabels: true,
        minimumWidth: 48,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#F23645',
      borderUpColor: '#089981',
      borderDownColor: '#F23645',
      wickUpColor: '#089981',
      wickDownColor: '#F23645',
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
        chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
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
      ema20Ref.current?.setData(showEma20 ? calcEmaPoints(bars, 20) : []);
      ema50Ref.current?.applyOptions({ visible: showEma50 });
      ema50Ref.current?.setData(showEma50 ? calcEmaPoints(bars, 50) : []);
      bbUpRef.current?.applyOptions({ visible: showBollinger });
      bbLowRef.current?.applyOptions({ visible: showBollinger });
      if (showBollinger) {
        const bb = calcBollingerPoints(bars, 20, 2);
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

    // Clear old candles and indicators on secondary chart timeframe/symbol switch
    subHistoricalLoadedRef.current = false;
    candlesRef.current = [];
    candleRef.current?.setData([]);
    ema20Ref.current?.setData([]);
    ema50Ref.current?.setData([]);
    bbUpRef.current?.setData([]);
    bbLowRef.current?.setData([]);

    const applyBar = (bar: TerminalCandle) => {
      if (disposed || !candleRef.current || !subHistoricalLoadedRef.current) return;
      const arr = candlesRef.current;
      if (arr.length > 0 && bar.time < arr[arr.length - 1].time) return;
      candleRef.current.update(toPureCandle(bar));
      if (arr.length > 0 && arr[arr.length - 1].time === bar.time) {
        arr[arr.length - 1] = bar;
      } else if (arr.length === 0 || bar.time > arr[arr.length - 1].time) {
        arr.push(bar);
      }
      setSubPrice(bar.close);
      setSubBull(bar.close >= bar.open);
      syncSubIndicatorsRef.current(arr);
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
        setSubPrice(bars[bars.length - 1].close);
        setSubBull(bars[bars.length - 1].close >= bars[bars.length - 1].open);

        const applySubRange = () => {
          const chart = chartRef.current;
          if (!chart || disposed) return;
          chart.priceScale('right').applyOptions({ autoScale: true });
          const chartWidth = wrapRef.current?.clientWidth || 320;
          const visibleBars = Math.max(45, Math.min(bars.length, Math.floor(chartWidth / 6)));
          if (bars.length > visibleBars) {
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(0, bars.length - visibleBars),
              to: bars.length - 1 + 5,
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
      ws?.close();
    };
  }, [subSymbol, subTf, subMeta.isCrypto]);

  const zoomSecondary = (factor: number) => {
    const ts = chartRef.current?.timeScale();
    const range = ts?.getVisibleLogicalRange();
    if (!ts || !range) return;
    const span = range.to - range.from;
    const maxSpan = Math.max(180, candlesRef.current.length + 20);
    const nextSpan = Math.max(10, Math.min(maxSpan, span * factor));
    ts.setVisibleLogicalRange({ from: range.to - nextSpan, to: range.to });
  };

  return (
    <div className="relative flex flex-col h-[320px] sm:h-[380px] lg:h-full min-w-0 bg-[var(--vp-canvas)] transition-colors duration-200">
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

      <div className="relative flex-1 min-h-0">
        <div ref={wrapRef} className="smc-chart-host touch-none w-full h-full" />
        <div className="absolute bottom-8 left-2.5 z-10 flex items-center gap-1 rounded-full border border-[var(--vp-border)] bg-[var(--vp-header)]/90 p-1 backdrop-blur-md shadow-lg">
          <button
            type="button"
            onClick={() => zoomSecondary(0.72)}
            aria-label="Secondary Zoom In"
            className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[var(--vp-control)] text-xs font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomSecondary(1.38)}
            aria-label="Secondary Zoom Out"
            className="vp-pill-btn flex h-6 w-6 items-center justify-center bg-[var(--vp-control)] text-xs font-bold text-[var(--vp-text)] hover:opacity-85 cursor-pointer"
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
            className="vp-pill-btn flex h-6 items-center justify-center bg-[var(--vp-control)] px-2 text-[10px] font-semibold text-[var(--vp-accent-text)] hover:opacity-85 cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

