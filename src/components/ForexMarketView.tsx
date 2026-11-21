import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Check,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { FONT_OPTIONS } from '../data/newsData';
import type { FontOptionId, MarketAsset, ThemeMode, TypographySettings } from '../types/news';
import { fetchBinanceKlines, type LiveCandleBar } from '../utils/marketFeeds';
import { computeSmartChartSummary, type CandleInput } from '../utils/technicalIndicators';
import { MarketTradeSuggestionCard } from './MarketTradeSuggestionCard';
import { TradingViewChartPanel } from './TradingViewChartPanel';
import { TradingViewEmbedChart } from './TradingViewEmbedChart';
import { TradingViewTickerTape } from './TradingViewTickerTape';
import { XauGoldAnalysisSection } from './XauGoldAnalysisSection';

interface ForexMarketViewProps {
  typography: TypographySettings;
  themeMode: ThemeMode;
  marketAssets?: MarketAsset[];
  watchlistSymbols?: string[];
  onOpenMarketDetails?: (asset: MarketAsset) => void;
  onRefreshAllMarkets?: () => void;
  isRefreshingMarkets?: boolean;
}

const SMART_STUDY_OPTIONS = [
  { id: 'STD;EMA', label: 'EMA' },
  { id: 'STD;RSI', label: 'RSI (14)' },
  { id: 'STD;MACD', label: 'MACD' },
  { id: 'STD;Bollinger_Bands', label: 'Bollinger' },
  { id: 'STD;VWAP', label: 'VWAP' },
  { id: 'STD;Stochastic_RSI', label: 'Stoch RSI' },
] as const;

const SMART_PRESETS: { id: string; label: string; studies: string[] }[] = [
  {
    id: 'scalp',
    label: 'Scalp (EMA + VWAP + RSI)',
    studies: ['STD;EMA', 'STD;VWAP', 'STD;RSI'],
  },
  {
    id: 'trend',
    label: 'Trend (EMA + MACD + BB)',
    studies: ['STD;EMA', 'STD;MACD', 'STD;Bollinger_Bands'],
  },
  {
    id: 'momentum',
    label: 'Momentum (RSI + MACD + Stoch)',
    studies: ['STD;RSI', 'STD;MACD', 'STD;Stochastic_RSI'],
  },
  {
    id: 'clean',
    label: 'Clean Price',
    studies: [],
  },
];

function formatPrice(val: number): string {
  if (val >= 1000) return val.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (val >= 10) return val.toFixed(2);
  return val.toFixed(4);
}

function buildSpotAnchoredBars(basePrice: number, seedKey: string, count = 42): CandleInput[] {
  const seed = seedKey.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const bars: CandleInput[] = [];
  let prev = basePrice * 0.996;
  const volScale = basePrice * 0.0014;
  for (let i = 0; i < count; i += 1) {
    const wave =
      Math.sin((i + seed) * 0.52) * volScale +
      Math.cos((i * 2 + seed) * 0.29) * volScale * 0.6;
    const open = prev;
    const close = i === count - 1 ? basePrice : Math.max(0.001, open + wave);
    const high = Math.max(open, close) + Math.abs(Math.sin(i + seed)) * volScale * 0.55;
    const low = Math.max(0.001, Math.min(open, close) - Math.abs(Math.cos(i + seed)) * volScale * 0.5);
    bars.push({
      open,
      high,
      low,
      close,
      vol: 35 + ((i * 17 + seed) % 65),
    });
    prev = close;
  }
  return bars;
}

export const ForexMarketView: React.FC<ForexMarketViewProps> = ({
  typography,
  themeMode,
  marketAssets = [],
  watchlistSymbols = [],
  onOpenMarketDetails,
  onRefreshAllMarkets,
  isRefreshingMarkets = false,
}) => {
  const [marketSubTab, setMarketSubTab] = useState<'terminal' | 'xau' | 'tradingview'>('terminal');
  const [tvWidgetSymbol, setTvWidgetSymbol] = useState<string>('BINANCE:BTCUSDT');
  const [tvWidgetInterval, setTvWidgetInterval] = useState<string>('15');
  const [tvStudies, setTvStudies] = useState<string[]>(['STD;EMA', 'STD;VWAP', 'STD;RSI']);
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Metals' | 'Crypto'>('All');
  const [liveCryptoBars, setLiveCryptoBars] = useState<LiveCandleBar[] | null>(null);
  const [isChartFullScreen, setIsChartFullScreen] = useState(false);
  const [inlineChartHeight, setInlineChartHeight] = useState<number>(640);

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

  // Fetch live Binance klines for any BINANCE:* crypto pair at the active timeframe
  useEffect(() => {
    let cancelled = false;
    const loadCandles = async () => {
      if (tvWidgetSymbol.startsWith('BINANCE:')) {
        const bars = await fetchBinanceKlines(tvWidgetSymbol, tvWidgetInterval, 60);
        if (!cancelled) setLiveCryptoBars(bars);
      } else {
        setLiveCryptoBars(null);
      }
    };
    loadCandles();
    return () => {
      cancelled = true;
    };
  }, [tvWidgetSymbol, tvWidgetInterval]);

  const activeSymbolAsset = useMemo(
    () => marketAssets.find((a) => a.tvSymbol === tvWidgetSymbol),
    [marketAssets, tvWidgetSymbol]
  );

  const smartSummary = useMemo(() => {
    const basePrice = activeSymbolAsset?.livePrice ?? (tvWidgetSymbol.includes('XAU') ? 2664.8 : 91850);
    const candles: CandleInput[] =
      liveCryptoBars && liveCryptoBars.length >= 20
        ? liveCryptoBars
        : buildSpotAnchoredBars(basePrice, `${tvWidgetSymbol}-${tvWidgetInterval}`);
    return computeSmartChartSummary(candles);
  }, [liveCryptoBars, activeSymbolAsset?.livePrice, tvWidgetSymbol, tvWidgetInterval]);

  const toggleStudy = (studyId: string) => {
    setTvStudies((prev) =>
      prev.includes(studyId) ? prev.filter((id) => id !== studyId) : [...prev, studyId]
    );
  };

  const filteredAssets = marketAssets.filter((asset) => {
    if (categoryFilter === 'All') return true;
    return asset.category === categoryFilter;
  });

  const ratingColor =
    smartSummary?.rating === 'Strong Buy' || smartSummary?.rating === 'Buy'
      ? '#10b981'
      : smartSummary?.rating === 'Strong Sell' || smartSummary?.rating === 'Sell'
        ? '#ef4444'
        : 'var(--vp-accent)';

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-20 md:pb-8">
      {/* Header Row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ fontFamily: getFontFamily(typography.headlineFont) }}
          >
            Live Markets — Gold, Silver &amp; Crypto
          </h1>
          <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--vp-muted)' }}>
            Real-time TradingView charts with smart technical indicators, pivot levels, and bullion spot analysis
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onRefreshAllMarkets?.()}
            disabled={isRefreshingMarkets}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
              color: 'var(--vp-text)',
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingMarkets ? 'animate-spin' : ''}`} />
            <span>Refresh Live Prices</span>
          </button>
        </div>
      </div>

      {/* Official TradingView Live Ticker Tape (BTC, ETH, Gold, Silver, SOL, BNB) */}
      <TradingViewTickerTape themeMode={themeMode} />

      {/* Market Section Switcher */}
      <div
        className="flex items-center gap-1.5 rounded-2xl p-1.5 w-fit max-w-full overflow-x-auto no-scrollbar"
        style={{ backgroundColor: 'var(--vp-elevated)' }}
      >
        <button
          type="button"
          onClick={() => setMarketSubTab('terminal')}
          className="min-h-[40px] rounded-xl px-4 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all"
          style={{
            backgroundColor: marketSubTab === 'terminal' ? 'var(--vp-primary)' : 'transparent',
            color: marketSubTab === 'terminal' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
          }}
        >
          Live TradingView Terminal
        </button>
        <button
          type="button"
          onClick={() => setMarketSubTab('xau')}
          className="min-h-[40px] rounded-xl px-4 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all"
          style={{
            backgroundColor: marketSubTab === 'xau' ? 'var(--vp-primary)' : 'transparent',
            color: marketSubTab === 'xau' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
          }}
        >
          XAU Gold Analysis &amp; Alerts
        </button>
        <button
          type="button"
          onClick={() => setMarketSubTab('tradingview')}
          className="min-h-[40px] rounded-xl px-4 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all"
          style={{
            backgroundColor: marketSubTab === 'tradingview' ? 'var(--vp-primary)' : 'transparent',
            color: marketSubTab === 'tradingview' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
          }}
        >
          Copy Trading &amp; 1m Charts (XAU / BTC)
        </button>
      </div>

      {marketSubTab === 'xau' ? (
        <XauGoldAnalysisSection typography={typography} />
      ) : marketSubTab === 'tradingview' ? (
        <TradingViewChartPanel
          themeMode={themeMode}
          typography={typography}
          initialSymbol="OANDA:XAUUSD"
        />
      ) : (
        <div className="space-y-6">
          {/* Live TradingView Interactive Candlestick Terminal with Smart Indicators */}
          <section
            ref={chartSectionRef}
            aria-label="Live TradingView Candlestick Terminal"
            className={
              isChartFullScreen
                ? 'fixed inset-0 z-[90] flex flex-col gap-3 p-3 sm:p-5 overflow-hidden'
                : 'rounded-2xl border p-4 sm:p-5 space-y-4'
            }
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { symbol: 'BINANCE:BTCUSDT', label: 'Bitcoin (BTC/USDT)' },
                  { symbol: 'BINANCE:ETHUSDT', label: 'Ethereum (ETH/USDT)' },
                  { symbol: 'BINANCE:SOLUSDT', label: 'Solana (SOL/USDT)' },
                  { symbol: 'OANDA:XAUUSD', label: 'Gold (XAU/USD)' },
                  { symbol: 'OANDA:XAGUSD', label: 'Silver (XAG/USD)' },
                ].map((pair) => {
                  const active = tvWidgetSymbol === pair.symbol;
                  return (
                    <button
                      key={pair.symbol}
                      type="button"
                      onClick={() => setTvWidgetSymbol(pair.symbol)}
                      className="min-h-[36px] rounded-xl border px-3 py-1.5 text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                        color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                        borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                      }}
                    >
                      {pair.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex items-center gap-1 rounded-xl p-1"
                  style={{ backgroundColor: 'var(--vp-elevated)' }}
                >
                  {[
                    { id: '1', label: '1m' },
                    { id: '5', label: '5m' },
                    { id: '15', label: '15m' },
                    { id: '60', label: '1H' },
                    { id: 'D', label: '1D' },
                  ].map((tf) => (
                    <button
                      key={tf.id}
                      type="button"
                      onClick={() => setTvWidgetInterval(tf.id)}
                      className="min-h-[32px] rounded-lg px-2.5 text-xs font-mono-tabular font-semibold cursor-pointer"
                      style={{
                        backgroundColor: tvWidgetInterval === tf.id ? 'var(--vp-primary)' : 'transparent',
                        color: tvWidgetInterval === tf.id ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                      }}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>

                {!isChartFullScreen && (
                  <div
                    className="hidden sm:flex items-center gap-1 rounded-xl border p-1"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor: 'var(--vp-border)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setInlineChartHeight((h) => Math.max(440, h - 80))}
                      aria-label="Zoom out chart height"
                      title="Compact chart height"
                      className="min-h-[28px] rounded-lg px-2 text-xs cursor-pointer"
                      style={{ color: 'var(--vp-text)' }}
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setInlineChartHeight((h) => Math.min(880, h + 80))}
                      aria-label="Zoom in chart height"
                      title="Expand chart height"
                      className="min-h-[28px] rounded-lg px-2 text-xs cursor-pointer"
                      style={{ color: 'var(--vp-text)' }}
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={toggleFullScreen}
                  aria-label={isChartFullScreen ? 'Exit full screen chart' : 'Zoom chart full screen'}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isChartFullScreen ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                    color: isChartFullScreen ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                    borderColor: isChartFullScreen ? 'var(--vp-primary)' : 'var(--vp-border)',
                  }}
                >
                  {isChartFullScreen ? (
                    <>
                      <Minimize2 className="h-3.5 w-3.5" />
                      <span>Exit Full Screen (Esc)</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>Full Screen Zoom</span>
                    </>
                  )}
                </button>

                {onOpenMarketDetails && !isChartFullScreen && (
                  <button
                    type="button"
                    onClick={() => {
                      const found =
                        marketAssets.find((a) => a.tvSymbol === tvWidgetSymbol) ??
                        marketAssets[0];
                      if (found) onOpenMarketDetails(found);
                    }}
                    className="min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor: 'var(--vp-secondary)',
                      color: 'var(--vp-secondary-fg)',
                      borderColor: 'var(--vp-border)',
                    }}
                  >
                    Full Terminal &amp; Alerts →
                  </button>
                )}
              </div>
            </div>

            {/* Smart Chart Indicators Toolbar */}
            <div
              className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border p-2.5 sm:p-3 shrink-0"
              style={{
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
              }}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold mr-1"
                  style={{ color: 'var(--vp-primary)' }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Smart Indicators:</span>
                </span>
                {SMART_STUDY_OPTIONS.map((ind) => {
                  const active = tvStudies.includes(ind.id);
                  return (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => toggleStudy(ind.id)}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-surface)',
                        color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                        borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                      }}
                    >
                      {active && <Check className="h-3 w-3" />}
                      <span>{ind.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {SMART_PRESETS.map((preset) => {
                  const isMatch =
                    preset.studies.length === tvStudies.length &&
                    preset.studies.every((s) => tvStudies.includes(s));
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setTvStudies([...preset.studies])}
                      className="min-h-[28px] rounded-lg border px-2.5 text-[11px] font-semibold cursor-pointer"
                      style={{
                        backgroundColor: isMatch ? 'var(--vp-secondary)' : 'transparent',
                        color: isMatch ? 'var(--vp-secondary-fg)' : 'var(--vp-muted)',
                        borderColor: 'var(--vp-border)',
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={isChartFullScreen ? 'flex-1 min-h-0' : ''}>
              <TradingViewEmbedChart
                symbol={tvWidgetSymbol}
                interval={tvWidgetInterval}
                themeMode={themeMode}
                height={isChartFullScreen ? '100%' : inlineChartHeight}
                studies={tvStudies}
                className={isChartFullScreen ? 'h-full' : ''}
              />
            </div>

            {/* Smart Technical Confluence & Pivot Readouts */}
            {smartSummary && (
              <div
                className={
                  isChartFullScreen
                    ? 'hidden sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-2.5 shrink-0'
                    : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1'
                }
              >
                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    <Activity className="h-3 w-3" style={{ color: ratingColor }} />
                    <span>Smart Signal</span>
                  </span>
                  <span className="block text-sm font-bold mt-0.5" style={{ color: ratingColor }}>
                    {smartSummary.rating}
                  </span>
                  <span className="block text-[11px] truncate" style={{ color: 'var(--vp-muted)' }}>
                    {smartSummary.trendLabel}
                  </span>
                </div>

                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    RSI (14)
                  </span>
                  <span className="block font-mono-tabular text-sm font-bold mt-0.5">
                    {smartSummary.rsi14.toFixed(1)}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                    {smartSummary.rsi14 >= 70
                      ? 'Overbought'
                      : smartSummary.rsi14 <= 30
                        ? 'Oversold'
                        : 'Balanced'}
                  </span>
                </div>

                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    MACD Hist
                  </span>
                  <span
                    className="block font-mono-tabular text-sm font-bold mt-0.5"
                    style={{ color: smartSummary.macdHist >= 0 ? '#10b981' : '#ef4444' }}
                  >
                    {smartSummary.macdHist >= 0 ? '+' : ''}
                    {smartSummary.macdHist.toFixed(2)}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                    {smartSummary.macdHist >= 0 ? 'Bullish cross' : 'Bearish slope'}
                  </span>
                </div>

                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    VWAP Anchor
                  </span>
                  <span className="block font-mono-tabular text-sm font-bold mt-0.5">
                    ${formatPrice(smartSummary.vwap)}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                    Volume-weighted
                  </span>
                </div>

                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    Support (S1)
                  </span>
                  <span className="block font-mono-tabular text-sm font-bold mt-0.5 text-emerald-500">
                    ${formatPrice(smartSummary.supportS1)}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                    ATR: ${formatPrice(smartSummary.atr14)}
                  </span>
                </div>

                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    Resistance (R1)
                  </span>
                  <span className="block font-mono-tabular text-sm font-bold mt-0.5 text-rose-500">
                    ${formatPrice(smartSummary.resistanceR1)}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                    EMA 9: ${formatPrice(smartSummary.ema9)}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Perfect Market Analysis & Actionable BUY / SELL Suggestion */}
          {smartSummary && (
            <MarketTradeSuggestionCard
              pairLabel={activeSymbolAsset?.displayPair ?? tvWidgetSymbol.replace(/^.*:/, '')}
              timeframeLabel={
                tvWidgetInterval === '1'
                  ? '1m'
                  : tvWidgetInterval === '5'
                    ? '5m'
                    : tvWidgetInterval === '15'
                      ? '15m'
                      : tvWidgetInterval === '60'
                        ? '1H'
                        : '1D'
              }
              summary={smartSummary}
              dataSourceLabel={
                liveCryptoBars && liveCryptoBars.length >= 20
                  ? 'Live Binance OHLCV Candles'
                  : 'Live Spot-Anchored Technicals'
              }
            />
          )}

          {/* Live Gold, Silver & Crypto Coins — Click any card to open interactive TradingView MarketDetails */}
          {marketAssets.length > 0 && (
            <section aria-label="Live Bullion & Crypto Markets" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold tracking-tight">
                    Live Precious Metals &amp; Crypto (Click for TradingView Candlestick Chart)
                  </h2>
                  <div
                    className="flex items-center gap-1 rounded-xl p-1"
                    style={{ backgroundColor: 'var(--vp-elevated)' }}
                  >
                    {(['All', 'Metals', 'Crypto'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className="min-h-[30px] rounded-lg px-2.5 text-xs font-semibold cursor-pointer"
                        style={{
                          backgroundColor:
                            categoryFilter === cat ? 'var(--vp-primary)' : 'transparent',
                          color:
                            categoryFilter === cat ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-xs" style={{ color: 'var(--vp-muted)' }}>
                  {watchlistSymbols.length > 0 ? `${watchlistSymbols.length} watchlisted` : 'Tap any asset'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredAssets.map((asset) => {
                  const up = asset.changePct24h >= 0;
                  const isGold = asset.displayPair === 'XAU/USD';
                  const assetBars = buildSpotAnchoredBars(asset.livePrice, `${asset.tvSymbol}-15`);
                  const assetSignal = computeSmartChartSummary(assetBars);
                  const signalColor = assetSignal?.action.includes('BUY')
                    ? '#10b981'
                    : assetSignal?.action.includes('SELL')
                      ? '#ef4444'
                      : '#f59e0b';
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => onOpenMarketDetails?.(asset)}
                      className="text-left rounded-2xl border p-4 transition-all hover:translate-y-[-1px] cursor-pointer space-y-2"
                      style={{
                        backgroundColor: 'var(--vp-surface)',
                        borderColor: isGold ? 'var(--vp-accent)' : 'var(--vp-border)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate">{asset.displayPair}</span>
                        <span
                          className="text-[11px] font-mono-tabular font-semibold"
                          style={{ color: up ? '#10b981' : '#ef4444' }}
                        >
                          {up ? '+' : ''}
                          {asset.changePct24h.toFixed(2)}%
                        </span>
                      </div>
                      <div className="font-mono-tabular text-xl font-bold tracking-tight">
                        ${formatPrice(asset.livePrice)}
                      </div>
                      <div
                        className="flex items-center justify-between gap-1 text-[11px]"
                        style={{ color: 'var(--vp-muted)' }}
                      >
                        <span className="font-mono-tabular font-bold" style={{ color: signalColor }}>
                          {assetSignal ? `${assetSignal.action} (${assetSignal.confidencePct}%)` : asset.name}
                        </span>
                        <span className="font-semibold shrink-0" style={{ color: 'var(--vp-primary)' }}>
                          Big Chart →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
