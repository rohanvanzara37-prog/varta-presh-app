import React from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import type { AppTab, TypographySettings } from '../types/news';
import { formatUsd } from '../utils/demoAccount';

interface HeaderNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  typography?: TypographySettings;
  demoEquity: number;
  demoFloatingPnl: number;
  openPositionsCount?: number;
  onOpenDemoDrawer: () => void;
  onRefreshCharts?: () => void;
  isRefreshingCharts?: boolean;
}

const NAV_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'ai', label: 'AI' },
  { id: 'news', label: 'News' },
  { id: 'academy', label: 'Academy' },
];

export const TredauraMark: React.FC<{ className?: string }> = ({ className = 'h-7 w-7' }) => (
  <img
    src="/logo.png"
    alt="TREDAURA Logo"
    className={`${className} rounded-full object-cover border border-[#089981]/40 shadow-xs`}
    style={{ width: '28px', height: '28px', borderRadius: '50%' }}
  />
);

export const HeaderNav: React.FC<HeaderNavProps> = ({
  activeTab,
  onSelectTab,
  demoEquity,
  demoFloatingPnl,
  openPositionsCount = 0,
  onOpenDemoDrawer,
  onRefreshCharts,
  isRefreshingCharts = false,
}) => {
  const pnlColor =
    demoFloatingPnl > 0.005 ? '#10B981' : demoFloatingPnl < -0.005 ? '#F43F5E' : 'var(--vp-text)';

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--vp-border)] bg-[var(--vp-surface)] shadow-[var(--vp-card-shadow)] backdrop-blur-xl transition-colors duration-200">
      <div className="mx-auto flex h-[50px] md:h-[56px] max-w-7xl items-center justify-between gap-1.5 lg:gap-6 px-2 sm:px-6 overflow-hidden">
        {/* Zone 1: TREDAURA Brand Logo */}
        <button
          type="button"
          onClick={() => onSelectTab('terminal')}
          className="inline-flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base md:text-lg font-extrabold tracking-tight text-[var(--vp-text)] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F59E0B] focus-visible:outline-offset-4 rounded-md transition-colors"
        >
          <TredauraMark className="h-6 w-6 sm:h-7 sm:w-7 shrink-0" />
          <span className="font-display font-extrabold tracking-wide text-[#F59E0B]">TREDAURA</span>
        </button>

        {/* Zone 2: Clean Single-Line Desktop Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-bold"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className="relative py-2 whitespace-nowrap shrink-0 transition-colors duration-200 cursor-pointer hover:text-[#F59E0B]"
                style={{
                  color: isActive ? '#F59E0B' : 'var(--vp-text)',
                }}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[11px] h-[2px] rounded-full bg-[#F59E0B]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Clean Header Utility Bar — Live PnL Pill, Demo Balance Pill, Chart Refresh Icon ONLY */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
          {/* Live PnL Pill */}
          <button
            type="button"
            onClick={onOpenDemoDrawer}
            title={`Open Trades: ${openPositionsCount} · Floating PnL`}
            className="inline-flex min-h-[28px] sm:min-h-[30px] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors shadow-sm"
            style={{
              borderColor:
                demoFloatingPnl > 0.005
                  ? 'rgba(16,185,129,0.7)'
                  : demoFloatingPnl < -0.005
                    ? 'rgba(244,63,94,0.7)'
                    : 'var(--vp-border)',
              backgroundColor:
                demoFloatingPnl > 0.005
                  ? 'rgba(16,185,129,0.16)'
                  : demoFloatingPnl < -0.005
                    ? 'rgba(244,63,94,0.16)'
                    : 'var(--vp-surface)',
              color: pnlColor,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: openPositionsCount > 0 ? pnlColor : 'var(--vp-text)' }}
            />
            <span>{openPositionsCount > 0 ? `${openPositionsCount}T` : 'PnL'}</span>
            <span className="font-mono-tabular font-bold">{formatUsd(demoFloatingPnl, true)}</span>
          </button>

          {/* Paper Demo Balance Pill (Opens Account Dropdown/Drawer) */}
          <button
            type="button"
            onClick={onOpenDemoDrawer}
            aria-label={`Open Demo Account Panel (${formatUsd(demoEquity)})`}
            className="inline-flex min-h-[30px] sm:min-h-[32px] items-center gap-1 rounded-full border border-[var(--vp-border)] bg-[var(--vp-surface)] hover:border-[#F59E0B] px-2 sm:px-3 text-[10.5px] sm:text-xs font-bold shadow-sm cursor-pointer whitespace-nowrap shrink-0 transition-colors"
          >
            <span className="hidden xs:inline rounded bg-[#F59E0B]/15 border border-[#F59E0B]/55 px-1 py-0.5 text-[9px] font-extrabold tracking-wide text-[#F59E0B]">
              DEMO
            </span>
            <span className="font-mono-tabular font-bold" style={{ color: pnlColor }}>
              {formatUsd(demoEquity)}
            </span>
            <ChevronDown className="h-3 w-3 text-[var(--vp-text)]" />
          </button>

          {/* Chart Data Refresh Icon ONLY (Never resets demo balance or closes trades) */}
          {onRefreshCharts && (
            <button
              type="button"
              onClick={onRefreshCharts}
              title="Reload live chart data"
              aria-label="Reload live chart data"
              className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-[var(--vp-border)] bg-[var(--vp-surface)] hover:border-[#F59E0B] text-[var(--vp-text)] cursor-pointer shadow-sm transition-colors shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingCharts ? 'animate-spin text-[#F59E0B]' : ''}`} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
