import React, { useMemo } from 'react';
import type { AcademyCandle, ChartZoneOverlay } from '../../types/academy';

interface InteractiveChartStageProps {
  symbol: string;
  decimals: number;
  candles: AcademyCandle[];
  zones: ChartZoneOverlay[];
  targetCandleIndex: number;
  targetZoneId: string;
  isAnswered: boolean;
}

const VIEW_W = 460;
const VIEW_H = 236;
const PAD_L = 10;
const PAD_R = 54;
const PAD_T = 24;
const PAD_B = 20;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

function formatPrice(val: number, decimals: number): string {
  return val.toFixed(decimals);
}

export const InteractiveChartStage: React.FC<InteractiveChartStageProps> = ({
  symbol,
  decimals,
  candles,
  zones,
  targetCandleIndex,
  targetZoneId,
  isAnswered,
}) => {
  const safeTargetIdx = Math.max(0, Math.min(candles.length - 1, targetCandleIndex));
  const activeZone = useMemo(
    () => zones.find((z) => z.id === targetZoneId) ?? zones[0],
    [zones, targetZoneId]
  );

  const { minPrice, maxPrice } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    if (isAnswered && activeZone) {
      lo = Math.min(lo, activeZone.low);
      hi = Math.max(hi, activeZone.high);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
      return { minPrice: 0, maxPrice: 100 };
    }
    const pad = (hi - lo) * 0.17;
    return { minPrice: lo - pad, maxPrice: hi + pad };
  }, [candles, isAnswered, activeZone]);

  const priceToY = (price: number): number => {
    const ratio = (price - minPrice) / Math.max(1e-6, maxPrice - minPrice);
    return PAD_T + PLOT_H * (1 - ratio);
  };

  const totalBars = Math.max(candles.length, 1);
  const colW = PLOT_W / totalBars;
  const indexToX = (idx: number) => PAD_L + (idx + 0.5) * colW;
  const gridPrices = [0, 0.33, 0.66, 1].map((f) => minPrice + f * (maxPrice - minPrice));

  const targetCandle = candles[safeTargetIdx];
  const targetCx = indexToX(safeTargetIdx);
  const targetHighY = targetCandle ? priceToY(targetCandle.high) : PAD_T + PLOT_H / 2;
  const targetLowY = targetCandle ? priceToY(targetCandle.low) : PAD_T + PLOT_H / 2;
  const placeBadgeBelow = targetHighY < PAD_T + 28 && targetLowY < PAD_T + PLOT_H - 22;
  const mysteryBadgeY = placeBadgeBelow
    ? Math.min(PAD_T + PLOT_H - 13, targetLowY + 17)
    : Math.max(PAD_T + 13, targetHighY - 17);

  return (
    <div className="flex-1 min-h-0 w-full rounded-2xl border border-[#E5E7EB] bg-white p-1.5 flex items-center justify-center overflow-hidden">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-full max-h-full select-none"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${symbol} candlestick chart`}
      >
        {/* Crisp White Canvas */}
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="#FFFFFF" />

        {/* Horizontal Light Gridlines & Dark Price Axis */}
        {gridPrices.map((gp, i) => {
          const y = priceToY(gp);
          return (
            <g key={i}>
              <line
                x1={PAD_L}
                y1={y}
                x2={PAD_L + PLOT_W}
                y2={y}
                stroke="#F3F4F6"
                strokeWidth={1}
              />
              <text
                x={PAD_L + PLOT_W + 6}
                y={y + 3.5}
                fill="#4B5563"
                fontSize="9.5"
                fontWeight="500"
                className="font-mono-tabular"
              >
                {formatPrice(gp, decimals)}
              </text>
            </g>
          );
        })}

        {/* Revealed Zone Overlay (shown only after an MCQ answer is chosen) */}
        {isAnswered && activeZone && (() => {
          const x1 = PAD_L + Math.max(0, activeZone.startIndex) * colW;
          const x2 = PAD_L + Math.min(totalBars, activeZone.endIndex + 1) * colW;
          const yTop = priceToY(activeZone.high);
          const yBot = priceToY(activeZone.low);
          const fill =
            activeZone.sentiment === 'bull'
              ? 'rgba(22, 163, 74, 0.12)'
              : activeZone.sentiment === 'bear'
                ? 'rgba(220, 38, 38, 0.11)'
                : 'rgba(245, 184, 0, 0.16)';
          const stroke =
            activeZone.sentiment === 'bull'
              ? '#16A34A'
              : activeZone.sentiment === 'bear'
                ? '#DC2626'
                : '#D97706';
          const labelW = Math.min(152, Math.max(88, activeZone.label.length * 5.2 + 12));
          const labelX = Math.min(PAD_L + PLOT_W - labelW - 2, Math.max(PAD_L + 4, x1 + 4));
          const labelY = Math.max(PAD_T + 14, yBot - 5);
          return (
            <g>
              <rect
                x={x1}
                y={yTop}
                width={Math.max(14, x2 - x1)}
                height={Math.max(10, yBot - yTop)}
                fill={fill}
                stroke={stroke}
                strokeWidth={1.35}
                strokeDasharray="3 2"
                rx={4}
              />
              <rect
                x={labelX - 3}
                y={labelY - 10}
                width={labelW}
                height={13}
                rx={3}
                fill="rgba(255, 255, 255, 0.92)"
                stroke={stroke}
                strokeWidth={0.6}
              />
              <text
                x={labelX + 2}
                y={labelY - 0.5}
                fill="#111827"
                fontSize="8.5"
                fontWeight="700"
              >
                {activeZone.label}
              </text>
            </g>
          );
        })()}

        {/* Target Candle Column Highlight (golden #f5b800) */}
        {!isAnswered ? (
          <rect
            x={targetCx - colW * 0.44}
            y={PAD_T}
            width={colW * 0.88}
            height={PLOT_H}
            fill="rgba(245, 184, 0, 0.08)"
            stroke="rgba(245, 184, 0, 0.58)"
            strokeWidth={1}
            strokeDasharray="3 3"
            rx={4}
          />
        ) : (
          <rect
            x={targetCx - colW * 0.46}
            y={Math.max(PAD_T + 2, targetHighY - 7)}
            width={colW * 0.92}
            height={Math.max(18, targetLowY - targetHighY + 14)}
            fill="rgba(245, 184, 0, 0.22)"
            stroke="#f5b800"
            strokeWidth={1.85}
            rx={5}
          />
        )}

        {/* Candlesticks */}
        {candles.map((c, idx) => {
          const cx = indexToX(idx);
          const isBull = c.close >= c.open;
          const color = isBull ? '#16A34A' : '#DC2626';
          const yHigh = priceToY(c.high);
          const yLow = priceToY(c.low);
          const yOpen = priceToY(c.open);
          const yClose = priceToY(c.close);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(2.5, Math.abs(yOpen - yClose));
          const bodyW = Math.max(7, Math.min(18, colW * 0.54));
          const isTarget = idx === safeTargetIdx;

          return (
            <g key={`${c.timeLabel}-${idx}`}>
              <line
                x1={cx}
                y1={yHigh}
                x2={cx}
                y2={yLow}
                stroke={color}
                strokeWidth={isTarget && isAnswered ? 2.2 : 1.5}
              />
              <rect
                x={cx - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={color}
                stroke={isTarget && isAnswered ? '#111827' : color}
                strokeWidth={isTarget && isAnswered ? 1.2 : 0.4}
                rx={1.5}
              />
              {idx % 3 === 0 && (
                <text
                  x={cx}
                  y={VIEW_H - 5}
                  textAnchor="middle"
                  fill="#6B7280"
                  fontSize="8.5"
                  className="font-mono-tabular"
                >
                  {c.timeLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Mystery '?' Marker on Target Candle before answering */}
        {!isAnswered && (
          <g>
            <circle
              cx={targetCx}
              cy={mysteryBadgeY}
              r={11.5}
              fill="#f5b800"
              stroke="#111827"
              strokeWidth={1.5}
            />
            <text
              x={targetCx}
              y={mysteryBadgeY + 4.5}
              textAnchor="middle"
              fill="#111827"
              fontSize="13"
              fontWeight="800"
            >
              ?
            </text>
          </g>
        )}

        {/* Target Candle Tag after answering */}
        {isAnswered && (
          <g>
            {(() => {
              const badgeX = Math.max(PAD_L + 22, Math.min(PAD_L + PLOT_W - 22, targetCx));
              const badgeY = placeBadgeBelow
                ? Math.min(PAD_T + PLOT_H - 9, targetLowY + 14)
                : Math.max(PAD_T + 9, targetHighY - 14);
              return (
                <>
                  <rect
                    x={badgeX - 21}
                    y={badgeY - 8}
                    width={42}
                    height={15}
                    rx={4}
                    fill="#f5b800"
                    stroke="#111827"
                    strokeWidth={0.95}
                  />
                  <text
                    x={badgeX}
                    y={badgeY + 2.5}
                    textAnchor="middle"
                    fill="#111827"
                    fontSize="8.5"
                    fontWeight="800"
                  >
                    TARGET
                  </text>
                </>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
};
