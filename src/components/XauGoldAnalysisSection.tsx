import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bell,
  BellRing,
  CheckCircle2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { buildXauGoldSeries } from '../data/forexData';
import { FONT_OPTIONS } from '../data/newsData';
import type { FontOptionId, TypographySettings } from '../types/news';
import { fetchRealXauGoldPrice } from '../utils/marketFeeds';
import {
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  computeSmartChartSummary,
  type CandleInput,
} from '../utils/technicalIndicators';
import { MarketTradeSuggestionCard } from './MarketTradeSuggestionCard';

interface XauGoldAnalysisSectionProps {
  typography: TypographySettings;
}

type XauTimeframe = '1M' | '3M' | '6M';
type IndicatorOverlay = 'all' | 'ema20' | 'sma50' | 'bollinger';

interface PriceAlert {
  id: string;
  condition: 'above' | 'below';
  targetPrice: number;
  note: string;
  status: 'active' | 'triggered';
  createdAt: string;
  triggeredAt?: string;
}

const ALERTS_STORAGE_KEY = 'vartapress_xau_alerts_v1';

const TIMEFRAME_DAYS: Record<XauTimeframe, number> = {
  '1M': 30,
  '3M': 65,
  '6M': 120,
};

function loadSavedAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PriceAlert[];
  } catch {
    return [];
  }
}

export const XauGoldAnalysisSection: React.FC<XauGoldAnalysisSectionProps> = ({
  typography,
}) => {
  const [timeframe, setTimeframe] = useState<XauTimeframe>('3M');
  const [overlay, setOverlay] = useState<IndicatorOverlay>('all');
  const [spotPrice, setSpotPrice] = useState<number>(2664.8);
  const [spotSource, setSpotSource] = useState<'live' | 'snapshot'>('snapshot');
  const [spotProvider, setSpotProvider] = useState<string>('Spot Snapshot');
  const [spotUpdatedAt, setSpotUpdatedAt] = useState<string>('Today');
  const [isRefreshingGold, setIsRefreshingGold] = useState<boolean>(false);
  const [isAutoTicking, setIsAutoTicking] = useState<boolean>(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hasEditedTarget, setHasEditedTarget] = useState<boolean>(false);

  // Target Price Alerts State
  const [alerts, setAlerts] = useState<PriceAlert[]>(loadSavedAlerts);
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [targetInput, setTargetInput] = useState<string>('2675.00');
  const [alertNote, setAlertNote] = useState<string>('Breakout Watch');
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return window.Notification.permission;
  });
  const [bannerAlert, setBannerAlert] = useState<string | null>(null);

  const getFontFamily = (id: FontOptionId) =>
    FONT_OPTIONS.find((f) => f.id === id)?.cssFamily ?? FONT_OPTIONS[0].cssFamily;

  const refreshGoldSpot = async () => {
    setIsRefreshingGold(true);
    const res = await fetchRealXauGoldPrice();
    setSpotPrice(res.priceUsd);
    setSpotSource(res.source);
    setSpotProvider(res.provider);
    setSpotUpdatedAt(res.updatedAt);
    if (!hasEditedTarget) {
      setTargetInput((res.priceUsd + 15).toFixed(2));
    }
    setIsRefreshingGold(false);
  };

  useEffect(() => {
    refreshGoldSpot();
  }, []);

  // Persist alerts
  useEffect(() => {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
    } catch {
      // ignore storage errors
    }
  }, [alerts]);

  // Optional live market tick simulation for testing or watching movement
  useEffect(() => {
    if (!isAutoTicking) return;
    const timer = setInterval(() => {
      setSpotPrice((prev) => {
        const step = (Math.random() - 0.46) * 6.5;
        return Number(Math.max(1500, Math.min(6000, prev + step)).toFixed(2));
      });
    }, 2200);
    return () => clearInterval(timer);
  }, [isAutoTicking]);

  // Evaluate active price alerts whenever spotPrice changes
  useEffect(() => {
    const nowTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const newlyTriggered: PriceAlert[] = [];
    const nextAlerts = alerts.map((a) => {
      if (a.status !== 'active') return a;
      const hit =
        (a.condition === 'above' && spotPrice >= a.targetPrice) ||
        (a.condition === 'below' && spotPrice <= a.targetPrice);
      if (!hit) return a;
      const updated: PriceAlert = {
        ...a,
        status: 'triggered',
        triggeredAt: nowTime,
      };
      newlyTriggered.push(updated);
      return updated;
    });

    if (newlyTriggered.length > 0) {
      setAlerts(nextAlerts);
      const first = newlyTriggered[0];
      const msg = `XAU/USD reached $${spotPrice.toFixed(2)} (${
        first.condition === 'above' ? 'above' : 'below'
      } target $${first.targetPrice.toFixed(2)})${first.note ? ` · ${first.note}` : ''}`;

      setBannerAlert(msg);

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        try {
          new window.Notification('XAU/USD Gold Price Alert', {
            body: msg,
          });
        } catch {
          // fallback banner is already active
        }
      }
    }
  }, [spotPrice, alerts]);

  const requestBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    try {
      const result = await window.Notification.requestPermission();
      setNotificationPermission(result);
    } catch {
      setNotificationPermission(window.Notification.permission);
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(targetInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'default'
    ) {
      await requestBrowserNotifications();
    }

    const hitImmediately =
      (alertCondition === 'above' && spotPrice >= parsed) ||
      (alertCondition === 'below' && spotPrice <= parsed);

    const newAlert: PriceAlert = {
      id: `xau-alert-${Date.now()}`,
      condition: alertCondition,
      targetPrice: Number(parsed.toFixed(2)),
      note: alertNote.trim() || 'Gold Target',
      status: hitImmediately ? 'triggered' : 'active',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      triggeredAt: hitImmediately
        ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : undefined,
    };

    setAlerts((prev) => [newAlert, ...prev]);

    if (hitImmediately) {
      const msg = `XAU/USD is already at $${spotPrice.toFixed(2)} (${alertCondition} $${parsed.toFixed(2)})`;
      setBannerAlert(msg);
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        try {
          new window.Notification('XAU/USD Gold Price Alert', { body: msg });
        } catch {
          // in-app banner handles fallback
        }
      }
    }
  };

  const series = useMemo(
    () => buildXauGoldSeries(TIMEFRAME_DAYS[timeframe], spotPrice),
    [timeframe, spotPrice]
  );

  const closes = useMemo(() => series.map((p) => p.rate), [series]);
  const ema20 = useMemo(() => calculateEMA(closes, 20), [closes]);
  const sma50 = useMemo(() => calculateSMA(closes, 50), [closes]);
  const bollinger = useMemo(() => calculateBollingerBands(closes, 20, 2), [closes]);
  const rsi14 = useMemo(() => calculateRSI(closes, 14), [closes]);
  const macd = useMemo(() => calculateMACD(closes), [closes]);

  const latestIdx = closes.length - 1;
  const latestEma20 = ema20[latestIdx] ?? spotPrice;
  const latestSma50 = sma50[latestIdx] ?? spotPrice;
  const latestRsi = rsi14[latestIdx] ?? 54.0;
  const latestMacdHist = macd.histogram[latestIdx] ?? 0;
  const latestBbUpper = bollinger.upper[latestIdx] ?? spotPrice + 25;
  const latestBbLower = bollinger.lower[latestIdx] ?? spotPrice - 25;

  const recentHigh = Math.max(...closes.slice(-20));
  const recentLow = Math.min(...closes.slice(-20));
  const pivot = (recentHigh + recentLow + spotPrice) / 3;
  const supportS1 = 2 * pivot - recentHigh;
  const resistanceR1 = 2 * pivot - recentLow;

  // Overall Technical Indicator Signal
  const bullishSignals =
    (spotPrice > latestEma20 ? 1 : 0) +
    (spotPrice > latestSma50 ? 1 : 0) +
    (latestMacdHist > 0 ? 1 : 0) +
    (latestRsi >= 50 && latestRsi < 70 ? 1 : 0);

  const compositeSignal =
    latestRsi >= 70
      ? 'Overbought Watch'
      : bullishSignals >= 3
        ? 'Strong Bullish'
        : bullishSignals === 2
          ? 'Bullish Momentum'
          : bullishSignals === 1
            ? 'Neutral Consolidation'
            : 'Bearish Pressure';

  const xauSmartSummary = useMemo(() => {
    const candles: CandleInput[] = series.map((pt, idx) => {
      const prevClose = idx > 0 ? series[idx - 1].rate : pt.rate * 0.999;
      const body = Math.abs(pt.rate - prevClose);
      const pad = Math.max(body * 0.45, pt.rate * 0.0012);
      return {
        open: prevClose,
        high: Math.max(prevClose, pt.rate) + pad,
        low: Math.min(prevClose, pt.rate) - pad,
        close: pt.rate,
        vol: 40 + ((idx * 17) % 60),
      };
    });
    return computeSmartChartSummary(candles);
  }, [series]);

  // SVG Chart Geometry
  const chartGeom = useMemo(() => {
    const width = 760;
    const height = 340;
    const padX = 16;
    const padY = 20;

    const allVals = [
      ...closes,
      ...(overlay === 'all' || overlay === 'bollinger'
        ? (bollinger.upper.filter((v) => v !== null) as number[])
        : []),
      ...(overlay === 'all' || overlay === 'bollinger'
        ? (bollinger.lower.filter((v) => v !== null) as number[])
        : []),
    ];
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const span = maxVal - minVal || 10;

    const toY = (val: number) =>
      height - padY - ((val - minVal) / span) * (height - padY * 2);
    const toX = (i: number) =>
      padX + (i / Math.max(1, closes.length - 1)) * (width - padX * 2);

    const buildPath = (arr: (number | null)[]) => {
      let path = '';
      arr.forEach((v, idx) => {
        if (v === null) return;
        const cmd = path === '' ? 'M' : 'L';
        path += `${cmd} ${toX(idx).toFixed(1)} ${toY(v).toFixed(1)} `;
      });
      return path.trim();
    };

    const pricePath = buildPath(closes);
    const emaPath = buildPath(ema20);
    const smaPath = buildPath(sma50);
    const bbUpperPath = buildPath(bollinger.upper);
    const bbLowerPath = buildPath(bollinger.lower);

    return {
      width,
      height,
      minVal,
      maxVal,
      toX,
      toY,
      pricePath,
      emaPath,
      smaPath,
      bbUpperPath,
      bbLowerPath,
    };
  }, [closes, ema20, sma50, bollinger, overlay]);

  const activePointIdx = hoveredIdx !== null ? hoveredIdx : latestIdx;
  const activePrice = closes[activePointIdx] ?? spotPrice;
  const activeDate = series[activePointIdx]?.date ?? '';
  const activeRsi = rsi14[activePointIdx] ?? latestRsi;

  const activeAlertsCount = alerts.filter((a) => a.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Triggered Alert Banner */}
      {bannerAlert && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm"
          style={{
            backgroundColor: 'var(--vp-primary)',
            color: 'var(--vp-primary-fg)',
            borderColor: 'var(--vp-primary)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <BellRing className="h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <span className="block text-xs font-bold uppercase tracking-wider opacity-90">
                Price Target Triggered
              </span>
              <span className="block text-sm font-semibold truncate">{bannerAlert}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBannerAlert(null)}
            className="min-h-[38px] rounded-xl bg-black/20 px-3 text-xs font-semibold cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Row: XAU Chart + Indicators (8 cols) & Target Price Alert Studio (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* XAU/USD Gold Chart + Indicators */}
        <section
          aria-label="XAU/USD Gold Technical Chart"
          className="lg:col-span-8 flex flex-col justify-between rounded-2xl border p-5 space-y-4"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold" style={{ color: 'var(--vp-muted)' }}>
                <Activity className="h-4 w-4" style={{ color: 'var(--vp-accent)' }} />
                <span>XAU / USD · Spot Gold (oz)</span>
                <span aria-hidden="true">·</span>
                <span style={{ color: 'var(--vp-primary)' }}>{compositeSignal}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {spotSource === 'live' ? `Live (${spotProvider} · ${spotUpdatedAt})` : `${spotProvider}`}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
                <span className="font-mono-tabular text-3xl sm:text-4xl font-bold">
                  ${activePrice.toFixed(2)}
                </span>
                <span className="text-xs font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
                  {activeDate} · RSI(14): {activeRsi.toFixed(1)} · Troy Oz (USD)
                </span>
              </div>
            </div>

            {/* Live Simulation & Timeframe Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={refreshGoldSpot}
                disabled={isRefreshingGold}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingGold ? 'animate-spin' : ''}`} />
                <span>Real Price</span>
              </button>

              <div className="flex items-center gap-1 rounded-xl border p-1" style={{ borderColor: 'var(--vp-border)', backgroundColor: 'var(--vp-elevated)' }}>
                <button
                  type="button"
                  onClick={() => setSpotPrice((p) => Number((p - 8).toFixed(2)))}
                  title="Simulate -$8 price drop"
                  className="min-h-[34px] rounded-lg px-2 text-xs font-mono-tabular font-semibold cursor-pointer"
                >
                  -$8
                </button>
                <button
                  type="button"
                  onClick={() => setIsAutoTicking((t) => !t)}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: isAutoTicking ? 'var(--vp-primary)' : 'var(--vp-surface)',
                    color: isAutoTicking ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                  }}
                >
                  {isAutoTicking ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  <span>{isAutoTicking ? 'Live Ticks' : 'Auto Tick'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSpotPrice((p) => Number((p + 8).toFixed(2)))}
                  title="Simulate +$8 price rally"
                  className="min-h-[34px] rounded-lg px-2 text-xs font-mono-tabular font-semibold cursor-pointer"
                >
                  +$8
                </button>
              </div>

              <div
                className="flex items-center gap-1 rounded-xl p-1"
                style={{ backgroundColor: 'var(--vp-elevated)' }}
              >
                {(['1M', '3M', '6M'] as XauTimeframe[]).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className="min-h-[34px] rounded-lg px-2.5 text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor: timeframe === tf ? 'var(--vp-primary)' : 'transparent',
                      color: timeframe === tf ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                    }}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Indicator Overlay Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'All Indicators' },
                  { id: 'ema20', label: 'EMA 20' },
                  { id: 'sma50', label: 'SMA 50' },
                  { id: 'bollinger', label: 'Bollinger (20,2)' },
                ] as { id: IndicatorOverlay; label: string }[]
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOverlay(item.id)}
                  className="min-h-[34px] rounded-xl border px-3 text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: overlay === item.id ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                    color: overlay === item.id ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                    borderColor: overlay === item.id ? 'var(--vp-primary)' : 'var(--vp-border)',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-[11px] font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
              <span>Spot</span>
              <span style={{ color: '#f59e0b' }}>EMA 20</span>
              <span style={{ color: '#06b6d4' }}>SMA 50</span>
              <span>BB Bands</span>
            </div>
          </div>

          {/* Main SVG Chart */}
          <div className="relative w-full">
            <svg
              viewBox={`0 0 ${chartGeom.width} ${chartGeom.height}`}
              className="w-full h-80 sm:h-[380px] overflow-visible"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {[0.2, 0.5, 0.8].map((ratio) => (
                <line
                  key={ratio}
                  x1={16}
                  x2={chartGeom.width - 16}
                  y1={chartGeom.height * ratio}
                  y2={chartGeom.height * ratio}
                  stroke="var(--vp-border)"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Active Target Alert Dashed Lines */}
              {alerts
                .filter((a) => a.status === 'active')
                .map((alertItem) => {
                  if (
                    alertItem.targetPrice < chartGeom.minVal ||
                    alertItem.targetPrice > chartGeom.maxVal
                  ) {
                    return null;
                  }
                  const y = chartGeom.toY(alertItem.targetPrice);
                  return (
                    <g key={alertItem.id}>
                      <line
                        x1={16}
                        x2={chartGeom.width - 16}
                        y1={y}
                        y2={y}
                        stroke="var(--vp-accent)"
                        strokeWidth="1.5"
                        strokeDasharray="6 4"
                      />
                      <text
                        x={chartGeom.width - 18}
                        y={y - 5}
                        textAnchor="end"
                        fill="var(--vp-accent)"
                        fontSize="10"
                        fontWeight="700"
                      >
                        Alert ${alertItem.targetPrice.toFixed(0)}
                      </text>
                    </g>
                  );
                })}

              {(overlay === 'all' || overlay === 'bollinger') && (
                <>
                  <path
                    d={chartGeom.bbUpperPath}
                    fill="none"
                    stroke="var(--vp-muted)"
                    strokeOpacity="0.45"
                    strokeWidth="1.25"
                    strokeDasharray="3 3"
                  />
                  <path
                    d={chartGeom.bbLowerPath}
                    fill="none"
                    stroke="var(--vp-muted)"
                    strokeOpacity="0.45"
                    strokeWidth="1.25"
                    strokeDasharray="3 3"
                  />
                </>
              )}

              {(overlay === 'all' || overlay === 'sma50') && (
                <path
                  d={chartGeom.smaPath}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="1.8"
                />
              )}

              {(overlay === 'all' || overlay === 'ema20') && (
                <path
                  d={chartGeom.emaPath}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                />
              )}

              <path
                d={chartGeom.pricePath}
                fill="none"
                stroke="var(--vp-primary)"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Active Point Marker */}
              <circle
                cx={chartGeom.toX(activePointIdx)}
                cy={chartGeom.toY(activePrice)}
                r={5}
                fill="var(--vp-primary)"
                stroke="var(--vp-surface)"
                strokeWidth="2"
              />

              {closes.map((_, idx) => {
                const colW = chartGeom.width / Math.max(1, closes.length);
                return (
                  <rect
                    key={idx}
                    x={chartGeom.toX(idx) - colW / 2}
                    y={0}
                    width={colW}
                    height={chartGeom.height}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onClick={() => setHoveredIdx(idx)}
                  />
                );
              })}
            </svg>
          </div>

          {/* Best Indicator Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
            {[
              {
                label: 'EMA (20)',
                value: `$${latestEma20.toFixed(2)}`,
                note: spotPrice >= latestEma20 ? 'Above trend' : 'Below trend',
              },
              {
                label: 'SMA (50)',
                value: `$${latestSma50.toFixed(2)}`,
                note: spotPrice >= latestSma50 ? 'Med support' : 'Resistance',
              },
              {
                label: 'RSI (14)',
                value: `${latestRsi.toFixed(1)}`,
                note:
                  latestRsi >= 70
                    ? 'Overbought (>70)'
                    : latestRsi <= 30
                      ? 'Oversold (<30)'
                      : 'Balanced zone',
              },
              {
                label: 'MACD (12,26,9)',
                value: `${latestMacdHist >= 0 ? '+' : ''}${latestMacdHist.toFixed(2)}`,
                note: latestMacdHist >= 0 ? 'Bullish hist' : 'Bearish hist',
              },
              {
                label: 'Pivot S1 / R1',
                value: `$${supportS1.toFixed(0)} / $${resistanceR1.toFixed(0)}`,
                note: '20d key levels',
              },
              {
                label: 'Bollinger Range',
                value: `$${latestBbLower.toFixed(0)}–$${latestBbUpper.toFixed(0)}`,
                note: '20-period 2σ band',
              },
            ].map((ind) => (
              <div
                key={ind.label}
                className="rounded-xl border p-3"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
                  {ind.label}
                </span>
                <span className="block font-mono-tabular text-sm font-bold mt-0.5">
                  {ind.value}
                </span>
                <span className="block text-[11px] mt-0.5" style={{ color: 'var(--vp-muted)' }}>
                  {ind.note}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Target Price Alert Creator & Saved Alerts Panel */}
        <aside
          aria-label="XAU Gold Target Price Alerts"
          className="lg:col-span-4 flex flex-col justify-between rounded-2xl border p-5 space-y-4"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Bell className="h-4 w-4" style={{ color: 'var(--vp-primary)' }} />
                  <span>XAU Price Alerts</span>
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--vp-muted)' }}>
                  Set a target price to trigger a local browser notification
                </p>
              </div>
              <span className="font-mono-tabular text-xs font-semibold" style={{ color: 'var(--vp-primary)' }}>
                {activeAlertsCount} active
              </span>
            </div>

            {/* Browser Notification Permission Bar */}
            <div
              className="flex items-center justify-between gap-2 rounded-xl border p-3 text-xs"
              style={{
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {notificationPermission === 'granted' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--vp-accent)' }} />
                )}
                <span className="truncate font-medium">
                  {notificationPermission === 'granted'
                    ? 'Browser notifications enabled'
                    : notificationPermission === 'denied'
                      ? 'Blocked in browser (in-app active)'
                      : notificationPermission === 'unsupported'
                        ? 'In-app alerts active'
                        : 'Enable browser notifications'}
                </span>
              </div>
              {notificationPermission === 'default' && (
                <button
                  type="button"
                  onClick={requestBrowserNotifications}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer shrink-0"
                  style={{
                    backgroundColor: 'var(--vp-primary)',
                    color: 'var(--vp-primary-fg)',
                  }}
                >
                  Allow
                </button>
              )}
            </div>

            {/* Create Alert Form */}
            <form onSubmit={handleCreateAlert} className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1" style={{ backgroundColor: 'var(--vp-elevated)' }}>
                <button
                  type="button"
                  onClick={() => setAlertCondition('above')}
                  className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: alertCondition === 'above' ? 'var(--vp-primary)' : 'transparent',
                    color: alertCondition === 'above' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                  }}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>Rises Above</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAlertCondition('below')}
                  className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: alertCondition === 'below' ? 'var(--vp-primary)' : 'transparent',
                    color: alertCondition === 'below' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
                  }}
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  <span>Drops Below</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="xau-target-input" className="block text-xs font-semibold mb-1">
                    Target ($/oz)
                  </label>
                  <input
                    id="xau-target-input"
                    type="number"
                    step="0.1"
                    min="100"
                    value={targetInput}
                    onChange={(e) => {
                      setHasEditedTarget(true);
                      setTargetInput(e.target.value);
                    }}
                    className="w-full min-h-[42px] rounded-xl border px-3 font-mono-tabular text-sm font-bold outline-none"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor: 'var(--vp-border)',
                      color: 'var(--vp-text)',
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="xau-alert-note" className="block text-xs font-semibold mb-1">
                    Label
                  </label>
                  <input
                    id="xau-alert-note"
                    type="text"
                    maxLength={28}
                    value={alertNote}
                    onChange={(e) => setAlertNote(e.target.value)}
                    placeholder="Resistance hit"
                    className="w-full min-h-[42px] rounded-xl border px-3 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor: 'var(--vp-border)',
                      color: 'var(--vp-text)',
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--vp-primary)',
                  color: 'var(--vp-primary-fg)',
                }}
              >
                <Plus className="h-4 w-4" />
                <span>Set Target Price Alert</span>
              </button>
            </form>

            {/* Saved Alerts List */}
            <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
              {alerts.length === 0 ? (
                <p className="text-xs py-2" style={{ color: 'var(--vp-muted)' }}>
                  No alerts set yet. Set a target above or below ${spotPrice.toFixed(2)} and use Auto Tick or +$8 / -$8 to test notification triggers.
                </p>
              ) : (
                alerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-xl border p-3"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor:
                        a.status === 'triggered' ? 'var(--vp-accent)' : 'var(--vp-border)',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <span className="font-mono-tabular">
                          {a.condition === 'above' ? '>=' : '<='} ${a.targetPrice.toFixed(2)}
                        </span>
                        <span
                          className="text-[11px] font-semibold"
                          style={{
                            color: a.status === 'triggered' ? 'var(--vp-accent)' : 'var(--vp-primary)',
                          }}
                        >
                          {a.status === 'triggered' ? `Triggered ${a.triggeredAt ?? ''}` : 'Active'}
                        </span>
                      </div>
                      <span className="block text-[11px] truncate" style={{ color: 'var(--vp-muted)' }}>
                        {a.note} · Set {a.createdAt}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {a.status === 'triggered' && (
                        <button
                          type="button"
                          title="Re-arm alert"
                          onClick={() =>
                            setAlerts((prev) =>
                              prev.map((item) =>
                                item.id === a.id
                                  ? { ...item, status: 'active', triggeredAt: undefined }
                                  : item
                              )
                            )
                          }
                          className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg cursor-pointer"
                          style={{ color: 'var(--vp-primary)' }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Delete price alert"
                        onClick={() =>
                          setAlerts((prev) => prev.filter((item) => item.id !== a.id))
                        }
                        className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Live Gold Market Analysis & BUY / SELL Suggestion */}
      {xauSmartSummary && (
        <MarketTradeSuggestionCard
          pairLabel="XAU/USD Gold"
          timeframeLabel={timeframe}
          summary={xauSmartSummary}
          dataSourceLabel={spotSource === 'live' ? `${spotProvider} (${spotUpdatedAt})` : spotProvider}
        />
      )}
    </div>
  );
};
