import React from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { SmartChartSummary } from '../utils/technicalIndicators';

interface MarketTradeSuggestionCardProps {
  pairLabel: string;
  timeframeLabel: string;
  summary: SmartChartSummary;
  dataSourceLabel?: string;
  compact?: boolean;
}

function formatLevel(val: number): string {
  if (val >= 1000) {
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (val >= 10) return val.toFixed(2);
  return val.toFixed(4);
}

export const MarketTradeSuggestionCard: React.FC<MarketTradeSuggestionCardProps> = ({
  pairLabel,
  timeframeLabel,
  summary,
  dataSourceLabel = 'Live Technical Feed',
  compact = false,
}) => {
  const isBuy = summary.action.includes('BUY');
  const isSell = summary.action.includes('SELL');

  const actionColor = isBuy ? '#10b981' : isSell ? '#ef4444' : '#f59e0b';
  const actionBg = isBuy
    ? 'rgba(16, 185, 129, 0.14)'
    : isSell
      ? 'rgba(239, 68, 68, 0.14)'
      : 'rgba(245, 158, 11, 0.14)';

  return (
    <section
      aria-label={`Buy and Sell Analysis for ${pairLabel}`}
      className="rounded-2xl border p-4 sm:p-5 space-y-4"
      style={{
        backgroundColor: 'var(--vp-surface)',
        borderColor: 'var(--vp-border)',
      }}
    >
      {/* Top Analysis Header + Directional BUY / SELL Callout */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--vp-border)' }}>
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium" style={{ color: 'var(--vp-muted)' }}>
            <span>{pairLabel} Market Analysis</span>
            <span aria-hidden="true">·</span>
            <span>Timeframe: {timeframeLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{dataSourceLabel}</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold tracking-tight">
            {isBuy
              ? `Buy Setup Suggested · ${summary.trendLabel}`
              : isSell
                ? `Sell Setup Suggested · ${summary.trendLabel}`
                : `Neutral Range · Wait for Confirmation`}
          </h3>
          <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--vp-muted)' }}>
            {summary.summaryText}
          </p>
        </div>

        <div
          className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 shrink-0"
          style={{
            backgroundColor: actionBg,
            borderColor: actionColor,
            color: actionColor,
          }}
        >
          {isBuy ? (
            <TrendingUp className="h-5 w-5 shrink-0" />
          ) : isSell ? (
            <TrendingDown className="h-5 w-5 shrink-0" />
          ) : (
            <Activity className="h-5 w-5 shrink-0" />
          )}
          <div className="leading-tight">
            <span className="block text-sm font-bold tracking-wide whitespace-nowrap">
              {summary.action}
            </span>
            <span className="block text-[11px] font-mono-tabular font-semibold">
              {summary.confidencePct}% Confluence ({summary.score > 0 ? `+${summary.score}` : summary.score}/6)
            </span>
          </div>
        </div>
      </div>

      {/* Actionable Trade Levels Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <div
          className="rounded-xl border p-3"
          style={{
            backgroundColor: 'var(--vp-elevated)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
            {isSell ? <ArrowDownRight className="h-3.5 w-3.5 text-rose-500" /> : <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />}
            <span>{isBuy ? 'Buy Entry Zone' : isSell ? 'Sell Entry Zone' : 'Breakout Watch'}</span>
          </span>
          <span className="block font-mono-tabular text-sm font-bold mt-1">
            ${formatLevel(summary.entryLow)} – ${formatLevel(summary.entryHigh)}
          </span>
          <span className="block text-[11px] font-mono-tabular mt-0.5" style={{ color: 'var(--vp-muted)' }}>
            Spot: ${formatLevel(summary.currentPrice)}
          </span>
        </div>

        <div
          className="rounded-xl border p-3"
          style={{
            backgroundColor: 'var(--vp-elevated)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
            <Target className="h-3.5 w-3.5 text-emerald-500" />
            <span>Target 1 (TP1)</span>
          </span>
          <span className="block font-mono-tabular text-sm font-bold mt-1 text-emerald-500">
            ${formatLevel(summary.takeProfit1)}
          </span>
          <span className="block text-[11px] font-mono-tabular mt-0.5" style={{ color: 'var(--vp-muted)' }}>
            Primary book level
          </span>
        </div>

        <div
          className="rounded-xl border p-3"
          style={{
            backgroundColor: 'var(--vp-elevated)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
            <Target className="h-3.5 w-3.5 text-emerald-500" />
            <span>Target 2 (TP2)</span>
          </span>
          <span className="block font-mono-tabular text-sm font-bold mt-1 text-emerald-500">
            ${formatLevel(summary.takeProfit2)}
          </span>
          <span className="block text-[11px] font-mono-tabular mt-0.5" style={{ color: 'var(--vp-muted)' }}>
            Extended runner
          </span>
        </div>

        <div
          className="rounded-xl border p-3"
          style={{
            backgroundColor: 'var(--vp-elevated)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
            <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
            <span>Stop Loss (SL)</span>
          </span>
          <span className="block font-mono-tabular text-sm font-bold mt-1 text-rose-500">
            ${formatLevel(summary.stopLoss)}
          </span>
          <span className="block text-[11px] font-mono-tabular mt-0.5" style={{ color: 'var(--vp-muted)' }}>
            ATR: ${formatLevel(summary.atr14)}
          </span>
        </div>

        <div
          className="rounded-xl border p-3 col-span-2 sm:col-span-1"
          style={{
            backgroundColor: 'var(--vp-elevated)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <span className="block text-[11px] font-semibold" style={{ color: 'var(--vp-muted)' }}>
            Risk / Reward
          </span>
          <span className="block font-mono-tabular text-sm font-bold mt-1" style={{ color: 'var(--vp-primary)' }}>
            {summary.riskReward}
          </span>
          <span className="block text-[11px] font-mono-tabular mt-0.5" style={{ color: 'var(--vp-muted)' }}>
            S1 ${formatLevel(summary.supportS1)} · R1 ${formatLevel(summary.resistanceR1)}
          </span>
        </div>
      </div>

      {/* 6-Indicator Technical Reasoning Checklist */}
      {!compact && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {summary.signals.map((sig) => {
            const sigColor =
              sig.bias === 'BULLISH'
                ? '#10b981'
                : sig.bias === 'BEARISH'
                  ? '#ef4444'
                  : '#f59e0b';
            return (
              <div
                key={sig.name}
                className="flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                <div className="min-w-0">
                  <span className="block text-xs font-bold">{sig.name}</span>
                  <span className="block text-[11px] mt-0.5" style={{ color: 'var(--vp-muted)' }}>
                    {sig.detail}
                  </span>
                </div>
                <span
                  className="text-[11px] font-mono-tabular font-bold whitespace-nowrap shrink-0"
                  style={{ color: sigColor }}
                >
                  {sig.bias}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
