export interface OhlcPoint {
  date: string;
  close: number;
  high: number;
  low: number;
}

export interface CandleInput {
  open: number;
  high: number;
  low: number;
  close: number;
  vol?: number;
}

export function calculateSMA(values: number[], period: number): (number | null)[] {
  return values.map((_, idx) => {
    if (idx < period - 1) return null;
    const slice = values.slice(idx - period + 1, idx + 1);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return Number((sum / period).toFixed(2));
  });
}

export function calculateEMA(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let prevEma: number | null = null;

  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (i === period - 1) {
      const seed =
        values.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
      prevEma = seed;
      result.push(Number(seed.toFixed(4)));
      continue;
    }
    if (prevEma !== null) {
      const next: number = values[i] * k + prevEma * (1 - k);
      prevEma = next;
      result.push(Number(next.toFixed(4)));
    } else {
      result.push(null);
    }
  }
  return result;
}

export function calculateBollingerBands(
  values: number[],
  period = 20,
  stdMult = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calculateSMA(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const mid = middle[i];
    if (mid === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    const variance =
      slice.reduce((acc, v) => acc + Math.pow(v - mid, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper.push(Number((mid + stdMult * std).toFixed(4)));
    lower.push(Number((mid - stdMult * std).toFixed(4)));
  }

  return { upper, middle, lower };
}

export function calculateRSI(values: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = [];
  if (values.length <= period) {
    return values.map(() => null);
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < period; i += 1) {
    rsi.push(null);
  }

  const firstRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(Number((100 - 100 / (1 + firstRs)).toFixed(1)));

  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(Number((100 - 100 / (1 + rs)).toFixed(1)));
  }

  return rsi;
}

export function calculateMACD(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
} {
  const emaFast = calculateEMA(values, fastPeriod);
  const emaSlow = calculateEMA(values, slowPeriod);
  const macdRaw: (number | null)[] = values.map((_, idx) => {
    const f = emaFast[idx];
    const s = emaSlow[idx];
    if (f === null || s === null) return null;
    return Number((f - s).toFixed(4));
  });

  const validStart = macdRaw.findIndex((v) => v !== null);
  if (validStart === -1) {
    return {
      macdLine: macdRaw,
      signalLine: values.map(() => null),
      histogram: values.map(() => null),
    };
  }

  const validMacdValues = macdRaw.slice(validStart).map((v) => v ?? 0);
  const validSignal = calculateEMA(validMacdValues, signalPeriod);

  const signalLine: (number | null)[] = values.map((_, idx) => {
    if (idx < validStart) return null;
    return validSignal[idx - validStart] ?? null;
  });

  const histogram: (number | null)[] = values.map((_, idx) => {
    const m = macdRaw[idx];
    const sig = signalLine[idx];
    if (m === null || sig === null) return null;
    return Number((m - sig).toFixed(4));
  });

  return { macdLine: macdRaw, signalLine, histogram };
}

export function calculateVWAP(candles: CandleInput[]): number[] {
  let cumulativePV = 0;
  let cumulativeVol = 0;
  return candles.map((c) => {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = Math.max(1, c.vol ?? 10);
    cumulativePV += typicalPrice * vol;
    cumulativeVol += vol;
    return Number((cumulativePV / cumulativeVol).toFixed(4));
  });
}

export interface TechnicalFactorSignal {
  name: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  detail: string;
}

export interface SmartChartSummary {
  rating: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
  action: 'STRONG BUY' | 'BUY' | 'HOLD / WAIT' | 'SELL' | 'STRONG SELL';
  confidencePct: number;
  score: number; // -6 to +6
  currentPrice: number;
  rsi14: number;
  macdHist: number;
  ema9: number;
  ema21: number;
  sma20: number;
  vwap: number;
  bollingerUpper: number;
  bollingerLower: number;
  supportS1: number;
  resistanceR1: number;
  atr14: number;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: string;
  trendLabel: string;
  summaryText: string;
  signals: TechnicalFactorSignal[];
}

function roundPrice(value: number, reference: number): number {
  const safe = Math.max(0.0001, value);
  if (reference >= 100) return Number(safe.toFixed(2));
  if (reference >= 10) return Number(safe.toFixed(3));
  return Number(safe.toFixed(4));
}

export function computeSmartChartSummary(candles: CandleInput[]): SmartChartSummary | null {
  if (candles.length < 15) return null;
  const closes = candles.map((c) => c.close);
  const lastIdx = closes.length - 1;
  const latestClose = closes[lastIdx];

  const ema9Arr = calculateEMA(closes, 9);
  const ema21Arr = calculateEMA(closes, Math.min(21, Math.max(10, closes.length - 2)));
  const bbArr = calculateBollingerBands(closes, Math.min(20, closes.length), 2);
  const rsiArr = calculateRSI(closes, 14);
  const macdRes = calculateMACD(closes);
  const vwapArr = calculateVWAP(candles);

  const ema9 = ema9Arr[lastIdx] ?? latestClose;
  const ema21 = ema21Arr[lastIdx] ?? latestClose;
  const sma20 = bbArr.middle[lastIdx] ?? latestClose;
  const bollingerUpper = bbArr.upper[lastIdx] ?? latestClose * 1.01;
  const bollingerLower = bbArr.lower[lastIdx] ?? latestClose * 0.99;
  const rsi14 = rsiArr[lastIdx] ?? 50;
  const macdHist = macdRes.histogram[lastIdx] ?? 0;
  const prevMacdHist = macdRes.histogram[Math.max(0, lastIdx - 1)] ?? macdHist;
  const vwap = vwapArr[lastIdx] ?? latestClose;

  // Pivot levels from recent window
  const recentWindow = candles.slice(-24);
  const high = Math.max(...recentWindow.map((c) => c.high));
  const low = Math.min(...recentWindow.map((c) => c.low));
  const pivot = (high + low + latestClose) / 3;
  const supportS1 = 2 * pivot - high;
  const resistanceR1 = 2 * pivot - low;

  // ATR(14)
  const trList: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const curr = candles[i];
    const prevClose = candles[i - 1].close;
    trList.push(
      Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prevClose),
        Math.abs(curr.low - prevClose)
      )
    );
  }
  const atrSlice = trList.slice(-14);
  const rawAtr =
    atrSlice.length > 0
      ? atrSlice.reduce((sum, v) => sum + v, 0) / atrSlice.length
      : (high - low) * 0.25;
  const atr14 = Math.max(latestClose * 0.0012, rawAtr);

  // 6-Factor Technical Confluence Scoring (-6 to +6)
  const signals: TechnicalFactorSignal[] = [];
  let score = 0;

  // 1. EMA 9/21 Trend Crossover
  if (latestClose > ema9 && ema9 >= ema21) {
    score += 1;
    signals.push({
      name: 'EMA (9 / 21)',
      bias: 'BULLISH',
      detail: 'Price holding above rising EMA 9 & EMA 21',
    });
  } else if (latestClose < ema9 && ema9 <= ema21) {
    score -= 1;
    signals.push({
      name: 'EMA (9 / 21)',
      bias: 'BEARISH',
      detail: 'Price trading below declining EMA 9 & EMA 21',
    });
  } else {
    signals.push({
      name: 'EMA (9 / 21)',
      bias: 'NEUTRAL',
      detail: 'Moving averages converging near price',
    });
  }

  // 2. VWAP Institutional Bias
  if (latestClose > vwap * 1.0005) {
    score += 1;
    signals.push({
      name: 'VWAP Anchor',
      bias: 'BULLISH',
      detail: 'Buyers controlling above volume-weighted average',
    });
  } else if (latestClose < vwap * 0.9995) {
    score -= 1;
    signals.push({
      name: 'VWAP Anchor',
      bias: 'BEARISH',
      detail: 'Trading below VWAP intraday equilibrium',
    });
  } else {
    signals.push({
      name: 'VWAP Anchor',
      bias: 'NEUTRAL',
      detail: 'Price testing VWAP fair-value zone',
    });
  }

  // 3. RSI (14) Momentum & Extremes
  if (rsi14 <= 32) {
    score += 1;
    signals.push({
      name: 'RSI (14)',
      bias: 'BULLISH',
      detail: `Oversold (${rsi14.toFixed(1)}) · bounce setup`,
    });
  } else if (rsi14 >= 53 && rsi14 < 70) {
    score += 1;
    signals.push({
      name: 'RSI (14)',
      bias: 'BULLISH',
      detail: `Healthy bullish momentum (${rsi14.toFixed(1)})`,
    });
  } else if (rsi14 >= 72) {
    score -= 1;
    signals.push({
      name: 'RSI (14)',
      bias: 'BEARISH',
      detail: `Overbought (${rsi14.toFixed(1)}) · pullback risk`,
    });
  } else if (rsi14 <= 47 && rsi14 > 32) {
    score -= 1;
    signals.push({
      name: 'RSI (14)',
      bias: 'BEARISH',
      detail: `Weak momentum (${rsi14.toFixed(1)})`,
    });
  } else {
    signals.push({
      name: 'RSI (14)',
      bias: 'NEUTRAL',
      detail: `Balanced zone (${rsi14.toFixed(1)})`,
    });
  }

  // 4. MACD Histogram & Slope
  if (macdHist > 0 && macdHist >= prevMacdHist) {
    score += 1;
    signals.push({
      name: 'MACD (12,26,9)',
      bias: 'BULLISH',
      detail: 'Positive & expanding bullish histogram',
    });
  } else if (macdHist < 0 && macdHist <= prevMacdHist) {
    score -= 1;
    signals.push({
      name: 'MACD (12,26,9)',
      bias: 'BEARISH',
      detail: 'Negative & expanding bearish momentum',
    });
  } else if (macdHist > 0) {
    score += 1;
    signals.push({
      name: 'MACD (12,26,9)',
      bias: 'BULLISH',
      detail: 'MACD line holding above signal',
    });
  } else if (macdHist < 0) {
    score -= 1;
    signals.push({
      name: 'MACD (12,26,9)',
      bias: 'BEARISH',
      detail: 'MACD line holding below signal',
    });
  } else {
    signals.push({
      name: 'MACD (12,26,9)',
      bias: 'NEUTRAL',
      detail: 'Flat momentum near zero line',
    });
  }

  // 5. Bollinger Bands (20, 2)
  if (latestClose > sma20 && latestClose < bollingerUpper) {
    score += 1;
    signals.push({
      name: 'Bollinger (20,2)',
      bias: 'BULLISH',
      detail: 'Upper-band expansion channel active',
    });
  } else if (latestClose <= bollingerLower) {
    score += 1;
    signals.push({
      name: 'Bollinger (20,2)',
      bias: 'BULLISH',
      detail: 'Touching lower 2σ band · mean-reversion long',
    });
  } else if (latestClose < sma20 && latestClose > bollingerLower) {
    score -= 1;
    signals.push({
      name: 'Bollinger (20,2)',
      bias: 'BEARISH',
      detail: 'Lower-half band drift below 20-SMA',
    });
  } else {
    score -= 1;
    signals.push({
      name: 'Bollinger (20,2)',
      bias: 'BEARISH',
      detail: 'Extended above upper 2σ band · profit booking',
    });
  }

  // 6. Pivot S1 / R1 Structure
  const distToSupport = Math.abs(latestClose - supportS1);
  const distToRes = Math.abs(resistanceR1 - latestClose);
  if (latestClose >= pivot && distToRes > atr14 * 0.4) {
    score += 1;
    signals.push({
      name: 'Pivot Structure',
      bias: 'BULLISH',
      detail: 'Above intraday pivot with room to R1',
    });
  } else if (latestClose < pivot && distToSupport > atr14 * 0.4) {
    score -= 1;
    signals.push({
      name: 'Pivot Structure',
      bias: 'BEARISH',
      detail: 'Below intraday pivot toward S1 liquidity',
    });
  } else {
    signals.push({
      name: 'Pivot Structure',
      bias: 'NEUTRAL',
      detail: 'Testing key pivot S1 / R1 inflection',
    });
  }

  const rating: SmartChartSummary['rating'] =
    score >= 4
      ? 'Strong Buy'
      : score >= 2
        ? 'Buy'
        : score <= -4
          ? 'Strong Sell'
          : score <= -2
            ? 'Sell'
            : 'Neutral';

  const action: SmartChartSummary['action'] =
    score >= 4
      ? 'STRONG BUY'
      : score >= 2
        ? 'BUY'
        : score <= -4
          ? 'STRONG SELL'
          : score <= -2
            ? 'SELL'
            : 'HOLD / WAIT';

  const confidencePct = Math.min(95, Math.max(54, 52 + Math.abs(score) * 7));

  const isBuyBias = score >= 2;
  const isSellBias = score <= -2;

  let entryLow = latestClose - atr14 * 0.25;
  let entryHigh = latestClose + atr14 * 0.15;
  let stopLoss = supportS1 - atr14 * 0.5;
  let takeProfit1 = resistanceR1;
  let takeProfit2 = resistanceR1 + atr14 * 1.4;

  if (isBuyBias) {
    entryLow = latestClose - atr14 * 0.3;
    entryHigh = latestClose + atr14 * 0.12;
    stopLoss = Math.min(supportS1, latestClose - atr14 * 1.4);
    takeProfit1 = Math.max(resistanceR1, latestClose + atr14 * 2.0);
    takeProfit2 = Math.max(takeProfit1 + atr14 * 1.1, latestClose + atr14 * 3.2);
  } else if (isSellBias) {
    entryLow = latestClose - atr14 * 0.12;
    entryHigh = latestClose + atr14 * 0.3;
    stopLoss = Math.max(resistanceR1, latestClose + atr14 * 1.4);
    takeProfit1 = Math.min(supportS1, latestClose - atr14 * 2.0);
    takeProfit2 = Math.min(takeProfit1 - atr14 * 1.1, latestClose - atr14 * 3.2);
  } else {
    entryLow = supportS1;
    entryHigh = resistanceR1;
    stopLoss = supportS1 - atr14 * 0.9;
    takeProfit1 = resistanceR1;
    takeProfit2 = resistanceR1 + atr14 * 1.3;
  }

  const riskDist = Math.max(latestClose * 0.0005, Math.abs(latestClose - stopLoss));
  const rewardDist = Math.abs(takeProfit1 - latestClose);
  const rrRatio = Math.max(1.2, rewardDist / riskDist);
  const riskReward = `1 : ${rrRatio.toFixed(1)}`;

  const trendLabel =
    latestClose > ema9 && ema9 > ema21
      ? 'Uptrend (Above EMA 9/21)'
      : latestClose < ema9 && ema9 < ema21
        ? 'Downtrend (Below EMA 9/21)'
        : 'Range / Consolidation';

  const summaryText = isBuyBias
    ? `${confidencePct}% bullish confluence across EMA, VWAP & MACD. Buy dips inside the entry zone with tight stop protection.`
    : isSellBias
      ? `${confidencePct}% bearish confluence below key averages. Look for short entries on weak bounces toward resistance.`
      : `Mixed indicator alignment (${score > 0 ? '+' : ''}${score}/6). Wait for a clean break above R1 or bounce off S1 before entering.`;

  return {
    rating,
    action,
    confidencePct,
    score,
    currentPrice: roundPrice(latestClose, latestClose),
    rsi14,
    macdHist,
    ema9: roundPrice(ema9, latestClose),
    ema21: roundPrice(ema21, latestClose),
    sma20: roundPrice(sma20, latestClose),
    vwap: roundPrice(vwap, latestClose),
    bollingerUpper: roundPrice(bollingerUpper, latestClose),
    bollingerLower: roundPrice(bollingerLower, latestClose),
    supportS1: roundPrice(supportS1, latestClose),
    resistanceR1: roundPrice(resistanceR1, latestClose),
    atr14: roundPrice(atr14, latestClose),
    entryLow: roundPrice(entryLow, latestClose),
    entryHigh: roundPrice(entryHigh, latestClose),
    stopLoss: roundPrice(stopLoss, latestClose),
    takeProfit1: roundPrice(takeProfit1, latestClose),
    takeProfit2: roundPrice(takeProfit2, latestClose),
    riskReward,
    trendLabel,
    summaryText,
    signals,
  };
}
