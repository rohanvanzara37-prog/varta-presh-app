import type { TickerTopic } from '../components/MarketNewsTicker';

export interface FallbackCalendarEvent {
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

export interface FallbackNewsItem {
  id: string;
  headline: string;
  category: Exclude<TickerTopic, 'ALL'>;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  source: string;
  url: string;
  publishedAt: string;
  publishedAtMs?: number;
}

export interface FallbackNewsPayload {
  updatedAt: string;
  filteredByGemini: boolean;
  globalSentiment: {
    label: 'Risk-On' | 'Risk-Off' | 'Cautious' | 'Mixed';
    summary: string;
  };
  items: FallbackNewsItem[];
}

const CAL_CACHE_KEY = 'vp_economic_calendar_cache_v1';
const NEWS_CACHE_KEY = 'vp_news_wire_cache_v1';

export function buildFallbackCalendarEvents(nowMs = Date.now()): FallbackCalendarEvent[] {
  // Anchor schedule cleanly around UTC today so Upcoming & Today + Countdown always show active USD/Gold/Crypto events
  const d = new Date(nowMs);
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
  const hour = 3600_000;
  const min = 60_000;

  const specs: Array<{
    slug: string;
    offsetMs: number;
    currency: string;
    impact: 'High' | 'Medium' | 'Low';
    title: string;
    forecast: string;
    previous: string;
    actualIfPast: string;
  }> = [
    {
      slug: 'usd-pce',
      offsetMs: -3 * hour,
      currency: 'USD',
      impact: 'High',
      title: 'US Core PCE Price Index m/m',
      forecast: '0.3%',
      previous: '0.2%',
      actualIfPast: '0.3%',
    },
    {
      slug: 'usd-claims',
      offsetMs: -90 * min,
      currency: 'USD',
      impact: 'High',
      title: 'US Initial Jobless Claims',
      forecast: '218K',
      previous: '213K',
      actualIfPast: '215K',
    },
    {
      slug: 'xau-yields',
      offsetMs: 45 * min,
      currency: 'XAU',
      impact: 'High',
      title: 'LBMA Gold Liquidity Fix & US 10Y Real Yield Watch',
      forecast: '4.28%',
      previous: '4.31%',
      actualIfPast: '4.27%',
    },
    {
      slug: 'ism-mfg',
      offsetMs: 2.5 * hour,
      currency: 'USD',
      impact: 'High',
      title: 'US ISM Manufacturing PMI',
      forecast: '49.4',
      previous: '48.9',
      actualIfPast: '49.6',
    },
    {
      slug: 'fed-powell',
      offsetMs: 5 * hour,
      currency: 'USD',
      impact: 'High',
      title: 'FOMC Policy Guidance & Fed Chair Remarks',
      forecast: '4.50%',
      previous: '4.50%',
      actualIfPast: '4.50%',
    },
    {
      slug: 'btc-etf',
      offsetMs: 8 * hour,
      currency: 'BTC',
      impact: 'High',
      title: 'Spot Bitcoin ETF Net Flows & CME Options Expiry',
      forecast: '+$340M',
      previous: '+$285M',
      actualIfPast: '+$362M',
    },
    {
      slug: 'eur-cpi',
      offsetMs: 14 * hour,
      currency: 'EUR',
      impact: 'Medium',
      title: 'Eurozone Core CPI Flash Estimate y/y',
      forecast: '2.7%',
      previous: '2.7%',
      actualIfPast: '2.6%',
    },
    {
      slug: 'us-cpi',
      offsetMs: 26 * hour,
      currency: 'USD',
      impact: 'High',
      title: 'US Consumer Price Index (CPI) m/m',
      forecast: '0.2%',
      previous: '0.3%',
      actualIfPast: '0.2%',
    },
    {
      slug: 'us-retail',
      offsetMs: 30 * hour,
      currency: 'USD',
      impact: 'Medium',
      title: 'US Core Retail Sales m/m',
      forecast: '0.4%',
      previous: '0.3%',
      actualIfPast: '0.4%',
    },
    {
      slug: 'us-nfp',
      offsetMs: 50 * hour,
      currency: 'USD',
      impact: 'High',
      title: 'US Non-Farm Employment Change (NFP)',
      forecast: '185K',
      previous: '176K',
      actualIfPast: '192K',
    },
    {
      slug: 'us-unemp',
      offsetMs: 50 * hour,
      currency: 'USD',
      impact: 'High',
      title: 'US Unemployment Rate',
      forecast: '4.1%',
      previous: '4.1%',
      actualIfPast: '4.0%',
    },
    {
      slug: 'jpy-boj',
      offsetMs: 62 * hour,
      currency: 'JPY',
      impact: 'Medium',
      title: 'BoJ Monetary Policy Summary & Yen Liquidity',
      forecast: '0.25%',
      previous: '0.25%',
      actualIfPast: '0.25%',
    },
  ];

  // Round anchor to nearest hour so timestamps stay deterministic within the hour
  const anchorHour = utcMidnight + new Date(nowMs).getUTCHours() * hour;

  return specs
    .map((s) => {
      const ts = anchorHour + s.offsetMs;
      const isPast = ts <= nowMs;
      return {
        id: `vp_cal_${s.slug}_${Math.floor(ts / hour)}`,
        title: s.title,
        currency: s.currency,
        dateIso: new Date(ts).toISOString(),
        timestampMs: ts,
        impact: s.impact,
        forecast: s.forecast,
        previous: s.previous,
        actual: isPast ? s.actualIfPast : '',
      };
    })
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function buildFallbackNewsWire(nowMs = Date.now()): FallbackNewsPayload {
  const items: FallbackNewsItem[] = [
    {
      id: 'fb_gold_1',
      headline: 'Spot Gold (XAU/USD) holds firm near key institutional liquidity zones ahead of US macro releases',
      category: 'GOLD',
      sentiment: 'Bullish',
      source: 'Bullion Desk',
      url: 'https://www.reuters.com/markets/commodities/',
      publishedAt: '4m ago',
      publishedAtMs: nowMs - 4 * 60_000,
    },
    {
      id: 'fb_fomc_2',
      headline: 'Fed policymakers signal data-dependent rate path as Treasury yields consolidate ahead of FOMC window',
      category: 'FOMC',
      sentiment: 'Neutral',
      source: 'Macro Wire',
      url: 'https://www.federalreserve.gov/newsevents.htm',
      publishedAt: '11m ago',
      publishedAtMs: nowMs - 11 * 60_000,
    },
    {
      id: 'fb_crypto_3',
      headline: 'Bitcoin and Ethereum attract steady institutional ETF inflows as spot liquidity tightens',
      category: 'CRYPTO',
      sentiment: 'Bullish',
      source: 'Digital Asset Wire',
      url: 'https://www.coindesk.com/',
      publishedAt: '18m ago',
      publishedAtMs: nowMs - 18 * 60_000,
    },
    {
      id: 'fb_cpi_4',
      headline: 'Markets price softer US CPI trajectory as shelter and energy components moderate sequentially',
      category: 'CPI',
      sentiment: 'Bullish',
      source: 'US Macro Desk',
      url: 'https://www.bls.gov/cpi/',
      publishedAt: '27m ago',
      publishedAtMs: nowMs - 27 * 60_000,
    },
    {
      id: 'fb_pce_5',
      headline: 'Core PCE inflation print remains central catalyst for USD Index (DXY) and precious metals breakout',
      category: 'PCE/PCA',
      sentiment: 'Neutral',
      source: 'FX Briefing',
      url: 'https://www.bea.gov/data/personal-consumption-expenditures-price-index',
      publishedAt: '39m ago',
      publishedAtMs: nowMs - 39 * 60_000,
    },
    {
      id: 'fb_ism_6',
      headline: 'ISM Manufacturing new orders sub-index ticks higher, lifting risk sentiment across US equities & crypto',
      category: 'ISM',
      sentiment: 'Bullish',
      source: 'Industrial Wire',
      url: 'https://www.ismworld.org/',
      publishedAt: '52m ago',
      publishedAtMs: nowMs - 52 * 60_000,
    },
    {
      id: 'fb_usdt_7',
      headline: 'USDT stablecoin net exchange reserves expand, supporting spot crypto orderbook depth',
      category: 'USDT',
      sentiment: 'Bullish',
      source: 'On-Chain Desk',
      url: 'https://www.coindesk.com/',
      publishedAt: '1h ago',
      publishedAtMs: nowMs - 68 * 60_000,
    },
    {
      id: 'fb_gold_8',
      headline: 'Central bank bullion accumulation stays elevated while USD tracks real yield fluctuations',
      category: 'GOLD',
      sentiment: 'Bullish',
      source: 'Metals Briefing',
      url: 'https://www.gold.org/',
      publishedAt: '1h ago',
      publishedAtMs: nowMs - 85 * 60_000,
    },
  ];

  return {
    updatedAt: new Date(nowMs).toISOString(),
    filteredByGemini: false,
    globalSentiment: {
      label: 'Mixed',
      summary: 'Global Gold, USD Macro & Crypto Headlines',
    },
    items,
  };
}

export function loadCachedCalendarEvents(): FallbackCalendarEvent[] {
  try {
    const raw = localStorage.getItem(CAL_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FallbackCalendarEvent[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return buildFallbackCalendarEvents();
}

export function saveCachedCalendarEvents(events: FallbackCalendarEvent[]): void {
  if (!Array.isArray(events) || events.length === 0) return;
  try {
    localStorage.setItem(CAL_CACHE_KEY, JSON.stringify(events.slice(0, 60)));
  } catch {
    // ignore storage quota errors
  }
}

export function loadCachedNewsWire(): FallbackNewsPayload {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FallbackNewsPayload;
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return buildFallbackNewsWire();
}

export function saveCachedNewsWire(payload: FallbackNewsPayload): void {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return;
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}
