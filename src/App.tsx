import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
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
import { AiSuiteView } from './components/AiSuiteView';
import { BottomNavBar } from './components/BottomNavBar';
import { DemoAccountDrawer } from './components/DemoAccountDrawer';
import { ForexMarketView } from './components/ForexMarketView';
import { HeaderNav } from './components/HeaderNav';
import { MarketDetails } from './components/MarketDetails';
import { NewsTerminalView } from './components/NewsTerminalView';
import { OfflineIndicator } from './components/OfflineIndicator';
import type { ExecuteOrderOptions, SmcSymbol } from './components/ProSmcTerminal';
import {
  DEFAULT_TYPOGRAPHY,
  LIGHT_TERMINAL_PALETTE,
  PRESET_PALETTES,
} from './data/newsData';
import {
  auth,
  db,
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
  getBidAskPrices,
  loadDemoAccount,
  playTradeChime,
  reviewClosedTradeWithAi,
  saveDemoAccount,
  triggerHaptic,
  type BrokerSimMode,
  type DemoAccountState,
  type DemoClosedTrade,
  type DemoLeverage,
  type DemoLimitOrder,
  type DemoPosition,
  type PropShieldConfig,
  type TradeEmotionTag,
  type TrailingMode,
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
    id: 'eurusd',
    tvSymbol: 'FX:EURUSD',
    displayPair: 'EUR/USD',
    name: 'Euro / US Dollar',
    category: 'Forex',
    livePrice: 1.085,
    changePct24h: 0.14,
    provider: 'FX Snapshot',
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
    id: 'us30',
    tvSymbol: 'TVC:DJI',
    displayPair: 'US30',
    name: 'Dow Jones 30 (US30)',
    category: 'Indices',
    livePrice: 44250.0,
    changePct24h: 0.38,
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
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setSplashFading(true);
    }, 1500);
    const hideTimer = window.setTimeout(() => {
      setShowSplash(false);
    }, 1800);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<AppTab>('terminal');
  const [activeMarketAsset, setActiveMarketAsset] = useState<MarketAsset | null>(null);
  const [selectedMarketSymbol, setSelectedMarketSymbol] = useState<string>('OANDA:XAUUSD');

  // Theme Mode (VIP Obsidian Dark or Light/White) & Typography
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.themeMode);
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
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
  const [pushPermission, setPushPermission] = useState<PushPermissionState>(() => getPushPermission());
  const [pushEnabled, setPushEnabled] = useState<boolean>(() =>
    loadJson<boolean>(STORAGE_KEYS.pushEnabled, true)
  );
  const [alertBanner, setAlertBanner] = useState<{ title: string; body: string } | null>(null);

  // $1,000 Paper Demo Account State (fully persisted)
  const [demoAccount, setDemoAccount] = useState<DemoAccountState>(() => loadDemoAccount());
  const [demoDrawerOpen, setDemoDrawerOpen] = useState(false);
  const [marginCallActive, setMarginCallActive] = useState<boolean>(() => {
    const initial = loadDemoAccount();
    return initial.balance <= 0 && initial.positions.length === 0;
  });
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
    root.style.setProperty('--vp-primary-fg', isDark ? '#060911' : getContrastText(activePalette.primary));
    root.style.setProperty('--vp-secondary', activePalette.secondary);
    root.style.setProperty('--vp-secondary-fg', isDark ? '#FFFFFF' : getContrastText(activePalette.secondary));
    root.style.setProperty('--vp-accent', activePalette.accent);
    root.style.setProperty('--vp-accent-fg', isDark ? '#060911' : getContrastText(activePalette.accent));
    root.style.setProperty('--vp-accent-text', isDark ? '#F59E0B' : '#B45309');
    root.style.setProperty('--vp-canvas', activePalette.canvas);
    root.style.setProperty('--vp-surface', activePalette.surface);
    root.style.setProperty(
      '--vp-surface-glass',
      isDark ? 'rgba(15, 22, 38, 0.94)' : 'rgba(248, 250, 252, 0.92)'
    );
    root.style.setProperty('--vp-header', isDark ? '#0F1626' : '#F1F5F9');
    root.style.setProperty('--vp-elevated', activePalette.elevated);
    root.style.setProperty('--vp-control', isDark ? '#162138' : '#E2E8F0');
    root.style.setProperty('--vp-text', activePalette.text);
    root.style.setProperty('--vp-muted', activePalette.mutedText);
    root.style.setProperty('--vp-border', isDark ? 'rgba(255, 255, 255, 0.25)' : '#E2E8F0');
    root.style.setProperty('--vp-bull', isDark ? '#089981' : '#089981');
    root.style.setProperty('--vp-bear', isDark ? '#F23645' : '#DC2626');
    root.style.setProperty(
      '--vp-card-shadow',
      isDark
        ? '0 12px 32px -12px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
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
            email: (user.email ?? 'user@tredaura.app').slice(0, 200),
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
      playTradeChime('alert', demoAccount.propShield.soundEnabled);
      triggerHaptic([20, 30, 20], demoAccount.propShield.hapticsEnabled);
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
  }, [marketAssets, activeAlerts, firebaseUser, pushEnabled, demoAccount.propShield.soundEnabled, demoAccount.propShield.hapticsEnabled]);

  const handleRefreshCharts = useCallback(() => {
    void loadLiveMarkets();
    window.dispatchEvent(new CustomEvent('tredaura-refresh-charts'));
  }, [loadLiveMarkets]);

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
    const spec = DEMO_SYMBOL_SPECS[sym];
    if (spec && (price > spec.defaultPrice * 4 || price < spec.defaultPrice * 0.25)) {
      return;
    }
    setChartTickPrices((prev) => {
      if (prev[sym] === price) return prev;
      return { ...prev, [sym]: price };
    });
  }, []);

  const liveSymbolPrices = useMemo<Partial<Record<SmcSymbol, number>>>(() => {
    const merged: Partial<Record<SmcSymbol, number>> = {
      XAUUSD: DEMO_SYMBOL_SPECS.XAUUSD.defaultPrice,
      EURUSD: DEMO_SYMBOL_SPECS.EURUSD.defaultPrice,
      XAGUSD: DEMO_SYMBOL_SPECS.XAGUSD.defaultPrice,
      BTCUSDT: DEMO_SYMBOL_SPECS.BTCUSDT.defaultPrice,
      ETHUSDT: DEMO_SYMBOL_SPECS.ETHUSDT.defaultPrice,
      SOLUSDT: DEMO_SYMBOL_SPECS.SOLUSDT.defaultPrice,
      BNBUSDT: DEMO_SYMBOL_SPECS.BNBUSDT.defaultPrice,
      XRPUSDT: DEMO_SYMBOL_SPECS.XRPUSDT.defaultPrice,
      US500: DEMO_SYMBOL_SPECS.US500.defaultPrice,
      US30: DEMO_SYMBOL_SPECS.US30.defaultPrice,
      USOIL: DEMO_SYMBOL_SPECS.USOIL.defaultPrice,
    };
    for (const asset of marketAssets) {
      if (asset.tvSymbol.includes('XAU')) merged.XAUUSD = asset.livePrice;
      else if (asset.tvSymbol.includes('EUR')) merged.EURUSD = asset.livePrice;
      else if (asset.tvSymbol.includes('XAG')) merged.XAGUSD = asset.livePrice;
      else if (asset.tvSymbol.includes('BTC')) merged.BTCUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('ETH')) merged.ETHUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('SOL')) merged.SOLUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('BNB')) merged.BNBUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('XRP')) merged.XRPUSDT = asset.livePrice;
      else if (asset.tvSymbol.includes('DJI') || asset.tvSymbol.includes('US30')) merged.US30 = asset.livePrice;
      else if (asset.tvSymbol.includes('SPX') || asset.tvSymbol.includes('US500')) merged.US500 = asset.livePrice;
      else if (asset.tvSymbol.includes('USOIL')) merged.USOIL = asset.livePrice;
    }
    return { ...merged, ...chartTickPrices };
  }, [marketAssets, chartTickPrices]);

  const demoMetrics = useMemo(
    () => computeDemoAccountMetrics(demoAccount, liveSymbolPrices),
    [demoAccount, liveSymbolPrices]
  );

  // Track Max Equity high-watermark cleanly
  useEffect(() => {
    if (demoMetrics.equity > demoAccount.propShield.maxEquity + 0.5) {
      setDemoAccount((prev) => ({
        ...prev,
        propShield: {
          ...prev.propShield,
          maxEquity: Number(demoMetrics.equity.toFixed(2)),
        },
      }));
    }
  }, [demoMetrics.equity, demoAccount.propShield.maxEquity]);

  const activeDemoSymbol = useMemo<SmcSymbol>(() => {
    if (selectedMarketSymbol.includes('EUR')) return 'EURUSD';
    if (selectedMarketSymbol.includes('BTC')) return 'BTCUSDT';
    if (selectedMarketSymbol.includes('ETH')) return 'ETHUSDT';
    if (selectedMarketSymbol.includes('SOL')) return 'SOLUSDT';
    if (selectedMarketSymbol.includes('BNB')) return 'BNBUSDT';
    if (selectedMarketSymbol.includes('XRP')) return 'XRPUSDT';
    if (selectedMarketSymbol.includes('XAG')) return 'XAGUSD';
    if (selectedMarketSymbol.includes('DJI') || selectedMarketSymbol.includes('US30')) return 'US30';
    if (selectedMarketSymbol.includes('SPX') || selectedMarketSymbol.includes('US500')) return 'US500';
    if (selectedMarketSymbol.includes('USOIL')) return 'USOIL';
    return 'XAUUSD';
  }, [selectedMarketSymbol]);

  const handleExecuteDemoOrder = useCallback(
    (sym: SmcSymbol, side: 'BUY' | 'SELL', lots: number, opts?: ExecuteOrderOptions): string | null => {
      if (marginCallActive || demoAccount.balance <= 0 || demoMetrics.equity <= 0) {
        return 'Margin Call: Balance Depleted — Reset $1,000 Demo';
      }

      // Revenge-trade / overtrading guard
      const recent2 = demoAccount.history.slice(0, 2);
      const isRevengeRisk =
        recent2.length === 2 &&
        recent2[0].pnl < 0 &&
        recent2[1].pnl < 0 &&
        Date.now() - recent2[0].closedAt < 120_000;

      const cleanLots = Math.max(0.01, Math.min(10, Number(lots.toFixed(2))));
      const spec = DEMO_SYMBOL_SPECS[sym] ?? DEMO_SYMBOL_SPECS.XAUUSD;
      const midPrice = liveSymbolPrices[sym] ?? spec.defaultPrice;
      const { bid, ask } = getBidAskPrices(sym, midPrice, { simMode: demoAccount.simMode });
      const entryPrice = side === 'BUY' ? ask : bid;
      const reqMargin = calcRequiredMargin(sym, cleanLots, entryPrice, demoAccount.leverage);
      if (reqMargin > demoMetrics.freeMargin) {
        return `Insufficient free margin (need $${reqMargin.toFixed(2)})`;
      }

      const cleanTp =
        typeof opts?.tp === 'number' && Number.isFinite(opts.tp) && opts.tp > 0
          ? Number(opts.tp.toFixed(spec.precision))
          : undefined;
      const cleanSl =
        typeof opts?.sl === 'number' && Number.isFinite(opts.sl) && opts.sl > 0
          ? Number(opts.sl.toFixed(spec.precision))
          : undefined;

      const newPos: DemoPosition = {
        id: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        symbol: sym,
        side,
        lots: cleanLots,
        entryPrice,
        openedAt: Date.now(),
        tp: cleanTp,
        sl: cleanSl,
        initialSlDistance: cleanSl ? Math.abs(entryPrice - cleanSl) : undefined,
        autoBreakeven: opts?.autoBreakeven ?? false,
        trailingMode: opts?.trailingMode ?? 'fixed',
        note: opts?.note,
      };
      setDemoAccount((prev) => ({
        ...prev,
        defaultLot: cleanLots,
        positions: [newPos, ...prev.positions].slice(0, 40),
      }));
      playTradeChime('entry', demoAccount.propShield.soundEnabled);
      triggerHaptic(16, demoAccount.propShield.hapticsEnabled);

      if (isRevengeRisk) {
        setAlertBanner({
          title: 'Psychology Guard',
          body: '2 rapid losses detected within 2m — verify A+ confluence before sizing up.',
        });
      }
      return null;
    },
    [
      marginCallActive,
      demoAccount.balance,
      demoAccount.leverage,
      demoAccount.simMode,
      demoAccount.history,
      demoAccount.propShield.soundEnabled,
      demoAccount.propShield.hapticsEnabled,
      demoMetrics.equity,
      demoMetrics.freeMargin,
      liveSymbolPrices,
    ]
  );

  const handlePlaceLimitOrder = useCallback(
    (
      sym: SmcSymbol,
      side: 'BUY' | 'SELL',
      lots: number,
      limitPrice: number,
      tp?: number,
      sl?: number,
      label?: string
    ): string | null => {
      if (marginCallActive || demoAccount.balance <= 0) {
        return 'Balance Depleted — Reset Demo Account first';
      }
      const spec = DEMO_SYMBOL_SPECS[sym] ?? DEMO_SYMBOL_SPECS.XAUUSD;
      const cleanLots = Math.max(0.01, Math.min(10, Number(lots.toFixed(2))));
      const cleanLimit = Number(limitPrice.toFixed(spec.precision));
      const midPrice = liveSymbolPrices[sym] ?? spec.defaultPrice;
      const { bid, ask } = getBidAskPrices(sym, midPrice, { simMode: demoAccount.simMode });
      const refPrice = side === 'BUY' ? ask : bid;
      const triggerMode: 'above' | 'below' = cleanLimit >= refPrice ? 'above' : 'below';
      const order: DemoLimitOrder = {
        id: `lim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        symbol: sym,
        side,
        lots: cleanLots,
        limitPrice: cleanLimit,
        triggerMode,
        tp: typeof tp === 'number' && Number.isFinite(tp) && tp > 0 ? Number(tp.toFixed(spec.precision)) : undefined,
        sl: typeof sl === 'number' && Number.isFinite(sl) && sl > 0 ? Number(sl.toFixed(spec.precision)) : undefined,
        createdAt: Date.now(),
        label,
      };
      setDemoAccount((prev) => ({
        ...prev,
        pendingOrders: [order, ...prev.pendingOrders].slice(0, 30),
      }));
      playTradeChime('entry', demoAccount.propShield.soundEnabled);
      triggerHaptic(12, demoAccount.propShield.hapticsEnabled);
      return null;
    },
    [marginCallActive, demoAccount.balance, demoAccount.simMode, demoAccount.propShield.soundEnabled, demoAccount.propShield.hapticsEnabled, liveSymbolPrices]
  );

  const handleCancelLimitOrder = useCallback((orderId: string) => {
    setDemoAccount((prev) => ({
      ...prev,
      pendingOrders: prev.pendingOrders.filter((o) => o.id !== orderId),
    }));
  }, []);

  const createClosedRow = useCallback(
    (pos: DemoPosition, closePrice: number, lotsToClose: number, closedAt: number, simMode: BrokerSimMode): DemoClosedTrade => {
      const scaledPos = { ...pos, lots: lotsToClose };
      const pnl = Number(calcPositionPnl(scaledPos, closePrice, simMode).toFixed(2));
      const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
      const risk = pos.initialSlDistance ? pos.initialSlDistance * lotsToClose * spec.contractSize : Math.max(5, lotsToClose * spec.defaultPrice * 0.002 * spec.contractSize);
      const rMultiple = risk > 0 ? Number((pnl / risk).toFixed(2)) : undefined;
      const baseRow: DemoClosedTrade = {
        id: `${pos.id}_${closedAt}_${Math.random().toString(36).slice(2, 5)}`,
        symbol: pos.symbol,
        side: pos.side,
        lots: lotsToClose,
        entryPrice: pos.entryPrice,
        closePrice,
        pnl,
        closedAt,
        openedAt: pos.openedAt,
        emotionTag: 'Plan',
        rMultiple,
      };
      baseRow.aiReview = reviewClosedTradeWithAi(baseRow);
      return baseRow;
    },
    []
  );

  const handleCloseDemoPosition = useCallback(
    (positionId: string) => {
      setDemoAccount((prev) => {
        const target = prev.positions.find((p) => p.id === positionId);
        if (!target) return prev;
        const spec = DEMO_SYMBOL_SPECS[target.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const closePrice = liveSymbolPrices[target.symbol] ?? target.entryPrice ?? spec.defaultPrice;
        const row = createClosedRow(target, closePrice, target.lots, Date.now(), prev.simMode);
        playTradeChime(row.pnl >= 0 ? 'tp' : 'sl', prev.propShield.soundEnabled);
        return {
          ...prev,
          balance: Math.max(0, Number((prev.balance + row.pnl).toFixed(2))),
          positions: prev.positions.filter((p) => p.id !== positionId),
          history: [row, ...prev.history].slice(0, 150),
        };
      });
    },
    [liveSymbolPrices, createClosedRow]
  );

  const handlePartialCloseDemoPosition = useCallback(
    (positionId: string, pct: 0.25 | 0.5) => {
      setDemoAccount((prev) => {
        const target = prev.positions.find((p) => p.id === positionId);
        if (!target) return prev;
        const closeLots = Number((target.lots * pct).toFixed(2));
        if (closeLots < 0.01 || target.lots - closeLots < 0.01) {
          // Close entire position if too small to split
          const spec = DEMO_SYMBOL_SPECS[target.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
          const closePrice = liveSymbolPrices[target.symbol] ?? target.entryPrice ?? spec.defaultPrice;
          const row = createClosedRow(target, closePrice, target.lots, Date.now(), prev.simMode);
          return {
            ...prev,
            balance: Math.max(0, Number((prev.balance + row.pnl).toFixed(2))),
            positions: prev.positions.filter((p) => p.id !== positionId),
            history: [row, ...prev.history].slice(0, 150),
          };
        }
        const remLots = Number((target.lots - closeLots).toFixed(2));
        const spec = DEMO_SYMBOL_SPECS[target.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const closePrice = liveSymbolPrices[target.symbol] ?? target.entryPrice ?? spec.defaultPrice;
        const row = createClosedRow(target, closePrice, closeLots, Date.now(), prev.simMode);
        playTradeChime('tp', prev.propShield.soundEnabled);
        return {
          ...prev,
          balance: Math.max(0, Number((prev.balance + row.pnl).toFixed(2))),
          positions: prev.positions.map((p) => (p.id === positionId ? { ...p, lots: remLots } : p)),
          history: [row, ...prev.history].slice(0, 150),
        };
      });
    },
    [liveSymbolPrices, createClosedRow]
  );

  const handleReverseDemoPosition = useCallback(
    (positionId: string) => {
      setDemoAccount((prev) => {
        const target = prev.positions.find((p) => p.id === positionId);
        if (!target) return prev;
        const spec = DEMO_SYMBOL_SPECS[target.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const mid = liveSymbolPrices[target.symbol] ?? target.entryPrice ?? spec.defaultPrice;
        const { bid, ask } = getBidAskPrices(target.symbol, mid, { simMode: prev.simMode });
        const closed = createClosedRow(target, mid, target.lots, Date.now(), prev.simMode);
        const revSide: 'BUY' | 'SELL' = target.side === 'BUY' ? 'SELL' : 'BUY';
        const revEntry = revSide === 'BUY' ? ask : bid;
        const reversed: DemoPosition = {
          id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          symbol: target.symbol,
          side: revSide,
          lots: target.lots,
          entryPrice: revEntry,
          openedAt: Date.now(),
        };
        playTradeChime('entry', prev.propShield.soundEnabled);
        return {
          ...prev,
          balance: Math.max(0, Number((prev.balance + closed.pnl).toFixed(2))),
          positions: [reversed, ...prev.positions.filter((p) => p.id !== positionId)],
          history: [closed, ...prev.history].slice(0, 150),
        };
      });
    },
    [liveSymbolPrices, createClosedRow]
  );

  const handleHedgeDemoPosition = useCallback(
    (positionId: string) => {
      setDemoAccount((prev) => {
        const target = prev.positions.find((p) => p.id === positionId);
        if (!target) return prev;
        const spec = DEMO_SYMBOL_SPECS[target.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const mid = liveSymbolPrices[target.symbol] ?? target.entryPrice ?? spec.defaultPrice;
        const { bid, ask } = getBidAskPrices(target.symbol, mid, { simMode: prev.simMode });
        const hedgeSide: 'BUY' | 'SELL' = target.side === 'BUY' ? 'SELL' : 'BUY';
        const hedgePos: DemoPosition = {
          id: `hdg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          symbol: target.symbol,
          side: hedgeSide,
          lots: target.lots,
          entryPrice: hedgeSide === 'BUY' ? ask : bid,
          openedAt: Date.now(),
          isHedge: true,
          hedgeOfId: target.id,
          note: 'Hedge Lock',
        };
        playTradeChime('entry', prev.propShield.soundEnabled);
        return {
          ...prev,
          positions: [hedgePos, ...prev.positions].slice(0, 40),
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
        const row = createClosedRow(pos, closePrice, pos.lots, now, prev.simMode);
        totalPnl += row.pnl;
        return row;
      });
      return {
        ...prev,
        balance: Math.max(0, Number((prev.balance + totalPnl).toFixed(2))),
        positions: [],
        history: [...closedRows, ...prev.history].slice(0, 150),
      };
    });
  }, [liveSymbolPrices, createClosedRow]);

  const handleCloseProfitablePositions = useCallback(() => {
    setDemoAccount((prev) => {
      const now = Date.now();
      let realized = 0;
      const closed: DemoClosedTrade[] = [];
      const kept: DemoPosition[] = [];
      for (const pos of prev.positions) {
        const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const mark = liveSymbolPrices[pos.symbol] ?? pos.entryPrice ?? spec.defaultPrice;
        const pnl = calcPositionPnl(pos, mark, prev.simMode);
        if (pnl > 0) {
          const row = createClosedRow(pos, mark, pos.lots, now, prev.simMode);
          realized += row.pnl;
          closed.push(row);
        } else {
          kept.push(pos);
        }
      }
      if (closed.length === 0) return prev;
      playTradeChime('tp', prev.propShield.soundEnabled);
      return {
        ...prev,
        balance: Math.max(0, Number((prev.balance + realized).toFixed(2))),
        positions: kept,
        history: [...closed, ...prev.history].slice(0, 150),
      };
    });
  }, [liveSymbolPrices, createClosedRow]);

  const handleCloseLosingPositions = useCallback(() => {
    setDemoAccount((prev) => {
      const now = Date.now();
      let realized = 0;
      const closed: DemoClosedTrade[] = [];
      const kept: DemoPosition[] = [];
      for (const pos of prev.positions) {
        const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const mark = liveSymbolPrices[pos.symbol] ?? pos.entryPrice ?? spec.defaultPrice;
        const pnl = calcPositionPnl(pos, mark, prev.simMode);
        if (pnl < 0) {
          const row = createClosedRow(pos, mark, pos.lots, now, prev.simMode);
          realized += row.pnl;
          closed.push(row);
        } else {
          kept.push(pos);
        }
      }
      if (closed.length === 0) return prev;
      return {
        ...prev,
        balance: Math.max(0, Number((prev.balance + realized).toFixed(2))),
        positions: kept,
        history: [...closed, ...prev.history].slice(0, 150),
      };
    });
  }, [liveSymbolPrices, createClosedRow]);

  const handleChangeDemoLeverage = useCallback((leverage: DemoLeverage) => {
    setDemoAccount((prev) => ({ ...prev, leverage }));
  }, []);

  const handleChangeDemoDefaultLot = useCallback((defaultLot: number) => {
    const clean = Math.max(0.01, Math.min(10, Number(defaultLot.toFixed(2))));
    setDemoAccount((prev) => ({ ...prev, defaultLot: clean }));
  }, []);

  const handleChangeSimMode = useCallback((simMode: BrokerSimMode) => {
    setDemoAccount((prev) => ({ ...prev, simMode }));
  }, []);

  const handleUpdatePropShield = useCallback((patch: Partial<PropShieldConfig>) => {
    setDemoAccount((prev) => ({
      ...prev,
      propShield: { ...prev.propShield, ...patch },
    }));
  }, []);

  const handleUpdateTradeEmotion = useCallback((tradeId: string, emotionTag: TradeEmotionTag) => {
    setDemoAccount((prev) => ({
      ...prev,
      history: prev.history.map((tr) => {
        if (tr.id !== tradeId) return tr;
        const updated = { ...tr, emotionTag };
        return { ...updated, aiReview: reviewClosedTradeWithAi(updated) };
      }),
    }));
  }, []);

  const handleResetDemoAccount = useCallback(() => {
    setDemoAccount(createInitialDemoAccount());
    setMarginCallActive(false);
  }, []);

  const handleSetCustomBalance = useCallback((balance: number) => {
    const clean = Math.max(0, Number(balance.toFixed(2)));
    setDemoAccount((prev) => ({
      ...prev,
      balance: clean,
      propShield: {
        ...prev.propShield,
        dailyStartEquity: clean,
        maxEquity: Math.max(clean, 1),
      },
    }));
    setMarginCallActive(clean <= 0);
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
          return {
            ...pos,
            tp: cleanTp,
            sl: cleanSl,
            initialSlDistance: cleanSl ? Math.abs(pos.entryPrice - cleanSl) : pos.initialSlDistance,
            trailingDistance: cleanSl === undefined ? undefined : pos.trailingDistance,
          };
        }),
      }));
    },
    []
  );

  const handleToggleDemoTrailingStop = useCallback(
    (positionId: string, mode: TrailingMode = 'fixed') => {
      setDemoAccount((prev) => ({
        ...prev,
        positions: prev.positions.map((pos) => {
          if (pos.id !== positionId || pos.sl === undefined) return pos;
          if (pos.trailingDistance !== undefined && pos.trailingMode === mode) {
            return { ...pos, trailingDistance: undefined };
          }
          const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
          const mark = liveSymbolPrices[pos.symbol] ?? pos.entryPrice ?? spec.defaultPrice;
          const baseDist = Math.abs(mark - pos.sl);
          const mult = mode === 'atr' ? 1.25 : mode === 'ema20' ? 0.9 : mode === 'swing' ? 1.1 : 1;
          const minStep = Math.max(spec.defaultPrice * 0.0005, baseDist * mult);
          return {
            ...pos,
            trailingMode: mode,
            trailingDistance: Number(minStep.toFixed(spec.precision)),
          };
        }),
      }));
    },
    [liveSymbolPrices]
  );

  // Auto-fill pending Limit Orders when price touches limit
  useEffect(() => {
    if (demoAccount.pendingOrders.length === 0) return;
    const filledIds = new Set<string>();
    const newlyOpened: DemoPosition[] = [];

    for (const ord of demoAccount.pendingOrders) {
      const mid = liveSymbolPrices[ord.symbol];
      if (!mid || !Number.isFinite(mid)) continue;
      const { bid, ask } = getBidAskPrices(ord.symbol, mid, { simMode: demoAccount.simMode });
      const execPx = ord.side === 'BUY' ? ask : bid;
      const touched =
        ord.triggerMode === 'above'
          ? execPx >= ord.limitPrice
          : ord.triggerMode === 'below'
            ? execPx <= ord.limitPrice
            : ord.side === 'BUY'
              ? ask <= ord.limitPrice
              : bid >= ord.limitPrice;
      if (touched) {
        filledIds.add(ord.id);
        newlyOpened.push({
          id: `limfill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          symbol: ord.symbol,
          side: ord.side,
          lots: ord.lots,
          entryPrice: ord.limitPrice,
          openedAt: Date.now(),
          tp: ord.tp,
          sl: ord.sl,
          initialSlDistance: ord.sl ? Math.abs(ord.limitPrice - ord.sl) : undefined,
          note: ord.label ?? 'Limit Filled',
        });
      }
    }

    if (filledIds.size === 0) return;
    playTradeChime('entry', demoAccount.propShield.soundEnabled);
    triggerHaptic([15, 25, 15], demoAccount.propShield.hapticsEnabled);
    setDemoAccount((prev) => ({
      ...prev,
      pendingOrders: prev.pendingOrders.filter((o) => !filledIds.has(o.id)),
      positions: [...newlyOpened, ...prev.positions].slice(0, 40),
    }));
  }, [liveSymbolPrices, demoAccount.pendingOrders, demoAccount.simMode, demoAccount.propShield.soundEnabled, demoAccount.propShield.hapticsEnabled]);

  // Auto-Breakeven (+1R), Smart Trailing SL, Trailing TP & TP/SL Execution
  useEffect(() => {
    if (demoAccount.positions.length === 0) return;

    let anyUpdated = false;
    const updatedPositions = demoAccount.positions.map((pos) => {
      const mark = liveSymbolPrices[pos.symbol];
      if (!mark || !Number.isFinite(mark)) return pos;
      const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
      let nextPos = pos;

      // Auto-Breakeven at +1R
      if (pos.autoBreakeven && !pos.breakevenTriggered && pos.sl !== undefined) {
        const riskDist = pos.initialSlDistance ?? Math.abs(pos.entryPrice - pos.sl);
        const fav = pos.side === 'BUY' ? mark - pos.entryPrice : pos.entryPrice - mark;
        if (riskDist > 0 && fav >= riskDist) {
          anyUpdated = true;
          nextPos = {
            ...nextPos,
            sl: Number(pos.entryPrice.toFixed(spec.precision)),
            breakevenTriggered: true,
          };
        }
      }

      // Trailing SL
      if (nextPos.trailingDistance !== undefined && nextPos.sl !== undefined) {
        if (nextPos.side === 'BUY') {
          const candSl = Number((mark - nextPos.trailingDistance).toFixed(spec.precision));
          if (candSl > nextPos.sl && candSl < mark) {
            anyUpdated = true;
            nextPos = { ...nextPos, sl: candSl };
          }
        } else {
          const candSl = Number((mark + nextPos.trailingDistance).toFixed(spec.precision));
          if (candSl < nextPos.sl && candSl > mark) {
            anyUpdated = true;
            nextPos = { ...nextPos, sl: candSl };
          }
        }
      }

      // Dynamic Trailing TP extension when price reaches 90% to TP
      if (nextPos.trailingTpStep && nextPos.tp !== undefined) {
        const distToTp = nextPos.side === 'BUY' ? nextPos.tp - mark : mark - nextPos.tp;
        if (distToTp > 0 && distToTp <= nextPos.trailingTpStep * 0.25) {
          anyUpdated = true;
          const extendedTp =
            nextPos.side === 'BUY'
              ? Number((nextPos.tp + nextPos.trailingTpStep).toFixed(spec.precision))
              : Number((nextPos.tp - nextPos.trailingTpStep).toFixed(spec.precision));
          const lockSl = Number(
            (nextPos.side === 'BUY' ? mark - nextPos.trailingTpStep * 0.6 : mark + nextPos.trailingTpStep * 0.6).toFixed(spec.precision)
          );
          nextPos = { ...nextPos, tp: extendedTp, sl: lockSl };
        }
      }

      return nextPos;
    });

    const triggeredIds = new Set<string>();
    let anyTpHit = false;
    for (const pos of updatedPositions) {
      const mid = liveSymbolPrices[pos.symbol];
      if (!mid || !Number.isFinite(mid)) continue;
      const { bid, ask } = getBidAskPrices(pos.symbol, mid, { simMode: demoAccount.simMode });
      if (pos.side === 'BUY') {
        const hitTp = pos.tp !== undefined && bid >= pos.tp;
        const hitSl = pos.sl !== undefined && bid <= pos.sl;
        if (hitTp || hitSl) {
          if (hitTp) anyTpHit = true;
          triggeredIds.add(pos.id);
        }
      } else {
        const hitTp = pos.tp !== undefined && ask <= pos.tp;
        const hitSl = pos.sl !== undefined && ask >= pos.sl;
        if (hitTp || hitSl) {
          if (hitTp) anyTpHit = true;
          triggeredIds.add(pos.id);
        }
      }
    }

    if (!anyUpdated && triggeredIds.size === 0) return;
    if (triggeredIds.size > 0) {
      playTradeChime(anyTpHit ? 'tp' : 'sl', demoAccount.propShield.soundEnabled);
      triggerHaptic(anyTpHit ? [20, 40, 20] : 40, demoAccount.propShield.hapticsEnabled);
    }

    setDemoAccount((prev) => {
      let realized = 0;
      const closedRows: DemoClosedTrade[] = [];
      const remaining: DemoPosition[] = [];
      const now = Date.now();
      for (const pos of prev.positions) {
        const uPos = updatedPositions.find((p) => p.id === pos.id) ?? pos;
        if (!triggeredIds.has(uPos.id)) {
          remaining.push(uPos);
          continue;
        }
        const spec = DEMO_SYMBOL_SPECS[uPos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
        const closePrice = liveSymbolPrices[uPos.symbol] ?? uPos.entryPrice ?? spec.defaultPrice;
        const row = createClosedRow(uPos, closePrice, uPos.lots, now, prev.simMode);
        if (Number.isFinite(row.pnl)) {
          realized += row.pnl;
        }
        closedRows.push(row);
      }
      const nextBalance = Number.isFinite(prev.balance + realized)
        ? Math.max(0, Number((prev.balance + realized).toFixed(2)))
        : prev.balance;
      return {
        ...prev,
        balance: nextBalance,
        positions: remaining,
        history: closedRows.length > 0 ? [...closedRows, ...prev.history].slice(0, 150) : prev.history,
      };
    });
  }, [liveSymbolPrices, demoAccount.positions, demoAccount.simMode, demoAccount.propShield.soundEnabled, demoAccount.propShield.hapticsEnabled, createClosedRow]);

  // Strict Margin Call / Stop-Out Guard (only on verified finite equity <= 0)
  useEffect(() => {
    if (demoAccount.positions.length > 0 && Number.isFinite(demoMetrics.equity) && demoMetrics.equity <= 0) {
      setMarginCallActive(true);
      setDemoAccount((prev) => {
        if (prev.positions.length === 0) return { ...prev, balance: 0 };
        const now = Date.now();
        const liquidated = prev.positions.map((pos) => {
          const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
          const closePrice = liveSymbolPrices[pos.symbol] ?? pos.entryPrice ?? spec.defaultPrice;
          return createClosedRow(pos, closePrice, pos.lots, now, prev.simMode);
        });
        return {
          ...prev,
          balance: 0,
          positions: [],
          history: [...liquidated, ...prev.history].slice(0, 150),
        };
      });
    } else if (demoAccount.balance <= 0 && demoAccount.positions.length === 0) {
      setMarginCallActive(true);
    } else if (demoAccount.balance > 0 && marginCallActive) {
      setMarginCallActive(false);
    }
  }, [demoAccount.positions.length, demoAccount.balance, demoMetrics.equity, liveSymbolPrices, createClosedRow, marginCallActive]);

  const isDarkSplash = themeMode === 'dark';
  const splashOverlay = showSplash ? (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center px-4 text-center transition-opacity duration-300 ${
        isDarkSplash ? 'bg-[#060911]' : 'bg-[#FFFFFF]'
      } ${splashFading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="relative mb-6">
        <div className="absolute -inset-3 rounded-full bg-[#10B981]/20 blur-xl animate-pulse" />
        <img
          src="/logo.png"
          alt="TREDAURA Logo"
          className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover shadow-2xl border-2 border-[#F59E0B]"
        />
      </div>
      <h1
        className={`font-display text-2xl sm:text-3xl font-extrabold tracking-wide mb-1 ${
          isDarkSplash ? 'text-[#FFFFFF]' : 'text-[#131722]'
        }`}
      >
        TREDAURA
      </h1>
      <p className="text-xs sm:text-sm font-bold tracking-widest text-[#F59E0B] uppercase mb-8">
        TRADE • ANALYZE • GROW
      </p>
      <div
        className={`w-48 sm:w-56 h-1.5 rounded-full overflow-hidden border border-[var(--vp-border)] ${
          isDarkSplash ? 'bg-[#0F1626]' : 'bg-[#F1F5F9]'
        }`}
      >
        <div className="h-full bg-[#F59E0B] rounded-full animate-pulse" style={{ width: '100%', animationDuration: '1.8s' }} />
      </div>
    </div>
  ) : null;

  if (activeTab === 'academy') {
    return (
      <div className="vp-tab-stage min-h-screen bg-[var(--vp-canvas)] text-[var(--vp-text)] overflow-x-hidden">
        {splashOverlay}
        <AcademyView
          onOpenPairInTerminal={handleOpenPairInTerminal}
          onNavigateTab={handleSelectTab}
          themeMode={themeMode}
          demoFloatingPnl={demoMetrics.floatingPnl}
          openPositionsCount={demoAccount.positions.length}
          onOpenDemoDrawer={() => setDemoDrawerOpen(true)}
        />
        <BottomNavBar activeTab={activeTab} onSelectTab={handleSelectTab} alwaysVisible />
        <DemoAccountDrawer
          isOpen={demoDrawerOpen}
          onClose={() => setDemoDrawerOpen(false)}
          account={demoAccount}
          metrics={demoMetrics}
          activeSymbol={activeDemoSymbol}
          livePrices={liveSymbolPrices}
          marginCallActive={marginCallActive}
          onExecuteOrder={handleExecuteDemoOrder}
          onPlaceLimitOrder={handlePlaceLimitOrder}
          onCancelLimitOrder={handleCancelLimitOrder}
          onClosePosition={handleCloseDemoPosition}
          onPartialClosePosition={handlePartialCloseDemoPosition}
          onReversePosition={handleReverseDemoPosition}
          onHedgePosition={handleHedgeDemoPosition}
          onCloseProfitablePositions={handleCloseProfitablePositions}
          onCloseLosingPositions={handleCloseLosingPositions}
          onCloseAllPositions={handleCloseAllDemoPositions}
          onUpdateTpSl={handleUpdateDemoPositionTpSl}
          onToggleTrailingStop={handleToggleDemoTrailingStop}
          onChangeLeverage={handleChangeDemoLeverage}
          onChangeDefaultLot={handleChangeDemoDefaultLot}
          onChangeSimMode={handleChangeSimMode}
          onUpdatePropShield={handleUpdatePropShield}
          onUpdateTradeEmotion={handleUpdateTradeEmotion}
          onResetAccount={handleResetDemoAccount}
          onSetCustomBalance={handleSetCustomBalance}
        />
        <OfflineIndicator />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--vp-canvas)] text-[var(--vp-text)] transition-colors overflow-x-hidden">
      {splashOverlay}
      <HeaderNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        typography={typography}
        demoEquity={demoMetrics.equity}
        demoFloatingPnl={demoMetrics.floatingPnl}
        openPositionsCount={demoAccount.positions.length}
        onOpenDemoDrawer={() => setDemoDrawerOpen(true)}
        onRefreshCharts={handleRefreshCharts}
        isRefreshingCharts={isRefreshingMarkets}
      />

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
            <div className="min-w-0">
              <strong className="font-bold" style={{ color: 'var(--vp-accent-text)' }}>
                {alertBanner.title}:{' '}
              </strong>
              <span className="break-words">{alertBanner.body}</span>
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

      <main
        key={activeTab}
        className={
          activeTab === 'terminal' && !activeMarketAsset
            ? 'vp-tab-stage h-[calc(100dvh-110px)] md:h-[calc(100dvh-56px)] mx-auto max-w-7xl px-1.5 sm:px-4 py-1 overflow-hidden flex flex-col'
            : activeTab === 'news'
              ? 'vp-tab-stage h-[calc(100dvh-110px)] md:h-[calc(100dvh-56px)] mx-auto max-w-7xl px-2 sm:px-4 py-1 overflow-hidden'
              : 'vp-tab-stage mx-auto max-w-7xl px-2 sm:px-5 pt-2.5 pb-20 md:pb-6 overflow-x-hidden'
        }
      >
        {activeTab === 'ai' ? (
          <AiSuiteView
            onNavigateTab={handleSelectTab}
            onSelectSymbolAndJump={handleOpenPairInTerminal}
            themeMode={themeMode}
            demoPositions={demoAccount.positions}
            demoMetrics={demoMetrics}
            demoBalance={demoAccount.balance}
            onExecuteDemoOrder={handleExecuteDemoOrder}
            onPlaceLimitOrder={handlePlaceLimitOrder}
            onPartialCloseDemoPosition={handlePartialCloseDemoPosition}
            onUpdateDemoPositionTpSl={handleUpdateDemoPositionTpSl}
            onCloseDemoPosition={handleCloseDemoPosition}
            onApplyAiSetupToTerminal={(_setup, sym) => {
              const tvMap: Record<string, string> = {
                XAUUSD: 'OANDA:XAUUSD',
                EURUSD: 'FX:EURUSD',
                XAGUSD: 'OANDA:XAGUSD',
                BTCUSDT: 'BINANCE:BTCUSDT',
                ETHUSDT: 'BINANCE:ETHUSDT',
                SOLUSDT: 'BINANCE:SOLUSDT',
                BNBUSDT: 'BINANCE:BNBUSDT',
                XRPUSDT: 'BINANCE:XRPUSDT',
                US500: 'FOREXCOM:SPXUSD',
                US30: 'TVC:DJI',
                USOIL: 'TVC:USOIL',
              };
              setSelectedMarketSymbol(tvMap[sym] ?? 'OANDA:XAUUSD');
              setActiveTab('terminal');
            }}
          />
        ) : activeTab === 'terminal' ? (
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
              demoPendingOrders={demoAccount.pendingOrders}
              demoHistory={demoAccount.history}
              demoMetrics={demoMetrics}
              demoDefaultLot={demoAccount.defaultLot}
              simMode={demoAccount.simMode}
              marginCallActive={marginCallActive}
              onExecuteDemoOrder={handleExecuteDemoOrder}
              onPlaceLimitOrder={handlePlaceLimitOrder}
              onCancelLimitOrder={handleCancelLimitOrder}
              onCloseDemoPosition={handleCloseDemoPosition}
              onPartialCloseDemoPosition={handlePartialCloseDemoPosition}
              onReverseDemoPosition={handleReverseDemoPosition}
              onHedgeDemoPosition={handleHedgeDemoPosition}
              onCloseProfitablePositions={handleCloseProfitablePositions}
              onCloseLosingPositions={handleCloseLosingPositions}
              onCloseAllPositions={handleCloseAllDemoPositions}
              onUpdateDemoPositionTpSl={handleUpdateDemoPositionTpSl}
              onToggleDemoTrailingStop={handleToggleDemoTrailingStop}
              onChangeDemoDefaultLot={handleChangeDemoDefaultLot}
              onResetDemoAccount={handleResetDemoAccount}
              onOpenDemoDrawer={() => setDemoDrawerOpen(true)}
              onLivePriceTick={handleLivePriceTick}
            />
          )
        ) : (
          <NewsTerminalView themeMode={themeMode} livePrices={liveSymbolPrices} />
        )}
      </main>

      <DemoAccountDrawer
        isOpen={demoDrawerOpen}
        onClose={() => setDemoDrawerOpen(false)}
        account={demoAccount}
        metrics={demoMetrics}
        activeSymbol={activeDemoSymbol}
        livePrices={liveSymbolPrices}
        marginCallActive={marginCallActive}
        onExecuteOrder={handleExecuteDemoOrder}
        onPlaceLimitOrder={handlePlaceLimitOrder}
        onCancelLimitOrder={handleCancelLimitOrder}
        onClosePosition={handleCloseDemoPosition}
        onPartialClosePosition={handlePartialCloseDemoPosition}
        onReversePosition={handleReverseDemoPosition}
        onHedgePosition={handleHedgeDemoPosition}
        onCloseProfitablePositions={handleCloseProfitablePositions}
        onCloseLosingPositions={handleCloseLosingPositions}
        onCloseAllPositions={handleCloseAllDemoPositions}
        onUpdateTpSl={handleUpdateDemoPositionTpSl}
        onToggleTrailingStop={handleToggleDemoTrailingStop}
        onChangeLeverage={handleChangeDemoLeverage}
        onChangeDefaultLot={handleChangeDemoDefaultLot}
        onChangeSimMode={handleChangeSimMode}
        onUpdatePropShield={handleUpdatePropShield}
        onUpdateTradeEmotion={handleUpdateTradeEmotion}
        onResetAccount={handleResetDemoAccount}
        onSetCustomBalance={handleSetCustomBalance}
      />

      <BottomNavBar activeTab={activeTab} onSelectTab={handleSelectTab} />
      <OfflineIndicator />
    </div>
  );
}
