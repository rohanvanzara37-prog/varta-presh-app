import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CandlestickChart,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Maximize2,
  MessageSquare,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Send,
  TrendingUp,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { FONT_OPTIONS } from '../data/newsData';
import type { FontOptionId, ThemeMode, TypographySettings } from '../types/news';
import {
  fetchBinanceKlines,
  fetchRealBtcPrice,
  fetchRealXauGoldPrice,
  type LiveCandleBar,
} from '../utils/marketFeeds';
import {
  calculateBollingerBands,
  calculateEMA,
  calculateVWAP,
  computeSmartChartSummary,
} from '../utils/technicalIndicators';
import { MarketTradeSuggestionCard } from './MarketTradeSuggestionCard';

interface TradingViewChartPanelProps {
  themeMode: ThemeMode;
  typography: TypographySettings;
  initialSymbol?: string;
}

interface SymbolPreset {
  symbol: string;
  shortLabel: string;
  label: string;
  category: string;
  basePrice: number;
}

interface CopyTradeSignal {
  id: string;
  traderName: string;
  deskTag: string;
  pair: 'XAU/USD' | 'BTC/USD';
  tvSymbol: string;
  side: 'BUY' | 'SELL';
  timeframe: '1m' | '5m';
  entry: number;
  takeProfit: number;
  stopLoss: number;
  winRatePct: number;
  followers: number;
  riskReward: string;
  note: string;
  postedAgo: string;
}

interface LiveTradeChatMessage {
  id: string;
  sender: string;
  handle: string;
  pair: 'XAU/USD' | 'BTC/USD';
  text: string;
  timestamp: string;
  isOwn?: boolean;
  setup?: {
    side: 'BUY' | 'SELL';
    entry: number;
    tp: number;
    sl: number;
  };
}

const SYMBOL_PRESETS: SymbolPreset[] = [
  { symbol: 'OANDA:XAUUSD', shortLabel: 'XAU/USD', label: 'XAU/USD · Gold Spot', category: 'Metals', basePrice: 2664.8 },
  { symbol: 'OANDA:XAGUSD', shortLabel: 'XAG/USD', label: 'XAG/USD · Silver Spot', category: 'Metals', basePrice: 31.42 },
  { symbol: 'BITSTAMP:BTCUSD', shortLabel: 'BTC/USD', label: 'BTC/USD · Bitcoin', category: 'Crypto', basePrice: 91850 },
  { symbol: 'BINANCE:ETHUSDT', shortLabel: 'ETH/USDT', label: 'ETH/USDT · Ethereum', category: 'Crypto', basePrice: 3145.5 },
  { symbol: 'BINANCE:SOLUSDT', shortLabel: 'SOL/USDT', label: 'SOL/USDT · Solana', category: 'Crypto', basePrice: 218.4 },
  { symbol: 'BINANCE:BNBUSDT', shortLabel: 'BNB/USDT', label: 'BNB/USDT · BNB', category: 'Crypto', basePrice: 624.8 },
];

const INTERVALS = [
  { id: '1', label: '1m' },
  { id: '5', label: '5m' },
  { id: '15', label: '15m' },
  { id: '60', label: '1H' },
  { id: '240', label: '4H' },
  { id: 'D', label: '1D' },
  { id: 'W', label: '1W' },
];

const PANEL_SMART_STUDIES = [
  { id: 'STD;EMA', label: 'EMA (9/21)' },
  { id: 'STD;RSI', label: 'RSI (14)' },
  { id: 'STD;MACD', label: 'MACD' },
  { id: 'STD;Bollinger_Bands', label: 'Bollinger' },
  { id: 'STD;VWAP', label: 'VWAP' },
  { id: 'STD;Stochastic_RSI', label: 'Stoch RSI' },
];

const COPIED_TRADES_KEY = 'vp_copied_trades_v1';
const TRADING_CHAT_KEY = 'vp_trading_live_chat_v1';

function buildInitialSignals(xauPrice: number, btcPrice: number): CopyTradeSignal[] {
  const xauRound = (v: number) => Number(v.toFixed(2));
  const btcRound = (v: number) => Math.round(v);

  return [
    {
      id: 'sig-xau-1m-long',
      traderName: 'Aarav Bullion Desk',
      deskTag: 'XAU 1m Scalp',
      pair: 'XAU/USD',
      tvSymbol: 'OANDA:XAUUSD',
      side: 'BUY',
      timeframe: '1m',
      entry: xauRound(xauPrice - 1.2),
      takeProfit: xauRound(xauPrice + 6.4),
      stopLoss: xauRound(xauPrice - 4.1),
      winRatePct: 78.4,
      followers: 1420,
      riskReward: '1 : 2.6',
      note: '1m EMA-9 reclaim above VWAP with London liquidity sweep.',
      postedAgo: '1m ago',
    },
    {
      id: 'sig-btc-1m-long',
      traderName: 'Kiran Crypto Flow',
      deskTag: 'BTC 1m Momentum',
      pair: 'BTC/USD',
      tvSymbol: 'BITSTAMP:BTCUSD',
      side: 'BUY',
      timeframe: '1m',
      entry: btcRound(btcPrice - 45),
      takeProfit: btcRound(btcPrice + 410),
      stopLoss: btcRound(btcPrice - 195),
      winRatePct: 74.1,
      followers: 2180,
      riskReward: '1 : 3.0',
      note: 'Higher-low compression on 1m chart with spot bid imbalance.',
      postedAgo: '2m ago',
    },
    {
      id: 'sig-xau-1m-fade',
      traderName: 'London Macro Vault',
      deskTag: 'Gold Intraday',
      pair: 'XAU/USD',
      tvSymbol: 'OANDA:XAUUSD',
      side: 'SELL',
      timeframe: '5m',
      entry: xauRound(xauPrice + 4.8),
      takeProfit: xauRound(xauPrice - 3.5),
      stopLoss: xauRound(xauPrice + 8.2),
      winRatePct: 71.9,
      followers: 930,
      riskReward: '1 : 2.4',
      note: 'Supply zone rejection near intraday resistance.',
      postedAgo: '6m ago',
    },
    {
      id: 'sig-btc-1m-pullback',
      traderName: 'Vertex Quant BTC',
      deskTag: 'BTC Orderbook',
      pair: 'BTC/USD',
      tvSymbol: 'BITSTAMP:BTCUSD',
      side: 'SELL',
      timeframe: '1m',
      entry: btcRound(btcPrice + 220),
      takeProfit: btcRound(btcPrice - 280),
      stopLoss: btcRound(btcPrice + 410),
      winRatePct: 69.5,
      followers: 1105,
      riskReward: '1 : 2.6',
      note: '1m upper wick sweep into resting ask wall.',
      postedAgo: '9m ago',
    },
  ];
}

function buildInitialChat(xauPrice: number, btcPrice: number): LiveTradeChatMessage[] {
  return [
    {
      id: 'chat-xau-1',
      sender: 'Aarav Bullion Desk',
      handle: '@goldscalp',
      pair: 'XAU/USD',
      text: `XAU/USD holding clean support near $${(xauPrice - 1.5).toFixed(2)} on the 1m chart. Watching breakout volume above $${(xauPrice + 2).toFixed(2)}.`,
      timestamp: 'Just now',
      setup: {
        side: 'BUY',
        entry: Number((xauPrice - 1.2).toFixed(2)),
        tp: Number((xauPrice + 6.4).toFixed(2)),
        sl: Number((xauPrice - 4.1).toFixed(2)),
      },
    },
    {
      id: 'chat-btc-1',
      sender: 'Kiran Crypto Flow',
      handle: '@btclive1m',
      pair: 'BTC/USD',
      text: `BTC/USD 1m candle closing strong around $${Math.round(btcPrice).toLocaleString()}. Copy desk keeping trailing stop tight.`,
      timestamp: '2m ago',
      setup: {
        side: 'BUY',
        entry: Math.round(btcPrice - 45),
        tp: Math.round(btcPrice + 410),
        sl: Math.round(btcPrice - 195),
      },
    },
    {
      id: 'chat-xau-2',
      sender: 'Neha Bullion',
      handle: '@nehabullion',
      pair: 'XAU/USD',
      text: 'Copied the XAU 1m scalp — spot momentum holding strong above EMA-9.',
      timestamp: '4m ago',
    },
  ];
}

export const TradingViewChartPanel: React.FC<TradingViewChartPanelProps> = ({
  themeMode,
  typography,
  initialSymbol = 'OANDA:XAUUSD',
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [customSymbolInput, setCustomSymbolInput] = useState('');
  const [interval, setInterval] = useState('1'); // Default to 1m live chart
  const [activeStudies, setActiveStudies] = useState<string[]>([
    'STD;EMA',
    'STD;RSI',
    'STD;VWAP',
  ]);
  const [renderMode, setRenderMode] = useState<'tradingview' | 'native'>('tradingview');
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [widgetFailed, setWidgetFailed] = useState(false);
  const [isChartFullScreen, setIsChartFullScreen] = useState(false);
  const [visibleCandleCount, setVisibleCandleCount] = useState<number>(38);

  // Live XAU/USD and BTC/USD price feeds
  const [xauLive, setXauLive] = useState<{
    price: number;
    prevPrice: number;
    source: 'live' | 'snapshot';
    provider: string;
    updatedAt: string;
  }>({
    price: 2664.8,
    prevPrice: 2661.4,
    source: 'snapshot',
    provider: 'Spot Snapshot',
    updatedAt: 'Now',
  });

  const [btcLive, setBtcLive] = useState<{
    price: number;
    prevPrice: number;
    source: 'live' | 'snapshot';
    provider: string;
    updatedAt: string;
  }>({
    price: 91850,
    prevPrice: 91620,
    source: 'snapshot',
    provider: 'BTC Snapshot',
    updatedAt: 'Now',
  });

  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [liveBtcCandles, setLiveBtcCandles] = useState<LiveCandleBar[] | null>(null);

  // Copy Trading & Live Chat State
  const [deskTab, setDeskTab] = useState<'copy' | 'chat'>('copy');
  const [pairFilter, setPairFilter] = useState<'ALL' | 'XAU/USD' | 'BTC/USD'>('ALL');
  const [copyAllocationUsd, setCopyAllocationUsd] = useState<number>(250);
  const [copiedIds, setCopiedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(COPIED_TRADES_KEY);
      return saved ? (JSON.parse(saved) as string[]) : ['sig-xau-1m-long'];
    } catch {
      return ['sig-xau-1m-long'];
    }
  });

  const [chatMessages, setChatMessages] = useState<LiveTradeChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(TRADING_CHAT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as LiveTradeChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback below
    }
    return buildInitialChat(2664.8, 91850);
  });

  const [chatRoomPair, setChatRoomPair] = useState<'ALL' | 'XAU/USD' | 'BTC/USD'>('ALL');
  const [composePair, setComposePair] = useState<'XAU/USD' | 'BTC/USD'>('XAU/USD');
  const [chatDraft, setChatDraft] = useState('');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartSectionRef = useRef<HTMLElement | null>(null);
  const enteredNativeFsRef = useRef(false);

  const toggleFullScreen = useCallback(() => {
    setIsChartFullScreen((prev) => {
      const next = !prev;
      if (next) {
        const el = chartSectionRef.current;
        if (el?.requestFullscreen) {
          el.requestFullscreen()
            .then(() => {
              enteredNativeFsRef.current = true;
            })
            .catch(() => {
              enteredNativeFsRef.current = false;
            });
        }
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
        enteredNativeFsRef.current = false;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isChartFullScreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
        enteredNativeFsRef.current = false;
        setIsChartFullScreen(false);
      }
    };

    const handleFsChange = () => {
      if (enteredNativeFsRef.current && !document.fullscreenElement) {
        enteredNativeFsRef.current = false;
        setIsChartFullScreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [isChartFullScreen]);

  const getFontFamily = (id: FontOptionId) =>
    FONT_OPTIONS.find((f) => f.id === id)?.cssFamily ?? FONT_OPTIONS[0].cssFamily;

  const refreshLiveFeeds = useCallback(async () => {
    setIsRefreshingPrices(true);
    const klineTargetSymbol =
      symbol === 'BITSTAMP:BTCUSD'
        ? 'BINANCE:BTCUSDT'
        : symbol.startsWith('BINANCE:')
          ? symbol
          : 'BINANCE:BTCUSDT';

    const [xauRes, btcRes, btcCandlesRes] = await Promise.all([
      fetchRealXauGoldPrice(),
      fetchRealBtcPrice(),
      fetchBinanceKlines(klineTargetSymbol, interval, 60),
    ]);

    setXauLive((prev) => ({
      price: xauRes.priceUsd,
      prevPrice: prev.price !== xauRes.priceUsd ? prev.price : prev.prevPrice,
      source: xauRes.source,
      provider: xauRes.provider,
      updatedAt: xauRes.updatedAt,
    }));

    setBtcLive((prev) => ({
      price: btcRes.priceUsd,
      prevPrice: prev.price !== btcRes.priceUsd ? prev.price : prev.prevPrice,
      source: btcRes.source,
      provider: btcRes.provider,
      updatedAt: btcRes.updatedAt,
    }));

    if (btcCandlesRes && btcCandlesRes.length >= 15) {
      setLiveBtcCandles(btcCandlesRes);
    } else {
      setLiveBtcCandles(null);
    }

    setIsRefreshingPrices(false);
  }, [symbol, interval]);

  useEffect(() => {
    refreshLiveFeeds();
    const timer = window.setInterval(refreshLiveFeeds, 15000);
    return () => window.clearInterval(timer);
  }, [refreshLiveFeeds]);

  // Persist copied trades and live chat messages
  useEffect(() => {
    try {
      localStorage.setItem(COPIED_TRADES_KEY, JSON.stringify(copiedIds));
    } catch {
      // Ignore storage quota issues
    }
  }, [copiedIds]);

  useEffect(() => {
    try {
      localStorage.setItem(TRADING_CHAT_KEY, JSON.stringify(chatMessages.slice(-40)));
    } catch {
      // Ignore storage quota issues
    }
  }, [chatMessages]);

  const activeStudiesKey = activeStudies.join('|');

  // Mount official TradingView Advanced Chart embed widget
  useEffect(() => {
    if (renderMode !== 'tradingview') return;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';
    setWidgetLoaded(false);
    setWidgetFailed(false);

    const widgetSlot = document.createElement('div');
    widgetSlot.className = 'tradingview-widget-container__widget';
    widgetSlot.style.height = '100%';
    widgetSlot.style.width = '100%';
    container.appendChild(widgetSlot);

    const script = document.createElement('script');
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Etc/UTC',
      theme: themeMode,
      style: '1',
      locale: 'en',
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      calendar: false,
      studies: activeStudies,
      support_host: 'https://www.tradingview.com',
    });

    script.onload = () => setWidgetLoaded(true);
    script.onerror = () => setWidgetFailed(true);

    container.appendChild(script);

    const fallbackTimer = setTimeout(() => {
      if (!container.querySelector('iframe')) {
        setWidgetFailed(true);
      } else {
        setWidgetLoaded(true);
      }
    }, 5500);

    return () => {
      clearTimeout(fallbackTimer);
      container.innerHTML = '';
    };
  }, [symbol, interval, themeMode, renderMode, activeStudiesKey]);

  // Native Candlestick Chart data (uses real Binance klines for BTC/ETH/SOL/BNB when live, or live-anchored candles)
  const nativeCandles = useMemo<LiveCandleBar[]>(() => {
    if ((symbol === 'BITSTAMP:BTCUSD' || symbol.startsWith('BINANCE:')) && liveBtcCandles) {
      return liveBtcCandles;
    }

    const preset = SYMBOL_PRESETS.find((p) => p.symbol === symbol);
    const liveBase =
      symbol === 'OANDA:XAUUSD'
        ? xauLive.price
        : symbol === 'BITSTAMP:BTCUSD'
          ? btcLive.price
          : preset?.basePrice ?? 100;

    const seed =
      symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0) +
      interval.charCodeAt(0);
    const count = 38;
    const now = Date.now();
    const stepMs =
      interval === '1'
        ? 60_000
        : interval === '5'
          ? 300_000
          : interval === '15'
            ? 900_000
            : interval === '60'
              ? 3_600_000
              : 86_400_000;

    const candles: LiveCandleBar[] = [];
    let prevClose = liveBase * 0.9965;
    for (let i = 0; i < count; i += 1) {
      const wave =
        Math.sin((i + seed) * 0.62) * liveBase * 0.0014 +
        Math.cos((i * 2 + seed) * 0.34) * liveBase * 0.0009;
      const open = prevClose;
      const close = i === count - 1 ? liveBase : open + wave;
      const high = Math.max(open, close) + Math.abs(wave) * 0.65 + liveBase * 0.0003;
      const low = Math.min(open, close) - Math.abs(wave) * 0.65 - liveBase * 0.0003;
      const vol = 32 + ((i * 19 + seed) % 68);
      const t = new Date(now - (count - 1 - i) * stepMs);
      candles.push({
        timeLabel: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        open,
        high,
        low,
        close,
        vol,
      });
      prevClose = close;
    }
    return candles;
  }, [symbol, interval, liveBtcCandles, xauLive.price, btcLive.price]);

  const ema9Series = useMemo(
    () => calculateEMA(nativeCandles.map((c) => c.close), 9),
    [nativeCandles]
  );

  const bollingerSeries = useMemo(
    () => calculateBollingerBands(nativeCandles.map((c) => c.close), 20, 2),
    [nativeCandles]
  );

  const vwapSeries = useMemo(() => calculateVWAP(nativeCandles), [nativeCandles]);

  const smartSummary = useMemo(
    () => computeSmartChartSummary(nativeCandles),
    [nativeCandles]
  );

  const toggleStudy = (studyId: string) => {
    setActiveStudies((prev) =>
      prev.includes(studyId) ? prev.filter((id) => id !== studyId) : [...prev, studyId]
    );
  };

  const copySignals = useMemo(
    () => buildInitialSignals(xauLive.price, btcLive.price),
    [xauLive.price, btcLive.price]
  );

  const filteredSignals = useMemo(() => {
    if (pairFilter === 'ALL') return copySignals;
    return copySignals.filter((s) => s.pair === pairFilter);
  }, [copySignals, pairFilter]);

  const filteredChatMessages = useMemo(() => {
    if (chatRoomPair === 'ALL') return chatMessages;
    return chatMessages.filter((m) => m.pair === chatRoomPair);
  }, [chatMessages, chatRoomPair]);

  const toggleCopyTrade = (sig: CopyTradeSignal) => {
    setCopiedIds((prev) =>
      prev.includes(sig.id) ? prev.filter((id) => id !== sig.id) : [...prev, sig.id]
    );
  };

  const handleLoadSignalOnChart = (sig: CopyTradeSignal) => {
    setSymbol(sig.tvSymbol);
    setInterval('1');
  };

  const handlePostSignalToChat = (sig: CopyTradeSignal) => {
    const newMsg: LiveTradeChatMessage = {
      id: `chat-copy-${Date.now()}`,
      sender: 'You (Copy Desk)',
      handle: '@you',
      pair: sig.pair,
      text: `Copied ${sig.traderName}'s ${sig.side} setup on ${sig.pair} (${sig.timeframe}) with $${copyAllocationUsd} allocation.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isOwn: true,
      setup: {
        side: sig.side,
        entry: sig.entry,
        tp: sig.takeProfit,
        sl: sig.stopLoss,
      },
    };
    setChatMessages((prev) => [...prev, newMsg]);
    setDeskTab('chat');
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatDraft.trim();
    if (!trimmed) return;
    const newMsg: LiveTradeChatMessage = {
      id: `chat-user-${Date.now()}`,
      sender: 'You',
      handle: '@trader',
      pair: composePair,
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isOwn: true,
    };
    setChatMessages((prev) => [...prev, newMsg]);
    setChatDraft('');
  };

  const handleApplyCustomSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customSymbolInput.trim().toUpperCase();
    if (!cleaned) return;
    setSymbol(cleaned);
    setCustomSymbolInput('');
  };

  const activePreset = SYMBOL_PRESETS.find((p) => p.symbol === symbol);

  const getBubbleRadiusClass = () => {
    if (typography.messageBubbleStyle === 'editorial') return 'rounded-lg';
    if (typography.messageBubbleStyle === 'compact') return 'rounded-xl';
    return 'rounded-2xl';
  };

  const xauDelta = xauLive.price - xauLive.prevPrice;
  const btcDelta = btcLive.price - btcLive.prevPrice;

  return (
    <div className="space-y-5">
      {/* Live 1m Spot Pair Switcher: XAU/USD Gold & BTC/USD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => {
            setSymbol('OANDA:XAUUSD');
            setInterval('1');
            setComposePair('XAU/USD');
          }}
          className="text-left rounded-2xl border p-4 transition-all cursor-pointer"
          style={{
            backgroundColor:
              symbol === 'OANDA:XAUUSD' ? 'var(--vp-surface)' : 'var(--vp-elevated)',
            borderColor:
              symbol === 'OANDA:XAUUSD' ? 'var(--vp-primary)' : 'var(--vp-border)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--vp-muted)' }}>
              XAU/USD · GOLD SPOT 1m LIVE
            </span>
            <span
              className="rounded-lg px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor:
                  symbol === 'OANDA:XAUUSD' ? 'var(--vp-primary)' : 'var(--vp-surface)',
                color:
                  symbol === 'OANDA:XAUUSD' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
              }}
            >
              {symbol === 'OANDA:XAUUSD' ? '1m Chart Active' : 'Open 1m Chart'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="font-mono-tabular text-2xl sm:text-3xl font-bold">
              ${xauLive.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span
              className="inline-flex items-center gap-1 text-xs font-mono-tabular font-semibold"
              style={{ color: xauDelta >= 0 ? '#10b981' : '#ef4444' }}
            >
              {xauDelta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {xauDelta >= 0 ? '+' : ''}
              {xauDelta.toFixed(2)} ({xauLive.source === 'live' ? xauLive.provider : 'Snapshot'})
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setSymbol('BITSTAMP:BTCUSD');
            setInterval('1');
            setComposePair('BTC/USD');
          }}
          className="text-left rounded-2xl border p-4 transition-all cursor-pointer"
          style={{
            backgroundColor:
              symbol === 'BITSTAMP:BTCUSD' ? 'var(--vp-surface)' : 'var(--vp-elevated)',
            borderColor:
              symbol === 'BITSTAMP:BTCUSD' ? 'var(--vp-primary)' : 'var(--vp-border)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--vp-muted)' }}>
              BTC/USD · BITCOIN 1m LIVE
            </span>
            <span
              className="rounded-lg px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor:
                  symbol === 'BITSTAMP:BTCUSD' ? 'var(--vp-primary)' : 'var(--vp-surface)',
                color:
                  symbol === 'BITSTAMP:BTCUSD' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
              }}
            >
              {symbol === 'BITSTAMP:BTCUSD' ? '1m Chart Active' : 'Open 1m Chart'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="font-mono-tabular text-2xl sm:text-3xl font-bold">
              ${btcLive.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span
              className="inline-flex items-center gap-1 text-xs font-mono-tabular font-semibold"
              style={{ color: btcDelta >= 0 ? '#10b981' : '#ef4444' }}
            >
              {btcDelta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {btcDelta >= 0 ? '+' : ''}
              {btcDelta.toFixed(2)} ({btcLive.source === 'live' ? btcLive.provider : 'Snapshot'})
            </span>
          </div>
        </button>
      </div>

      {/* Main Split: Live 1m TradingView Chart (7 cols) + Copy Trading & Live Chat Desk (5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Chart Workspace */}
        <section
          ref={chartSectionRef}
          className={
            isChartFullScreen
              ? 'fixed inset-0 z-[90] flex flex-col gap-3 p-3 sm:p-5 overflow-hidden'
              : 'xl:col-span-7 rounded-2xl border p-4 sm:p-5 space-y-4'
          }
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--vp-muted)' }}>
                <CandlestickChart className="h-4 w-4" style={{ color: 'var(--vp-primary)' }} />
                <span>
                  Live {INTERVALS.find((i) => i.id === interval)?.label ?? interval} Candlestick Chart
                </span>
              </div>
              <h2
                className="text-lg sm:text-xl font-bold mt-1"
                style={{ fontFamily: getFontFamily(typography.headlineFont) }}
              >
                {activePreset ? activePreset.label : symbol}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={refreshLiveFeeds}
                disabled={isRefreshingPrices}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingPrices ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>

              <div
                className="flex items-center gap-1 rounded-xl p-1"
                style={{ backgroundColor: 'var(--vp-elevated)' }}
              >
                <button
                  type="button"
                  onClick={() => setRenderMode('tradingview')}
                  className="min-h-[34px] rounded-lg px-2.5 text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor:
                      renderMode === 'tradingview' ? 'var(--vp-primary)' : 'transparent',
                    color:
                      renderMode === 'tradingview' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                  }}
                >
                  TradingView
                </button>
                <button
                  type="button"
                  onClick={() => setRenderMode('native')}
                  className="min-h-[34px] rounded-lg px-2.5 text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor:
                      renderMode === 'native' ? 'var(--vp-primary)' : 'transparent',
                    color:
                      renderMode === 'native' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                  }}
                >
                  1m Candles
                </button>
              </div>

              <button
                type="button"
                onClick={toggleFullScreen}
                aria-label={isChartFullScreen ? 'Exit full screen chart' : 'Zoom chart full screen'}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold cursor-pointer transition-colors"
                style={{
                  backgroundColor: isChartFullScreen ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                  color: isChartFullScreen ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                  borderColor: isChartFullScreen ? 'var(--vp-primary)' : 'var(--vp-border)',
                }}
              >
                {isChartFullScreen ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>Exit (Esc)</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Full Screen</span>
                  </>
                )}
              </button>

              <a
                href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open on TradingView"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Symbol Quick Picks + Interval + Custom Symbol */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {SYMBOL_PRESETS.map((item) => {
                const active = symbol === item.symbol;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => setSymbol(item.symbol)}
                    className="min-h-[36px] rounded-xl border px-2.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                      color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                      borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                    }}
                  >
                    {item.shortLabel}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex items-center gap-0.5 rounded-xl p-1"
                style={{ backgroundColor: 'var(--vp-elevated)' }}
              >
                {INTERVALS.map((iv) => (
                  <button
                    key={iv.id}
                    type="button"
                    onClick={() => setInterval(iv.id)}
                    className="min-h-[32px] rounded-lg px-2 text-xs font-mono-tabular font-semibold cursor-pointer"
                    style={{
                      backgroundColor: interval === iv.id ? 'var(--vp-primary)' : 'transparent',
                      color: interval === iv.id ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                    }}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleApplyCustomSymbol} className="flex items-center gap-1">
                <input
                  type="text"
                  value={customSymbolInput}
                  onChange={(e) => setCustomSymbolInput(e.target.value)}
                  placeholder="e.g. ETHUSD"
                  aria-label="Enter TradingView symbol"
                  className="w-28 min-h-[36px] rounded-xl border px-2.5 text-xs font-mono-tabular outline-none"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                    color: 'var(--vp-text)',
                  }}
                />
                <button
                  type="submit"
                  className="min-h-[36px] rounded-xl px-2.5 text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--vp-secondary)',
                    color: 'var(--vp-secondary-fg)',
                  }}
                >
                  Load
                </button>
              </form>
            </div>
          </div>

          {/* Smart Chart Indicators Bar + Live Confluence Badge */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5"
            style={{
              backgroundColor: 'var(--vp-elevated)',
              borderColor: 'var(--vp-border)',
            }}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold mr-1"
                style={{ color: 'var(--vp-muted)' }}
              >
                <Activity className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
                Smart Indicators:
              </span>
              {PANEL_SMART_STUDIES.map((st) => {
                const enabled = activeStudies.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => toggleStudy(st.id)}
                    className="min-h-[28px] rounded-lg border px-2 text-[11px] font-semibold cursor-pointer"
                    style={{
                      backgroundColor: enabled ? 'var(--vp-primary)' : 'var(--vp-surface)',
                      color: enabled ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                      borderColor: enabled ? 'var(--vp-primary)' : 'var(--vp-border)',
                    }}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>

            {smartSummary && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular">
                <span
                  className="rounded-md px-2 py-0.5 font-bold"
                  style={{
                    backgroundColor: smartSummary.rating.includes('Buy')
                      ? 'rgba(16, 185, 129, 0.16)'
                      : smartSummary.rating.includes('Sell')
                        ? 'rgba(239, 68, 68, 0.16)'
                        : 'rgba(245, 158, 11, 0.16)',
                    color: smartSummary.rating.includes('Buy')
                      ? '#10b981'
                      : smartSummary.rating.includes('Sell')
                        ? '#ef4444'
                        : '#f59e0b',
                  }}
                >
                  {smartSummary.rating}
                </span>
                <span style={{ color: 'var(--vp-muted)' }}>
                  RSI {smartSummary.rsi14.toFixed(1)} · MACD {smartSummary.macdHist >= 0 ? '+' : ''}
                  {smartSummary.macdHist.toFixed(2)} · S1 ${smartSummary.supportS1.toLocaleString()} · R1 $
                  {smartSummary.resistanceR1.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Chart Viewport */}
          {renderMode === 'tradingview' && !widgetFailed ? (
            <div
              className={`relative w-full rounded-xl overflow-hidden border ${
                isChartFullScreen ? 'flex-1 min-h-0' : 'h-[540px] sm:h-[640px]'
              }`}
              style={{
                borderColor: 'var(--vp-border)',
                backgroundColor: 'var(--vp-elevated)',
              }}
            >
              {!widgetLoaded && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs z-10 pointer-events-none"
                  style={{ color: 'var(--vp-muted)' }}
                >
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  <span>Loading TradingView {INTERVALS.find((i) => i.id === interval)?.label} ({symbol})...</span>
                </div>
              )}
              <div ref={containerRef} className="h-full w-full" />
            </div>
          ) : (
            <div
              className={`rounded-xl border p-4 flex flex-col gap-3 ${isChartFullScreen ? 'flex-1 min-h-0' : ''}`}
              style={{
                borderColor: 'var(--vp-border)',
                backgroundColor: 'var(--vp-elevated)',
              }}
              onWheel={(e) => {
                if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
                  setVisibleCandleCount((prev) =>
                    e.deltaY < 0
                      ? Math.max(12, prev - 4)
                      : Math.min(nativeCandles.length || 38, prev + 4)
                  );
                }
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Layers className="h-4 w-4" style={{ color: 'var(--vp-primary)' }} />
                  <span>
                    {widgetFailed
                      ? `TradingView iframe blocked in sandbox — live ${INTERVALS.find((i) => i.id === interval)?.label} Smart Candlestick Engine`
                      : `Live ${INTERVALS.find((i) => i.id === interval)?.label} Smart Candlestick Engine`}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-1 rounded-lg border p-0.5"
                    style={{ backgroundColor: 'var(--vp-surface)', borderColor: 'var(--vp-border)' }}
                  >
                    <button
                      type="button"
                      onClick={() => setVisibleCandleCount((c) => Math.max(12, c - 6))}
                      aria-label="Zoom in candles"
                      className="p-1 rounded cursor-pointer"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCandleCount((c) => Math.min(nativeCandles.length || 38, c + 6))
                      }
                      aria-label="Zoom out candles"
                      className="p-1 rounded cursor-pointer"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleCandleCount(nativeCandles.length || 38)}
                      aria-label="Reset candle zoom"
                      className="p-1 rounded cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {widgetFailed && (
                    <button
                      type="button"
                      onClick={() => {
                        setWidgetFailed(false);
                        setRenderMode('tradingview');
                      }}
                      className="underline font-semibold cursor-pointer"
                      style={{ color: 'var(--vp-primary)' }}
                    >
                      Retry TradingView
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                const startIdx = Math.max(0, nativeCandles.length - visibleCandleCount);
                const zoomedCandles = nativeCandles.slice(startIdx);
                const zoomedEma9 = ema9Series.slice(startIdx);
                const zoomedBbUpper = bollingerSeries.upper.slice(startIdx);
                const zoomedBbLower = bollingerSeries.lower.slice(startIdx);
                const zoomedVwap = vwapSeries.slice(startIdx);

                const w = 720;
                const h = 340;
                const showEMA = activeStudies.includes('STD;EMA');
                const showBB = activeStudies.includes('STD;Bollinger_Bands');
                const showVWAP = activeStudies.includes('STD;VWAP');
                const highs = [
                  ...zoomedCandles.map((c) => c.high),
                  ...(showBB
                    ? zoomedBbUpper.filter((v): v is number => v !== null)
                    : []),
                ];
                const lows = [
                  ...zoomedCandles.map((c) => c.low),
                  ...(showBB
                    ? zoomedBbLower.filter((v): v is number => v !== null)
                    : []),
                ];
                const maxP = Math.max(...highs);
                const minP = Math.min(...lows);
                const span = maxP - minP || 1;
                const toY = (p: number) => 22 + (1 - (p - minP) / span) * (h - 92);
                const step = (w - 32) / zoomedCandles.length;
                const latestBar = zoomedCandles[zoomedCandles.length - 1];
                const latestY = toY(latestBar.close);

                const buildLinePath = (series: (number | null)[]) =>
                  series
                    .map((val, idx) => {
                      if (val === null) return '';
                      const x = 16 + idx * step + step * 0.5;
                      return `${idx === 0 || series[idx - 1] === null ? 'M' : 'L'} ${x.toFixed(1)} ${toY(val).toFixed(1)}`;
                    })
                    .filter(Boolean)
                    .join(' ');

                const emaPath = showEMA ? buildLinePath(zoomedEma9) : '';
                const bbUpperPath = showBB ? buildLinePath(zoomedBbUpper) : '';
                const bbLowerPath = showBB ? buildLinePath(zoomedBbLower) : '';
                const vwapPath = showVWAP ? buildLinePath(zoomedVwap) : '';

                return (
                  <>
                    <svg
                      viewBox={`0 0 ${w} ${h}`}
                      className={`w-full ${isChartFullScreen ? 'flex-1 min-h-0' : 'h-[420px] sm:h-[500px]'}`}
                    >
                      {[0.2, 0.45, 0.7].map((r) => (
                        <line
                          key={r}
                          x1={16}
                          x2={w - 16}
                          y1={h * r}
                          y2={h * r}
                          stroke="var(--vp-border)"
                          strokeDasharray="4 4"
                        />
                      ))}

                      {/* Live Price Reference Line */}
                      <line
                        x1={16}
                        x2={w - 16}
                        y1={latestY}
                        y2={latestY}
                        stroke="var(--vp-primary)"
                        strokeWidth="1.2"
                        strokeDasharray="3 3"
                      />

                      {bbUpperPath && (
                        <path
                          d={bbUpperPath}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                      )}
                      {bbLowerPath && (
                        <path
                          d={bbLowerPath}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                      )}

                      {zoomedCandles.map((c, idx) => {
                        const x = 16 + idx * step + step * 0.5;
                        const bullish = c.close >= c.open;
                        const color = bullish ? '#10b981' : '#ef4444';
                        const bodyTop = toY(Math.max(c.open, c.close));
                        const bodyBot = toY(Math.min(c.open, c.close));
                        const bodyH = Math.max(2, bodyBot - bodyTop);
                        const volH = (c.vol / 100) * 42;
                        return (
                          <g key={idx}>
                            <line
                              x1={x}
                              x2={x}
                              y1={toY(c.high)}
                              y2={toY(c.low)}
                              stroke={color}
                              strokeWidth="1.5"
                            />
                            <rect
                              x={x - step * 0.28}
                              y={bodyTop}
                              width={Math.max(3, step * 0.56)}
                              height={bodyH}
                              fill={color}
                              rx="1.5"
                            />
                            <rect
                              x={x - step * 0.25}
                              y={h - volH - 18}
                              width={Math.max(2, step * 0.5)}
                              height={volH}
                              fill={color}
                              opacity="0.32"
                            />
                          </g>
                        );
                      })}

                      {vwapPath && (
                        <path
                          d={vwapPath}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="1.6"
                          strokeDasharray="2 2"
                        />
                      )}
                      {emaPath && (
                        <path
                          d={emaPath}
                          fill="none"
                          stroke="var(--vp-accent)"
                          strokeWidth="2"
                        />
                      )}
                    </svg>

                    <div
                      className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular shrink-0"
                      style={{ color: 'var(--vp-muted)' }}
                    >
                      <span>Start: {zoomedCandles[0]?.timeLabel}</span>
                      <span>
                        Last Close: ${latestBar.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        {showEMA ? ' · EMA(9)' : ''}
                        {showVWAP ? ' · VWAP' : ''}
                        {showBB ? ' · BB(20,2)' : ''}
                      </span>
                      <span>Latest Bar: {latestBar.timeLabel}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </section>

        {/* Copy Trading Signals & Live XAU/BTC Trader Chat Desk */}
        <aside
          className="xl:col-span-5 rounded-2xl border p-4 sm:p-5 space-y-4"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
          }}
        >
          {/* Desk Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className="flex items-center gap-1 rounded-xl p-1"
              style={{ backgroundColor: 'var(--vp-elevated)' }}
            >
              <button
                type="button"
                onClick={() => setDeskTab('copy')}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: deskTab === 'copy' ? 'var(--vp-primary)' : 'transparent',
                  color: deskTab === 'copy' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Trading ({copiedIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setDeskTab('chat')}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: deskTab === 'chat' ? 'var(--vp-primary)' : 'transparent',
                  color: deskTab === 'chat' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                }}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Live XAU/BTC Chat</span>
              </button>
            </div>
          </div>

          {deskTab === 'copy' ? (
            <div className="space-y-3.5">
              {/* Pair Filter + Allocation Size */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(['ALL', 'XAU/USD', 'BTC/USD'] as const).map((pf) => (
                    <button
                      key={pf}
                      type="button"
                      onClick={() => setPairFilter(pf)}
                      className="min-h-[34px] rounded-lg border px-2.5 text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor:
                          pairFilter === pf ? 'var(--vp-secondary)' : 'var(--vp-elevated)',
                        color:
                          pairFilter === pf ? 'var(--vp-secondary-fg)' : 'var(--vp-text)',
                        borderColor: 'var(--vp-border)',
                      }}
                    >
                      {pf === 'ALL' ? 'All Pairs' : pf}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 text-xs font-mono-tabular">
                  <span style={{ color: 'var(--vp-muted)' }}>Copy Size:</span>
                  {[100, 250, 500, 1000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCopyAllocationUsd(amt)}
                      className="min-h-[30px] rounded-lg px-2 font-semibold cursor-pointer"
                      style={{
                        backgroundColor:
                          copyAllocationUsd === amt ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                        color:
                          copyAllocationUsd === amt ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                      }}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Copy Trading Signal Cards */}
              <div className="space-y-3 max-h-[490px] overflow-y-auto pr-0.5">
                {filteredSignals.map((sig) => {
                  const isCopied = copiedIds.includes(sig.id);
                  const isBuy = sig.side === 'BUY';
                  const currentSpot =
                    sig.pair === 'XAU/USD' ? xauLive.price : btcLive.price;
                  const liveDiffPct =
                    ((currentSpot - sig.entry) / sig.entry) *
                    (isBuy ? 100 : -100);
                  const estUsdPnl = (copyAllocationUsd * liveDiffPct) / 10;

                  return (
                    <article
                      key={sig.id}
                      className="rounded-xl border p-3.5 space-y-2.5"
                      style={{
                        backgroundColor: 'var(--vp-elevated)',
                        borderColor: isCopied ? 'var(--vp-primary)' : 'var(--vp-border)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{sig.traderName}</span>
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: 'var(--vp-muted)' }}
                            >
                              {sig.postedAgo}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono-tabular font-bold">{sig.pair}</span>
                            <span
                              className="rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                              style={{
                                backgroundColor: isBuy
                                  ? 'rgba(16, 185, 129, 0.16)'
                                  : 'rgba(239, 68, 68, 0.16)',
                                color: isBuy ? '#10b981' : '#ef4444',
                              }}
                            >
                              {sig.side} · {sig.timeframe}
                            </span>
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-mono-tabular"
                              style={{ color: 'var(--vp-muted)' }}
                            >
                              <Users className="h-3 w-3" />
                              {sig.followers.toLocaleString()} · {sig.winRatePct}% win
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono-tabular">
                          <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                            Est. Copy P&L
                          </span>
                          <span
                            className="text-xs font-bold"
                            style={{ color: estUsdPnl >= 0 ? '#10b981' : '#ef4444' }}
                          >
                            {estUsdPnl >= 0 ? '+' : ''}
                            ${estUsdPnl.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div
                        className="grid grid-cols-3 gap-2 rounded-lg p-2 text-xs font-mono-tabular"
                        style={{ backgroundColor: 'var(--vp-surface)' }}
                      >
                        <div>
                          <span className="block text-[10px]" style={{ color: 'var(--vp-muted)' }}>
                            Entry
                          </span>
                          <span className="font-bold">
                            ${sig.entry.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px]" style={{ color: 'var(--vp-muted)' }}>
                            Target TP
                          </span>
                          <span className="font-bold" style={{ color: '#10b981' }}>
                            ${sig.takeProfit.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px]" style={{ color: 'var(--vp-muted)' }}>
                            Stop SL ({sig.riskReward})
                          </span>
                          <span className="font-bold" style={{ color: '#ef4444' }}>
                            ${sig.stopLoss.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs leading-relaxed" style={{ color: 'var(--vp-muted)' }}>
                        {sig.note}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleCopyTrade(sig)}
                          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold cursor-pointer"
                          style={{
                            backgroundColor: isCopied ? '#10b981' : 'var(--vp-primary)',
                            color: isCopied ? '#ffffff' : 'var(--vp-primary-fg)',
                          }}
                        >
                          {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{isCopied ? `Copying ($${copyAllocationUsd})` : 'Copy Trade'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLoadSignalOnChart(sig)}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-3 text-xs font-semibold cursor-pointer"
                          style={{
                            backgroundColor: 'var(--vp-surface)',
                            borderColor: 'var(--vp-border)',
                            color: 'var(--vp-text)',
                          }}
                        >
                          <TrendingUp className="h-3.5 w-3.5" />
                          <span>1m Chart</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePostSignalToChat(sig)}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 text-xs font-semibold cursor-pointer"
                          style={{
                            backgroundColor: 'var(--vp-surface)',
                            borderColor: 'var(--vp-border)',
                            color: 'var(--vp-text)',
                          }}
                          title="Share to Live Chat"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Live XAU Gold & BTC Trader Chat */
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(['ALL', 'XAU/USD', 'BTC/USD'] as const).map((room) => (
                    <button
                      key={room}
                      type="button"
                      onClick={() => setChatRoomPair(room)}
                      className="min-h-[34px] rounded-lg border px-2.5 text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor:
                          chatRoomPair === room ? 'var(--vp-secondary)' : 'var(--vp-elevated)',
                        color:
                          chatRoomPair === room ? 'var(--vp-secondary-fg)' : 'var(--vp-text)',
                        borderColor: 'var(--vp-border)',
                      }}
                    >
                      {room === 'ALL' ? 'All Live Chat' : room}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
                  1m Feed
                </span>
              </div>

              {/* Message Feed (uses user's message typography & custom bubble colors) */}
              <div className="space-y-2.5 max-h-[390px] overflow-y-auto pr-0.5">
                {filteredChatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 ${getBubbleRadiusClass()} ${msg.isOwn ? 'ml-4' : 'mr-2'}`}
                    style={{
                      backgroundColor: msg.isOwn ? 'var(--vp-msg-self-bg)' : 'var(--vp-msg-other-bg)',
                      color: msg.isOwn ? 'var(--vp-msg-self-fg)' : 'var(--vp-msg-other-fg)',
                      fontFamily: getFontFamily(typography.messageFont),
                      fontSize: `${typography.messageFontSize}px`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] opacity-80 mb-1">
                      <span className="font-bold">
                        {msg.sender} · {msg.pair}
                      </span>
                      <span className="font-mono-tabular">{msg.timestamp}</span>
                    </div>
                    <p className="leading-snug">{msg.text}</p>

                    {msg.setup && (
                      <div
                        className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg p-2 text-[11px] font-mono-tabular"
                        style={{
                          backgroundColor: 'var(--vp-surface)',
                          color: 'var(--vp-text)',
                        }}
                      >
                        <span>
                          <strong
                            style={{
                              color: msg.setup.side === 'BUY' ? '#10b981' : '#ef4444',
                            }}
                          >
                            {msg.setup.side}
                          </strong>{' '}
                          @{msg.setup.entry} · TP {msg.setup.tp} · SL {msg.setup.sl}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSymbol(
                              msg.pair === 'XAU/USD' ? 'OANDA:XAUUSD' : 'BITSTAMP:BTCUSD'
                            );
                            setInterval('1');
                          }}
                          className="font-semibold underline cursor-pointer"
                          style={{ color: 'var(--vp-primary)' }}
                        >
                          View 1m
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Chat Composer */}
              <form onSubmit={handleSendChat} className="space-y-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Select chat trading pair"
                    value={composePair}
                    onChange={(e) => setComposePair(e.target.value as 'XAU/USD' | 'BTC/USD')}
                    className="min-h-[42px] rounded-xl border px-2.5 text-xs font-semibold outline-none"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor: 'var(--vp-border)',
                      color: 'var(--vp-text)',
                    }}
                  >
                    <option value="XAU/USD">XAU/USD</option>
                    <option value="BTC/USD">BTC/USD</option>
                  </select>
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder={`Share ${composePair} 1m setup or idea...`}
                    className="flex-1 min-w-0 min-h-[42px] rounded-xl border px-3 text-xs sm:text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor: 'var(--vp-border)',
                      color: 'var(--vp-text)',
                      fontFamily: getFontFamily(typography.messageFont),
                    }}
                  />
                  <button
                    type="submit"
                    aria-label="Send trading message"
                    className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl px-3 font-semibold cursor-pointer"
                    style={{
                      backgroundColor: 'var(--vp-primary)',
                      color: 'var(--vp-primary-fg)',
                    }}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </aside>
      </div>

      {/* Live Technical Confluence & BUY / SELL Trade Suggestion Desk */}
      {smartSummary && (
        <MarketTradeSuggestionCard
          pairLabel={activePreset?.shortLabel ?? symbol}
          timeframeLabel={INTERVALS.find((i) => i.id === interval)?.label ?? interval}
          summary={smartSummary}
          dataSourceLabel={
            symbol === 'BITSTAMP:BTCUSD' || symbol.startsWith('BINANCE:')
              ? liveBtcCandles
                ? 'Live Binance Candlestick Feed'
                : 'Spot Snapshot'
              : symbol === 'OANDA:XAUUSD'
                ? `${xauLive.provider} (${xauLive.updatedAt})`
                : 'Spot Snapshot'
          }
        />
      )}
    </div>
  );
};
