import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Clock,
  ExternalLink,
  Flame,
  Minus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
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
  const [data, setData] = useState<NewsWireResponse | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<EconomicCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number>(() => Date.now());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [topic, setTopic] = useState<TickerTopic>('ALL');
  const [query, setQuery] = useState('');
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>('UPCOMING_RECENT');

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
      const res = await fetch(force ? '/api/economic-calendar?refresh=1' : '/api/economic-calendar');
      const json = (await res.json()) as EconomicCalendarResponse;
      if (res.ok && !json.error && Array.isArray(json.events)) {
        setCalendarEvents(json.events);
        setCalendarError(null);
        setLastUpdatedMs(Date.now());
      } else if (!res.ok) {
        setCalendarError(json.error ?? 'Unable to sync live economic calendar.');
      }
    } catch {
      setCalendarError('Network error syncing economic calendar.');
    }
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

      const [newsSettled, calSettled] = await Promise.allSettled([fetch(newsUrl), fetch(calUrl)]);

      let anySucceeded = false;

      if (newsSettled.status === 'fulfilled') {
        try {
          const json = (await newsSettled.value.json()) as NewsWireResponse;
          if (newsSettled.value.ok && !json.error) {
            setData(json);
            setErrorMsg(null);
            anySucceeded = true;
          } else if (!silent) {
            setErrorMsg(json.error ?? 'Unable to load live market headlines.');
          }
        } catch {
          if (!silent) setErrorMsg('Invalid news feed response.');
        }
      } else if (!silent) {
        setErrorMsg('Network error loading live market wire.');
      }

      if (calSettled.status === 'fulfilled') {
        try {
          const calJson = (await calSettled.value.json()) as EconomicCalendarResponse;
          if (calSettled.value.ok && !calJson.error && Array.isArray(calJson.events)) {
            setCalendarEvents(calJson.events);
            setCalendarError(null);
            anySucceeded = true;
          } else if (!silent) {
            setCalendarError(calJson.error ?? 'Unable to load economic calendar.');
          }
        } catch {
          if (!silent) setCalendarError('Invalid calendar feed response.');
        }
      } else if (!silent) {
        setCalendarError('Network error loading economic calendar.');
      }

      if (anySucceeded) {
        const syncedAt = Date.now();
        lastPollAtRef.current = syncedAt;
        setLastUpdatedMs(syncedAt);
      }
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
    <div className="mx-auto max-w-7xl space-y-4 pb-24 md:pb-8">
      {/* Sticky Top Live Mini Price Move Strip (Gold, Silver, BTC, ETH via WebSocket) */}
      <div className="sticky top-[53px] md:top-[61px] z-20 vp-glass-card rounded-2xl px-3 py-2">
        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#089981]/35 bg-[#089981]/10 px-2.5 py-1 text-[10px] font-bold font-mono-tabular text-[var(--vp-bull)] shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-[#089981] animate-pulse" />
            <span>LIVE WS</span>
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
                className="flex items-center gap-2 rounded-full border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-1 text-xs font-mono-tabular whitespace-nowrap shrink-0 transition-colors"
              >
                <span className="font-semibold text-[var(--vp-text)]">
                  {asset.icon} {asset.label}
                </span>
                <span className="font-bold text-[var(--vp-text)]">${formattedPrice}</span>
                <span
                  className="font-bold"
                  style={{ color: isUp ? 'var(--vp-bull)' : 'var(--vp-bear)' }}
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
      <section className="vp-glass-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#089981]/35 bg-[#089981]/10 px-2.5 py-0.5 font-bold tracking-wide text-[var(--vp-bull)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#089981] animate-pulse" />
                <span>LIVE AUTO-SYNC</span>
              </span>
              <span className="text-[var(--vp-muted)]">
                Last Updated:{' '}
                <strong className="text-[var(--vp-text)]">{formatIstTimestamp(lastUpdatedMs)}</strong>
              </span>
              <span className="text-[var(--vp-muted)] hidden sm:inline">
                · {isSyncing ? 'Syncing feeds...' : `Next sync in ${secondsUntilNextSync}s`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-[var(--vp-accent-text)] shrink-0" />
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-[var(--vp-text)]">
                Live Economic Calendar &amp; Macro Release Tracker
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
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
                  className={`vp-pill-btn min-h-[34px] px-3.5 text-xs font-semibold cursor-pointer ${
                    active ? 'shadow-[0_0_14px_rgba(245,158,11,0.3)]' : 'hover:text-[var(--vp-text)]'
                  }`}
                  style={{
                    backgroundColor: active ? '#F59E0B' : 'var(--vp-elevated)',
                    color: active ? '#0B0E14' : 'var(--vp-muted)',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Real-Time 1-Second Countdown Banner to Next High-Impact Event */}
        {nextHighImpactEvent ? (
          <div className="rounded-xl border border-[#F0B90B]/35 bg-[var(--vp-elevated)] px-3.5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular">
                <span className="inline-flex items-center gap-1 rounded bg-[#F6465D]/15 px-1.5 py-0.5 font-bold text-[var(--vp-bear)]">
                  <Flame className="h-3 w-3" />
                  NEXT HIGH-IMPACT
                </span>
                <span className="font-bold text-[var(--vp-text)]">
                  {CURRENCY_BADGES[nextHighImpactEvent.currency] ?? nextHighImpactEvent.currency}
                </span>
                <span className="text-[var(--vp-muted)]">
                  {formatEventIstDateTime(nextHighImpactEvent.timestampMs)} IST
                </span>
              </div>
              <p className="text-sm font-bold text-[var(--vp-text)] truncate">
                {nextHighImpactEvent.title}
              </p>
              <div className="flex items-center gap-3 text-xs font-mono-tabular text-[var(--vp-muted)]">
                <span>
                  Forecast:{' '}
                  <strong className="text-[var(--vp-text)]">
                    {nextHighImpactEvent.forecast || '—'}
                  </strong>
                </span>
                <span>
                  Previous:{' '}
                  <strong className="text-[var(--vp-text)]">
                    {nextHighImpactEvent.previous || '—'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2.5 rounded-xl border border-[var(--vp-border)] bg-[var(--vp-canvas)] px-3.5 py-2 self-start sm:self-center transition-colors">
              <Clock className="h-4 w-4 text-[var(--vp-accent-text)]" />
              <div>
                <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--vp-muted)]">
                  Countdown
                </div>
                <div className="text-base sm:text-lg font-extrabold font-mono-tabular text-[var(--vp-accent-text)] tracking-tight">
                  {formatCountdown(nextHighImpactEvent.timestampMs - nowMs)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3.5 py-2.5 text-xs text-[var(--vp-muted)] flex items-center justify-between">
            <span>All scheduled high-impact releases for this week have completed.</span>
            <span className="font-mono-tabular text-[var(--vp-bull)]">Auto-monitoring next feed</span>
          </div>
        )}

        {/* Economic Calendar Events Table */}
        {calendarError && calendarEvents.length === 0 ? (
          <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-elevated)] p-4 text-xs text-[var(--vp-muted)] flex items-center justify-between gap-3">
            <span>{calendarError}</span>
            <button
              type="button"
              onClick={() => loadAllFeeds(true, false)}
              className="rounded-lg bg-[#F0B90B] px-3 py-1.5 text-xs font-bold text-[#0B0E11] cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--vp-border)] bg-[var(--vp-canvas)] transition-colors">
            <table className="w-full text-left border-collapse min-w-[620px]">
              <thead>
                <tr className="border-b border-[var(--vp-border)] text-[11px] font-mono-tabular uppercase tracking-wider text-[var(--vp-muted)]">
                  <th className="py-2.5 px-3">Time (IST)</th>
                  <th className="py-2.5 px-2">CCY</th>
                  <th className="py-2.5 px-2">Impact</th>
                  <th className="py-2.5 px-3">Economic Event</th>
                  <th className="py-2.5 px-3 text-right">Actual</th>
                  <th className="py-2.5 px-3 text-right">Forecast</th>
                  <th className="py-2.5 px-3 text-right">Previous</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--vp-border)] text-xs">
                {visibleCalendarEvents.map((ev) => {
                  const status = evaluateActualStatus(ev, nowMs);
                  const diffMs = ev.timestampMs - nowMs;
                  const isSoon = diffMs > 0 && diffMs <= 60 * 60 * 1000;
                  const justReleased = ev.timestampMs <= nowMs && nowMs - ev.timestampMs < 15 * 60 * 1000;
                  const assetImpacts = getCalendarAssetImpacts(ev, status);

                  return (
                    <tr
                      key={ev.id}
                      className={`transition-colors ${
                        justReleased ? 'bg-[#F0B90B]/[0.06]' : 'hover:bg-[var(--vp-elevated)]/60'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono-tabular whitespace-nowrap text-[var(--vp-muted)] align-middle">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span>{formatEventIstDateTime(ev.timestampMs)}</span>
                          {isSoon && (
                            <span className="text-[10px] font-bold text-[var(--vp-accent-text)]">
                              ({formatCountdown(diffMs)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 font-mono-tabular font-bold text-[var(--vp-text)] whitespace-nowrap align-top">
                        {CURRENCY_BADGES[ev.currency] ?? ev.currency}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap align-top">
                        <span
                          className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono-tabular"
                          style={{
                            backgroundColor:
                              ev.impact === 'High'
                                ? 'rgba(246, 70, 93, 0.16)'
                                : ev.impact === 'Medium'
                                  ? 'rgba(240, 185, 11, 0.16)'
                                  : 'rgba(132, 142, 156, 0.14)',
                            color:
                              ev.impact === 'High'
                                ? 'var(--vp-bear)'
                                : ev.impact === 'Medium'
                                  ? 'var(--vp-accent-text)'
                                  : 'var(--vp-muted)',
                          }}
                        >
                          {ev.impact}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <div className="font-semibold text-[var(--vp-text)]">{ev.title}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {assetImpacts.map((badge) => (
                            <span
                              key={badge.key}
                              className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold font-mono-tabular whitespace-nowrap"
                              style={getBadgeStyle(badge.tone)}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular whitespace-nowrap align-top">
                        {status === 'beat' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-[#00C087]/40 bg-[#00C087]/15 px-2 py-0.5 font-extrabold text-[var(--vp-bull)]">
                            ▲ {ev.actual}
                          </span>
                        ) : status === 'miss' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-[#F6465D]/40 bg-[#F6465D]/15 px-2 py-0.5 font-extrabold text-[var(--vp-bear)]">
                            ▼ {ev.actual}
                          </span>
                        ) : status === 'inline' ? (
                          <span className="inline-flex items-center rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2 py-0.5 font-bold text-[var(--vp-text)]">
                            {ev.actual}
                          </span>
                        ) : status === 'released-pending' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-[#F0B90B]/35 bg-[#F0B90B]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--vp-accent-text)]">
                            <span className="animate-pulse">●</span> Fetching Actual...
                          </span>
                        ) : (
                          <span className="text-[var(--vp-muted)]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-[var(--vp-text)] opacity-85 align-top">
                        {ev.forecast || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-[var(--vp-muted)] align-top">
                        {ev.previous || '—'}
                      </td>
                    </tr>
                  );
                })}
                {visibleCalendarEvents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-xs text-[var(--vp-muted)]">
                      Loading live economic events...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top Macro Sentiment Summary + Search/Refresh */}
      <section className="vp-glass-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-[var(--vp-muted)]">
              <span className="font-bold text-[var(--vp-accent-text)]">LIVE MACRO WIRE</span>
              <span aria-hidden="true">·</span>
              <span>{data?.globalSentiment.label ?? 'Scanning Wire'}</span>
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
            className="vp-pill-btn min-h-[42px] bg-[#F59E0B] px-5 text-xs font-bold text-[#0B0E14] cursor-pointer"
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
