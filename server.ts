import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
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

async function getLiveMarketsPayload(): Promise<LiveMarketsPayload> {
  if (marketsCache && marketsCache.expiresAt > Date.now()) {
    return marketsCache.payload;
  }

  const [xauRes, xagRes, cgRes, btcCbRes, xauYQuote, sp500Quote, oilQuote] = await Promise.all([
    fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAU'),
    fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAG'),
    fetchJsonWithTimeout<
      Record<string, { usd?: number; usd_24h_change?: number }>
    >(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple&vs_currencies=usd&include_24hr_change=true'
    ),
    fetchJsonWithTimeout<{ data?: { amount?: string } }>('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
    fetchYahooQuote('GC=F'),
    fetchYahooQuote('^GSPC'),
    fetchYahooQuote('CL=F'),
  ]);

  const xauUsd =
    typeof xauRes?.price === 'number' && xauRes.price > 500
      ? Number(xauRes.price.toFixed(2))
      : xauYQuote?.price ?? 2664.8;
  const xagUsd =
    typeof xagRes?.price === 'number' && xagRes.price > 5
      ? Number(xagRes.price.toFixed(2))
      : 31.42;

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
      xagRes?.price ||
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
        provider: xauRes?.price ? 'Gold-API Live' : xauYQuote ? 'COMEX Live' : 'Bullion Snapshot',
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
        changePct24h: 0.42,
        provider: xagRes?.price ? 'Gold-API Live' : 'Bullion Snapshot',
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
  'https://news.google.com/rss/search?q=(Gold+XAUUSD+OR+CPI+inflation+OR+FOMC+Fed)+when:7d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=(ISM+PMI+OR+PCE+inflation+OR+PCA+macro)+when:14d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=(crypto+Bitcoin+OR+USDT+Tether+OR+NFT+market)+when:7d&hl=en-US&gl=US&ceid=US:en',
] as const;

let tickerCache: { expiresAt: number; payload: NewsTickerPayload } | null = null;
let tickerInFlight: Promise<NewsTickerPayload> | null = null;
let lastForcedTickerRefresh = 0;

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
    items.push({
      title: cleanTitle,
      source: source || 'Market Wire',
      url,
      publishedAt: formatShortPubDate(decodeXmlEntities(rawPubDate)),
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
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new GeminiTickerError(
        'Gemini API key is not configured. Check GEMINI_API_KEY in Settings > Secrets.',
        503,
        'MISSING_API_KEY'
      );
    }

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
      throw new GeminiTickerError(
        'Unable to reach live financial RSS news feeds right now.',
        502,
        'RSS_UNAVAILABLE'
      );
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
      const result = await callGeminiWithRetry(() =>
        Promise.race([
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents:
              `Select up to 12 diverse market headlines from the numbered feed below covering Gold, Crypto, USDT, CPI, PCE/PCA, NFT, FOMC, ISM, and Global Market Sentiment.\n\n` +
              `Live Feed:\n${promptLines}`,
            config: {
              abortSignal: AbortSignal.timeout(40000),
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
            setTimeout(() => reject(new Error('Gemini request timed out')), 40000)
          ),
        ])
      );
      console.log(`[news-ticker] Gemini filtered in ${Date.now() - t0}ms`);
      responseText = (result.text ?? '').trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : '';
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('400')) {
        throw new GeminiTickerError(
          'Gemini API key error. Please verify GEMINI_API_KEY in Settings > Secrets.',
          403,
          'INVALID_API_KEY'
        );
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw new GeminiTickerError(
          'Gemini rate limit reached. Please retry shortly or check quota in Settings > Secrets.',
          429,
          'RATE_LIMITED'
        );
      }
      if (msg.includes('404') || msg.includes('NOT_FOUND')) {
        throw new GeminiTickerError(
          'Configured Gemini model is currently unavailable for this key.',
          404,
          'MODEL_NOT_FOUND'
        );
      }
      if (errName === 'AbortError' || msg.includes('timed out') || msg.includes('aborted')) {
        throw new GeminiTickerError(
          'Gemini news filter timed out. Please retry.',
          504,
          'GEMINI_TIMEOUT'
        );
      }
      throw new GeminiTickerError(
        `Gemini news filter failed to respond (${msg.slice(0, 80)}).`,
        502,
        'UPSTREAM_GEMINI_ERROR'
      );
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
      throw new GeminiTickerError(
        'Received malformed response from Gemini filter.',
        502,
        'MALFORMED_GEMINI_JSON'
      );
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
      });
    }

    if (items.length === 0) {
      throw new GeminiTickerError(
        'Gemini did not return any matching market headlines.',
        502,
        'EMPTY_GEMINI_FILTER'
      );
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
      expiresAt: Date.now() + 10 * 60 * 1000,
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

  const KLINE_SYMBOL_MAP: Record<string, { source: 'yahoo' | 'binance'; ticker: string }> = {
    XAUUSD: { source: 'yahoo', ticker: 'GC=F' },
    US500: { source: 'yahoo', ticker: '^GSPC' },
    USOIL: { source: 'yahoo', ticker: 'CL=F' },
    BTCUSDT: { source: 'binance', ticker: 'BTCUSDT' },
    ETHUSDT: { source: 'binance', ticker: 'ETHUSDT' },
    SOLUSDT: { source: 'binance', ticker: 'SOLUSDT' },
    BNBUSDT: { source: 'binance', ticker: 'BNBUSDT' },
    XRPUSDT: { source: 'binance', ticker: 'XRPUSDT' },
  };
  const ALLOWED_KLINE_INTERVALS = new Set(['1m', '5m', '15m', '1h']);
  const klineCache = new Map<string, { expiresAt: number; candles: Array<{ time: number; open: number; high: number; low: number; close: number }> }>();

  app.get('/api/klines', async (req, res) => {
    const rawSym = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : 'XAUUSD';
    const rawIv = typeof req.query.interval === 'string' ? req.query.interval.trim().toLowerCase() : '15m';

    const spec = KLINE_SYMBOL_MAP[rawSym];
    if (!spec || !ALLOWED_KLINE_INTERVALS.has(rawIv)) {
      res.status(400).json({ error: 'Invalid symbol or interval.' });
      return;
    }

    const cacheKey = `${rawSym}:${rawIv}`;
    const cached = klineCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ symbol: rawSym, interval: rawIv, source: spec.source, candles: cached.candles });
      return;
    }

    const byTime = new Map<number, { time: number; open: number; high: number; low: number; close: number }>();

    if (spec.source === 'binance') {
      const urls = [
        `https://api.binance.com/api/v3/klines?symbol=${spec.ticker}&interval=${rawIv}&limit=160`,
        `https://data-api.binance.vision/api/v3/klines?symbol=${spec.ticker}&interval=${rawIv}&limit=160`,
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
      const range = rawIv === '1m' ? '1d' : rawIv === '1h' ? '1mo' : '5d';
      const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.ticker)}?interval=${rawIv}&range=${range}`;
      const json = await fetchJsonWithTimeout<YahooChartResponse>(u, 5000, {
        'User-Agent': 'Mozilla/5.0',
      });
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
            byTime.set(t, {
              time: t,
              open: Number(open.toFixed(2)),
              high: Number(high.toFixed(2)),
              low: Number(low.toFixed(2)),
              close: Number(close.toFixed(2)),
            });
          }
        }
      }
    }

    const candles = Array.from(byTime.values())
      .sort((a, b) => a.time - b.time)
      .slice(-160);

    if (candles.length === 0) {
      res.status(502).json({ error: `Unable to fetch live candles for ${rawSym}.` });
      return;
    }

    klineCache.set(cacheKey, {
      expiresAt: Date.now() + 5000,
      candles,
    });

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VartaPress server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
