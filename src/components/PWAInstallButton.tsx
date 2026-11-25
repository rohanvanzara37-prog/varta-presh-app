import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="vp-pill-btn inline-flex min-h-[36px] items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
        style={{
          backgroundColor: 'var(--vp-surface)',
          borderColor: 'var(--vp-border)',
          color: 'var(--vp-text)',
        }}
      >
        <Download className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="vp-pill-btn inline-flex min-h-[36px] items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
            color: 'var(--vp-text)',
          }}
        >
          <Smartphone className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
          <span>Install</span>
        </button>

        {showGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Install TREDAURA on iOS"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
            onClick={() => setShowGuide(false)}
          >
            <div
              className="vp-glass-card vp-modal-in w-full max-w-sm rounded-2xl p-5 space-y-3"
              style={{
                color: 'var(--vp-text)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Install TREDAURA on iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="p-1.5 rounded-lg cursor-pointer"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--vp-muted)' }}>
                1. Tap the <strong>Share</strong> icon in Safari.<br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
              </p>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
