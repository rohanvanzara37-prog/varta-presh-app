import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, LogIn, LogOut, Moon, Sun, TrendingUp } from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { BottomThumbNav } from './components/BottomThumbNav';
import { ForexMarketView } from './components/ForexMarketView';
import { HeaderNav } from './components/HeaderNav';
import { LiveTvView } from './components/LiveTvView';
import { MarketDetails } from './components/MarketDetails';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ShortsFeedView } from './components/ShortsFeedView';
import { SocialCommunityView } from './components/SocialCommunityView';
import { ThemePaletteStudio } from './components/ThemePaletteStudio';
import {
  DEFAULT_TYPOGRAPHY,
  INITIAL_MESSAGES,
  PRESET_PALETTES,
} from './data/newsData';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './firebase';
import type {
  AppTab,
  ColorPalette,
  MarketAsset,
  NewsMessage,
  PriceAlertRecord,
  TypographySettings,
} from './types/news';
import { getContrastText } from './utils/colorContrast';
import { fetchAllLiveMarkets } from './utils/marketFeeds';
import {
  getPushPermission,
  requestPushPermission,
  sendPushNotification,
  type PushPermissionState,
} from './utils/pushNotifications';

const STORAGE_KEYS = {
  palette: 'vp_active_palette_v2',
  customPalettes: 'vp_custom_palettes_v2',
  typography: 'vp_typography_v2',
  watchlist: 'vp_watchlist_symbols_v1',
  localAlerts: 'vp_local_price_alerts_v1',
  pushEnabled: 'vp_push_alerts_enabled_v1',
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatShortMarketPrice(asset: MarketAsset): string {
  if (asset.livePrice >= 1000) {
    return asset.livePrice.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  if (asset.livePrice >= 10) return asset.livePrice.toFixed(2);
  return asset.livePrice.toFixed(4);
}

const DEFAULT_MARKET_ASSETS: MarketAsset[] = [
  {
    id: 'xauusd',
    tvSymbol: 'OANDA:XAUUSD',
    displayPair: 'XAU/USD',
    name: 'Gold Spot (Troy Oz)',
    category: 'Metals',
    livePrice: 2664.8,
    changePct24h: 0.64,
    provider: 'Spot Snapshot',
    unitLabel: 'oz',
  },
  {
    id: 'xagusd',
    tvSymbol: 'OANDA:XAGUSD',
    displayPair: 'XAG/USD',
    name: 'Silver Spot (Troy Oz)',
    category: 'Metals',
    livePrice: 31.42,
    changePct24h: 0.42,
    provider: 'Spot Snapshot',
    unitLabel: 'oz',
  },
  {
    id: 'btcusd',
    tvSymbol: 'BINANCE:BTCUSDT',
    displayPair: 'BTC/USD',
    name: 'Bitcoin',
    category: 'Crypto',
    livePrice: 91850,
    changePct24h: 1.84,
    provider: 'Spot Snapshot',
  },
  {
    id: 'ethusd',
    tvSymbol: 'BINANCE:ETHUSDT',
    displayPair: 'ETH/USD',
    name: 'Ethereum',
    category: 'Crypto',
    livePrice: 3145.5,
    changePct24h: 1.21,
    provider: 'Spot Snapshot',
  },
  {
    id: 'solusd',
    tvSymbol: 'BINANCE:SOLUSDT',
    displayPair: 'SOL/USD',
    name: 'Solana',
    category: 'Crypto',
    livePrice: 218.4,
    changePct24h: 2.75,
    provider: 'Spot Snapshot',
  },
  {
    id: 'bnbusd',
    tvSymbol: 'BINANCE:BNBUSDT',
    displayPair: 'BNB/USD',
    name: 'BNB',
    category: 'Crypto',
    livePrice: 624.8,
    changePct24h: 0.92,
    provider: 'Spot Snapshot',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('shorts');
  const [activeMarketAsset, setActiveMarketAsset] = useState<MarketAsset | null>(null);

  // Theme & Typography
  const [activePalette, setActivePalette] = useState<ColorPalette>(() =>
    loadJson<ColorPalette>(STORAGE_KEYS.palette, PRESET_PALETTES[0])
  );
  const [customPalettes, setCustomPalettes] = useState<ColorPalette[]>(() =>
    loadJson<ColorPalette[]>(STORAGE_KEYS.customPalettes, [])
  );
  const [typography, setTypography] = useState<TypographySettings>(() =>
    loadJson<TypographySettings>(STORAGE_KEYS.typography, DEFAULT_TYPOGRAPHY)
  );
  const [studioOpen, setStudioOpen] = useState(false);

  // Watchlist
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(() =>
    loadJson<string[]>(STORAGE_KEYS.watchlist, ['OANDA:XAUUSD', 'OANDA:XAGUSD', 'BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
  );

  // Live TV Viewer Chat Messages
  const [messages, setMessages] = useState<NewsMessage[]>(INITIAL_MESSAGES);

  // Live Markets & Price Alerts
  const [marketAssets, setMarketAssets] = useState<MarketAsset[]>(DEFAULT_MARKET_ASSETS);
  const [isRefreshingMarkets, setIsRefreshingMarkets] = useState(false);
  const [localAlerts, setLocalAlerts] = useState<PriceAlertRecord[]>(() =>
    loadJson<PriceAlertRecord[]>(STORAGE_KEYS.localAlerts, [])
  );
  const [cloudAlerts, setCloudAlerts] = useState<PriceAlertRecord[]>([]);

  // Firebase Auth & Push Notifications
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermissionState>(() => getPushPermission());
  const [pushEnabled, setPushEnabled] = useState<boolean>(() =>
    loadJson<boolean>(STORAGE_KEYS.pushEnabled, true)
  );
  const [alertBanner, setAlertBanner] = useState<{ title: string; body: string } | null>(null);

  const triggeredIdsRef = useRef<Set<string>>(new Set());

  // Apply palette & dark/light CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', activePalette.mode === 'dark');
    root.style.setProperty('--vp-primary', activePalette.primary);
    root.style.setProperty('--vp-primary-fg', getContrastText(activePalette.primary));
    root.style.setProperty('--vp-secondary', activePalette.secondary);
    root.style.setProperty('--vp-secondary-fg', getContrastText(activePalette.secondary));
    root.style.setProperty('--vp-accent', activePalette.accent);
    root.style.setProperty('--vp-accent-fg', getContrastText(activePalette.accent));
    root.style.setProperty('--vp-canvas', activePalette.canvas);
    root.style.setProperty('--vp-surface', activePalette.surface);
    root.style.setProperty('--vp-elevated', activePalette.elevated);
    root.style.setProperty('--vp-text', activePalette.text);
    root.style.setProperty('--vp-muted', activePalette.mutedText);
    root.style.setProperty(
      '--vp-border',
      activePalette.mode === 'dark' ? 'rgba(241, 245, 249, 0.13)' : 'rgba(17, 24, 39, 0.11)'
    );

    const selfBg =
      typography.messageColorMode === 'custom' ? typography.customMsgSelfBg : activePalette.msgSelfBg;
    const otherBg =
      typography.messageColorMode === 'custom' ? typography.customMsgOtherBg : activePalette.msgOtherBg;
    root.style.setProperty('--vp-msg-self-bg', selfBg);
    root.style.setProperty('--vp-msg-self-fg', getContrastText(selfBg));
    root.style.setProperty('--vp-msg-other-bg', otherBg);
    root.style.setProperty('--vp-msg-other-fg', getContrastText(otherBg));

    localStorage.setItem(STORAGE_KEYS.palette, JSON.stringify(activePalette));
  }, [activePalette, typography]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.customPalettes, JSON.stringify(customPalettes));
  }, [customPalettes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.typography, JSON.stringify(typography));
  }, [typography]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.watchlist, JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.localAlerts, JSON.stringify(localAlerts));
  }, [localAlerts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.pushEnabled, JSON.stringify(pushEnabled));
  }, [pushEnabled]);

  // Firebase Connection Test + Auth Listener + UserPrivate Sync
  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setCloudAlerts([]);
        return;
      }

      try {
        const privRef = doc(db, 'users_private', user.uid);
        const snap = await getDoc(privRef);
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.watchlistSymbols)) {
            setWatchlistSymbols(data.watchlistSymbols.slice(0, 50));
          }
          if (typeof data.pushAlertsEnabled === 'boolean') {
            setPushEnabled(data.pushAlertsEnabled);
          }
        } else {
          await setDoc(privRef, {
            uid: user.uid,
            email: (user.email ?? 'user@vartapress.app').slice(0, 200),
            savedPostIds: [],
            watchlistSymbols: watchlistSymbols.slice(0, 50),
            pushAlertsEnabled: pushEnabled,
            language: 'en',
            darkMode: activePalette.mode === 'dark',
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('User private sync warning:', err);
      }
    });
    return () => unsub();
  }, []);

  // Firestore Price Alerts Listener (ownerId query without compound orderBy)
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setCloudAlerts([]);
      return;
    }

    const q = query(
      collection(db, 'price_alerts'),
      where('ownerId', '==', firebaseUser.uid)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const rows: PriceAlertRecord[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PriceAlertRecord, 'id'>),
        }));
        rows.sort((a, b) => Number(a.triggered) - Number(b.triggered));
        setCloudAlerts(rows);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'price_alerts');
      }
    );

    return () => unsub();
  }, [authReady, firebaseUser]);

  const activeAlerts = firebaseUser ? cloudAlerts : localAlerts;

  // Real-time Markets Polling + Price Alert Evaluation
  const loadLiveMarkets = useCallback(async () => {
    setIsRefreshingMarkets(true);
    try {
      const snap = await fetchAllLiveMarkets();
      setMarketAssets(snap.assets);

      setActiveMarketAsset((curr) => {
        if (!curr) return null;
        const updated = snap.assets.find((a) => a.tvSymbol === curr.tvSymbol);
        return updated ? { ...curr, livePrice: updated.livePrice, changePct24h: updated.changePct24h, provider: updated.provider } : curr;
      });
    } finally {
      setIsRefreshingMarkets(false);
    }
  }, []);

  useEffect(() => {
    loadLiveMarkets();
    const timer = window.setInterval(loadLiveMarkets, 15000);
    return () => window.clearInterval(timer);
  }, [loadLiveMarkets]);

  // Evaluate Price Alerts whenever live market prices update
  useEffect(() => {
    if (activeAlerts.length === 0 || marketAssets.length === 0) return;

    activeAlerts.forEach(async (alert) => {
      if (!alert.active || alert.triggered || triggeredIdsRef.current.has(alert.id)) return;
      const matched = marketAssets.find((a) => a.tvSymbol === alert.symbol);
      if (!matched) return;

      const hit =
        alert.condition === 'above'
          ? matched.livePrice >= alert.targetPrice
          : matched.livePrice <= alert.targetPrice;

      if (!hit) return;
      triggeredIdsRef.current.add(alert.id);

      const title = `Price Alert: ${alert.displayPair}`;
      const body = `${alert.displayPair} hit ${matched.livePrice} (${alert.condition} ${alert.targetPrice})`;
      setAlertBanner({ title, body });
      if (pushEnabled) {
        sendPushNotification({ title, body, tag: `price-${alert.id}` });
      }

      if (firebaseUser) {
        try {
          await updateDoc(doc(db, 'price_alerts', alert.id), {
            active: false,
            triggered: true,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `price_alerts/${alert.id}`);
        }
      } else {
        setLocalAlerts((prev) =>
          prev.map((a) => (a.id === alert.id ? { ...a, active: false, triggered: true } : a))
        );
      }
    });
  }, [marketAssets, activeAlerts, firebaseUser, pushEnabled]);

  const handleToggleDarkLight = () => {
    const targetMode = activePalette.mode === 'dark' ? 'light' : 'dark';
    const matching =
      [...PRESET_PALETTES, ...customPalettes].find((p) => p.mode === targetMode) ??
      PRESET_PALETTES[targetMode === 'dark' ? 2 : 0];
    setActivePalette(matching);
  };

  const handleTogglePush = async () => {
    if (pushPermission !== 'granted') {
      const res = await requestPushPermission();
      setPushPermission(res);
      if (res === 'granted') {
        setPushEnabled(true);
        sendPushNotification({
          title: 'VartaPress Alerts Active',
          body: 'Gold and Crypto price alerts are enabled.',
          tag: 'vp-welcome',
        });
      }
      return;
    }
    setPushEnabled((prev) => !prev);
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Google Sign-In failed:', err);
    }
  };

  const handleOpenMarketDetails = (asset: MarketAsset) => {
    setActiveMarketAsset(asset);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleWatchlist = async (tvSymbol: string) => {
    const next = watchlistSymbols.includes(tvSymbol)
      ? watchlistSymbols.filter((s) => s !== tvSymbol)
      : [tvSymbol, ...watchlistSymbols].slice(0, 50);
    setWatchlistSymbols(next);

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'users_private', firebaseUser.uid), {
          watchlistSymbols: next,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // local state kept in sync
      }
    }
  };

  const handleCreatePriceAlert = async (params: {
    symbol: string;
    displayPair: string;
    condition: 'above' | 'below';
    targetPrice: number;
  }) => {
    const cleanSymbol = params.symbol.slice(0, 40);
    const cleanPair = params.displayPair.slice(0, 40);

    if (firebaseUser) {
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await setDoc(doc(db, 'price_alerts', alertId), {
          ownerId: firebaseUser.uid,
          symbol: cleanSymbol,
          displayPair: cleanPair,
          condition: params.condition,
          targetPrice: params.targetPrice,
          active: true,
          triggered: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `price_alerts/${alertId}`);
      }
      return;
    }

    const newLocal: PriceAlertRecord = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ownerId: 'local',
      symbol: cleanSymbol,
      displayPair: cleanPair,
      condition: params.condition,
      targetPrice: params.targetPrice,
      active: true,
      triggered: false,
    };
    setLocalAlerts((prev) => [newLocal, ...prev]);
  };

  const handleDeletePriceAlert = async (alertId: string) => {
    if (firebaseUser && !alertId.startsWith('local_')) {
      try {
        await deleteDoc(doc(db, 'price_alerts', alertId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `price_alerts/${alertId}`);
      }
      return;
    }
    setLocalAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const handleSendMessage = (msg: Omit<NewsMessage, 'id' | 'timestamp'>) => {
    const entry: NewsMessage = {
      ...msg,
      id: `msg-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, entry]);
  };

  const handleSelectTab = (tab: AppTab) => {
    setActiveTab(tab);
    setActiveMarketAsset(null);
  };

  return (
    <div
      className="min-h-screen transition-colors"
      style={{
        backgroundColor: 'var(--vp-canvas)',
        color: 'var(--vp-text)',
      }}
    >
      <HeaderNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenStudio={() => setStudioOpen(true)}
        typography={typography}
      />

      {/* Live Gold & Crypto Quick Strip + Alerts / Theme / Cloud Sync Bar */}
      <div
        className="border-b"
        style={{
          backgroundColor: 'var(--vp-surface)',
          borderColor: 'var(--vp-border)',
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2.5">
          {/* Clickable Live Markets Strip */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full py-0.5">
            <span
              className="inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap shrink-0"
              style={{ color: 'var(--vp-primary)' }}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Live Markets</span>
            </span>
            {marketAssets.slice(0, 6).map((asset) => {
              const up = asset.changePct24h >= 0;
              const isSelected = activeMarketAsset?.tvSymbol === asset.tvSymbol;
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => handleOpenMarketDetails(asset)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-mono-tabular whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                    color: isSelected ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                    borderColor: isSelected ? 'var(--vp-primary)' : 'var(--vp-border)',
                  }}
                >
                  <span className="font-bold">{asset.displayPair}</span>
                  <span>${formatShortMarketPrice(asset)}</span>
                  <span
                    style={{
                      color: isSelected
                        ? 'var(--vp-primary-fg)'
                        : up
                          ? '#10b981'
                          : '#ef4444',
                    }}
                  >
                    {up ? '+' : ''}
                    {asset.changePct24h.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>

          {/* Utility Controls: Dark/Light, Push Notifications, PWA Install, Firebase Sync */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleDarkLight}
              aria-label="Toggle dark or light mode"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
                color: 'var(--vp-text)',
              }}
            >
              {activePalette.mode === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5" style={{ color: 'var(--vp-accent)' }} />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleTogglePush}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor:
                  pushPermission === 'granted' && pushEnabled ? 'var(--vp-secondary)' : 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
                color:
                  pushPermission === 'granted' && pushEnabled ? 'var(--vp-secondary-fg)' : 'var(--vp-text)',
              }}
            >
              {pushPermission === 'granted' && pushEnabled ? (
                <>
                  <Bell className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
                  <span className="hidden sm:inline">Alerts On</span>
                </>
              ) : (
                <>
                  <BellOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Enable Alerts</span>
                </>
              )}
            </button>

            <PWAInstallButton />

            {firebaseUser ? (
              <button
                type="button"
                onClick={() => signOut(auth)}
                title={`Signed in as ${firebaseUser.email ?? 'User'} — Sign out`}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline max-w-[96px] truncate">
                  {firebaseUser.displayName?.split(' ')[0] ?? 'Synced'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              >
                <LogIn className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
                <span>Sync Alerts</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Triggered Price Alert In-App Banner */}
      {alertBanner && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-4">
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm"
            style={{
              backgroundColor: 'var(--vp-secondary)',
              borderColor: 'var(--vp-accent)',
              color: 'var(--vp-secondary-fg)',
            }}
          >
            <div>
              <strong className="font-bold">{alertBanner.title}: </strong>
              <span>{alertBanner.body}</span>
            </div>
            <button
              type="button"
              onClick={() => setAlertBanner(null)}
              className="text-xs font-bold underline cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 pt-5 pb-20 md:pb-10">
        {activeMarketAsset ? (
          <MarketDetails
            asset={activeMarketAsset}
            allAssets={marketAssets}
            onSelectAsset={handleOpenMarketDetails}
            onBack={() => {
              setActiveMarketAsset(null);
              setActiveTab('forex');
            }}
            themeMode={activePalette.mode}
            typography={typography}
            watchlistSymbols={watchlistSymbols}
            onToggleWatchlist={handleToggleWatchlist}
            alerts={activeAlerts}
            onCreateAlert={handleCreatePriceAlert}
            onDeleteAlert={handleDeletePriceAlert}
            pushPermission={pushPermission}
            onRequestPushPermission={async () => {
              const res = await requestPushPermission();
              setPushPermission(res);
              if (res === 'granted') setPushEnabled(true);
            }}
            onRefreshMarkets={loadLiveMarkets}
            isRefreshingMarkets={isRefreshingMarkets}
          />
        ) : activeTab === 'shorts' ? (
          <ShortsFeedView
            typography={typography}
            userName={firebaseUser?.displayName ?? 'You'}
          />
        ) : activeTab === 'social' ? (
          <SocialCommunityView
            typography={typography}
            firebaseUser={firebaseUser}
            onRequestSignIn={handleGoogleSignIn}
          />
        ) : activeTab === 'livetv' ? (
          <LiveTvView
            typography={typography}
            messages={messages}
            onSendMessage={handleSendMessage}
          />
        ) : (
          <ForexMarketView
            typography={typography}
            themeMode={activePalette.mode}
            marketAssets={marketAssets}
            watchlistSymbols={watchlistSymbols}
            onOpenMarketDetails={handleOpenMarketDetails}
            onRefreshAllMarkets={loadLiveMarkets}
            isRefreshingMarkets={isRefreshingMarkets}
          />
        )}
      </main>

      <BottomThumbNav activeTab={activeTab} onSelectTab={handleSelectTab} />

      <ThemePaletteStudio
        isOpen={studioOpen}
        onClose={() => setStudioOpen(false)}
        activePalette={activePalette}
        customPalettes={customPalettes}
        onSelectPalette={setActivePalette}
        onSaveCustomPalette={(palette) => {
          setCustomPalettes((prev) => [palette, ...prev.filter((p) => p.id !== palette.id)]);
          setActivePalette(palette);
        }}
        onDeleteCustomPalette={(paletteId) => {
          setCustomPalettes((prev) => prev.filter((p) => p.id !== paletteId));
        }}
        typography={typography}
        onUpdateTypography={setTypography}
      />

      <OfflineIndicator />
    </div>
  );
}
