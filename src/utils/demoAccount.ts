import type { SmcSymbol } from '../components/ProSmcTerminal';

export const DEMO_INITIAL_BALANCE = 1000;
export const DEMO_STORAGE_KEY = 'vp_demo_account_v1';
export const DEMO_LOCAL_KEYS = {
  balance: 'demoBalance',
  openTrades: 'openTrades',
  pendingOrders: 'pendingOrders',
  tradeHistory: 'tradeHistory',
} as const;

export type DemoLeverage = 50 | 100 | 200 | 500 | 1000;
export type BrokerSimMode = 'real' | 'zero';
export type TrailingMode = 'fixed' | 'swing' | 'ema20' | 'atr';
export type TradeEmotionTag = 'Plan' | 'FOMO' | 'Revenge' | 'Greed' | 'Disciplined';

export interface DemoPosition {
  id: string;
  symbol: SmcSymbol;
  side: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  openedAt: number;
  tp?: number;
  sl?: number;
  trailingDistance?: number;
  trailingMode?: TrailingMode;
  autoBreakeven?: boolean;
  breakevenTriggered?: boolean;
  trailingTpStep?: number;
  initialSlDistance?: number;
  isHedge?: boolean;
  hedgeOfId?: string;
  note?: string;
}

export interface DemoLimitOrder {
  id: string;
  symbol: SmcSymbol;
  side: 'BUY' | 'SELL';
  lots: number;
  limitPrice: number;
  triggerMode?: 'above' | 'below';
  tp?: number;
  sl?: number;
  createdAt: number;
  label?: string;
}

export interface DemoClosedTrade {
  id: string;
  symbol: SmcSymbol;
  side: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  closePrice: number;
  pnl: number;
  closedAt: number;
  openedAt?: number;
  emotionTag?: TradeEmotionTag;
  aiReview?: string;
  rMultiple?: number;
}

export interface PropShieldConfig {
  dailyStartEquity: number;
  dailyStartDayKey: string;
  maxEquity: number;
  dailyLossLimitPct: number; // default 5%
  maxDrawdownPct: number; // default 10%
  dailyProfitTargetPct: number; // default 4%
  profitLockEnabled: boolean;
  preTradeChecklistEnabled: boolean;
  volatilityLotReducer: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}

export interface DemoAccountState {
  balance: number;
  leverage: DemoLeverage;
  defaultLot: number;
  simMode: BrokerSimMode;
  positions: DemoPosition[];
  pendingOrders: DemoLimitOrder[];
  history: DemoClosedTrade[];
  propShield: PropShieldConfig;
}

export interface DemoSymbolSpec {
  symbol: SmcSymbol;
  shortLabel: string;
  contractSize: number;
  precision: number;
  defaultPrice: number;
  spread: number;
  pipSize: number;
}

export const DEMO_SYMBOL_SPECS: Record<SmcSymbol, DemoSymbolSpec> = {
  XAUUSD: { symbol: 'XAUUSD', shortLabel: 'XAU/USD', contractSize: 100, precision: 2, defaultPrice: 3515.4, spread: 0.28, pipSize: 0.1 },
  EURUSD: { symbol: 'EURUSD', shortLabel: 'EUR/USD', contractSize: 100000, precision: 4, defaultPrice: 1.085, spread: 0.00012, pipSize: 0.0001 },
  XAGUSD: { symbol: 'XAGUSD', shortLabel: 'XAG/USD', contractSize: 1000, precision: 2, defaultPrice: 33.2, spread: 0.03, pipSize: 0.01 },
  BTCUSDT: { symbol: 'BTCUSDT', shortLabel: 'BTC/USDT', contractSize: 1, precision: 2, defaultPrice: 91850, spread: 14.5, pipSize: 1 },
  ETHUSDT: { symbol: 'ETHUSDT', shortLabel: 'ETH/USDT', contractSize: 10, precision: 2, defaultPrice: 3145.5, spread: 1.4, pipSize: 0.1 },
  SOLUSDT: { symbol: 'SOLUSDT', shortLabel: 'SOL/USDT', contractSize: 100, precision: 2, defaultPrice: 218.4, spread: 0.15, pipSize: 0.01 },
  BNBUSDT: { symbol: 'BNBUSDT', shortLabel: 'BNB/USDT', contractSize: 10, precision: 2, defaultPrice: 624.8, spread: 0.4, pipSize: 0.1 },
  XRPUSDT: { symbol: 'XRPUSDT', shortLabel: 'XRP/USDT', contractSize: 10000, precision: 4, defaultPrice: 2.45, spread: 0.0008, pipSize: 0.0001 },
  US500: { symbol: 'US500', shortLabel: 'US500', contractSize: 10, precision: 2, defaultPrice: 6910.39, spread: 0.6, pipSize: 0.1 },
  US30: { symbol: 'US30', shortLabel: 'US30', contractSize: 1, precision: 2, defaultPrice: 44250.0, spread: 2.4, pipSize: 1 },
  USOIL: { symbol: 'USOIL', shortLabel: 'USOIL', contractSize: 100, precision: 2, defaultPrice: 83.41, spread: 0.03, pipSize: 0.01 },
};

export function getUtcDayKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function isRolloverDangerWindow(ts = Date.now()): boolean {
  const d = new Date(ts);
  const utcH = d.getUTCHours();
  const utcM = d.getUTCMinutes();
  // 21:55 - 22:15 UTC rollover window when broker spreads widen significantly
  return (utcH === 21 && utcM >= 55) || (utcH === 22 && utcM <= 15);
}

export function getBidAskPrices(
  symbol: SmcSymbol,
  midPrice: number,
  options?: { simMode?: BrokerSimMode; newsSpreadMultiplier?: number }
): { bid: number; ask: number; spread: number } {
  const spec = DEMO_SYMBOL_SPECS[symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const simMode = options?.simMode ?? 'real';
  const rolloverMult = simMode === 'real' && isRolloverDangerWindow() ? 1.85 : 1;
  const newsMult = simMode === 'real' ? Math.max(1, options?.newsSpreadMultiplier ?? 1) : 1;
  const spread = simMode === 'zero' ? 0 : Number((spec.spread * rolloverMult * newsMult).toFixed(spec.precision + 1));
  const half = spread / 2;
  const p = spec.precision;
  return {
    bid: Number((midPrice - half).toFixed(p)),
    ask: Number((midPrice + half).toFixed(p)),
    spread,
  };
}

export function createDefaultPropShield(baseEquity = DEMO_INITIAL_BALANCE): PropShieldConfig {
  return {
    dailyStartEquity: baseEquity,
    dailyStartDayKey: getUtcDayKey(),
    maxEquity: baseEquity,
    dailyLossLimitPct: 5,
    maxDrawdownPct: 10,
    dailyProfitTargetPct: 4,
    profitLockEnabled: false,
    preTradeChecklistEnabled: false,
    volatilityLotReducer: true,
    soundEnabled: true,
    hapticsEnabled: true,
  };
}

export function createInitialDemoAccount(): DemoAccountState {
  return {
    balance: DEMO_INITIAL_BALANCE,
    leverage: 200,
    defaultLot: 0.1,
    simMode: 'real',
    positions: [],
    pendingOrders: [],
    history: [],
    propShield: createDefaultPropShield(DEMO_INITIAL_BALANCE),
  };
}

function sanitizePositionsList(raw: unknown): DemoPosition[] {
  if (!Array.isArray(raw)) return [];
  const valid: DemoPosition[] = [];
  for (const item of raw.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Partial<DemoPosition>;
    if (!p.id || typeof p.id !== 'string') continue;
    if (!p.symbol || !(p.symbol in DEMO_SYMBOL_SPECS)) continue;
    if (p.side !== 'BUY' && p.side !== 'SELL') continue;
    const lots = typeof p.lots === 'number' && Number.isFinite(p.lots) ? Math.max(0.01, Math.min(10, Number(p.lots.toFixed(2)))) : 0;
    const entryPrice = typeof p.entryPrice === 'number' && Number.isFinite(p.entryPrice) && p.entryPrice > 0 ? p.entryPrice : 0;
    if (lots < 0.01 || entryPrice <= 0) continue;
    valid.push({
      ...(p as DemoPosition),
      lots,
      entryPrice,
      openedAt: typeof p.openedAt === 'number' && Number.isFinite(p.openedAt) ? p.openedAt : Date.now(),
      tp: typeof p.tp === 'number' && Number.isFinite(p.tp) && p.tp > 0 ? p.tp : undefined,
      sl: typeof p.sl === 'number' && Number.isFinite(p.sl) && p.sl > 0 ? p.sl : undefined,
    });
  }
  return valid;
}

function sanitizePendingOrdersList(raw: unknown): DemoLimitOrder[] {
  if (!Array.isArray(raw)) return [];
  const valid: DemoLimitOrder[] = [];
  for (const item of raw.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Partial<DemoLimitOrder>;
    if (!o.id || !o.symbol || !(o.symbol in DEMO_SYMBOL_SPECS)) continue;
    if (o.side !== 'BUY' && o.side !== 'SELL') continue;
    const lots = typeof o.lots === 'number' && Number.isFinite(o.lots) ? Math.max(0.01, Math.min(10, Number(o.lots.toFixed(2)))) : 0;
    if (lots < 0.01 || typeof o.limitPrice !== 'number' || !Number.isFinite(o.limitPrice) || o.limitPrice <= 0) continue;
    valid.push({
      ...(o as DemoLimitOrder),
      lots,
      tp: typeof o.tp === 'number' && Number.isFinite(o.tp) && o.tp > 0 ? o.tp : undefined,
      sl: typeof o.sl === 'number' && Number.isFinite(o.sl) && o.sl > 0 ? o.sl : undefined,
    });
  }
  return valid;
}

function sanitizeHistoryList(raw: unknown): DemoClosedTrade[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 150)
    .filter((item): item is DemoClosedTrade => {
      if (!item || typeof item !== 'object') return false;
      const t = item as Partial<DemoClosedTrade>;
      return (
        typeof t.id === 'string' &&
        Boolean(t.symbol && t.symbol in DEMO_SYMBOL_SPECS) &&
        (t.side === 'BUY' || t.side === 'SELL') &&
        typeof t.lots === 'number' &&
        Number.isFinite(t.lots) &&
        typeof t.entryPrice === 'number' &&
        Number.isFinite(t.entryPrice) &&
        typeof t.closePrice === 'number' &&
        Number.isFinite(t.closePrice) &&
        typeof t.pnl === 'number' &&
        Number.isFinite(t.pnl)
      );
    })
    .map((t) => ({
      ...t,
      lots: Math.max(0.01, Number(t.lots.toFixed(2))),
      pnl: Number(t.pnl.toFixed(2)),
    }));
}

export function loadDemoAccount(): DemoAccountState {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    const parsed: Partial<DemoAccountState> = raw ? (JSON.parse(raw) as Partial<DemoAccountState>) : {};

    let rawBalance = parsed.balance;
    if (typeof rawBalance !== 'number' || !Number.isFinite(rawBalance)) {
      const altBal = localStorage.getItem(DEMO_LOCAL_KEYS.balance);
      const parsedAlt = altBal !== null ? Number(altBal) : NaN;
      if (Number.isFinite(parsedAlt) && parsedAlt >= 0) rawBalance = parsedAlt;
    }

    const rawOpen = parsed.positions ?? (() => {
      try {
        const s = localStorage.getItem(DEMO_LOCAL_KEYS.openTrades);
        return s ? JSON.parse(s) : [];
      } catch {
        return [];
      }
    })();

    const rawPending = parsed.pendingOrders ?? (() => {
      try {
        const s = localStorage.getItem(DEMO_LOCAL_KEYS.pendingOrders);
        return s ? JSON.parse(s) : [];
      } catch {
        return [];
      }
    })();

    const rawHistory = parsed.history ?? (() => {
      try {
        const s = localStorage.getItem(DEMO_LOCAL_KEYS.tradeHistory);
        return s ? JSON.parse(s) : [];
      } catch {
        return [];
      }
    })();

    if (!raw && rawBalance === undefined && !Array.isArray(rawOpen)) {
      return createInitialDemoAccount();
    }

    const balance =
      typeof rawBalance === 'number' && Number.isFinite(rawBalance) && rawBalance >= 0
        ? Number(rawBalance.toFixed(2))
        : DEMO_INITIAL_BALANCE;
    const leverage: DemoLeverage =
      parsed.leverage === 50 || parsed.leverage === 100 || parsed.leverage === 200 || parsed.leverage === 500 || parsed.leverage === 1000
        ? parsed.leverage
        : 200;
    const defaultLot =
      typeof parsed.defaultLot === 'number' && Number.isFinite(parsed.defaultLot) && parsed.defaultLot >= 0.01
        ? Math.min(10, Number(parsed.defaultLot.toFixed(2)))
        : 0.1;
    const simMode: BrokerSimMode = parsed.simMode === 'zero' ? 'zero' : 'real';
    const positions = sanitizePositionsList(rawOpen);
    const pendingOrders = sanitizePendingOrdersList(rawPending);
    const history = sanitizeHistoryList(rawHistory);

    const todayKey = getUtcDayKey();
    const rawShield = parsed.propShield;
    const defShield = createDefaultPropShield(Math.max(balance, DEMO_INITIAL_BALANCE));
    const propShield: PropShieldConfig = rawShield
      ? {
          ...defShield,
          ...rawShield,
          dailyStartDayKey: rawShield.dailyStartDayKey === todayKey ? todayKey : todayKey,
          dailyStartEquity:
            rawShield.dailyStartDayKey === todayKey &&
            typeof rawShield.dailyStartEquity === 'number' &&
            Number.isFinite(rawShield.dailyStartEquity) &&
            rawShield.dailyStartEquity > 0
              ? rawShield.dailyStartEquity
              : Math.max(balance, 1),
          maxEquity:
            typeof rawShield.maxEquity === 'number' && Number.isFinite(rawShield.maxEquity) && rawShield.maxEquity > 0
              ? Math.max(rawShield.maxEquity, balance)
              : Math.max(balance, DEMO_INITIAL_BALANCE),
        }
      : defShield;

    return { balance, leverage, defaultLot, simMode, positions, pendingOrders, history, propShield };
  } catch {
    return createInitialDemoAccount();
  }
}

export function saveDemoAccount(state: DemoAccountState): void {
  try {
    const safeBalance = Number.isFinite(state.balance) && state.balance >= 0 ? Number(state.balance.toFixed(2)) : DEMO_INITIAL_BALANCE;
    const normalized: DemoAccountState = {
      ...state,
      balance: safeBalance,
      defaultLot: Number.isFinite(state.defaultLot) && state.defaultLot >= 0.01 ? Number(state.defaultLot.toFixed(2)) : 0.1,
    };
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(normalized));
    localStorage.setItem(DEMO_LOCAL_KEYS.balance, String(safeBalance));
    localStorage.setItem(DEMO_LOCAL_KEYS.openTrades, JSON.stringify(normalized.positions));
    localStorage.setItem(DEMO_LOCAL_KEYS.pendingOrders, JSON.stringify(normalized.pendingOrders));
    localStorage.setItem(DEMO_LOCAL_KEYS.tradeHistory, JSON.stringify(normalized.history));
  } catch {
    // ignore storage errors
  }
}

export function calcPositionPnl(
  pos: DemoPosition,
  currentMidPrice: number,
  simMode: BrokerSimMode = 'real'
): number {
  const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const contractSize = spec.contractSize;
  const cleanLots = Number.isFinite(pos.lots) && pos.lots > 0 ? Number(pos.lots.toFixed(2)) : 0;
  if (
    !Number.isFinite(currentMidPrice) ||
    currentMidPrice <= 0 ||
    !Number.isFinite(pos.entryPrice) ||
    pos.entryPrice <= 0 ||
    cleanLots <= 0
  ) {
    return 0;
  }
  const halfSpread = simMode === 'zero' ? 0 : spec.spread / 2;
  const exitPrice = pos.side === 'BUY' ? currentMidPrice - halfSpread : currentMidPrice + halfSpread;
  const priceDiff = pos.side === 'BUY' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
  const pnl = priceDiff * cleanLots * contractSize;
  return Number.isFinite(pnl) ? pnl : 0;
}

export function calcRequiredMargin(
  symbol: SmcSymbol,
  lots: number,
  price: number,
  leverage: DemoLeverage
): number {
  const spec = DEMO_SYMBOL_SPECS[symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const contractSize = spec.contractSize;
  const cleanLots = Number.isFinite(lots) && lots > 0 ? Number(lots.toFixed(2)) : 0;
  const safeLev = Number.isFinite(leverage) && leverage > 0 ? leverage : 200;
  if (!Number.isFinite(price) || price <= 0 || cleanLots <= 0) return 0;
  const margin = (cleanLots * contractSize * price) / safeLev;
  return Number.isFinite(margin) ? Number(margin.toFixed(2)) : 0;
}

export function calcPreTradePreview(params: {
  symbol: SmcSymbol;
  side: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  slPrice?: number | null;
  tpPrice?: number | null;
  leverage: DemoLeverage;
  equity: number;
}): {
  requiredMargin: number;
  riskUsd: number | null;
  rewardUsd: number | null;
  estLiqPrice: number;
} {
  const spec = DEMO_SYMBOL_SPECS[params.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const reqMargin = calcRequiredMargin(params.symbol, params.lots, params.entryPrice, params.leverage);
  const unitValue = params.lots * spec.contractSize;
  const riskUsd =
    typeof params.slPrice === 'number' && params.slPrice > 0
      ? Number((Math.abs(params.entryPrice - params.slPrice) * unitValue).toFixed(2))
      : null;
  const rewardUsd =
    typeof params.tpPrice === 'number' && params.tpPrice > 0
      ? Number((Math.abs(params.tpPrice - params.entryPrice) * unitValue).toFixed(2))
      : null;
  const maxMove = unitValue > 0 ? Math.max(0, params.equity) / unitValue : 0;
  const estLiqPrice =
    params.side === 'BUY'
      ? Number(Math.max(0.0001, params.entryPrice - maxMove).toFixed(spec.precision))
      : Number((params.entryPrice + maxMove).toFixed(spec.precision));

  return { requiredMargin: reqMargin, riskUsd, rewardUsd, estLiqPrice };
}

export function calcLotsForDollarRisk(
  symbol: SmcSymbol,
  entryPrice: number,
  slPrice: number,
  riskDollars: number,
  volatilityReducer = false
): number {
  const spec = DEMO_SYMBOL_SPECS[symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const dist = Math.abs(entryPrice - slPrice);
  const safeDist = Math.max(dist, spec.defaultPrice * 0.0015);
  const rawLots = riskDollars / (safeDist * spec.contractSize);
  const adjusted = volatilityReducer ? rawLots * 0.85 : rawLots;
  return Math.max(0.01, Math.min(10, Number(adjusted.toFixed(2))));
}

export interface DemoAccountMetrics {
  balance: number;
  equity: number;
  floatingPnl: number;
  usedMargin: number;
  freeMargin: number;
  marginLevelPct: number | null;
  dailyPnlPct: number;
  drawdownFromPeakPct: number;
  dailyLimitBreached: boolean;
  maxDrawdownBreached: boolean;
  dailyTargetReached: boolean;
}

export function computeDemoAccountMetrics(
  account: DemoAccountState,
  livePrices: Partial<Record<SmcSymbol, number>>
): DemoAccountMetrics {
  let floatingPnl = 0;
  let usedMargin = 0;
  const safeBalance = Number.isFinite(account.balance) && account.balance >= 0 ? account.balance : DEMO_INITIAL_BALANCE;

  for (const pos of account.positions) {
    const spec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
    const rawMark = livePrices[pos.symbol];
    const markPrice =
      typeof rawMark === 'number' && Number.isFinite(rawMark) && rawMark > 0
        ? rawMark
        : pos.entryPrice > 0
          ? pos.entryPrice
          : spec.defaultPrice;
    const posPnl = calcPositionPnl(pos, markPrice, account.simMode);
    const posMargin = calcRequiredMargin(pos.symbol, pos.lots, pos.entryPrice, account.leverage);
    if (Number.isFinite(posPnl)) floatingPnl += posPnl;
    if (Number.isFinite(posMargin)) usedMargin += posMargin;
  }

  const equity = Number((safeBalance + floatingPnl).toFixed(2));
  const freeMargin = Number((equity - usedMargin).toFixed(2));
  const marginLevelPct = usedMargin > 0.01 ? (equity / usedMargin) * 100 : null;
  const rawDailyBase = account.propShield?.dailyStartEquity;
  const dailyBase = Math.max(
    1,
    typeof rawDailyBase === 'number' && Number.isFinite(rawDailyBase) ? rawDailyBase : DEMO_INITIAL_BALANCE
  );
  const rawPeakBase = account.propShield?.maxEquity;
  const peakBase = Math.max(
    dailyBase,
    typeof rawPeakBase === 'number' && Number.isFinite(rawPeakBase) ? rawPeakBase : DEMO_INITIAL_BALANCE
  );
  const dailyPnlPct = ((equity - dailyBase) / dailyBase) * 100;
  const drawdownFromPeakPct = Math.max(0, ((peakBase - equity) / peakBase) * 100);
  const dailyLimitBreached = dailyPnlPct <= -(account.propShield?.dailyLossLimitPct ?? 5);
  const maxDrawdownBreached = drawdownFromPeakPct >= (account.propShield?.maxDrawdownPct ?? 10);
  const dailyTargetReached =
    Boolean(account.propShield?.profitLockEnabled) &&
    dailyPnlPct >= (account.propShield?.dailyProfitTargetPct ?? 4);

  return {
    balance: safeBalance,
    equity,
    floatingPnl: Number.isFinite(floatingPnl) ? floatingPnl : 0,
    usedMargin: Number.isFinite(usedMargin) ? usedMargin : 0,
    freeMargin: Number.isFinite(freeMargin) ? freeMargin : safeBalance,
    marginLevelPct: marginLevelPct !== null && Number.isFinite(marginLevelPct) ? marginLevelPct : null,
    dailyPnlPct: Number.isFinite(dailyPnlPct) ? dailyPnlPct : 0,
    drawdownFromPeakPct: Number.isFinite(drawdownFromPeakPct) ? drawdownFromPeakPct : 0,
    dailyLimitBreached,
    maxDrawdownBreached,
    dailyTargetReached,
  };
}

export function formatUsd(val: number, signed = false): string {
  const safe = Number.isFinite(val) ? val : 0;
  const absFormatted = Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (signed) {
    return `${safe >= 0 ? '+' : '-'}$${absFormatted}`;
  }
  return `${safe < 0 ? '-' : ''}$${absFormatted}`;
}

export interface DemoPerformanceStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPnl: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  equityCurve: number[];
}

export function computeDemoPerformanceStats(
  history: DemoClosedTrade[],
  currentBalance = DEMO_INITIAL_BALANCE
): DemoPerformanceStats {
  const totalTrades = history.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRatePct: 0,
      netPnl: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      equityCurve: [currentBalance],
    };
  }
  let wins = 0;
  let losses = 0;
  let netPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const trade of history) {
    if (trade.pnl > 0) {
      wins += 1;
      grossProfit += trade.pnl;
    } else if (trade.pnl < 0) {
      losses += 1;
      grossLoss += Math.abs(trade.pnl);
    }
    netPnl += trade.pnl;
  }

  const ordered = [...history].reverse();
  let running = Math.max(0, currentBalance - netPnl);
  const equityCurve: number[] = [Number(running.toFixed(2))];
  for (const t of ordered) {
    running = Math.max(0, running + t.pnl);
    equityCurve.push(Number(running.toFixed(2)));
  }

  const profitFactor = grossLoss > 0.01 ? grossProfit / grossLoss : grossProfit > 0 ? 9.9 : 0;

  return {
    totalTrades,
    wins,
    losses,
    winRatePct: (wins / totalTrades) * 100,
    netPnl: Number(netPnl.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    avgWin: wins > 0 ? Number((grossProfit / wins).toFixed(2)) : 0,
    avgLoss: losses > 0 ? Number((grossLoss / losses).toFixed(2)) : 0,
    equityCurve,
  };
}

export function calcDrawdownRecoveryRoadmap(
  currentEquity: number,
  targetEquity: number
): {
  drawdownUsd: number;
  gainNeededPct: number;
  stepsAtHalfPctRisk: number;
  recommendedRiskPct: number;
  planLabel: string;
} {
  const drawdownUsd = Math.max(0, targetEquity - currentEquity);
  if (drawdownUsd <= 1 || currentEquity <= 0) {
    return {
      drawdownUsd: 0,
      gainNeededPct: 0,
      stepsAtHalfPctRisk: 0,
      recommendedRiskPct: 1,
      planLabel: 'Account at peak equity — standard 1% risk.',
    };
  }
  const gainNeededPct = (drawdownUsd / currentEquity) * 100;
  const recommendedRiskPct = gainNeededPct > 8 ? 0.5 : 0.75;
  // Each 1:2 R:R win at recommendedRiskPct grows equity by 2 * recommendedRiskPct
  const stepGainPct = recommendedRiskPct * 2;
  const stepsAtHalfPctRisk = Math.max(1, Math.ceil(gainNeededPct / stepGainPct));
  return {
    drawdownUsd: Number(drawdownUsd.toFixed(2)),
    gainNeededPct: Number(gainNeededPct.toFixed(1)),
    stepsAtHalfPctRisk,
    recommendedRiskPct,
    planLabel: `Cut risk to ${recommendedRiskPct}%/trade: ${stepsAtHalfPctRisk} clean 1:2R wins recover $${drawdownUsd.toFixed(0)}.`,
  };
}

export function reviewClosedTradeWithAi(trade: DemoClosedTrade): string {
  const durationMin = trade.openedAt ? Math.max(1, Math.round((trade.closedAt - trade.openedAt) / 60000)) : 5;
  if (trade.emotionTag === 'Revenge' || trade.emotionTag === 'FOMO') {
    return `${trade.emotionTag} entry flagged — wait for 15m candle close inside OB/FVG before scaling.`;
  }
  if (trade.pnl < 0 && durationMin < 2) {
    return 'Stopped rapidly (<2m) — verify spread buffer & wait for sweep confirmation.';
  }
  if (trade.pnl > 0) {
    return 'Clean institutional alignment. Consider trailing SL behind swing/20EMA on runners.';
  }
  return 'Minor loss controlled. Keep risk fixed at 0.5%–1% until next A+ confluence.';
}

let sharedAudioCtx: AudioContext | null = null;
export function playTradeChime(kind: 'entry' | 'tp' | 'sl' | 'alert', enabled = true): void {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    const ctx = sharedAudioCtx;
    const now = ctx.currentTime;
    const notes =
      kind === 'tp'
        ? [523.25, 659.25, 783.99]
        : kind === 'sl'
          ? [349.23, 277.18]
          : kind === 'alert'
            ? [587.33, 880]
            : [440, 554.37];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.05, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.17);
    });
  } catch {
    // ignore audio restrictions
  }
}

export function triggerHaptic(pattern: number | number[] = 18, enabled = true): void {
  if (!enabled || typeof navigator === 'undefined') return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore unsupported browsers
  }
}
