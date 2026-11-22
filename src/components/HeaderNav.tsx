import React from 'react';
import { Bell, BellOff, LogIn, LogOut } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AppTab, TypographySettings } from '../types/news';
import type { PushPermissionState } from '../utils/pushNotifications';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  typography?: TypographySettings;
  pushPermission: PushPermissionState;
  pushEnabled: boolean;
  onTogglePush: () => void;
  firebaseUser: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'news', label: 'News' },
  { id: 'academy', label: 'Academy' },
];

export const HeaderNav: React.FC<HeaderNavProps> = ({
  activeTab,
  onSelectTab,
  pushPermission,
  pushEnabled,
  onTogglePush,
  firebaseUser,
  onSignIn,
  onSignOut,
}) => {
  const alertsActive = pushPermission === 'granted' && pushEnabled;

  return (
    <header className="sticky top-0 z-30 border-b border-[#2B3139] bg-[#0B0E11]/95 backdrop-blur-md">
      <div className="mx-auto flex h-[52px] md:h-[60px] max-w-7xl items-center justify-between gap-4 lg:gap-8 px-3 sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('terminal')}
          className="text-lg md:text-xl font-bold tracking-tight text-[#EAECEF] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F0B90B] focus-visible:outline-offset-4 rounded-sm"
        >
          Varta Presh
        </button>

        {/* Zone 2: 4 Clean Single-Line Desktop Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-semibold"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className="relative py-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                style={{
                  color: isActive ? '#F0B90B' : '#848E9C',
                }}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[11px] h-[2px] rounded-full bg-[#F0B90B]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Compact Non-Duplicate Utility Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onTogglePush}
            aria-label={alertsActive ? 'Disable push price alerts' : 'Enable push price alerts'}
            title={alertsActive ? 'Alerts On' : 'Enable Alerts'}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
            style={{
              backgroundColor: '#1E2329',
              borderColor: alertsActive ? '#F0B90B' : '#2B3139',
              color: alertsActive ? '#F0B90B' : '#EAECEF',
            }}
          >
            {alertsActive ? (
              <>
                <Bell className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Alerts On</span>
              </>
            ) : (
              <>
                <BellOff className="h-3.5 w-3.5 text-[#848E9C]" />
                <span className="hidden sm:inline">Alerts</span>
              </>
            )}
          </button>

          <PWAInstallButton />

          {firebaseUser ? (
            <button
              type="button"
              onClick={onSignOut}
              title={`Signed in as ${firebaseUser.email ?? 'User'} — Sign out`}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#1E2329] px-2.5 text-xs font-semibold text-[#EAECEF] cursor-pointer whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5 text-[#848E9C]" />
              <span className="hidden sm:inline max-w-[90px] truncate">
                {firebaseUser.displayName?.split(' ')[0] ?? 'Synced'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#F0B90B] px-3 text-xs font-bold text-[#0B0E11] cursor-pointer whitespace-nowrap"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sync</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
