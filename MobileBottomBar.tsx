import React from 'react';
import { Home, Users, MessageCircle, Layers, User } from 'lucide-react';
import type { AppLang, AppView } from '../types/social';
import { UI_COPY } from '../data/socialPresets';

interface MobileBottomBarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  lang: AppLang;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  activeView,
  onSelectView,
  lang,
}) => {
  const t = UI_COPY[lang];
  const tabs: { id: AppView; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'feed', label: t.feed, Icon: Home },
    { id: 'friends', label: t.friends, Icon: Users },
    { id: 'messenger', label: t.messenger, Icon: MessageCircle },
    { id: 'groups', label: t.groups, Icon: Layers },
    { id: 'profile', label: t.profile, Icon: User },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#242526]/95 backdrop-blur-md border-t border-[#CED0D4] dark:border-[#3E4042]"
    >
      <div className="grid grid-cols-5 h-14 items-center">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectView(id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                isActive
                  ? 'text-[#1877F2] dark:text-[#2D88FF]'
                  : 'text-[#65676B] dark:text-[#B0B3B8]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
