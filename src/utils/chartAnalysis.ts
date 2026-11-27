import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';

export interface TerminalCandle extends CandlestickData<UTCTimestamp> {
  volume?: number;
}

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

export interface DetectedPatternInfo {
  name: string;
  bias: 'Bullish' | 'Bearish' | 'Breakout';
}

export interface CandlestickPatternInfo {
  name: 'Bullish Engulfing' | 'Bearish Engulfing' | 'Bullish Pin Bar' | 'Bearish Pin Bar';
  shortTag: string;
  bias: 'Bullish' | 'Bearish';
  time: UTCTimestamp;
  price: number;
  position: 'above' | 'below';
}

export interface DiagonalTrendline {
  kind: 'support' | 'resistance';
  points: Array<{ time: UTCTimestamp; price: number }>;
  color: string;
}

export interface LiquiditySweepItem {
  time: UTCTimestamp;
  wickPrice: number;
  sweptLevel: number;
  direction: 'bull' | 'bear';
  label: string;
  color: string;
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
  candlestickPattern: CandlestickPatternInfo | null;
  latestLiquiditySweep: LiquiditySweepItem | null;
  orderBlock: ZoneRange | null;
  fvg: ZoneRange | null;
  bosCount: number;
  chochCount: number;
  entry: number;
  tp: number;
  sl: number;
}

export interface SwingMarkerItem {
  time: UTCTimestamp;
  price: number;
  position: 'above' | 'below';
  label: 'HH' | 'HL' | 'LH' | 'LL';
  color: string;
}

export interface StructureBreakSegment {
  t1: UTCTimestamp;
  t2: UTCTimestamp;
  price: number;
  kind: 'BOS' | 'CHoCH';
  direction: 'bull' | 'bear';
  color: string;
}

export interface SupportResistanceLevel {
  label: 'S1' | 'S2' | 'R1' | 'R2';
  kind: 'support' | 'resistance';
  price: number;
  startTime: UTCTimestamp;
  endTime: UTCTimestamp;
  touches: number;
  color: string;
}

export interface PatternGeometry {
  info: DetectedPatternInfo;
  lines: Array<{
    points: Array<{ time: UTCTimestamp; price: number }>;
    color: string;
    dashed?: boolean;
    width?: number;
  }>;
  badgePoint: { time: UTCTimestamp; price: number; position: 'above' | 'below' };
}

export interface OrderBlockOverlay {
  type: 'Bullish' | 'Bearish';
  startTime: UTCTimestamp;
  endTime: UTCTimestamp;
  low: number;
  high: number;
  mitigated: boolean;
}

export interface FvgOverlay {
  type: 'Bullish' | 'Bearish';
  startTime: UTCTimestamp;
  endTime: UTCTimestamp;
  low: number;
  high: number;
  mitigated: boolean;
}

export interface ChartStructureOverlayData {
  smc: SmcAnalysisState;
  swings: SwingMarkerItem[];
  breaks: StructureBreakSegment[];
  srLevels: SupportResistanceLevel[];
  diagonalTrendlines: DiagonalTrendline[];
  liquiditySweeps: LiquiditySweepItem[];
  candlestickPattern: CandlestickPatternInfo | null;
  pattern: PatternGeometry | null;
  orderBlocks: OrderBlockOverlay[];
  fvgs: FvgOverlay[];
}

export interface VolumeProfileBucket {
  low: number;
  high: number;
  bullVol: number;
  bearVol: number;
  totalVol: number;
  isPoc: boolean;
}

export function sanitizeCandles(raw: TerminalCandle[], intervalSec?: number): TerminalCandle[] {
  const byTime = new Map<number, TerminalCandle>();
  for (const c of raw) {
    if (
      !Number.isFinite(c.time) ||
      c.time <= 0 ||
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low) ||
      !Number.isFinite(c.close) ||
      c.open <= 0 ||
      c.high <= 0 ||
      c.low <= 0 ||
      c.close <= 0
    ) {
      continue;
    }
    const rawT = Number(c.time);
    const alignedT =
      intervalSec && intervalSec > 0 ? Math.floor(rawT / intervalSec) * intervalSec : rawT;
    const clampedHigh = Math.max(c.high, c.open, c.close);
    const clampedLow = Math.min(c.low, c.open, c.close);
    const existing = byTime.get(alignedT);

    if (!existing) {
      byTime.set(alignedT, {
        time: alignedT as UTCTimestamp,
        open: c.open,
        high: clampedHigh,
        low: clampedLow,
        close: c.close,
        ...(typeof c.volume === 'number' && Number.isFinite(c.volume) && c.volume >= 0
          ? { volume: c.volume }
          : {}),
      });
    } else {
      existing.high = Math.max(existing.high, clampedHigh);
      existing.low = Math.min(existing.low, clampedLow);
      existing.close = c.close;
      if (typeof c.volume === 'number' && Number.isFinite(c.volume) && c.volume >= 0) {
        existing.volume = (existing.volume ?? 0) + c.volume;
      }
    }
  }

  const sorted = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.open !== prev.close) {
      curr.open = prev.close;
      curr.high = Math.max(curr.high, curr.open, curr.close);
      curr.low = Math.min(curr.low, curr.open, curr.close);
    }
  }
  return sorted;
}

/**
 * TradingView-calibrated EMA seeded with SMA over the first `period` bars
 * (or progressive SMA warmup if fewer than `period` bars are loaded).
 */
export function calcEmaSeries(
  candles: TerminalCandle[],
  period: number
): Array<{ time: UTCTimestamp; value: number }> {
  const n = candles.length;
  if (n === 0) return [];
  const k = 2 / (period + 1);
  const out: Array<{ time: UTCTimestamp; value: number }> = [];

  if (n < period) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      sum += candles[i].close;
      out.push({ time: candles[i].time, value: sum / (i + 1) });
    }
    return out;
  }

  let smaSum = 0;
  for (let i = 0; i < period; i += 1) {
    smaSum += candles[i].close;
  }
  let ema = smaSum / period;
  out.push({ time: candles[period - 1].time, value: ema });

  for (let i = period; i < n; i += 1) {
    ema = candles[i].close * k + ema * (1 - k);
    out.push({ time: candles[i].time, value: ema });
  }
  return out;
}

/**
 * O(N) Sliding-Window Bollinger Bands (SMA20 +/- 2*stdev)
 */
export function calcBollingerSeries(candles: TerminalCandle[], period = 20, mult = 2) {
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
    if (i >= period - 1) {
      const mean = sum / period;
      const variance = Math.max(0, sumSq / period - mean * mean);
      const std = Math.sqrt(variance);
      basis.push({ time: candles[i].time, value: mean });
      upper.push({ time: candles[i].time, value: mean + mult * std });
      lower.push({ time: candles[i].time, value: mean - mult * std });
    }
  }
  return { upper, basis, lower };
}

/**
 * Wilder's Smoothed RSI(14)
 */
export function calcRsiSeries(
  candles: TerminalCandle[],
  period = 14
): Array<{ time: UTCTimestamp; value: number }> {
  if (candles.length <= period) return [];
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

export function computeVisibleVolumeProfile(
  visibleCandles: TerminalCandle[],
  bucketCount = 24
): {
  buckets: VolumeProfileBucket[];
  maxVol: number;
  pocPrice: number | null;
  vahPrice: number | null;
  valPrice: number | null;
} {
  if (visibleCandles.length === 0) {
    return { buckets: [], maxVol: 0, pocPrice: null, vahPrice: null, valPrice: null };
  }
  let minLow = Infinity;
  let maxHigh = -Infinity;
  for (const c of visibleCandles) {
    if (c.low < minLow) minLow = c.low;
    if (c.high > maxHigh) maxHigh = c.high;
  }
  if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh) || maxHigh <= minLow) {
    return { buckets: [], maxVol: 0, pocPrice: null, vahPrice: null, valPrice: null };
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

  // Estimate consistent volume scale so live tick bars without feed volume align cleanly with historical bars
  const volPerRangeSamples: number[] = [];
  for (const c of visibleCandles) {
    if (c.volume && c.volume > 0) {
      const r = Math.max(step * 0.25, c.high - c.low);
      volPerRangeSamples.push(c.volume / r);
    }
  }
  volPerRangeSamples.sort((a, b) => a - b);
  const medianVolDensity =
    volPerRangeSamples.length > 0
      ? volPerRangeSamples[Math.floor(volPerRangeSamples.length / 2)]
      : 100;

  let totalProfileVol = 0;
  for (const c of visibleCandles) {
    const candleRange = Math.max(step * 0.25, c.high - c.low);
    const bodyLow = Math.min(c.open, c.close);
    const bodyHigh = Math.max(c.open, c.close);
    const rawVol =
      c.volume && c.volume > 0
        ? c.volume
        : Math.max(1, candleRange * medianVolDensity);
    const isBull = c.close >= c.open;

    const fullStart = Math.max(0, Math.min(bucketCount - 1, Math.floor((c.low - minLow) / step)));
    const fullEnd = Math.max(fullStart, Math.min(bucketCount - 1, Math.floor((c.high - minLow) / step)));
    const bodyStart = Math.max(fullStart, Math.min(fullEnd, Math.floor((bodyLow - minLow) / step)));
    const bodyEnd = Math.max(bodyStart, Math.min(fullEnd, Math.floor((bodyHigh - minLow) / step)));

    const fullSpan = fullEnd - fullStart + 1;
    const bodySpan = bodyEnd - bodyStart + 1;
    const wickVolPerBucket = (rawVol * 0.35) / fullSpan;
    const bodyVolPerBucket = (rawVol * 0.65) / bodySpan;

    for (let b = fullStart; b <= fullEnd; b += 1) {
      const addVol = wickVolPerBucket + (b >= bodyStart && b <= bodyEnd ? bodyVolPerBucket : 0);
      if (isBull) buckets[b].bullVol += addVol;
      else buckets[b].bearVol += addVol;
      buckets[b].totalVol += addVol;
      totalProfileVol += addVol;
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

  // Compute 70% Value Area High / Low around POC
  let vaLowIdx = pocIdx;
  let vaHighIdx = pocIdx;
  let accumVol = buckets[pocIdx]?.totalVol ?? 0;
  const targetVol = totalProfileVol * 0.7;
  while (accumVol < targetVol && (vaLowIdx > 0 || vaHighIdx < bucketCount - 1)) {
    const downVol = vaLowIdx > 0 ? buckets[vaLowIdx - 1].totalVol : -1;
    const upVol = vaHighIdx < bucketCount - 1 ? buckets[vaHighIdx + 1].totalVol : -1;
    if (upVol >= downVol && vaHighIdx < bucketCount - 1) {
      vaHighIdx += 1;
      accumVol += buckets[vaHighIdx].totalVol;
    } else if (vaLowIdx > 0) {
      vaLowIdx -= 1;
      accumVol += buckets[vaLowIdx].totalVol;
    } else {
      break;
    }
  }

  return {
    buckets,
    maxVol,
    pocPrice,
    vahPrice: buckets[vaHighIdx]?.high ?? null,
    valPrice: buckets[vaLowIdx]?.low ?? null,
  };
}

export function computeOmyeSnapshot(
  candles: TerminalCandle[],
  streamStatus: 'LIVE 1m WS' | 'SYNCING'
): OmyeEngineState | null {
  if (candles.length < 16) return null;
  const recent = candles.slice(-30);
  const closes = recent.map((c) => c.close);
  const last = recent[recent.length - 1];
  const prevClose = recent[Math.max(0, recent.length - 6)].close;

  const calcLastEma = (vals: number[], period: number) => {
    const k = 2 / (period + 1);
    let ema = vals[0];
    for (let i = 1; i < vals.length; i += 1) {
      ema = vals[i] * k + ema * (1 - k);
    }
    return ema;
  };
  const ema9 = calcLastEma(closes, 9);
  const ema21 = calcLastEma(closes, 21);

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

/**
 * Computes institutional Market Structure (HH/HL/LH/LL, BOS/CHoCH),
 * cluster-based Support/Resistance, Order Blocks, FVG, and Chart Patterns
 * purely from actual OHLC candle data.
 */
export function analyzeChartStructure(rawCandles: TerminalCandle[]): ChartStructureOverlayData | null {
  if (rawCandles.length < 14) return null;

  // Analyze up to recent 500 bars for responsive 60fps structure + pattern recognition
  const candles = rawCandles.length > 500 ? rawCandles.slice(-500) : rawCandles;
  const latestIdx = candles.length - 1;
  const latestBar = candles[latestIdx];
  const lastClose = latestBar.close;

  const pivotLen = 4;
  const swings: SwingMarkerItem[] = [];
  const breaks: StructureBreakSegment[] = [];
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
        const label: 'HH' | 'LH' =
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

        swings.push({
          time: pt.time,
          price: pt.price,
          position: 'above',
          label,
          color: label === 'HH' ? '#089981' : '#F59E0B',
        });
      }

      if (isLow) {
        const label: 'HL' | 'LL' =
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

        swings.push({
          time: pt.time,
          price: pt.price,
          position: 'below',
          label,
          color: label === 'LL' ? '#F23645' : '#089981',
        });
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
      breaks.push({
        t1: activeHigh.time,
        t2: barTime,
        price: activeHigh.price,
        kind: isChoch ? 'CHoCH' : 'BOS',
        direction: 'bull',
        color: '#089981',
      });
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
      breaks.push({
        t1: activeLow.time,
        t2: barTime,
        price: activeLow.price,
        kind: isChoch ? 'CHoCH' : 'BOS',
        direction: 'bear',
        color: '#F23645',
      });
    }
  }

  // Support & Resistance clustering from confirmed pivots
  const recentWindow = candles.slice(-80);
  const minLowBar = recentWindow.reduce((a, b) => (b.low < a.low ? b : a), recentWindow[0]);
  const maxHighBar = recentWindow.reduce((a, b) => (b.high > a.high ? b : a), recentWindow[0]);

  const tol = Math.max(0.0001, lastClose * 0.0028);
  const clusterPivots = (pts: PivotPoint[]) => {
    const clusters: Array<{ price: number; startTime: UTCTimestamp; touches: number; latestIdx: number }> = [];
    for (const pt of pts) {
      const match = clusters.find((c) => Math.abs(c.price - pt.price) <= tol);
      if (match) {
        match.price = (match.price * match.touches + pt.price) / (match.touches + 1);
        match.touches += 1;
        if (pt.idx > match.latestIdx) match.latestIdx = pt.idx;
      } else {
        clusters.push({ price: pt.price, startTime: pt.time, touches: 1, latestIdx: pt.idx });
      }
    }
    return clusters;
  };

  const supportClusters = clusterPivots(pivotLows.filter((p) => p.price <= lastClose * 1.002))
    .sort((a, b) => b.touches * 1000 + b.latestIdx - (a.touches * 1000 + a.latestIdx));
  const resClusters = clusterPivots(pivotHighs.filter((p) => p.price >= lastClose * 0.998))
    .sort((a, b) => b.touches * 1000 + b.latestIdx - (a.touches * 1000 + a.latestIdx));

  const srLevels: SupportResistanceLevel[] = [];
  const s1 = supportClusters[0] ?? {
    price: minLowBar.low,
    startTime: minLowBar.time,
    touches: 1,
    latestIdx: Math.max(0, latestIdx - 25),
  };
  srLevels.push({
    label: 'S1',
    kind: 'support',
    price: s1.price,
    startTime: s1.startTime,
    endTime: latestBar.time,
    touches: s1.touches,
    color: '#00E5FF',
  });

  const s2 =
    supportClusters.find((c) => Math.abs(c.price - s1.price) > tol * 1.15) ??
    (Math.abs(minLowBar.low - s1.price) > tol * 1.15
      ? {
          price: minLowBar.low,
          startTime: minLowBar.time,
          touches: 1,
          latestIdx: Math.max(0, latestIdx - 25),
        }
      : undefined);
  if (s2) {
    srLevels.push({
      label: 'S2',
      kind: 'support',
      price: s2.price,
      startTime: s2.startTime,
      endTime: latestBar.time,
      touches: s2.touches,
      color: '#00E5FF',
    });
  }

  const r1 = resClusters[0] ?? {
    price: maxHighBar.high,
    startTime: maxHighBar.time,
    touches: 1,
    latestIdx: Math.max(0, latestIdx - 25),
  };
  srLevels.push({
    label: 'R1',
    kind: 'resistance',
    price: r1.price,
    startTime: r1.startTime,
    endTime: latestBar.time,
    touches: r1.touches,
    color: '#FF4D6D',
  });

  const r2 = resClusters.find((c) => Math.abs(c.price - r1.price) > tol * 1.3);
  if (r2) {
    srLevels.push({
      label: 'R2',
      kind: 'resistance',
      price: r2.price,
      startTime: r2.startTime,
      endTime: latestBar.time,
      touches: r2.touches,
      color: '#FF4D6D',
    });
  }

  // Chart Patterns: H&S, Double Top/Bottom, Triangles, Wedges, Channels
  let pattern: PatternGeometry | null = null;
  if (pivotHighs.length >= 3 && pivotLows.length >= 2) {
    const h1 = pivotHighs[pivotHighs.length - 3];
    const h2 = pivotHighs[pivotHighs.length - 2];
    const h3 = pivotHighs[pivotHighs.length - 1];
    const nl1 = pivotLows.find((l) => l.idx > h1.idx && l.idx < h2.idx);
    const nl2 = pivotLows.find((l) => l.idx > h2.idx && l.idx < h3.idx);
    const shoulderDiff = Math.abs(h1.price - h3.price) / Math.max(0.0001, h2.price);
    if (
      nl1 &&
      nl2 &&
      h2.price > h1.price * 1.0015 &&
      h2.price > h3.price * 1.0015 &&
      shoulderDiff <= 0.009 &&
      h3.idx >= latestIdx - 55
    ) {
      const necklineAvg = (nl1.price + nl2.price) / 2;
      pattern = {
        info: { name: 'Head & Shoulders', bias: 'Bearish' },
        lines: [
          {
            points: [
              { time: h1.time, price: h1.price },
              { time: nl1.time, price: nl1.price },
              { time: h2.time, price: h2.price },
              { time: nl2.time, price: nl2.price },
              { time: h3.time, price: h3.price },
            ],
            color: '#F59E0B',
            width: 2,
          },
          {
            points: [
              { time: nl1.time, price: nl1.price },
              { time: nl2.time, price: nl2.price },
              { time: latestBar.time, price: necklineAvg },
            ],
            color: '#F23645',
            dashed: true,
            width: 1.5,
          },
        ],
        badgePoint: { time: h2.time, price: h2.price, position: 'above' },
      };
    }
  }

  if (!pattern && pivotLows.length >= 3 && pivotHighs.length >= 2) {
    const l1 = pivotLows[pivotLows.length - 3];
    const l2 = pivotLows[pivotLows.length - 2];
    const l3 = pivotLows[pivotLows.length - 1];
    const nh1 = pivotHighs.find((h) => h.idx > l1.idx && h.idx < l2.idx);
    const nh2 = pivotHighs.find((h) => h.idx > l2.idx && h.idx < l3.idx);
    const shoulderDiff = Math.abs(l1.price - l3.price) / Math.max(0.0001, l2.price);
    if (
      nh1 &&
      nh2 &&
      l2.price < l1.price * 0.9985 &&
      l2.price < l3.price * 0.9985 &&
      shoulderDiff <= 0.009 &&
      l3.idx >= latestIdx - 55
    ) {
      const necklineAvg = (nh1.price + nh2.price) / 2;
      pattern = {
        info: { name: 'Inv. Head & Shoulders', bias: 'Bullish' },
        lines: [
          {
            points: [
              { time: l1.time, price: l1.price },
              { time: nh1.time, price: nh1.price },
              { time: l2.time, price: l2.price },
              { time: nh2.time, price: nh2.price },
              { time: l3.time, price: l3.price },
            ],
            color: '#F59E0B',
            width: 2,
          },
          {
            points: [
              { time: nh1.time, price: nh1.price },
              { time: nh2.time, price: nh2.price },
              { time: latestBar.time, price: necklineAvg },
            ],
            color: '#089981',
            dashed: true,
            width: 1.5,
          },
        ],
        badgePoint: { time: l2.time, price: l2.price, position: 'below' },
      };
    }
  }

  if (!pattern && pivotHighs.length >= 2 && pivotLows.length >= 2) {
    const h1 = pivotHighs[pivotHighs.length - 2];
    const h2 = pivotHighs[pivotHighs.length - 1];
    const l1 = pivotLows[pivotLows.length - 2];
    const l2 = pivotLows[pivotLows.length - 1];

    const highDiffPct = Math.abs(h2.price - h1.price) / Math.max(0.0001, h1.price);
    const lowDiffPct = Math.abs(l2.price - l1.price) / Math.max(0.0001, l1.price);
    const midLow = pivotLows.find((l) => l.idx > h1.idx && l.idx < h2.idx);
    const midHigh = pivotHighs.find((h) => h.idx > l1.idx && h.idx < l2.idx);

    if (highDiffPct <= 0.0055 && midLow && h2.idx >= latestIdx - 42) {
      pattern = {
        info: { name: 'Double Top (M)', bias: 'Bearish' },
        lines: [
          {
            points: [
              { time: h1.time, price: h1.price },
              { time: midLow.time, price: midLow.price },
              { time: h2.time, price: h2.price },
              { time: latestBar.time, price: lastClose },
            ],
            color: '#F59E0B',
            width: 2,
          },
          {
            points: [
              { time: midLow.time, price: midLow.price },
              { time: latestBar.time, price: midLow.price },
            ],
            color: '#F23645',
            dashed: true,
            width: 1.5,
          },
        ],
        badgePoint: { time: h2.time, price: h2.price, position: 'above' },
      };
    } else if (lowDiffPct <= 0.0055 && midHigh && l2.idx >= latestIdx - 42) {
      pattern = {
        info: { name: 'Double Bottom (W)', bias: 'Bullish' },
        lines: [
          {
            points: [
              { time: l1.time, price: l1.price },
              { time: midHigh.time, price: midHigh.price },
              { time: l2.time, price: l2.price },
              { time: latestBar.time, price: lastClose },
            ],
            color: '#F59E0B',
            width: 2,
          },
          {
            points: [
              { time: midHigh.time, price: midHigh.price },
              { time: latestBar.time, price: midHigh.price },
            ],
            color: '#089981',
            dashed: true,
            width: 1.5,
          },
        ],
        badgePoint: { time: l2.time, price: l2.price, position: 'below' },
      };
    }
  }

  // Bull / Bear Flag Detection (Strong impulse pole followed by tight counter-trend consolidation channel)
  if (!pattern && candles.length >= 28) {
    const flagLen = 10;
    const poleEndIdx = candles.length - flagLen;
    const poleStartIdx = Math.max(0, poleEndIdx - 12);
    const poleSlice = candles.slice(poleStartIdx, poleEndIdx + 1);
    const flagSlice = candles.slice(poleEndIdx);
    if (poleSlice.length >= 6 && flagSlice.length >= 6) {
      const poleLow = poleSlice.reduce((m, b) => Math.min(m, b.low), Infinity);
      const poleHigh = poleSlice.reduce((m, b) => Math.max(m, b.high), -Infinity);
      const poleRange = poleHigh - poleLow;
      const flagLow = flagSlice.reduce((m, b) => Math.min(m, b.low), Infinity);
      const flagHigh = flagSlice.reduce((m, b) => Math.max(m, b.high), -Infinity);
      const flagHeight = flagHigh - flagLow;
      const poleBull = poleSlice[poleSlice.length - 1].close > poleSlice[0].open;
      const poleBear = poleSlice[poleSlice.length - 1].close < poleSlice[0].open;
      const flagStart = flagSlice[0];
      const flagEnd = flagSlice[flagSlice.length - 1];
      const isTightChannel = poleRange > lastClose * 0.0022 && flagHeight > 0 && flagHeight <= poleRange * 0.48;

      if (isTightChannel && poleBull && flagLow >= poleLow + poleRange * 0.45 && flagEnd.close <= flagHigh) {
        pattern = {
          info: { name: 'Bull Flag', bias: 'Bullish' },
          lines: [
            {
              points: [
                { time: poleSlice[0].time, price: poleLow },
                { time: flagStart.time, price: poleHigh },
              ],
              color: '#089981',
              width: 2,
            },
            {
              points: [
                { time: flagStart.time, price: flagHigh },
                { time: flagEnd.time, price: flagHigh * 0.9992 },
              ],
              color: '#089981',
              dashed: true,
              width: 1.5,
            },
            {
              points: [
                { time: flagStart.time, price: flagLow },
                { time: flagEnd.time, price: flagLow * 0.9992 },
              ],
              color: '#089981',
              dashed: true,
              width: 1.5,
            },
          ],
          badgePoint: { time: flagStart.time, price: flagHigh, position: 'above' },
        };
      } else if (isTightChannel && poleBear && flagHigh <= poleHigh - poleRange * 0.45 && flagEnd.close >= flagLow) {
        pattern = {
          info: { name: 'Bear Flag', bias: 'Bearish' },
          lines: [
            {
              points: [
                { time: poleSlice[0].time, price: poleHigh },
                { time: flagStart.time, price: poleLow },
              ],
              color: '#F23645',
              width: 2,
            },
            {
              points: [
                { time: flagStart.time, price: flagHigh },
                { time: flagEnd.time, price: flagHigh * 1.0008 },
              ],
              color: '#F23645',
              dashed: true,
              width: 1.5,
            },
            {
              points: [
                { time: flagStart.time, price: flagLow },
                { time: flagEnd.time, price: flagLow * 1.0008 },
              ],
              color: '#F23645',
              dashed: true,
              width: 1.5,
            },
          ],
          badgePoint: { time: flagStart.time, price: flagLow, position: 'below' },
        };
      }
    }
  }

  if (!pattern && pivotHighs.length >= 2 && pivotLows.length >= 2) {
    const h1 = pivotHighs[pivotHighs.length - 2];
    const h2 = pivotHighs[pivotHighs.length - 1];
    const l1 = pivotLows[pivotLows.length - 2];
    const l2 = pivotLows[pivotLows.length - 1];
    const highDiffPct = Math.abs(h2.price - h1.price) / Math.max(0.0001, h1.price);
    const lowDiffPct = Math.abs(l2.price - l1.price) / Math.max(0.0001, l1.price);
    {
      const spanH = Math.max(1, h2.idx - h1.idx);
      const spanL = Math.max(1, l2.idx - l1.idx);
      const slopeH = (h2.price - h1.price) / spanH;
      const slopeL = (l2.price - l1.price) / spanL;
      const projHigh = h2.price + slopeH * (latestIdx - h2.idx);
      const projLow = l2.price + slopeL * (latestIdx - l2.idx);

      const flatH = highDiffPct <= 0.003;
      const flatL = lowDiffPct <= 0.003;
      let info: DetectedPatternInfo;

      if (flatH && slopeL > 0) info = { name: 'Ascending Triangle', bias: 'Bullish' };
      else if (flatL && slopeH < 0) info = { name: 'Descending Triangle', bias: 'Bearish' };
      else if (slopeH < 0 && slopeL > 0) info = { name: 'Symmetrical Triangle', bias: 'Breakout' };
      else if (slopeH < 0 && slopeL < 0 && slopeH < slopeL) info = { name: 'Falling Wedge', bias: 'Bullish' };
      else if (slopeH > 0 && slopeL > 0 && slopeL > slopeH) info = { name: 'Rising Wedge', bias: 'Bearish' };
      else if (slopeH > 0 && slopeL > 0) info = { name: 'Bullish Channel', bias: 'Bullish' };
      else info = { name: 'Bearish Channel', bias: 'Bearish' };

      const anchor = h2.idx >= l2.idx ? h2 : l2;
      pattern = {
        info,
        lines: [
          {
            points: [
              { time: h1.time, price: h1.price },
              { time: h2.time, price: h2.price },
              { time: latestBar.time, price: projHigh },
            ],
            color: '#F23645',
            dashed: true,
            width: 1.6,
          },
          {
            points: [
              { time: l1.time, price: l1.price },
              { time: l2.time, price: l2.price },
              { time: latestBar.time, price: projLow },
            ],
            color: '#089981',
            dashed: true,
            width: 1.6,
          },
        ],
        badgePoint: {
          time: anchor.time,
          price: anchor.price,
          position: h2.idx >= l2.idx ? 'above' : 'below',
        },
      };
    }
  }

  // Order Blocks & Fair Value Gaps
  const orderBlocks: OrderBlockOverlay[] = [];
  let activeOrderBlock: ZoneRange | null = null;
  const startObIdx = Math.max(1, candles.length - 75);
  for (let i = candles.length - 3; i >= startObIdx; i -= 1) {
    const c = candles[i];
    const next1 = candles[i + 1];
    const next2 = candles[i + 2];
    const cRange = Math.max(0.0001, c.high - c.low);
    const impulseUp = next1.close > c.high && next2.close - c.close > cRange * 1.35;
    const impulseDown = next1.close < c.low && c.close - next2.close > cRange * 1.35;

    if (c.close < c.open && impulseUp && !orderBlocks.some((o) => o.type === 'Bullish')) {
      const mitigated = candles.slice(i + 2).some((bar) => bar.low < c.low);
      orderBlocks.push({
        type: 'Bullish',
        startTime: c.time,
        endTime: latestBar.time,
        low: c.low,
        high: c.high,
        mitigated,
      });
      if (trend === 1 && !activeOrderBlock) {
        activeOrderBlock = { type: 'Bullish', low: c.low, high: c.high, mitigated };
      }
    }
    if (c.close > c.open && impulseDown && !orderBlocks.some((o) => o.type === 'Bearish')) {
      const mitigated = candles.slice(i + 2).some((bar) => bar.high > c.high);
      orderBlocks.push({
        type: 'Bearish',
        startTime: c.time,
        endTime: latestBar.time,
        low: c.low,
        high: c.high,
        mitigated,
      });
      if (trend === -1 && !activeOrderBlock) {
        activeOrderBlock = { type: 'Bearish', low: c.low, high: c.high, mitigated };
      }
    }
    if (orderBlocks.length >= 2) break;
  }
  if (!activeOrderBlock && orderBlocks[0]) {
    activeOrderBlock = {
      type: orderBlocks[0].type,
      low: orderBlocks[0].low,
      high: orderBlocks[0].high,
      mitigated: orderBlocks[0].mitigated,
    };
  }

  const fvgs: FvgOverlay[] = [];
  let activeFvg: ZoneRange | null = null;
  const startFvgIdx = Math.max(2, candles.length - 50);
  for (let i = candles.length - 1; i >= startFvgIdx; i -= 1) {
    const prev2 = candles[i - 2];
    const curr = candles[i];
    if (curr.low > prev2.high && !fvgs.some((f) => f.type === 'Bullish')) {
      const mitigated = candles.slice(i + 1).some((bar) => bar.low <= prev2.high);
      fvgs.push({
        type: 'Bullish',
        startTime: prev2.time,
        endTime: latestBar.time,
        low: prev2.high,
        high: curr.low,
        mitigated,
      });
      if (!activeFvg) activeFvg = { type: 'Bullish', low: prev2.high, high: curr.low, mitigated };
    }
    if (curr.high < prev2.low && !fvgs.some((f) => f.type === 'Bearish')) {
      const mitigated = candles.slice(i + 1).some((bar) => bar.high >= prev2.low);
      fvgs.push({
        type: 'Bearish',
        startTime: prev2.time,
        endTime: latestBar.time,
        low: curr.high,
        high: prev2.low,
        mitigated,
      });
      if (!activeFvg) activeFvg = { type: 'Bearish', low: curr.high, high: prev2.low, mitigated };
    }
    if (fvgs.length >= 2) break;
  }

  // Diagonal Auto-Trendlines from Confirmed Swings
  const diagonalTrendlines: DiagonalTrendline[] = [];
  if (pivotHighs.length >= 2) {
    const h1 = pivotHighs[pivotHighs.length - 2];
    const h2 = pivotHighs[pivotHighs.length - 1];
    const span = Math.max(1, h2.idx - h1.idx);
    const slope = (h2.price - h1.price) / span;
    const proj = h2.price + slope * (latestIdx - h2.idx);
    if (Number.isFinite(proj) && proj > 0) {
      diagonalTrendlines.push({
        kind: 'resistance',
        points: [
          { time: h1.time, price: h1.price },
          { time: h2.time, price: h2.price },
          { time: latestBar.time, price: proj },
        ],
        color: 'rgba(242, 54, 69, 0.72)',
      });
    }
  }
  if (pivotLows.length >= 2) {
    const l1 = pivotLows[pivotLows.length - 2];
    const l2 = pivotLows[pivotLows.length - 1];
    const span = Math.max(1, l2.idx - l1.idx);
    const slope = (l2.price - l1.price) / span;
    const proj = l2.price + slope * (latestIdx - l2.idx);
    if (Number.isFinite(proj) && proj > 0) {
      diagonalTrendlines.push({
        kind: 'support',
        points: [
          { time: l1.time, price: l1.price },
          { time: l2.time, price: l2.price },
          { time: latestBar.time, price: proj },
        ],
        color: 'rgba(8, 153, 129, 0.72)',
      });
    }
  }

  // Stop-Hunt / Liquidity Sweep Detection (wick pierces prior swing high/low then closes back inside)
  const liquiditySweeps: LiquiditySweepItem[] = [];
  const sweepStart = Math.max(6, candles.length - 48);
  for (let i = sweepStart; i < candles.length; i += 1) {
    const bar = candles[i];
    const priorHigh = pivotHighs
      .filter((ph) => ph.idx < i - 1 && ph.idx >= i - 45)
      .sort((a, b) => b.idx - a.idx)[0];
    if (
      priorHigh &&
      bar.high > priorHigh.price * 1.00012 &&
      bar.close < priorHigh.price &&
      !liquiditySweeps.some((s) => Math.abs(s.time - bar.time) < 1)
    ) {
      liquiditySweeps.push({
        time: bar.time,
        wickPrice: bar.high,
        sweptLevel: priorHigh.price,
        direction: 'bear',
        label: '💧 LIQUIDITY SWEEP',
        color: '#F23645',
      });
    }

    const priorLow = pivotLows
      .filter((pl) => pl.idx < i - 1 && pl.idx >= i - 45)
      .sort((a, b) => b.idx - a.idx)[0];
    if (
      priorLow &&
      bar.low < priorLow.price * 0.99988 &&
      bar.close > priorLow.price &&
      !liquiditySweeps.some((s) => Math.abs(s.time - bar.time) < 1)
    ) {
      liquiditySweeps.push({
        time: bar.time,
        wickPrice: bar.low,
        sweptLevel: priorLow.price,
        direction: 'bull',
        label: '💧 LIQUIDITY SWEEP',
        color: '#089981',
      });
    }
  }
  const recentSweeps = liquiditySweeps.slice(-3);
  const latestLiquiditySweep = recentSweeps.length > 0 ? recentSweeps[recentSweeps.length - 1] : null;

  // Candlestick Price-Action Recognition (Engulfing & Pin Bar Rejection on latest bars)
  let candlestickPattern: CandlestickPatternInfo | null = null;
  if (candles.length >= 3) {
    const prevBar = candles[candles.length - 2];
    const currBar = candles[candles.length - 1];
    const prevBody = Math.abs(prevBar.close - prevBar.open);
    const currRange = Math.max(1e-6, currBar.high - currBar.low);
    const currBody = Math.abs(currBar.close - currBar.open);
    const upperWick = currBar.high - Math.max(currBar.open, currBar.close);
    const lowerWick = Math.min(currBar.open, currBar.close) - currBar.low;

    const isBullEngulfing =
      prevBar.close < prevBar.open &&
      currBar.close > currBar.open &&
      currBody >= Math.max(prevBody * 1.05, currRange * 0.45) &&
      currBar.open <= prevBar.close * 1.0005 &&
      currBar.close >= prevBar.open;

    const isBearEngulfing =
      prevBar.close > prevBar.open &&
      currBar.close < currBar.open &&
      currBody >= Math.max(prevBody * 1.05, currRange * 0.45) &&
      currBar.open >= prevBar.close * 0.9995 &&
      currBar.close <= prevBar.open;

    const isBullPinBar =
      lowerWick >= currRange * 0.56 &&
      lowerWick >= Math.max(1e-6, currBody) * 1.9 &&
      upperWick <= currRange * 0.22;

    const isBearPinBar =
      upperWick >= currRange * 0.56 &&
      upperWick >= Math.max(1e-6, currBody) * 1.9 &&
      lowerWick <= currRange * 0.22;

    if (isBullEngulfing) {
      candlestickPattern = {
        name: 'Bullish Engulfing',
        shortTag: 'Engulfing ↑',
        bias: 'Bullish',
        time: currBar.time,
        price: currBar.low,
        position: 'below',
      };
    } else if (isBearEngulfing) {
      candlestickPattern = {
        name: 'Bearish Engulfing',
        shortTag: 'Engulfing ↓',
        bias: 'Bearish',
        time: currBar.time,
        price: currBar.high,
        position: 'above',
      };
    } else if (isBullPinBar) {
      candlestickPattern = {
        name: 'Bullish Pin Bar',
        shortTag: 'Pin Bar ↑',
        bias: 'Bullish',
        time: currBar.time,
        price: currBar.low,
        position: 'below',
      };
    } else if (isBearPinBar) {
      candlestickPattern = {
        name: 'Bearish Pin Bar',
        shortTag: 'Pin Bar ↓',
        bias: 'Bearish',
        time: currBar.time,
        price: currBar.high,
        position: 'above',
      };
    }
  }

  const swingLowVal = prevSwingLow?.price ?? s1.price;
  const swingHighVal = prevSwingHigh?.price ?? r1.price;

  let entry = lastClose;
  let sl: number;
  let tp: number;
  if (trend === 1) {
    sl = swingLowVal < lastClose ? swingLowVal : lastClose * 0.992;
    const risk = Math.max(lastClose * 0.0025, lastClose - sl);
    tp = lastClose + risk * 2;
  } else {
    sl = swingHighVal > lastClose ? swingHighVal : lastClose * 1.008;
    const risk = Math.max(lastClose * 0.0025, sl - lastClose);
    tp = Math.max(0.0001, lastClose - risk * 2);
  }

  return {
    smc: {
      trend,
      lastEvent,
      lastHighLabel,
      lastLowLabel,
      lastHighPrice: swingHighVal,
      lastLowPrice: swingLowVal,
      supportPrice: s1.price,
      resistancePrice: r1.price,
      pattern: pattern?.info ?? null,
      candlestickPattern,
      latestLiquiditySweep,
      orderBlock: activeOrderBlock,
      fvg: activeFvg,
      bosCount,
      chochCount,
      entry,
      tp,
      sl,
    },
    swings,
    breaks: breaks.slice(-10),
    srLevels,
    diagonalTrendlines,
    liquiditySweeps: recentSweeps,
    candlestickPattern,
    pattern,
    orderBlocks,
    fvgs,
  };
}

export interface HtfTrendSummary {
  label: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  tf15mBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  tf1hBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

function evalSingleTfBias(rawCandles: TerminalCandle[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (rawCandles.length < 25) return 'NEUTRAL';
  const candles = rawCandles.length > 140 ? rawCandles.slice(-140) : rawCandles;
  const lastClose = candles[candles.length - 1].close;
  const ema20Arr = calcEmaSeries(candles, 20);
  const ema50Arr = calcEmaSeries(candles, 50);
  const e20 = ema20Arr[ema20Arr.length - 1]?.value ?? lastClose;
  const e50 = ema50Arr[ema50Arr.length - 1]?.value ?? lastClose;
  const spread = Math.abs(e20 - e50) / Math.max(1e-6, lastClose);
  const struct = analyzeChartStructure(candles);
  const structTrend = struct?.smc.trend ?? 0;

  if (spread >= 0.0001) {
    if (e20 > e50 && (lastClose >= e50 || structTrend === 1)) return 'BULLISH';
    if (e20 < e50 && (lastClose <= e50 || structTrend === -1)) return 'BEARISH';
  }
  if (structTrend === 1 && lastClose >= e20) return 'BULLISH';
  if (structTrend === -1 && lastClose <= e20) return 'BEARISH';
  return 'NEUTRAL';
}

export function computeMultiTimeframeTrend(
  candles15m: TerminalCandle[],
  candles1h: TerminalCandle[],
  activeTf: string
): HtfTrendSummary | null {
  const b15 = evalSingleTfBias(candles15m);
  const b1h = evalSingleTfBias(candles1h);
  if (candles15m.length < 25 && candles1h.length < 25) return null;

  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (activeTf === '1m' || activeTf === '5m') {
    if (b15 === 'BULLISH' && b1h !== 'BEARISH') bias = 'BULLISH';
    else if (b15 === 'BEARISH' && b1h !== 'BULLISH') bias = 'BEARISH';
    else if (b1h !== 'NEUTRAL' && b15 === 'NEUTRAL') bias = b1h;
    else if (b15 !== 'NEUTRAL' && b1h === 'NEUTRAL') bias = b15;
  } else {
    bias = b1h !== 'NEUTRAL' ? b1h : b15;
  }

  return {
    label: activeTf === '1m' || activeTf === '5m' ? '15m / 1H' : '1H / 4H',
    bias,
    tf15mBias: b15,
    tf1hBias: b1h,
  };
}

export interface AiConfluenceRule {
  id: 'htf' | 'ema' | 'smc' | 'rsi' | 'candle';
  label: string;
  passed: boolean;
  detail: string;
}

export interface TwoStageConfirmation {
  stage1Passed: boolean;
  stage2Passed: boolean;
  statusLabel: string;
  detail: string;
}

export interface BacktestSummary {
  candlesScanned: number;
  tradesTested: number;
  wins: number;
  losses: number;
  winRatePct: number;
  profitFactor: number;
}

export interface AiScalpAnalysisState {
  timeframe: string;
  score: number;
  grade: 'A+ High Probability' | 'B Moderate' | 'WAIT — Low Probability';
  actionable: boolean;
  direction: 'BUY' | 'SELL' | 'WAIT';
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rsi14: number;
  ema20: number;
  ema50: number;
  htfBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  htfLabel: string;
  twoStage: TwoStageConfirmation;
  reason: string;
  rules: AiConfluenceRule[];
}

export function computeAiScalpAnalysis(
  rawCandles: TerminalCandle[],
  structure: ChartStructureOverlayData | null,
  timeframe: string,
  precision = 2,
  htfTrend?: HtfTrendSummary | null
): AiScalpAnalysisState | null {
  if (rawCandles.length < 25) return null;
  const candles = rawCandles.length > 220 ? rawCandles.slice(-220) : rawCandles;
  const last = candles[candles.length - 1];
  const lastClose = last.close;

  // 1. Trend Filter: 20 EMA vs 50 EMA
  const ema20Arr = calcEmaSeries(candles, 20);
  const ema50Arr = calcEmaSeries(candles, 50);
  const ema20 = ema20Arr[ema20Arr.length - 1]?.value ?? lastClose;
  const ema20Prev = ema20Arr[Math.max(0, ema20Arr.length - 4)]?.value ?? ema20;
  const ema50 = ema50Arr[ema50Arr.length - 1]?.value ?? lastClose;
  const emaSpreadPct = Math.abs(ema20 - ema50) / Math.max(1e-6, lastClose);

  // Detect frequent EMA20/50 whipsaws in last 10 bars (choppy market filter)
  let emaCrossCount = 0;
  const checkLen = Math.min(10, ema20Arr.length - 1, ema50Arr.length - 1);
  for (let i = 1; i <= checkLen; i += 1) {
    const e20Curr = ema20Arr[ema20Arr.length - i]?.value;
    const e50Curr = ema50Arr[ema50Arr.length - i]?.value;
    const e20Prev = ema20Arr[ema20Arr.length - i - 1]?.value;
    const e50Prev = ema50Arr[ema50Arr.length - i - 1]?.value;
    if (
      e20Curr !== undefined &&
      e50Curr !== undefined &&
      e20Prev !== undefined &&
      e50Prev !== undefined
    ) {
      if ((e20Curr > e50Curr && e20Prev <= e50Prev) || (e20Curr < e50Curr && e20Prev >= e50Prev)) {
        emaCrossCount += 1;
      }
    }
  }

  let emaBias: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  if (emaSpreadPct >= 0.00012 && emaCrossCount <= 1) {
    if (ema20 > ema50 && (lastClose >= ema20 * 0.9988 || ema20 >= ema20Prev)) {
      emaBias = 'BUY';
    } else if (ema20 < ema50 && (lastClose <= ema20 * 1.0012 || ema20 <= ema20Prev)) {
      emaBias = 'SELL';
    }
  }

  // 2. SMC Structure + Support/Resistance Proximity
  const smcTrend: 'BUY' | 'SELL' =
    structure?.smc.trend === -1 ? 'SELL' : structure?.smc.trend === 1 ? 'BUY' : emaBias === 'SELL' ? 'SELL' : 'BUY';

  const htfBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = htfTrend?.bias ?? 'NEUTRAL';
  const htfLabel = htfTrend?.label ?? '15m / 1H';
  const isScalpTf = timeframe === '1m' || timeframe === '5m';

  const supportPrice = structure?.smc.supportPrice ?? null;
  const resistancePrice = structure?.smc.resistancePrice ?? null;
  const nearSupport =
    supportPrice !== null && Math.abs(lastClose - supportPrice) / Math.max(1e-6, lastClose) <= 0.0032;
  const nearResistance =
    resistancePrice !== null && Math.abs(lastClose - resistancePrice) / Math.max(1e-6, lastClose) <= 0.0032;

  let targetDir: 'BUY' | 'SELL' = emaBias !== 'NEUTRAL' ? emaBias : smcTrend;
  if (htfBias === 'BULLISH' && nearSupport && emaBias === 'NEUTRAL') {
    targetDir = 'BUY';
  } else if (htfBias === 'BEARISH' && nearResistance && emaBias === 'NEUTRAL') {
    targetDir = 'SELL';
  }

  const recentBars = candles.slice(-4);
  const matchingOb = structure?.orderBlocks.find(
    (ob) => ob.type === (targetDir === 'BUY' ? 'Bullish' : 'Bearish') && !ob.mitigated
  );
  const matchingFvg = structure?.fvgs.find(
    (f) => f.type === (targetDir === 'BUY' ? 'Bullish' : 'Bearish') && !f.mitigated
  );
  const obBounce = Boolean(
    matchingOb &&
      recentBars.some(
        (b) =>
          b.low <= matchingOb.high * 1.0015 &&
          b.high >= matchingOb.low * 0.9985
      )
  );
  const fvgBounce = Boolean(
    matchingFvg &&
      recentBars.some(
        (b) =>
          b.low <= matchingFvg.high * 1.0015 &&
          b.high >= matchingFvg.low * 0.9985
      )
  );
  const smcEvent = structure?.smc.lastEvent ?? 'Structure';
  const smcAligned =
    Boolean(structure) &&
    ((targetDir === 'BUY' && structure!.smc.trend === 1) ||
      (targetDir === 'SELL' && structure!.smc.trend === -1));
  const keyLevelBonus = (targetDir === 'BUY' && nearSupport) || (targetDir === 'SELL' && nearResistance);
  const smcStrongPass = smcAligned || obBounce || fvgBounce || keyLevelBonus;

  // 3. RSI Momentum (14) — filter out overbought (>72) or oversold (<28) traps
  const rsiArr = calcRsiSeries(candles, 14);
  const rsi14 = rsiArr[rsiArr.length - 1]?.value ?? 50;
  let rsiPassed = false;
  let rsiDetail = `RSI ${rsi14.toFixed(1)}`;
  if (targetDir === 'BUY') {
    if (rsi14 > 72) {
      rsiPassed = false;
      rsiDetail = `Overbought (${rsi14.toFixed(1)} > 72)`;
    } else if (rsi14 >= 45) {
      rsiPassed = true;
      rsiDetail = `Bullish (${rsi14.toFixed(1)})`;
    } else {
      rsiPassed = false;
      rsiDetail = `Weak (${rsi14.toFixed(1)} < 45)`;
    }
  } else {
    if (rsi14 < 28) {
      rsiPassed = false;
      rsiDetail = `Oversold (${rsi14.toFixed(1)} < 28)`;
    } else if (rsi14 <= 55) {
      rsiPassed = true;
      rsiDetail = `Bearish (${rsi14.toFixed(1)})`;
    } else {
      rsiPassed = false;
      rsiDetail = `Weak (${rsi14.toFixed(1)} > 55)`;
    }
  }

  // 4. Candle Strength — strong body close without long opposing rejection wick
  const candleRange = Math.max(1e-6, last.high - last.low);
  const bodySize = Math.abs(last.close - last.open);
  const bodyRatio = bodySize / candleRange;
  const upperWickRatio = (last.high - Math.max(last.open, last.close)) / candleRange;
  const lowerWickRatio = (Math.min(last.open, last.close) - last.low) / candleRange;

  const isBullCandle = last.close >= last.open;
  const isBearCandle = last.close <= last.open;
  const strongCandlePass =
    targetDir === 'BUY'
      ? isBullCandle && bodyRatio >= 0.44 && upperWickRatio <= 0.36
      : isBearCandle && bodyRatio >= 0.44 && lowerWickRatio <= 0.36;

  // 5. Higher Timeframe (15m / 1H) Confirmation
  const htfAligned =
    (targetDir === 'BUY' && htfBias === 'BULLISH') ||
    (targetDir === 'SELL' && htfBias === 'BEARISH');
  const htfCounterTrend =
    (targetDir === 'BUY' && htfBias === 'BEARISH') ||
    (targetDir === 'SELL' && htfBias === 'BULLISH');

  const htfAvailable = Boolean(htfTrend) && htfBias !== 'NEUTRAL';
  const emaScore = emaBias === targetDir ? 20 : 0;
  const smcScore = smcAligned && (obBounce || fvgBounce || keyLevelBonus) ? 20 : smcStrongPass ? 20 : 0;
  const rsiScore = rsiPassed ? 20 : 0;
  const candleScore = strongCandlePass
    ? 20
    : ((targetDir === 'BUY' && isBullCandle) || (targetDir === 'SELL' && isBearCandle)) && bodyRatio >= 0.32
      ? 10
      : 0;
  const htfScore = htfAligned ? 20 : !htfAvailable ? 15 : 0;

  let totalScore = emaScore + smcScore + rsiScore + candleScore + htfScore;
  if (emaCrossCount >= 2 || emaBias === 'NEUTRAL') {
    totalScore = Math.min(totalScore, 65);
  }
  if (isScalpTf && htfCounterTrend) {
    totalScore = Math.min(totalScore, 60);
  }
  totalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  const actionable = totalScore >= 75 && emaBias !== 'NEUTRAL' && !(isScalpTf && htfCounterTrend);
  const grade: AiScalpAnalysisState['grade'] =
    totalScore >= 75
      ? 'A+ High Probability'
      : totalScore >= 50
        ? 'B Moderate'
        : 'WAIT — Low Probability';

  const atrBars = candles.slice(-14);
  const atr =
    atrBars.reduce((sum, b) => sum + Math.max(b.high - b.low, lastClose * 0.0003), 0) /
    atrBars.length;
  const slDist = Math.max(lastClose * 0.0008, Math.min(lastClose * 0.0055, atr * 1.25));

  const entry = actionable ? Number(lastClose.toFixed(precision)) : null;
  const sl = actionable
    ? Number(
        (targetDir === 'BUY' ? Math.max(1e-4, lastClose - slDist) : lastClose + slDist).toFixed(
          precision
        )
      )
    : null;
  const tp1 = actionable
    ? Number(
        (targetDir === 'BUY' ? lastClose + slDist * 1.5 : Math.max(1e-4, lastClose - slDist * 1.5)).toFixed(
          precision
        )
      )
    : null;
  const tp2 = actionable
    ? Number(
        (targetDir === 'BUY' ? lastClose + slDist * 2.5 : Math.max(1e-4, lastClose - slDist * 2.5)).toFixed(
          precision
        )
      )
    : null;

  const reasonParts: string[] = [];
  if (htfAligned) {
    reasonParts.push(`${htfLabel} ${htfBias === 'BULLISH' ? 'Bullish' : 'Bearish'}`);
  }
  if (keyLevelBonus) {
    reasonParts.push(targetDir === 'BUY' ? 'at Support' : 'at Resistance');
  } else if (smcStrongPass) {
    reasonParts.push(
      obBounce
        ? `${targetDir === 'BUY' ? 'Bullish' : 'Bearish'} OB bounce`
        : fvgBounce
          ? `${targetDir === 'BUY' ? 'Bullish' : 'Bearish'} FVG tap`
          : smcEvent
    );
  }
  if (emaScore === 20) reasonParts.push('20/50 EMA trend');
  if (candleScore === 20) reasonParts.push('strong body close');
  if (rsiPassed) reasonParts.push(`RSI ${rsi14.toFixed(0)}`);

  const reason = actionable
    ? reasonParts.join(' + ')
    : isScalpTf && htfCounterTrend
      ? `Blocked: ${timeframe} ${targetDir} fights ${htfLabel} ${htfBias} trend`
      : emaCrossCount >= 2 || emaBias === 'NEUTRAL'
        ? '20/50 EMA flat or crossing — choppy range detected'
        : `Low confluence (${totalScore}%) — wait for cleaner confirmation`;

  // 2-Stage Candle-Close Confirmation at Support/Resistance or OB/FVG/Sweep
  const stage1Passed =
    nearSupport ||
    nearResistance ||
    obBounce ||
    fvgBounce ||
    Boolean(structure?.smc.latestLiquiditySweep);
  const stage2Passed = stage1Passed && strongCandlePass && emaBias === targetDir;
  const twoStage: TwoStageConfirmation = {
    stage1Passed,
    stage2Passed,
    statusLabel: stage2Passed
      ? '2-Stage Confirmed'
      : stage1Passed
        ? 'Stage 1: Zone Tap (Wait Close)'
        : 'Scanning S/R Zones',
    detail: stage2Passed
      ? `S/R & liquidity zone respected + ${targetDir} candle close confirmed`
      : stage1Passed
        ? 'Price inside key S/R or liquidity zone — awaiting strong directional candle close'
        : 'Price mid-range between Support S1 and Resistance R1',
  };

  return {
    timeframe,
    score: totalScore,
    grade,
    actionable,
    direction: actionable ? targetDir : 'WAIT',
    entry,
    sl,
    tp1,
    tp2,
    rsi14,
    ema20,
    ema50,
    htfBias,
    htfLabel,
    twoStage,
    reason,
    rules: [
      {
        id: 'htf',
        label: `HTF ${htfLabel}`,
        passed: htfAligned,
        detail: htfCounterTrend
          ? `Counter (${htfBias === 'BULLISH' ? 'Bull' : 'Bear'})`
          : htfBias === 'BULLISH'
            ? keyLevelBonus && targetDir === 'BUY'
              ? 'Bull + Support'
              : 'Bullish Trend'
            : htfBias === 'BEARISH'
              ? keyLevelBonus && targetDir === 'SELL'
                ? 'Bear + Resist'
                : 'Bearish Trend'
              : 'Ranging',
      },
      {
        id: 'ema',
        label: '20/50 EMA',
        passed: emaScore === 20,
        detail: emaBias === 'NEUTRAL' ? 'Flat/Chop' : `${emaBias === 'BUY' ? 'Bull' : 'Bear'} Stack`,
      },
      {
        id: 'smc',
        label: 'SMC Struct',
        passed: smcStrongPass,
        detail: obBounce
          ? 'OB Bounce'
          : fvgBounce
            ? 'FVG Tap'
            : keyLevelBonus
              ? targetDir === 'BUY'
                ? 'At Support'
                : 'At Resist'
              : smcEvent.replace(' (Bull)', '').replace(' (Bear)', ''),
      },
      {
        id: 'rsi',
        label: 'RSI (14)',
        passed: rsiPassed,
        detail: rsiDetail,
      },
      {
        id: 'candle',
        label: 'Candle Close',
        passed: candleScore === 20,
        detail: strongCandlePass ? `${Math.round(bodyRatio * 100)}% Body` : 'Weak / Wick',
      },
    ],
  };
}

/**
 * Causal 100-candle historical backtest simulating AI Sniper setups (TP1 1.5R vs SL 1.0R)
 * purely on real historical OHLC bars with zero look-ahead bias.
 */
export function run100CandleBacktest(rawCandles: TerminalCandle[]): BacktestSummary {
  const windowCandles = rawCandles.length > 145 ? rawCandles.slice(-145) : rawCandles;
  const scanned = Math.min(100, Math.max(0, windowCandles.length - 30));
  if (windowCandles.length < 40) {
    return { candlesScanned: windowCandles.length, tradesTested: 0, wins: 0, losses: 0, winRatePct: 0, profitFactor: 0 };
  }

  const ema20Arr = calcEmaSeries(windowCandles, 20);
  const ema50Arr = calcEmaSeries(windowCandles, 50);
  const rsiArr = calcRsiSeries(windowCandles, 14);

  const ema20ByTime = new Map(ema20Arr.map((p) => [p.time, p.value]));
  const ema50ByTime = new Map(ema50Arr.map((p) => [p.time, p.value]));
  const rsiByTime = new Map(rsiArr.map((p) => [p.time, p.value]));

  let wins = 0;
  let losses = 0;
  let cooldownUntil = -1;
  const startIdx = Math.max(25, windowCandles.length - 105);

  for (let i = startIdx; i < windowCandles.length - 6; i += 1) {
    if (i < cooldownUntil) continue;
    const bar = windowCandles[i];
    const e20 = ema20ByTime.get(bar.time);
    const e50 = ema50ByTime.get(bar.time) ?? e20;
    const rsi = rsiByTime.get(bar.time) ?? 50;
    if (e20 === undefined || e50 === undefined) continue;

    const range = Math.max(1e-6, bar.high - bar.low);
    const body = Math.abs(bar.close - bar.open);
    const bodyRatio = body / range;

    let side: 'BUY' | 'SELL' | null = null;
    if (e20 > e50 && bar.close > bar.open && bodyRatio >= 0.42 && rsi >= 46 && rsi <= 72) {
      side = 'BUY';
    } else if (e20 < e50 && bar.close < bar.open && bodyRatio >= 0.42 && rsi <= 54 && rsi >= 28) {
      side = 'SELL';
    }
    if (!side) continue;

    // Causal 14-bar ATR
    let atrSum = 0;
    for (let k = Math.max(0, i - 13); k <= i; k += 1) {
      atrSum += Math.max(windowCandles[k].high - windowCandles[k].low, bar.close * 0.0003);
    }
    const atr = atrSum / 14;
    const slDist = Math.max(bar.close * 0.0008, atr * 1.2);
    const entry = bar.close;
    const sl = side === 'BUY' ? entry - slDist : entry + slDist;
    const tp = side === 'BUY' ? entry + slDist * 1.5 : entry - slDist * 1.5;

    let outcome: 'win' | 'loss' | null = null;
    for (let f = i + 1; f <= Math.min(windowCandles.length - 1, i + 18); f += 1) {
      const fwd = windowCandles[f];
      if (side === 'BUY') {
        if (fwd.low <= sl) {
          outcome = 'loss';
          break;
        }
        if (fwd.high >= tp) {
          outcome = 'win';
          break;
        }
      } else {
        if (fwd.high >= sl) {
          outcome = 'loss';
          break;
        }
        if (fwd.low <= tp) {
          outcome = 'win';
          break;
        }
      }
    }

    if (outcome === 'win') {
      wins += 1;
      cooldownUntil = i + 4;
    } else if (outcome === 'loss') {
      losses += 1;
      cooldownUntil = i + 4;
    }
  }

  const tradesTested = wins + losses;
  const winRatePct = tradesTested > 0 ? Number(((wins / tradesTested) * 100).toFixed(1)) : 0;
  const grossWin = wins * 1.5;
  const grossLoss = Math.max(0.5, losses * 1.0);
  const profitFactor = tradesTested > 0 ? Number((grossWin / grossLoss).toFixed(2)) : 0;

  return {
    candlesScanned: scanned,
    tradesTested,
    wins,
    losses,
    winRatePct,
    profitFactor,
  };
}

export interface InstitutionalKillzoneState {
  name: 'London Killzone' | 'NY Open Killzone' | 'London Close' | 'Asian Range' | 'Pre-Killzone';
  isActiveKillzone: boolean;
  statusText: string;
  countdownText: string;
  volatilityLabel: 'High Institutional Flow' | 'Moderate Flow' | 'Low / Range Flow';
}

export function getInstitutionalKillzone(nowMs = Date.now()): InstitutionalKillzoneState {
  const d = new Date(nowMs);
  const secOfDay = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();

  const fmtRem = (secs: number) => {
    const s = Math.max(0, secs);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // London Killzone: 07:00 - 10:00 UTC
  if (secOfDay >= 7 * 3600 && secOfDay < 10 * 3600) {
    return {
      name: 'London Killzone',
      isActiveKillzone: true,
      statusText: 'ACTIVE NOW (07:00–10:00 UTC)',
      countdownText: `Ends in ${fmtRem(10 * 3600 - secOfDay)}`,
      volatilityLabel: 'High Institutional Flow',
    };
  }
  // NY Open Killzone: 12:00 - 15:00 UTC
  if (secOfDay >= 12 * 3600 && secOfDay < 15 * 3600) {
    return {
      name: 'NY Open Killzone',
      isActiveKillzone: true,
      statusText: 'ACTIVE NOW (12:00–15:00 UTC)',
      countdownText: `Ends in ${fmtRem(15 * 3600 - secOfDay)}`,
      volatilityLabel: 'High Institutional Flow',
    };
  }
  // London Close Killzone: 15:00 - 17:00 UTC
  if (secOfDay >= 15 * 3600 && secOfDay < 17 * 3600) {
    return {
      name: 'London Close',
      isActiveKillzone: true,
      statusText: 'ACTIVE NOW (15:00–17:00 UTC)',
      countdownText: `Ends in ${fmtRem(17 * 3600 - secOfDay)}`,
      volatilityLabel: 'Moderate Flow',
    };
  }
  // Asian Accumulation: 00:00 - 05:00 UTC
  if (secOfDay >= 0 && secOfDay < 5 * 3600) {
    return {
      name: 'Asian Range',
      isActiveKillzone: false,
      statusText: 'Asian Accumulation (00:00–05:00 UTC)',
      countdownText: `London in ${fmtRem(7 * 3600 - secOfDay)}`,
      volatilityLabel: 'Low / Range Flow',
    };
  }

  // Between sessions: compute next killzone (07:00, 12:00, or next day 07:00 UTC)
  let nextSec = 7 * 3600;
  let nextName = 'London';
  if (secOfDay < 7 * 3600) {
    nextSec = 7 * 3600;
    nextName = 'London';
  } else if (secOfDay < 12 * 3600) {
    nextSec = 12 * 3600;
    nextName = 'NY Open';
  } else {
    nextSec = 24 * 3600 + 7 * 3600;
    nextName = 'London';
  }

  return {
    name: 'Pre-Killzone',
    isActiveKillzone: false,
    statusText: 'Waiting for Next Killzone',
    countdownText: `${nextName} in ${fmtRem(nextSec - secOfDay)}`,
    volatilityLabel: 'Moderate Flow',
  };
}

export function calcRiskBasedLotSize(params: {
  equity: number;
  riskPct: number;
  entryPrice: number;
  slPrice: number | null;
  contractSize: number;
  fallbackSlPct?: number;
}): { lots: number; riskUsd: number; slDistance: number } {
  const safeEquity = Math.max(0, params.equity);
  const riskUsd = Number(((safeEquity * params.riskPct) / 100).toFixed(2));
  const slDist =
    params.slPrice !== null && Number.isFinite(params.slPrice) && Math.abs(params.entryPrice - params.slPrice) > 0
      ? Math.abs(params.entryPrice - params.slPrice)
      : Math.max(1e-4, params.entryPrice * (params.fallbackSlPct ?? 0.0025));
  const dollarPerLot = Math.max(1e-4, slDist * params.contractSize);
  const rawLots = riskUsd / dollarPerLot;
  const clampedLots = Math.max(0.01, Math.min(10, Number(rawLots.toFixed(2))));
  return {
    lots: Number.isFinite(clampedLots) ? clampedLots : 0.01,
    riskUsd,
    slDistance: slDist,
  };
}

export interface AiTradeCoachReport {
  totalTrades: number;
  winRatePct: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  tips: [string, string];
}

export function analyzeDemoTradeHistory(
  history: Array<{ symbol: string; side: 'BUY' | 'SELL'; lots: number; pnl: number }>,
  openPositionsCount: number,
  equity: number
): AiTradeCoachReport {
  const totalTrades = history.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winRatePct: 0,
      netPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      tips: [
        'Use the 1% Risk Lot Calculator and wait for 2-Stage S/R confirmation before opening your first position.',
        'Always attach Tight SL and TP1/TP2 via drag handles or "Apply Setup to Chart" to preserve your $1,000 capital.',
      ],
    };
  }

  const wins = history.filter((t) => t.pnl > 0);
  const losses = history.filter((t) => t.pnl < 0);
  const netPnl = Number(history.reduce((s, t) => s + t.pnl, 0).toFixed(2));
  const winRatePct = Number(((wins.length / totalTrades) * 100).toFixed(1));
  const avgWin = wins.length > 0 ? Number((wins.reduce((s, t) => s + t.pnl, 0) / wins.length).toFixed(2)) : 0;
  const avgLoss = losses.length > 0 ? Number((Math.abs(losses.reduce((s, t) => s + t.pnl, 0)) / losses.length).toFixed(2)) : 0;
  const maxLotUsed = Math.max(...history.map((t) => t.lots));

  const tip1 =
    avgLoss > avgWin && losses.length > 0
      ? `Your average loss ($${avgLoss.toFixed(2)}) exceeds your average win ($${avgWin.toFixed(2)}) — use BE at +1R and 50% Partial Close at TP1.`
      : winRatePct >= 55
        ? `Strong ${winRatePct}% win rate across ${totalTrades} trades — keep trailing Stop Loss (TS) active to maximize 2.5R runners.`
        : `Win rate is ${winRatePct}% (${wins.length}W/${losses.length}L) — filter trades through 15m/1H HTF alignment and avoid entries within 15m of High-Impact News.`;

  const tip2 =
    maxLotUsed >= 0.5 && equity <= 1500
      ? `Detected ${maxLotUsed.toFixed(2)} lot sizing on ~$${equity.toFixed(0)} equity — cap risk at 1%–2% per trade to avoid steep drawdowns.`
      : openPositionsCount > 2
        ? `You currently have ${openPositionsCount} open positions — avoid stacking correlated USD/Gold risk simultaneously.`
        : netPnl >= 0
          ? `Net profit is +$${netPnl.toFixed(2)} — focus execution during London (07:00 UTC) and NY Open (12:00 UTC) Killzones for cleanest liquidity.`
          : `Focus only on Grade A+ setups (≥75% confluence) during active Killzones until equity recovers above $1,000.`;

  return {
    totalTrades,
    winRatePct,
    netPnl,
    avgWin,
    avgLoss,
    tips: [tip1, tip2],
  };
}



