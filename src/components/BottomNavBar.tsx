import React from 'react';
import { CandlestickChart, GraduationCap, Newspaper } from 'lucide-react';
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
      className={`${alwaysVisible ? '' : 'md:hidden '}fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-xl pb-[env(safe-area-inset-bottom)] transition-colors duration-200`}
      style={{
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
      }}
    >
      <div className="grid grid-cols-3 h-16 items-center">
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
                color: isActive ? 'var(--vp-accent-text)' : 'var(--vp-muted)',
              }}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-[2px] w-10 rounded-b-full shadow-[0_0_10px_rgba(245,158,11,0.6)]"
                  style={{ backgroundColor: 'var(--vp-primary)' }}
                />
              )}
              <Icon className="h-[22px] w-[22px]" />
              <span className="text-[11px] font-semibold tracking-tight whitespace-nowrap leading-none">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
