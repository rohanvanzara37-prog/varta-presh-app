import React, { useEffect, useState } from 'react';
import { Minus, Plus, RotateCcw, TrendingDown, TrendingUp, X } from 'lucide-react';
import type { SmcSymbol } from './ProSmcTerminal';
import {
  DEMO_SYMBOL_SPECS,
  calcPositionPnl,
  calcRequiredMargin,
  formatUsd,
  type DemoAccountMetrics,
  type DemoAccountState,
  type DemoLeverage,
} from '../utils/demoAccount';

interface DemoAccountDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  account: DemoAccountState;
  metrics: DemoAccountMetrics;
  activeSymbol: SmcSymbol;
  livePrices: Partial<Record<SmcSymbol, number>>;
  onExecuteOrder: (symbol: SmcSymbol, side: 'BUY' | 'SELL', lots: number) => string | null;
  onClosePosition: (positionId: string) => void;
  onCloseAllPositions: () => void;
  onChangeLeverage: (leverage: DemoLeverage) => void;
  onChangeDefaultLot: (lots: number) => void;
  onResetAccount: () => void;
}

const LEVERAGES: DemoLeverage[] = [50, 100, 200, 500];
const LOT_PRESETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0];

export const DemoAccountDrawer: React.FC<DemoAccountDrawerProps> = ({
  isOpen,
  onClose,
  account,
  metrics,
  activeSymbol,
  livePrices,
  onExecuteOrder,
  onClosePosition,
  onCloseAllPositions,
  onChangeLeverage,
  onChangeDefaultLot,
  onResetAccount,
}) => {
  const [orderSymbol, setOrderSymbol] = useState<SmcSymbol>(activeSymbol);
  const [orderLots, setOrderLots] = useState<number>(account.defaultLot);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);

  useEffect(() => {
    setOrderSymbol(activeSymbol);
  }, [activeSymbol]);

  useEffect(() => {
    setOrderLots(account.defaultLot);
  }, [account.defaultLot]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const spec = DEMO_SYMBOL_SPECS[orderSymbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const currentPrice = livePrices[orderSymbol] ?? spec.defaultPrice;
  const requiredMargin = calcRequiredMargin(orderSymbol, orderLots, currentPrice, account.leverage);

  const handlePlaceOrder = (side: 'BUY' | 'SELL') => {
    const err = onExecuteOrder(orderSymbol, side, orderLots);
    if (err) {
      setOrderNotice(err);
      return;
    }
    setOrderNotice(`${side} ${orderLots.toFixed(2)} ${spec.shortLabel} @ $${currentPrice.toFixed(spec.precision)}`);
  };

  const adjustLots = (delta: number) => {
    const next = Math.max(0.01, Math.min(10, Number((orderLots + delta).toFixed(2))));
    setOrderLots(next);
    onChangeDefaultLot(next);
  };

  return (
    <div className="fixed inset-0 z-[130] flex justify-end" role="dialog" aria-modal="true" aria-label="Demo Trading Account Panel">
      <button
        type="button"
        aria-label="Close Demo Account Panel"
        onClick={onClose}
        className="flex-1 bg-slate-900/25 backdrop-blur-[1px] cursor-pointer"
      />

      <aside className="relative h-full w-full max-w-[380px] bg-[#FFFFFF] text-[#0F172A] border-l border-[#E2E8F0] shadow-2xl flex flex-col overflow-hidden">
        {/* Panel Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#E2E8F0] bg-[#FFFFFF]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center rounded border border-[#059669]/35 bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#059669]">
              DEMO
            </span>
            <h2 className="text-sm font-bold tracking-tight text-[#0F172A] truncate">
              Paper Trading Account
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onResetAccount();
                setOrderNotice('Account reset to $1,000.00');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] px-2.5 py-1.5 text-[11px] font-semibold text-[#0F172A] cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="h-3 w-3 text-[#475569]" />
              Reset to $1,000
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] hover:bg-[#F8FAFC] text-[#475569] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 bg-[#FFFFFF]">
          {/* Live Account Summary (2x2 Clean Metrics Grid) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                Balance
              </span>
              <span className="block font-mono-tabular text-sm font-bold text-[#0F172A] mt-0.5">
                {formatUsd(metrics.balance)}
              </span>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                Equity (Live)
              </span>
              <span
                className="block font-mono-tabular text-sm font-bold mt-0.5"
                style={{
                  color:
                    metrics.floatingPnl > 0.005
                      ? '#059669'
                      : metrics.floatingPnl < -0.005
                        ? '#DC2626'
                        : '#0F172A',
                }}
              >
                {formatUsd(metrics.equity)}
              </span>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                Used Margin
              </span>
              <span className="block font-mono-tabular text-sm font-bold text-[#0F172A] mt-0.5">
                {formatUsd(metrics.usedMargin)}
              </span>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                Free Margin
              </span>
              <span className="block font-mono-tabular text-sm font-bold text-[#0F172A] mt-0.5">
                {formatUsd(metrics.freeMargin)}
              </span>
            </div>
          </div>

          {/* Leverage Selector */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2">
            <span className="text-xs font-semibold text-[#475569]">Leverage</span>
            <div className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-0.5">
              {LEVERAGES.map((lev) => {
                const active = account.leverage === lev;
                return (
                  <button
                    key={lev}
                    type="button"
                    onClick={() => onChangeLeverage(lev)}
                    className={`rounded-md px-2 py-1 text-[11px] font-mono-tabular font-bold cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#FFFFFF] text-[#0F172A] shadow-sm'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    1:{lev}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Market Order Execution */}
          <section className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <select
                aria-label="Order instrument"
                value={orderSymbol}
                onChange={(e) => setOrderSymbol(e.target.value as SmcSymbol)}
                className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-bold text-[#0F172A] outline-none cursor-pointer"
              >
                {Object.values(DEMO_SYMBOL_SPECS).map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.shortLabel}
                  </option>
                ))}
              </select>

              <div className="text-right font-mono-tabular">
                <span className="block text-[10px] text-[#64748B]">Market Price</span>
                <span className="text-xs font-bold text-[#0F172A]">
                  ${currentPrice.toFixed(spec.precision)}
                </span>
              </div>
            </div>

            {/* Lot Size Stepper & Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#475569]">Volume (Lots)</span>
                <span className="text-[11px] font-mono-tabular text-[#64748B]">
                  Req. Margin: <strong className="text-[#0F172A]">{formatUsd(requiredMargin)}</strong>
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => adjustLots(-0.01)}
                  aria-label="Decrease lots"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] cursor-pointer"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10"
                  aria-label="Lot size"
                  value={orderLots}
                  onChange={(e) => {
                    const val = Number.parseFloat(e.target.value);
                    if (Number.isFinite(val) && val > 0) {
                      const clamped = Math.max(0.01, Math.min(10, Number(val.toFixed(2))));
                      setOrderLots(clamped);
                      onChangeDefaultLot(clamped);
                    }
                  }}
                  className="h-9 flex-1 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-2 text-center font-mono-tabular text-xs font-bold text-[#0F172A] outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustLots(0.01)}
                  aria-label="Increase lots"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-6 gap-1">
                {LOT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setOrderLots(preset);
                      onChangeDefaultLot(preset);
                    }}
                    className={`rounded-md border py-1 text-[10px] font-mono-tabular font-semibold cursor-pointer transition-colors ${
                      Math.abs(orderLots - preset) < 0.001
                        ? 'border-[#0F172A] bg-[#0F172A] text-[#FFFFFF]'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A]'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Buy / Sell Execution Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => handlePlaceOrder('SELL')}
                className="flex flex-col items-center justify-center rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] px-3 py-2 text-[#FFFFFF] shadow-sm cursor-pointer active:scale-[0.98] transition-all"
              >
                <span className="inline-flex items-center gap-1 text-xs font-bold">
                  <TrendingDown className="h-3.5 w-3.5" />
                  SELL {orderLots.toFixed(2)}
                </span>
                <span className="font-mono-tabular text-[10px] opacity-90">
                  ${currentPrice.toFixed(spec.precision)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handlePlaceOrder('BUY')}
                className="flex flex-col items-center justify-center rounded-xl bg-[#059669] hover:bg-[#047857] px-3 py-2 text-[#FFFFFF] shadow-sm cursor-pointer active:scale-[0.98] transition-all"
              >
                <span className="inline-flex items-center gap-1 text-xs font-bold">
                  <TrendingUp className="h-3.5 w-3.5" />
                  BUY {orderLots.toFixed(2)}
                </span>
                <span className="font-mono-tabular text-[10px] opacity-90">
                  ${currentPrice.toFixed(spec.precision)}
                </span>
              </button>
            </div>

            {orderNotice && (
              <p className="text-[11px] font-medium text-[#475569] text-center truncate">
                {orderNotice}
              </p>
            )}
          </section>

          {/* Open Positions */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#0F172A]">
                Open Positions ({account.positions.length})
              </h3>
              {account.positions.length > 0 && (
                <button
                  type="button"
                  onClick={onCloseAllPositions}
                  className="text-[11px] font-semibold text-[#DC2626] hover:underline cursor-pointer"
                >
                  Close All
                </button>
              )}
            </div>

            {account.positions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-4 text-center text-xs text-[#64748B]">
                No open demo trades. Tap Buy or Sell above to execute with live chart P&amp;L.
              </div>
            ) : (
              <div className="space-y-1.5">
                {account.positions.map((pos) => {
                  const posSpec = DEMO_SYMBOL_SPECS[pos.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
                  const mark = livePrices[pos.symbol] ?? pos.entryPrice;
                  const pnl = calcPositionPnl(pos, mark);
                  const isPosProfit = pnl >= 0;

                  return (
                    <div
                      key={pos.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px]"
                            style={{
                              backgroundColor: pos.side === 'BUY' ? '#ECFDF5' : '#FEF2F2',
                              color: pos.side === 'BUY' ? '#059669' : '#DC2626',
                            }}
                          >
                            {pos.side}
                          </span>
                          <span className="text-[#0F172A]">{posSpec.shortLabel}</span>
                          <span className="font-mono-tabular text-[#64748B] font-medium">
                            {pos.lots.toFixed(2)} lot
                          </span>
                        </div>
                        <div className="font-mono-tabular text-[10.5px] text-[#64748B] mt-0.5">
                          Entry ${pos.entryPrice.toFixed(posSpec.precision)} → Now ${mark.toFixed(posSpec.precision)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="font-mono-tabular text-xs font-bold"
                          style={{ color: isPosProfit ? '#059669' : '#DC2626' }}
                        >
                          {formatUsd(pnl, true)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onClosePosition(pos.id)}
                          className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#FEF2F2] hover:border-[#DC2626]/40 hover:text-[#DC2626] px-2 py-1 text-[10.5px] font-semibold text-[#0F172A] cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent Closed Trades */}
          {account.history.length > 0 && (
            <section className="space-y-1.5 pt-1 border-t border-[#E2E8F0]">
              <h3 className="text-xs font-bold text-[#475569]">Recent Closed ({account.history.length})</h3>
              <div className="space-y-1">
                {account.history.slice(0, 6).map((tr) => {
                  const trSpec = DEMO_SYMBOL_SPECS[tr.symbol] ?? DEMO_SYMBOL_SPECS.XAUUSD;
                  return (
                    <div
                      key={tr.id}
                      className="flex items-center justify-between text-[11px] font-mono-tabular py-1 border-b border-[#F1F5F9] last:border-b-0"
                    >
                      <span className="text-[#475569] font-sans font-medium">
                        {tr.side} {tr.lots.toFixed(2)} {trSpec.shortLabel}
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: tr.pnl >= 0 ? '#059669' : '#DC2626' }}
                      >
                        {formatUsd(tr.pnl, true)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
};
