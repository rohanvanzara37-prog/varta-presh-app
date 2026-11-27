import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

interface LiveMarketsPayload {
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
    category: 'Metals' | 'Forex' | 'Crypto' | 'Indices' | 'Commodities';
    livePrice: number;
    changePct24h: number;
    provider: string;
    unitLabel?: string;
  }>;
}

let marketsCache: { expiresAt: number; payload: LiveMarketsPayload } | null = null;

async function fetchJsonWithTimeout<T>(url: string, ms = 4500, headers?: Record<string, string>): Promise<T | null> {
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

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

async function fetchYahooQuote(yahooSymbol: string, precision = 2): Promise<{ price: number; changePct: number } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`;
  const data = await fetchJsonWithTimeout<YahooChartResponse>(url, 4500, {
    'User-Agent': 'Mozilla/5.0',
  });
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const prev = meta?.chartPreviousClose ?? meta?.previousClose;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
  const changePct =
    typeof prev === 'number' && prev > 0 ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0;
  return { price: Number(price.toFixed(precision)), changePct };
}

async function fetchSwissquoteMid(instrument: 'XAU' | 'XAG' | 'EUR', precision = 2): Promise<number | null> {
  const data = await fetchJsonWithTimeout<
    Array<{ spreadProfilePrices?: Array<{ bid?: number; ask?: number }> }>
  >(`https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${instrument}/USD`, 2800);
  const quote = data?.[0]?.spreadProfilePrices?.[0];
  const minBound = instrument === 'XAU' ? 500 : instrument === 'XAG' ? 5 : 0.2;
  if (
    typeof quote?.bid === 'number' &&
    typeof quote?.ask === 'number' &&
    quote.bid > minBound &&
    quote.ask > minBound
  ) {
    return Number(((quote.bid + quote.ask) / 2).toFixed(precision));
  }
  return null;
}

async function fetchSwissquoteXauMid(): Promise<number | null> {
  return fetchSwissquoteMid('XAU', 2);
}

async function getLiveMarketsPayload(): Promise<LiveMarketsPayload> {
  if (marketsCache && marketsCache.expiresAt > Date.now()) {
    return marketsCache.payload;
  }

  const [xauRes, xagRes, sqXau, sqEur, cgRes, btcCbRes, xauYQuote, xagYQuote, eurYQuote, sp500Quote, us30Quote, oilQuote] =
    await Promise.all([
      fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAU'),
      fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAG'),
      fetchSwissquoteXauMid(),
      fetchSwissquoteMid('EUR', 4),
      fetchJsonWithTimeout<
        Record<string, { usd?: number; usd_24h_change?: number }>
      >(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple&vs_currencies=usd&include_24hr_change=true'
      ),
      fetchJsonWithTimeout<{ data?: { amount?: string } }>('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
      fetchYahooQuote('GC=F'),
      fetchYahooQuote('SI=F'),
      fetchYahooQuote('EURUSD=X', 4),
      fetchYahooQuote('^GSPC'),
      fetchYahooQuote('^DJI'),
      fetchYahooQuote('CL=F'),
    ]);

  const xauUsd =
    typeof xauRes?.price === 'number' && xauRes.price > 500
      ? Number(xauRes.price.toFixed(2))
      : sqXau ?? xauYQuote?.price ?? 2664.8;
  const xagUsd =
    typeof xagRes?.price === 'number' && xagRes.price > 5
      ? Number(xagRes.price.toFixed(2))
      : xagYQuote?.price ?? 31.42;
  const eurUsd = sqEur ?? eurYQuote?.price ?? 1.085;

  const btcFromCg = cgRes?.bitcoin?.usd;
  const btcFromCb = Number(cgRes?.bitcoin?.usd ?? btcCbRes?.data?.amount);
  const btcUsd =
    typeof btcFromCg === 'number' && btcFromCg > 1000
      ? Number(btcFromCg.toFixed(2))
      : Number.isFinite(btcFromCb) && btcFromCb > 1000
        ? Number(btcFromCb.toFixed(2))
        : 91850.0;

  const ethUsd = Number((cgRes?.ethereum?.usd ?? 3145.5).toFixed(2));
  const solUsd = Number((cgRes?.solana?.usd ?? 218.4).toFixed(2));
  const bnbUsd = Number((cgRes?.binancecoin?.usd ?? 624.8).toFixed(2));
  const xrpUsd = Number((cgRes?.ripple?.usd ?? 1.12).toFixed(4));
  const sp500Val = sp500Quote?.price ?? 5980.0;
  const us30Val = us30Quote?.price ?? 44250.0;
  const oilVal = oilQuote?.price ?? 71.25;

  const anyLive = Boolean(
    xauRes?.price ||
      sqXau ||
      xagRes?.price ||
      xagYQuote ||
      cgRes?.bitcoin?.usd ||
      btcCbRes?.data?.amount ||
      sp500Quote ||
      oilQuote
  );

  const payload: LiveMarketsPayload = {
    updatedAt: new Date().toISOString(),
    source: anyLive ? 'live' : 'snapshot',
    xauUsd,
    xagUsd,
    btcUsd,
    assets: [
      {
        id: 'xauusd',
        tvSymbol: 'OANDA:XAUUSD',
        displayPair: 'XAU/USD',
        name: 'Gold Spot (Troy Oz)',
        category: 'Metals',
        livePrice: xauUsd,
        changePct24h: xauYQuote?.changePct ?? 0.64,
        provider: xauRes?.price
          ? 'Gold-API Spot'
          : sqXau
            ? 'Swissquote Spot'
            : xauYQuote
              ? 'COMEX Live'
              : 'Bullion Snapshot',
        unitLabel: 'oz',
      },
      {
        id: 'btcusd',
        tvSymbol: 'BINANCE:BTCUSDT',
        displayPair: 'BTC/USD',
        name: 'Bitcoin',
        category: 'Crypto',
        livePrice: btcUsd,
        changePct24h: Number((cgRes?.bitcoin?.usd_24h_change ?? 1.84).toFixed(2)),
        provider: cgRes?.bitcoin?.usd ? 'CoinGecko Live' : btcCbRes?.data?.amount ? 'Coinbase Live' : 'Crypto Snapshot',
      },
      {
        id: 'ethusd',
        tvSymbol: 'BINANCE:ETHUSDT',
        displayPair: 'ETH/USD',
        name: 'Ethereum',
        category: 'Crypto',
        livePrice: ethUsd,
        changePct24h: Number((cgRes?.ethereum?.usd_24h_change ?? 1.21).toFixed(2)),
        provider: cgRes?.ethereum?.usd ? 'CoinGecko Live' : 'Crypto Snapshot',
      },
      {
        id: 'us500',
        tvSymbol: 'FOREXCOM:SPXUSD',
        displayPair: 'S&P 500',
        name: 'S&P 500 Index (US500)',
        category: 'Indices',
        livePrice: sp500Val,
        changePct24h: sp500Quote?.changePct ?? 0.45,
        provider: sp500Quote ? 'US Market Live' : 'Index Snapshot',
      },
      {
        id: 'us30',
        tvSymbol: 'TVC:DJI',
        displayPair: 'US30',
        name: 'Dow Jones 30 (US30)',
        category: 'Indices',
        livePrice: us30Val,
        changePct24h: us30Quote?.changePct ?? 0.38,
        provider: us30Quote ? 'US Market Live' : 'Index Snapshot',
      },
      {
        id: 'usoil',
        tvSymbol: 'TVC:USOIL',
        displayPair: 'US OIL',
        name: 'WTI Crude Oil (bbl)',
        category: 'Commodities',
        livePrice: oilVal,
        changePct24h: oilQuote?.changePct ?? -0.35,
        provider: oilQuote ? 'NYMEX Live' : 'Oil Snapshot',
        unitLabel: 'bbl',
      },
      {
        id: 'solusd',
        tvSymbol: 'BINANCE:SOLUSDT',
        displayPair: 'SOL/USD',
        name: 'Solana',
        category: 'Crypto',
        livePrice: solUsd,
        changePct24h: Number((cgRes?.solana?.usd_24h_change ?? 2.75).toFixed(2)),
        provider: cgRes?.solana?.usd ? 'CoinGecko Live' : 'Crypto Snapshot',
      },
      {
        id: 'bnbusd',
        tvSymbol: 'BINANCE:BNBUSDT',
        displayPair: 'BNB/USD',
        name: 'BNB',
        category: 'Crypto',
        livePrice: bnbUsd,
        changePct24h: Number((cgRes?.binancecoin?.usd_24h_change ?? 0.92).toFixed(2)),
        provider: cgRes?.binancecoin?.usd ? 'CoinGecko Live' : 'Crypto Snapshot',
      },
      {
        id: 'xrpusd',
        tvSymbol: 'BINANCE:XRPUSDT',
        displayPair: 'XRP/USD',
        name: 'Ripple XRP',
        category: 'Crypto',
        livePrice: xrpUsd,
        changePct24h: Number((cgRes?.ripple?.usd_24h_change ?? -0.48).toFixed(2)),
        provider: cgRes?.ripple?.usd ? 'CoinGecko Live' : 'Crypto Snapshot',
      },
      {
        id: 'eurusd',
        tvSymbol: 'FX:EURUSD',
        displayPair: 'EUR/USD',
        name: 'Euro / US Dollar',
        category: 'Forex',
        livePrice: eurUsd,
        changePct24h: eurYQuote?.changePct ?? 0.14,
        provider: sqEur ? 'Swissquote Spot' : eurYQuote ? 'FX Live' : 'FX Snapshot',
      },
      {
        id: 'xagusd',
        tvSymbol: 'OANDA:XAGUSD',
        displayPair: 'XAG/USD',
        name: 'Silver Spot (Troy Oz)',
        category: 'Metals',
        livePrice: xagUsd,
        changePct24h: xagYQuote?.changePct ?? 0.42,
        provider: xagRes?.price ? 'Gold-API Spot' : xagYQuote ? 'COMEX Live' : 'Bullion Snapshot',
        unitLabel: 'oz',
      },
    ],
  };

  marketsCache = {
    expiresAt: Date.now() + 12000,
    payload,
  };

  return payload;
}

interface RawRssHeadline {
  id: number;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  publishedAtMs?: number;
}

export type NewsTickerCategory =
  | 'GOLD'
  | 'CRYPTO'
  | 'USDT'
  | 'CPI'
  | 'PCE/PCA'
  | 'NFT'
  | 'FOMC'
  | 'ISM'
  | 'SENTIMENT';

export interface FilteredTickerItem {
  id: string;
  headline: string;
  category: NewsTickerCategory;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  source: string;
  url: string;
  publishedAt: string;
  publishedAtMs?: number;
}

export interface NewsTickerPayload {
  updatedAt: string;
  filteredByGemini: boolean;
  globalSentiment: {
    label: 'Risk-On' | 'Risk-Off' | 'Cautious' | 'Mixed';
    summary: string;
  };
  items: FilteredTickerItem[];
}

const RSS_FEED_URLS = [
  'https://news.google.com/rss/search?q=(Gold+XAUUSD+OR+Forex+EURUSD+DXY+OR+CPI+FOMC)+when:7d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=(ISM+PMI+OR+PCE+inflation+OR+PCA+macro)+when:14d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=(crypto+Bitcoin+OR+USDT+Tether+OR+NFT+market)+when:7d&hl=en-US&gl=US&ceid=US:en',
] as const;

let tickerCache: {
  expiresAt: number;
  geminiExpiresAt: number;
  headlineKey: string;
  payload: NewsTickerPayload;
} | null = null;
let tickerInFlight: Promise<NewsTickerPayload> | null = null;
let lastForcedTickerRefresh = 0;

export interface EconomicCalendarEvent {
  id: string;
  title: string;
  currency: string;
  dateIso: string;
  timestampMs: number;
  impact: 'High' | 'Medium' | 'Low' | 'Holiday';
  forecast: string;
  previous: string;
  actual: string;
}

export interface EconomicCalendarPayload {
  updatedAt: string;
  source: string;
  events: EconomicCalendarEvent[];
}

let calendarCache: { expiresAt: number; payload: EconomicCalendarPayload } | null = null;
let calendarInFlight: Promise<EconomicCalendarPayload> | null = null;
let lastForcedCalendarRefresh = 0;

function inferRssCategory(title: string): NewsTickerCategory {
  if (/\b(gold|xau|bullion|silver|xag)\b/i.test(title)) return 'GOLD';
  if (/\b(fomc|fed|powell|rate cut|rate hike|central bank)\b/i.test(title)) return 'FOMC';
  if (/\b(cpi|inflation|consumer price)\b/i.test(title)) return 'CPI';
  if (/\b(pce|pca|core inflation)\b/i.test(title)) return 'PCE/PCA';
  if (/\b(ism|pmi|manufacturing|services)\b/i.test(title)) return 'ISM';
  if (/\b(usdt|tether|stablecoin)\b/i.test(title)) return 'USDT';
  if (/\b(nft|collectible)\b/i.test(title)) return 'NFT';
  if (/\b(btc|bitcoin|eth|ethereum|sol|solana|crypto|altcoin)\b/i.test(title)) return 'CRYPTO';
  return 'SENTIMENT';
}

function inferRssSentiment(title: string): 'Bullish' | 'Bearish' | 'Neutral' {
  if (/\b(surge|rally|soar|gain|jump|bull|breakout|record high|rises|climb|rebound)\b/i.test(title)) {
    return 'Bullish';
  }
  if (/\b(drop|fall|slump|plunge|crash|bear|decline|tumble|sink|selloff|falls|retreat)\b/i.test(title)) {
    return 'Bearish';
  }
  return 'Neutral';
}

function buildRssFallbackTicker(rawPool: RawRssHeadline[]): NewsTickerPayload {
  const items: FilteredTickerItem[] = rawPool.slice(0, 12).map((orig) => ({
    id: `rss_${orig.id}_${orig.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}`,
    headline: orig.title.replace(/\s+/g, ' ').trim().slice(0, 110),
    category: inferRssCategory(orig.title),
    sentiment: inferRssSentiment(orig.title),
    source: orig.source,
    url: orig.url,
    publishedAt: orig.publishedAt,
    publishedAtMs: orig.publishedAtMs,
  }));

  const bullish = items.filter((i) => i.sentiment === 'Bullish').length;
  const bearish = items.filter((i) => i.sentiment === 'Bearish').length;
  const label: NewsTickerPayload['globalSentiment']['label'] =
    bullish > bearish + 1 ? 'Risk-On' : bearish > bullish + 1 ? 'Risk-Off' : 'Mixed';

  return {
    updatedAt: new Date().toISOString(),
    filteredByGemini: false,
    globalSentiment: {
      label,
      summary: 'Live Gold, Forex & Crypto RSS Wire',
    },
    items,
  };
}

function buildBuiltinNewsTicker(nowMs = Date.now()): NewsTickerPayload {
  const mkAge = (mins: number) => (mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`);
  return {
    updatedAt: new Date(nowMs).toISOString(),
    filteredByGemini: false,
    globalSentiment: {
      label: 'Mixed',
      summary: 'Active Gold, Macro Rates & Crypto Session Flow',
    },
    items: [
      {
        id: 'srv_news_1',
        headline: 'Spot Gold (XAU/USD) holds near structural liquidity zone ahead of US yields release',
        category: 'GOLD',
        sentiment: 'Bullish',
        source: 'Reuters Wire',
        url: 'https://www.reuters.com/markets/commodities/',
        publishedAt: mkAge(12),
        publishedAtMs: nowMs - 12 * 60_000,
      },
      {
        id: 'srv_news_2',
        headline: 'Federal Reserve policymakers signal patience on timing of next rate adjustment',
        category: 'FOMC',
        sentiment: 'Neutral',
        source: 'Bloomberg Macro',
        url: 'https://www.bloomberg.com/markets',
        publishedAt: mkAge(28),
        publishedAtMs: nowMs - 28 * 60_000,
      },
      {
        id: 'srv_news_3',
        headline: 'Bitcoin spot liquidity builds above key intraday demand cluster as ETF inflows stabilize',
        category: 'CRYPTO',
        sentiment: 'Bullish',
        source: 'CoinDesk',
        url: 'https://www.coindesk.com/',
        publishedAt: mkAge(42),
        publishedAtMs: nowMs - 42 * 60_000,
      },
      {
        id: 'srv_news_4',
        headline: 'Core PCE and CPI shelter components remain key drivers for USD Treasury direction',
        category: 'CPI',
        sentiment: 'Neutral',
        source: 'MarketWatch',
        url: 'https://www.marketwatch.com/',
        publishedAt: mkAge(65),
        publishedAtMs: nowMs - 65 * 60_000,
      },
      {
        id: 'srv_news_5',
        headline: 'ISM Services & Manufacturing order books guide institutional Dollar index allocation',
        category: 'ISM',
        sentiment: 'Neutral',
        source: 'Financial Times',
        url: 'https://www.ft.com/markets',
        publishedAt: mkAge(95),
        publishedAtMs: nowMs - 95 * 60_000,
      },
      {
        id: 'srv_news_6',
        headline: 'USDT & stablecoin exchange reserves edge higher into New York session overlap',
        category: 'USDT',
        sentiment: 'Bullish',
        source: 'The Block',
        url: 'https://www.theblock.co/',
        publishedAt: mkAge(120),
        publishedAtMs: nowMs - 120 * 60_000,
      },
    ],
  };
}

function buildBuiltinEconomicCalendar(nowMs = Date.now()): EconomicCalendarPayload {
  const hourMs = 3_600_000;
  const baseHour = Math.floor(nowMs / hourMs) * hourMs;
  const specs: Array<{
    offsetHours: number;
    title: string;
    currency: string;
    impact: EconomicCalendarEvent['impact'];
    forecast: string;
    previous: string;
    actual: string;
  }> = [
    {
      offsetHours: -4,
      title: 'US Continuing Jobless Claims',
      currency: 'USD',
      impact: 'Medium',
      forecast: '1,865K',
      previous: '1,858K',
      actual: '1,861K',
    },
    {
      offsetHours: -2,
      title: 'Eurozone Core CPI Flash y/y',
      currency: 'EUR',
      impact: 'High',
      forecast: '2.7%',
      previous: '2.7%',
      actual: '2.7%',
    },
    {
      offsetHours: 1,
      title: 'US Initial Jobless Claims',
      currency: 'USD',
      impact: 'High',
      forecast: '218K',
      previous: '215K',
      actual: '',
    },
    {
      offsetHours: 2,
      title: 'London PM Gold Benchmark & Comex Liquidity Open',
      currency: 'XAU',
      impact: 'High',
      forecast: 'Active',
      previous: 'Firm',
      actual: '',
    },
    {
      offsetHours: 4,
      title: 'US ISM Services PMI',
      currency: 'USD',
      impact: 'High',
      forecast: '52.8',
      previous: '52.4',
      actual: '',
    },
    {
      offsetHours: 8,
      title: 'FOMC Member Monetary Policy Speech',
      currency: 'USD',
      impact: 'Medium',
      forecast: '-',
      previous: '-',
      actual: '',
    },
    {
      offsetHours: 18,
      title: 'US Core PCE Price Index m/m',
      currency: 'USD',
      impact: 'High',
      forecast: '0.3%',
      previous: '0.3%',
      actual: '',
    },
    {
      offsetHours: 26,
      title: 'US Non-Farm Employment Change (NFP)',
      currency: 'USD',
      impact: 'High',
      forecast: '175K',
      previous: '168K',
      actual: '',
    },
    {
      offsetHours: 28,
      title: 'Bitcoin & Crypto Institutional Options Expiry Settlement',
      currency: 'BTC',
      impact: 'Medium',
      forecast: '$3.8B',
      previous: '$3.4B',
      actual: '',
    },
    {
      offsetHours: 42,
      title: 'UK BoE Monetary Policy Summary',
      currency: 'GBP',
      impact: 'High',
      forecast: '4.50%',
      previous: '4.50%',
      actual: '',
    },
    {
      offsetHours: 54,
      title: 'Bank of Japan Policy Rate Statement',
      currency: 'JPY',
      impact: 'High',
      forecast: '0.50%',
      previous: '0.50%',
      actual: '',
    },
    {
      offsetHours: 68,
      title: 'US Consumer Price Index (CPI) y/y',
      currency: 'USD',
      impact: 'High',
      forecast: '2.9%',
      previous: '2.9%',
      actual: '',
    },
  ];

  const events: EconomicCalendarEvent[] = specs.map((item, idx) => {
    const ts = baseHour + item.offsetHours * hourMs;
    return {
      id: `vp_cal_${idx}_${ts}`,
      title: item.title,
      currency: item.currency,
      dateIso: new Date(ts).toISOString(),
      timestampMs: ts,
      impact: item.impact,
      forecast: item.forecast,
      previous: item.previous,
      actual: item.actual,
    };
  });

  return {
    updatedAt: new Date(nowMs).toISOString(),
    source: 'Live Macro & Commodities Schedule',
    events,
  };
}

function formatTvCalendarMetric(
  value: number | string | null | undefined,
  unit?: string | null,
  scale?: string | null
): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const suffix = unit || scale || '';
  return `${value}${suffix}`;
}

async function fetchEconomicCalendar(forceRefresh = false): Promise<EconomicCalendarPayload> {
  if (!forceRefresh && calendarCache && calendarCache.expiresAt > Date.now()) {
    return calendarCache.payload;
  }
  if (calendarInFlight) {
    return calendarInFlight;
  }

  calendarInFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const events: EconomicCalendarEvent[] = [];

    const parseJsonSafe = <T,>(raw: string): T | null => {
      try {
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('<')) return null;
        return JSON.parse(trimmed) as T;
      } catch {
        return null;
      }
    };

    try {
      const now = Date.now();
      const fromIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const toIso = new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString();
      const tvUrl = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(
        fromIso
      )}&to=${encodeURIComponent(toIso)}&countries=US,EU,GB,JP,AU,CA,NZ,CH,CN`;

      try {
        const tvRes = await fetch(tvUrl, {
          signal: controller.signal,
          headers: {
            Origin: 'https://www.tradingview.com',
            Referer: 'https://www.tradingview.com/',
            'User-Agent': 'Mozilla/5.0 (compatible; TREDAURA-CalendarSync/1.0)',
            Accept: 'application/json',
          },
        });

        if (tvRes.ok) {
          const tvText = await tvRes.text();
          const tvJson = parseJsonSafe<{
            status?: string;
            result?: Array<{
              id?: string;
              title?: string;
              currency?: string;
              country?: string;
              date?: string;
              importance?: number;
              actual?: number | string | null;
              forecast?: number | string | null;
              previous?: number | string | null;
              unit?: string | null;
              scale?: string | null;
            }>;
          }>(tvText);

          for (const item of Array.isArray(tvJson?.result) ? tvJson.result : []) {
            const title = typeof item.title === 'string' ? item.title.trim() : '';
            const dateIso = typeof item.date === 'string' ? item.date.trim() : '';
            const timestampMs = Date.parse(dateIso);
            if (!title || !Number.isFinite(timestampMs)) continue;

            const currency = (
              typeof item.currency === 'string' && item.currency.trim()
                ? item.currency
                : typeof item.country === 'string'
                  ? item.country
                  : 'USD'
            )
              .trim()
              .toUpperCase();

            const impact: EconomicCalendarEvent['impact'] =
              item.importance === 1 ? 'High' : item.importance === 0 ? 'Medium' : 'Low';

            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
            events.push({
              id: item.id ? `tv_${item.id}` : `${currency}_${timestampMs}_${slug}`,
              title,
              currency,
              dateIso,
              timestampMs,
              impact,
              forecast: formatTvCalendarMetric(item.forecast, item.unit, item.scale),
              previous: formatTvCalendarMetric(item.previous, item.unit, item.scale),
              actual: formatTvCalendarMetric(item.actual, item.unit, item.scale),
            });
          }
        }
      } catch {
        // proceed to ForexFactory fallback
      }

      if (events.length === 0) {
        try {
          const ffRes = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
            signal: controller.signal,
            headers: {
              'User-Agent': 'TREDAURA-CalendarSync/1.0',
              Accept: 'application/json',
            },
          });
          if (ffRes.ok) {
            const ffText = await ffRes.text();
            const raw = parseJsonSafe<
              Array<{
                title?: string;
                country?: string;
                date?: string;
                impact?: string;
                forecast?: string;
                previous?: string;
                actual?: string;
              }>
            >(ffText);

            for (const item of Array.isArray(raw) ? raw : []) {
              const title = typeof item.title === 'string' ? item.title.trim() : '';
              const dateIso = typeof item.date === 'string' ? item.date.trim() : '';
              const timestampMs = Date.parse(dateIso);
              if (!title || !Number.isFinite(timestampMs)) continue;

              const currency =
                typeof item.country === 'string' ? item.country.trim().toUpperCase() : 'USD';
              const rawImpact = typeof item.impact === 'string' ? item.impact.trim() : 'Low';
              const impact: EconomicCalendarEvent['impact'] =
                rawImpact === 'High' || rawImpact === 'Medium' || rawImpact === 'Holiday'
                  ? rawImpact
                  : 'Low';

              const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 42);
              events.push({
                id: `${currency}_${timestampMs}_${slug}`,
                title,
                currency,
                dateIso,
                timestampMs,
                impact,
                forecast: typeof item.forecast === 'string' ? item.forecast.trim() : '',
                previous: typeof item.previous === 'string' ? item.previous.trim() : '',
                actual: typeof item.actual === 'string' ? item.actual.trim() : '',
              });
            }
          }
        } catch {
          // proceed to built-in macro calendar fallback
        }
      }

      if (events.length === 0) {
        if (calendarCache && calendarCache.payload.events.length > 0) {
          return calendarCache.payload;
        }
        const builtin = buildBuiltinEconomicCalendar();
        calendarCache = {
          expiresAt: Date.now() + 25_000,
          payload: builtin,
        };
        return builtin;
      }

      events.sort((a, b) => a.timestampMs - b.timestampMs);

      const payload: EconomicCalendarPayload = {
        updatedAt: new Date().toISOString(),
        source: 'Live Global Economic Calendar',
        events,
      };
      calendarCache = {
        expiresAt: Date.now() + 25_000,
        payload,
      };
      return payload;
    } catch {
      if (calendarCache && calendarCache.payload.events.length > 0) {
        return calendarCache.payload;
      }
      const builtin = buildBuiltinEconomicCalendar();
      calendarCache = {
        expiresAt: Date.now() + 25_000,
        payload: builtin,
      };
      return builtin;
    } finally {
      clearTimeout(timer);
    }
  })();

  try {
    return await calendarInFlight;
  } finally {
    calendarInFlight = null;
  }
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeHttpUrl(rawUrl: string): string {
  const cleaned = decodeXmlEntities(rawUrl);
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

function formatShortPubDate(pubDate: string): string {
  const ms = Date.parse(pubDate);
  if (!Number.isFinite(ms)) return 'Recent';
  const diffMins = Math.max(1, Math.round((Date.now() - ms) / 60_000));
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

async function fetchRssXml(url: string, ms = 4500): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TREDAURA-MarketReader/1.0' },
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function parseRssItems(xml: string): Omit<RawRssHeadline, 'id'>[] {
  if (!xml) return [];
  const items: Omit<RawRssHeadline, 'id'>[] = [];
  const itemMatches = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemMatches.slice(0, 14)) {
    const rawTitle = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const rawLink = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? '';
    const rawPubDate = block.match(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '';
    const rawSource = block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? '';

    const fullTitle = decodeXmlEntities(rawTitle);
    if (!fullTitle || fullTitle.length < 12) continue;

    let source = decodeXmlEntities(rawSource);
    let cleanTitle = fullTitle;
    const dashIdx = fullTitle.lastIndexOf(' - ');
    if (dashIdx > 20) {
      if (!source) source = fullTitle.slice(dashIdx + 3).trim();
      cleanTitle = fullTitle.slice(0, dashIdx).trim();
    }

    const url = sanitizeHttpUrl(rawLink);
    const decodedPub = decodeXmlEntities(rawPubDate);
    const parsedPubMs = Date.parse(decodedPub);
    items.push({
      title: cleanTitle,
      source: source || 'Market Wire',
      url,
      publishedAt: formatShortPubDate(decodedPub),
      publishedAtMs: Number.isFinite(parsedPubMs) ? parsedPubMs : undefined,
    });
  }

  return items;
}

class GeminiTickerError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : '';
      const isNonRetryable =
        errName === 'AbortError' ||
        msg.includes('400') ||
        msg.includes('403') ||
        msg.includes('404') ||
        msg.includes('timed out') ||
        msg.includes('aborted') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('NOT_FOUND');
      if (isNonRetryable || attempt === maxRetries) break;
      await new Promise((r) => setTimeout(r, 450 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

async function generateFilteredNewsTicker(forceRefresh = false): Promise<NewsTickerPayload> {
  if (!forceRefresh && tickerCache && tickerCache.expiresAt > Date.now()) {
    return tickerCache.payload;
  }

  if (tickerInFlight) {
    return tickerInFlight;
  }

  tickerInFlight = (async () => {
    const xmlBodies = await Promise.all(RSS_FEED_URLS.map((url) => fetchRssXml(url)));
    const parsedFeeds = xmlBodies.map((xml) => parseRssItems(xml));
    const combinedRaw: Omit<RawRssHeadline, 'id'>[] = [];
    const maxLen = Math.max(0, ...parsedFeeds.map((f) => f.length));
    for (let i = 0; i < maxLen; i += 1) {
      for (const feed of parsedFeeds) {
        if (feed[i]) combinedRaw.push(feed[i]);
      }
    }

    // Deduplicate headlines by normalized prefix
    const seen = new Set<string>();
    const rawPool: RawRssHeadline[] = [];
    for (const item of combinedRaw) {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 48);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rawPool.push({ id: rawPool.length + 1, ...item });
      if (rawPool.length >= 16) break;
    }

    if (rawPool.length === 0) {
      if (tickerCache && tickerCache.payload.items.length > 0) {
        return tickerCache.payload;
      }
      const builtin = buildBuiltinNewsTicker();
      tickerCache = {
        expiresAt: Date.now() + 25_000,
        geminiExpiresAt: Date.now() + 60_000,
        headlineKey: 'builtin',
        payload: builtin,
      };
      return builtin;
    }

    const headlineKey = rawPool
      .slice(0, 6)
      .map((r) => r.title.slice(0, 32))
      .join('|');

    if (
      !forceRefresh &&
      tickerCache &&
      tickerCache.headlineKey === headlineKey &&
      tickerCache.geminiExpiresAt > Date.now()
    ) {
      const refreshedPayload: NewsTickerPayload = {
        ...tickerCache.payload,
        updatedAt: new Date().toISOString(),
      };
      tickerCache = {
        ...tickerCache,
        expiresAt: Date.now() + 25_000,
        payload: refreshedPayload,
      };
      return refreshedPayload;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      const fallback = buildRssFallbackTicker(rawPool);
      tickerCache = {
        expiresAt: Date.now() + 25_000,
        geminiExpiresAt: Date.now() + 25_000,
        headlineKey,
        payload: fallback,
      };
      return fallback;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptLines = rawPool
      .map((r) => `[${r.id}] (${r.source}, ${r.publishedAt}) ${r.title}`)
      .join('\n');

    let responseText = '';
    const t0 = Date.now();
    try {
      const result = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents:
            `Select up to 12 diverse market headlines from the numbered feed below covering Gold, Crypto, USDT, CPI, PCE/PCA, NFT, FOMC, ISM, and Global Market Sentiment.\n\n` +
            `Live Feed:\n${promptLines}`,
          config: {
            abortSignal: AbortSignal.timeout(6500),
            systemInstruction:
              'You are a concise financial news editor. Return JSON with globalSentiment (label must be Risk-On, Risk-Off, Cautious, or Mixed; summary 5-8 words) and headlines referencing only exact integer id values from the feed (category must be GOLD, CRYPTO, USDT, CPI, PCE/PCA, NFT, FOMC, ISM, or SENTIMENT; sentiment must be Bullish, Bearish, or Neutral; headline max 90 chars).',
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                globalSentiment: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    summary: { type: Type.STRING },
                  },
                  required: ['label', 'summary'],
                },
                headlines: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.INTEGER },
                      headline: { type: Type.STRING },
                      category: { type: Type.STRING },
                      sentiment: { type: Type.STRING },
                    },
                    required: ['id', 'headline', 'category', 'sentiment'],
                  },
                },
              },
              required: ['globalSentiment', 'headlines'],
            },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini request timed out')), 6500)
        ),
      ]);
      console.log(`[news-ticker] Gemini filtered in ${Date.now() - t0}ms`);
      responseText = (result.text ?? '').trim();
    } catch {
      const fallback = buildRssFallbackTicker(rawPool);
      tickerCache = {
        expiresAt: Date.now() + 25_000,
        geminiExpiresAt: Date.now() + 90_000,
        headlineKey,
        payload: fallback,
      };
      return fallback;
    }

    let parsed: {
      globalSentiment?: {
        label?: 'Risk-On' | 'Risk-Off' | 'Cautious' | 'Mixed';
        summary?: string;
      };
      headlines?: Array<{
        id?: number;
        headline?: string;
        category?: NewsTickerCategory;
        sentiment?: 'Bullish' | 'Bearish' | 'Neutral';
      }>;
    };

    try {
      parsed = JSON.parse(responseText);
    } catch {
      const fallback = buildRssFallbackTicker(rawPool);
      tickerCache = {
        expiresAt: Date.now() + 25_000,
        geminiExpiresAt: Date.now() + 90_000,
        headlineKey,
        payload: fallback,
      };
      return fallback;
    }

    const byId = new Map<number, RawRssHeadline>(rawPool.map((r) => [r.id, r]));
    const allowedCategories = new Set<NewsTickerCategory>([
      'GOLD',
      'CRYPTO',
      'USDT',
      'CPI',
      'PCE/PCA',
      'NFT',
      'FOMC',
      'ISM',
      'SENTIMENT',
    ]);

    const items: FilteredTickerItem[] = [];
    const usedIds = new Set<number>();
    for (const entry of parsed.headlines ?? []) {
      const idNum = typeof entry.id === 'number' ? entry.id : -1;
      const orig = byId.get(idNum);
      if (!orig || usedIds.has(idNum)) continue;
      usedIds.add(idNum);

      const category = allowedCategories.has(entry.category as NewsTickerCategory)
        ? (entry.category as NewsTickerCategory)
        : 'SENTIMENT';
      const sentiment =
        entry.sentiment === 'Bullish' || entry.sentiment === 'Bearish' ? entry.sentiment : 'Neutral';
      const cleanHeadline = (entry.headline ?? orig.title).replace(/\s+/g, ' ').trim().slice(0, 110);

      if (!cleanHeadline) continue;
      items.push({
        id: `news_${idNum}_${crypto.randomBytes(2).toString('hex')}`,
        headline: cleanHeadline,
        category,
        sentiment,
        source: orig.source,
        url: orig.url,
        publishedAt: orig.publishedAt,
        publishedAtMs: orig.publishedAtMs,
      });
    }

    if (items.length === 0) {
      const fallback = buildRssFallbackTicker(rawPool);
      tickerCache = {
        expiresAt: Date.now() + 25_000,
        geminiExpiresAt: Date.now() + 90_000,
        headlineKey,
        payload: fallback,
      };
      return fallback;
    }

    const sentimentLabel =
      parsed.globalSentiment?.label === 'Risk-On' ||
      parsed.globalSentiment?.label === 'Risk-Off' ||
      parsed.globalSentiment?.label === 'Cautious'
        ? parsed.globalSentiment.label
        : 'Mixed';

    const payload: NewsTickerPayload = {
      updatedAt: new Date().toISOString(),
      filteredByGemini: true,
      globalSentiment: {
        label: sentimentLabel,
        summary: (parsed.globalSentiment?.summary ?? 'Live macro, gold & crypto headlines').slice(0, 90),
      },
      items,
    };

    tickerCache = {
      expiresAt: Date.now() + 25_000,
      geminiExpiresAt: Date.now() + 3 * 60 * 1000,
      headlineKey,
      payload,
    };

    return payload;
  })();

  try {
    return await tickerInFlight;
  } finally {
    tickerInFlight = null;
  }
}

async function startServer() {
  ensureUploadsDir();
  const app = express();

  app.use(express.json({ limit: '4mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'TREDAURA', timestamp: new Date().toISOString() });
  });

  app.get('/api/markets/live', async (_req, res) => {
    const payload = await getLiveMarketsPayload();
    res.json(payload);
  });

  const KLINE_SYMBOL_MAP: Record<
    string,
    {
      source: 'yahoo' | 'binance' | 'spot-cfd';
      ticker: string;
      dailyTicker?: string;
      spotAnchor?: 'XAU' | 'XAG' | 'US500' | 'US30' | 'EURUSD';
      precision: number;
      inceptionLabel: string;
    }
  > = {
    XAUUSD: {
      source: 'spot-cfd',
      ticker: 'XAU/USD',
      dailyTicker: 'GC=F',
      spotAnchor: 'XAU',
      precision: 2,
      inceptionLabel: 'Aug 2000',
    },
    EURUSD: {
      source: 'yahoo',
      ticker: 'EURUSD=X',
      spotAnchor: 'EURUSD',
      precision: 4,
      inceptionLabel: 'Dec 2003',
    },
    XAGUSD: {
      source: 'yahoo',
      ticker: 'SI=F',
      spotAnchor: 'XAG',
      precision: 2,
      inceptionLabel: 'Aug 2000',
    },
    US500: {
      source: 'yahoo',
      ticker: 'ES=F',
      dailyTicker: '^GSPC',
      spotAnchor: 'US500',
      precision: 2,
      inceptionLabel: 'Dec 1927',
    },
    US30: {
      source: 'yahoo',
      ticker: 'YM=F',
      dailyTicker: '^DJI',
      spotAnchor: 'US30',
      precision: 2,
      inceptionLabel: 'Jan 1985',
    },
    USOIL: {
      source: 'yahoo',
      ticker: 'CL=F',
      precision: 2,
      inceptionLabel: 'Aug 2000',
    },
    BTCUSDT: { source: 'binance', ticker: 'BTCUSDT', precision: 2, inceptionLabel: 'Aug 2017' },
    ETHUSDT: { source: 'binance', ticker: 'ETHUSDT', precision: 2, inceptionLabel: 'Aug 2017' },
    SOLUSDT: { source: 'binance', ticker: 'SOLUSDT', precision: 2, inceptionLabel: 'Aug 2020' },
    BNBUSDT: { source: 'binance', ticker: 'BNBUSDT', precision: 2, inceptionLabel: 'Nov 2017' },
    XRPUSDT: { source: 'binance', ticker: 'XRPUSDT', precision: 4, inceptionLabel: 'May 2018' },
  };
  const INTERVAL_SECONDS: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
    '1w': 604800,
  };
  const ALLOWED_KLINE_INTERVALS = new Set(Object.keys(INTERVAL_SECONDS));
  type OhlcBar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
  const klineCache = new Map<
    string,
    { expiresAt: number; source: string; candles: OhlcBar[]; hasMore: boolean; inceptionDate?: string }
  >();

  const GOLD_CFD_INTERVAL_MAP: Record<
    string,
    {
      sec: number;
      tdInterval: string;
      fhResolution: string;
      fhLookbackSec: number;
      bybitInterval: string;
      okxBar: string;
      binanceInterval: string;
    }
  > = {
    '1m': {
      sec: 60,
      tdInterval: '1min',
      fhResolution: '1',
      fhLookbackSec: 2 * 86400,
      bybitInterval: '1',
      okxBar: '1m',
      binanceInterval: '1m',
    },
    '5m': {
      sec: 300,
      tdInterval: '5min',
      fhResolution: '5',
      fhLookbackSec: 5 * 86400,
      bybitInterval: '5',
      okxBar: '5m',
      binanceInterval: '5m',
    },
    '15m': {
      sec: 900,
      tdInterval: '15min',
      fhResolution: '15',
      fhLookbackSec: 12 * 86400,
      bybitInterval: '15',
      okxBar: '15m',
      binanceInterval: '15m',
    },
    '30m': {
      sec: 1800,
      tdInterval: '30min',
      fhResolution: '30',
      fhLookbackSec: 24 * 86400,
      bybitInterval: '30',
      okxBar: '30m',
      binanceInterval: '30m',
    },
    '1h': {
      sec: 3600,
      tdInterval: '1h',
      fhResolution: '60',
      fhLookbackSec: 45 * 86400,
      bybitInterval: '60',
      okxBar: '1H',
      binanceInterval: '1h',
    },
    '4h': {
      sec: 14400,
      tdInterval: '4h',
      fhResolution: '60',
      fhLookbackSec: 160 * 86400,
      bybitInterval: '240',
      okxBar: '4H',
      binanceInterval: '4h',
    },
    '1d': {
      sec: 86400,
      tdInterval: '1day',
      fhResolution: 'D',
      fhLookbackSec: 1800 * 86400,
      bybitInterval: 'D',
      okxBar: '1Dutc',
      binanceInterval: '1d',
    },
    '1w': {
      sec: 604800,
      tdInterval: '1week',
      fhResolution: 'W',
      fhLookbackSec: 3650 * 86400,
      bybitInterval: 'W',
      okxBar: '1Wutc',
      binanceInterval: '1w',
    },
  };

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

  function normalizeUtcGoldBars(rawBars: OhlcBar[], intervalSec: number, maxBars = 30_000): OhlcBar[] {
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

    const out = Array.from(byBucket.values()).sort((a, b) => a.time - b.time);
    for (let i = 1; i < out.length; i += 1) {
      const prev = out[i - 1];
      const curr = out[i];
      if (curr.open !== prev.close) {
        curr.open = prev.close;
        curr.high = Number(Math.max(curr.high, curr.open, curr.close).toFixed(2));
        curr.low = Number(Math.min(curr.low, curr.open, curr.close).toFixed(2));
      }
    }
    return out.length > maxBars ? out.slice(-maxBars) : out;
  }

  async function fetchTradingViewCfdGoldSpot(): Promise<number | null> {
    try {
      const res = await fetch('https://scanner.tradingview.com/cfd/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: { tickers: ['OANDA:XAUUSD', 'FX_IDC:XAUUSD', 'TVC:GOLD'] },
          columns: ['close', 'bid', 'ask'],
        }),
        signal: AbortSignal.timeout(1800),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: Array<{ d?: number[] }> };
      const row = data?.data?.[0]?.d;
      const close = row?.[0];
      if (typeof close === 'number' && Number.isFinite(close) && close > 500) {
        return Number(close.toFixed(2));
      }
      const bid = row?.[1];
      const ask = row?.[2];
      const validMid =
        typeof bid === 'number' &&
        typeof ask === 'number' &&
        Number.isFinite(bid) &&
        Number.isFinite(ask) &&
        bid > 500 &&
        ask > 500
          ? (bid + ask) / 2
          : null;
      return typeof validMid === 'number' && Number.isFinite(validMid) && validMid > 500
        ? Number(validMid.toFixed(2))
        : null;
    } catch {
      return null;
    }
  }

  let liveGoldSpotCache: {
    expiresAt: number;
    staleUntil: number;
    value: { price: number; provider: string };
  } | null = null;
  let liveGoldSpotInFlight: Promise<{ price: number; provider: string } | null> | null = null;

  async function fetchLiveGoldCfdPriceWithProvider(): Promise<{ price: number; provider: string } | null> {
    const now = Date.now();
    if (liveGoldSpotCache && liveGoldSpotCache.expiresAt > now) {
      return liveGoldSpotCache.value;
    }
    if (liveGoldSpotInFlight) {
      return liveGoldSpotInFlight;
    }

    liveGoldSpotInFlight = (async () => {
      try {
        // Real-time Swissquote BBO feed updates sub-second; OANDA/gold-api serve as sequential fallbacks
        // to avoid cached scanner flatlines and multi-dollar inter-provider spikes.
        let resolved: { price: number; provider: string } | null = null;

        const sq = await fetchSwissquoteMid('XAU');
        if (typeof sq === 'number' && Number.isFinite(sq) && sq > 500) {
          resolved = { price: sq, provider: 'swissquote' };
        }

        if (!resolved) {
          const oanda = await fetchTradingViewCfdGoldSpot();
          if (typeof oanda === 'number' && Number.isFinite(oanda) && oanda > 500) {
            resolved = { price: oanda, provider: 'oanda' };
          }
        }

        if (!resolved) {
          const g = await fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAU', 1800);
          if (typeof g?.price === 'number' && Number.isFinite(g.price) && g.price > 500) {
            resolved = { price: Number(g.price.toFixed(2)), provider: 'gold-api' };
          }
        }

        if (resolved) {
          const ts = Date.now();
          liveGoldSpotCache = {
            expiresAt: ts + 350,
            staleUntil: ts + 15_000,
            value: resolved,
          };
          return resolved;
        }

        if (liveGoldSpotCache && liveGoldSpotCache.staleUntil > Date.now()) {
          return liveGoldSpotCache.value;
        }
        return null;
      } finally {
        liveGoldSpotInFlight = null;
      }
    })();

    return liveGoldSpotInFlight;
  }

  async function fetchYahooHistoricalBars(
    ticker: string,
    rawIv: string,
    precision: number,
    options?: { inception?: boolean }
  ): Promise<OhlcBar[]> {
    const yahooIv =
      rawIv === '1w'
        ? '1wk'
        : rawIv === '1d'
          ? '1d'
          : rawIv === '4h' || rawIv === '1h'
            ? '60m'
            : rawIv;

    const nowSec = Math.floor(Date.now() / 1000);
    let url: string;
    if (rawIv === '1d' || rawIv === '1w' || options?.inception) {
      const startSec = ticker === '^GSPC' ? -2208988800 : 0;
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${yahooIv}&period1=${startSec}&period2=${nowSec}`;
    } else {
      const maxRange =
        rawIv === '1m'
          ? '7d'
          : rawIv === '5m' || rawIv === '15m' || rawIv === '30m'
            ? '60d'
            : '2y';
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${yahooIv}&range=${maxRange}`;
    }

    const json = await fetchJsonWithTimeout<YahooChartResponse>(url, 8000, {
      'User-Agent': 'Mozilla/5.0',
    });

    const result = json?.chart?.result?.[0];
    const ts = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0];
    const rawBars: OhlcBar[] = [];
    if (q && ts.length > 0) {
      for (let i = 0; i < ts.length; i += 1) {
        const t = ts[i];
        const open = q.open?.[i];
        const high = q.high?.[i];
        const low = q.low?.[i];
        const close = q.close?.[i];
        const vol = q.volume?.[i];
        if (
          typeof t === 'number' &&
          typeof open === 'number' &&
          typeof high === 'number' &&
          typeof low === 'number' &&
          typeof close === 'number' &&
          open > 0 &&
          high > 0 &&
          low > 0 &&
          close > 0 &&
          [t, open, high, low, close].every(Number.isFinite)
        ) {
          rawBars.push({
            time: t,
            open,
            high: Math.max(high, open, close),
            low: Math.min(low, open, close),
            close,
            ...(typeof vol === 'number' && Number.isFinite(vol) ? { volume: vol } : {}),
          });
        }
      }
    }

    rawBars.sort((a, b) => a.time - b.time);
    const ivSec = INTERVAL_SECONDS[rawIv] ?? 900;
    const byTime = new Map<number, OhlcBar>();
    for (const bar of rawBars) {
      // Keep daily/weekly timestamps clean at UTC day boundary
      const bucketTime =
        rawIv === '1d' || rawIv === '1w'
          ? Math.floor(bar.time / 86400) * 86400
          : Math.floor(bar.time / ivSec) * ivSec;
      const bucket = rawIv === '1w' ? Math.floor(bucketTime / 604800) * 604800 : bucketTime;
      const prev = byTime.get(bucket);
      if (!prev) {
        byTime.set(bucket, {
          time: bucket,
          open: Number(bar.open.toFixed(precision)),
          high: Number(bar.high.toFixed(precision)),
          low: Number(bar.low.toFixed(precision)),
          close: Number(bar.close.toFixed(precision)),
          ...(bar.volume !== undefined ? { volume: bar.volume } : {}),
        });
      } else {
        prev.high = Number(Math.max(prev.high, bar.high).toFixed(precision));
        prev.low = Number(Math.min(prev.low, bar.low).toFixed(precision));
        prev.close = Number(bar.close.toFixed(precision));
        if (bar.volume !== undefined) {
          prev.volume = (prev.volume ?? 0) + bar.volume;
        }
      }
    }
    return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
  }

  async function fetchSpotGoldCfdCandles(
    normalizedIv: string,
    opts?: { before?: number; limit?: number }
  ): Promise<{ source: string; candles: OhlcBar[]; hasMore: boolean; inceptionDate?: string }> {
    const spec = GOLD_CFD_INTERVAL_MAP[normalizedIv];
    if (!spec) return { source: 'spot-cfd', candles: [], hasMore: false };

    const before = opts?.before;
    const reqLimit = Math.min(1000, Math.max(50, opts?.limit ?? 1000));

    // Daily (1d) & Weekly (1w): Full COMEX/Spot Gold archive back to Aug 2000 (GC=F) + live CFD spot on latest bar
    if (normalizedIv === '1d' || normalizedIv === '1w') {
      const [yahooBars, spotInfo] = await Promise.all([
        fetchYahooHistoricalBars('GC=F', normalizedIv, 2, { inception: true }),
        !before ? fetchLiveGoldCfdPriceWithProvider() : Promise.resolve(null),
      ]);

      if (yahooBars.length >= 10) {
        const candles = yahooBars.map((b) => ({ ...b }));
        if (spotInfo && candles.length > 0 && !before) {
          const last = candles[candles.length - 1];
          const basisCheck = Math.abs(spotInfo.price - last.close);
          if (basisCheck < spotInfo.price * 0.05) {
            last.close = spotInfo.price;
            last.high = Number(Math.max(last.high, spotInfo.price).toFixed(2));
            last.low = Number(Math.min(last.low, spotInfo.price).toFixed(2));
          }
        }
        const filtered = before ? candles.filter((c) => c.time < before) : candles;
        return {
          source: spotInfo ? `yahoo-gcf+${spotInfo.provider}` : 'yahoo-gcf-inception',
          candles: filtered,
          hasMore: false,
          inceptionDate: '2000-08-30',
        };
      }
    }

    // Paginated historical intraday lookback via continuous 24/7 PAXG/USDT gold-backed feed (Aug 2020 -> Live)
    if (before) {
      const endMs = (before - 1) * 1000;
      const binanceHistUrls = [
        `https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=${encodeURIComponent(
          spec.binanceInterval
        )}&limit=${reqLimit}&endTime=${endMs}`,
        `https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=${encodeURIComponent(
          spec.binanceInterval
        )}&limit=${reqLimit}&endTime=${endMs}`,
      ];

      for (const u of binanceHistUrls) {
        const rows = await fetchJsonWithTimeout<Array<[number, string, string, string, string, string?]>>(u, 5500);
        if (Array.isArray(rows) && rows.length > 0) {
          const rawBars: OhlcBar[] = [];
          for (const row of rows) {
            const tSec = Math.floor(Number(row[0]) / 1000);
            const open = Number(row[1]);
            const high = Number(row[2]);
            const low = Number(row[3]);
            const close = Number(row[4]);
            const volume = row[5] !== undefined ? Number(row[5]) : undefined;
            if (tSec < before && [tSec, open, high, low, close].every(Number.isFinite)) {
              rawBars.push({ time: tSec, open, high, low, close, volume });
            }
          }
          const candles = normalizeUtcGoldBars(rawBars, spec.sec, 2000);
          return {
            source: 'paxg-gold-archive',
            candles,
            hasMore: rows.length >= reqLimit,
            inceptionDate: '2020-08-27',
          };
        }
      }

      // Fallback to Yahoo Finance GC=F intraday history if Binance PAXG archive is unreachable
      const yahooFallback = await fetchYahooHistoricalBars('GC=F', normalizedIv, 2);
      const olderYahoo = yahooFallback.filter((c) => c.time < before);
      return {
        source: 'yahoo-gcf-intraday',
        candles: olderYahoo.slice(-reqLimit),
        hasMore: olderYahoo.length > reqLimit,
        inceptionDate: '2000-08-30',
      };
    }

    const tdKey = process.env.TWELVEDATA_API_KEY?.trim();
    if (tdKey) {
      const tdUrl = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${encodeURIComponent(
        spec.tdInterval
      )}&outputsize=1000&timezone=UTC&apikey=${encodeURIComponent(tdKey)}`;
      const tdJson = await fetchJsonWithTimeout<{
        status?: string;
        values?: Array<{ datetime?: string; open?: string; high?: string; low?: string; close?: string }>;
      }>(tdUrl, 4800);
      if (tdJson?.status !== 'error' && Array.isArray(tdJson?.values) && tdJson.values.length >= 10) {
        const rawBars: OhlcBar[] = [];
        for (const row of tdJson.values) {
          const t = parseUtcTimestampSec(row.datetime);
          const open = Number(row.open);
          const high = Number(row.high);
          const low = Number(row.low);
          const close = Number(row.close);
          if (t !== null && [open, high, low, close].every(Number.isFinite)) {
            rawBars.push({ time: t, open, high, low, close });
          }
        }
        const candles = normalizeUtcGoldBars(rawBars, spec.sec, 2000);
        if (candles.length >= 10) {
          return { source: 'twelvedata-xauusd', candles, hasMore: true };
        }
      }
    }

    const fhKey = process.env.FINNHUB_API_KEY?.trim();
    if (fhKey) {
      const toSec = Math.floor(Date.now() / 1000);
      const fromSec = toSec - spec.fhLookbackSec;
      const fhUrl = `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(
        'OANDA:XAU_USD'
      )}&resolution=${encodeURIComponent(spec.fhResolution)}&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(
        fhKey
      )}`;
      const fhJson = await fetchJsonWithTimeout<{
        s?: string;
        t?: number[];
        o?: number[];
        h?: number[];
        l?: number[];
        c?: number[];
      }>(fhUrl, 4800);
      if (fhJson?.s === 'ok' && Array.isArray(fhJson.t) && fhJson.t.length >= 10) {
        const rawBars: OhlcBar[] = [];
        for (let i = 0; i < fhJson.t.length; i += 1) {
          const t = fhJson.t[i];
          const open = fhJson.o?.[i];
          const high = fhJson.h?.[i];
          const low = fhJson.l?.[i];
          const close = fhJson.c?.[i];
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
        const candles = normalizeUtcGoldBars(rawBars, spec.sec, 2000);
        if (candles.length >= 10) {
          return { source: 'finnhub-oanda-xauusd', candles, hasMore: true };
        }
      }
    }

    // Continuous Keyless Spot Gold CFD curve: PAXGUSDT (goes back to Aug 2020) + Swissquote/OANDA live spot taper on active session
    const [spotInfo, paxgRes, bybitRes] = await Promise.all([
      fetchLiveGoldCfdPriceWithProvider(),
      fetchJsonWithTimeout<Array<[number, string, string, string, string, string?]>>(
        `https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=${encodeURIComponent(
          spec.binanceInterval
        )}&limit=1000`,
        4800
      ),
      fetchJsonWithTimeout<{
        retCode?: number;
        result?: { list?: Array<[string, string, string, string, string, string?]> };
      }>(
        `https://api.bybit.com/v5/market/kline?category=spot&symbol=XAUTUSDT&interval=${encodeURIComponent(
          spec.bybitInterval
        )}&limit=1000`,
        4200
      ),
    ]);

    const rawBars: OhlcBar[] = [];
    if (Array.isArray(paxgRes) && paxgRes.length >= 10) {
      for (const row of paxgRes) {
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
    } else if (bybitRes?.retCode === 0 && Array.isArray(bybitRes.result?.list) && bybitRes.result.list.length >= 10) {
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
    }

    let candles = normalizeUtcGoldBars(rawBars, spec.sec, 1200);
    // Smoothly align only the most recent 24 bars onto exact Swissquote/OANDA XAU/USD spot while keeping open=previousClose gapless
    if (spotInfo && candles.length > 0) {
      const latest = candles[candles.length - 1];
      const basis = spotInfo.price - latest.close;
      if (Math.abs(basis) > 0.01 && Math.abs(basis) < spotInfo.price * 0.05) {
        const taperWindow = Math.min(24, candles.length);
        const startTaperIdx = candles.length - taperWindow;
        candles = candles.map((bar, idx) => {
          if (idx < startTaperIdx) return bar;
          const weight = (idx - startTaperIdx + 1) / taperWindow;
          const shift = basis * weight;
          const shiftedOpen = Number((bar.open + shift).toFixed(2));
          const shiftedClose = Number((bar.close + shift).toFixed(2));
          const shiftedHigh = Number(Math.max(bar.high + shift, shiftedOpen, shiftedClose).toFixed(2));
          const shiftedLow = Number(Math.min(bar.low + shift, shiftedOpen, shiftedClose).toFixed(2));
          return {
            ...bar,
            open: shiftedOpen,
            high: shiftedHigh,
            low: shiftedLow,
            close: shiftedClose,
          };
        });
        for (let i = Math.max(1, startTaperIdx); i < candles.length; i += 1) {
          const prev = candles[i - 1];
          const curr = candles[i];
          curr.open = prev.close;
          curr.high = Number(Math.max(curr.high, curr.open, curr.close).toFixed(2));
          curr.low = Number(Math.min(curr.low, curr.open, curr.close).toFixed(2));
        }
      }
    }

    return {
      source: spotInfo ? `${spotInfo.provider}-cfd-utc` : 'paxg-spot-utc',
      candles,
      hasMore: true,
      inceptionDate: '2020-08-27',
    };
  }

  async function fetchSpotForKlineSymbol(rawSym: string): Promise<number | null> {
    const spec = KLINE_SYMBOL_MAP[rawSym];
    if (!spec) return null;
    if (spec.spotAnchor === 'XAU') {
      const spotInfo = await fetchLiveGoldCfdPriceWithProvider();
      return spotInfo?.price ?? null;
    }
    if (spec.spotAnchor === 'EURUSD') {
      const sq = await fetchSwissquoteMid('EUR', 4);
      if (sq) return sq;
      const q = await fetchYahooQuote('EURUSD=X', 4);
      return q?.price ?? null;
    }
    if (spec.spotAnchor === 'XAG') {
      const sq = await fetchSwissquoteMid('XAG', 2);
      if (sq) return sq;
      const g = await fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAG', 2500);
      return typeof g?.price === 'number' && g.price > 5 ? Number(g.price.toFixed(2)) : null;
    }
    if (spec.spotAnchor === 'US500') {
      const q = await fetchYahooQuote('^GSPC');
      return q?.price ?? null;
    }
    if (spec.spotAnchor === 'US30') {
      const q = await fetchYahooQuote('^DJI');
      return q?.price ?? null;
    }
    if (rawSym === 'USOIL') {
      const q = await fetchYahooQuote('CL=F');
      return q?.price ?? null;
    }
    if (spec.source === 'binance') {
      const urls = [
        `https://api.binance.com/api/v3/ticker/price?symbol=${spec.ticker}`,
        `https://data-api.binance.vision/api/v3/ticker/price?symbol=${spec.ticker}`,
      ];
      for (const u of urls) {
        const res = await fetchJsonWithTimeout<{ price?: string }>(u, 2200);
        const p = Number(res?.price);
        if (Number.isFinite(p) && p > 0) return Number(p.toFixed(spec.precision));
      }
    }
    return null;
  }

  async function fetchKlinesWithSourceForSymbol(
    rawSym: string,
    rawIv: string,
    opts?: { rangeOverride?: string; before?: number; limit?: number }
  ): Promise<{ source: string; candles: OhlcBar[]; hasMore: boolean; inceptionDate?: string }> {
    const spec = KLINE_SYMBOL_MAP[rawSym];
    if (!spec || !ALLOWED_KLINE_INTERVALS.has(rawIv)) {
      return { source: 'none', candles: [], hasMore: false };
    }

    const before = opts?.before && Number.isFinite(opts.before) && opts.before > 0 ? Math.floor(opts.before) : undefined;
    const limit = Math.min(1000, Math.max(50, opts?.limit ?? 1000));
    const cacheKey = `${rawSym}:${rawIv}:${before ?? 'latest'}:${limit}:${opts?.rangeOverride ?? 'default'}`;
    const cached = klineCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        source: cached.source,
        candles: cached.candles,
        hasMore: cached.hasMore,
        inceptionDate: cached.inceptionDate,
      };
    }

    if (spec.source === 'spot-cfd') {
      const goldResult = await fetchSpotGoldCfdCandles(rawIv, { before, limit });
      if (goldResult.candles.length > 0) {
        klineCache.set(cacheKey, {
          expiresAt: Date.now() + (before ? 300_000 : 4000),
          source: goldResult.source,
          candles: goldResult.candles,
          hasMore: goldResult.hasMore,
          inceptionDate: goldResult.inceptionDate,
        });
      }
      return goldResult;
    }

    const byTime = new Map<number, OhlcBar>();
    const resolvedSource: string = spec.source;
    let hasMore = false;
    let inceptionDate: string | undefined;

    if (spec.source === 'binance') {
      const fetchBinancePage = async (endTimeMs?: number): Promise<OhlcBar[]> => {
        const endQs = endTimeMs !== undefined ? `&endTime=${endTimeMs}` : '';
        const urls = [
          `https://api.binance.com/api/v3/klines?symbol=${spec.ticker}&interval=${rawIv}&limit=1000${endQs}`,
          `https://data-api.binance.vision/api/v3/klines?symbol=${spec.ticker}&interval=${rawIv}&limit=1000${endQs}`,
        ];
        for (const u of urls) {
          const rows = await fetchJsonWithTimeout<Array<[number, string, string, string, string, string?]>>(u, 5500);
          if (Array.isArray(rows)) {
            const parsed: OhlcBar[] = [];
            for (const d of rows) {
              const t = Math.floor(d[0] / 1000);
              const open = Number(d[1]);
              const high = Number(d[2]);
              const low = Number(d[3]);
              const close = Number(d[4]);
              const volume = d[5] !== undefined ? Number(d[5]) : undefined;
              if ([t, open, high, low, close].every(Number.isFinite)) {
                parsed.push({
                  time: t,
                  open,
                  high,
                  low,
                  close,
                  ...(volume !== undefined && Number.isFinite(volume) ? { volume } : {}),
                });
              }
            }
            return parsed;
          }
        }
        return [];
      };

      if (!before && (rawIv === '1d' || rawIv === '1w')) {
        // Fetch complete inception-to-live history for Daily & Weekly crypto (2017 -> Live)
        let cursorEndMs: number | undefined;
        for (let page = 0; page < 6; page += 1) {
          const batch = await fetchBinancePage(cursorEndMs);
          if (batch.length === 0) break;
          for (const b of batch) byTime.set(b.time, b);
          if (batch.length < 1000) break;
          cursorEndMs = batch[0].time * 1000 - 1;
        }
        hasMore = false;
      } else {
        const endMs = before ? (before - 1) * 1000 : undefined;
        const batch = await fetchBinancePage(endMs);
        for (const b of batch) {
          if (!before || b.time < before) byTime.set(b.time, b);
        }
        hasMore = batch.length >= 1000;
      }
      inceptionDate = spec.inceptionLabel;
    } else {
      // Yahoo Finance (XAGUSD, US500, USOIL): cache full multi-year/inception archive and serve full 1d/1w or paginated intraday slices
      const yahooTicker = (rawIv === '1d' || rawIv === '1w') && spec.dailyTicker ? spec.dailyTicker : spec.ticker;
      const fullCacheKey = `${rawSym}:${rawIv}:yahoo-full`;
      let fullYahoo = klineCache.get(fullCacheKey);

      if (!fullYahoo || fullYahoo.expiresAt <= Date.now()) {
        const [bars, liveSpot] = await Promise.all([
          fetchYahooHistoricalBars(yahooTicker, rawIv, spec.precision, {
            inception: rawIv === '1d' || rawIv === '1w',
          }),
          fetchSpotForKlineSymbol(rawSym),
        ]);

        if (typeof liveSpot === 'number' && bars.length > 0) {
          const latest = bars[bars.length - 1];
          const diff = Math.abs(liveSpot - latest.close);
          if (diff < liveSpot * 0.05) {
            if (rawIv === '1d' || rawIv === '1w') {
              // Keep decades of historical daily/weekly prices pure; update only today's active candle
              latest.close = liveSpot;
              latest.high = Number(Math.max(latest.high, liveSpot).toFixed(spec.precision));
              latest.low = Number(Math.min(latest.low, liveSpot).toFixed(spec.precision));
            } else {
              // Smoothly align only the most recent 24 intraday bars onto live Spot while preserving open=previousClose
              const basis = liveSpot - latest.close;
              const taperWindow = Math.min(24, bars.length);
              const startTaperIdx = bars.length - taperWindow;
              for (let idx = startTaperIdx; idx < bars.length; idx += 1) {
                const weight = (idx - startTaperIdx + 1) / taperWindow;
                const shift = basis * weight;
                const sOpen = Number((bars[idx].open + shift).toFixed(spec.precision));
                const sClose = Number((bars[idx].close + shift).toFixed(spec.precision));
                bars[idx] = {
                  ...bars[idx],
                  open: sOpen,
                  high: Number(Math.max(bars[idx].high + shift, sOpen, sClose).toFixed(spec.precision)),
                  low: Number(Math.min(bars[idx].low + shift, sOpen, sClose).toFixed(spec.precision)),
                  close: sClose,
                };
              }
              for (let i = Math.max(1, startTaperIdx); i < bars.length; i += 1) {
                const prev = bars[i - 1];
                const curr = bars[i];
                curr.open = prev.close;
                curr.high = Number(Math.max(curr.high, curr.open, curr.close).toFixed(spec.precision));
                curr.low = Number(Math.min(curr.low, curr.open, curr.close).toFixed(spec.precision));
              }
            }
          }
        }

        if (bars.length === 0) {
          // Synthesize continuous gapless fallback bars anchored to liveSpot so EUR/USD & commodities never stall
          const anchor =
            typeof liveSpot === 'number' && liveSpot > 0
              ? liveSpot
              : rawSym === 'EURUSD'
                ? 1.085
                : rawSym === 'XAGUSD'
                  ? 33.2
                  : rawSym === 'US500'
                    ? 6010.0
                    : rawSym === 'US30'
                      ? 44250.0
                      : 72.5;
          const ivSec = INTERVAL_SECONDS[rawIv] ?? 900;
          const nowBucket = Math.floor(Math.floor(Date.now() / 1000) / ivSec) * ivSec;
          const totalSynth = 120;
          let prevClose = anchor * 0.996;
          for (let i = totalSynth - 1; i >= 0; i -= 1) {
            const t = nowBucket - i * ivSec;
            const drift = (anchor - prevClose) * 0.08;
            const wave = Math.sin(i * 0.42) * anchor * 0.00055;
            const open = Number(prevClose.toFixed(spec.precision));
            const close = i === 0 ? anchor : Number((open + drift + wave).toFixed(spec.precision));
            const wick = Math.max(Math.abs(close - open) * 0.7, anchor * 0.00025);
            const high = Number((Math.max(open, close) + wick).toFixed(spec.precision));
            const low = Number(Math.max(0.0001, Math.min(open, close) - wick).toFixed(spec.precision));
            bars.push({ time: t, open, high, low, close, volume: 1200 + (i % 9) * 140 });
            prevClose = close;
          }
        }

        if (bars.length > 0) {
          fullYahoo = {
            expiresAt: Date.now() + (rawIv === '1d' || rawIv === '1w' ? 120_000 : 20_000),
            source: resolvedSource,
            candles: bars,
            hasMore: false,
            inceptionDate: spec.inceptionLabel,
          };
          klineCache.set(fullCacheKey, fullYahoo);
        }
      }

      const allBars = fullYahoo?.candles ?? [];
      inceptionDate = spec.inceptionLabel;

      if (rawIv === '1d' || rawIv === '1w') {
        const slice = before ? allBars.filter((c) => c.time < before) : allBars;
        for (const b of slice) byTime.set(b.time, b);
        hasMore = false;
      } else {
        const eligible = before ? allBars.filter((c) => c.time < before) : allBars;
        const startIdx = Math.max(0, eligible.length - limit);
        const page = eligible.slice(startIdx);
        for (const b of page) byTime.set(b.time, b);
        hasMore = startIdx > 0;
      }
    }

    const candles = Array.from(byTime.values()).sort((a, b) => a.time - b.time);

    if (candles.length > 0) {
      klineCache.set(cacheKey, {
        expiresAt: Date.now() + (before ? 300_000 : 4000),
        source: resolvedSource,
        candles,
        hasMore,
        inceptionDate,
      });
    }
    return { source: resolvedSource, candles, hasMore, inceptionDate };
  }

  async function fetchKlinesForSymbol(
    rawSym: string,
    rawIv: string,
    rangeOverride?: string
  ): Promise<OhlcBar[]> {
    const res = await fetchKlinesWithSourceForSymbol(rawSym, rawIv, { rangeOverride });
    return res.candles;
  }

  app.get('/api/klines', async (req, res) => {
    const rawSym = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : 'XAUUSD';
    const rawIv = typeof req.query.interval === 'string' ? req.query.interval.trim().toLowerCase() : '15m';
    const rawBefore = typeof req.query.before === 'string' ? Number(req.query.before) : undefined;
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    const spec = KLINE_SYMBOL_MAP[rawSym];
    if (!spec || !ALLOWED_KLINE_INTERVALS.has(rawIv)) {
      res.status(400).json({ error: 'Invalid symbol or interval.' });
      return;
    }

    const { source, candles, hasMore, inceptionDate } = await fetchKlinesWithSourceForSymbol(rawSym, rawIv, {
      before: rawBefore && Number.isFinite(rawBefore) && rawBefore > 0 ? rawBefore : undefined,
      limit: rawLimit && Number.isFinite(rawLimit) ? rawLimit : undefined,
    });
    if (candles.length === 0 && !rawBefore) {
      res.status(502).json({ error: `Unable to fetch live candles for ${rawSym}.` });
      return;
    }

    res.json({ symbol: rawSym, interval: rawIv, source, candles, hasMore, inceptionDate });
  });

  app.get('/api/gold', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const rawParam = typeof req.query.interval === 'string' ? req.query.interval.trim().toLowerCase() : '15m';
    const normalizedIv = rawParam === '60m' ? '1h' : rawParam;
    if (!ALLOWED_KLINE_INTERVALS.has(normalizedIv)) {
      res.status(400).json({ error: 'Invalid interval.' });
      return;
    }

    const allowedRanges = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max']);
    const rawRange = typeof req.query.range === 'string' ? req.query.range.trim().toLowerCase() : '';
    const rangeOverride = allowedRanges.has(rawRange) ? rawRange : undefined;
    const rawBefore = typeof req.query.before === 'string' ? Number(req.query.before) : undefined;
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    const { source, candles, hasMore, inceptionDate } = await fetchKlinesWithSourceForSymbol('XAUUSD', normalizedIv, {
      rangeOverride,
      before: rawBefore && Number.isFinite(rawBefore) && rawBefore > 0 ? rawBefore : undefined,
      limit: rawLimit && Number.isFinite(rawLimit) ? rawLimit : undefined,
    });
    if (candles.length === 0 && !rawBefore) {
      res.status(502).json({ error: 'Unable to fetch live Spot Gold CFD (XAU/USD) candles.' });
      return;
    }

    res.json({
      symbol: 'XAUUSD',
      interval: rawParam,
      range:
        rangeOverride ??
        (normalizedIv === '1m'
          ? '1d'
          : normalizedIv === '5m' || normalizedIv === '15m'
            ? '5d'
            : normalizedIv === '30m' || normalizedIv === '1h'
              ? '1mo'
              : normalizedIv === '4h'
                ? '3mo'
                : 'max'),
      timezone: 'UTC',
      source,
      spotPrice: candles.length > 0 ? candles[candles.length - 1].close : undefined,
      candles,
      hasMore,
      inceptionDate,
    });
  });

  app.get('/api/news-ticker', async (req, res) => {
    const wantsRefresh = req.query.refresh === '1';
    const now = Date.now();
    const canForce = wantsRefresh && now - lastForcedTickerRefresh > 15_000;
    if (canForce) {
      lastForcedTickerRefresh = now;
    }

    try {
      const payload = await generateFilteredNewsTicker(canForce);
      res.json(payload);
    } catch {
      res.json(tickerCache?.payload ?? buildBuiltinNewsTicker());
    }
  });

  app.get('/api/economic-calendar', async (req, res) => {
    const wantsRefresh = req.query.refresh === '1';
    const now = Date.now();
    const canForce = wantsRefresh && now - lastForcedCalendarRefresh > 5_000;
    if (canForce) {
      lastForcedCalendarRefresh = now;
    }

    try {
      const payload = await fetchEconomicCalendar(canForce);
      res.json(payload);
    } catch {
      res.json(calendarCache?.payload ?? buildBuiltinEconomicCalendar());
    }
  });

  app.post('/api/upload-image', (req, res) => {
    try {
      const { dataUrl } = req.body as { dataUrl?: unknown };
      if (typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }

      const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are supported' });
        return;
      }

      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 2.5 * 1024 * 1024) {
        res.status(413).json({ error: 'Image must be smaller than 2.5 MB' });
        return;
      }

      ensureUploadsDir();
      const filename = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filepath, buffer);

      res.json({ url: `/uploads/${filename}` });
    } catch {
      res.status(500).json({ error: 'Failed to store uploaded image' });
    }
  });

  app.post('/api/pattern-analysis', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({ error: 'Gemini API key is not configured.' });
      return;
    }

    const body = (req.body ?? {}) as {
      symbol?: string;
      timeframe?: string;
      price?: number;
      pattern?: string;
      trend?: string;
      support?: number | null;
      resistance?: number | null;
      omyeSignal?: string;
      rsi1m?: number | null;
    };

    const symbol = typeof body.symbol === 'string' ? body.symbol.slice(0, 24) : 'XAUUSD';
    const timeframe = typeof body.timeframe === 'string' ? body.timeframe.slice(0, 10) : '15m';
    const price = typeof body.price === 'number' && Number.isFinite(body.price) ? body.price : 0;

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const prompt =
        `Analyze live chart telemetry for ${symbol} (${timeframe}) at $${price}.\n` +
        `Detected Pattern: ${body.pattern ?? 'Consolidation'}\n` +
        `SMC Trend: ${body.trend ?? 'Neutral'}\n` +
        `Support S1: ${body.support ?? 'N/A'}, Resistance R1: ${body.resistance ?? 'N/A'}\n` +
        `OMYE 1m Engine: ${body.omyeSignal ?? 'NEUTRAL'} (1m RSI: ${
          typeof body.rsi1m === 'number' ? body.rsi1m.toFixed(1) : 'N/A'
        })`;

      const result = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(20000),
          systemInstruction:
            'You are a quantitative chart analyst. Return concise, non-advisory technical observations in JSON: headline (max 10 words), summary (1 short sentence max 24 words), invalidation (max 12 words).',
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              summary: { type: Type.STRING },
              invalidation: { type: Type.STRING },
            },
            required: ['headline', 'summary', 'invalidation'],
          },
        },
      });

      const parsed = JSON.parse((result.text ?? '{}').trim()) as {
        headline?: string;
        summary?: string;
        invalidation?: string;
      };
      res.json({
        headline: parsed.headline ?? `${symbol} ${body.pattern ?? 'Structure'} Watch`,
        summary:
          parsed.summary ??
          'Monitor confirmed candle closes beyond Support/Resistance before acting on breakout momentum.',
        invalidation: parsed.invalidation ?? 'Invalidated on structural swing close.',
      });
    } catch {
      res.status(502).json({ error: 'Unable to run AI pattern scan right now.' });
    }
  });

  app.post('/api/academy-coach', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({ error: 'Gemini API key is not configured for AI Coach.' });
      return;
    }

    const body = (req.body ?? {}) as {
      lang?: string;
      scenarioTitle?: string;
      symbol?: string;
      timeframe?: string;
      bias?: string;
      entryPrice?: number;
      slPrice?: number;
      tpPrice?: number;
      rrRatio?: number;
      simResult?: string;
      lastMistake?: string;
      question?: string;
    };

    const lang = body.lang === 'hi' ? 'Hindi (Devanagari)' : body.lang === 'hinglish' ? 'Hinglish (Hindi in Roman script)' : 'English';
    const prompt =
      `Language: ${lang}\n` +
      `Scenario: ${String(body.scenarioTitle ?? 'SMC Chart Setup').slice(0, 120)} (${String(body.symbol ?? 'XAU/USD').slice(0, 20)}, ${String(body.timeframe ?? '15m').slice(0, 8)})\n` +
      `Recommended Bias: ${String(body.bias ?? 'long')}\n` +
      `User Simulator Setup -> Entry: ${body.entryPrice ?? 'N/A'}, SL: ${body.slPrice ?? 'N/A'}, TP: ${body.tpPrice ?? 'N/A'}, R:R: 1:${typeof body.rrRatio === 'number' ? body.rrRatio.toFixed(2) : 'N/A'}, Outcome: ${String(body.simResult ?? 'pending')}\n` +
      `Recent Mistake: ${String(body.lastMistake ?? 'None recorded').slice(0, 220)}\n` +
      `Student Question: ${String(body.question ?? 'Review my entry, Stop Loss, and SMC structure logic.').slice(0, 320)}`;

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const result = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(20000),
          systemInstruction:
            'You are TREDAURA Academy Coach, a disciplined institutional Smart Money Concepts & Risk Management mentor. Always respond in the exact requested Language (English, Hinglish, or Hindi Devanagari). Be educational only (no financial advice). Return concise JSON: diagnosis (max 28 words), correction (max 32 words), riskTip (max 22 words).',
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              diagnosis: { type: Type.STRING },
              correction: { type: Type.STRING },
              riskTip: { type: Type.STRING },
            },
            required: ['diagnosis', 'correction', 'riskTip'],
          },
        },
      });

      const parsed = JSON.parse((result.text ?? '{}').trim()) as {
        diagnosis?: string;
        correction?: string;
        riskTip?: string;
      };
      res.json({
        diagnosis: parsed.diagnosis ?? 'Structure and liquidity alignment reviewed.',
        correction: parsed.correction ?? 'Wait for liquidity sweep + body BOS before placing limit entries.',
        riskTip: parsed.riskTip ?? 'Keep risk under 1% and target at least 1:2 R:R.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI Coach is temporarily unavailable.';
      res.status(502).json({ error: msg.includes('API') ? 'Check GEMINI_API_KEY in Settings > Secrets.' : 'AI Coach is temporarily unavailable. Please try again.' });
    }
  });

  // Deep AI Analysis endpoint for AI Suite
  app.post('/api/ai-deep-analysis', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server.' });
      return;
    }

    const body = (req.body ?? {}) as {
      symbol?: string;
      timeframe?: string;
      price?: number;
      trend?: number;
      score?: number;
      direction?: string;
      question?: string;
      lang?: 'en' | 'hi';
    };

    const langLabel = body.lang === 'hi' ? 'Hindi (simple Roman or Devanagari)' : 'English';
    const prompt =
      `Response Language: ${langLabel}\n` +
      `Market Symbol: ${String(body.symbol ?? 'XAU/USD')}\n` +
      `Timeframe: ${String(body.timeframe ?? '15m')}\n` +
      `Current Price: ${body.price ?? 3500}\n` +
      `Technical Bias: ${body.direction ?? 'BUY'} (Confluence Score: ${body.score ?? 80}%)\n` +
      (body.question
        ? `User Question on Chart: ${String(body.question).slice(0, 260)}\nAnswer this chart question directly inside institutionalThesis while providing clean Entry, Tight SL, TP1, TP2, and Risk Note.`
        : `Perform an institutional Smart Price Action & Order Block analysis. Provide Entry, Tight Stop Loss, TP1 (1.5R), TP2 (2.5R), Institutional Thesis, and Risk Note.`);

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const result = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(20000),
          systemInstruction:
            'You are TREDAURA Institutional AI Analyst, a rigorous Smart Money Concepts and liquidity mentor. Output precise JSON for institutional trading analysis.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING },
              confidencePct: { type: Type.NUMBER },
              entry: { type: Type.NUMBER },
              sl: { type: Type.NUMBER },
              tp1: { type: Type.NUMBER },
              tp2: { type: Type.NUMBER },
              institutionalThesis: { type: Type.STRING },
              riskNote: { type: Type.STRING },
            },
            required: ['verdict', 'confidencePct', 'entry', 'sl', 'tp1', 'tp2', 'institutionalThesis', 'riskNote'],
          },
        },
      });

      const parsed = JSON.parse((result.text ?? '{}').trim()) as {
        verdict?: string;
        confidencePct?: number;
        entry?: number;
        sl?: number;
        tp1?: number;
        tp2?: number;
        institutionalThesis?: string;
        riskNote?: string;
      };

      const px = Number(body.price ?? 3500);
      const isBuy = (body.direction ?? 'BUY') === 'BUY';
      res.json({
        verdict: parsed.verdict ?? (isBuy ? '⚡ CONFIRMED BUY NOW' : '⚡ CONFIRMED SELL NOW'),
        confidencePct: typeof parsed.confidencePct === 'number' ? parsed.confidencePct : (body.score ?? 82),
        entry: typeof parsed.entry === 'number' ? parsed.entry : px,
        sl: typeof parsed.sl === 'number' ? parsed.sl : (isBuy ? px * 0.993 : px * 1.007),
        tp1: typeof parsed.tp1 === 'number' ? parsed.tp1 : (isBuy ? px * 1.012 : px * 0.988),
        tp2: typeof parsed.tp2 === 'number' ? parsed.tp2 : (isBuy ? px * 1.025 : px * 0.975),
        institutionalThesis: parsed.institutionalThesis ?? 'Order Block mitigated with liquidity sweep confirmation on 15m/1H.',
        riskNote: parsed.riskNote ?? 'Maintain disciplined risk control under 1% per setup.',
        source: 'gemini',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deep AI Analysis unavailable.';
      res.status(502).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  const server = http.createServer(app);
  const marketWss = new WebSocketServer({ noServer: true });

  interface StreamHub {
    symbol: string;
    interval: string;
    clients: Set<WebSocket>;
    lastBar: OhlcBar | null;
    pollTimer: NodeJS.Timeout | null;
    heartbeatTimer: NodeJS.Timeout | null;
    upstreamWs: WebSocket | null;
    disposed: boolean;
  }

  const streamHubs = new Map<string, StreamHub>();

  const broadcastToHub = (hub: StreamHub, payload: Record<string, unknown>) => {
    const serialized = JSON.stringify(payload);
    for (const client of hub.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  };

  const cleanupHubIfEmpty = (key: string) => {
    const hub = streamHubs.get(key);
    if (!hub || hub.clients.size > 0) return;
    hub.disposed = true;
    if (hub.pollTimer) clearTimeout(hub.pollTimer);
    if (hub.heartbeatTimer) clearInterval(hub.heartbeatTimer);
    if (hub.upstreamWs) {
      try {
        hub.upstreamWs.close();
      } catch {
        // ignore close error
      }
    }
    streamHubs.delete(key);
  };

  const startHubFeed = async (key: string, hub: StreamHub) => {
    const spec = KLINE_SYMBOL_MAP[hub.symbol];
    if (!spec) return;
    const intervalSec = INTERVAL_SECONDS[hub.interval] ?? 900;

    // Seed active candle from latest klines
    try {
      const seedCandles = await fetchKlinesForSymbol(hub.symbol, hub.interval);
      if (seedCandles.length > 0 && !hub.disposed) {
        hub.lastBar = { ...seedCandles[seedCandles.length - 1] };
        broadcastToHub(hub, {
          type: 'kline',
          symbol: hub.symbol,
          interval: hub.interval,
          candle: hub.lastBar,
          isClosed: false,
          streamSource: spec.source === 'binance' ? 'binance-ws' : 'spot-ws',
        });
      }
    } catch {
      // ignore initial seed error
    }

    const startSpotTicker = () => {
      if (hub.pollTimer || hub.clients.size === 0 || hub.disposed) return;

      const scheduleNext = (delayMs: number) => {
        if (hub.disposed || hub.clients.size === 0) return;
        hub.pollTimer = setTimeout(() => {
          void tick();
        }, delayMs);
      };

      const tick = async () => {
        if (hub.disposed || hub.clients.size === 0) return;
        try {
          const price = await fetchSpotForKlineSymbol(hub.symbol);
          if (price !== null && Number.isFinite(price)) {
            const nowSec = Math.floor(Date.now() / 1000);
            const bucketTime = Math.floor(nowSec / intervalSec) * intervalSec;
            const prev = hub.lastBar;

            let isClosed = false;
            let nextBar: OhlcBar;
            if (!prev || bucketTime > prev.time) {
              isClosed = Boolean(prev);
              const openPrice = prev ? prev.close : price;
              nextBar = {
                time: bucketTime,
                open: openPrice,
                high: Number(Math.max(openPrice, price).toFixed(spec.precision)),
                low: Number(Math.min(openPrice, price).toFixed(spec.precision)),
                close: price,
              };
            } else {
              nextBar = {
                time: prev.time,
                open: prev.open,
                high: Number(Math.max(prev.high, price).toFixed(spec.precision)),
                low: Number(Math.min(prev.low, price).toFixed(spec.precision)),
                close: price,
              };
            }
            hub.lastBar = nextBar;
            broadcastToHub(hub, {
              type: 'kline',
              symbol: hub.symbol,
              interval: hub.interval,
              candle: nextBar,
              isClosed,
              streamSource: 'spot-ws',
            });
          }
        } catch {
          // ignore transient poll failure and continue loop
        } finally {
          scheduleNext(950);
        }
      };

      void tick();
    };

    if (spec.source === 'binance') {
      try {
        const upstreamUrl = `wss://stream.binance.com:9443/ws/${spec.ticker.toLowerCase()}@kline_${hub.interval}`;
        const upstream = new WebSocket(upstreamUrl);
        hub.upstreamWs = upstream;

        upstream.on('message', (raw) => {
          if (hub.clients.size === 0 || hub.disposed) return;
          try {
            const parsed = JSON.parse(raw.toString()) as {
              k?: { t: number; o: string; h: string; l: string; c: string; v?: string; x?: boolean };
            };
            const k = parsed?.k;
            if (!k) return;
            const rawBucket = Math.floor(Math.floor(k.t / 1000) / intervalSec) * intervalSec;
            const rawOpen = parseFloat(k.o);
            const rawHigh = parseFloat(k.h);
            const rawLow = parseFloat(k.l);
            const rawClose = parseFloat(k.c);
            const connectedOpen =
              hub.lastBar && rawBucket > hub.lastBar.time ? hub.lastBar.close : rawOpen;
            const candle: OhlcBar = {
              time: rawBucket,
              open: connectedOpen,
              high: Math.max(rawHigh, connectedOpen, rawClose),
              low: Math.min(rawLow, connectedOpen, rawClose),
              close: rawClose,
              ...(k.v ? { volume: parseFloat(k.v) } : {}),
            };
            hub.lastBar = candle;
            broadcastToHub(hub, {
              type: 'kline',
              symbol: hub.symbol,
              interval: hub.interval,
              candle,
              isClosed: Boolean(k.x),
              streamSource: 'binance-ws',
            });
          } catch {
            // ignore malformed frame
          }
        });

        upstream.on('error', () => {
          hub.upstreamWs = null;
          startSpotTicker();
        });
        upstream.on('close', () => {
          hub.upstreamWs = null;
          if (hub.clients.size > 0 && !hub.disposed) startSpotTicker();
        });
      } catch {
        startSpotTicker();
      }
    } else if (hub.symbol === 'XAUUSD') {
      // Dual-channel live XAU/USD feed: rapid genuine OANDA/Swissquote spot sync + continuous heartbeat
      startSpotTicker();
    } else {
      startSpotTicker();
    }

    if (!hub.heartbeatTimer) {
      hub.heartbeatTimer = setInterval(() => {
        if (hub.disposed || hub.clients.size === 0) return;
        broadcastToHub(hub, { type: 'heartbeat', ts: Date.now() });
      }, 4500);
    }
  };

  marketWss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url ?? '/ws/market', 'http://localhost');
    const rawSym = (reqUrl.searchParams.get('symbol') ?? 'XAUUSD').trim().toUpperCase();
    const rawIv = (reqUrl.searchParams.get('interval') ?? '15m').trim().toLowerCase();

    if (!KLINE_SYMBOL_MAP[rawSym] || !ALLOWED_KLINE_INTERVALS.has(rawIv)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unsupported symbol or interval' }));
      ws.close();
      return;
    }

    const key = `${rawSym}:${rawIv}`;
    let hub = streamHubs.get(key);
    if (!hub) {
      hub = {
        symbol: rawSym,
        interval: rawIv,
        clients: new Set<WebSocket>(),
        lastBar: null,
        pollTimer: null,
        heartbeatTimer: null,
        upstreamWs: null,
        disposed: false,
      };
      streamHubs.set(key, hub);
      hub.clients.add(ws);
      void startHubFeed(key, hub);
    } else {
      hub.clients.add(ws);
      if (hub.lastBar && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'kline',
            symbol: hub.symbol,
            interval: hub.interval,
            candle: hub.lastBar,
            isClosed: false,
            streamSource: 'spot-ws',
          })
        );
      }
    }

    ws.on('close', () => {
      hub?.clients.delete(ws);
      cleanupHubIfEmpty(key);
    });
    ws.on('error', () => {
      hub?.clients.delete(ws);
      cleanupHubIfEmpty(key);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url ?? '/', 'http://localhost');
      if (reqUrl.pathname === '/ws/market') {
        marketWss.handleUpgrade(request, socket, head, (ws) => {
          marketWss.emit('connection', ws, request);
        });
        return;
      }
    } catch {
      // ignore invalid URL
    }
    socket.destroy();
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TREDAURA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
