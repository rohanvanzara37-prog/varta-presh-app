import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { AcademyView } from './components/AcademyView';
import { BottomNavBar } from './components/BottomNavBar';
import { ForexMarketView } from './components/ForexMarketView';
import { HeaderNav } from './components/HeaderNav';
import { MarketDetails } from './components/MarketDetails';
import { NewsTerminalView } from './components/NewsTerminalView';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  DEFAULT_TYPOGRAPHY,
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
  palette: 'vp_active_palette_v3',
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

const DEFAULT_MARKET_ASSETS: MarketAsset[] = [
  {
    id: 'xauusd',
    tvSymbol: 'OANDA:XAUUSD',
    displayPair: 'XAU/USD',
    name: 'Gold Spot (Troy Oz)',
    category: 'Metals',
    livePrice: 3515.4,
    changePct24h: 0.64,
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
    id: 'us500',
    tvSymbol: 'FOREXCOM:SPXUSD',
    displayPair: 'S&P 500',
    name: 'S&P 500 Index (US500)',
    category: 'Indices',
    livePrice: 6910.39,
    changePct24h: 0.45,
    provider: 'US Market Snapshot',
  },
  {
    id: 'usoil',
    tvSymbol: 'TVC:USOIL',
    displayPair: 'US OIL',
    name: 'WTI Crude Oil (bbl)',
    category: 'Commodities',
    livePrice: 83.41,
    changePct24h: -0.35,
    provider: 'Oil Snapshot',
    unitLabel: 'bbl',
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
  const [activeTab, setActiveTab] = useState<AppTab>('terminal');
  const [activeMarketAsset, setActiveMarketAsset] = useState<MarketAsset | null>(null);
  const [selectedMarketSymbol, setSelectedMarketSymbol] = useState<string>('OANDA:XAUUSD');

  // Dark-mode Play Store Trading Palette & Typography
  const [activePalette] = useState<ColorPalette>(() =>
    loadJson<ColorPalette>(STORAGE_KEYS.palette, PRESET_PALETTES[2])
  );
  const [typography] = useState<TypographySettings>(() =>
    loadJson<TypographySettings>(STORAGE_KEYS.typography, DEFAULT_TYPOGRAPHY)
  );

  // Watchlist
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(() =>
    loadJson<string[]>(STORAGE_KEYS.watchlist, ['OANDA:XAUUSD', 'OANDA:XAGUSD', 'BINANCE:BTCUSDT', 'BINANCE:ETHUSDT'])
  );

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

  // Block external website navigation from any TradingView embedded widget (tv-link-open)
  useEffect(() => {
    const handleTvLinkOpen = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('tv-link-open', handleTvLinkOpen, true);
    return () => {
      document.removeEventListener('tv-link-open', handleTvLinkOpen, true);
    };
  }, []);

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

  const handleSelectTab = (tab: AppTab) => {
    setActiveTab(tab);
    setActiveMarketAsset(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenPairInTerminal = (tvSymbol: string) => {
    setSelectedMarketSymbol(tvSymbol);
    setActiveMarketAsset(null);
    setActiveTab('terminal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        typography={typography}
        pushPermission={pushPermission}
        pushEnabled={pushEnabled}
        onTogglePush={handleTogglePush}
        firebaseUser={firebaseUser}
        onSignIn={handleGoogleSignIn}
        onSignOut={() => signOut(auth)}
      />

      {/* Triggered Price Alert In-App Banner */}
      {alertBanner && (
        <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-3">
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-2xl border border-[#F0B90B]/60 bg-[#1E2329] px-4 py-3 text-sm text-[#EAECEF]"
          >
            <div>
              <strong className="font-bold text-[#F0B90B]">{alertBanner.title}: </strong>
              <span>{alertBanner.body}</span>
            </div>
            <button
              type="button"
              onClick={() => setAlertBanner(null)}
              className="text-xs font-bold text-[#F0B90B] underline cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="mx-auto max-w-7xl px-3 sm:px-6 pt-3 pb-24 md:pb-8">
        {activeTab === 'terminal' ? (
          activeMarketAsset ? (
            <MarketDetails
              asset={activeMarketAsset}
              allAssets={marketAssets}
              onSelectAsset={handleOpenMarketDetails}
              onBack={() => {
                setActiveMarketAsset(null);
                setActiveTab('terminal');
              }}
              themeMode="dark"
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
          ) : (
            <ForexMarketView
              typography={typography}
              themeMode="dark"
              marketAssets={marketAssets}
              watchlistSymbols={watchlistSymbols}
              selectedSymbol={selectedMarketSymbol}
              onSelectSymbol={setSelectedMarketSymbol}
              onOpenMarketDetails={handleOpenMarketDetails}
              onRefreshMarkets={loadLiveMarkets}
              isRefreshingMarkets={isRefreshingMarkets}
              onNavigateTab={handleSelectTab}
            />
          )
        ) : activeTab === 'news' ? (
          <NewsTerminalView />
        ) : (
          <AcademyView onOpenPairInTerminal={handleOpenPairInTerminal} />
        )}
      </main>

      <BottomNavBar activeTab={activeTab} onSelectTab={handleSelectTab} />
      <OfflineIndicator />
    </div>
  );
}
