import React, { memo } from 'react';
import type { MarketAsset } from '../types/news';

interface LiveMarketWatchlistProps {
  assets: MarketAsset[];
  selectedSymbol?: string;
  onSelectAsset: (asset: MarketAsset) => void;
}

function formatCompactPrice(val: number): string {
  if (val >= 1000) return val.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (val >= 10) return val.toFixed(2);
  return val.toFixed(4);
}

function getShortSymbol(pair: string): string {
  if (pair === 'XAU/USD' || pair === 'XAG/USD' || pair === 'S&P 500' || pair === 'US OIL') {
    return pair;
  }
  return pair.replace(/\/USD$/, '');
}

const LiveMarketWatchlistInner: React.FC<LiveMarketWatchlistProps> = ({
  assets,
  selectedSymbol,
  onSelectAsset,
}) => {
  if (assets.length === 0) return null;

  return (
    <section aria-label="Live Bullion, Crypto, Index & Oil Markets" className="w-full">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-h-[42px] py-0.5">
        {assets.map((asset) => {
          const up = asset.changePct24h >= 0;
          const isSelected = selectedSymbol === asset.tvSymbol;
          const isGold = asset.displayPair === 'XAU/USD';
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => onSelectAsset(asset)}
              className="vp-pill-btn inline-flex items-center gap-1.5 border px-3 py-1.5 text-[11px] leading-none whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                backgroundColor: isSelected ? 'var(--vp-elevated)' : 'var(--vp-surface)',
                borderColor: isSelected
                  ? 'var(--vp-primary)'
                  : isGold
                    ? 'rgba(245, 158, 11, 0.45)'
                    : 'var(--vp-border)',
                boxShadow: isSelected ? 'var(--vp-glow-gold)' : 'none',
              }}
            >
              <span className="font-bold text-[11px]">{getShortSymbol(asset.displayPair)}</span>
              <span className="font-mono-tabular font-semibold text-[11px]">
                ${formatCompactPrice(asset.livePrice)}
              </span>
              <span
                className="font-mono-tabular font-semibold text-[11px]"
                style={{ color: up ? 'var(--vp-bull)' : 'var(--vp-bear)' }}
              >
                {up ? '+' : ''}
                {asset.changePct24h.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const LiveMarketWatchlist = memo(LiveMarketWatchlistInner);
