import React from 'react';
import { Bell, BellOff, ChevronDown, LogIn, LogOut } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AppTab, TypographySettings } from '../types/news';
import { formatUsd } from '../utils/demoAccount';
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
  demoEquity: number;
  demoFloatingPnl: number;
  onOpenDemoDrawer: () => void;
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
  pushPermission,
  pushEnabled,
  onTogglePush,
  firebaseUser,
  isSigningIn = false,
  onSignIn,
  onSignOut,
  demoEquity,
  demoFloatingPnl,
  onOpenDemoDrawer,
}) => {
  const alertsActive = pushPermission === 'granted' && pushEnabled;
  const pnlColor =
    demoFloatingPnl > 0.005 ? '#089981' : demoFloatingPnl < -0.005 ? '#F23645' : '#131722';

  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-[#FFFFFF]/95 backdrop-blur-xl transition-colors duration-200">
      <div className="mx-auto flex h-[50px] md:h-[56px] max-w-7xl items-center justify-between gap-2 lg:gap-6 px-2.5 sm:px-6">
        {/* Zone 1: TREDAURA Brand Logo + Geometric Gold-Emerald Bull-Bar Icon */}
        <button
          type="button"
          onClick={() => onSelectTab('terminal')}
          className="inline-flex items-center gap-2 text-sm sm:text-base md:text-lg font-extrabold tracking-tight text-[#131722] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#F59E0B] focus-visible:outline-offset-4 rounded-md transition-colors"
        >
          <TredauraMark className="h-6 w-6 sm:h-7 sm:w-7 shrink-0" />
          <span className="tracking-[-0.02em]">TREDAURA</span>
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
                className="relative py-2 whitespace-nowrap shrink-0 transition-colors duration-200 cursor-pointer hover:text-[#131722]"
                style={{
                  color: isActive ? '#131722' : '#64748B',
                }}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[11px] h-[2px] rounded-full bg-[#089981]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Top-Right Demo Pill + Compact Utility Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Paper Demo Account Pill (100% TREDAURA original, zero third-party logos) */}
          <button
            type="button"
            onClick={onOpenDemoDrawer}
            aria-label={`Open Demo Account Panel (${formatUsd(demoEquity)})`}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F8FAFC] px-2.5 sm:px-3 text-[11px] sm:text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap shrink-0 transition-colors"
          >
            <span className="rounded bg-[#ECFDF5] border border-[#089981]/30 px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-wide text-[#089981]">
              DEMO
            </span>
            <span className="text-[#E5E7EB]" aria-hidden="true">
              |
            </span>
            <span className="font-mono-tabular font-bold" style={{ color: pnlColor }}>
              {formatUsd(demoEquity)}
            </span>
            <ChevronDown className="h-3 w-3 text-[#64748B]" />
          </button>

          <button
            type="button"
            onClick={onTogglePush}
            aria-label={alertsActive ? 'Disable push price alerts' : 'Enable push price alerts'}
            title={alertsActive ? 'Alerts On' : 'Enable Alerts'}
            className="vp-pill-btn hidden xs:inline-flex sm:inline-flex min-h-[32px] items-center gap-1.5 border px-2 sm:px-3 text-xs font-semibold cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: alertsActive ? 'rgba(245, 158, 11, 0.12)' : '#F8FAFC',
              borderColor: alertsActive ? '#F59E0B' : '#E5E7EB',
              color: alertsActive ? '#B45309' : '#131722',
            }}
          >
            {alertsActive ? (
              <>
                <Bell className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Alerts On</span>
              </>
            ) : (
              <>
                <BellOff className="h-3.5 w-3.5 text-[#64748B]" />
                <span className="hidden lg:inline">Alerts</span>
              </>
            )}
          </button>

          <div className="hidden sm:block">
            <PWAInstallButton />
          </div>

          {firebaseUser ? (
            <button
              type="button"
              onClick={onSignOut}
              title={`Signed in as ${firebaseUser.email ?? 'User'} — Sign out`}
              className="vp-pill-btn inline-flex min-h-[32px] items-center gap-1.5 border border-[#E5E7EB] bg-[#F8FAFC] px-2 sm:px-3 text-xs font-semibold text-[#131722] cursor-pointer whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5 text-[#64748B]" />
              <span className="hidden md:inline max-w-[80px] truncate">
                {firebaseUser.displayName?.split(' ')[0] ?? 'Synced'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isSigningIn}
              onClick={onSignIn}
              className="vp-pill-btn inline-flex min-h-[32px] items-center gap-1 bg-[#131722] hover:bg-[#1E293B] disabled:opacity-60 px-2.5 sm:px-3.5 text-xs font-bold text-[#FFFFFF] shadow-xs cursor-pointer whitespace-nowrap"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isSigningIn ? 'Signing in...' : 'Sync'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
