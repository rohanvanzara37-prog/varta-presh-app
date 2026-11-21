import React, { useEffect, useRef } from 'react';
import type { ThemeMode } from '../types/news';
import { attachTradingViewLinkGuard } from '../utils/tradingViewLinkGuard';

interface TradingViewTickerTapeProps {
  themeMode: ThemeMode;
}

export const TradingViewTickerTape: React.FC<TradingViewTickerTapeProps> = ({ themeMode }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const detachGuard = attachTradingViewLinkGuard(container);

    container.innerHTML = '';
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [
        { proName: 'BINANCE:BTCUSDT', title: 'Bitcoin (BTC/USDT)' },
        { proName: 'BINANCE:ETHUSDT', title: 'Ethereum (ETH/USDT)' },
        { proName: 'OANDA:XAUUSD', title: 'Gold (XAU/USD)' },
        { proName: 'OANDA:XAGUSD', title: 'Silver (XAG/USD)' },
        { proName: 'BINANCE:SOLUSDT', title: 'Solana (SOL/USDT)' },
        { proName: 'BINANCE:BNBUSDT', title: 'BNB (BNB/USDT)' },
      ],
      showSymbolLogo: true,
      isTransparent: false,
      displayMode: 'adaptive',
      colorTheme: themeMode === 'dark' ? 'dark' : 'light',
      locale: 'en',
    });
    container.appendChild(script);

    return () => {
      detachGuard();
      container.innerHTML = '';
    };
  }, [themeMode]);

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border"
      style={{
        backgroundColor: 'var(--vp-surface)',
        borderColor: 'var(--vp-border)',
      }}
    >
      <div ref={containerRef} className="tradingview-widget-container w-full min-h-[46px]" />
    </div>
  );
};
