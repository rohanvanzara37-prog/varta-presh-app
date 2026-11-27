import React, { useMemo } from 'react';
import type { AcademyCandle, AcademyDirection } from '../../types/academy';
import type { ThemeMode } from '../../types/news';

interface InteractiveChartStageProps {
  symbol: string;
  decimals: number;
  initialCount: number;
  visibleCandles: AcademyCandle[];
  decisionSubmitted: boolean;
  chosenDirection?: AcademyDirection | null;
  entry: number;
  tp: number;
  sl: number;
  outcomeStatus: 'idle' | 'replaying' | 'tp' | 'sl';
  themeMode?: ThemeMode;
}

const VIEW_W = 460;
const VIEW_H = 236;
const PAD_L = 10;
const PAD_R = 62;
const PAD_T = 22;
const PAD_B = 20;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

function formatPrice(val: number, decimals: number): string {
  return val.toFixed(decimals);
}

export const InteractiveChartStage: React.FC<InteractiveChartStageProps> = ({
  symbol,
  decimals,
  initialCount,
  visibleCandles,
  decisionSubmitted,
  chosenDirection = null,
  entry,
  tp,
  sl,
  outcomeStatus,
  themeMode = 'dark',
}) => {
  const isDark = themeMode === 'dark';
  const canvasBg = isDark ? '#060911' : '#FFFFFF';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const axisTextColor = isDark ? '#FFFFFF' : '#475569';
  const bullColor = '#089981';
  const bearColor = '#F23645';
  const goldColor = '#F59E0B';
  const badgeDark = isDark ? '#0F1626' : '#131722';

  const decisionIdx = Math.max(0, initialCount - 1);

  const { minPrice, maxPrice } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of visibleCandles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    if (decisionSubmitted) {
      lo = Math.min(lo, entry, tp, sl);
      hi = Math.max(hi, entry, tp, sl);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
      return { minPrice: 0, maxPrice: 100 };
    }
    const pad = (hi - lo) * 0.14;
    return { minPrice: lo - pad, maxPrice: hi + pad };
  }, [visibleCandles, decisionSubmitted, entry, tp, sl]);

  const priceToY = (price: number): number => {
    const ratio = (price - minPrice) / Math.max(1e-6, maxPrice - minPrice);
    return PAD_T + PLOT_H * (1 - ratio);
  };

  const totalSlots = decisionSubmitted
    ? Math.max(initialCount + 8, visibleCandles.length)
    : Math.max(initialCount + 3, visibleCandles.length);
  const colW = PLOT_W / totalSlots;
  const indexToX = (idx: number) => PAD_L + (idx + 0.5) * colW;
  const gridPrices = [0, 0.33, 0.66, 1].map((f) => minPrice + f * (maxPrice - minPrice));

  const decisionX = indexToX(decisionIdx);
  const entryY = priceToY(entry);
  const tpY = priceToY(tp);
  const slY = priceToY(sl);

  return (
    <div className="flex-1 min-h-0 w-full rounded-xl border border-[var(--vp-border)] bg-[var(--vp-canvas)] p-1.5 flex items-center justify-center overflow-hidden relative">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-full max-h-full select-none rounded-lg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${symbol} Market Replay chart`}
      >
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={canvasBg} rx={8} />

        {/* Horizontal Gridlines & Price Scale */}
        {gridPrices.map((gp, i) => {
          const y = priceToY(gp);
          return (
            <g key={i}>
              <line
                x1={PAD_L}
                y1={y}
                x2={PAD_L + PLOT_W}
                y2={y}
                stroke={gridColor}
                strokeWidth={1}
              />
              <text
                x={PAD_L + PLOT_W + 6}
                y={y + 3.5}
                fill={axisTextColor}
                fontSize="8.8"
                fontWeight="600"
                className="font-mono-tabular"
              >
                {formatPrice(gp, decimals)}
              </text>
            </g>
          );
        })}

        {/* Vertical Decision Cutoff Line */}
        <line
          x1={decisionX + colW * 0.52}
          y1={PAD_T}
          x2={decisionX + colW * 0.52}
          y2={PAD_T + PLOT_H}
          stroke={goldColor}
          strokeWidth={1.2}
          strokeDasharray="3 3"
        />

        {!decisionSubmitted && (
          <g>
            <rect
              x={decisionX + colW * 0.62}
              y={PAD_T + 4}
              width={92}
              height={17}
              rx={4}
              fill="rgba(245, 158, 11, 0.14)"
              stroke={goldColor}
              strokeWidth={0.8}
            />
            <text
              x={decisionX + colW * 0.62 + 46}
              y={PAD_T + 15.5}
              textAnchor="middle"
              fill={goldColor}
              fontSize="8"
              fontWeight="800"
            >
              FUTURE HIDDEN
            </text>
          </g>
        )}

        {/* Entry / TP / SL Horizontal Lines ONLY after decision submitted */}
        {decisionSubmitted && (
          <g>
            <line
              x1={decisionX + colW * 0.52}
              y1={tpY}
              x2={PAD_L + PLOT_W}
              y2={tpY}
              stroke={bullColor}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <rect x={PAD_L + PLOT_W + 2} y={tpY - 7.5} width={56} height={15} rx={3} fill={bullColor} />
            <text
              x={PAD_L + PLOT_W + 30}
              y={tpY + 3}
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="8"
              fontWeight="800"
              className="font-mono-tabular"
            >
              TP {formatPrice(tp, decimals)}
            </text>

            <line
              x1={decisionX + colW * 0.52}
              y1={entryY}
              x2={PAD_L + PLOT_W}
              y2={entryY}
              stroke="#B45309"
              strokeWidth={1.1}
              strokeDasharray="2 2"
            />
            <rect
              x={PAD_L + PLOT_W + 2}
              y={entryY - 7.5}
              width={56}
              height={15}
              rx={3}
              fill={isDark ? '#1E2433' : '#FEF3C7'}
              stroke="#F59E0B"
              strokeWidth={0.8}
            />
            <text
              x={PAD_L + PLOT_W + 30}
              y={entryY + 3}
              textAnchor="middle"
              fill={isDark ? '#F59E0B' : '#92400E'}
              fontSize="7.8"
              fontWeight="800"
              className="font-mono-tabular"
            >
              {chosenDirection ?? 'IN'} {formatPrice(entry, decimals)}
            </text>

            <line
              x1={decisionX + colW * 0.52}
              y1={slY}
              x2={PAD_L + PLOT_W}
              y2={slY}
              stroke={bearColor}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <rect x={PAD_L + PLOT_W + 2} y={slY - 7.5} width={56} height={15} rx={3} fill={bearColor} />
            <text
              x={PAD_L + PLOT_W + 30}
              y={slY + 3}
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="8"
              fontWeight="800"
              className="font-mono-tabular"
            >
              SL {formatPrice(sl, decimals)}
            </text>
          </g>
        )}

        {/* Candlesticks */}
        {visibleCandles.map((c, idx) => {
          const cx = indexToX(idx);
          const isBull = c.close >= c.open;
          const color = isBull ? bullColor : bearColor;
          const yHigh = priceToY(c.high);
          const yLow = priceToY(c.low);
          const yOpen = priceToY(c.open);
          const yClose = priceToY(c.close);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(2.2, Math.abs(yOpen - yClose));
          const bodyW = Math.max(5.5, Math.min(14, colW * 0.62));
          const isLatestReplayed =
            decisionSubmitted && idx >= initialCount && idx === visibleCandles.length - 1;
          const isDecisionCandle = idx === decisionIdx;

          return (
            <g key={`${c.timeLabel}-${idx}`}>
              <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1.35} />
              <rect
                x={cx - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={color}
                stroke={isLatestReplayed ? goldColor : isDecisionCandle ? (isDark ? '#F8FAFC' : '#131722') : color}
                strokeWidth={isLatestReplayed ? 1.4 : isDecisionCandle ? 1.1 : 0.4}
                rx={1.2}
              />
              {(idx === 0 || idx === decisionIdx || idx === visibleCandles.length - 1 || idx % 5 === 0) && (
                <text
                  x={cx}
                  y={VIEW_H - 5}
                  textAnchor="middle"
                  fill={axisTextColor}
                  fontSize="7.8"
                  className="font-mono-tabular"
                >
                  {c.timeLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Decision Candle Tag */}
        {(() => {
          const dc = visibleCandles[decisionIdx];
          if (!dc) return null;
          const yHigh = priceToY(dc.high);
          const badgeY = Math.max(PAD_T + 9, yHigh - 12);
          return (
            <g>
              <rect
                x={decisionX - 24}
                y={badgeY - 7}
                width={48}
                height={14}
                rx={3.5}
                fill={decisionSubmitted ? badgeDark : goldColor}
              />
              <text
                x={decisionX}
                y={badgeY + 2.5}
                textAnchor="middle"
                fill={decisionSubmitted ? '#FFFFFF' : '#0B0E14'}
                fontSize="7.5"
                fontWeight="800"
              >
                {decisionSubmitted ? 'ENTRY' : 'DECIDE ?'}
              </text>
            </g>
          );
        })()}

        {/* Outcome Top-Left Status Badge */}
        {outcomeStatus !== 'idle' && (
          <g>
            <rect
              x={PAD_L + 4}
              y={PAD_T - 16}
              width={outcomeStatus === 'replaying' ? 88 : 66}
              height={16}
              rx={4}
              fill={
                outcomeStatus === 'tp'
                  ? bullColor
                  : outcomeStatus === 'sl'
                    ? bearColor
                    : badgeDark
              }
            />
            <text
              x={PAD_L + (outcomeStatus === 'replaying' ? 48 : 37)}
              y={PAD_T - 5}
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="8"
              fontWeight="800"
            >
              {outcomeStatus === 'replaying'
                ? 'REPLAYING...'
                : outcomeStatus === 'tp'
                  ? '✓ TP HIT'
                  : '✕ SL HIT'}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
