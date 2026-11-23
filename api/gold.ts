interface ServerlessReq {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
}

interface ServerlessRes {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ServerlessRes;
  json: (body: unknown) => void;
  end: (body?: string) => void;
}

interface OhlcBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface SpotIntervalSpec {
  sec: number;
  defaultRange: string;
  tdInterval: string;
  fhResolution: string;
  fhLookbackSec: number;
  bybitInterval: string;
  okxBar: string;
  binanceInterval: string;
}

const INTERVAL_SPEC: Record<string, SpotIntervalSpec> = {
  '1m': {
    sec: 60,
    defaultRange: '1d',
    tdInterval: '1min',
    fhResolution: '1',
    fhLookbackSec: 6 * 3600,
    bybitInterval: '1',
    okxBar: '1m',
    binanceInterval: '1m',
  },
  '5m': {
    sec: 300,
    defaultRange: '5d',
    tdInterval: '5min',
    fhResolution: '5',
    fhLookbackSec: 24 * 3600,
    bybitInterval: '5',
    okxBar: '5m',
    binanceInterval: '5m',
  },
  '15m': {
    sec: 900,
    defaultRange: '5d',
    tdInterval: '15min',
    fhResolution: '15',
    fhLookbackSec: 4 * 86400,
    bybitInterval: '15',
    okxBar: '15m',
    binanceInterval: '15m',
  },
  '30m': {
    sec: 1800,
    defaultRange: '1mo',
    tdInterval: '30min',
    fhResolution: '30',
    fhLookbackSec: 7 * 86400,
    bybitInterval: '30',
    okxBar: '30m',
    binanceInterval: '30m',
  },
  '60m': {
    sec: 3600,
    defaultRange: '1mo',
    tdInterval: '1h',
    fhResolution: '60',
    fhLookbackSec: 14 * 86400,
    bybitInterval: '60',
    okxBar: '1H',
    binanceInterval: '1h',
  },
  '1h': {
    sec: 3600,
    defaultRange: '1mo',
    tdInterval: '1h',
    fhResolution: '60',
    fhLookbackSec: 14 * 86400,
    bybitInterval: '60',
    okxBar: '1H',
    binanceInterval: '1h',
  },
  '4h': {
    sec: 14400,
    defaultRange: '3mo',
    tdInterval: '4h',
    fhResolution: '60',
    fhLookbackSec: 45 * 86400,
    bybitInterval: '240',
    okxBar: '4H',
    binanceInterval: '4h',
  },
  '1d': {
    sec: 86400,
    defaultRange: '1y',
    tdInterval: '1day',
    fhResolution: 'D',
    fhLookbackSec: 260 * 86400,
    bybitInterval: 'D',
    okxBar: '1Dutc',
    binanceInterval: '1d',
  },
};

const ALLOWED_RANGES = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y']);

async function fetchJsonWithTimeout<T>(
  url: string,
  ms = 4500,
  init?: RequestInit
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function normalizeAndAggregateUtcBars(rawBars: OhlcBar[], intervalSec: number): OhlcBar[] {
  const sortedRaw = rawBars
    .filter(
      (b) =>
        Number.isFinite(b.time) &&
        b.time > 0 &&
        Number.isFinite(b.open) &&
        Number.isFinite(b.high) &&
        Number.isFinite(b.low) &&
        Number.isFinite(b.close) &&
        b.open > 0 &&
        b.high > 0 &&
        b.low > 0 &&
        b.close > 0
    )
    .sort((a, b) => a.time - b.time);

  const byBucket = new Map<number, OhlcBar>();
  for (const bar of sortedRaw) {
    const bucketTime = Math.floor(bar.time / intervalSec) * intervalSec;
    const clampedHigh = Math.max(bar.high, bar.open, bar.close);
    const clampedLow = Math.min(bar.low, bar.open, bar.close);
    const existing = byBucket.get(bucketTime);
    if (!existing) {
      byBucket.set(bucketTime, {
        time: bucketTime,
        open: Number(bar.open.toFixed(2)),
        high: Number(clampedHigh.toFixed(2)),
        low: Number(clampedLow.toFixed(2)),
        close: Number(bar.close.toFixed(2)),
        ...(typeof bar.volume === 'number' && Number.isFinite(bar.volume)
          ? { volume: Number(bar.volume.toFixed(2)) }
          : {}),
      });
    } else {
      existing.high = Number(Math.max(existing.high, clampedHigh).toFixed(2));
      existing.low = Number(Math.min(existing.low, clampedLow).toFixed(2));
      existing.close = Number(bar.close.toFixed(2));
      if (typeof bar.volume === 'number' && Number.isFinite(bar.volume)) {
        existing.volume = Number(((existing.volume ?? 0) + bar.volume).toFixed(2));
      }
    }
  }

  return Array.from(byBucket.values())
    .sort((a, b) => a.time - b.time)
    .slice(-180);
}

function parseUtcTimestampSec(raw: string | number | undefined): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
  }
  const isoUtc = trimmed.includes('T')
    ? trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)
      ? trimmed
      : `${trimmed}Z`
    : trimmed.includes(' ')
      ? `${trimmed.replace(' ', 'T')}Z`
      : `${trimmed}T00:00:00Z`;
  const ms = Date.parse(isoUtc);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

async function fetchLiveSpotCfdPrice(): Promise<{ price: number; provider: string } | null> {
  const [sqData, tvScan, goldApi] = await Promise.all([
    fetchJsonWithTimeout<Array<{ spreadProfilePrices?: Array<{ bid?: number; ask?: number }> }>>(
      'https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD',
      2600
    ),
    fetchJsonWithTimeout<{ data?: Array<{ s?: string; d?: number[] }> }>(
      'https://scanner.tradingview.com/cfd/scan',
      2600,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: { tickers: ['OANDA:XAUUSD', 'FX_IDC:XAUUSD', 'TVC:GOLD'] },
          columns: ['close'],
        }),
      }
    ),
    fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAU', 2500),
  ]);

  const sqQuote = sqData?.[0]?.spreadProfilePrices?.[0];
  if (
    typeof sqQuote?.bid === 'number' &&
    typeof sqQuote?.ask === 'number' &&
    sqQuote.bid > 500 &&
    sqQuote.ask > 500
  ) {
    return { price: Number(((sqQuote.bid + sqQuote.ask) / 2).toFixed(2)), provider: 'swissquote' };
  }

  const tvClose = tvScan?.data?.[0]?.d?.[0];
  if (typeof tvClose === 'number' && Number.isFinite(tvClose) && tvClose > 500) {
    return { price: Number(tvClose.toFixed(2)), provider: 'oanda' };
  }

  if (typeof goldApi?.price === 'number' && Number.isFinite(goldApi.price) && goldApi.price > 500) {
    return { price: Number(goldApi.price.toFixed(2)), provider: 'gold-api' };
  }

  return null;
}

async function fetchTwelveDataXauUsd(
  spec: SpotIntervalSpec,
  apiKey: string
): Promise<{ source: string; candles: OhlcBar[] } | null> {
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${encodeURIComponent(
    spec.tdInterval
  )}&outputsize=180&timezone=UTC&apikey=${encodeURIComponent(apiKey)}`;

  const data = await fetchJsonWithTimeout<{
    status?: string;
    values?: Array<{
      datetime?: string;
      open?: string;
      high?: string;
      low?: string;
      close?: string;
    }>;
  }>(url, 4800);

  if (data?.status === 'error' || !Array.isArray(data?.values) || data.values.length < 10) {
    return null;
  }

  const rawBars: OhlcBar[] = [];
  for (const row of data.values) {
    const t = parseUtcTimestampSec(row.datetime);
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    if (t !== null && [open, high, low, close].every(Number.isFinite)) {
      rawBars.push({ time: t, open, high, low, close });
    }
  }

  const candles = normalizeAndAggregateUtcBars(rawBars, spec.sec);
  return candles.length >= 10 ? { source: 'twelvedata-xauusd', candles } : null;
}

async function fetchFinnhubOandaXauUsd(
  spec: SpotIntervalSpec,
  apiKey: string
): Promise<{ source: string; candles: OhlcBar[] } | null> {
  const toSec = Math.floor(Date.now() / 1000);
  const fromSec = toSec - spec.fhLookbackSec;
  const url = `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(
    'OANDA:XAU_USD'
  )}&resolution=${encodeURIComponent(spec.fhResolution)}&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(
    apiKey
  )}`;

  const data = await fetchJsonWithTimeout<{
    s?: string;
    t?: number[];
    o?: number[];
    h?: number[];
    l?: number[];
    c?: number[];
  }>(url, 4800);

  if (data?.s !== 'ok' || !Array.isArray(data.t) || data.t.length < 10) {
    return null;
  }

  const rawBars: OhlcBar[] = [];
  for (let i = 0; i < data.t.length; i += 1) {
    const t = data.t[i];
    const open = data.o?.[i];
    const high = data.h?.[i];
    const low = data.l?.[i];
    const close = data.c?.[i];
    if (
      typeof t === 'number' &&
      typeof open === 'number' &&
      typeof high === 'number' &&
      typeof low === 'number' &&
      typeof close === 'number'
    ) {
      rawBars.push({ time: t, open, high, low, close });
    }
  }

  const candles = normalizeAndAggregateUtcBars(rawBars, spec.sec);
  return candles.length >= 10 ? { source: 'finnhub-oanda-xauusd', candles } : null;
}

async function fetchGoldApiHistory(
  rawIv: string,
  spec: SpotIntervalSpec,
  apiKey: string
): Promise<{ source: string; candles: OhlcBar[] } | null> {
  const iv = rawIv === '60m' ? '1h' : rawIv;
  const url = `https://api.gold-api.com/history?symbol=XAU&interval=${encodeURIComponent(iv)}`;
  const data = await fetchJsonWithTimeout<
    Array<{
      timestamp?: number | string;
      time?: number | string;
      date?: string;
      open?: number;
      high?: number;
      low?: number;
      close?: number;
      price?: number;
    }>
  >(url, 4500, { headers: { 'x-api-key': apiKey } });

  if (!Array.isArray(data) || data.length < 10) return null;

  const rawBars: OhlcBar[] = [];
  for (const row of data) {
    const t = parseUtcTimestampSec(row.timestamp ?? row.time ?? row.date);
    const close = Number(row.close ?? row.price);
    const open = Number(row.open ?? close);
    const high = Number(row.high ?? close);
    const low = Number(row.low ?? close);
    if (t !== null && [open, high, low, close].every(Number.isFinite)) {
      rawBars.push({ time: t, open, high, low, close });
    }
  }

  const candles = normalizeAndAggregateUtcBars(rawBars, spec.sec);
  return candles.length >= 10 ? { source: 'goldapi-xauusd', candles } : null;
}

async function fetchKeylessUtcSpotGoldFallback(
  spec: SpotIntervalSpec
): Promise<{ source: string; candles: OhlcBar[] } | null> {
  const [spotInfo, bybitRes, okxRes, binanceRes] = await Promise.all([
    fetchLiveSpotCfdPrice(),
    fetchJsonWithTimeout<{
      retCode?: number;
      result?: { list?: Array<[string, string, string, string, string, string?]> };
    }>(
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=XAUTUSDT&interval=${encodeURIComponent(
        spec.bybitInterval
      )}&limit=180`,
      4200
    ),
    fetchJsonWithTimeout<{
      code?: string;
      data?: Array<[string, string, string, string, string, string?]>;
    }>(
      `https://www.okx.com/api/v5/market/candles?instId=XAUT-USDT&bar=${encodeURIComponent(
        spec.okxBar
      )}&limit=180`,
      4200
    ),
    fetchJsonWithTimeout<Array<[number, string, string, string, string, string?]>>(
      `https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=${encodeURIComponent(
        spec.binanceInterval
      )}&limit=180`,
      4200
    ),
  ]);

  const rawBars: OhlcBar[] = [];

  if (bybitRes?.retCode === 0 && Array.isArray(bybitRes.result?.list) && bybitRes.result.list.length >= 10) {
    for (const row of bybitRes.result.list) {
      const tMs = Number(row[0]);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = row[5] !== undefined ? Number(row[5]) : undefined;
      if ([tMs, open, high, low, close].every(Number.isFinite)) {
        rawBars.push({ time: Math.floor(tMs / 1000), open, high, low, close, volume });
      }
    }
  } else if (okxRes?.code === '0' && Array.isArray(okxRes.data) && okxRes.data.length >= 10) {
    for (const row of okxRes.data) {
      const tMs = Number(row[0]);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = row[5] !== undefined ? Number(row[5]) : undefined;
      if ([tMs, open, high, low, close].every(Number.isFinite)) {
        rawBars.push({ time: Math.floor(tMs / 1000), open, high, low, close, volume });
      }
    }
  } else if (Array.isArray(binanceRes) && binanceRes.length >= 10) {
    for (const row of binanceRes) {
      const tMs = Number(row[0]);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = row[5] !== undefined ? Number(row[5]) : undefined;
      if ([tMs, open, high, low, close].every(Number.isFinite)) {
        rawBars.push({ time: Math.floor(tMs / 1000), open, high, low, close, volume });
      }
    }
  }

  let candles = normalizeAndAggregateUtcBars(rawBars, spec.sec);
  if (candles.length < 10) return null;

  // Calibrate UTC bullion curve seamlessly onto exact live Spot Gold CFD price (Swissquote / OANDA XAU/USD)
  if (spotInfo && candles.length > 0) {
    const latest = candles[candles.length - 1];
    const basis = spotInfo.price - latest.close;
    if (Math.abs(basis) > 0.01 && Math.abs(basis) < spotInfo.price * 0.05) {
      candles = candles.map((bar) => ({
        ...bar,
        open: Number((bar.open + basis).toFixed(2)),
        high: Number((bar.high + basis).toFixed(2)),
        low: Number((bar.low + basis).toFixed(2)),
        close: Number((bar.close + basis).toFixed(2)),
      }));
    }
  }

  const sourceLabel = spotInfo ? `${spotInfo.provider}-cfd-utc` : 'xaut-spot-utc';
  return { source: sourceLabel, candles };
}

export default async function handler(req: ServerlessReq, res: ServerlessRes) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  let rawIv = '15m';
  let rawRange = '';
  if (typeof req.query?.interval === 'string') {
    rawIv = req.query.interval.trim().toLowerCase();
  }
  if (typeof req.query?.range === 'string') {
    rawRange = req.query.range.trim().toLowerCase();
  }
  if (req.url && (!req.query?.interval || !req.query?.range)) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      const ivParam = parsed.searchParams.get('interval');
      const rangeParam = parsed.searchParams.get('range');
      if (ivParam) rawIv = ivParam.trim().toLowerCase();
      if (rangeParam) rawRange = rangeParam.trim().toLowerCase();
    } catch {
      // keep defaults
    }
  }

  const spec = INTERVAL_SPEC[rawIv];
  if (!spec) {
    res
      .status(400)
      .json({ error: 'Invalid interval. Supported: 1m, 5m, 15m, 30m, 60m, 1h, 4h, 1d.' });
    return;
  }

  const range = ALLOWED_RANGES.has(rawRange) ? rawRange : spec.defaultRange;

  const tdKey = process.env.TWELVEDATA_API_KEY?.trim();
  const fhKey = process.env.FINNHUB_API_KEY?.trim();
  const goldApiKey = (process.env.GOLDAPI_KEY ?? process.env.GOLD_API_KEY)?.trim();

  let result: { source: string; candles: OhlcBar[] } | null = null;

  if (tdKey) {
    result = await fetchTwelveDataXauUsd(spec, tdKey);
  }
  if (!result && fhKey) {
    result = await fetchFinnhubOandaXauUsd(spec, fhKey);
  }
  if (!result && goldApiKey) {
    result = await fetchGoldApiHistory(rawIv, spec, goldApiKey);
  }
  if (!result) {
    result = await fetchKeylessUtcSpotGoldFallback(spec);
  }

  if (!result || result.candles.length === 0) {
    res.status(502).json({ error: 'Unable to fetch live Spot Gold CFD (XAU/USD) candles.' });
    return;
  }

  res.status(200).json({
    symbol: 'XAUUSD',
    interval: rawIv,
    range,
    timezone: 'UTC',
    source: result.source,
    spotPrice: result.candles[result.candles.length - 1].close,
    candles: result.candles,
  });
}
