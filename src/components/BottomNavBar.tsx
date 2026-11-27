import React from 'react';
import { CandlestickChart, GraduationCap, Newspaper, Sparkles } from 'lucide-react';
import type { AppTab } from '../types/news';

interface BottomNavBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  alwaysVisible?: boolean;
}

const TABS: {
  id: AppTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'terminal', label: 'Terminal', Icon: CandlestickChart },
  { id: 'ai', label: 'AI Suite', Icon: Sparkles },
  { id: 'news', label: 'News', Icon: Newspaper },
  { id: 'academy', label: 'Academy', Icon: GraduationCap },
];

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onSelectTab,
  alwaysVisible = false,
}) => {
  return (
    <nav
      aria-label="Primary bottom navigation"
      className={`${alwaysVisible ? '' : 'md:hidden '}fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-xl pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(0,0,0,0.65)] transition-colors duration-200`}
      style={{
        backgroundColor: 'var(--vp-surface)',
        borderColor: 'var(--vp-border)',
      }}
    >
      <div className="grid grid-cols-4 h-16 items-center">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              aria-current={isActive ? 'page' : undefined}
              className="relative min-h-[48px] h-full flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-200 active:scale-95"
              style={{
                color: isActive ? '#F59E0B' : 'var(--vp-text)',
              }}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-[2.5px] w-10 rounded-b-full shadow-[0_0_12px_rgba(245,158,11,0.75)]"
                  style={{ backgroundColor: '#F59E0B' }}
                />
              )}
              <Icon className="h-[22px] w-[22px]" />
              <span className="text-[11px] font-bold tracking-tight whitespace-nowrap leading-none">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
