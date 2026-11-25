import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Clock,
  ExternalLink,
  Flame,
  Maximize2,
  Minimize2,
  Minus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  buildFallbackCalendarEvents,
  buildFallbackNewsWire,
  loadCachedCalendarEvents,
  loadCachedNewsWire,
  saveCachedCalendarEvents,
  saveCachedNewsWire,
} from '../utils/newsCalendarFallback';
import type { TickerTopic } from './MarketNewsTicker';

interface NewsWireItem {
  id: string;
  headline: string;
  category: Exclude<TickerTopic, 'ALL'>;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  source: string;
  url: string;
  publishedAt: string;
  publishedAtMs?: number;
}

interface NewsWireResponse {
  updatedAt: string;
  filteredByGemini: boolean;
  globalSentiment: {
    label: 'Risk-On' | 'Risk-Off' | 'Cautious' | 'Mixed';
    summary: string;
  };
  items: NewsWireItem[];
  error?: string;
}

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

interface EconomicCalendarResponse {
  updatedAt: string;
  source: string;
  events: EconomicCalendarEvent[];
  error?: string;
}

type CalendarFilter = 'UPCOMING_RECENT' | 'HIGH_IMPACT' | 'USD_MACRO' | 'ALL_WEEK';

const AUTO_POLL_MS = 30_000;

const TOPICS: { id: TickerTopic; label: string }[] = [
  { id: 'ALL', label: 'All Wire' },
  { id: 'GOLD', label: 'Gold' },
  { id: 'CRYPTO', label: 'Crypto' },
  { id: 'FOMC', label: 'FOMC' },
  { id: 'CPI', label: 'CPI' },
  { id: 'PCE/PCA', label: 'PCE / PCA' },
  { id: 'ISM', label: 'ISM' },
  { id: 'USDT', label: 'USDT' },
  { id: 'NFT', label: 'NFT' },
  { id: 'SENTIMENT', label: 'Sentiment' },
];

const CURRENCY_BADGES: Record<string, string> = {
  USD: '🇺🇸 USD',
  XAU: '🥇 XAU',
  BTC: '₿ BTC',
  CRYPTO: '₿ CRYPTO',
  EUR: '🇪🇺 EUR',
  GBP: '🇬🇧 GBP',
  JPY: '🇯🇵 JPY',
  AUD: '🇦🇺 AUD',
  CAD: '🇨🇦 CAD',
  CHF: '🇨🇭 CHF',
  NZD: '🇳🇿 NZD',
  CNY: '🇨🇳 CNY',
};

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function getSentimentMeta(sentiment: NewsWireItem['sentiment']) {
  if (sentiment === 'Bullish') {
    return { color: '#089981', label: 'Bullish', Icon: TrendingUp };
  }
  if (sentiment === 'Bearish') {
    return { color: '#F23645', label: 'Bearish', Icon: TrendingDown };
  }
  return { color: '#94A3B8', label: 'Neutral', Icon: Minus };
}

function formatIstTimestamp(ms: number): string {
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(ms));
  return `${formatted.toUpperCase()} IST`;
}

function formatEventIstDateTime(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('month')} ${get('day')} · ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()} IST`;
}

function formatCountdown(diffMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

function parseMetricNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/,/g, '');
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([KMBT%])?/i);
  if (!match) return null;
  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = (match[2] ?? '').toUpperCase();
  if (suffix === 'K') return base * 1e3;
  if (suffix === 'M') return base * 1e6;
  if (suffix === 'B') return base * 1e9;
  if (suffix === 'T') return base * 1e12;
  return base;
}

type ActualStatus = 'beat' | 'miss' | 'inline' | 'released-pending' | 'upcoming';

function evaluateActualStatus(ev: EconomicCalendarEvent, nowMs: number): ActualStatus {
  const hasPassed = ev.timestampMs <= nowMs;
  const hasActual = ev.actual.trim().length > 0;

  if (!hasPassed && !hasActual) {
    return 'upcoming';
  }
  if (!hasActual) {
    return 'released-pending';
  }

  const actualVal = parseMetricNumber(ev.actual);
  const refVal = parseMetricNumber(ev.forecast || ev.previous);
  if (actualVal === null || refVal === null) {
    return 'inline';
  }
  if (actualVal === refVal) {
    return 'inline';
  }

  const lowerIsBullish = /unemployment|jobless|claims/i.test(ev.title);
  const isBeat = lowerIsBullish ? actualVal < refVal : actualVal > refVal;
  return isBeat ? 'beat' : 'miss';
}

type ImpactBadgeTone = 'bullish' | 'bearish' | 'volatile';

interface AssetImpactBadge {
  key: string;
  label: string;
  tone: ImpactBadgeTone;
}

interface MiniTickerAsset {
  id: 'XAUUSD' | 'XAGUSD' | 'BTCUSDT' | 'ETHUSDT';
  icon: string;
  label: string;
  price: number;
  changePct24h: number;
  decimals: number;
  isLiveWs: boolean;
}

function getBadgeStyle(tone: ImpactBadgeTone): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  if (tone === 'bullish') {
    return {
      backgroundColor: 'rgba(8, 153, 129, 0.14)',
      borderColor: 'rgba(8, 153, 129, 0.38)',
      color: '#089981',
    };
  }
  if (tone === 'bearish') {
    return {
      backgroundColor: 'rgba(242, 54, 69, 0.14)',
      borderColor: 'rgba(242, 54, 69, 0.38)',
      color: '#F23645',
    };
  }
  return {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.42)',
    color: '#F59E0B',
  };
}

function getCalendarAssetImpacts(
  ev: EconomicCalendarEvent,
  status: ActualStatus
): AssetImpactBadge[] {
  const isUsdEvent = ev.currency === 'USD';
  const isRiskSensitive = /cpi|pce|fomc|fed|rate|nfp|payroll|unemployment|jobless|gdp|pmi|ism|retail/i.test(
    ev.title
  );

  let effectiveDirection: 'usd_up' | 'usd_down' | null = null;
  if (status === 'beat') {
    effectiveDirection = isUsdEvent ? 'usd_up' : 'usd_down';
  } else if (status === 'miss') {
    effectiveDirection = isUsdEvent ? 'usd_down' : 'usd_up';
  } else if (status === 'upcoming' || status === 'released-pending') {
    const fVal = parseMetricNumber(ev.forecast);
    const pVal = parseMetricNumber(ev.previous);
    if (fVal !== null && pVal !== null && fVal !== pVal) {
      const lowerIsBullish = /unemployment|jobless|claims/i.test(ev.title);
      const forecastStrong = lowerIsBullish ? fVal < pVal : fVal > pVal;
      effectiveDirection = forecastStrong
        ? isUsdEvent
          ? 'usd_up'
          : 'usd_down'
        : isUsdEvent
          ? 'usd_down'
          : 'usd_up';
    }
  }

  const badges: AssetImpactBadge[] = [];

  if (ev.impact === 'High' || status === 'released-pending') {
    badges.push({
      key: 'vol',
      label: '⚡ High Volatility',
      tone: 'volatile',
    });
  }

  if (effectiveDirection === 'usd_up') {
    badges.push(
      { key: 'usd', label: '🇺🇸 USD: Bullish ↑', tone: 'bullish' },
      { key: 'gold', label: '🥇 Gold: Bearish ↓', tone: 'bearish' }
    );
    if (isRiskSensitive || ev.impact === 'High') {
      badges.push(
        { key: 'btc', label: '₿ BTC: Bearish ↓', tone: 'bearish' },
        { key: 'eth', label: 'Ξ ETH: Bearish ↓', tone: 'bearish' }
      );
    }
  } else if (effectiveDirection === 'usd_down') {
    badges.push(
      { key: 'gold', label: '🥇 Gold: Bullish ↑', tone: 'bullish' },
      { key: 'usd', label: '🇺🇸 USD: Bearish ↓', tone: 'bearish' }
    );
    if (isRiskSensitive || ev.impact === 'High') {
      badges.push(
        { key: 'btc', label: '₿ BTC: Bullish ↑', tone: 'bullish' },
        { key: 'eth', label: 'Ξ ETH: Bullish ↑', tone: 'bullish' }
      );
    }
  } else {
    if (!badges.some((b) => b.key === 'vol')) {
      badges.push({ key: 'vol', label: '⚡ Watch Reaction', tone: 'volatile' });
    }
    badges.push(
      { key: 'gold', label: '🥇 Gold: Volatility', tone: 'volatile' },
      { key: 'usd', label: '🇺🇸 USD: Volatility', tone: 'volatile' },
      { key: 'btc', label: '₿ BTC: Volatility', tone: 'volatile' }
    );
  }

  return badges;
}

function getNewsAssetImpacts(item: NewsWireItem): AssetImpactBadge[] {
  const text = `${item.category} ${item.headline}`.toLowerCase();
  const mentionsGold = /\b(gold|xau|bullion|silver|safe[- ]haven)\b/i.test(text) || item.category === 'GOLD';
  const mentionsBtc = /\b(btc|bitcoin|crypto|etf|halving)\b/i.test(text) || item.category === 'CRYPTO';
  const mentionsEth = /\b(eth|ethereum|altcoin|defi|nft|staking)\b/i.test(text) || item.category === 'NFT';
  const mentionsUsd =
    /\b(usd|dollar|dxy|fed|fomc|powell|cpi|pce|ism|pmi|inflation|rate|treasury|yield|usdt|tether)\b/i.test(
      text
    ) || ['FOMC', 'CPI', 'PCE/PCA', 'ISM', 'USDT'].includes(item.category);
  const isVolatileCatalyst =
    item.sentiment === 'Neutral' ||
    /\b(fomc|cpi|pce|powell|crash|surge|spike|plunge|liquidation|tariff|war|shock|volatile)\b/i.test(
      text
    );

  const badges: AssetImpactBadge[] = [];

  if (item.sentiment === 'Neutral') {
    badges.push({ key: 'vol', label: '⚡ High Volatility', tone: 'volatile' });
    if (mentionsGold || mentionsUsd) {
      badges.push(
        { key: 'gold', label: '🥇 Gold: Volatility', tone: 'volatile' },
        { key: 'usd', label: '🇺🇸 USD: Volatility', tone: 'volatile' }
      );
    }
    if (mentionsBtc || mentionsEth || (!mentionsGold && !mentionsUsd)) {
      badges.push(
        { key: 'btc', label: '₿ BTC: Volatility', tone: 'volatile' },
        { key: 'eth', label: 'Ξ ETH: Volatility', tone: 'volatile' }
      );
    }
    return badges;
  }

  const isBullish = item.sentiment === 'Bullish';

  if (mentionsGold && !mentionsBtc && !mentionsEth) {
    badges.push(
      {
        key: 'gold',
        label: isBullish ? '🥇 Gold: Bullish ↑' : '🥇 Gold: Bearish ↓',
        tone: isBullish ? 'bullish' : 'bearish',
      },
      {
        key: 'usd',
        label: isBullish ? '🇺🇸 USD: Bearish ↓' : '🇺🇸 USD: Bullish ↑',
        tone: isBullish ? 'bearish' : 'bullish',
      }
    );
  } else if (mentionsBtc || mentionsEth) {
    badges.push(
      {
        key: 'btc',
        label: isBullish ? '₿ BTC: Bullish ↑' : '₿ BTC: Bearish ↓',
        tone: isBullish ? 'bullish' : 'bearish',
      },
      {
        key: 'eth',
        label: isBullish ? 'Ξ ETH: Bullish ↑' : 'Ξ ETH: Bearish ↓',
        tone: isBullish ? 'bullish' : 'bearish',
      }
    );
    if (mentionsUsd) {
      badges.push({
        key: 'usd',
        label: isBullish ? '🇺🇸 USD: Bearish ↓' : '🇺🇸 USD: Bullish ↑',
        tone: isBullish ? 'bearish' : 'bullish',
      });
    }
  } else {
    // Macro / USD / Global Sentiment headlines move Gold, BTC, ETH inversely to USD strength
    const hawksihUsdNews = /\b(hawkish|rate hike|hot cpi|dollar rallies|strong dollar|yields surge)\b/i.test(
      text
    );
    const usdBullish = hawksihUsdNews ? true : !isBullish;
    badges.push(
      {
        key: 'gold',
        label: usdBullish ? '🥇 Gold: Bearish ↓' : '🥇 Gold: Bullish ↑',
        tone: usdBullish ? 'bearish' : 'bullish',
      },
      {
        key: 'btc',
        label: usdBullish ? '₿ BTC: Bearish ↓' : '₿ BTC: Bullish ↑',
        tone: usdBullish ? 'bearish' : 'bullish',
      },
      {
        key: 'eth',
        label: usdBullish ? 'Ξ ETH: Bearish ↓' : 'Ξ ETH: Bullish ↑',
        tone: usdBullish ? 'bearish' : 'bullish',
      },
      {
        key: 'usd',
        label: usdBullish ? '🇺🇸 USD: Bullish ↑' : '🇺🇸 USD: Bearish ↓',
        tone: usdBullish ? 'bullish' : 'bearish',
      }
    );
  }

  if (isVolatileCatalyst) {
    badges.push({ key: 'vol', label: '⚡ High Volatility', tone: 'volatile' });
  }

  return badges;
}

export const NewsTerminalView: React.FC = () => {
  const [data, setData] = useState<NewsWireResponse | null>(() => loadCachedNewsWire());
  const [calendarEvents, setCalendarEvents] = useState<EconomicCalendarEvent[]>(() =>
    loadCachedCalendarEvents()
  );
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number>(() => Date.now());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [topic, setTopic] = useState<TickerTopic>('ALL');
  const [query, setQuery] = useState('');
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>('UPCOMING_RECENT');
  const [isCalendarFullScreen, setIsCalendarFullScreen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('chart-fullscreen-active', isCalendarFullScreen);
    if (!isCalendarFullScreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCalendarFullScreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('chart-fullscreen-active');
    };
  }, [isCalendarFullScreen]);

  const [miniMarkets, setMiniMarkets] = useState<Record<MiniTickerAsset['id'], MiniTickerAsset>>({
    XAUUSD: {
      id: 'XAUUSD',
      icon: '🥇',
      label: 'Gold',
      price: 2664.8,
      changePct24h: 0.64,
      decimals: 2,
      isLiveWs: false,
    },
    XAGUSD: {
      id: 'XAGUSD',
      icon: '🥈',
      label: 'Silver',
      price: 31.42,
      changePct24h: 0.42,
      decimals: 2,
      isLiveWs: false,
    },
    BTCUSDT: {
      id: 'BTCUSDT',
      icon: '₿',
      label: 'BTC',
      price: 91850,
      changePct24h: 1.84,
      decimals: 2,
      isLiveWs: false,
    },
    ETHUSDT: {
      id: 'ETHUSDT',
      icon: 'Ξ',
      label: 'ETH',
      price: 3145.5,
      changePct24h: 1.21,
      decimals: 2,
      isLiveWs: false,
    },
  });

  // Store 24h open baseline for Metals so /ws/market price ticks update 24h% live
  const metalsBaselineRef = useRef<{ XAUUSD?: number; XAGUSD?: number }>({});

  // Track which newly passed events already triggered an immediate Actual reveal fetch
  const triggeredReleaseIdsRef = useRef<Set<string>>(new Set());
  const lastPollAtRef = useRef<number>(0);

  const loadCalendarOnly = useCallback(async (force = false) => {
    try {
      const res = await fetch(
        force ? '/api/economic-calendar?refresh=1' : '/api/economic-calendar',
        { cache: 'no-store' }
      );
      const text = await res.text();
      const json = JSON.parse(text) as EconomicCalendarResponse;
      if (res.ok && !json.error && Array.isArray(json.events) && json.events.length > 0) {
        setCalendarEvents(json.events);
        saveCachedCalendarEvents(json.events);
        setCalendarError(null);
        setLastUpdatedMs(Date.now());
        return;
      }
    } catch {
      // Fall through cleanly to cached/built-in schedule
    }
    setCalendarEvents((prev) => (prev.length > 0 ? prev : buildFallbackCalendarEvents()));
    setCalendarError(null);
  }, []);

  const loadAllFeeds = useCallback(async (force = false, silent = false) => {
    if (!silent) {
      setLoading(true);
    } else {
      setIsSyncing(true);
    }

    try {
      const newsUrl = force ? '/api/news-ticker?refresh=1' : '/api/news-ticker';
      const calUrl = force ? '/api/economic-calendar?refresh=1' : '/api/economic-calendar';

      const [newsSettled, calSettled] = await Promise.allSettled([
        fetch(newsUrl, { cache: 'no-store' }),
        fetch(calUrl, { cache: 'no-store' }),
      ]);

      let newsLoaded = false;
      if (newsSettled.status === 'fulfilled') {
        try {
          const newsText = await newsSettled.value.text();
          const json = JSON.parse(newsText) as NewsWireResponse;
          if (
            newsSettled.value.ok &&
            !json.error &&
            Array.isArray(json.items) &&
            json.items.length > 0
          ) {
            setData(json);
            saveCachedNewsWire(json);
            setErrorMsg(null);
            newsLoaded = true;
          }
        } catch {
          // Use fallback below
        }
      }
      if (!newsLoaded) {
        setData((prev) => {
          if (prev && prev.items.length > 0) return prev;
          const fb = buildFallbackNewsWire();
          saveCachedNewsWire(fb);
          return fb;
        });
        setErrorMsg(null);
      }

      let calLoaded = false;
      if (calSettled.status === 'fulfilled') {
        try {
          const calText = await calSettled.value.text();
          const calJson = JSON.parse(calText) as EconomicCalendarResponse;
          if (
            calSettled.value.ok &&
            !calJson.error &&
            Array.isArray(calJson.events) &&
            calJson.events.length > 0
          ) {
            setCalendarEvents(calJson.events);
            saveCachedCalendarEvents(calJson.events);
            setCalendarError(null);
            calLoaded = true;
          }
        } catch {
          // Use fallback below
        }
      }
      if (!calLoaded) {
        setCalendarEvents((prev) => {
          if (prev.length > 0) return prev;
          const fb = buildFallbackCalendarEvents();
          saveCachedCalendarEvents(fb);
          return fb;
        });
        setCalendarError(null);
      }

      const syncedAt = Date.now();
      lastPollAtRef.current = syncedAt;
      setLastUpdatedMs(syncedAt);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, []);

  // 1. Auto-Polling Live Feeds: fetch immediately + silently every 30 seconds in background
  useEffect(() => {
    void loadAllFeeds(false, false);

    const pollTimer = window.setInterval(() => {
      void loadAllFeeds(false, true);
    }, AUTO_POLL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastPollAtRef.current >= 25_000) {
        void loadAllFeeds(false, true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadAllFeeds]);

  // 2. Real-Time 1-Second Timer for Countdown & Automatic Actual Reveal
  useEffect(() => {
    const tickTimer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(tickTimer);
  }, []);

  // 3. Live Mini Price Move Strip (Baseline REST + Binance & Backend Market WebSockets)
  useEffect(() => {
    let disposed = false;

    const loadBaselineMarkets = async () => {
      try {
        const res = await fetch('/api/markets/live', { cache: 'no-store' });
        if (!res.ok || disposed) return;
        const json = (await res.json()) as {
          assets?: Array<{ id?: string; livePrice?: number; changePct24h?: number }>;
        };
        const assets = json.assets ?? [];
        const xau = assets.find((a) => a.id === 'xauusd');
        const xag = assets.find((a) => a.id === 'xagusd');
        const btc = assets.find((a) => a.id === 'btcusd');
        const eth = assets.find((a) => a.id === 'ethusd');

        if (xau?.livePrice) {
          const pct = xau.changePct24h ?? 0;
          metalsBaselineRef.current.XAUUSD = xau.livePrice / (1 + pct / 100);
        }
        if (xag?.livePrice) {
          const pct = xag.changePct24h ?? 0;
          metalsBaselineRef.current.XAGUSD = xag.livePrice / (1 + pct / 100);
        }

        setMiniMarkets((prev) => ({
          XAUUSD: xau?.livePrice
            ? { ...prev.XAUUSD, price: xau.livePrice, changePct24h: xau.changePct24h ?? prev.XAUUSD.changePct24h }
            : prev.XAUUSD,
          XAGUSD: xag?.livePrice
            ? { ...prev.XAGUSD, price: xag.livePrice, changePct24h: xag.changePct24h ?? prev.XAGUSD.changePct24h }
            : prev.XAGUSD,
          BTCUSDT:
            btc?.livePrice && !prev.BTCUSDT.isLiveWs
              ? { ...prev.BTCUSDT, price: btc.livePrice, changePct24h: btc.changePct24h ?? prev.BTCUSDT.changePct24h }
              : prev.BTCUSDT,
          ETHUSDT:
            eth?.livePrice && !prev.ETHUSDT.isLiveWs
              ? { ...prev.ETHUSDT, price: eth.livePrice, changePct24h: eth.changePct24h ?? prev.ETHUSDT.changePct24h }
              : prev.ETHUSDT,
        }));
      } catch {
        // Keep last live values
      }
    };

    void loadBaselineMarkets();
    const baselineTimer = window.setInterval(() => void loadBaselineMarkets(), AUTO_POLL_MS);

    // Binance Combined 24hr Ticker WebSocket for BTC & ETH
    let binanceWs: WebSocket | null = null;
    let binanceReconnect: number | null = null;
    const connectBinanceTicker = () => {
      if (disposed) return;
      try {
        binanceWs = new WebSocket(
          'wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker'
        );
        binanceWs.onmessage = (event) => {
          if (disposed) return;
          try {
            const msg = JSON.parse(event.data as string) as {
              data?: { s?: string; c?: string; P?: string };
            };
            const sym = msg.data?.s;
            const lastPrice = msg.data?.c ? Number.parseFloat(msg.data.c) : NaN;
            const pct24h = msg.data?.P ? Number.parseFloat(msg.data.P) : NaN;
            if ((sym === 'BTCUSDT' || sym === 'ETHUSDT') && Number.isFinite(lastPrice)) {
              setMiniMarkets((prev) => ({
                ...prev,
                [sym]: {
                  ...prev[sym],
                  price: lastPrice,
                  changePct24h: Number.isFinite(pct24h) ? pct24h : prev[sym].changePct24h,
                  isLiveWs: true,
                },
              }));
            }
          } catch {
            // ignore malformed frame
          }
        };
        binanceWs.onclose = () => {
          if (!disposed) {
            binanceReconnect = window.setTimeout(connectBinanceTicker, 3000);
          }
        };
        binanceWs.onerror = () => binanceWs?.close();
      } catch {
        binanceReconnect = window.setTimeout(connectBinanceTicker, 3000);
      }
    };
    connectBinanceTicker();

    // Backend /ws/market live WebSocket for Gold (XAUUSD) & Silver (XAGUSD)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const metalSockets: WebSocket[] = [];
    const metalTimers: number[] = [];

    (['XAUUSD', 'XAGUSD'] as const).forEach((sym) => {
      const connectMetal = () => {
        if (disposed) return;
        try {
          const ws = new WebSocket(
            `${wsProtocol}//${window.location.host}/ws/market?symbol=${sym}&interval=1m`
          );
          metalSockets.push(ws);
          ws.onmessage = (event) => {
            if (disposed) return;
            try {
              const payload = JSON.parse(event.data as string) as {
                type?: string;
                candle?: { close?: number };
              };
              const closePrice = payload.candle?.close;
              if (payload.type === 'kline' && typeof closePrice === 'number' && Number.isFinite(closePrice)) {
                setMiniMarkets((prev) => {
                  const baseOpen = metalsBaselineRef.current[sym];
                  const nextPct =
                    baseOpen && baseOpen > 0
                      ? ((closePrice - baseOpen) / baseOpen) * 100
                      : prev[sym].changePct24h;
                  return {
                    ...prev,
                    [sym]: {
                      ...prev[sym],
                      price: closePrice,
                      changePct24h: nextPct,
                      isLiveWs: true,
                    },
                  };
                });
              }
            } catch {
              // ignore malformed frame
            }
          };
          ws.onclose = () => {
            if (!disposed) {
              const t = window.setTimeout(connectMetal, 3000);
              metalTimers.push(t);
            }
          };
          ws.onerror = () => ws.close();
        } catch {
          // ignore ws init error
        }
      };
      connectMetal();
    });

    return () => {
      disposed = true;
      window.clearInterval(baselineTimer);
      if (binanceReconnect !== null) window.clearTimeout(binanceReconnect);
      binanceWs?.close();
      metalTimers.forEach((t) => window.clearTimeout(t));
      metalSockets.forEach((ws) => ws.close());
    };
  }, []);

  // Trigger automatic background Actual fetch right when an event's scheduled time passes
  useEffect(() => {
    const newlyPassed = calendarEvents.filter(
      (ev) =>
        ev.timestampMs <= nowMs &&
        nowMs - ev.timestampMs < 120_000 &&
        !ev.actual.trim() &&
        !triggeredReleaseIdsRef.current.has(ev.id)
    );

    if (newlyPassed.length === 0) return;

    newlyPassed.forEach((ev) => triggeredReleaseIdsRef.current.add(ev.id));

    const t1 = window.setTimeout(() => {
      void loadCalendarOnly(true);
    }, 1500);
    const t2 = window.setTimeout(() => {
      void loadCalendarOnly(true);
    }, 10_000);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [calendarEvents, nowMs, loadCalendarOnly]);

  const nextHighImpactEvent = useMemo(() => {
    return calendarEvents.find((ev) => ev.impact === 'High' && ev.timestampMs > nowMs) ?? null;
  }, [calendarEvents, nowMs]);

  const visibleCalendarEvents = useMemo(() => {
    const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
    const filtered = calendarEvents.filter((ev) => {
      if (calendarFilter === 'HIGH_IMPACT') return ev.impact === 'High';
      if (calendarFilter === 'USD_MACRO') return ev.currency === 'USD';
      if (calendarFilter === 'UPCOMING_RECENT') {
        return ev.timestampMs >= oneDayAgo;
      }
      return true;
    });

    // Prioritize upcoming & just-released events first while keeping chronological clarity
    const upcomingOrRecent = filtered.filter((ev) => ev.timestampMs >= nowMs - 4 * 60 * 60 * 1000);
    const olderPassed = filtered.filter((ev) => ev.timestampMs < nowMs - 4 * 60 * 60 * 1000);
    return [...upcomingOrRecent, ...olderPassed.reverse()].slice(0, 14);
  }, [calendarEvents, calendarFilter, nowMs]);

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const topicOk = topic === 'ALL' || item.category === topic;
      const queryOk =
        !q ||
        item.headline.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return topicOk && queryOk;
    });
  }, [data?.items, topic, query]);

  const secondsUntilNextSync = Math.max(
    0,
    Math.ceil((lastUpdatedMs + AUTO_POLL_MS - nowMs) / 1000)
  );

  return (
    <div
      className={
        isCalendarFullScreen
          ? 'mx-auto max-w-7xl'
          : 'h-[calc(100dvh-110px)] md:h-[calc(100dvh-64px)] overflow-y-auto overflow-x-hidden overscroll-contain mx-auto max-w-7xl space-y-2 pb-3 pr-0.5'
      }
    >
      {/* Compact Top Live Price Strip */}
      <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <div className="inline-flex items-center gap-1 rounded-full border border-[#089981]/35 bg-[#089981]/10 px-2 py-0.5 text-[9.5px] font-bold font-mono-tabular text-[#089981] shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-[#089981] animate-pulse" />
            <span>LIVE</span>
          </div>

          {(
            [miniMarkets.XAUUSD, miniMarkets.XAGUSD, miniMarkets.BTCUSDT, miniMarkets.ETHUSDT] as const
          ).map((asset) => {
            const isUp = asset.changePct24h >= 0;
            const formattedPrice = asset.price.toLocaleString('en-US', {
              minimumFractionDigits: asset.decimals,
              maximumFractionDigits: asset.decimals,
            });
            return (
              <div
                key={asset.id}
                className="flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-0.5 text-[11px] font-mono-tabular whitespace-nowrap shrink-0"
              >
                <span className="font-semibold text-[#131722]">
                  {asset.icon} {asset.label}
                </span>
                <span className="font-bold text-[#131722]">${formattedPrice}</span>
                <span
                  className="font-bold text-[10px]"
                  style={{ color: isUp ? '#089981' : '#F23645' }}
                >
                  {isUp ? '▲' : '▼'} {isUp ? '+' : ''}
                  {asset.changePct24h.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Economic Calendar + Auto-Sync Status Header */}
      <section
        className={
          isCalendarFullScreen
            ? 'vp-fullscreen-root bg-[#FFFFFF] p-3 sm:p-5 flex flex-col gap-2.5'
            : 'rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-2.5 sm:p-3.5 space-y-2'
        }
      >
        <div className="shrink-0 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-1.5">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <CalendarClock className="h-4 w-4 text-[#B45309] shrink-0" />
                <h1 className="text-xs sm:text-base font-bold tracking-tight text-[#131722] truncate">
                  Economic Calendar
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#089981]/30 bg-[#089981]/10 px-1.5 py-0.5 text-[9px] font-bold font-mono-tabular text-[#089981] shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#089981] animate-pulse" />
                  SYNC
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-mono-tabular text-[#64748B] hidden sm:inline">
                  {isSyncing ? 'Syncing...' : `${secondsUntilNextSync}s · ${formatIstTimestamp(lastUpdatedMs)}`}
                </span>
                <button
                  type="button"
                  onClick={() => setIsCalendarFullScreen((prev) => !prev)}
                  aria-label={isCalendarFullScreen ? 'Exit calendar full screen' : 'Expand calendar full screen'}
                  title={isCalendarFullScreen ? 'Exit Full-Screen' : 'Full-Screen Calendar'}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] px-2 text-[10.5px] font-bold text-[#131722] cursor-pointer shrink-0 lg:hidden"
                >
                  {isCalendarFullScreen ? (
                    <>
                      <Minimize2 className="h-3 w-3" />
                      <span>Exit</span>
                    </>
                  ) : (
                    <Maximize2 className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'UPCOMING_RECENT', label: 'Upcoming & Today' },
                { id: 'HIGH_IMPACT', label: 'High Impact' },
                { id: 'USD_MACRO', label: 'USD Events' },
                { id: 'ALL_WEEK', label: 'Full Week' },
              ] as { id: CalendarFilter; label: string }[]
            ).map((tab) => {
              const active = calendarFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCalendarFilter(tab.id)}
                  className="rounded-lg px-2.5 py-1 text-[10.5px] sm:text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: active ? '#F59E0B' : '#F3F4F6',
                    color: active ? '#131722' : '#475569',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setIsCalendarFullScreen((prev) => !prev)}
              aria-label={isCalendarFullScreen ? 'Exit calendar full screen' : 'Expand calendar full screen'}
              title={isCalendarFullScreen ? 'Exit Full-Screen' : 'Full-Screen Calendar'}
              className="hidden lg:inline-flex h-7 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] px-2.5 text-xs font-bold text-[#131722] cursor-pointer shrink-0 ml-auto"
            >
              {isCalendarFullScreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>Exit</span>
                </>
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Compact Real-Time Countdown Banner to Next High-Impact Event */}
        {nextHighImpactEvent ? (
          <div className="shrink-0 rounded-lg border border-[#F0B90B]/40 bg-[#FFFBEB]/70 px-2.5 py-1.5 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono-tabular">
                <span className="inline-flex items-center gap-0.5 rounded bg-[#F23645]/12 px-1 py-0.2 font-bold text-[#F23645]">
                  <Flame className="h-2.5 w-2.5" />
                  NEXT HIGH-IMPACT
                </span>
                <span className="font-bold text-[#131722]">
                  {CURRENCY_BADGES[nextHighImpactEvent.currency] ?? nextHighImpactEvent.currency}
                </span>
                <span className="text-[#475569]">
                  {formatEventIstDateTime(nextHighImpactEvent.timestampMs)}
                </span>
              </div>
              <p className="text-[11.5px] sm:text-xs font-bold text-[#131722] truncate">
                {nextHighImpactEvent.title}
              </p>
              <div className="flex items-center gap-2.5 text-[10px] font-mono-tabular text-[#64748B]">
                <span>
                  Fcst: <strong className="text-[#131722]">{nextHighImpactEvent.forecast || '—'}</strong>
                </span>
                <span>
                  Prev: <strong className="text-[#131722]">{nextHighImpactEvent.previous || '—'}</strong>
                </span>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-[#FFFFFF] px-2 py-1">
              <Clock className="h-3.5 w-3.5 text-[#B45309]" />
              <div className="text-right">
                <div className="text-[8.5px] font-mono-tabular uppercase text-[#64748B] leading-none">
                  T-Minus
                </div>
                <div className="text-xs sm:text-sm font-extrabold font-mono-tabular text-[#B45309] leading-tight">
                  {formatCountdown(nextHighImpactEvent.timestampMs - nowMs)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="shrink-0 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 py-1.5 text-[11px] text-[#64748B] flex items-center justify-between">
            <span>All high-impact releases for this week completed.</span>
            <span className="font-mono-tabular text-[#089981]">Auto-monitoring</span>
          </div>
        )}

        {/* Compact Vertical Event Cards inside Single Smooth Scroll Viewport */}
        {calendarError && calendarEvents.length === 0 ? (
          <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-xs text-[#64748B] flex items-center justify-between gap-2">
            <span>{calendarError}</span>
            <button
              type="button"
              onClick={() => loadAllFeeds(true, false)}
              className="rounded-lg bg-[#F59E0B] px-3 py-1 text-xs font-bold text-[#131722] cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <div
            className={
              isCalendarFullScreen
                ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-[#E5E7EB] bg-[#FFFFFF] p-2 space-y-1.5'
                : 'space-y-1.5'
            }
          >
            {visibleCalendarEvents.map((ev) => {
              const status = evaluateActualStatus(ev, nowMs);
              const diffMs = ev.timestampMs - nowMs;
              const isSoon = diffMs > 0 && diffMs <= 60 * 60 * 1000;
              const justReleased = ev.timestampMs <= nowMs && nowMs - ev.timestampMs < 15 * 60 * 1000;
              const assetImpacts = getCalendarAssetImpacts(ev, status);

              return (
                <article
                  key={ev.id}
                  className={`w-full rounded-lg border px-2.5 py-1.5 space-y-1 transition-colors ${
                    justReleased
                      ? 'border-[#F59E0B]/50 bg-[#FFFBEB]/60'
                      : 'border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {/* Row 1: IST Time + Countdown + Currency + Impact */}
                  <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono-tabular">
                    <div className="flex items-center gap-1 text-[#475569] min-w-0 truncate">
                      <span className="truncate">{formatEventIstDateTime(ev.timestampMs)}</span>
                      {isSoon && (
                        <span className="font-bold text-[#B45309] shrink-0">
                          ({formatCountdown(diffMs)})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-bold text-[#131722]">
                        {CURRENCY_BADGES[ev.currency] ?? ev.currency}
                      </span>
                      <span
                        className="inline-block rounded px-1 py-0.2 text-[9.5px] font-bold"
                        style={{
                          backgroundColor:
                            ev.impact === 'High'
                              ? 'rgba(242, 54, 69, 0.14)'
                              : ev.impact === 'Medium'
                                ? 'rgba(245, 158, 11, 0.16)'
                                : 'rgba(100, 116, 139, 0.14)',
                          color:
                            ev.impact === 'High'
                              ? '#F23645'
                              : ev.impact === 'Medium'
                                ? '#B45309'
                                : '#64748B',
                        }}
                      >
                        {ev.impact}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Event Title + Inline Metrics */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <h3 className="text-[11.5px] sm:text-xs font-bold text-[#131722] leading-snug break-words">
                      {ev.title}
                    </h3>
                    <div className="flex items-center gap-2.5 text-[10px] font-mono-tabular text-[#475569] shrink-0">
                      <span>
                        Act:{' '}
                        {status === 'beat' ? (
                          <strong className="text-[#089981]">▲ {ev.actual}</strong>
                        ) : status === 'miss' ? (
                          <strong className="text-[#F23645]">▼ {ev.actual}</strong>
                        ) : status === 'inline' ? (
                          <strong className="text-[#131722]">{ev.actual}</strong>
                        ) : status === 'released-pending' ? (
                          <strong className="text-[#B45309]">Sync...</strong>
                        ) : (
                          <span>—</span>
                        )}
                      </span>
                      <span>
                        Fcst: <strong className="text-[#131722]">{ev.forecast || '—'}</strong>
                      </span>
                      <span>
                        Prev: <span>{ev.previous || '—'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Row 3: Compact Asset Impact Pills */}
                  <div className="flex flex-wrap items-center gap-1">
                    {assetImpacts.map((badge) => (
                      <span
                        key={badge.key}
                        className="inline-flex items-center rounded border px-1 py-0.2 text-[9.5px] font-bold font-mono-tabular whitespace-nowrap"
                        style={getBadgeStyle(badge.tone)}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}

            {visibleCalendarEvents.length === 0 && (
              <div className="py-4 text-center text-xs text-[#64748B]">
                Loading live economic events...
              </div>
            )}
          </div>
        )}
      </section>

      {/* Top Macro Sentiment Summary + Search/Refresh */}
      <section className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-2.5 sm:p-4 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-[var(--vp-muted)]">
              <span className="font-bold text-[var(--vp-accent-text)]">LIVE MACRO WIRE</span>
              <span aria-hidden="true">·</span>
              <span>{data?.globalSentiment.label ?? 'Live Macro'}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--vp-text)]">
              {data?.globalSentiment.summary ?? 'Global Gold, Macro & Crypto Headlines'}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-1 sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--vp-muted)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search CPI, Gold, BTC..."
                aria-label="Search market news"
                className="w-full min-h-[40px] rounded-full border border-[var(--vp-border)] bg-[var(--vp-elevated)] pl-9 pr-3 text-xs text-[var(--vp-text)] placeholder:text-[var(--vp-muted)] outline-none focus:border-[#F59E0B] transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={() => loadAllFeeds(true, false)}
              disabled={loading || isSyncing}
              aria-label="Refresh market news and calendar"
              className="vp-pill-btn inline-flex min-h-[40px] items-center gap-1.5 border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3.5 text-xs font-semibold text-[var(--vp-text)] hover:border-[#F59E0B]/60 cursor-pointer shrink-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[var(--vp-accent-text)] ${loading || isSyncing ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Sync Now</span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {TOPICS.map((t) => {
            const active = topic === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopic(t.id)}
                className={`vp-pill-btn min-h-[34px] px-3.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'shadow-[0_0_14px_rgba(245,158,11,0.3)]' : 'hover:text-[var(--vp-text)]'
                }`}
                style={{
                  backgroundColor: active ? '#F59E0B' : 'var(--vp-elevated)',
                  color: active ? '#0B0E14' : 'var(--vp-muted)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Headlines Feed */}
      {loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-32 vp-glass-card rounded-2xl animate-pulse p-4"
            />
          ))}
        </div>
      ) : errorMsg && !data ? (
        <div className="vp-glass-card rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm text-[var(--vp-muted)]">{errorMsg}</p>
          <button
            type="button"
            onClick={() => loadAllFeeds(true, false)}
            className="vp-pill-btn min-h-[42px] bg-[#F59E0B] px-5 text-xs font-bold text-[#0F172A] cursor-pointer"
          >
            Retry News Wire
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="vp-glass-card rounded-2xl p-6 text-center space-y-2">
          <p className="text-sm font-semibold text-[var(--vp-text)]">No headlines match this filter.</p>
          <button
            type="button"
            onClick={() => {
              setTopic('ALL');
              setQuery('');
            }}
            className="vp-pill-btn min-h-[40px] bg-[var(--vp-elevated)] border border-[var(--vp-border)] px-4 text-xs font-semibold text-[var(--vp-accent-text)] cursor-pointer"
          >
            Show All Wire Headlines
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredItems.map((item) => {
            const meta = getSentimentMeta(item.sentiment);
            const SentimentIcon = meta.Icon;
            const hasUrl = isSafeHttpUrl(item.url);
            const assetImpacts = getNewsAssetImpacts(item);

            return (
              <article
                key={item.id}
                className="vp-glass-card rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-[#F59E0B]/55"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular">
                    <div className="flex items-center gap-1.5 min-w-0 whitespace-nowrap text-[var(--vp-muted)]">
                      <span className="font-bold text-[var(--vp-accent-text)] shrink-0">{item.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{item.source}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0 text-[var(--vp-text)] opacity-80">
                        {item.publishedAtMs
                          ? formatEventIstDateTime(item.publishedAtMs)
                          : item.publishedAt}
                      </span>
                    </div>

                    <span
                      className="inline-flex items-center gap-1 font-bold shrink-0 whitespace-nowrap"
                      style={{ color: meta.color }}
                    >
                      <SentimentIcon className="h-3.5 w-3.5" />
                      <span>{meta.label}</span>
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-[15px] font-semibold leading-snug text-[var(--vp-text)]">
                    {item.headline}
                  </h3>

                  {/* Affected Asset & Expected Direction Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {assetImpacts.map((badge) => (
                      <span
                        key={badge.key}
                        className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold font-mono-tabular whitespace-nowrap"
                        style={getBadgeStyle(badge.tone)}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </div>

                {hasUrl && (
                  <div className="flex items-center justify-end pt-1 border-t border-[var(--vp-border)]">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-[var(--vp-accent-text)] hover:underline"
                    >
                      <span>Read Source</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
