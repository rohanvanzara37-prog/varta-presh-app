import type { SmcSymbol } from '../components/ProSmcTerminal';

export const DEMO_INITIAL_BALANCE = 1000;
export const DEMO_STORAGE_KEY = 'vp_demo_account_v1';

export type DemoLeverage = 50 | 100 | 200 | 500;

export interface DemoPosition {
  id: string;
  symbol: SmcSymbol;
  side: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  openedAt: number;
  tp?: number;
  sl?: number;
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
}

export interface DemoAccountState {
  balance: number;
  leverage: DemoLeverage;
  defaultLot: number;
  positions: DemoPosition[];
  history: DemoClosedTrade[];
}

export interface DemoSymbolSpec {
  symbol: SmcSymbol;
  shortLabel: string;
  contractSize: number;
  precision: number;
  defaultPrice: number;
}

export const DEMO_SYMBOL_SPECS: Record<SmcSymbol, DemoSymbolSpec> = {
  XAUUSD: { symbol: 'XAUUSD', shortLabel: 'XAU/USD', contractSize: 100, precision: 2, defaultPrice: 3515.4 },
  XAGUSD: { symbol: 'XAGUSD', shortLabel: 'XAG/USD', contractSize: 1000, precision: 2, defaultPrice: 33.2 },
  BTCUSDT: { symbol: 'BTCUSDT', shortLabel: 'BTC/USDT', contractSize: 1, precision: 2, defaultPrice: 91850 },
  ETHUSDT: { symbol: 'ETHUSDT', shortLabel: 'ETH/USDT', contractSize: 10, precision: 2, defaultPrice: 3145.5 },
  SOLUSDT: { symbol: 'SOLUSDT', shortLabel: 'SOL/USDT', contractSize: 100, precision: 2, defaultPrice: 218.4 },
  BNBUSDT: { symbol: 'BNBUSDT', shortLabel: 'BNB/USDT', contractSize: 10, precision: 2, defaultPrice: 624.8 },
  XRPUSDT: { symbol: 'XRPUSDT', shortLabel: 'XRP/USDT', contractSize: 10000, precision: 4, defaultPrice: 2.45 },
  US500: { symbol: 'US500', shortLabel: 'US500', contractSize: 10, precision: 2, defaultPrice: 6910.39 },
  USOIL: { symbol: 'USOIL', shortLabel: 'USOIL', contractSize: 100, precision: 2, defaultPrice: 83.41 },
};

export function createInitialDemoAccount(): DemoAccountState {
  return {
    balance: DEMO_INITIAL_BALANCE,
    leverage: 200,
    defaultLot: 0.1,
    positions: [],
    history: [],
  };
}

export function loadDemoAccount(): DemoAccountState {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return createInitialDemoAccount();
    const parsed = JSON.parse(raw) as Partial<DemoAccountState>;
    const balance =
      typeof parsed.balance === 'number' && Number.isFinite(parsed.balance) && parsed.balance >= 0
        ? parsed.balance
        : DEMO_INITIAL_BALANCE;
    const leverage: DemoLeverage =
      parsed.leverage === 50 || parsed.leverage === 100 || parsed.leverage === 200 || parsed.leverage === 500
        ? parsed.leverage
        : 200;
    const defaultLot =
      typeof parsed.defaultLot === 'number' && Number.isFinite(parsed.defaultLot) && parsed.defaultLot >= 0.01
        ? Number(parsed.defaultLot.toFixed(2))
        : 0.1;
    const positions: DemoPosition[] = Array.isArray(parsed.positions)
      ? parsed.positions.slice(0, 30).map((p) => ({
          ...p,
          tp: typeof p.tp === 'number' && Number.isFinite(p.tp) && p.tp > 0 ? p.tp : undefined,
          sl: typeof p.sl === 'number' && Number.isFinite(p.sl) && p.sl > 0 ? p.sl : undefined,
        }))
      : [];
    const history = Array.isArray(parsed.history) ? parsed.history.slice(0, 20) : [];
    return { balance, leverage, defaultLot, positions, history };
  } catch {
    return createInitialDemoAccount();
  }
}

export function saveDemoAccount(state: DemoAccountState): void {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function calcPositionPnl(pos: DemoPosition, currentPrice: number): number {
  const spec = DEMO_SYMBOL_SPECS[pos.symbol];
  const contractSize = spec?.contractSize ?? 1;
  const priceDiff = pos.side === 'BUY' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
  return priceDiff * pos.lots * contractSize;
}

export function calcRequiredMargin(
  symbol: SmcSymbol,
  lots: number,
  price: number,
  leverage: DemoLeverage
): number {
  const spec = DEMO_SYMBOL_SPECS[symbol];
  const contractSize = spec?.contractSize ?? 1;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(lots) || lots <= 0) return 0;
  return (lots * contractSize * price) / leverage;
}

export interface DemoAccountMetrics {
  balance: number;
  equity: number;
  floatingPnl: number;
  usedMargin: number;
  freeMargin: number;
  marginLevelPct: number | null;
}

export function computeDemoAccountMetrics(
  account: DemoAccountState,
  livePrices: Partial<Record<SmcSymbol, number>>
): DemoAccountMetrics {
  let floatingPnl = 0;
  let usedMargin = 0;

  for (const pos of account.positions) {
    const spec = DEMO_SYMBOL_SPECS[pos.symbol];
    const markPrice = livePrices[pos.symbol] ?? pos.entryPrice ?? spec.defaultPrice;
    floatingPnl += calcPositionPnl(pos, markPrice);
    usedMargin += calcRequiredMargin(pos.symbol, pos.lots, pos.entryPrice, account.leverage);
  }

  const equity = account.balance + floatingPnl;
  const freeMargin = equity - usedMargin;
  const marginLevelPct = usedMargin > 0.01 ? (equity / usedMargin) * 100 : null;

  return {
    balance: account.balance,
    equity,
    floatingPnl,
    usedMargin,
    freeMargin,
    marginLevelPct,
  };
}

export function formatUsd(val: number, signed = false): string {
  const absFormatted = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (signed) {
    return `${val >= 0 ? '+' : '-'}$${absFormatted}`;
  }
  return `${val < 0 ? '-' : ''}$${absFormatted}`;
}
