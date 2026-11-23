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
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}

const INTERVAL_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

async function fetchJsonWithTimeout<T>(
  url: string,
  ms = 4500,
  headers?: Record<string, string>
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchLiveGoldSpot(): Promise<number | null> {
  const sqData = await fetchJsonWithTimeout<
    Array<{ spreadProfilePrices?: Array<{ bid?: number; ask?: number }> }>
  >('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD', 2600);
  const sqQuote = sqData?.[0]?.spreadProfilePrices?.[0];
  if (
    typeof sqQuote?.bid === 'number' &&
    typeof sqQuote?.ask === 'number' &&
    sqQuote.bid > 500 &&
    sqQuote.ask > 500
  ) {
    return Number(((sqQuote.bid + sqQuote.ask) / 2).toFixed(2));
  }

  const goldApi = await fetchJsonWithTimeout<{ price?: number }>(
    'https://api.gold-api.com/price/XAU',
    2500
  );
  if (typeof goldApi?.price === 'number' && goldApi.price > 500) {
    return Number(goldApi.price.toFixed(2));
  }

  return null;
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
  if (typeof req.query?.interval === 'string') {
    rawIv = req.query.interval.trim().toLowerCase();
  } else if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      const ivParam = parsed.searchParams.get('interval');
      if (ivParam) rawIv = ivParam.trim().toLowerCase();
    } catch {
      // keep default 15m
    }
  }

  const ivSec = INTERVAL_SECONDS[rawIv];
  if (!ivSec) {
    res.status(400).json({ error: 'Invalid interval. Supported: 1m, 5m, 15m, 30m, 1h, 4h, 1d.' });
    return;
  }

  const yahooIv = rawIv === '4h' ? '1h' : rawIv;
  const range =
    rawIv === '1m'
      ? '1d'
      : rawIv === '5m' || rawIv === '15m'
        ? '5d'
        : rawIv === '30m' || rawIv === '1h'
          ? '1mo'
          : rawIv === '4h'
            ? '3mo'
            : '1y';

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=${yahooIv}&range=${range}`;
  const [yahooJson, liveSpot] = await Promise.all([
    fetchJsonWithTimeout<YahooChartResponse>(yahooUrl, 5000, {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
    }),
    fetchLiveGoldSpot(),
  ]);

  const result = yahooJson?.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0];
  const byTime = new Map<number, OhlcBar>();

  if (q && ts.length > 0) {
    for (let i = 0; i < ts.length; i += 1) {
      const t = ts[i];
      const open = q.open?.[i];
      const high = q.high?.[i];
      const low = q.low?.[i];
      const close = q.close?.[i];
      if (
        typeof t === 'number' &&
        typeof open === 'number' &&
        typeof high === 'number' &&
        typeof low === 'number' &&
        typeof close === 'number' &&
        [t, open, high, low, close].every(Number.isFinite)
      ) {
        const bucketTime = Math.floor(t / ivSec) * ivSec;
        const prev = byTime.get(bucketTime);
        if (!prev) {
          byTime.set(bucketTime, {
            time: bucketTime,
            open: Number(open.toFixed(2)),
            high: Number(high.toFixed(2)),
            low: Number(low.toFixed(2)),
            close: Number(close.toFixed(2)),
          });
        } else {
          prev.high = Number(Math.max(prev.high, high).toFixed(2));
          prev.low = Number(Math.min(prev.low, low).toFixed(2));
          prev.close = Number(close.toFixed(2));
        }
      }
    }
  }

  let candles = Array.from(byTime.values())
    .sort((a, b) => a.time - b.time)
    .slice(-180);

  const anchorSpot =
    typeof liveSpot === 'number'
      ? liveSpot
      : typeof result?.meta?.regularMarketPrice === 'number' &&
          Number.isFinite(result.meta.regularMarketPrice)
        ? Number(result.meta.regularMarketPrice.toFixed(2))
        : null;

  if (anchorSpot !== null && candles.length > 0) {
    const latest = candles[candles.length - 1];
    const basis = anchorSpot - latest.close;
    if (Math.abs(basis) > 0.01 && Math.abs(basis) < anchorSpot * 0.05) {
      candles = candles.map((bar) => ({
        time: bar.time,
        open: Number((bar.open + basis).toFixed(2)),
        high: Number((bar.high + basis).toFixed(2)),
        low: Number((bar.low + basis).toFixed(2)),
        close: Number((bar.close + basis).toFixed(2)),
      }));
    }
  }

  if (candles.length === 0) {
    res.status(502).json({ error: 'Unable to fetch live XAU/USD candles from Yahoo Finance.' });
    return;
  }

  res.status(200).json({
    symbol: 'XAUUSD',
    interval: rawIv,
    source: 'yahoo',
    spotPrice: candles[candles.length - 1].close,
    candles,
  });
}
