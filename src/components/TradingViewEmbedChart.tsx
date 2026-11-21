import React, { useEffect, useRef } from 'react';
import type { ThemeMode } from '../types/news';

interface TradingViewEmbedChartProps {
  symbol: string;
  interval?: string;
  themeMode: ThemeMode;
  height?: number | string;
  studies?: string[];
  className?: string;
}

export const TradingViewEmbedChart: React.FC<TradingViewEmbedChartProps> = ({
  symbol,
  interval = '15',
  themeMode,
  height = 460,
  studies = ['STD;EMA', 'STD;RSI'],
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const studiesKey = studies.join('|');
  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Asia/Kolkata',
      theme: themeMode === 'dark' ? 'dark' : 'light',
      style: '1',
      locale: 'en',
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      calendar: false,
      studies,
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, interval, themeMode, studiesKey]);

  return (
    <div
      className={`tradingview-widget-container w-full overflow-hidden rounded-xl border ${className}`}
      ref={containerRef}
      style={{
        height: resolvedHeight,
        borderColor: 'var(--vp-border)',
        backgroundColor: 'var(--vp-surface)',
      }}
    />
  );
};
