import React from 'react';
import { CandlestickChart, GraduationCap, Newspaper } from 'lucide-react';
import type { AppTab } from '../types/news';

interface BottomNavBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
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

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav
      aria-label="Primary bottom navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#2B3139] bg-[#0B0E11]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
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
              className="relative min-h-[48px] h-full flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
              style={{
                color: isActive ? '#F0B90B' : '#848E9C',
              }}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-[2px] w-8 rounded-b-full bg-[#F0B90B]"
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
