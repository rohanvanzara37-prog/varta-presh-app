import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ThemeMode } from '../types/news';
import { attachTradingViewLinkGuard } from '../utils/tradingViewLinkGuard';

interface TradingViewEmbedChartProps {
  symbol?: string;
  interval?: string;
  themeMode: ThemeMode;
  height?: number | string;
  studies?: string[];
  className?: string;
  containerId?: string;
  onSwitchToSmc?: () => void;
}

const DEFAULT_STUDIES = [
  'MASimple@tv-basicstudies',
  'RSI@tv-basicstudies',
];

function buildWidgetConfig(params: {
  symbol: string;
  interval: string;
  themeMode: ThemeMode;
  studies: string[];
  containerId: string;
  showTvToolbar: boolean;
  showTopToolbar: boolean;
}) {
  const isDark = params.themeMode === 'dark';
  const bg = isDark ? '#0B0E14' : '#FFFFFF';
  const grid = isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(15, 23, 42, 0.05)';

  return {
    autosize: true,
    symbol: params.symbol,
    interval: params.interval,
    timezone: 'Asia/Kolkata',
    theme: isDark ? 'dark' : 'light',
    style: '1',
    locale: 'en',
    enable_publishing: false,
    backgroundColor: bg,
    gridColor: grid,
    hide_top_toolbar: !params.showTopToolbar,
    hide_side_toolbar: !params.showTvToolbar,
    allow_symbol_change: true,
    save_image: false,
    container_id: params.containerId,
    studies: params.studies,
    overrides: {
      'paneProperties.background': bg,
      'paneProperties.vertGridProperties.color': grid,
      'paneProperties.horzGridProperties.color': grid,
      'mainSeriesProperties.candleStyle.upColor': '#089981',
      'mainSeriesProperties.candleStyle.downColor': '#F23645',
      'mainSeriesProperties.candleStyle.borderUpColor': '#089981',
      'mainSeriesProperties.candleStyle.borderDownColor': '#F23645',
      'mainSeriesProperties.candleStyle.wickUpColor': '#089981',
      'mainSeriesProperties.candleStyle.wickDownColor': '#F23645',
    },
  };
}

export const TradingViewEmbedChart: React.FC<TradingViewEmbedChartProps> = ({
  symbol = 'OANDA:XAUUSD',
  interval = '15',
  themeMode,
  height = 500,
  studies = DEFAULT_STUDIES,
  className = '',
  containerId = 'tv_chart_container',
  onSwitchToSmc,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showTvToolbar, setShowTvToolbar] = useState(false);
  const [showTopToolbar, setShowTopToolbar] = useState(true);
  const studiesKey = studies.join('|');
  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  useEffect(() => {
    const detachGuard = attachTradingViewLinkGuard(containerRef.current);
    let cancelled = false;
    setLoaded(false);
    setFailed(false);

    const mountWidget = () => {
      if (cancelled || !containerRef.current) return;
      if (!window.TradingView?.widget) {
        setFailed(true);
        return;
      }

      containerRef.current.innerHTML = '';
      try {
        new window.TradingView.widget(
          buildWidgetConfig({
            symbol,
            interval,
            themeMode,
            studies,
            containerId,
            showTvToolbar,
            showTopToolbar,
          })
        );
        setLoaded(true);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    };

    if (window.TradingView?.widget) {
      mountWidget();
      return () => {
        cancelled = true;
        detachGuard();
        if (containerRef.current) containerRef.current.innerHTML = '';
      };
    }

    const existingScript = document.getElementById('tradingview-tv-js') as HTMLScriptElement | null;
    if (existingScript) {
      const onLoad = () => mountWidget();
      const onError = () => {
        if (!cancelled) setFailed(true);
      };
      existingScript.addEventListener('load', onLoad);
      existingScript.addEventListener('error', onError);
      const timer = window.setTimeout(() => {
        if (!window.TradingView?.widget && !cancelled) setFailed(true);
      }, 6500);
      return () => {
        cancelled = true;
        detachGuard();
        window.clearTimeout(timer);
        existingScript.removeEventListener('load', onLoad);
        existingScript.removeEventListener('error', onError);
      };
    }

    const script = document.createElement('script');
    script.id = 'tradingview-tv-js';
    script.src = 'https://s3.tradingview.com/tv.js';
    script.type = 'text/javascript';
    script.async = true;
    script.onload = () => mountWidget();
    script.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    document.head.appendChild(script);

    const guardTimer = window.setTimeout(() => {
      if (!window.TradingView?.widget && !cancelled) setFailed(true);
    }, 6500);

    return () => {
      cancelled = true;
      detachGuard();
      window.clearTimeout(guardTimer);
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [symbol, interval, themeMode, studiesKey, containerId, showTvToolbar, showTopToolbar]);

  return (
    <div
      className={`tradingview-widget-container vp-glass-card relative flex flex-col w-full overflow-hidden rounded-2xl touch-pan-y ${className}`}
      style={{
        height: resolvedHeight,
        width: '100%',
        touchAction: 'pan-y',
        backgroundColor: themeMode === 'dark' ? '#0B0E14' : 'var(--vp-surface)',
      }}
    >
      {/* Slim Mobile Page-Scroll Grip + Toolbar Toggles */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-1.5 border-b shrink-0 touch-pan-y select-none"
        style={{
          touchAction: 'pan-y',
          borderColor: 'var(--vp-border)',
          backgroundColor: 'var(--vp-header)',
        }}
      >
        <div
          className="flex items-center gap-1.5 text-[10px] font-medium touch-pan-y"
          style={{ color: 'var(--vp-muted)' }}
        >
          <span aria-hidden="true" className="text-xs leading-none">
            ⇅
          </span>
          <span>Swipe bar to scroll page</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTopToolbar((v) => !v)}
            aria-pressed={showTopToolbar}
            aria-label="Toggle TradingView top toolbar"
            className="vp-pill-btn inline-flex items-center gap-1 border px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer"
            style={{
              backgroundColor: showTopToolbar ? 'rgba(8, 153, 129, 0.15)' : 'var(--vp-control)',
              borderColor: showTopToolbar ? 'var(--vp-bull)' : 'var(--vp-border)',
              color: showTopToolbar ? 'var(--vp-bull)' : 'var(--vp-muted)',
            }}
          >
            <span>Top Bar</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTvToolbar((v) => !v)}
            aria-pressed={showTvToolbar}
            aria-label="Toggle TradingView drawing toolbar"
            className="vp-pill-btn inline-flex items-center gap-1 border px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer"
            style={{
              backgroundColor: showTvToolbar ? 'rgba(245, 158, 11, 0.15)' : 'var(--vp-control)',
              borderColor: showTvToolbar ? 'var(--vp-primary)' : 'var(--vp-border)',
              color: showTvToolbar ? 'var(--vp-accent-text)' : 'var(--vp-text)',
            }}
          >
            <span>✏️ Draw Tools</span>
          </button>
        </div>
      </div>

      {/* TradingView Iframe Wrapper with pan-y touch fallback */}
      <div
        className="relative flex-1 min-h-0 w-full touch-pan-y"
        style={{ touchAction: 'pan-y' }}
      >
        {!loaded && !failed && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-2 text-xs pointer-events-none z-10"
            style={{ color: 'var(--vp-muted)' }}
          >
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading TradingView Chart ({symbol})...</span>
          </div>
        )}
        {failed && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs z-10"
            style={{ color: 'var(--vp-muted)' }}
          >
            <span>TradingView chart could not load in this browser context.</span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  if (window.TradingView?.widget && containerRef.current) {
                    containerRef.current.innerHTML = '';
                    new window.TradingView.widget(
                      buildWidgetConfig({
                        symbol,
                        interval,
                        themeMode,
                        studies,
                        containerId,
                        showTvToolbar,
                        showTopToolbar,
                      })
                    );
                    setLoaded(true);
                  }
                }}
                className="rounded-lg border px-3 py-1.5 font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              >
                Retry Chart
              </button>
              {onSwitchToSmc && (
                <button
                  type="button"
                  onClick={onSwitchToSmc}
                  className="rounded-lg border px-3 py-1.5 font-semibold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--vp-primary)',
                    borderColor: 'var(--vp-primary)',
                    color: 'var(--vp-primary-fg)',
                  }}
                >
                  Open SMC Live Chart
                </button>
              )}
            </div>
          </div>
        )}
        <div
          id={containerId}
          ref={containerRef}
          className="w-full h-full touch-pan-y"
          style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}
        />
      </div>
    </div>
  );
};

