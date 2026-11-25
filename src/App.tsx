import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DemoAccountDrawer } from './components/DemoAccountDrawer';
import { ForexMarketView } from './components/ForexMarketView';
import { HeaderNav } from './components/HeaderNav';
import { MarketDetails } from './components/MarketDetails';
import { NewsTerminalView } from './components/NewsTerminalView';
import { OfflineIndicator } from './components/OfflineIndicator';
import type { SmcSymbol } from './components/ProSmcTerminal';
import {
  DEFAULT_TYPOGRAPHY,
  LIGHT_TERMINAL_PALETTE,
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
  ThemeMode,
  TypographySettings,
} from './types/news';
import { getContrastText } from './utils/colorContrast';
import {
  DEMO_SYMBOL_SPECS,
  calcPositionPnl,
  calcRequiredMargin,
  computeDemoAccountMetrics,
  createInitialDemoAccount,
  loadDemoAccount,
  saveDemoAccount,
  type DemoAccountState,
  type DemoLeverage,
  type DemoPosition,
} from './utils/demoAccount';
import { fetchAllLiveMarkets } from './utils/marketFeeds';
import {
  getPushPermission,
  requestPushPermission,
  sendPushNotification,
  type PushPermissionState,
} from './utils/pushNotifications';

const STORAGE_KEYS = {
  palette: 'vp_active_palette_v3',
  themeMode: 'vp_theme_mode_v2',
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

  // Theme Mode (Light/White default, Dark optional in localStorage) & Typography
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.themeMode);
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const activePalette: ColorPalette =
    themeMode === 'light' ? LIGHT_TERMINAL_PALETTE : PRESET_PALETTES[2];
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
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermissionState>(() => getPushPermission());
  const [pushEnabled, setPushEnabled] = useState<boolean>(() =>
    loadJson<boolean>(STORAGE_KEYS.pushEnabled, true)
  );
  const [alertBanner, setAlertBanner] = useState<{ title: string; body: string } | null>(null);

  // $1,000 Exness-Style Paper Demo Account State
  const [demoAccount, setDemoAccount] = useState<DemoAccountState>(() => loadDemoAccount());
  const [demoDrawerOpen, setDemoDrawerOpen] = useState(false);
  const [chartTickPrices, setChartTickPrices] = useState<Partial<Record<SmcSymbol, number>>>({});

  const triggeredIdsRef = useRef<Set<string>>(new Set());

  // Apply palette & dark/light CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const isDark = themeMode === 'dark';
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
    root.style.colorScheme = themeMode;
    root.style.setProperty('--vp-primary', activePalette.primary);
    root.style.setProperty('--vp-primary-fg', getContrastText(activePalette.primary));
    root.style.setProperty('--vp-secondary', activePalette.secondary);
    root.style.setProperty('--vp-secondary-fg', getContrastText(activePalette.secondary));
    root.style.setProperty('--vp-accent', activePalette.accent);
    root.style.setProperty('--vp-accent-fg', getContrastText(activePalette.accent));
    root.style.setProperty('--vp-accent-text', isDark ? '#F59E0B' : '#B45309');
    root.style.setProperty('--vp-canvas', activePalette.canvas);
    root.style.setProperty('--vp-surface', activePalette.surface);
    root.style.setProperty(
      '--vp-surface-glass',
      isDark ? 'rgba(19, 23, 34, 0.86)' : 'rgba(248, 250, 252, 0.92)'
    );
    root.style.setProperty('--vp-header', isDark ? '#0F131D' : '#F1F5F9');
    root.style.setProperty('--vp-elevated', activePalette.elevated);
    root.style.setProperty('--vp-control', isDark ? '#1E2433' : '#E2E8F0');
    root.style.setProperty('--vp-text', activePalette.text);
    root.style.setProperty('--vp-muted', activePalette.mutedText);
    root.style.setProperty('--vp-border', isDark ? '#1E2433' : '#E2E8F0');
    root.style.setProperty('--vp-bull', isDark ? '#089981' : '#089981');
    root.style.setProperty('--vp-bear', isDark ? '#F23645' : '#DC2626');
    root.style.setProperty(
      '--vp-card-shadow',
      isDark
        ? '0 12px 32px -12px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.04)'
        : '0 10px 26px -12px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
    );

    const selfBg =
      typography.messageColorMode === 'custom' ? typography.customMsgSelfBg : activePalette.msgSelfBg;
    const otherBg =
      typography.messageColorMode === 'custom' ? typography.customMsgOtherBg : activePalette.msgOtherBg;
    root.style.setProperty('--vp-msg-self-bg', selfBg);
    root.style.setProperty('--vp-msg-self-fg', getContrastText(selfBg));
    root.style.setProperty('--vp-msg-other-bg', otherBg);
    root.style.setProperty('--vp-msg-other-fg', getContrastText(otherBg));

    try {
      localStorage.setItem(STORAGE_KEYS.themeMode, themeMode);
      localStorage.setItem(STORAGE_KEYS.palette, JSON.stringify(activePalette));
    } catch {
      // ignore storage errors
    }
  }, [themeMode, activePalette, typography]);

  useEffect(() => {
    document.documentElement.style.backgroundColor = activePalette.canvas;
    document.body.style.backgroundColor = activePalette.canvas;
    document.body.style.color = activePalette.text;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', activePalette.canvas);
    }
  }, [activePalette]);

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
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      setAlertBanner((prev) => (prev?.title === 'Sign-In Notice' ? null : prev));
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      if (code === 'auth/popup-blocked') {
        setAlertBanner({
          title: 'Sign-In Notice',
          body: 'Sign-in popup was blocked by your browser. Please allow popups and try again.',
        });
        return;
      }
      if (code === 'auth/unauthorized-domain') {
        setAlertBanner({
          title: 'Sign-In Notice',
          body: 'This domain is not authorized in Firebase Authentication settings.',
        });
        return;
      }
      setAlertBanner({
        title: 'Sign-In Notice',
        body: err instanceof Error ? err.message : 'Unable to sign in with Google right now.',
      });
    } finally {
      setIsSigningIn(false);
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

  // Persist Demo Account & compute merged live mark prices
  useEffect(() => {
    saveDemoAccount(demoAccount);
  }, [demoAccount]);

  const handleLivePriceTick = useCallback((sym: SmcSymbol, price: number) => {
    if (!Number.isFinite(price) || price <= 0) return;
    setChartTickPrices((prev) => {
      if (prev[sym] === price) return prev;
      return { ...prev, [sym]: price };
    });
  }, []);

  const liveSymbolPrices = useMemo<Partial<Record<SmcSymbol, number>>>(() => {
    const merged: Partial<Record<SmcSymbol, number>> = {
      XAUUSD: DEMO_SYMBOL_SPECS.XAUUSD.defaultPrice,
      XAGUSD: DEMO_SYMBOL_SPECS.XAGUSD.defaultPrice,
      BTCUSDT: DEMO_SYMBOL_SPECS.BTCUSDT.defaultPrice,
      ETHUSDT: DEMO_SYMBOL_SPECS.ETHUSDT.defaultPrice,
      SOLUSDT: DEMO_SYMBOL_SPECS.SOLUSDT.defaultPrice,
      BNBUSDT: DEMO_SYMBOL_SPECS.BNBUSDT.defaultPrice,
      XRPUSDT: DEMO_SYMBOL_SPECS.XRPUSDT.defaultPrice,
      US500: DEMO_SYMBOL_SPECS.US500.defaultPrice,
      USOIL: DEMO_SYMBOL_SPECS.USOIL.defaultPrice,
    };
    for (const asset of marketAssets) {
      if (asset.tvSymbol.includes('XAU')) merged.XAUUSD = asset.livePrice;
      else if (asset.tvSymbol.includes('XAG')) merged.XAGUSD = asset.livePrice;
      else if (asset.tvSymbol.includes('BTC')) merged.BTCUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('ETH')) merged.ETHUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('SOL')) merged.SOLUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('BNB')) merged.BNBUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('XRP')) merged.XRPUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('SPX') || asset.tvSymbol.includes('US500')) merged.US500 = asset.livePrice;
      else if (asset.tvSymbol.includes('USOIL')) merged.USOIL = asset.livePrice;
    }
    return { ...merged, ...chartTickPrices };
  }, [marketAssets, chartTickPrices]);

  const demoMetrics = useMemo(
    () => computeDemoAccountMetrics(demoAccount, liveSymbolPrices),
    [demoAccount, liveSymbolPrices]
  );

  const activeDemoSymbol = useMemo<SmcSymbol>(() => {
    if (selectedMarketSymbol.includes('BTC')) return 'BTCUSDT';
    if (selectedMarketSymbol.includes('ETH')) return 'ETHUSDT';
    if (selectedMarketSymbol.includes('SOL')) return 'SOLUSDT';
    if (selectedMarketSymbol.includes('BNB')) return 'BNBUSDT';
    if (selectedMarketSymbol.includes('XRP')) return 'XRPUSDT';
    if (selectedMarketSymbol.includes('XAG')) return 'XAGUSD';
    if (selectedMarketSymbol.includes('SPX') || selectedMarketSymbol.includes('US500')) return 'US500';
    if (selectedMarketSymbol.includes('USOIL')) return 'USOIL';
    return 'XAUUSD';
  }, [selectedMarketSymbol]);

  const handleExecuteDemoOrder = useCallback(
    (sym: SmcSymbol, side: 'BUY' | 'SELL', lots: number): string | null => {
      const cleanLots = Math.max(0.01, Math.min(10, Number(lots.toFixed(2))));
      const spec = DEMO_SYMBOL_SPECS[sym] ?? DEMO_SYMBOL_SPECS.XAUUSD;
      const entryPrice = liveSymbolPrices[sym] ?? spec.defaultPrice;
      const reqMargin = calcRequiredMargin(sym, cleanLots, entryPrice, demoAccount.leverage);
      if (reqMargin > demoMetrics.freeMargin) {
        return `Insufficient free margin (need $${reqMargin.toFixed(2)})`;
      }
      const newPos: DemoPosition = {
        id: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        symbol: sym,
        side,
        lots: cleanLots,
        entryPrice,
        openedAt: Date.now(),
      };
      setDemoAccount((prev) => ({
        ...prev,
        defaultLot: cleanLots,
        positions: [newPos, ...prev.positions].slice(0, 30),
      }));
      return null;
    },
    [demoAccount.leverage, demoMetrics.freeMargin, liveSymbolPrices]
  );

  const handleCloseDemoPosition = useCallback(
    (positionId: string) => {
      setDemoAccount((prev) => {
        const target = prev.positions.find((p) => p.id === positionId);
        if (!target) return prev;
        const spec = DEMO_SYMBOL_SPECS[target.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const closePrice = liveSymbolPrices[target.symbol] ?? target.entryPrice ?? spec.defaultPrice;
        const pnl = calcPositionPnl(target, closePrice);
        return {
          ...prev,
          balance: Math.max(0, Number((prev.balance + pnl).toFixed(2))),
          positions: prev.positions.filter((p) => p.id !== positionId),
          history: [
            {
              id: target.id,
              symbol: target.symbol,
              side: target.side,
              lots: target.lots,
              entryPrice: target.entryPrice,
              closePrice,
              pnl,
              closedAt: Date.now(),
            },
            ...prev.history,
          ].slice(0, 20),
        };
      });
    },
    [liveSymbolPrices]
  );

  const handleCloseAllDemoPositions = useCallback(() => {
    setDemoAccount((prev) => {
      if (prev.positions.length === 0) return prev;
      let totalPnl = 0;
      const now = Date.now();
      const closedRows = prev.positions.map((pos) => {
        const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const closePrice = liveSymbolPrices[pos.symbol] ?? pos.entryPrice ?? spec.defaultPrice;
        const pnl = calcPositionPnl(pos, closePrice);
        totalPnl += pnl;
        return {
          id: pos.id,
          symbol: pos.symbol,
          side: pos.side,
          lots: pos.lots,
          entryPrice: pos.entryPrice,
          closePrice,
          pnl,
          closedAt: now,
        };
      });
      return {
        ...prev,
        balance: Math.max(0, Number((prev.balance + totalPnl).toFixed(2))),
        positions: [],
        history: [...closedRows, ...prev.history].slice(0, 20),
      };
    });
  }, [liveSymbolPrices]);

  const handleChangeDemoLeverage = useCallback((leverage: DemoLeverage) => {
    setDemoAccount((prev) => ({ ...prev, leverage }));
  }, []);

  const handleChangeDemoDefaultLot = useCallback((defaultLot: number) => {
    const clean = Math.max(0.01, Math.min(10, Number(defaultLot.toFixed(2))));
    setDemoAccount((prev) => ({ ...prev, defaultLot: clean }));
  }, []);

  const handleResetDemoAccount = useCallback(() => {
    setDemoAccount(createInitialDemoAccount());
  }, []);

  const handleUpdateDemoPositionTpSl = useCallback(
    (positionId: string, tp: number | undefined, sl: number | undefined) => {
      setDemoAccount((prev) => ({
        ...prev,
        positions: prev.positions.map((pos) => {
          if (pos.id !== positionId) return pos;
          const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
          const cleanTp =
            typeof tp === 'number' && Number.isFinite(tp) && tp > 0
              ? Number(tp.toFixed(spec.precision))
              : undefined;
          const cleanSl =
            typeof sl === 'number' && Number.isFinite(sl) && sl > 0
              ? Number(sl.toFixed(spec.precision))
              : undefined;
          return { ...pos, tp: cleanTp, sl: cleanSl };
        }),
      }));
    },
    []
  );

  // Auto-trigger TP / SL execution when live price crosses target
  useEffect(() => {
    if (demoAccount.positions.length === 0) return;
    const triggeredIds = new Set<string>();
    for (const pos of demoAccount.positions) {
      const mark = liveSymbolPrices[pos.symbol];
      if (!mark || !Number.isFinite(mark)) continue;
      if (pos.side === 'BUY') {
        if ((pos.tp !== undefined && mark >= pos.tp) || (pos.sl !== undefined && mark <= pos.sl)) {
          triggeredIds.add(pos.id);
        }
      } else {
        if ((pos.tp !== undefined && mark <= pos.tp) || (pos.sl !== undefined && mark >= pos.sl)) {
          triggeredIds.add(pos.id);
        }
      }
    }
    if (triggeredIds.size === 0) return;

    setDemoAccount((prev) => {
      let realized = 0;
      const closedRows: DemoAccountState['history'] = [];
      const remaining: DemoPosition[] = [];
      const now = Date.now();
      for (const pos of prev.positions) {
        if (!triggeredIds.has(pos.id)) {
          remaining.push(pos);
          continue;
        }
        const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const closePrice = liveSymbolPrices[pos.symbol] ?? pos.entryPrice ?? spec.defaultPrice;
        const pnl = calcPositionPnl(pos, closePrice);
        realized += pnl;
        closedRows.push({
          id: pos.id,
          symbol: pos.symbol,
          side: pos.side,
          lots: pos.lots,
          entryPrice: pos.entryPrice,
          closePrice,
          pnl,
          closedAt: now,
        });
      }
      if (closedRows.length === 0) return prev;
      return {
        ...prev,
        balance: Math.max(0, Number((prev.balance + realized).toFixed(2))),
        positions: remaining,
        history: [...closedRows, ...prev.history].slice(0, 20),
      };
    });
  }, [liveSymbolPrices, demoAccount.positions]);

  if (activeTab === 'academy') {
    return (
      <div className="vp-tab-stage min-h-screen bg-[#FFFFFF] text-[#0F172A]">
        <AcademyView
          onOpenPairInTerminal={handleOpenPairInTerminal}
          onNavigateTab={handleSelectTab}
          themeMode={themeMode}
        />
        <BottomNavBar activeTab={activeTab} onSelectTab={handleSelectTab} alwaysVisible />
        <DemoAccountDrawer
          isOpen={demoDrawerOpen}
          onClose={() => setDemoDrawerOpen(false)}
          account={demoAccount}
          metrics={demoMetrics}
          activeSymbol={activeDemoSymbol}
          livePrices={liveSymbolPrices}
          onExecuteOrder={handleExecuteDemoOrder}
          onClosePosition={handleCloseDemoPosition}
          onCloseAllPositions={handleCloseAllDemoPositions}
          onChangeLeverage={handleChangeDemoLeverage}
          onChangeDefaultLot={handleChangeDemoDefaultLot}
          onResetAccount={handleResetDemoAccount}
        />
        <OfflineIndicator />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#FFFFFF] text-[#0F172A] transition-colors overflow-x-hidden"
    >
      <HeaderNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        typography={typography}
        pushPermission={pushPermission}
        pushEnabled={pushEnabled}
        onTogglePush={handleTogglePush}
        firebaseUser={firebaseUser}
        isSigningIn={isSigningIn}
        onSignIn={handleGoogleSignIn}
        onSignOut={() => signOut(auth)}
        demoEquity={demoMetrics.equity}
        demoFloatingPnl={demoMetrics.floatingPnl}
        onOpenDemoDrawer={() => setDemoDrawerOpen(true)}
      />

      {/* Triggered Price Alert In-App Banner */}
      {alertBanner && (
        <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-3">
          <div
            role="alert"
            className="vp-glass-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm"
            style={{
              borderColor: 'var(--vp-primary)',
              color: 'var(--vp-text)',
            }}
          >
            <div>
              <strong className="font-bold" style={{ color: 'var(--vp-accent-text)' }}>
                {alertBanner.title}:{' '}
              </strong>
              <span>{alertBanner.body}</span>
            </div>
            <button
              type="button"
              onClick={() => setAlertBanner(null)}
              className="vp-pill-btn px-3 py-1 text-xs font-bold cursor-pointer shrink-0 border border-[var(--vp-border)] bg-[var(--vp-elevated)]"
              style={{ color: 'var(--vp-accent-text)' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main key={activeTab} className="vp-tab-stage mx-auto max-w-7xl px-2 sm:px-5 pt-2.5 pb-20 md:pb-6">
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
              themeMode={themeMode}
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
              themeMode={themeMode}
              onChangeThemeMode={setThemeMode}
              marketAssets={marketAssets}
              watchlistSymbols={watchlistSymbols}
              selectedSymbol={selectedMarketSymbol}
              onSelectSymbol={setSelectedMarketSymbol}
              onOpenMarketDetails={handleOpenMarketDetails}
              onRefreshMarkets={loadLiveMarkets}
              isRefreshingMarkets={isRefreshingMarkets}
              onNavigateTab={handleSelectTab}
              demoPositions={demoAccount.positions}
              demoMetrics={demoMetrics}
              demoDefaultLot={demoAccount.defaultLot}
              onExecuteDemoOrder={handleExecuteDemoOrder}
              onCloseDemoPosition={handleCloseDemoPosition}
              onUpdateDemoPositionTpSl={handleUpdateDemoPositionTpSl}
              onChangeDemoDefaultLot={handleChangeDemoDefaultLot}
              onOpenDemoDrawer={() => setDemoDrawerOpen(true)}
              onLivePriceTick={handleLivePriceTick}
            />
          )
        ) : (
          <NewsTerminalView />
        )}
      </main>

      <DemoAccountDrawer
        isOpen={demoDrawerOpen}
        onClose={() => setDemoDrawerOpen(false)}
        account={demoAccount}
        metrics={demoMetrics}
        activeSymbol={activeDemoSymbol}
        livePrices={liveSymbolPrices}
        onExecuteOrder={handleExecuteDemoOrder}
        onClosePosition={handleCloseDemoPosition}
        onCloseAllPositions={handleCloseAllDemoPositions}
        onChangeLeverage={handleChangeDemoLeverage}
        onChangeDefaultLot={handleChangeDemoDefaultLot}
        onResetAccount={handleResetDemoAccount}
      />

      <BottomNavBar activeTab={activeTab} onSelectTab={handleSelectTab} />
      <OfflineIndicator />
    </div>
  );
}
