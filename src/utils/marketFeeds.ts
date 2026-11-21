// Live Market & Shorts APIs

export interface XauSpotResult {
  priceUsd: number;
  source: 'live' | 'snapshot';
  provider: string;
  updatedAt: string;
}

const FALLBACK_XAU_USD = 2664.8;

/**
 * Fetches real live XAU/USD spot gold price from public CORS-friendly APIs.
 * Falls back cleanly to a baseline snapshot if network access is restricted.
 */
export async function fetchRealXauGoldPrice(): Promise<XauSpotResult> {
  const nowLabel = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Primary: gold-api.com (live XAU spot in USD)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.gold-api.com/price/XAU', {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as { price?: number };
      if (typeof data?.price === 'number' && data.price > 500 && data.price < 15000) {
        return {
          priceUsd: Number(data.price.toFixed(2)),
          source: 'live',
          provider: 'Gold-API Spot',
          updatedAt: nowLabel,
        };
      }
    }
  } catch {
    // Try secondary live endpoint
  }

  // Secondary: fawazahmed0 currency-api (XAU -> USD)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json',
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as { xau?: { usd?: number } };
      const usdVal = data?.xau?.usd;
      if (typeof usdVal === 'number' && usdVal > 500 && usdVal < 15000) {
        return {
          priceUsd: Number(usdVal.toFixed(2)),
          source: 'live',
          provider: 'Global Bullion Feed',
          updatedAt: nowLabel,
        };
      }
    }
  } catch {
    // Fall back to snapshot
  }

  return {
    priceUsd: FALLBACK_XAU_USD,
    source: 'snapshot',
    provider: 'Spot Snapshot',
    updatedAt: nowLabel,
  };
}

export interface BtcSpotResult {
  priceUsd: number;
  source: 'live' | 'snapshot';
  provider: string;
  updatedAt: string;
}

const FALLBACK_BTC_USD = 91850;

/**
 * Fetches live BTC/USD spot price from public CORS-friendly APIs with a safe fallback.
 */
export async function fetchRealBtcPrice(): Promise<BtcSpotResult> {
  const nowLabel = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Primary: Coinbase public spot endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json()) as { data?: { amount?: string } };
      const parsed = Number(json?.data?.amount);
      if (Number.isFinite(parsed) && parsed > 1000) {
        return {
          priceUsd: Number(parsed.toFixed(2)),
          source: 'live',
          provider: 'Coinbase Spot',
          updatedAt: nowLabel,
        };
      }
    }
  } catch {
    // Try secondary BTC endpoint
  }

  // Secondary: fawazahmed0 currency-api (BTC -> USD)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/btc.json',
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as { btc?: { usd?: number } };
      const usdVal = data?.btc?.usd;
      if (typeof usdVal === 'number' && usdVal > 1000) {
        return {
          priceUsd: Number(usdVal.toFixed(2)),
          source: 'live',
          provider: 'Global Crypto Feed',
          updatedAt: nowLabel,
        };
      }
    }
  } catch {
    // Fallback to snapshot
  }

  return {
    priceUsd: FALLBACK_BTC_USD,
    source: 'snapshot',
    provider: 'BTC Snapshot',
    updatedAt: nowLabel,
  };
}

export interface LiveCandleBar {
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
}

const TV_TO_BINANCE_INTERVAL: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  D: '1d',
  W: '1w',
};

/**
 * Fetches live OHLCV candlesticks from Binance public REST API for any BINANCE:* pair.
 */
export async function fetchBinanceKlines(
  tvSymbol: string,
  tvInterval = '15',
  limit = 60
): Promise<LiveCandleBar[] | null> {
  if (!tvSymbol.startsWith('BINANCE:')) return null;
  const pair = tvSymbol.replace('BINANCE:', '').trim().toUpperCase();
  const binanceInterval = TV_TO_BINANCE_INTERVAL[tvInterval] ?? '15m';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${binanceInterval}&limit=${limit}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (!res.ok) return null;
    const raw = (await res.json()) as [
      number,
      string,
      string,
      string,
      string,
      string,
    ][];
    if (!Array.isArray(raw) || raw.length < 15) return null;

    return raw.map((row) => ({
      timeLabel: new Date(row[0]).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      vol: Math.max(10, Math.min(100, Number(row[5]) * 4)),
    }));
  } catch {
    return null;
  }
}

/**
 * Fetches live 1m BTCUSDT candlesticks from Binance public REST API when available.
 */
export async function fetchBtc1mCandles(limit = 40): Promise<LiveCandleBar[] | null> {
  return fetchBinanceKlines('BINANCE:BTCUSDT', '1', limit);
}

export interface CityInfo {
  name: string;
  hiName: string;
  lat: number;
  lon: number;
}

export const INDIAN_CITIES: CityInfo[] = [
  { name: 'New Delhi', hiName: 'नई दिल्ली', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', hiName: 'मुंबई', lat: 19.076, lon: 72.8777 },
  { name: 'Lucknow', hiName: 'लखनऊ', lat: 26.8467, lon: 80.9462 },
  { name: 'Patna', hiName: 'पटना', lat: 25.5941, lon: 85.1376 },
  { name: 'Jaipur', hiName: 'जयपुर', lat: 26.9124, lon: 75.7873 },
  { name: 'Bengaluru', hiName: 'बेंगलुरु', lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad', hiName: 'हैदराबाद', lat: 17.385, lon: 78.4867 },
  { name: 'Kolkata', hiName: 'कोलकाता', lat: 22.5726, lon: 88.3639 },
  { name: 'Pune', hiName: 'पुणे', lat: 18.5204, lon: 73.8567 },
  { name: 'Ahmedabad', hiName: 'अहमदाबाद', lat: 23.0225, lon: 72.5714 },
];

export interface CityWeatherResult {
  city: string;
  tempC: number;
  condition: string;
}

function decodeWeatherCode(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Haze / Fog';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Thunderstorm';
}

export async function fetchCityWeather(cityName: string): Promise<CityWeatherResult> {
  const target = INDIAN_CITIES.find((c) => c.name === cityName) ?? INDIAN_CITIES[0];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${target.lat}&longitude=${target.lon}&current=temperature_2m,weather_code`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (res.ok) {
      const json = (await res.json()) as {
        current?: { temperature_2m?: number; weather_code?: number };
      };
      if (typeof json.current?.temperature_2m === 'number') {
        return {
          city: target.name,
          tempC: Math.round(json.current.temperature_2m),
          condition: decodeWeatherCode(Number(json.current.weather_code ?? 0)),
        };
      }
    }
  } catch {
    // fallback below
  }
  return {
    city: target.name,
    tempC: 25,
    condition: 'Clear',
  };
}

export interface LiveMarketsSnapshot {
  updatedAt: string;
  source: 'live' | 'snapshot';
  xauUsd: number;
  xagUsd: number;
  btcUsd: number;
  assets: Array<{
    id: string;
    tvSymbol: string;
    displayPair: string;
    name: string;
    category: 'Metals' | 'Crypto' | 'Indices' | 'Commodities';
    livePrice: number;
    changePct24h: number;
    provider: string;
    unitLabel?: string;
  }>;
}

export async function fetchAllLiveMarkets(): Promise<LiveMarketsSnapshot> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const res = await fetch('/api/markets/live', {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = (await res.json()) as LiveMarketsSnapshot;
      if (Array.isArray(json.assets) && json.assets.length > 0) {
        return json;
      }
    }
  } catch {
    // Fallback to direct client-side public endpoints
  }

  const [xau, btc] = await Promise.all([fetchRealXauGoldPrice(), fetchRealBtcPrice()]);

  return {
    updatedAt: new Date().toISOString(),
    source: xau.source === 'live' || btc.source === 'live' ? 'live' : 'snapshot',
    xauUsd: xau.priceUsd,
    xagUsd: 31.42,
    btcUsd: btc.priceUsd,
    assets: [
      {
        id: 'xauusd',
        tvSymbol: 'OANDA:XAUUSD',
        displayPair: 'XAU/USD',
        name: 'Gold Spot (Troy Oz)',
        category: 'Metals',
        livePrice: xau.priceUsd,
        changePct24h: 0.64,
        provider: xau.provider,
        unitLabel: 'oz',
      },
      {
        id: 'xagusd',
        tvSymbol: 'OANDA:XAGUSD',
        displayPair: 'XAG/USD',
        name: 'Silver Spot (Troy Oz)',
        category: 'Metals',
        livePrice: 31.42,
        changePct24h: 0.42,
        provider: 'Bullion Snapshot',
        unitLabel: 'oz',
      },
      {
        id: 'btcusd',
        tvSymbol: 'BINANCE:BTCUSDT',
        displayPair: 'BTC/USD',
        name: 'Bitcoin',
        category: 'Crypto',
        livePrice: btc.priceUsd,
        changePct24h: 1.84,
        provider: btc.provider,
      },
      {
        id: 'ethusd',
        tvSymbol: 'BINANCE:ETHUSDT',
        displayPair: 'ETH/USD',
        name: 'Ethereum',
        category: 'Crypto',
        livePrice: 3145.5,
        changePct24h: 1.21,
        provider: 'Crypto Snapshot',
      },
      {
        id: 'solusd',
        tvSymbol: 'BINANCE:SOLUSDT',
        displayPair: 'SOL/USD',
        name: 'Solana',
        category: 'Crypto',
        livePrice: 218.4,
        changePct24h: 2.75,
        provider: 'Crypto Snapshot',
      },
      {
        id: 'bnbusd',
        tvSymbol: 'BINANCE:BNBUSDT',
        displayPair: 'BNB/USD',
        name: 'BNB',
        category: 'Crypto',
        livePrice: 624.8,
        changePct24h: 0.92,
        provider: 'Crypto Snapshot',
      },
    ],
  };
}


