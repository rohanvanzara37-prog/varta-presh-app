import React from 'react';
import type { AppLang, AppView } from '../types/social';
import { UI_COPY } from '../data/socialPresets';

interface SocialHeaderProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onOpenComposer: () => void;
  lang: AppLang;
}

const NAV_ITEMS: AppView[] = ['feed', 'friends', 'groups', 'watch', 'messenger'];

export const SocialHeader: React.FC<SocialHeaderProps> = ({
  activeView,
  onSelectView,
  onOpenComposer,
  lang,
}) => {
  const t = UI_COPY[lang];

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-[#242526] border-b border-[#CED0D4] dark:border-[#3E4042]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onSelectView('feed')}
          className="font-display text-2xl font-extrabold tracking-tight text-[#1877F2] dark:text-[#2D88FF] whitespace-nowrap shrink-0 cursor-pointer"
        >
          MitraBook
        </button>

        <nav className="hidden md:flex items-center gap-6" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => onSelectView(item)}
                className={`min-h-[44px] px-2 text-sm font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#1877F2] dark:text-[#2D88FF] border-[#1877F2] dark:border-[#2D88FF]'
                    : 'text-[#65676B] dark:text-[#B0B3B8] border-transparent hover:text-[#050505] dark:hover:text-[#E4E6EB]'
                }`}
              >
                {t[item]}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenComposer}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            {t.createPost}
          </button>
        </div>
      </div>
    </header>
  );
};
