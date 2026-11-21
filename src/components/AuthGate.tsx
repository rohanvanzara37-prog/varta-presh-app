import React, { useState } from 'react';
import { Globe, Moon, Sun, Users, MessageCircle, Camera } from 'lucide-react';
import { LOCAL_ASSETS } from '../data/socialPresets';
import type { AppLang } from '../types/social';

interface AuthGateProps {
  lang: AppLang;
  darkMode: boolean;
  onToggleLang: () => void;
  onToggleDark: () => void;
  onGoogleSignIn: () => Promise<void>;
  authError: string | null;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  lang,
  darkMode,
  onToggleLang,
  onToggleDark,
  onGoogleSignIn,
  authError,
}) => {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await onGoogleSignIn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] dark:bg-[#18191A] text-[#050505] dark:text-[#E4E6EB] flex flex-col justify-between">
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-8 pt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onToggleLang}
          className="min-h-[40px] px-3.5 py-2 rounded-lg bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042] text-sm font-medium flex items-center gap-2 hover:bg-[#E4E6EB]/50 dark:hover:bg-[#3A3B3C] transition-colors cursor-pointer"
        >
          <Globe className="w-4 h-4 text-[#1877F2]" />
          <span>{lang === 'hi' ? 'English' : 'हिन्दी'}</span>
        </button>
        <button
          type="button"
          onClick={onToggleDark}
          aria-label="Toggle theme"
          className="min-h-[40px] min-w-[40px] p-2 rounded-lg bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042] flex items-center justify-center hover:bg-[#E4E6EB]/50 dark:hover:bg-[#3A3B3C] transition-colors cursor-pointer"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#65676B]" />}
        </button>
      </div>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-[#1877F2] dark:text-[#2D88FF]">
              MitraBook
            </h1>
            <p className="text-xl sm:text-2xl font-medium text-[#050505] dark:text-[#E4E6EB] max-w-xl leading-snug text-balance">
              {lang === 'hi'
                ? 'अपने दोस्तों, परिवार और समुदायों से जुड़ें — रियल-टाइम पोस्ट, स्टोरीज़, ग्रुप्स और मैसेंजर चैट के साथ।'
                : 'Connect with friends, share life moments, join communities, and chat live in real time.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="rounded-xl overflow-hidden bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042]">
              <img
                src={LOCAL_ASSETS.coverCommunity}
                alt="Friends sharing tea on terrace"
                className="w-full h-36 object-cover"
              />
              <div className="p-3.5">
                <div className="flex items-center gap-2 text-xs text-[#65676B] dark:text-[#B0B3B8]">
                  <Users className="w-3.5 h-3.5 text-[#1877F2]" />
                  <span>{lang === 'hi' ? 'कम्युनिटी ग्रुप्स और दोस्त' : 'Friends & Communities'}</span>
                </div>
                <p className="mt-1 text-sm font-semibold">
                  {lang === 'hi' ? 'फोटो, स्टोरीज़ और लाइव रिएक्शन शेयर करें' : 'Share photos, stories & 6 reactions'}
                </p>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042]">
              <img
                src={LOCAL_ASSETS.travelHills}
                alt="Darjeeling sunrise travel moment"
                className="w-full h-36 object-cover"
              />
              <div className="p-3.5">
                <div className="flex items-center gap-2 text-xs text-[#65676B] dark:text-[#B0B3B8]">
                  <MessageCircle className="w-3.5 h-3.5 text-[#1877F2]" />
                  <span>{lang === 'hi' ? 'रियल-टाइम मैसेंजर' : 'Instant Messenger'}</span>
                </div>
                <p className="mt-1 text-sm font-semibold">
                  {lang === 'hi' ? 'सीधे दोस्तों के साथ लाइव चैट करें' : 'Real-time 1-on-1 chat synced to cloud'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042] p-6 sm:p-8 shadow-sm space-y-5">
            <div>
              <h2 className="font-display text-2xl font-bold">
                {lang === 'hi' ? 'MitraBook में लॉग इन करें' : 'Sign in to MitraBook'}
              </h2>
              <p className="mt-1.5 text-sm text-[#65676B] dark:text-[#B0B3B8]">
                {lang === 'hi'
                  ? 'अपने Google अकाउंट से 1 क्लिक में जुड़ें। आपकी पोस्ट्स, दोस्त और चैट सुरक्षित रहते हैं।'
                  : 'One-click sign-in with your Google account. Your profile, posts, friends, and Messenger sync automatically.'}
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {authError}
              </div>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={handleLogin}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 text-white font-semibold text-base flex items-center justify-center gap-3 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>
                {loading
                  ? lang === 'hi'
                    ? 'लॉग इन हो रहा है...'
                    : 'Signing in...'
                  : lang === 'hi'
                  ? 'Google से लॉग इन करें'
                  : 'Continue with Google'}
              </span>
            </button>

            <div className="pt-4 border-t border-[#CED0D4] dark:border-[#3E4042] grid grid-cols-3 gap-3 text-center text-xs text-[#65676B] dark:text-[#B0B3B8]">
              <div className="flex flex-col items-center gap-1">
                <Camera className="w-4 h-4 text-[#1877F2]" />
                <span>{lang === 'hi' ? 'फोटो व स्टोरीज़' : 'Photos & Stories'}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Users className="w-4 h-4 text-[#1877F2]" />
                <span>{lang === 'hi' ? 'फ्रेंड्स व ग्रुप्स' : 'Friends & Groups'}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <MessageCircle className="w-4 h-4 text-[#1877F2]" />
                <span>{lang === 'hi' ? 'लाइव मैसेंजर' : 'Live Messenger'}</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-5 text-xs text-[#65676B] dark:text-[#B0B3B8] flex flex-wrap items-center justify-between gap-2">
        <span>MitraBook © 2026</span>
        <span>{lang === 'hi' ? 'हिंदी और English दोनों में उपलब्ध' : 'Available in English & हिन्दी'}</span>
      </footer>
    </div>
  );
};
