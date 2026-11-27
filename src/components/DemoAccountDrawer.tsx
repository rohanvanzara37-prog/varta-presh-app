import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Download,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { ExecuteOrderOptions, SmcSymbol } from './ProSmcTerminal';
import {
  DEMO_SYMBOL_SPECS,
  calcDrawdownRecoveryRoadmap,
  calcLotsForDollarRisk,
  calcPositionPnl,
  calcPreTradePreview,
  computeDemoPerformanceStats,
  formatUsd,
  getBidAskPrices,
  isRolloverDangerWindow,
  type BrokerSimMode,
  type DemoAccountMetrics,
  type DemoAccountState,
  type DemoLeverage,
  type PropShieldConfig,
  type TradeEmotionTag,
  type TrailingMode,
} from '../utils/demoAccount';
import { exportTredauraCardPng } from '../utils/institutionalEngine';

interface DemoAccountDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  account: DemoAccountState;
  metrics: DemoAccountMetrics;
  activeSymbol: SmcSymbol;
  livePrices: Partial<Record<SmcSymbol, number>>;
  marginCallActive?: boolean;
  onExecuteOrder: (symbol: SmcSymbol, side: 'BUY' | 'SELL', lots: number, opts?: ExecuteOrderOptions) => string | null;
  onPlaceLimitOrder: (
    symbol: SmcSymbol,
    side: 'BUY' | 'SELL',
    lots: number,
    limitPrice: number,
    tp?: number,
    sl?: number,
    label?: string
  ) => string | null;
  onCancelLimitOrder: (orderId: string) => void;
  onClosePosition: (positionId: string) => void;
  onPartialClosePosition: (positionId: string, pct: 0.25 | 0.5) => void;
  onReversePosition: (positionId: string) => void;
  onHedgePosition: (positionId: string) => void;
  onCloseProfitablePositions: () => void;
  onCloseLosingPositions: () => void;
  onCloseAllPositions: () => void;
  onUpdateTpSl?: (positionId: string, tp: number | undefined, sl: number | undefined) => void;
  onToggleTrailingStop?: (positionId: string, mode?: TrailingMode) => void;
  onChangeLeverage: (leverage: DemoLeverage) => void;
  onChangeDefaultLot: (lots: number) => void;
  onChangeSimMode: (mode: BrokerSimMode) => void;
  onUpdatePropShield: (patch: Partial<PropShieldConfig>) => void;
  onUpdateTradeEmotion: (tradeId: string, emotion: TradeEmotionTag) => void;
  onResetAccount: () => void;
  onSetCustomBalance: (balance: number) => void;
}

const LEVERAGES: DemoLeverage[] = [50, 100, 200, 500, 1000];
const LOT_PRESETS = [0.01, 0.05, 0.1, 0.5, 1.0];
const EMOTION_TAGS: TradeEmotionTag[] = ['Plan', 'Disciplined', 'FOMO', 'Revenge', 'Greed'];

export const DemoAccountDrawer: React.FC<DemoAccountDrawerProps> = ({
  isOpen,
  onClose,
  account,
  metrics,
  activeSymbol,
  livePrices,
  marginCallActive = false,
  onExecuteOrder,
  onPlaceLimitOrder,
  onCancelLimitOrder,
  onClosePosition,
  onPartialClosePosition,
  onReversePosition,
  onHedgePosition,
  onCloseProfitablePositions,
  onCloseLosingPositions,
  onCloseAllPositions,
  onUpdateTpSl,
  onToggleTrailingStop,
  onChangeLeverage,
  onChangeDefaultLot,
  onChangeSimMode,
  onUpdatePropShield,
  onUpdateTradeEmotion,
  onResetAccount,
  onSetCustomBalance,
}) => {
  const [orderSymbol, setOrderSymbol] = useState<SmcSymbol>(activeSymbol);
  const [orderLots, setOrderLots] = useState<number>(account.defaultLot);
  const [bracketMode, setBracketMode] = useState<'none' | 'scalp' | 'intraday' | 'swing'>('intraday');
  const [autoBeChecked, setAutoBeChecked] = useState<boolean>(true);
  const [checklistVerified, setChecklistVerified] = useState<boolean>(true);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);
  const [customBalanceInput, setCustomBalanceInput] = useState<string>(() => String(account.balance));
  const [activeTradeTab, setActiveTradeTab] = useState<'open' | 'limits' | 'history' | 'shield'>('open');
  const [manualEdits, setManualEdits] = useState<Record<string, { tp: string; sl: string }>>({});
  const [lotInputText, setLotInputText] = useState<string>(() => account.defaultLot.toFixed(2));
  const [confirmingReset, setConfirmingReset] = useState<boolean>(false);

  useEffect(() => {
    setCustomBalanceInput(String(account.balance));
  }, [account.balance]);

  useEffect(() => {
    setOrderSymbol(activeSymbol);
  }, [activeSymbol]);

  useEffect(() => {
    setOrderLots(account.defaultLot);
    setLotInputText(account.defaultLot.toFixed(2));
  }, [account.defaultLot]);

  useEffect(() => {
    if (!isOpen) {
      setConfirmingReset(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const perfStats = useMemo(
    () => computeDemoPerformanceStats(account.history, metrics.balance),
    [account.history, metrics.balance]
  );

  const recoveryRoadmap = useMemo(
    () => calcDrawdownRecoveryRoadmap(metrics.equity, account.propShield.maxEquity),
    [metrics.equity, account.propShield.maxEquity]
  );

  // SVG Equity Curve points (must stay above early return to preserve hook order)
  const equitySvgPath = useMemo(() => {
    const pts = perfStats.equityCurve;
    if (pts.length < 2) return '';
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = Math.max(1, max - min);
    return pts
      .map((val, idx) => {
        const x = (idx / (pts.length - 1)) * 280;
        const y = 46 - ((val - min) / span) * 38;
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [perfStats.equityCurve]);

  if (!isOpen) return null;

  const spec = DEMO_SYMBOL_SPECS[orderSymbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const currentPrice = livePrices[orderSymbol] ?? spec.defaultPrice;
  const { bid, ask, spread } = getBidAskPrices(orderSymbol, currentPrice, { simMode: account.simMode });

  const bracketDist =
    bracketMode === 'scalp'
      ? currentPrice * 0.0018
      : bracketMode === 'intraday'
        ? currentPrice * 0.0035
        : bracketMode === 'swing'
          ? currentPrice * 0.0075
          : 0;

  const previewBuy = calcPreTradePreview({
    symbol: orderSymbol,
    side: 'BUY',
    lots: orderLots,
    entryPrice: ask,
    slPrice: bracketDist > 0 ? ask - bracketDist : null,
    tpPrice: bracketDist > 0 ? ask + bracketDist * 2 : null,
    leverage: account.leverage,
    equity: metrics.equity,
  });

  const handlePlaceOrder = (side: 'BUY' | 'SELL') => {
    if (account.propShield.preTradeChecklistEnabled && !checklistVerified) {
      setOrderNotice('Confirm Pre-Trade Checklist before executing.');
      return;
    }
    const px = side === 'BUY' ? ask : bid;
    const sl =
      bracketDist > 0
        ? Number((side === 'BUY' ? px - bracketDist : px + bracketDist).toFixed(spec.precision))
        : undefined;
    const tp =
      bracketDist > 0
        ? Number((side === 'BUY' ? px + bracketDist * 2 : px - bracketDist * 2).toFixed(spec.precision))
        : undefined;

    const err = onExecuteOrder(orderSymbol, side, orderLots, {
      sl,
      tp,
      autoBreakeven: autoBeChecked,
    });
    if (err) {
      setOrderNotice(err);
      return;
    }
    setOrderNotice(`${side} ${orderLots.toFixed(2)} ${spec.shortLabel} @ $${px.toFixed(spec.precision)}`);
  };

  const handlePlace3StepPyramid = (side: 'BUY' | 'SELL') => {
    const basePx = side === 'BUY' ? ask : bid;
    const step = Math.max(spec.pipSize * 8, basePx * 0.0015);
    const legLot = Math.max(0.01, Number((orderLots / 3).toFixed(2)));
    for (let i = 0; i < 3; i++) {
      const limitPx =
        side === 'BUY'
          ? Number((basePx - step * (i + 1)).toFixed(spec.precision))
          : Number((basePx + step * (i + 1)).toFixed(spec.precision));
      const slPx =
        side === 'BUY'
          ? Number((basePx - step * 4.5).toFixed(spec.precision))
          : Number((basePx + step * 4.5).toFixed(spec.precision));
      const tpPx =
        side === 'BUY'
          ? Number((basePx + step * 3).toFixed(spec.precision))
          : Number((basePx - step * 3).toFixed(spec.precision));
      onPlaceLimitOrder(orderSymbol, side, legLot, limitPx, tpPx, slPx, `Pyramid #${i + 1}`);
    }
    setActiveTradeTab('limits');
    setOrderNotice(`Placed 3-Step ${side} Pyramid Limits (${legLot.toFixed(2)} each)`);
  };

  const adjustLots = (delta: number) => {
    const next = Math.max(0.01, Math.min(10, Number((orderLots + delta).toFixed(2))));
    setOrderLots(next);
    setLotInputText(next.toFixed(2));
    onChangeDefaultLot(next);
  };

  const handleApplyDollarRisk = (riskUsd: number) => {
    const slEst = currentPrice - Math.max(spec.pipSize * 10, bracketDist || currentPrice * 0.0025);
    const calcLot = calcLotsForDollarRisk(
      orderSymbol,
      currentPrice,
      slEst,
      riskUsd,
      account.propShield.volatilityLotReducer
    );
    setOrderLots(calcLot);
    setLotInputText(calcLot.toFixed(2));
    onChangeDefaultLot(calcLot);
    setOrderNotice(`Auto-sized ${calcLot.toFixed(2)} for $${riskUsd} SL risk`);
  };

  const rolloverWarning = account.simMode === 'real' && isRolloverDangerWindow();

  return (
    <div className="fixed inset-0 z-[130] flex justify-end" role="dialog" aria-modal="true" aria-label="Demo Trading Account Panel">
      <button
        type="button"
        aria-label="Close Demo Account Panel"
        onClick={onClose}
        className="flex-1 bg-black/45 backdrop-blur-[1px] cursor-pointer"
      />

      <aside className="relative h-full w-full max-w-[400px] bg-[var(--vp-canvas)] text-[var(--vp-text)] border-l border-[var(--vp-border)] shadow-2xl flex flex-col overflow-hidden">
        {/* Panel Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--vp-border)] bg-[var(--vp-surface)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center rounded border border-[#059669]/35 bg-[#059669]/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#089981]">
              PRO DEMO
            </span>
            <h2 className="text-sm font-bold tracking-tight text-[var(--vp-text)] truncate">
              Institutional Desk
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onUpdatePropShield({ soundEnabled: !account.propShield.soundEnabled })}
              title={account.propShield.soundEnabled ? 'Mute sound chimes' : 'Enable sound chimes'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-muted)] hover:text-[var(--vp-text)] cursor-pointer"
            >
              {account.propShield.soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-[#089981]" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:opacity-90 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--vp-text)] cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="h-3 w-3 text-[var(--vp-muted)]" />
              Reset $1,000 Demo
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:opacity-90 text-[var(--vp-muted)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 bg-[var(--vp-canvas)]">
          {confirmingReset && (
            <div
              role="alertdialog"
              aria-label="Confirm Reset Demo Account"
              className="rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-3 py-2.5 space-y-2"
            >
              <p className="text-xs font-bold text-[var(--vp-text)]">
                Reset Demo Account to $1,000.00?
              </p>
              <p className="text-[11px] text-[var(--vp-muted)]">
                This will close all open trades, cancel pending limits, and restore your balance to $1,000.00.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--vp-text)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onResetAccount();
                    setConfirmingReset(false);
                    setOrderNotice('Demo account reset to $1,000.00');
                  }}
                  className="rounded-lg bg-[#F23645] hover:brightness-110 px-3 py-1 text-[11px] font-bold text-[#FFFFFF] cursor-pointer"
                >
                  Confirm Reset
                </button>
              </div>
            </div>
          )}

          {(marginCallActive || metrics.balance <= 0 || metrics.equity <= 0) && (
            <div className="rounded-xl border border-[#F23645]/40 bg-[#F23645]/10 px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#F23645]">Margin Call: Balance Depleted</p>
                <p className="text-[11px] text-[var(--vp-muted)]">Reset demo funds to continue trading.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                className="shrink-0 rounded-lg bg-[#089981] hover:brightness-110 px-2.5 py-1.5 text-[11px] font-bold text-[#FFFFFF] cursor-pointer whitespace-nowrap"
              >
                Reset $1,000 Demo
              </button>
            </div>
          )}

          {rolloverWarning && (
            <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 text-[11px] font-semibold text-[#F59E0B] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Rollover Window (22:00 UTC) — Real Broker spreads widened 1.85x.</span>
            </div>
          )}

          {/* Account Metrics 2x2 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] shadow-[var(--vp-card-shadow)] px-3 py-2">
              <span className="block text-[10px] font-bold uppercase text-[var(--vp-text)]">Balance</span>
              <span className="block font-mono-tabular text-sm font-bold text-[var(--vp-text)] mt-0.5">
                {formatUsd(metrics.balance)}
              </span>
            </div>
            <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] shadow-[var(--vp-card-shadow)] px-3 py-2">
              <span className="block text-[10px] font-bold uppercase text-[var(--vp-text)]">Equity (Live)</span>
              <span
                className="block font-mono-tabular text-sm font-bold mt-0.5"
                style={{
                  color: metrics.floatingPnl > 0.005 ? '#10B981' : metrics.floatingPnl < -0.005 ? '#F43F5E' : 'var(--vp-text)',
                }}
              >
                {formatUsd(metrics.equity)}
              </span>
            </div>
            <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] shadow-[var(--vp-card-shadow)] px-3 py-2">
              <span className="block text-[10px] font-bold uppercase text-[var(--vp-text)]">Used / Free Margin</span>
              <span className="block font-mono-tabular text-xs font-bold text-[var(--vp-text)] mt-0.5">
                {formatUsd(metrics.usedMargin)} / {formatUsd(metrics.freeMargin)}
              </span>
            </div>
            <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] shadow-[var(--vp-card-shadow)] px-3 py-2">
              <span className="block text-[10px] font-bold uppercase text-[var(--vp-text)]">Daily P&amp;L / Max DD</span>
              <span
                className="block font-mono-tabular text-xs font-bold mt-0.5"
                style={{ color: metrics.dailyPnlPct >= 0 ? '#10B981' : '#F43F5E' }}
              >
                {metrics.dailyPnlPct >= 0 ? '+' : ''}{metrics.dailyPnlPct.toFixed(1)}% / -{metrics.drawdownFromPeakPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Broker Simulation Mode & Leverage */}
          <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[var(--vp-muted)]">Execution Mode</span>
              <div className="inline-flex rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] p-0.5 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => onChangeSimMode('real')}
                  className={`rounded-md px-2 py-0.5 cursor-pointer ${
                    account.simMode === 'real' ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]' : 'text-[var(--vp-muted)]'
                  }`}
                >
                  Real Spread
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSimMode('zero')}
                  className={`rounded-md px-2 py-0.5 cursor-pointer ${
                    account.simMode === 'zero' ? 'bg-[#089981] text-[#FFFFFF]' : 'text-[var(--vp-muted)]'
                  }`}
                >
                  Zero-Spread
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[var(--vp-muted)]">Leverage</span>
              <div className="flex items-center gap-1 rounded-lg bg-[var(--vp-elevated)] p-0.5">
                {LEVERAGES.map((lev) => (
                  <button
                    key={lev}
                    type="button"
                    onClick={() => onChangeLeverage(lev)}
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono-tabular font-bold cursor-pointer ${
                      account.leverage === lev ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]' : 'text-[var(--vp-muted)]'
                    }`}
                  >
                    1:{lev}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Pro Execution Ticket with Dollar Risk, Brackets & Pre-Trade Preview */}
          <section className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <select
                aria-label="Order instrument"
                value={orderSymbol}
                onChange={(e) => setOrderSymbol(e.target.value as SmcSymbol)}
                className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2 py-1 text-xs font-bold text-[var(--vp-text)] outline-none cursor-pointer"
              >
                {Object.values(DEMO_SYMBOL_SPECS).map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.shortLabel}
                  </option>
                ))}
              </select>

              <div className="text-right font-mono-tabular">
                <span className="block text-[9.5px] text-[var(--vp-muted)]">Bid/Ask · Sp {spread}</span>
                <span className="text-xs font-bold text-[var(--vp-text)]">
                  ${bid.toFixed(spec.precision)} / ${ask.toFixed(spec.precision)}
                </span>
              </div>
            </div>

            {/* Dollar-Risk Auto-Lot & Bracket Selector */}
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleApplyDollarRisk(10)}
                  className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B] cursor-pointer hover:brightness-110"
                >
                  $10 Risk
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyDollarRisk(25)}
                  className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B] cursor-pointer hover:brightness-110"
                >
                  $25 Risk
                </button>
              </div>
              <div className="flex items-center gap-0.5 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] p-0.5 text-[9.5px] font-bold">
                {(['none', 'scalp', 'intraday', 'swing'] as const).map((bm) => (
                  <button
                    key={bm}
                    type="button"
                    onClick={() => setBracketMode(bm)}
                    className={`rounded px-1.5 py-0.5 capitalize cursor-pointer ${
                      bracketMode === bm ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]' : 'text-[var(--vp-muted)]'
                    }`}
                  >
                    {bm === 'none' ? 'No SL/TP' : bm}
                  </button>
                ))}
              </div>
            </div>

            {/* Lot Stepper & Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => adjustLots(-0.01)}
                  aria-label="Decrease lots"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] cursor-pointer"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10"
                  aria-label="Lot size"
                  value={lotInputText}
                  onChange={(e) => {
                    setLotInputText(e.target.value);
                    const val = Number.parseFloat(e.target.value);
                    if (Number.isFinite(val) && val >= 0.01) {
                      const clamped = Math.max(0.01, Math.min(10, Number(val.toFixed(2))));
                      setOrderLots(clamped);
                      onChangeDefaultLot(clamped);
                    }
                  }}
                  onBlur={() => setLotInputText(orderLots.toFixed(2))}
                  className="h-8 flex-1 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-canvas)] px-2 text-center font-mono-tabular text-xs font-bold text-[var(--vp-text)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustLots(0.01)}
                  aria-label="Increase lots"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {LOT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setOrderLots(preset);
                      setLotInputText(preset.toFixed(2));
                      onChangeDefaultLot(preset);
                    }}
                    className={`rounded-md border py-1 text-[10px] font-mono-tabular font-semibold cursor-pointer ${
                      Math.abs(orderLots - preset) < 0.001
                        ? 'border-[var(--vp-primary)] bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]'
                        : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-muted)]'
                    }`}
                  >
                    {preset.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>

            {/* Pre-Trade Risk & Liquidation Preview */}
            <div className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-canvas)] px-2.5 py-1.5 text-[10px] font-mono-tabular flex items-center justify-between gap-2 text-[var(--vp-muted)]">
              <span>
                Margin: <strong className="text-[var(--vp-text)]">{formatUsd(previewBuy.requiredMargin)}</strong>
              </span>
              {previewBuy.riskUsd !== null && (
                <span>
                  If SL hits: <strong className="text-[#F23645]">-${previewBuy.riskUsd}</strong>
                </span>
              )}
              <span>
                Liq ~<strong className="text-[var(--vp-text)]">{previewBuy.estLiqPrice}</strong>
              </span>
            </div>

            {/* Auto-BE & Checklist */}
            <div className="flex items-center justify-between gap-2 text-[10.5px]">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoBeChecked}
                  onChange={(e) => setAutoBeChecked(e.target.checked)}
                  className="accent-[#089981]"
                />
                <span>Auto-BE at +1R</span>
              </label>
              {account.propShield.preTradeChecklistEnabled && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[#F59E0B] font-semibold">
                  <input
                    type="checkbox"
                    checked={checklistVerified}
                    onChange={(e) => setChecklistVerified(e.target.checked)}
                    className="accent-[#F59E0B]"
                  />
                  <span>HTF+Sweep+RR OK</span>
                </label>
              )}
            </div>

            {/* Market Execute + 3-Step Pyramid Scaling */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={marginCallActive || metrics.balance <= 0 || metrics.equity <= 0}
                onClick={() => handlePlaceOrder('SELL')}
                className="flex flex-col items-center justify-center rounded-xl bg-[#F43F5E] hover:brightness-110 disabled:opacity-45 px-3 py-2 text-[#FFFFFF] shadow-[0_0_16px_rgba(244,63,94,0.55)] cursor-pointer active:scale-[0.98]"
              >
                <span className="inline-flex items-center gap-1 text-xs font-bold">
                  <TrendingDown className="h-3.5 w-3.5" />
                  SELL {orderLots.toFixed(2)}
                </span>
                <span className="font-mono-tabular font-bold text-[10px]">Bid ${bid.toFixed(spec.precision)}</span>
              </button>

              <button
                type="button"
                disabled={marginCallActive || metrics.balance <= 0 || metrics.equity <= 0}
                onClick={() => handlePlaceOrder('BUY')}
                className="flex flex-col items-center justify-center rounded-xl bg-[#10B981] hover:brightness-110 disabled:opacity-45 px-3 py-2 text-[#FFFFFF] shadow-[0_0_16px_rgba(16,185,129,0.55)] cursor-pointer active:scale-[0.98]"
              >
                <span className="inline-flex items-center gap-1 text-xs font-bold">
                  <TrendingUp className="h-3.5 w-3.5" />
                  BUY {orderLots.toFixed(2)}
                </span>
                <span className="font-mono-tabular font-bold text-[10px]">Ask ${ask.toFixed(spec.precision)}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handlePlace3StepPyramid('SELL')}
                className="rounded-lg border border-[#F23645]/40 bg-[#F23645]/10 px-2 py-1 text-[10px] font-bold text-[#F23645] cursor-pointer hover:brightness-110"
              >
                3-Step SELL Scale
              </button>
              <button
                type="button"
                onClick={() => handlePlace3StepPyramid('BUY')}
                className="rounded-lg border border-[#089981]/40 bg-[#089981]/10 px-2 py-1 text-[10px] font-bold text-[#089981] cursor-pointer hover:brightness-110"
              >
                3-Step BUY Scale
              </button>
            </div>

            {orderNotice && (
              <p className="text-[11px] font-medium text-[var(--vp-muted)] text-center truncate">{orderNotice}</p>
            )}
          </section>

          {/* 4-Tab Trade & Shield Manager */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-1 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] p-0.5 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'open', label: `Open (${account.positions.length})` },
                  { id: 'limits', label: `Limits (${account.pendingOrders.length})` },
                  { id: 'history', label: `Journal (${account.history.length})` },
                  { id: 'shield', label: 'Prop Shield' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTradeTab(t.id)}
                  className={`flex-1 rounded-md px-2 py-1 text-[10.5px] font-bold whitespace-nowrap cursor-pointer ${
                    activeTradeTab === t.id
                      ? 'bg-[var(--vp-surface)] text-[var(--vp-text)] shadow-xs'
                      : 'text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTradeTab === 'open' && (
              <div className="space-y-2">
                {account.positions.length > 0 && (
                  <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={onCloseProfitablePositions}
                      className="flex-1 rounded border border-[#089981]/40 bg-[#089981]/10 py-1 text-[#089981] cursor-pointer"
                    >
                      Close Profits
                    </button>
                    <button
                      type="button"
                      onClick={onCloseLosingPositions}
                      className="flex-1 rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 py-1 text-[#F59E0B] cursor-pointer"
                    >
                      Close Losses
                    </button>
                    <button
                      type="button"
                      onClick={onCloseAllPositions}
                      className="flex-1 rounded border border-[#F23645]/40 bg-[#F23645]/10 py-1 text-[#F23645] cursor-pointer"
                    >
                      Close All
                    </button>
                  </div>
                )}

                {account.positions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-4 text-center text-xs text-[var(--vp-muted)]">
                    No open demo trades.
                  </div>
                ) : (
                  account.positions.map((pos) => {
                    const posSpec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
                    const mark = livePrices[pos.symbol] ?? pos.entryPrice;
                    const pnl = calcPositionPnl(pos, mark, account.simMode);
                    const isPosProfit = pnl >= 0;
                    const draft = manualEdits[pos.id] ?? {
                      tp: pos.tp !== undefined ? pos.tp.toFixed(posSpec.precision) : '',
                      sl: pos.sl !== undefined ? pos.sl.toFixed(posSpec.precision) : '',
                    };

                    return (
                      <div key={pos.id} className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px]"
                              style={{
                                backgroundColor: pos.side === 'BUY' ? 'rgba(8,153,129,0.15)' : 'rgba(242,54,69,0.15)',
                                color: pos.side === 'BUY' ? '#089981' : '#F23645',
                              }}
                            >
                              {pos.side}
                            </span>
                            <span>{posSpec.shortLabel}</span>
                            <span className="font-mono-tabular text-[var(--vp-muted)]">{pos.lots.toFixed(2)}</span>
                            {pos.isHedge && (
                              <span className="rounded bg-[#F59E0B]/15 px-1 text-[9px] text-[#F59E0B]">HEDGE</span>
                            )}
                          </div>
                          <span className="font-mono-tabular text-xs font-bold" style={{ color: isPosProfit ? '#089981' : '#F23645' }}>
                            {formatUsd(pnl, true)}
                          </span>
                        </div>

                        {/* One-Tap Pro Trade Actions */}
                        <div className="flex flex-wrap items-center gap-1 text-[9.5px] font-bold">
                          <button
                            type="button"
                            onClick={() => onPartialClosePosition(pos.id, 0.25)}
                            className="rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1.5 py-0.5 cursor-pointer"
                          >
                            Close 25%
                          </button>
                          <button
                            type="button"
                            onClick={() => onPartialClosePosition(pos.id, 0.5)}
                            className="rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1.5 py-0.5 cursor-pointer"
                          >
                            Close 50%
                          </button>
                          {onUpdateTpSl && isPosProfit && (
                            <button
                              type="button"
                              onClick={() => onUpdateTpSl(pos.id, pos.tp, Number(pos.entryPrice.toFixed(posSpec.precision)))}
                              className="rounded border border-[#089981]/40 bg-[#089981]/15 px-1.5 py-0.5 text-[#089981] cursor-pointer"
                            >
                              BE
                            </button>
                          )}
                          {pos.sl !== undefined && onToggleTrailingStop && (
                            <button
                              type="button"
                              onClick={() => onToggleTrailingStop(pos.id, pos.trailingMode === 'atr' ? 'ema20' : 'atr')}
                              className={`rounded border px-1.5 py-0.5 cursor-pointer ${
                                pos.trailingDistance ? 'border-[#F59E0B] bg-[#F59E0B]/15 text-[#F59E0B]' : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-muted)]'
                              }`}
                            >
                              TS ({pos.trailingMode ?? 'ATR'})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onReversePosition(pos.id)}
                            className="rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1.5 py-0.5 text-[#0284C7] cursor-pointer"
                          >
                            Reverse
                          </button>
                          <button
                            type="button"
                            onClick={() => onHedgePosition(pos.id)}
                            className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[#F59E0B] cursor-pointer inline-flex items-center gap-0.5"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            Hedge
                          </button>
                          <button
                            type="button"
                            onClick={() => onClosePosition(pos.id)}
                            className="ml-auto rounded border border-[#F23645]/40 bg-[#F23645]/10 px-2 py-0.5 text-[#F23645] cursor-pointer"
                          >
                            Close
                          </button>
                        </div>

                        {onUpdateTpSl && (
                          <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--vp-border)]">
                            <div className="flex-1 flex items-center gap-1 rounded border border-[var(--vp-border)] bg-[var(--vp-canvas)] px-1.5 py-0.5">
                              <span className="text-[9px] font-bold text-[#089981]">TP</span>
                              <input
                                type="number"
                                step="any"
                                placeholder="None"
                                value={draft.tp}
                                onChange={(e) => setManualEdits((p) => ({ ...p, [pos.id]: { ...draft, tp: e.target.value } }))}
                                className="w-full bg-transparent text-[10px] font-mono-tabular font-bold outline-none"
                              />
                            </div>
                            <div className="flex-1 flex items-center gap-1 rounded border border-[var(--vp-border)] bg-[var(--vp-canvas)] px-1.5 py-0.5">
                              <span className="text-[9px] font-bold text-[#F23645]">SL</span>
                              <input
                                type="number"
                                step="any"
                                placeholder="None"
                                value={draft.sl}
                                onChange={(e) => setManualEdits((p) => ({ ...p, [pos.id]: { ...draft, sl: e.target.value } }))}
                                className="w-full bg-transparent text-[10px] font-mono-tabular font-bold outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const parsedTp = Number.parseFloat(draft.tp);
                                const parsedSl = Number.parseFloat(draft.sl);
                                onUpdateTpSl(
                                  pos.id,
                                  Number.isFinite(parsedTp) && parsedTp > 0 ? parsedTp : undefined,
                                  Number.isFinite(parsedSl) && parsedSl > 0 ? parsedSl : undefined
                                );
                              }}
                              className="rounded bg-[var(--vp-primary)] text-[var(--vp-primary-fg)] px-2 py-1 text-[10px] font-bold cursor-pointer"
                            >
                              Set
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTradeTab === 'limits' && (
              <div className="space-y-1.5">
                {account.pendingOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-4 text-center text-xs text-[var(--vp-muted)]">
                    No pending limits. Double-tap the chart or use 3-Step Scale above.
                  </div>
                ) : (
                  account.pendingOrders.map((ord) => {
                    const s = DEMO_SYMBOL_SPECS[ord.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
                    return (
                      <div key={ord.id} className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-surface)] px-2.5 py-2 flex items-center justify-between gap-2 text-[11px]">
                        <div>
                          <div className="font-bold">
                            <span style={{ color: ord.side === 'BUY' ? '#089981' : '#F23645' }}>{ord.side} LIMIT</span>{' '}
                            {s.shortLabel} · {ord.lots.toFixed(2)}
                          </div>
                          <div className="font-mono-tabular text-[10px] text-[var(--vp-muted)]">
                            @{ord.limitPrice.toFixed(s.precision)} {ord.label ? `· ${ord.label}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onCancelLimitOrder(ord.id)}
                          className="rounded border border-[#F23645]/40 bg-[#F23645]/10 px-2 py-0.5 text-[10px] font-bold text-[#F23645] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTradeTab === 'history' && (
              <div className="space-y-2.5">
                {/* Account Analytics & SVG Equity Curve */}
                <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[var(--vp-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Activity className="h-3 w-3 text-[#089981]" />
                      Equity Curve · PF {perfStats.profitFactor.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        exportTredauraCardPng({
                          title: 'WEEKLY PERFORMANCE REPORT',
                          symbolLabel: `${perfStats.totalTrades} TRADES`,
                          timeframe: `WR ${perfStats.winRatePct.toFixed(1)}%`,
                          direction: perfStats.netPnl >= 0 ? 'NET PROFIT' : 'NET DRAWDOWN',
                          confidencePct: Math.round(perfStats.winRatePct),
                          entry: formatUsd(metrics.balance),
                          sl: `PF ${perfStats.profitFactor.toFixed(2)}`,
                          tp1: formatUsd(perfStats.netPnl, true),
                          tp2: `${perfStats.wins}W / ${perfStats.losses}L`,
                          thesis: `TREDAURA Analytics Report · Avg Win ${formatUsd(perfStats.avgWin)} | Avg Loss ${formatUsd(perfStats.avgLoss)}`,
                          filename: 'tredaura-weekly-report.png',
                        })
                      }
                      className="inline-flex items-center gap-1 rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1.5 py-0.5 text-[9.5px] font-bold text-[var(--vp-text)] cursor-pointer"
                    >
                      <Download className="h-2.5 w-2.5" />
                      Report Card
                    </button>
                  </div>

                  {equitySvgPath && (
                    <svg viewBox="0 0 280 50" className="w-full h-12 rounded bg-[var(--vp-canvas)] border border-[var(--vp-border)]">
                      <path
                        d={equitySvgPath}
                        fill="none"
                        stroke={perfStats.netPnl >= 0 ? '#089981' : '#F23645'}
                        strokeWidth="2"
                      />
                    </svg>
                  )}

                  <div className="grid grid-cols-3 gap-1.5 font-mono-tabular text-[10.5px]">
                    <div className="rounded bg-[var(--vp-elevated)] px-2 py-1">
                      <span className="block text-[9px] text-[var(--vp-muted)]">Win Rate</span>
                      <strong>{perfStats.winRatePct.toFixed(1)}%</strong>
                    </div>
                    <div className="rounded bg-[var(--vp-elevated)] px-2 py-1">
                      <span className="block text-[9px] text-[var(--vp-muted)]">Profit Factor</span>
                      <strong>{perfStats.profitFactor.toFixed(2)}</strong>
                    </div>
                    <div className="rounded bg-[var(--vp-elevated)] px-2 py-1 text-right">
                      <span className="block text-[9px] text-[var(--vp-muted)]">Net PnL</span>
                      <strong style={{ color: perfStats.netPnl >= 0 ? '#089981' : '#F23645' }}>
                        {formatUsd(perfStats.netPnl, true)}
                      </strong>
                    </div>
                  </div>
                </div>

                {account.history.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-4 text-center text-xs text-[var(--vp-muted)]">
                    No closed trades yet.
                  </div>
                ) : (
                  account.history.slice(0, 30).map((tr) => {
                    const trSpec = DEMO_SYMBOL_SPECS[tr.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
                    return (
                      <div key={tr.id} className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-surface)] p-2 space-y-1 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span style={{ color: tr.side === 'BUY' ? '#089981' : '#F23645' }}>{tr.side}</span>
                            <span>{trSpec.shortLabel}</span>
                            <span className="font-mono-tabular text-[var(--vp-muted)]">{tr.lots.toFixed(2)}</span>
                          </div>
                          <span className="font-mono-tabular font-extrabold" style={{ color: tr.pnl >= 0 ? '#089981' : '#F23645' }}>
                            {formatUsd(tr.pnl, true)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 text-[9.5px]">
                          <span className="font-mono-tabular text-[var(--vp-muted)]">
                            ${tr.entryPrice.toFixed(trSpec.precision)} → ${tr.closePrice.toFixed(trSpec.precision)}
                          </span>
                          <select
                            aria-label="Emotion tag"
                            value={tr.emotionTag ?? 'Plan'}
                            onChange={(e) => onUpdateTradeEmotion(tr.id, e.target.value as TradeEmotionTag)}
                            className="rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1 py-0.5 text-[9.5px] font-bold text-[var(--vp-text)] outline-none cursor-pointer"
                          >
                            {EMOTION_TAGS.map((tag) => (
                              <option key={tag} value={tag}>{tag}</option>
                            ))}
                          </select>
                        </div>
                        {tr.aiReview && (
                          <p className="text-[10px] text-[var(--vp-muted)] leading-snug">AI Review: {tr.aiReview}</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTradeTab === 'shield' && (
              <div className="space-y-2.5">
                {/* Prop-Firm Rules & Drawdown Recovery */}
                <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                      <ShieldCheck className="h-4 w-4 text-[#089981]" />
                      Prop-Firm Risk Telemetry
                    </span>
                    <span className="font-mono-tabular text-[10px] text-[var(--vp-muted)]">
                      Advisory Only (Non-Blocking)
                    </span>
                  </div>

                  <div className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] p-2 text-[11px] space-y-1">
                    <div className="font-bold text-[#F59E0B]">AI Drawdown Recovery Roadmap</div>
                    <p className="text-[10.5px] text-[var(--vp-muted)]">{recoveryRoadmap.planLabel}</p>
                  </div>

                  {[
                    {
                      label: 'Daily Profit Target Lock (+4%)',
                      checked: account.propShield.profitLockEnabled,
                      toggle: () => onUpdatePropShield({ profitLockEnabled: !account.propShield.profitLockEnabled }),
                    },
                    {
                      label: 'Pre-Trade Checklist Gatekeeper',
                      checked: account.propShield.preTradeChecklistEnabled,
                      toggle: () => onUpdatePropShield({ preTradeChecklistEnabled: !account.propShield.preTradeChecklistEnabled }),
                    },
                    {
                      label: 'Volatility Lot Reducer (-15% in high ATR)',
                      checked: account.propShield.volatilityLotReducer,
                      toggle: () => onUpdatePropShield({ volatilityLotReducer: !account.propShield.volatilityLotReducer }),
                    },
                    {
                      label: 'Haptic Feedback (Vibration)',
                      checked: account.propShield.hapticsEnabled,
                      toggle: () => onUpdatePropShield({ hapticsEnabled: !account.propShield.hapticsEnabled }),
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.toggle}
                      className="w-full flex items-center justify-between gap-2 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2.5 py-2 text-[11px] font-semibold cursor-pointer text-left"
                    >
                      <span>{item.label}</span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[9.5px] font-bold"
                        style={{
                          backgroundColor: item.checked ? '#089981' : 'var(--vp-control)',
                          color: item.checked ? '#FFFFFF' : 'var(--vp-muted)',
                        }}
                      >
                        {item.checked ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Custom Demo Balance */}
                <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-3 space-y-2">
                  <span className="text-xs font-bold">Custom Demo Balance</span>
                  <div className="grid grid-cols-5 gap-1">
                    {[100, 500, 1000, 5000, 10000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          onSetCustomBalance(preset);
                          setCustomBalanceInput(String(preset));
                          setOrderNotice(`Demo balance set to $${preset.toLocaleString()}`);
                        }}
                        className="rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] py-1 text-[10px] font-mono-tabular font-bold cursor-pointer"
                      >
                        ${preset >= 1000 ? `${preset / 1000}k` : preset}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="50"
                      min="10"
                      max="1000000"
                      aria-label="Custom demo balance amount"
                      value={customBalanceInput}
                      onChange={(e) => setCustomBalanceInput(e.target.value)}
                      className="h-8 flex-1 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2 text-center font-mono-tabular text-xs font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = Number.parseFloat(customBalanceInput);
                        if (Number.isFinite(val) && val > 0) {
                          onSetCustomBalance(val);
                          setOrderNotice(`Demo balance set to $${val.toLocaleString()}`);
                        }
                      }}
                      className="rounded-lg bg-[#089981] px-3 py-1.5 text-xs font-bold text-[#FFFFFF] cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
};
