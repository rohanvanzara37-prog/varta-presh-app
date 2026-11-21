import React from 'react';
import { FONT_OPTIONS } from '../data/newsData';
import type { AppTab, TypographySettings } from '../types/news';

interface HeaderNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  typography?: TypographySettings;
}

const NAV_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'forex', label: 'Markets' },
];

export const HeaderNav: React.FC<HeaderNavProps> = ({
  activeTab,
  onSelectTab,
  typography,
}) => {
  const headlineCss = typography
    ? FONT_OPTIONS.find((f) => f.id === typography.headlineFont)?.cssFamily
    : undefined;

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-md transition-colors"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--vp-surface) 90%, transparent)',
        borderColor: 'var(--vp-border)',
      }}
    >
      <div className="mx-auto flex h-[52px] md:h-16 max-w-7xl items-center justify-between gap-4 lg:gap-8 px-4 sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('forex')}
          className="text-xl md:text-2xl font-bold tracking-tight whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 rounded-sm cursor-pointer"
          style={{
            fontFamily: headlineCss,
            color: 'var(--vp-text)',
            outlineColor: 'var(--vp-primary)',
          }}
        >
          Varta Presh
        </button>

        {/* Zone 2: Single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-5 lg:gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className="relative py-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 rounded-sm"
                style={{
                  color: isActive ? 'var(--vp-primary)' : 'var(--vp-muted)',
                  outlineColor: 'var(--vp-primary)',
                }}
              >
                {item.label}
                {isActive && (
                  <span
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--vp-primary)' }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
