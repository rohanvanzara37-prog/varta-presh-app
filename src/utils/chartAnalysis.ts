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
    color: '#089981',
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
      color: 'rgba(5, 150, 105, 0.78)',
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
    color: '#F23645',
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
      color: 'rgba(242, 54, 69, 0.72)',
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
    } else {
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
    pattern,
    orderBlocks,
    fvgs,
  };
}
