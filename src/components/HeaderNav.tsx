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
  isSigningIn?: boolean;
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
  isSigningIn = false,
  onSignIn,
  onSignOut,
}) => {
  const alertsActive = pushPermission === 'granted' && pushEnabled;

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-xl transition-colors duration-200"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--vp-canvas) 88%, transparent)',
        borderColor: 'var(--vp-border)',
      }}
    >
      <div className="mx-auto flex h-[54px] md:h-[60px] max-w-7xl items-center justify-between gap-4 lg:gap-8 px-3 sm:px-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('terminal')}
          className="text-lg md:text-xl font-extrabold tracking-tight whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F59E0B] focus-visible:outline-offset-4 rounded-sm transition-colors"
          style={{ color: 'var(--vp-text)' }}
        >
          Varta Presh
        </button>

        {/* Zone 2: Clean Single-Line Desktop Navigation Links */}
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
                className="relative py-2 whitespace-nowrap shrink-0 transition-colors duration-200 cursor-pointer hover:text-[var(--vp-text)]"
                style={{
                  color: isActive ? 'var(--vp-accent-text)' : 'var(--vp-muted)',
                }}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[11px] h-[2px] rounded-full shadow-[0_0_10px_rgba(245,158,11,0.55)]"
                    style={{ backgroundColor: 'var(--vp-primary)' }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Compact Utility Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onTogglePush}
            aria-label={alertsActive ? 'Disable push price alerts' : 'Enable push price alerts'}
            title={alertsActive ? 'Alerts On' : 'Enable Alerts'}
            className="vp-pill-btn inline-flex min-h-[36px] items-center gap-1.5 border px-3 text-xs font-semibold cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: alertsActive ? 'rgba(245, 158, 11, 0.12)' : 'var(--vp-elevated)',
              borderColor: alertsActive ? 'var(--vp-primary)' : 'var(--vp-border)',
              color: alertsActive ? 'var(--vp-accent-text)' : 'var(--vp-text)',
            }}
          >
            {alertsActive ? (
              <>
                <Bell className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Alerts On</span>
              </>
            ) : (
              <>
                <BellOff className="h-3.5 w-3.5" style={{ color: 'var(--vp-muted)' }} />
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
              className="vp-pill-btn inline-flex min-h-[36px] items-center gap-1.5 border px-3 text-xs font-semibold cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
                color: 'var(--vp-text)',
              }}
            >
              <LogOut className="h-3.5 w-3.5" style={{ color: 'var(--vp-muted)' }} />
              <span className="hidden sm:inline max-w-[90px] truncate">
                {firebaseUser.displayName?.split(' ')[0] ?? 'Synced'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isSigningIn}
              onClick={onSignIn}
              className="vp-pill-btn inline-flex min-h-[36px] items-center gap-1.5 bg-[#F59E0B] hover:bg-[#FBBF24] disabled:opacity-60 px-3.5 text-xs font-bold text-[#0B0E14] shadow-[0_0_18px_rgba(245,158,11,0.24)] cursor-pointer whitespace-nowrap"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{isSigningIn ? 'Signing in...' : 'Sync'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
