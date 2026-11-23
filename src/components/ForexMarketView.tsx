import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  Maximize2,
  Minimize2,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import type { AppTab, MarketAsset, ThemeMode, TypographySettings } from '../types/news';
import { fetchBinanceKlines, type LiveCandleBar } from '../utils/marketFeeds';
import { computeSmartChartSummary, type CandleInput } from '../utils/technicalIndicators';
import { ChartSettingsModal } from './ChartSettingsModal';
import { LiveMarketWatchlist } from './LiveMarketWatchlist';
import { MarketTradeSuggestionCard } from './MarketTradeSuggestionCard';
import { ProSmcTerminal, type SmcTelemetrySnapshot } from './ProSmcTerminal';
import { TerminalTopicBoxes } from './TerminalTopicBoxes';
import { TradingViewEmbedChart } from './TradingViewEmbedChart';

interface ForexMarketViewProps {
  typography?: TypographySettings;
  themeMode: ThemeMode;
  onChangeThemeMode?: (mode: ThemeMode) => void;
  marketAssets?: MarketAsset[];
  watchlistSymbols?: string[];
  selectedSymbol?: string;
  onSelectSymbol?: (tvSymbol: string) => void;
  onOpenMarketDetails?: (asset: MarketAsset) => void;
  onRefreshMarkets?: () => void;
  isRefreshingMarkets?: boolean;
  onNavigateTab?: (tab: AppTab) => void;
}

const COMPACT_SYMBOLS = [
  { symbol: 'OANDA:XAUUSD', label: 'Gold' },
  { symbol: 'OANDA:XAGUSD', label: 'Silver' },
  { symbol: 'BINANCE:BTCUSDT', label: 'BTC' },
  { symbol: 'BINANCE:ETHUSDT', label: 'ETH' },
  { symbol: 'FOREXCOM:SPXUSD', label: 'S&P 500' },
  { symbol: 'TVC:USOIL', label: 'US Oil' },
  { symbol: 'BINANCE:SOLUSDT', label: 'SOL' },
  { symbol: 'BINANCE:BNBUSDT', label: 'BNB' },
  { symbol: 'BINANCE:XRPUSDT', label: 'XRP' },
] as const;

const COMPACT_TIMEFRAMES = [
  { id: '1', label: '1m' },
  { id: '5', label: '5m' },
  { id: '15', label: '15m' },
  { id: '30', label: '30m' },
  { id: '60', label: '1H' },
  { id: '240', label: '4H' },
  { id: 'D', label: '1D' },
] as const;

const SMART_STUDY_OPTIONS = [
  { id: 'RSI@tv-basicstudies', label: 'RSI (14)' },
  { id: 'MACD@tv-basicstudies', label: 'MACD' },
  { id: 'MASimple@tv-basicstudies', label: 'Moving Avg' },
  { id: 'MAExp@tv-basicstudies', label: 'EMA' },
  { id: 'BB@tv-basicstudies', label: 'Bollinger' },
  { id: 'VWAP@tv-basicstudies', label: 'VWAP' },
] as const;

const SMART_PRESETS: { id: string; label: string; studies: string[] }[] = [
  {
    id: 'default',
    label: 'MA + RSI',
    studies: ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies'],
  },
  {
    id: 'scalp',
    label: 'Scalp',
    studies: ['MAExp@tv-basicstudies', 'VWAP@tv-basicstudies', 'RSI@tv-basicstudies'],
  },
  {
    id: 'trend',
    label: 'Trend',
    studies: ['MASimple@tv-basicstudies', 'MACD@tv-basicstudies', 'BB@tv-basicstudies'],
  },
  {
    id: 'clean',
    label: 'Clean',
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
  themeMode,
  onChangeThemeMode,
  marketAssets = [],
  watchlistSymbols: _watchlistSymbols = [],
  selectedSymbol,
  onSelectSymbol,
  onOpenMarketDetails,
  onNavigateTab,
}) => {
  const [marketSubTab, setMarketSubTab] = useState<'terminal' | 'smc'>('smc');
  const [internalSymbol, setInternalSymbol] = useState<string>(selectedSymbol || 'OANDA:XAUUSD');
  const [tvWidgetInterval, setTvWidgetInterval] = useState<string>('15');
  const [tvStudies, setTvStudies] = useState<string[]>([
    'MASimple@tv-basicstudies',
    'RSI@tv-basicstudies',
  ]);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [tvSettingsOpen, setTvSettingsOpen] = useState(false);
  const [liveCryptoBars, setLiveCryptoBars] = useState<LiveCandleBar[] | null>(null);
  const [isChartFullScreen, setIsChartFullScreen] = useState(false);
  const [liveTelemetry, setLiveTelemetry] = useState<SmcTelemetrySnapshot | null>(null);

  const chartSectionRef = useRef<HTMLElement | null>(null);
  const indicatorsMenuRef = useRef<HTMLDivElement | null>(null);
  const enteredNativeFsRef = useRef(false);

  useEffect(() => {
    if (selectedSymbol) {
      setInternalSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  const tvWidgetSymbol = selectedSymbol || internalSymbol;

  const handleChooseSymbol = (sym: string) => {
    setInternalSymbol(sym);
    onSelectSymbol?.(sym);
  };

  useEffect(() => {
    if (!indicatorsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (indicatorsMenuRef.current && !indicatorsMenuRef.current.contains(e.target as Node)) {
        setIndicatorsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndicatorsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [indicatorsOpen]);

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

  // Fetch live OHLCV candles from /api/klines (or Binance) for the active chart symbol
  useEffect(() => {
    let cancelled = false;
    const loadCandles = async () => {
      const intervalKey =
        tvWidgetInterval === '1'
          ? '1m'
          : tvWidgetInterval === '5'
            ? '5m'
            : tvWidgetInterval === '30'
              ? '30m'
              : tvWidgetInterval === '60'
                ? '1h'
                : tvWidgetInterval === '240'
                  ? '4h'
                  : tvWidgetInterval === 'D'
                    ? '1d'
                    : '15m';
      const klineKey = tvWidgetSymbol.includes('XAU')
        ? 'XAUUSD'
        : tvWidgetSymbol.includes('XAG')
          ? 'XAGUSD'
          : tvWidgetSymbol.includes('SPX') || tvWidgetSymbol.includes('US500')
            ? 'US500'
            : tvWidgetSymbol.includes('USOIL')
              ? 'USOIL'
              : tvWidgetSymbol.startsWith('BINANCE:')
                ? tvWidgetSymbol.replace('BINANCE:', '')
                : null;

      if (klineKey) {
        try {
          const res = await fetch(`/api/klines?symbol=${klineKey}&interval=${intervalKey}`, {
            cache: 'no-store',
          });
          if (res.ok) {
            const json = (await res.json()) as {
              candles?: Array<{ time: number; open: number; high: number; low: number; close: number }>;
            };
            if (!cancelled && Array.isArray(json.candles) && json.candles.length >= 20) {
              setLiveCryptoBars(
                json.candles.slice(-60).map((c) => ({
                  timeLabel: new Date(c.time * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  open: c.open,
                  high: c.high,
                  low: c.low,
                  close: c.close,
                  vol: 100,
                }))
              );
              return;
            }
          }
        } catch {
          // fallback below
        }
      }

      if (tvWidgetSymbol.startsWith('BINANCE:')) {
        const bars = await fetchBinanceKlines(tvWidgetSymbol, tvWidgetInterval, 60);
        if (!cancelled) setLiveCryptoBars(bars);
      } else if (!cancelled) {
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
    const fallbackPrice = tvWidgetSymbol.includes('XAU')
      ? 3515
      : tvWidgetSymbol.includes('SPX')
        ? 6910
        : tvWidgetSymbol.includes('USOIL')
          ? 83.4
          : 91850;
    const basePrice = activeSymbolAsset?.livePrice ?? fallbackPrice;
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

  const ratingColor =
    smartSummary?.rating === 'Strong Buy' || smartSummary?.rating === 'Buy'
      ? '#10b981'
      : smartSummary?.rating === 'Strong Sell' || smartSummary?.rating === 'Sell'
        ? '#ef4444'
        : 'var(--vp-accent)';

  return (
    <div className="mx-auto max-w-[1440px] space-y-4">
      {/* Compact Top Mode Switcher + Active Pair Readout & Live Refresh */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div
          className="vp-glass-card flex items-center gap-1 rounded-full p-1 shrink-0"
        >
          <button
            type="button"
            onClick={() => setMarketSubTab('smc')}
            className="vp-pill-btn min-h-[34px] px-3.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              backgroundColor: marketSubTab === 'smc' ? 'var(--vp-primary)' : 'transparent',
              color: marketSubTab === 'smc' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
              boxShadow: marketSubTab === 'smc' ? 'var(--vp-glow-gold)' : 'none',
            }}
          >
            Live WS + Auto-Draw
          </button>
          <button
            type="button"
            onClick={() => setMarketSubTab('terminal')}
            className="vp-pill-btn min-h-[34px] px-3.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              backgroundColor: marketSubTab === 'terminal' ? 'var(--vp-primary)' : 'transparent',
              color: marketSubTab === 'terminal' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
              boxShadow: marketSubTab === 'terminal' ? 'var(--vp-glow-gold)' : 'none',
            }}
          >
            TradingView Pro
          </button>
        </div>

        {liveTelemetry?.price != null && Number.isFinite(liveTelemetry.price) && (
          <div className="vp-glass-card flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-mono-tabular whitespace-nowrap shrink-0">
            <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: 'var(--vp-bull)' }}>
              <span
                className="h-2 w-2 rounded-full animate-pulse shadow-[0_0_8px_#089981]"
                style={{ backgroundColor: 'var(--vp-bull)' }}
              />
              <span>LIVE WS</span>
            </span>
            <span className="font-bold" style={{ color: 'var(--vp-text)' }}>
              ${formatPrice(liveTelemetry.price)}
            </span>
          </div>
        )}
      </div>

      {marketSubTab === 'smc' ? (
        <div className="space-y-4">
          <ProSmcTerminal
            externalTvSymbol={tvWidgetSymbol}
            onSelectTvSymbol={handleChooseSymbol}
            onTelemetryChange={setLiveTelemetry}
            themeMode={themeMode}
            onChangeThemeMode={onChangeThemeMode}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Chart-First Full-Width TradingView Section */}
          <section
            ref={chartSectionRef}
            aria-label="Live TradingView Candlestick Terminal"
            className={
              isChartFullScreen
                ? 'fixed inset-0 z-[90] flex flex-col gap-2.5 p-3 sm:p-4 overflow-hidden'
                : 'space-y-2.5'
            }
            style={
              isChartFullScreen
                ? { backgroundColor: 'var(--vp-surface)' }
                : undefined
            }
          >
            {/* Compact Single-Line Coin Selector + Timeframe Pills + Collapsible Indicators Dropdown */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap">
                {COMPACT_SYMBOLS.map((pair) => {
                  const active = tvWidgetSymbol === pair.symbol;
                  return (
                    <button
                      key={pair.symbol}
                      type="button"
                      onClick={() => handleChooseSymbol(pair.symbol)}
                      className="vp-pill-btn min-h-[34px] border px-3.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-surface)',
                        color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                        borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                        boxShadow: active ? 'var(--vp-glow-gold)' : 'none',
                      }}
                    >
                      {pair.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                <div
                  className="vp-glass-card flex items-center gap-1 overflow-x-auto no-scrollbar flex-nowrap rounded-full p-0.5"
                >
                  {COMPACT_TIMEFRAMES.map((tf) => {
                    const active = tvWidgetInterval === tf.id;
                    return (
                      <button
                        key={tf.id}
                        type="button"
                        onClick={() => setTvWidgetInterval(tf.id)}
                        className="vp-pill-btn min-h-[30px] px-2.5 text-xs font-mono-tabular font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: active ? 'var(--vp-primary)' : 'transparent',
                          color: active ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                        }}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>

                {/* Collapsible Smart Indicators Dropdown */}
                <div className="relative shrink-0" ref={indicatorsMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIndicatorsOpen((prev) => !prev)}
                    aria-expanded={indicatorsOpen}
                    className="vp-pill-btn inline-flex min-h-[34px] items-center gap-1.5 border px-3 text-xs font-semibold whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: indicatorsOpen ? 'var(--vp-secondary)' : 'var(--vp-surface)',
                      borderColor: indicatorsOpen ? 'var(--vp-primary)' : 'var(--vp-border)',
                      color: 'var(--vp-text)',
                    }}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
                    <span>Indicators ({tvStudies.length})</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${indicatorsOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {indicatorsOpen && (
                    <div
                      className="vp-glass-card vp-modal-in absolute right-0 top-full mt-1.5 z-40 w-64 rounded-2xl p-3 space-y-2.5"
                    >
                      <div className="flex flex-wrap gap-1">
                        {SMART_PRESETS.map((preset) => {
                          const isMatch =
                            preset.studies.length === tvStudies.length &&
                            preset.studies.every((s) => tvStudies.includes(s));
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setTvStudies([...preset.studies])}
                              className="min-h-[28px] rounded-md border px-2 text-[11px] font-semibold cursor-pointer"
                              style={{
                                backgroundColor: isMatch ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                                color: isMatch ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                                borderColor: isMatch ? 'var(--vp-primary)' : 'var(--vp-border)',
                              }}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--vp-border)' }}>
                        {SMART_STUDY_OPTIONS.map((ind) => {
                          const active = tvStudies.includes(ind.id);
                          return (
                            <button
                              key={ind.id}
                              type="button"
                              onClick={() => toggleStudy(ind.id)}
                              className="inline-flex min-h-[30px] items-center justify-between gap-1 rounded-md border px-2 text-xs font-semibold cursor-pointer"
                              style={{
                                backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                                color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                                borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                              }}
                            >
                              <span className="truncate">{ind.label}</span>
                              {active && <Check className="h-3 w-3 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={toggleFullScreen}
                  aria-label={isChartFullScreen ? 'Exit full screen chart' : 'Zoom chart full screen'}
                  className="vp-pill-btn inline-flex min-h-[34px] items-center gap-1 border px-3 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: isChartFullScreen ? 'var(--vp-primary)' : 'var(--vp-surface)',
                    color: isChartFullScreen ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                    borderColor: isChartFullScreen ? 'var(--vp-primary)' : 'var(--vp-border)',
                  }}
                >
                  {isChartFullScreen ? (
                    <>
                      <Minimize2 className="h-3.5 w-3.5" />
                      <span>Exit</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Full Screen</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setTvSettingsOpen(true)}
                  aria-label="Chart Settings"
                  title="Chart Settings"
                  className="vp-pill-btn inline-flex min-h-[34px] items-center gap-1 border px-3 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--vp-surface)',
                    color: 'var(--vp-text)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <Settings className="h-3.5 w-3.5" style={{ color: 'var(--vp-accent-text)' }} />
                </button>
              </div>
            </div>

            {/* Full-Width Responsive TradingView Candlestick Chart */}
            <div className={isChartFullScreen ? 'flex-1 min-h-0 w-full' : 'w-full h-[430px] sm:h-[520px]'}>
              <TradingViewEmbedChart
                symbol={tvWidgetSymbol}
                interval={tvWidgetInterval}
                themeMode={themeMode}
                height="100%"
                studies={tvStudies}
                className="h-full w-full"
                onSwitchToSmc={() => setMarketSubTab('smc')}
              />
            </div>

            {/* Compact Technical Confluence Strip */}
            {smartSummary && (
              <div
                className={
                  isChartFullScreen
                    ? 'hidden sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-2 shrink-0'
                    : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1'
                }
              >
                <div className="vp-glass-card rounded-2xl px-3.5 py-2.5">
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

                <div className="vp-glass-card rounded-2xl px-3.5 py-2.5">
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

                <div className="vp-glass-card rounded-2xl px-3.5 py-2.5">
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    MACD Hist
                  </span>
                  <span
                    className="block font-mono-tabular text-sm font-bold mt-0.5"
                    style={{ color: smartSummary.macdHist >= 0 ? 'var(--vp-bull)' : 'var(--vp-bear)' }}
                  >
                    {smartSummary.macdHist >= 0 ? '+' : ''}
                    {smartSummary.macdHist.toFixed(2)}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                    {smartSummary.macdHist >= 0 ? 'Bullish cross' : 'Bearish slope'}
                  </span>
                </div>

                <div className="vp-glass-card rounded-2xl px-3.5 py-2.5">
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

                <div className="vp-glass-card rounded-2xl px-3.5 py-2.5">
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    Support (S1)
                  </span>
                  <span className="block font-mono-tabular text-sm font-bold mt-0.5" style={{ color: 'var(--vp-bull)' }}>
                    ${formatPrice(smartSummary.supportS1)}
                  </span>
                  <span className="block text-[11px] font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
                    ATR: ${formatPrice(smartSummary.atr14)}
                  </span>
                </div>

                <div className="vp-glass-card rounded-2xl px-3.5 py-2.5">
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    Resistance (R1)
                  </span>
                  <span className="block font-mono-tabular text-sm font-bold mt-0.5" style={{ color: 'var(--vp-bear)' }}>
                    ${formatPrice(smartSummary.resistanceR1)}
                  </span>
                  <span className="block text-[11px] font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
                    EMA 9: ${formatPrice(smartSummary.ema9)}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Actionable BUY / SELL Analysis */}
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
                      : tvWidgetInterval === '30'
                        ? '30m'
                        : tvWidgetInterval === '60'
                          ? '1H'
                          : tvWidgetInterval === '240'
                            ? '4H'
                            : '1D'
              }
              summary={smartSummary}
              dataSourceLabel={
                liveCryptoBars && liveCryptoBars.length >= 20
                  ? 'Live Market OHLCV Candles'
                  : 'Live Spot-Anchored Technicals'
              }
            />
          )}
        </div>
      )}

      {/* 3 Separate Topic Boxes Below the Chart: AI Pattern Analysis, SMC & OMYE Guide, Chart Learning Academy */}
      <TerminalTopicBoxes
        telemetry={liveTelemetry}
        fallbackPairLabel={activeSymbolAsset?.displayPair ?? tvWidgetSymbol.replace(/^.*:/, '')}
        fallbackPrice={activeSymbolAsset?.livePrice ?? null}
        onNavigateTab={onNavigateTab}
      />

      {/* Compact Single-Row Live Markets Watchlist */}
      <LiveMarketWatchlist
        assets={marketAssets}
        selectedSymbol={tvWidgetSymbol}
        onSelectAsset={(asset) => {
          handleChooseSymbol(asset.tvSymbol);
          onOpenMarketDetails?.(asset);
        }}
      />

      <ChartSettingsModal
        isOpen={tvSettingsOpen}
        onClose={() => setTvSettingsOpen(false)}
        themeMode={themeMode}
        onChangeThemeMode={(mode) => onChangeThemeMode?.(mode)}
      />
    </div>
  );
};
