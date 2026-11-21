import React from 'react';
import { Clapperboard, TrendingUp, Users } from 'lucide-react';
import type { AppTab } from '../types/news';

interface BottomThumbNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
}

const MOBILE_TABS: { id: AppTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'shorts', label: 'Shorts', icon: Clapperboard },
  { id: 'forex', label: 'Markets', icon: TrendingUp },
  { id: 'social', label: 'Social', icon: Users },
];

export const BottomThumbNav: React.FC<BottomThumbNavProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md md:hidden"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--vp-surface) 92%, transparent)',
        borderColor: 'var(--vp-border)',
      }}
    >
      <div className="grid grid-cols-3 items-center h-[58px]">
        {MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-0.5 transition-colors cursor-pointer"
              style={{
                color: isActive ? 'var(--vp-primary)' : 'var(--vp-muted)',
              }}
            >
              <Icon className="h-[19px] w-[19px] shrink-0" />
              <span className="text-[10px] font-medium tracking-tight whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
