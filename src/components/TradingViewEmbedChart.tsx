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
}) {
  const isDark = params.themeMode === 'dark';
  const bg = isDark ? '#0B0E11' : '#FFFFFF';
  const grid = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.06)';

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
    hide_top_toolbar: false,
    hide_side_toolbar: false,
    allow_symbol_change: true,
    save_image: false,
    container_id: params.containerId,
    studies: params.studies,
    overrides: {
      'paneProperties.background': bg,
      'paneProperties.vertGridProperties.color': grid,
      'paneProperties.horzGridProperties.color': grid,
      'mainSeriesProperties.candleStyle.upColor': '#00C087',
      'mainSeriesProperties.candleStyle.downColor': '#F6465D',
      'mainSeriesProperties.candleStyle.borderUpColor': '#00C087',
      'mainSeriesProperties.candleStyle.borderDownColor': '#F6465D',
      'mainSeriesProperties.candleStyle.wickUpColor': '#00C087',
      'mainSeriesProperties.candleStyle.wickDownColor': '#F6465D',
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
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
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
  }, [symbol, interval, themeMode, studiesKey, containerId]);

  return (
    <div
      className={`tradingview-widget-container relative w-full overflow-hidden rounded-xl border ${className}`}
      style={{
        height: resolvedHeight,
        width: '100%',
        borderColor: 'var(--vp-border)',
        backgroundColor: themeMode === 'dark' ? '#0B0E11' : 'var(--vp-surface)',
      }}
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
        </div>
      )}
      <div
        id={containerId}
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
