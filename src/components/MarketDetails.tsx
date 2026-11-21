import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellRing,
  CandlestickChart,
  Check,
  ChevronDown,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  MarketAsset,
  PriceAlertRecord,
  ThemeMode,
  TypographySettings,
} from '../types/news';
import { fetchBinanceKlines, type LiveCandleBar } from '../utils/marketFeeds';
import type { PushPermissionState } from '../utils/pushNotifications';
import {
  calculateBollingerBands,
  calculateEMA,
  calculateVWAP,
  computeSmartChartSummary,
} from '../utils/technicalIndicators';
import { MarketTradeSuggestionCard } from './MarketTradeSuggestionCard';

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => unknown;
    };
  }
}

export interface MarketDetailsProps {
  asset: MarketAsset;
  allAssets: MarketAsset[];
  onSelectAsset: (asset: MarketAsset) => void;
  onBack: () => void;
  themeMode: ThemeMode;
  typography: TypographySettings;
  watchlistSymbols: string[];
  onToggleWatchlist: (tvSymbol: string) => void;
  alerts: PriceAlertRecord[];
  onCreateAlert: (params: {
    symbol: string;
    displayPair: string;
    condition: 'above' | 'below';
    targetPrice: number;
  }) => Promise<void>;
  onDeleteAlert: (alertId: string) => Promise<void>;
  pushPermission: PushPermissionState;
  onRequestPushPermission: () => Promise<void>;
  onRefreshMarkets: () => void;
  isRefreshingMarkets: boolean;
}

const TV_INTERVALS = [
  { id: '1', label: '1m' },
  { id: '5', label: '5m' },
  { id: '15', label: '15m' },
  { id: '60', label: '1H' },
  { id: '240', label: '4H' },
  { id: 'D', label: '1D' },
  { id: 'W', label: '1W' },
] as const;

const CHART_STYLES = [
  { id: '1', label: 'Candles' },
  { id: '9', label: 'Hollow' },
  { id: '8', label: 'Heikin Ashi' },
] as const;

const INDICATOR_OPTIONS = [
  { id: 'MAExp@tv-basicstudies', label: 'EMA' },
  { id: 'RSI@tv-basicstudies', label: 'RSI' },
  { id: 'MACD@tv-basicstudies', label: 'MACD' },
  { id: 'BB@tv-basicstudies', label: 'Bollinger' },
  { id: 'VWAP@tv-basicstudies', label: 'VWAP' },
  { id: 'Stochastic@tv-basicstudies', label: 'Stoch' },
] as const;

function formatAssetPrice(val: number): string {
  if (val >= 1000) {
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (val >= 10) return val.toFixed(3);
  return val.toFixed(4);
}

function buildFallbackCandles(basePrice: number, seedKey: string, count = 42): LiveCandleBar[] {
  const seed = seedKey.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const bars: LiveCandleBar[] = [];
  let cursor = basePrice * 0.9965;
  const volScale = basePrice > 1000 ? basePrice * 0.0012 : basePrice * 0.0016;
  const now = Date.now();

  for (let i = count - 1; i >= 0; i -= 1) {
    const wave = Math.sin((i + seed) * 0.55) * 0.65 + Math.cos((i * 2 + seed) * 0.31) * 0.35;
    const open = cursor;
    const delta = wave * volScale;
    const close = i === 0 ? basePrice : Math.max(0.0001, open + delta);
    const high = Math.max(open, close) + Math.abs(Math.sin(i + seed)) * volScale * 0.7;
    const low = Math.max(0.0001, Math.min(open, close) - Math.abs(Math.cos(i + seed)) * volScale * 0.65);
    const t = new Date(now - i * 60_000);
    bars.push({
      timeLabel: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      open,
      high,
      low,
      close,
      vol: Math.round(25 + Math.abs(wave) * 65),
    });
    cursor = close;
  }
  return bars;
}

export const MarketDetails: React.FC<MarketDetailsProps> = ({
  asset,
  allAssets,
  onSelectAsset,
  onBack,
  themeMode,
  typography,
  watchlistSymbols,
  onToggleWatchlist,
  alerts,
  onCreateAlert,
  onDeleteAlert,
  pushPermission,
  onRequestPushPermission,
  onRefreshMarkets,
  isRefreshingMarkets,
}) => {
  const [interval, setInterval] = useState<string>('15');
  const [chartStyle, setChartStyle] = useState<string>('1');
  const [activeStudies, setActiveStudies] = useState<string[]>([
    'MAExp@tv-basicstudies',
    'RSI@tv-basicstudies',
    'VWAP@tv-basicstudies',
  ]);
  const [engineMode, setEngineMode] = useState<'tradingview' | 'native'>('tradingview');
  const [tvFailed, setTvFailed] = useState(false);
  const [nativeCandles, setNativeCandles] = useState<LiveCandleBar[]>([]);
  const [isLiveCandles, setIsLiveCandles] = useState(false);
  const [hoveredCandleIdx, setHoveredCandleIdx] = useState<number | null>(null);
  const [isChartFullScreen, setIsChartFullScreen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [visibleCandleCount, setVisibleCandleCount] = useState<number>(48);

  // Price Alert Form
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [alertTargetInput, setAlertTargetInput] = useState<string>(
    String(Number((asset.livePrice * 1.005).toFixed(asset.livePrice > 100 ? 2 : 4)))
  );
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState<string | null>(null);

  const containerIdRef = useRef(`tv_market_details_${Math.random().toString(36).slice(2, 9)}`);
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const chartSectionRef = useRef<HTMLElement | null>(null);
  const indicatorsMenuRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!indicatorsOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (indicatorsMenuRef.current && !indicatorsMenuRef.current.contains(e.target as Node)) {
        setIndicatorsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [indicatorsOpen]);

  // Reset suggested alert target when switching symbols
  useEffect(() => {
    const stepMultiplier = alertCondition === 'above' ? 1.005 : 0.995;
    const decimals = asset.livePrice >= 100 ? 2 : 4;
    setAlertTargetInput(String(Number((asset.livePrice * stepMultiplier).toFixed(decimals))));
    setAlertFeedback(null);
  }, [asset.tvSymbol, alertCondition]);

  // Load TradingView tv.js script and mount interactive candlestick widget
  useEffect(() => {
    if (engineMode !== 'tradingview') return;
    let cancelled = false;

    const mountWidget = () => {
      if (cancelled || !widgetContainerRef.current) return;
      if (!window.TradingView?.widget) {
        setTvFailed(true);
        return;
      }

      widgetContainerRef.current.innerHTML = '';
      try {
        new window.TradingView.widget({
          autosize: true,
          symbol: asset.tvSymbol,
          interval,
          timezone: 'Asia/Kolkata',
          theme: themeMode === 'dark' ? 'dark' : 'light',
          style: chartStyle,
          locale: 'en',
          enable_publishing: false,
          allow_symbol_change: true,
          hide_top_toolbar: false,
          hide_side_toolbar: true,
          withdateranges: true,
          details: true,
          hotlist: false,
          calendar: false,
          studies: activeStudies,
          container_id: containerIdRef.current,
        });
        setTvFailed(false);
      } catch {
        setTvFailed(true);
      }
    };

    if (window.TradingView?.widget) {
      mountWidget();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.getElementById('tradingview-tv-js') as HTMLScriptElement | null;
    if (existingScript) {
      const onLoad = () => mountWidget();
      const onError = () => {
        if (!cancelled) setTvFailed(true);
      };
      existingScript.addEventListener('load', onLoad);
      existingScript.addEventListener('error', onError);
      const timer = setTimeout(() => {
        if (!window.TradingView?.widget && !cancelled) setTvFailed(true);
      }, 6000);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        existingScript.removeEventListener('load', onLoad);
        existingScript.removeEventListener('error', onError);
      };
    }

    const script = document.createElement('script');
    script.id = 'tradingview-tv-js';
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => mountWidget();
    script.onerror = () => {
      if (!cancelled) setTvFailed(true);
    };
    document.head.appendChild(script);

    const guardTimer = setTimeout(() => {
      if (!window.TradingView?.widget && !cancelled) setTvFailed(true);
    }, 6500);

    return () => {
      cancelled = true;
      clearTimeout(guardTimer);
    };
  }, [asset.tvSymbol, interval, chartStyle, activeStudies, themeMode, engineMode]);

  // Load real Binance OHLCV candles for all BINANCE:* symbols or spot-anchored candles for Metals
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (asset.tvSymbol.startsWith('BINANCE:')) {
        const bars = await fetchBinanceKlines(asset.tvSymbol, interval, 60);
        if (!cancelled && bars && bars.length >= 15) {
          setNativeCandles(bars);
          setIsLiveCandles(true);
          return;
        }
      }
      if (!cancelled) {
        setIsLiveCandles(false);
        setNativeCandles(buildFallbackCandles(asset.livePrice, `${asset.tvSymbol}-${interval}`, 48));
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [asset.tvSymbol, asset.livePrice, interval]);

  const zoomedCandles = useMemo(() => {
    if (nativeCandles.length <= visibleCandleCount) return nativeCandles;
    return nativeCandles.slice(nativeCandles.length - visibleCandleCount);
  }, [nativeCandles, visibleCandleCount]);

  const smartSummary = useMemo(
    () => computeSmartChartSummary(nativeCandles),
    [nativeCandles]
  );

  const nativeGeometry = useMemo(() => {
    if (zoomedCandles.length < 4) return null;
    const width = 760;
    const height = 340;
    const padX = 24;
    const padY = 26;
    const closes = zoomedCandles.map((c) => c.close);
    const bb = calculateBollingerBands(closes, Math.min(20, closes.length), 2);
    const vwap = calculateVWAP(zoomedCandles);
    const highs = zoomedCandles.map((c) => c.high);
    const lows = zoomedCandles.map((c) => c.low);
    const bbUppers = bb.upper.filter((v): v is number => v !== null);
    const bbLowers = bb.lower.filter((v): v is number => v !== null);
    const minP = Math.min(...lows, ...bbLowers);
    const maxP = Math.max(...highs, ...bbUppers);
    const span = maxP - minP || maxP * 0.01 || 1;
    const ema = calculateEMA(closes, 9);

    const step = (width - padX * 2) / zoomedCandles.length;
    const toY = (price: number) => height - padY - ((price - minP) / span) * (height - padY * 2);

    const buildLine = (series: (number | null)[]) => {
      let started = false;
      return series
        .map((val, idx) => {
          if (val === null || !Number.isFinite(val)) return null;
          const x = padX + idx * step + step * 0.5;
          const y = toY(val);
          const cmd = started ? 'L' : 'M';
          started = true;
          return `${cmd} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .filter((seg): seg is string => seg !== null)
        .join(' ');
    };

    const emaPath = buildLine(ema);
    const vwapPath = buildLine(vwap);
    const bbUpperPath = buildLine(bb.upper);
    const bbLowerPath = buildLine(bb.lower);

    return { width, height, padX, step, minP, maxP, toY, emaPath, vwapPath, bbUpperPath, bbLowerPath };
  }, [zoomedCandles]);

  const toggleStudy = (studyId: string) => {
    setActiveStudies((prev) =>
      prev.includes(studyId) ? prev.filter((s) => s !== studyId) : [...prev, studyId]
    );
  };

  const isWatchlisted = watchlistSymbols.includes(asset.tvSymbol);
  const assetAlerts = alerts.filter((a) => a.symbol === asset.tvSymbol);
  const up24h = asset.changePct24h >= 0;

  const handleAlertSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(alertTargetInput);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric >= 10_000_000) {
      setAlertFeedback('Enter a valid target price.');
      return;
    }
    setAlertSaving(true);
    setAlertFeedback(null);
    try {
      await onCreateAlert({
        symbol: asset.tvSymbol,
        displayPair: asset.displayPair,
        condition: alertCondition,
        targetPrice: numeric,
      });
      setAlertFeedback(`Alert set: ${asset.displayPair} ${alertCondition} ${formatAssetPrice(numeric)}`);
    } catch {
      setAlertFeedback('Could not save price alert. Please sign in or retry.');
    } finally {
      setAlertSaving(false);
    }
  };

  const hoveredBar =
    hoveredCandleIdx !== null ? zoomedCandles[hoveredCandleIdx] : zoomedCandles[zoomedCandles.length - 1];

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 pb-24 md:pb-8">
      {/* Compact Single-Line Symbol Pills + Live Price + Watchlist */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap">
          {allAssets.slice(0, 9).map((item) => {
            const active = item.tvSymbol === asset.tvSymbol;
            return (
              <button
                key={item.tvSymbol}
                type="button"
                onClick={() => onSelectAsset(item)}
                className="min-h-[34px] rounded-lg border px-2.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                style={{
                  backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-surface)',
                  color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                  borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                }}
              >
                {item.displayPair}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
          <div className="flex items-baseline gap-2 font-mono-tabular text-sm">
            <span className="font-bold">${formatAssetPrice(asset.livePrice)}</span>
            <span
              className="inline-flex items-center gap-0.5 text-xs font-semibold"
              style={{ color: up24h ? '#10b981' : '#ef4444' }}
            >
              {up24h ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {up24h ? '+' : ''}
              {asset.changePct24h.toFixed(2)}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => onToggleWatchlist(asset.tvSymbol)}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold cursor-pointer shrink-0"
            style={{
              backgroundColor: isWatchlisted ? 'var(--vp-accent)' : 'var(--vp-surface)',
              color: isWatchlisted ? 'var(--vp-accent-fg)' : 'var(--vp-text)',
              borderColor: isWatchlisted ? 'var(--vp-accent)' : 'var(--vp-border)',
            }}
          >
            <Star className={`h-3.5 w-3.5 ${isWatchlisted ? 'fill-current' : ''}`} />
            <span>{isWatchlisted ? 'Saved' : 'Watch'}</span>
          </button>
        </div>
      </div>

      {/* Full-Width Chart Terminal at Top */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <section
          ref={chartSectionRef}
          aria-label="Interactive Candlestick Chart"
          className={
            isChartFullScreen
              ? 'fixed inset-0 z-[90] flex flex-col gap-2.5 p-3 sm:p-4 overflow-hidden'
              : 'lg:col-span-12 space-y-2.5'
          }
          style={isChartFullScreen ? { backgroundColor: 'var(--vp-surface)' } : undefined}
        >
          {/* Compact Single-Line Timeframe Pills + Collapsible Indicators + Mode/Zoom */}
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div
              className="flex items-center gap-1 rounded-lg border p-0.5 overflow-x-auto no-scrollbar flex-nowrap"
              style={{
                backgroundColor: 'var(--vp-surface)',
                borderColor: 'var(--vp-border)',
              }}
            >
              {TV_INTERVALS.map((tf) => {
                const active = interval === tf.id;
                return (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => setInterval(tf.id)}
                    className="min-h-[30px] rounded-md px-2.5 text-xs font-mono-tabular font-semibold cursor-pointer whitespace-nowrap shrink-0"
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

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="relative" ref={indicatorsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIndicatorsOpen((o) => !o)}
                  aria-expanded={indicatorsOpen}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: indicatorsOpen ? 'var(--vp-secondary)' : 'var(--vp-surface)',
                    borderColor: indicatorsOpen ? 'var(--vp-primary)' : 'var(--vp-border)',
                    color: 'var(--vp-text)',
                  }}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
                  <span>Indicators ({activeStudies.length})</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${indicatorsOpen ? 'rotate-180' : ''}`} />
                </button>

                {indicatorsOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 z-40 w-60 rounded-xl border p-3 shadow-xl space-y-2.5"
                    style={{
                      backgroundColor: 'var(--vp-surface)',
                      borderColor: 'var(--vp-border)',
                    }}
                  >
                    <div className="flex items-center gap-1">
                      {CHART_STYLES.map((st) => {
                        const active = chartStyle === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setChartStyle(st.id)}
                            className="flex-1 min-h-[28px] rounded-md border px-2 text-[11px] font-semibold cursor-pointer"
                            style={{
                              backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                              color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                              borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                            }}
                          >
                            {st.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--vp-border)' }}>
                      {INDICATOR_OPTIONS.map((ind) => {
                        const active = activeStudies.includes(ind.id);
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
                            <span>{ind.label}</span>
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
                onClick={() =>
                  setEngineMode((m) => (m === 'tradingview' ? 'native' : 'tradingview'))
                }
                className="hidden sm:inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--vp-surface)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>{engineMode === 'tradingview' ? 'Candles' : 'TradingView'}</span>
              </button>

              <button
                type="button"
                onClick={toggleFullScreen}
                aria-label={isChartFullScreen ? 'Exit full screen chart' : 'Zoom chart full screen'}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
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
            </div>
          </div>

          {/* TradingView Full-Width 450px Real-Time Widget OR Built-in Candlestick Fallback */}
          {engineMode === 'tradingview' && !tvFailed ? (
            <div
              className={`w-full overflow-hidden rounded-xl border ${isChartFullScreen ? 'flex-1 min-h-0' : ''}`}
              style={{
                borderColor: 'var(--vp-border)',
                height: isChartFullScreen ? '100%' : '450px',
              }}
            >
              <div
                id={containerIdRef.current}
                ref={widgetContainerRef}
                className="w-full h-full"
              />
            </div>
          ) : (
            <div
              className={`rounded-xl border p-4 flex flex-col gap-3 ${isChartFullScreen ? 'flex-1 min-h-0' : ''}`}
              style={{
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
              }}
              onWheel={(e) => {
                if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
                  setVisibleCandleCount((prev) =>
                    e.deltaY < 0 ? Math.max(12, prev - 4) : Math.min(nativeCandles.length || 42, prev + 4)
                  );
                }
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
                <div className="flex items-center gap-2 font-semibold">
                  <CandlestickChart className="h-4 w-4" style={{ color: 'var(--vp-primary)' }} />
                  <span>
                    Interactive Candlestick + EMA(9) · {asset.displayPair} ({interval})
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                        setVisibleCandleCount((c) => Math.min(nativeCandles.length || 42, c + 6))
                      }
                      aria-label="Zoom out candles"
                      className="p-1 rounded cursor-pointer"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleCandleCount(42)}
                      aria-label="Reset candle zoom"
                      className="p-1 rounded cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {hoveredBar && (
                    <div className="flex flex-wrap items-center gap-3 font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
                      <span>T: {hoveredBar.timeLabel}</span>
                      <span>O: {formatAssetPrice(hoveredBar.open)}</span>
                      <span>H: {formatAssetPrice(hoveredBar.high)}</span>
                      <span>L: {formatAssetPrice(hoveredBar.low)}</span>
                      <span className="font-bold" style={{ color: 'var(--vp-text)' }}>
                        C: {formatAssetPrice(hoveredBar.close)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {nativeGeometry && (
                <svg
                  viewBox={`0 0 ${nativeGeometry.width} ${nativeGeometry.height}`}
                  className={`w-full overflow-visible ${isChartFullScreen ? 'flex-1 min-h-0' : 'h-[460px] sm:h-[520px]'}`}
                  onMouseLeave={() => setHoveredCandleIdx(null)}
                >
                  {[0.2, 0.4, 0.6, 0.8].map((r) => (
                    <line
                      key={r}
                      x1={nativeGeometry.padX}
                      x2={nativeGeometry.width - nativeGeometry.padX}
                      y1={nativeGeometry.height * r}
                      y2={nativeGeometry.height * r}
                      stroke="var(--vp-border)"
                      strokeDasharray="4 4"
                    />
                  ))}

                  {zoomedCandles.map((bar, i) => {
                    const xCenter = nativeGeometry.padX + i * nativeGeometry.step + nativeGeometry.step * 0.5;
                    const bodyWidth = Math.max(4, nativeGeometry.step * 0.58);
                    const yHigh = nativeGeometry.toY(bar.high);
                    const yLow = nativeGeometry.toY(bar.low);
                    const yOpen = nativeGeometry.toY(bar.open);
                    const yClose = nativeGeometry.toY(bar.close);
                    const bullish = bar.close >= bar.open;
                    const color = bullish ? '#10b981' : '#ef4444';
                    const bodyTop = Math.min(yOpen, yClose);
                    const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
                    return (
                      <g
                        key={`${bar.timeLabel}-${i}`}
                        className="cursor-crosshair"
                        onMouseEnter={() => setHoveredCandleIdx(i)}
                      >
                        <line
                          x1={xCenter}
                          x2={xCenter}
                          y1={yHigh}
                          y2={yLow}
                          stroke={color}
                          strokeWidth="1.5"
                        />
                        <rect
                          x={xCenter - bodyWidth / 2}
                          y={bodyTop}
                          width={bodyWidth}
                          height={bodyHeight}
                          rx="1.5"
                          fill={color}
                        />
                      </g>
                    );
                  })}

                  {activeStudies.includes('BB@tv-basicstudies') && (
                    <>
                      <path
                        d={nativeGeometry.bbUpperPath}
                        fill="none"
                        stroke="var(--vp-muted)"
                        strokeOpacity="0.45"
                        strokeWidth="1.25"
                        strokeDasharray="3 3"
                      />
                      <path
                        d={nativeGeometry.bbLowerPath}
                        fill="none"
                        stroke="var(--vp-muted)"
                        strokeOpacity="0.45"
                        strokeWidth="1.25"
                        strokeDasharray="3 3"
                      />
                    </>
                  )}

                  {activeStudies.includes('VWAP@tv-basicstudies') && (
                    <path
                      d={nativeGeometry.vwapPath}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="1.75"
                      strokeDasharray="5 3"
                    />
                  )}

                  <path
                    d={nativeGeometry.emaPath}
                    fill="none"
                    stroke="var(--vp-accent)"
                    strokeWidth="2"
                  />
                </svg>
              )}

              {tvFailed && (
                <p className="text-xs shrink-0" style={{ color: 'var(--vp-muted)' }}>
                  Third-party TradingView script is blocked in this network; showing VartaPress built-in Candlestick + EMA(9) + VWAP + Bollinger terminal.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setTvFailed(false);
                      setEngineMode('tradingview');
                    }}
                    className="underline font-semibold cursor-pointer"
                    style={{ color: 'var(--vp-primary)' }}
                  >
                    Retry TradingView
                  </button>
                </p>
              )}
            </div>
          )}

          {/* Smart Indicator Confluence Summary */}
          {smartSummary && (
            <div className={isChartFullScreen ? 'hidden sm:grid grid-cols-5 gap-2.5 shrink-0' : 'grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1'}>
              {[
                {
                  label: 'Smart Rating',
                  value: smartSummary.rating,
                  sub: smartSummary.trendLabel,
                  color:
                    smartSummary.rating.includes('Buy')
                      ? '#10b981'
                      : smartSummary.rating.includes('Sell')
                        ? '#ef4444'
                        : 'var(--vp-accent)',
                },
                {
                  label: 'RSI (14)',
                  value: smartSummary.rsi14.toFixed(1),
                  sub: smartSummary.rsi14 >= 70 ? 'Overbought' : smartSummary.rsi14 <= 30 ? 'Oversold' : 'Neutral zone',
                },
                {
                  label: 'MACD Hist',
                  value: `${smartSummary.macdHist >= 0 ? '+' : ''}${smartSummary.macdHist.toFixed(2)}`,
                  sub: smartSummary.macdHist >= 0 ? 'Bullish momentum' : 'Bearish slope',
                  color: smartSummary.macdHist >= 0 ? '#10b981' : '#ef4444',
                },
                {
                  label: 'Support (S1)',
                  value: `$${formatAssetPrice(smartSummary.supportS1)}`,
                  sub: `VWAP $${formatAssetPrice(smartSummary.vwap)}`,
                  color: '#10b981',
                },
                {
                  label: 'Resistance (R1)',
                  value: `$${formatAssetPrice(smartSummary.resistanceR1)}`,
                  sub: `ATR $${formatAssetPrice(smartSummary.atr14)}`,
                  color: '#ef4444',
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                    {card.label}
                  </span>
                  <span
                    className="block font-mono-tabular text-sm font-bold mt-0.5"
                    style={{ color: card.color ?? 'var(--vp-text)' }}
                  >
                    {card.value}
                  </span>
                  <span className="block text-[11px] truncate mt-0.5" style={{ color: 'var(--vp-muted)' }}>
                    {card.sub}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Price Alerts & Push Notification Panel */}
        <aside
          className="lg:col-span-12 rounded-2xl border p-5 space-y-5"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <BellRing className="h-4 w-4" style={{ color: 'var(--vp-primary)' }} />
                <span>Price Alerts ({asset.displayPair})</span>
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--vp-muted)' }}>
                Instant push alerts saved to Firebase when {asset.displayPair} crosses your target.
              </p>
            </div>
          </div>

          {pushPermission !== 'granted' && (
            <button
              type="button"
              onClick={onRequestPushPermission}
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
                color: 'var(--vp-text)',
              }}
            >
              <Bell className="h-4 w-4" style={{ color: 'var(--vp-accent)' }} />
              <span>
                {pushPermission === 'denied'
                  ? 'Push Blocked in Browser Settings'
                  : 'Enable Browser Push Notifications'}
              </span>
            </button>
          )}

          <form onSubmit={handleAlertSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['above', 'below'] as const).map((cond) => {
                const active = alertCondition === cond;
                return (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => setAlertCondition(cond)}
                    className="min-h-[40px] rounded-xl border text-xs font-semibold uppercase tracking-wide cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                      color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                      borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                    }}
                  >
                    Crosses {cond}
                  </button>
                );
              })}
            </div>

            <div>
              <label htmlFor="alert-target-price" className="block text-xs font-semibold mb-1.5">
                Target Price ({asset.displayPair})
              </label>
              <input
                id="alert-target-price"
                type="number"
                step="any"
                min="0"
                value={alertTargetInput}
                onChange={(e) => setAlertTargetInput(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border px-3 font-mono-tabular text-sm font-bold outline-none"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={alertSaving}
              className="w-full min-h-[44px] rounded-xl font-semibold text-sm cursor-pointer transition-transform active:scale-[0.99]"
              style={{
                backgroundColor: 'var(--vp-primary)',
                color: 'var(--vp-primary-fg)',
              }}
            >
              {alertSaving ? 'Saving Alert...' : 'Set Push Price Alert'}
            </button>

            {alertFeedback && (
              <p className="text-xs font-medium" style={{ color: 'var(--vp-primary)' }}>
                {alertFeedback}
              </p>
            )}
          </form>

          {/* Active Alerts for this Asset */}
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--vp-border)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--vp-muted)' }}>
              Active Alerts ({assetAlerts.length})
            </h3>
            {assetAlerts.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--vp-muted)' }}>
                No alerts set for {asset.displayPair} yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {assetAlerts.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor: 'var(--vp-border)',
                    }}
                  >
                    <div>
                      <span className="font-bold block">
                        {item.displayPair} {item.condition === 'above' ? '≥' : '≤'}{' '}
                        <span className="font-mono-tabular">{formatAssetPrice(item.targetPrice)}</span>
                      </span>
                      <span className="text-[11px]" style={{ color: item.triggered ? '#10b981' : 'var(--vp-muted)' }}>
                        {item.triggered ? 'Triggered & Notified' : 'Monitoring Live'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteAlert(item.id)}
                      aria-label="Delete price alert"
                      className="p-1.5 rounded-lg cursor-pointer hover:opacity-80"
                      style={{ color: 'var(--vp-muted)' }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Perfect Market Analysis & Actionable BUY / SELL Suggestion */}
      {smartSummary && (
        <MarketTradeSuggestionCard
          pairLabel={asset.displayPair}
          timeframeLabel={TV_INTERVALS.find((t) => t.id === interval)?.label ?? interval}
          summary={smartSummary}
          dataSourceLabel={
            isLiveCandles ? 'Live Binance OHLCV Candles' : 'Live Spot-Anchored Technicals'
          }
        />
      )}
    </div>
  );
};
