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
    category: 'Metals' | 'Crypto' | 'Indices' | 'Commodities';
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

async function fetchYahooQuote(yahooSymbol: string): Promise<{ price: number; changePct: number } | null> {
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
  return { price: Number(price.toFixed(2)), changePct };
}

async function fetchSwissquoteMid(instrument: 'XAU' | 'XAG'): Promise<number | null> {
  const data = await fetchJsonWithTimeout<
    Array<{ spreadProfilePrices?: Array<{ bid?: number; ask?: number }> }>
  >(`https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${instrument}/USD`, 2800);
  const quote = data?.[0]?.spreadProfilePrices?.[0];
  const minBound = instrument === 'XAU' ? 500 : 5;
  if (
    typeof quote?.bid === 'number' &&
    typeof quote?.ask === 'number' &&
    quote.bid > minBound &&
    quote.ask > minBound
  ) {
    return Number(((quote.bid + quote.ask) / 2).toFixed(2));
  }
  return null;
}

async function fetchSwissquoteXauMid(): Promise<number | null> {
  return fetchSwissquoteMid('XAU');
}

async function getLiveMarketsPayload(): Promise<LiveMarketsPayload> {
  if (marketsCache && marketsCache.expiresAt > Date.now()) {
    return marketsCache.payload;
  }

  const [xauRes, xagRes, sqXau, cgRes, btcCbRes, xauYQuote, xagYQuote, sp500Quote, oilQuote] =
    await Promise.all([
      fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAU'),
      fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAG'),
      fetchSwissquoteXauMid(),
      fetchJsonWithTimeout<
        Record<string, { usd?: number; usd_24h_change?: number }>
      >(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple&vs_currencies=usd&include_24hr_change=true'
      ),
      fetchJsonWithTimeout<{ data?: { amount?: string } }>('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
      fetchYahooQuote('GC=F'),
      fetchYahooQuote('SI=F'),
      fetchYahooQuote('^GSPC'),
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
    try {
      const now = Date.now();
      const fromIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const toIso = new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString();
      const tvUrl = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(
        fromIso
      )}&to=${encodeURIComponent(toIso)}&countries=US,EU,GB,JP,AU,CA,NZ,CH,CN`;

      const tvRes = await fetch(tvUrl, {
        signal: controller.signal,
        headers: {
          Origin: 'https://www.tradingview.com',
          Referer: 'https://www.tradingview.com/',
          'User-Agent': 'Mozilla/5.0 (compatible; VartaPresh-CalendarSync/1.0)',
          Accept: 'application/json',
        },
      });

      const events: EconomicCalendarEvent[] = [];

      if (tvRes.ok) {
        const tvJson = (await tvRes.json()) as {
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
        };

        for (const item of Array.isArray(tvJson.result) ? tvJson.result : []) {
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
      } else {
        // Fallback to ForexFactory weekly feed if primary is temporarily unavailable
        const ffRes = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
          signal: controller.signal,
          headers: {
            'User-Agent': 'VartaPresh-CalendarSync/1.0',
            Accept: 'application/json',
          },
        });
        if (!ffRes.ok) {
          throw new Error(`Calendar HTTP ${tvRes.status}/${ffRes.status}`);
        }
        const raw = (await ffRes.json()) as Array<{
          title?: string;
          country?: string;
          date?: string;
          impact?: string;
          forecast?: string;
          previous?: string;
          actual?: string;
        }>;
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
    } catch (err) {
      if (calendarCache) {
        return calendarCache.payload;
      }
      throw err;
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
      headers: { 'User-Agent': 'VartaPresh-MarketReader/1.0' },
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
      if (tickerCache) {
        return tickerCache.payload;
      }
      throw new GeminiTickerError(
        'Unable to reach live financial RSS news feeds right now.',
        502,
        'RSS_UNAVAILABLE'
      );
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
    res.json({ ok: true, app: 'VartaPress', timestamp: new Date().toISOString() });
  });

  app.get('/api/markets/live', async (_req, res) => {
    const payload = await getLiveMarketsPayload();
    res.json(payload);
  });

  const KLINE_SYMBOL_MAP: Record<
    string,
    { source: 'yahoo' | 'binance'; ticker: string; spotAnchor?: 'XAU' | 'XAG' | 'US500'; precision: number }
  > = {
    XAUUSD: { source: 'yahoo', ticker: 'GC=F', spotAnchor: 'XAU', precision: 2 },
    XAGUSD: { source: 'yahoo', ticker: 'SI=F', spotAnchor: 'XAG', precision: 2 },
    US500: { source: 'yahoo', ticker: 'ES=F', spotAnchor: 'US500', precision: 2 },
    USOIL: { source: 'yahoo', ticker: 'CL=F', precision: 2 },
    BTCUSDT: { source: 'binance', ticker: 'BTCUSDT', precision: 2 },
    ETHUSDT: { source: 'binance', ticker: 'ETHUSDT', precision: 2 },
    SOLUSDT: { source: 'binance', ticker: 'SOLUSDT', precision: 2 },
    BNBUSDT: { source: 'binance', ticker: 'BNBUSDT', precision: 2 },
    XRPUSDT: { source: 'binance', ticker: 'XRPUSDT', precision: 4 },
  };
  const INTERVAL_SECONDS: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
  };
  const ALLOWED_KLINE_INTERVALS = new Set(Object.keys(INTERVAL_SECONDS));
  type OhlcBar = { time: number; open: number; high: number; low: number; close: number };
  const klineCache = new Map<string, { expiresAt: number; candles: OhlcBar[] }>();

  async function fetchSpotForKlineSymbol(rawSym: string): Promise<number | null> {
    const spec = KLINE_SYMBOL_MAP[rawSym];
    if (!spec) return null;
    if (spec.spotAnchor === 'XAU') {
      const sq = await fetchSwissquoteMid('XAU');
      if (sq) return sq;
      const g = await fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAU', 2500);
      return typeof g?.price === 'number' && g.price > 500 ? Number(g.price.toFixed(2)) : null;
    }
    if (spec.spotAnchor === 'XAG') {
      const sq = await fetchSwissquoteMid('XAG');
      if (sq) return sq;
      const g = await fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAG', 2500);
      return typeof g?.price === 'number' && g.price > 5 ? Number(g.price.toFixed(2)) : null;
    }
    if (spec.spotAnchor === 'US500') {
      const q = await fetchYahooQuote('^GSPC');
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

  async function fetchKlinesForSymbol(rawSym: string, rawIv: string): Promise<OhlcBar[]> {
    const spec = KLINE_SYMBOL_MAP[rawSym];
    if (!spec || !ALLOWED_KLINE_INTERVALS.has(rawIv)) return [];

    const cacheKey = `${rawSym}:${rawIv}`;
    const cached = klineCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.candles;
    }

    const byTime = new Map<number, OhlcBar>();

    if (spec.source === 'binance') {
      const urls = [
        `https://api.binance.com/api/v3/klines?symbol=${spec.ticker}&interval=${rawIv}&limit=180`,
        `https://data-api.binance.vision/api/v3/klines?symbol=${spec.ticker}&interval=${rawIv}&limit=180`,
      ];
      for (const u of urls) {
        const rows = await fetchJsonWithTimeout<Array<[number, string, string, string, string]>>(u, 4500);
        if (Array.isArray(rows) && rows.length >= 10) {
          for (const d of rows) {
            const t = Math.floor(d[0] / 1000);
            const open = Number(d[1]);
            const high = Number(d[2]);
            const low = Number(d[3]);
            const close = Number(d[4]);
            if ([t, open, high, low, close].every(Number.isFinite)) {
              byTime.set(t, { time: t, open, high, low, close });
            }
          }
          break;
        }
      }
    } else {
      const yahooIv = rawIv === '4h' ? '1h' : rawIv;
      const range =
        rawIv === '1m' || rawIv === '5m' || rawIv === '15m'
          ? '5d'
          : rawIv === '30m' || rawIv === '1h'
            ? '1mo'
            : rawIv === '4h'
              ? '3mo'
              : '1y';
      const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.ticker)}?interval=${yahooIv}&range=${range}`;

      const [json, liveSpot] = await Promise.all([
        fetchJsonWithTimeout<YahooChartResponse>(u, 5000, { 'User-Agent': 'Mozilla/5.0' }),
        fetchSpotForKlineSymbol(rawSym),
      ]);

      const result = json?.chart?.result?.[0];
      const ts = result?.timestamp ?? [];
      const q = result?.indicators?.quote?.[0];
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
            const bucketTime = rawIv === '4h' ? Math.floor(t / 14400) * 14400 : rawIv === '1d' ? Math.floor(t / 86400) * 86400 : t;
            const prev = byTime.get(bucketTime);
            if (!prev) {
              byTime.set(bucketTime, {
                time: bucketTime,
                open: Number(open.toFixed(spec.precision)),
                high: Number(high.toFixed(spec.precision)),
                low: Number(low.toFixed(spec.precision)),
                close: Number(close.toFixed(spec.precision)),
              });
            } else {
              prev.high = Number(Math.max(prev.high, high).toFixed(spec.precision));
              prev.low = Number(Math.min(prev.low, low).toFixed(spec.precision));
              prev.close = Number(close.toFixed(spec.precision));
            }
          }
        }
      }

      // Calibrate futures OHLC curve (GC=F / SI=F / ES=F) to exact real-time Spot price
      if (typeof liveSpot === 'number' && byTime.size > 0) {
        const sorted = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
        const latest = sorted[sorted.length - 1];
        const basis = liveSpot - latest.close;
        if (Math.abs(basis) > 0.01 && Math.abs(basis) < liveSpot * 0.05) {
          for (const bar of sorted) {
            byTime.set(bar.time, {
              time: bar.time,
              open: Number((bar.open + basis).toFixed(spec.precision)),
              high: Number((bar.high + basis).toFixed(spec.precision)),
              low: Number((bar.low + basis).toFixed(spec.precision)),
              close: Number((bar.close + basis).toFixed(spec.precision)),
            });
          }
        }
      }
    }

    const candles = Array.from(byTime.values())
      .sort((a, b) => a.time - b.time)
      .slice(-180);

    if (candles.length > 0) {
      klineCache.set(cacheKey, {
        expiresAt: Date.now() + 4000,
        candles,
      });
    }
    return candles;
  }

  app.get('/api/klines', async (req, res) => {
    const rawSym = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : 'XAUUSD';
    const rawIv = typeof req.query.interval === 'string' ? req.query.interval.trim().toLowerCase() : '15m';

    const spec = KLINE_SYMBOL_MAP[rawSym];
    if (!spec || !ALLOWED_KLINE_INTERVALS.has(rawIv)) {
      res.status(400).json({ error: 'Invalid symbol or interval.' });
      return;
    }

    const candles = await fetchKlinesForSymbol(rawSym, rawIv);
    if (candles.length === 0) {
      res.status(502).json({ error: `Unable to fetch live candles for ${rawSym}.` });
      return;
    }

    res.json({ symbol: rawSym, interval: rawIv, source: spec.source, candles });
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
    } catch (err) {
      if (err instanceof GeminiTickerError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: 'Unexpected error loading news ticker.', code: 'INTERNAL_ERROR' });
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
      res.status(502).json({ error: 'Unable to fetch live economic calendar events.' });
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
    upstreamWs: WebSocket | null;
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
    if (hub.pollTimer) clearInterval(hub.pollTimer);
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
      if (seedCandles.length > 0) {
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
      if (hub.pollTimer || hub.clients.size === 0) return;
      const tick = async () => {
        if (hub.clients.size === 0) return;
        const price = await fetchSpotForKlineSymbol(hub.symbol);
        if (price === null || !Number.isFinite(price)) return;

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
      };

      hub.pollTimer = setInterval(tick, 1500);
    };

    if (spec.source === 'binance') {
      try {
        const upstreamUrl = `wss://stream.binance.com:9443/ws/${spec.ticker.toLowerCase()}@kline_${hub.interval}`;
        const upstream = new WebSocket(upstreamUrl);
        hub.upstreamWs = upstream;

        upstream.on('message', (raw) => {
          if (hub.clients.size === 0) return;
          try {
            const parsed = JSON.parse(raw.toString()) as {
              k?: { t: number; o: string; h: string; l: string; c: string; x?: boolean };
            };
            const k = parsed?.k;
            if (!k) return;
            const candle: OhlcBar = {
              time: Math.floor(k.t / 1000),
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
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
          if (hub.clients.size > 0) startSpotTicker();
        });
      } catch {
        startSpotTicker();
      }
    } else {
      startSpotTicker();
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
        upstreamWs: null,
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
    console.log(`VartaPress server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
