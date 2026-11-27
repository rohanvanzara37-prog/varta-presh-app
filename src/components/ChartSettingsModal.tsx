import React, { useEffect } from 'react';
import { Moon, Settings, Sun, X } from 'lucide-react';
import type { ThemeMode } from '../types/news';

export interface ChartSettingsOverlays {
  showSupportResistance: boolean;
  onToggleSupportResistance: () => void;
  showPatterns: boolean;
  onTogglePatterns: () => void;
  showSwingLabels: boolean;
  onToggleSwingLabels: () => void;
  showBosChoch: boolean;
  onToggleBosChoch: () => void;
  showEma20: boolean;
  onToggleEma20: () => void;
  showEma50: boolean;
  onToggleEma50: () => void;
  showEma200: boolean;
  onToggleEma200: () => void;
  showBollinger: boolean;
  onToggleBollinger: () => void;
  showRsi: boolean;
  onToggleRsi: () => void;
  showVolumeProfile: boolean;
  onToggleVolumeProfile: () => void;
  showKeyLevels?: boolean;
  onToggleKeyLevels?: () => void;
  showLiquidityPools?: boolean;
  onToggleLiquidityPools?: () => void;
  showFibWaves?: boolean;
  onToggleFibWaves?: () => void;
  showGhostCandles?: boolean;
  onToggleGhostCandles?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
}

interface ChartSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  overlays?: ChartSettingsOverlays;
}

export const ChartSettingsModal: React.FC<ChartSettingsModalProps> = ({
  isOpen,
  onClose,
  themeMode,
  onChangeThemeMode,
  overlays,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isLight = themeMode === 'light';
  const nextTheme: ThemeMode = isLight ? 'dark' : 'light';

  const overlayItems = overlays
    ? [
        {
          label: 'Support / Resistance Lines',
          description: 'Includes touch-count strength badges',
          checked: overlays.showSupportResistance,
          onToggle: overlays.onToggleSupportResistance,
        },
        {
          label: 'Auto Chart Patterns & Harmonics',
          checked: overlays.showPatterns,
          onToggle: overlays.onTogglePatterns,
        },
        {
          label: 'Swing Labels (HH/HL/LH/LL)',
          checked: overlays.showSwingLabels,
          onToggle: overlays.onToggleSwingLabels,
        },
        {
          label: 'BOS / CHoCH & OB/FVG Mitigation',
          checked: overlays.showBosChoch,
          onToggle: overlays.onToggleBosChoch,
        },
        ...(overlays.onToggleKeyLevels
          ? [
              {
                label: 'Key Levels (PDH/PDL/Asian/VWAP/ORB)',
                description: 'Previous Day High/Low, Weekly Open, Session VWAP',
                checked: Boolean(overlays.showKeyLevels),
                onToggle: overlays.onToggleKeyLevels,
              },
            ]
          : []),
        ...(overlays.onToggleLiquidityPools
          ? [
              {
                label: 'Liquidity Heatmap & Stop-Hunt Pools',
                description: 'BSL/SSL equal highs/lows & Volume Spikes',
                checked: Boolean(overlays.showLiquidityPools),
                onToggle: overlays.onToggleLiquidityPools,
              },
            ]
          : []),
        ...(overlays.onToggleFibWaves
          ? [
              {
                label: 'Fibonacci 50% EQ, Time Zones & Elliott',
                description: 'Premium/Discount zones, (1)-(5) waves & Wyckoff',
                checked: Boolean(overlays.showFibWaves),
                onToggle: overlays.onToggleFibWaves,
              },
            ]
          : []),
        ...(overlays.onToggleGhostCandles
          ? [
              {
                label: 'AI Ghost Candles (What-If Path)',
                description: 'Projected primary target & invalidation curve',
                checked: Boolean(overlays.showGhostCandles),
                onToggle: overlays.onToggleGhostCandles,
              },
            ]
          : []),
        ...(overlays.onToggleGrid
          ? [
              {
                label: 'Chart Grid Lines',
                checked: overlays.showGrid !== false,
                onToggle: overlays.onToggleGrid,
              },
            ]
          : []),
        {
          label: 'EMA 20',
          checked: overlays.showEma20,
          onToggle: overlays.onToggleEma20,
        },
        {
          label: 'EMA 50',
          checked: overlays.showEma50,
          onToggle: overlays.onToggleEma50,
        },
        {
          label: 'EMA 200',
          checked: overlays.showEma200,
          onToggle: overlays.onToggleEma200,
        },
        {
          label: 'Bollinger Bands (20, 2)',
          checked: overlays.showBollinger,
          onToggle: overlays.onToggleBollinger,
        },
        {
          label: 'RSI (14)',
          checked: overlays.showRsi,
          onToggle: overlays.onToggleRsi,
        },
        {
          label: 'Volume Profile (VPVR + POC)',
          description: 'Side volume profile & POC for active timeframe',
          checked: overlays.showVolumeProfile,
          onToggle: overlays.onToggleVolumeProfile,
        },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chart Settings"
        className="vp-glass-card vp-modal-in w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          color: 'var(--vp-text)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3.5 border-b"
          style={{
            backgroundColor: 'var(--vp-header)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" style={{ color: 'var(--vp-accent-text)' }} />
            <h2 className="text-sm font-bold tracking-tight">Chart Settings</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Chart Settings"
            className="vp-pill-btn flex h-8 w-8 items-center justify-center border cursor-pointer"
            style={{
              backgroundColor: 'var(--vp-elevated)',
              borderColor: 'var(--vp-border)',
              color: 'var(--vp-muted)',
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Appearance / Theme Section */}
          <div className="space-y-2.5">
            <span
              className="block text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--vp-muted)' }}
            >
              Appearance
            </span>

            <div
              className="rounded-xl border p-3.5 space-y-3"
              style={{
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold">Theme</div>
                  <p className="text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                    {isLight ? 'Light / White Theme active (Default)' : 'Obsidian Dark Theme active'}
                  </p>
                </div>

                {/* Primary Theme Toggle Button */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isLight}
                  aria-label="Theme"
                  onClick={() => onChangeThemeMode(nextTheme)}
                  className="vp-pill-btn inline-flex min-h-[36px] items-center gap-2 border px-3.5 text-xs font-bold cursor-pointer shrink-0 shadow-[0_0_16px_rgba(245,158,11,0.25)]"
                  style={{
                    backgroundColor: 'var(--vp-primary)',
                    borderColor: 'var(--vp-primary)',
                    color: 'var(--vp-primary-fg)',
                  }}
                >
                  {isLight ? (
                    <>
                      <Sun className="h-3.5 w-3.5" />
                      <span>Light Theme</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-3.5 w-3.5" />
                      <span>Dark Theme</span>
                    </>
                  )}
                </button>
              </div>

              {/* Direct Dark / Light Theme Quick Selectors */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeThemeMode('dark')}
                  aria-pressed={!isLight}
                  className="vp-pill-btn flex items-center gap-2 border px-3 py-2 text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: !isLight ? 'var(--vp-surface)' : 'transparent',
                    borderColor: !isLight ? 'var(--vp-primary)' : 'var(--vp-border)',
                    color: !isLight ? 'var(--vp-accent-text)' : 'var(--vp-muted)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full border border-[#1E2433] bg-[#0B0E14] shrink-0"
                  />
                  <span>Dark Theme</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeThemeMode('light')}
                  aria-pressed={isLight}
                  className="vp-pill-btn flex items-center gap-2 border px-3 py-2 text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: isLight ? 'var(--vp-surface)' : 'transparent',
                    borderColor: isLight ? 'var(--vp-primary)' : 'var(--vp-border)',
                    color: isLight ? 'var(--vp-accent-text)' : 'var(--vp-muted)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full border border-[#CBD5E1] bg-white shrink-0"
                  />
                  <span>Light / White</span>
                </button>
              </div>
            </div>
          </div>

          {/* Chart Overlays & Technicals (when inside Live WS + Auto-Draw) */}
          {overlayItems.length > 0 && (
            <div className="space-y-2">
              <span
                className="block text-[11px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--vp-muted)' }}
              >
                Chart Overlays &amp; Indicators
              </span>

              <div
                className="rounded-xl border divide-y"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                {overlayItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="switch"
                    aria-checked={item.checked}
                    onClick={item.onToggle}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold cursor-pointer transition-colors text-left"
                    style={{ borderColor: 'var(--vp-border)' }}
                  >
                    <div className="min-w-0">
                      <span className="block">{item.label}</span>
                      {'description' in item && item.description && (
                        <span className="block text-[10px] font-normal" style={{ color: 'var(--vp-muted)' }}>
                          {item.description}
                        </span>
                      )}
                    </div>
                    <span
                      className="inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors shrink-0"
                      style={{
                        backgroundColor: item.checked ? 'var(--vp-primary)' : 'var(--vp-control)',
                      }}
                    >
                      <span
                        className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          item.checked ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
