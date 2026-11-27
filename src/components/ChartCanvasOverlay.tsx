import React, { memo, useCallback, useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from 'lightweight-charts';
import type { ThemeMode } from '../types/news';
import {
  computeVisibleVolumeProfile,
  type ChartStructureOverlayData,
  type TerminalCandle,
  type VolumeProfileBucket,
} from '../utils/chartAnalysis';
import type {
  ChartDrawingItem,
  ElliottWyckoffData,
  FibConfluenceData,
  GhostPath,
  KeyLevelMarkers,
  LiquidityPool,
  OrderFlowMetrics,
  SpikeCatalystMarker,
  ZoneMitigationItem,
} from '../utils/institutionalEngine';

interface PlacedBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function boxesOverlap(a: PlacedBox, b: PlacedBox, pad = 4): boolean {
  return !(
    a.x2 + pad < b.x1 ||
    a.x1 - pad > b.x2 ||
    a.y2 + pad < b.y1 ||
    a.y1 - pad > b.y2
  );
}

export interface UserTrendline {
  id: string;
  symbol: string;
  t1: UTCTimestamp;
  p1: number;
  t2: UTCTimestamp;
  p2: number;
  color?: string;
}

interface ChartCanvasOverlayProps {
  redrawRef?: React.MutableRefObject<(() => void) | null>;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick', Time> | ISeriesApi<'Line', Time> | null;
  candles: TerminalCandle[];
  symbol: string;
  timeframe: string;
  structure: ChartStructureOverlayData | null;
  bbUpper: Array<{ time: UTCTimestamp; value: number }>;
  bbLower: Array<{ time: UTCTimestamp; value: number }>;
  showBollinger: boolean;
  showVolumeProfile: boolean;
  showSupportResistance: boolean;
  showPatterns: boolean;
  showSwingLabels: boolean;
  showBosChoch: boolean;
  showKeyLevels?: boolean;
  showLiquidityPools?: boolean;
  showFibWaves?: boolean;
  showGhostCandles?: boolean;
  focusMode?: boolean;
  keyLevels?: KeyLevelMarkers | null;
  liquidityPools?: LiquidityPool[];
  orderFlow?: OrderFlowMetrics | null;
  fibData?: FibConfluenceData | null;
  elliottWyckoff?: ElliottWyckoffData | null;
  zoneMitigations?: ZoneMitigationItem[];
  ghostPath?: GhostPath | null;
  spikeMarkers?: SpikeCatalystMarker[];
  userTrendlines?: UserTrendline[];
  userDrawings?: ChartDrawingItem[];
  pendingTrendPoint?: { t1: UTCTimestamp; p1: number } | null;
  pipSize?: number;
  contractSize?: number;
  defaultLot?: number;
  precision: number;
  themeMode: ThemeMode;
  livePrice: number | null;
  isBullTick: boolean;
}

interface CachedVp {
  key: string;
  buckets: VolumeProfileBucket[];
  pocPrice: number | null;
  vahPrice: number | null;
  valPrice: number | null;
  maxVol: number;
}

const ChartCanvasOverlayInner: React.FC<ChartCanvasOverlayProps> = (props) => {
  const { redrawRef } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef<ChartCanvasOverlayProps>(props);
  propsRef.current = props;

  const vpCacheRef = useRef<CachedVp | null>(null);
  const textWidthCacheRef = useRef<Map<string, number>>(new Map());
  const cachedFontKeyRef = useRef<string>('');

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const {
      chart,
      candleSeries,
      candles,
      symbol,
      timeframe,
      structure,
      bbUpper,
      bbLower,
      showBollinger,
      showVolumeProfile,
      showSupportResistance,
      showPatterns,
      showSwingLabels,
      showBosChoch,
      showKeyLevels = false,
      showLiquidityPools = false,
      showFibWaves = false,
      showGhostCandles = false,
      focusMode = false,
      keyLevels = null,
      liquidityPools = [],
      orderFlow = null,
      fibData = null,
      elliottWyckoff = null,
      zoneMitigations = [],
      ghostPath = null,
      spikeMarkers = [],
      userTrendlines = [],
      userDrawings = [],
      pendingTrendPoint = null,
      pipSize = 0.1,
      contractSize = 100,
      defaultLot = 0.1,
      precision,
      themeMode,
      livePrice,
      isBullTick,
    } = propsRef.current;

    if (!canvas || !chart || !candleSeries) return;

    const pane = chart.paneSize(0);
    if (!pane || pane.width <= 0 || pane.height <= 0) return;

    const width = Math.floor(pane.width);
    const height = Math.floor(pane.height);
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const targetW = Math.floor(width * dpr);
    const targetH = Math.floor(height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const styleW = `${width}px`;
    const styleH = `${height}px`;
    if (canvas.style.width !== styleW) canvas.style.width = styleW;
    if (canvas.style.height !== styleH) canvas.style.height = styleH;

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const ts = chart.timeScale();
    const isLight = themeMode === 'light';
    const plotRight = Math.max(40, width - 2);
    const placedBoxes: PlacedBox[] = [];
    const usedRightYs: number[] = [];

    // Subtle Centered Pair Watermark
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(248, 250, 252, 0.038)';
    ctx.font = `800 ${Math.min(36, Math.max(20, Math.round(width * 0.055)))}px "Inter", system-ui, sans-serif`;
    ctx.fillText(`${symbol} · ${timeframe.toUpperCase()}`, width * 0.5, height * 0.48);
    ctx.restore();

    const toY = (price: number): number | null => {
      const y = candleSeries.priceToCoordinate(price);
      if (y === null || !Number.isFinite(Number(y))) return null;
      return Number(y);
    };

    const toX = (time: UTCTimestamp): number | null => {
      const x = ts.timeToCoordinate(time);
      if (x === null || !Number.isFinite(Number(x))) return null;
      return Number(x);
    };

    const liveY = livePrice !== null ? toY(livePrice) : null;
    if (liveY !== null) {
      usedRightYs.push(liveY);
    }

    const canPlaceRightTag = (y: number, minGap = 20): boolean => {
      if (y < 14 || y > height - 14) return false;
      for (let i = 0; i < usedRightYs.length; i += 1) {
        if (Math.abs(usedRightYs[i] - y) < minGap) return false;
      }
      return true;
    };

    const measureCached = (text: string, fontSize: number): number => {
      const font = `700 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
      if (cachedFontKeyRef.current !== font) {
        ctx.font = font;
        cachedFontKeyRef.current = font;
      }
      const key = `${fontSize}:${text}`;
      const cache = textWidthCacheRef.current;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const w = ctx.measureText(text).width;
      if (cache.size > 400) cache.clear();
      cache.set(key, w);
      return w;
    };

    const drawPillLabel = (
      text: string,
      cx: number,
      cy: number,
      bg: string,
      border: string,
      fg: string,
      options?: { checkCollision?: boolean; align?: 'center' | 'right' | 'left'; fontSize?: number }
    ): boolean => {
      const fontSize = options?.fontSize ?? 9.5;
      const textW = measureCached(text, fontSize);
      const padX = 5;
      const boxW = Math.ceil(textW + padX * 2);
      const boxH = fontSize + 5;

      let x1 = cx - boxW / 2;
      if (options?.align === 'right') x1 = cx - boxW;
      else if (options?.align === 'left') x1 = cx;

      x1 = Math.max(6, Math.min(plotRight - boxW - 4, x1));
      const y1 = Math.max(6, Math.min(height - boxH - 6, cy - boxH / 2));
      const candidate: PlacedBox = { x1, y1, x2: x1 + boxW, y2: y1 + boxH };

      if (options?.checkCollision !== false) {
        for (let i = 0; i < placedBoxes.length; i += 1) {
          if (boxesOverlap(candidate, placedBoxes[i], 4)) return false;
        }
      }
      placedBoxes.push(candidate);

      ctx.beginPath();
      ctx.roundRect(x1, y1, boxW, boxH, 4);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = border;
      ctx.stroke();

      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x1 + boxW / 2, y1 + boxH / 2 + 0.5);
      return true;
    };

    // Reserve compact bottom-left zoom bar area
    placedBoxes.push({ x1: 0, y1: Math.max(0, height - 34), x2: Math.min(width - 40, 145), y2: height });

    if (!focusMode) {
      // 1. Bollinger Bands Translucent Ribbon Fill
      if (showBollinger && bbUpper.length >= 2 && bbLower.length >= 2) {
        const range = ts.getVisibleLogicalRange();
        const total = bbUpper.length;
        const start = range ? Math.max(0, Math.floor(range.from) - 20) : 0;
        const end = range ? Math.min(total - 1, Math.ceil(range.to) + 5) : total - 1;
        const upperPts: Array<{ x: number; y: number }> = [];
        const lowerPts: Array<{ x: number; y: number }> = [];

        for (let i = start; i <= end; i += 1) {
          const u = bbUpper[i];
          const l = bbLower[i];
          if (!u || !l) continue;
          const x = toX(u.time);
          const yu = toY(u.value);
          const yl = toY(l.value);
          if (x !== null && yu !== null && yl !== null) {
            upperPts.push({ x, y: yu });
            lowerPts.push({ x, y: yl });
          }
        }

        if (upperPts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(upperPts[0].x, upperPts[0].y);
          for (let i = 1; i < upperPts.length; i += 1) {
            ctx.lineTo(upperPts[i].x, upperPts[i].y);
          }
          for (let i = lowerPts.length - 1; i >= 0; i -= 1) {
            ctx.lineTo(lowerPts[i].x, lowerPts[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = isLight ? 'rgba(59, 130, 246, 0.08)' : 'rgba(96, 165, 250, 0.08)';
          ctx.fill();
        }
      }

      // 2. Visible Range Volume Profile (VPVR + POC/VAH/VAL)
      if (showVolumeProfile && candles.length > 0) {
        const range = ts.getVisibleLogicalRange();
        const fromIdx = range ? Math.max(0, Math.floor(range.from)) : 0;
        const toIdx = range ? Math.min(candles.length - 1, Math.ceil(range.to)) : candles.length - 1;
        const firstBar = candles[0];
        const fromBar = candles[fromIdx];
        const toBar = candles[toIdx];
        const lastBar = candles[candles.length - 1];
        const vpKey = `${symbol}:${timeframe}:${firstBar?.time ?? 0}:${fromBar?.time ?? 0}:${toBar?.time ?? 0}:${lastBar?.time ?? 0}:${lastBar?.close ?? 0}:${candles.length}:${fromIdx}:${toIdx}`;

        let vp = vpCacheRef.current;
        if (!vp || vp.key !== vpKey) {
          const visible = candles.slice(fromIdx, toIdx + 1);
          const computed = computeVisibleVolumeProfile(visible.length > 0 ? visible : candles, 24);
          vp = { key: vpKey, ...computed };
          vpCacheRef.current = vp;
        }

        if (vp.maxVol > 0) {
          const maxBarW = Math.min(84, width * 0.19);
          ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.12)';
          ctx.fillRect(plotRight - 1, 8, 1, Math.max(20, height - 16));

          for (let i = 0; i < vp.buckets.length; i += 1) {
            const b = vp.buckets[i];
            const yTop = toY(b.high);
            const yBot = toY(b.low);
            if (yTop === null || yBot === null) continue;
            const y = Math.min(yTop, yBot);
            const h = Math.max(2, Math.abs(yBot - yTop) - 1);
            const bullW = (b.bullVol / vp.maxVol) * maxBarW;
            const bearW = (b.bearVol / vp.maxVol) * maxBarW;
            const inValueArea =
              vp.vahPrice !== null &&
              vp.valPrice !== null &&
              b.high >= vp.valPrice &&
              b.low <= vp.vahPrice;

            if (bearW > 0) {
              ctx.fillStyle = b.isPoc
                ? 'rgba(245, 158, 11, 0.55)'
                : inValueArea
                  ? 'rgba(242, 54, 69, 0.34)'
                  : 'rgba(242, 54, 69, 0.16)';
              ctx.fillRect(plotRight - bullW - bearW, y, bearW, h);
            }
            if (bullW > 0) {
              ctx.fillStyle = b.isPoc
                ? 'rgba(245, 158, 11, 0.72)'
                : inValueArea
                  ? 'rgba(8, 153, 129, 0.40)'
                  : 'rgba(8, 153, 129, 0.20)';
              ctx.fillRect(plotRight - bullW, y, bullW, h);
            }
          }
        }

        const vpMarkers = [
          { label: 'POC', price: vp.pocPrice, color: '#F59E0B' },
          { label: 'VAH', price: vp.vahPrice, color: '#0284C7' },
          { label: 'VAL', price: vp.valPrice, color: '#0284C7' },
        ];
        for (const m of vpMarkers) {
          if (m.price === null) continue;
          const py = toY(m.price);
          if (py !== null && py >= 6 && py <= height - 6) {
            ctx.save();
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = m.color;
            ctx.lineWidth = m.label === 'POC' ? 1.1 : 0.8;
            ctx.beginPath();
            ctx.moveTo(0, py);
            ctx.lineTo(plotRight, py);
            ctx.stroke();
            ctx.restore();

            if (m.label === 'POC' && canPlaceRightTag(py, 18)) {
              usedRightYs.push(py);
              drawPillLabel(
                `POC ${m.price.toFixed(precision)}`,
                plotRight - 6,
                py - 9,
                isLight ? 'rgba(255,251,235,0.96)' : 'rgba(17,22,33,0.92)',
                m.color,
                m.color,
                { align: 'right', fontSize: 9 }
              );
            }
          }
        }
      }

      // 2B. Key Session & Institutional Levels (PDH/PDL, Weekly Open, Asian H/L, Session VWAP, ORB)
      if (showKeyLevels && keyLevels) {
        const lvlList = [
          { tag: 'PDH', price: keyLevels.pdh, color: '#F23645' },
          { tag: 'PDL', price: keyLevels.pdl, color: '#089981' },
          { tag: 'W.Open', price: keyLevels.weeklyOpen, color: '#8B5CF6' },
          { tag: 'Asia H', price: keyLevels.asianHigh, color: '#F59E0B' },
          { tag: 'Asia L', price: keyLevels.asianLow, color: '#F59E0B' },
          { tag: 'VWAP', price: keyLevels.sessionVwap, color: '#0284C7' },
        ];
        for (const item of lvlList) {
          if (item.price === null) continue;
          const y = toY(item.price);
          if (y === null || y < 8 || y > height - 8) continue;
          ctx.save();
          ctx.strokeStyle = item.color;
          ctx.lineWidth = 0.9;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(plotRight, y);
          ctx.stroke();
          ctx.restore();

          drawPillLabel(
            `${item.tag} ${item.price.toFixed(precision)}`,
            12,
            y,
            isLight ? 'rgba(255,255,255,0.92)' : 'rgba(13,17,23,0.88)',
            item.color,
            item.color,
            { align: 'left', fontSize: 8.5 }
          );
        }

        // London/NY ORB Box
        if (keyLevels.orbHigh !== null && keyLevels.orbLow !== null && candles.length >= 16) {
          const yH = toY(keyLevels.orbHigh);
          const yL = toY(keyLevels.orbLow);
          const xStart = toX(candles[Math.max(0, candles.length - 16)].time) ?? 0;
          if (yH !== null && yL !== null) {
            ctx.fillStyle = 'rgba(2, 132, 199, 0.07)';
            ctx.fillRect(Math.max(0, xStart), Math.min(yH, yL), Math.max(20, plotRight - Math.max(0, xStart)), Math.abs(yL - yH));
          }
        }
      }

      // 2C. Liquidity Heatmap Pools (BSL / SSL Glow Bands)
      if (showLiquidityPools && liquidityPools.length > 0) {
        for (const pool of liquidityPools) {
          const y = toY(pool.price);
          const x1 = Math.max(0, toX(pool.tStart) ?? 0);
          if (y === null || y < 6 || y > height - 6) continue;
          const bandColor = pool.kind === 'BSL' ? 'rgba(242, 54, 69, 0.20)' : 'rgba(8, 153, 129, 0.20)';
          const strokeColor = pool.kind === 'BSL' ? '#F23645' : '#089981';
          ctx.fillStyle = bandColor;
          ctx.fillRect(x1, y - 5, Math.max(24, plotRight - x1), 10);
          ctx.save();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = pool.swept ? 1.5 : 1;
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(plotRight, y);
          ctx.stroke();
          ctx.restore();

          drawPillLabel(
            pool.label,
            plotRight - 8,
            y,
            isLight ? 'rgba(255,255,255,0.95)' : 'rgba(13,17,23,0.92)',
            strokeColor,
            strokeColor,
            { align: 'right', fontSize: 8.5 }
          );
        }
      }

      // 2D. Order Flow Volume Spike Triangles
      if (showLiquidityPools && orderFlow && orderFlow.volumeSpikeIndices.length > 0) {
        for (const idx of orderFlow.volumeSpikeIndices) {
          const bar = candles[idx];
          if (!bar) continue;
          const x = toX(bar.time);
          const y = toY(bar.close >= bar.open ? bar.low : bar.high);
          if (x === null || y === null || x < 4 || x > plotRight - 4) continue;
          const bull = bar.close >= bar.open;
          ctx.save();
          ctx.fillStyle = bull ? '#089981' : '#F23645';
          ctx.beginPath();
          if (bull) {
            ctx.moveTo(x, y + 6);
            ctx.lineTo(x - 4, y + 13);
            ctx.lineTo(x + 4, y + 13);
          } else {
            ctx.moveTo(x, y - 6);
            ctx.lineTo(x - 4, y - 13);
            ctx.lineTo(x + 4, y - 13);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // 2E. Fibonacci Levels (38.2%, 50%, 61.8% Golden Zone, 78.6%) — crisp 2px lines + high-contrast badges
      if (showFibWaves && fibData) {
        for (const lvl of fibData.levels) {
          const y = toY(lvl.price);
          if (y === null || y < 8 || y > height - 8) continue;
          const isGolden = Math.abs(lvl.ratio - 0.618) < 0.005;
          const isHalf = Math.abs(lvl.ratio - 0.5) < 0.005;
          const color = isGolden ? '#F59E0B' : '#C084FC';
          const badgeText = isGolden
            ? `61.8% Golden • ${lvl.price.toFixed(precision)}`
            : isHalf
              ? `50.0% • ${lvl.price.toFixed(precision)}`
              : `${(lvl.ratio * 100).toFixed(1)}% • ${lvl.price.toFixed(precision)}`;
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.setLineDash(isGolden ? [] : [8, 4]);
          ctx.beginPath();
          ctx.moveTo(10, Math.round(y) + 0.5);
          ctx.lineTo(plotRight, Math.round(y) + 0.5);
          ctx.stroke();
          ctx.restore();

          drawPillLabel(
            badgeText,
            10,
            y,
            isLight ? 'rgba(255,255,255,0.96)' : '#0F1626',
            color,
            isLight ? '#131722' : '#FFFFFF',
            { align: 'left', fontSize: 9, checkCollision: false }
          );
        }

        // Vertical Fibonacci Time Zones
        for (const tz of fibData.timeZones) {
          const x = toX(tz);
          if (x === null || x < 4 || x > plotRight - 4) continue;
          ctx.save();
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (showFibWaves && elliottWyckoff) {
        if (elliottWyckoff.harmonicPattern && elliottWyckoff.harmonicPattern.points.length >= 5) {
          const pts = elliottWyckoff.harmonicPattern.points
            .map((p) => ({ x: toX(p.time), y: toY(p.price), label: p.label }))
            .filter((p): p is { x: number; y: number; label: string } => p.x !== null && p.y !== null);
          if (pts.length >= 4) {
            ctx.save();
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
            ctx.lineWidth = 1.25;
            ctx.setLineDash([4, 2]);
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
            ctx.restore();
          }
        }

        for (const w of elliottWyckoff.waves) {
          const x = toX(w.time);
          const y = toY(w.price);
          if (x === null || y === null || x < 10 || x > plotRight - 10) continue;
          drawPillLabel(
            w.label,
            x,
            y - 16,
            isLight ? 'rgba(255,255,255,0.95)' : 'rgba(13,17,23,0.92)',
            '#8B5CF6',
            '#8B5CF6',
            { fontSize: 8.5 }
          );
        }
      }

      // 3. SMC Zones (OB + FVG with Live Mitigation Tracker %)
      if (structure) {
        if (showBosChoch) {
          const obMitMap = new Map<number, ZoneMitigationItem>();
          for (const zm of zoneMitigations) {
            obMitMap.set(zm.tStart, zm);
          }

          for (let i = 0; i < structure.orderBlocks.length; i += 1) {
            const ob = structure.orderBlocks[i];
            const mit = obMitMap.get(ob.startTime);
            const isMitigated = ob.mitigated || Boolean(mit?.mitigated);
            const x1 = toX(ob.startTime) ?? 0;
            const x2 = Math.min(plotRight, (toX(ob.endTime) ?? plotRight) + 28);
            const yTop = toY(ob.high);
            const yBot = toY(ob.low);
            if (yTop === null || yBot === null || x2 <= 0 || x1 > plotRight) continue;
            const drawX1 = Math.max(0, x1);
            const drawY = Math.min(yTop, yBot);
            const drawH = Math.max(3, Math.abs(yBot - yTop));
            const isBull = ob.type === 'Bullish';

            ctx.fillStyle = isMitigated
              ? 'rgba(148, 163, 184, 0.06)'
              : isBull
                ? 'rgba(5, 150, 105, 0.11)'
                : 'rgba(220, 38, 38, 0.11)';
            ctx.strokeStyle = isMitigated
              ? 'rgba(148, 163, 184, 0.25)'
              : isBull
                ? 'rgba(5, 150, 105, 0.40)'
                : 'rgba(220, 38, 38, 0.40)';
            ctx.lineWidth = 1;
            ctx.fillRect(drawX1, drawY, Math.max(8, x2 - drawX1), drawH);
            ctx.strokeRect(drawX1, drawY, Math.max(8, x2 - drawX1), drawH);

            if (!isMitigated) {
              const fillTag = mit && mit.fillPct > 0 ? `OB ${mit.fillPct}%` : 'OB';
              drawPillLabel(
                fillTag,
                Math.min(plotRight - 36, drawX1 + 14),
                drawY + drawH / 2,
                isLight ? 'rgba(255,255,255,0.94)' : 'rgba(13,17,23,0.88)',
                isBull ? 'rgba(5, 150, 105, 0.65)' : 'rgba(220, 38, 38, 0.65)',
                isBull ? '#089981' : '#F23645',
                { align: 'left', fontSize: 8.5 }
              );
            }
          }

          for (let i = 0; i < structure.fvgs.length; i += 1) {
            const fvg = structure.fvgs[i];
            const mit = obMitMap.get(fvg.startTime);
            const isMitigated = fvg.mitigated || Boolean(mit?.mitigated);
            const x1 = toX(fvg.startTime) ?? 0;
            const x2 = Math.min(plotRight, (toX(fvg.endTime) ?? plotRight) + 20);
            const yTop = toY(fvg.high);
            const yBot = toY(fvg.low);
            if (yTop === null || yBot === null || x2 <= 0 || x1 > plotRight) continue;
            const drawX1 = Math.max(0, x1);
            const drawY = Math.min(yTop, yBot);
            const drawH = Math.max(2, Math.abs(yBot - yTop));
            const drawW = Math.max(8, x2 - drawX1);
            const isBull = fvg.type === 'Bullish';

            ctx.fillStyle = isMitigated
              ? 'rgba(148, 163, 184, 0.05)'
              : isBull
                ? 'rgba(8, 153, 129, 0.09)'
                : 'rgba(242, 54, 69, 0.09)';
            ctx.fillRect(drawX1, drawY, drawW, drawH);

            if (!isMitigated && drawH >= 9 && drawW >= 22) {
              const fillTag = mit && mit.fillPct > 0 ? `FVG ${mit.fillPct}%` : 'FVG';
              drawPillLabel(
                fillTag,
                Math.min(plotRight - 36, drawX1 + 14),
                drawY + drawH / 2,
                isLight ? 'rgba(255,255,255,0.92)' : 'rgba(13,17,23,0.88)',
                isBull ? 'rgba(8, 153, 129, 0.55)' : 'rgba(242, 54, 69, 0.55)',
                isBull ? '#089981' : '#F23645',
                { align: 'left', fontSize: 8 }
              );
            }
          }
        }

        // 4. Support (#00E5FF) & Resistance (#FF4D6D) Horizontal 2px Solid Levels + Crisp Dark Pill White Text
        if (showSupportResistance) {
          for (let i = 0; i < structure.srLevels.length; i += 1) {
            const sr = structure.srLevels[i];
            const y = toY(sr.price);
            if (y === null || y < 4 || y > height - 4) continue;
            const xStart = Math.max(0, toX(sr.startTime) ?? 0);
            const lineColor = sr.kind === 'support' ? '#00E5FF' : '#FF4D6D';

            ctx.save();
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(xStart, y);
            ctx.lineTo(plotRight, y);
            ctx.stroke();
            ctx.restore();

            const tagX = canPlaceRightTag(y, 20) ? plotRight - 6 : plotRight - 104;
            if (tagX === plotRight - 6) usedRightYs.push(y);
            drawPillLabel(
              `${sr.label} • ${sr.price.toFixed(precision)}`,
              tagX,
              y,
              isLight ? 'rgba(255,255,255,0.96)' : '#0F1626',
              lineColor,
              isLight ? lineColor : '#FFFFFF',
              { align: 'right', fontSize: 9 }
            );
          }

          if (Array.isArray(structure.diagonalTrendlines)) {
            for (let i = 0; i < structure.diagonalTrendlines.length; i += 1) {
              const dt = structure.diagonalTrendlines[i];
              const pts: Array<{ x: number; y: number }> = [];
              for (let j = 0; j < dt.points.length; j += 1) {
                const p = dt.points[j];
                const x = toX(p.time);
                const y = toY(p.price);
                if (x !== null && y !== null) pts.push({ x, y });
              }
              if (pts.length < 2) continue;
              ctx.save();
              ctx.strokeStyle = dt.color;
              ctx.lineWidth = 2.2;
              ctx.shadowColor = dt.color;
              ctx.shadowBlur = 4;
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let j = 1; j < pts.length; j += 1) ctx.lineTo(pts[j].x, pts[j].y);
              ctx.stroke();
              ctx.restore();
            }
          }
        }

        // 5. Chart Patterns, Candlestick Patterns & Liquidity Sweeps
        if (showPatterns) {
          if (structure.pattern) {
            for (let i = 0; i < structure.pattern.lines.length; i += 1) {
              const ln = structure.pattern.lines[i];
              const pts: Array<{ x: number; y: number }> = [];
              for (let j = 0; j < ln.points.length; j += 1) {
                const p = ln.points[j];
                const x = toX(p.time);
                const y = toY(p.price);
                if (x !== null && y !== null) pts.push({ x, y });
              }
              if (pts.length < 2) continue;
              ctx.save();
              ctx.strokeStyle = ln.color;
              ctx.lineWidth = ln.width ?? 1.6;
              if (ln.dashed) ctx.setLineDash([5, 4]);
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let j = 1; j < pts.length; j += 1) ctx.lineTo(pts[j].x, pts[j].y);
              ctx.stroke();
              ctx.restore();
            }

            const bp = structure.pattern.badgePoint;
            const bx = toX(bp.time);
            const by = toY(bp.price);
            if (bx !== null && by !== null && bx >= 20 && bx <= plotRight - 20) {
              const offsetY = bp.position === 'above' ? by - 26 : by + 26;
              const badgeColor =
                structure.pattern.info.bias === 'Bullish'
                  ? '#089981'
                  : structure.pattern.info.bias === 'Bearish'
                    ? '#F23645'
                    : '#F59E0B';
              drawPillLabel(
                structure.pattern.info.name,
                bx,
                offsetY,
                isLight ? 'rgba(255,255,255,0.95)' : 'rgba(13,17,23,0.94)',
                badgeColor,
                badgeColor,
                { fontSize: 9 }
              );
            }
          }

          if (structure.candlestickPattern) {
            const cp = structure.candlestickPattern;
            const cx = toX(cp.time);
            const cy = toY(cp.price);
            if (cx !== null && cy !== null && cx >= 10 && cx <= plotRight - 10) {
              const isBull = cp.bias === 'Bullish';
              drawPillLabel(
                cp.name,
                cx,
                isBull ? cy + 18 : cy - 18,
                isLight ? 'rgba(255,255,255,0.95)' : 'rgba(13,17,23,0.94)',
                isBull ? '#089981' : '#F23645',
                isBull ? '#089981' : '#F23645',
                { fontSize: 8.5 }
              );
            }
          }

          if (Array.isArray(structure.liquiditySweeps)) {
            for (let i = 0; i < structure.liquiditySweeps.length; i += 1) {
              const lq = structure.liquiditySweeps[i];
              const lx = toX(lq.time);
              const ly = toY(lq.wickPrice);
              if (lx === null || ly === null || lx < 0 || lx > plotRight) continue;
              const isBear = lq.direction === 'bear';
              ctx.save();
              ctx.strokeStyle = lq.color;
              ctx.lineWidth = 1.2;
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.moveTo(lx, ly + (isBear ? -18 : 18));
              ctx.lineTo(lx, ly);
              ctx.stroke();
              ctx.restore();

              drawPillLabel(
                lq.label,
                lx,
                isBear ? ly - 22 : ly + 22,
                isLight ? 'rgba(255,255,255,0.95)' : 'rgba(13,17,23,0.92)',
                lq.color,
                lq.color,
                { fontSize: 8.5 }
              );
            }
          }
        }

        // 6. BOS / CHoCH Break Segments & Labels
        if (showBosChoch) {
          for (let i = 0; i < structure.breaks.length; i += 1) {
            const seg = structure.breaks[i];
            const x1 = toX(seg.t1);
            const x2 = toX(seg.t2);
            const y = toY(seg.price);
            if (x1 === null || x2 === null || y === null) continue;
            if (x2 < 0 || x1 > plotRight || y < 6 || y > height - 6) continue;
            const clampedX1 = Math.max(0, x1);
            const clampedX2 = Math.min(plotRight, x2);
            if (clampedX2 - clampedX1 < 10) continue;

            ctx.save();
            ctx.strokeStyle = seg.color;
            ctx.lineWidth = seg.kind === 'CHoCH' ? 1.75 : 1.2;
            if (seg.kind !== 'CHoCH') ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(clampedX1, y);
            ctx.lineTo(clampedX2, y);
            ctx.stroke();
            ctx.restore();

            drawPillLabel(
              seg.kind,
              (clampedX1 + clampedX2) / 2,
              seg.direction === 'bull' ? y - 10 : y + 10,
              isLight ? 'rgba(255,255,255,0.92)' : 'rgba(13,17,23,0.9)',
              seg.color,
              seg.color,
              { fontSize: 8.5 }
            );
          }
        }

        // 7. Swing Labels (HH / HL / LH / LL)
        if (showSwingLabels) {
          for (let i = structure.swings.length - 1; i >= 0; i -= 1) {
            const sw = structure.swings[i];
            const x = toX(sw.time);
            const y = toY(sw.price);
            if (x === null || y === null || x < 14 || x > plotRight - 14) continue;
            if (y < 14 || y > height - 14) continue;
            drawPillLabel(
              sw.label,
              x,
              sw.position === 'above' ? y - 14 : y + 14,
              isLight ? 'rgba(255,255,255,0.92)' : 'rgba(13,17,23,0.88)',
              sw.color,
              sw.color,
              { fontSize: 8.5 }
            );
          }
        }
      }

      // 7B. Spike Catalyst ⚡ Markers
      if (spikeMarkers.length > 0) {
        for (const spk of spikeMarkers) {
          const sx = toX(spk.time);
          const sy = toY(spk.price);
          if (sx === null || sy === null || sx < 10 || sx > plotRight - 10) continue;
          drawPillLabel(
            `⚡${spk.multiple}x`,
            sx,
            Math.max(18, sy - 14),
            'rgba(245, 158, 11, 0.16)',
            '#F59E0B',
            '#F59E0B',
            { fontSize: 8.5 }
          );
        }
      }

      // 7C. Ghost Candles What-If Projected Path (2.5px Glowing Cyan/Gold Vector + Directional Arrowhead)
      if (showGhostCandles && ghostPath && ghostPath.primary.length >= 2) {
        const pPts = ghostPath.primary
          .map((p) => ({ x: toX(p.time), y: toY(p.price) }))
          .filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null);
        if (pPts.length >= 2) {
          const firstPt = pPts[0];
          const lastPt = pPts[pPts.length - 1];
          const prevPt = pPts[pPts.length - 2];
          ctx.save();
          const vecGrad = ctx.createLinearGradient(firstPt.x, firstPt.y, lastPt.x, lastPt.y);
          vecGrad.addColorStop(0, '#00E5FF');
          vecGrad.addColorStop(1, '#F59E0B');
          ctx.strokeStyle = vecGrad;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = 'rgba(0, 229, 255, 0.75)';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(firstPt.x, firstPt.y);
          for (let i = 1; i < pPts.length; i += 1) ctx.lineTo(pPts[i].x, pPts[i].y);
          ctx.stroke();

          // Crisp Directional Arrowhead at tip
          const angle = Math.atan2(lastPt.y - prevPt.y, lastPt.x - prevPt.x);
          const headLen = 9;
          ctx.fillStyle = '#F59E0B';
          ctx.shadowColor = 'rgba(245, 158, 11, 0.85)';
          ctx.beginPath();
          ctx.moveTo(lastPt.x, lastPt.y);
          ctx.lineTo(
            lastPt.x - headLen * Math.cos(angle - Math.PI / 6),
            lastPt.y - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            lastPt.x - headLen * Math.cos(angle + Math.PI / 6),
            lastPt.y - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        const iPts = ghostPath.invalidation
          .map((p) => ({ x: toX(p.time), y: toY(p.price) }))
          .filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null);
        if (iPts.length >= 2) {
          ctx.save();
          ctx.strokeStyle = '#FF2A5F';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(iPts[0].x, iPts[0].y);
          for (let i = 1; i < iPts.length; i += 1) ctx.lineTo(iPts[i].x, iPts[i].y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 8. Live Price Pulse Anchor synced with Lightweight Charts priceLine
    if (liveY !== null && liveY >= 0 && liveY <= height && candles.length > 0) {
      const lastBar = candles[candles.length - 1];
      const lastX = toX(lastBar.time);
      const pulseColor = isBullTick ? '#059669' : '#DC2626';

      const grad = ctx.createLinearGradient(0, liveY, plotRight, liveY);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.65, isBullTick ? 'rgba(5, 150, 105, 0.10)' : 'rgba(220, 38, 38, 0.10)');
      grad.addColorStop(1, isBullTick ? 'rgba(5, 150, 105, 0.35)' : 'rgba(220, 38, 38, 0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, liveY - 1.5, plotRight, 3);

      const dotX = lastX !== null && lastX > 12 && lastX < plotRight - 4 ? lastX : plotRight - 6;
      ctx.beginPath();
      ctx.arc(dotX, liveY, 6, 0, Math.PI * 2);
      ctx.fillStyle = isBullTick ? 'rgba(5, 150, 105, 0.25)' : 'rgba(220, 38, 38, 0.25)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(dotX, liveY, 2.75, 0, Math.PI * 2);
      ctx.fillStyle = pulseColor;
      ctx.fill();
    }

    // 9. User Drawings (Trendlines, H-Lines, Long/Short RR boxes, Ruler, Anchored VWAP)
    if (!focusMode) {
      for (const line of userTrendlines) {
        if (line.symbol !== symbol) continue;
        const x1 = toX(line.t1);
        const y1 = toY(line.p1);
        const x2 = toX(line.t2);
        const y2 = toY(line.p2);
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
        const stroke = line.color ?? '#F59E0B';
        ctx.save();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.fillStyle = stroke;
        ctx.beginPath();
        ctx.arc(x1, y1, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x2, y2, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const dr of userDrawings) {
        if (dr.symbol !== symbol) continue;
        if (dr.type === 'hline') {
          const y = toY(dr.p1);
          if (y === null || y < 4 || y > height - 4) continue;
          ctx.save();
          ctx.strokeStyle = dr.color;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(plotRight, y);
          ctx.stroke();
          ctx.restore();
          drawPillLabel(
            `LVL ${dr.p1.toFixed(precision)}`,
            plotRight - 8,
            y - 9,
            isLight ? 'rgba(255,255,255,0.95)' : 'rgba(13,17,23,0.92)',
            dr.color,
            dr.color,
            { align: 'right', fontSize: 8.5 }
          );
          continue;
        }

        if (dr.type === 'anchored_vwap') {
          const startIdx = candles.findIndex((c) => c.time >= dr.t1);
          if (startIdx >= 0) {
            let pv = 0;
            let vv = 0;
            const pts: Array<{ x: number; y: number }> = [];
            for (let i = startIdx; i < candles.length; i += 1) {
              const bar = candles[i];
              const typ = (bar.high + bar.low + bar.close) / 3;
              const vol = bar.volume ?? 100;
              pv += typ * vol;
              vv += vol;
              const av = vv > 0 ? pv / vv : typ;
              const x = toX(bar.time);
              const y = toY(av);
              if (x !== null && y !== null) pts.push({ x, y });
            }
            if (pts.length >= 2) {
              ctx.save();
              ctx.strokeStyle = '#06B6D4';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
              ctx.stroke();
              ctx.restore();
              const lastPt = pts[pts.length - 1];
              drawPillLabel('AVWAP', lastPt.x, lastPt.y - 10, '#0B0E14', '#06B6D4', '#06B6D4', { fontSize: 8 });
            }
          }
          continue;
        }

        const x1 = toX(dr.t1);
        const y1 = toY(dr.p1);
        const x2 = dr.t2 ? toX(dr.t2) : null;
        const y2 = dr.p2 !== undefined ? toY(dr.p2) : null;
        if (x1 === null || y1 === null || x2 === null || y2 === null) continue;

        if (dr.type === 'trendline') {
          ctx.save();
          ctx.strokeStyle = dr.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.fillStyle = dr.color;
          ctx.beginPath();
          ctx.arc(x1, y1, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x2, y2, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (dr.type === 'ruler') {
          const left = Math.min(x1, x2);
          const top = Math.min(y1, y2);
          const rw = Math.max(8, Math.abs(x2 - x1));
          const rh = Math.max(8, Math.abs(y2 - y1));
          ctx.fillStyle = 'rgba(2, 132, 199, 0.14)';
          ctx.strokeStyle = '#0284C7';
          ctx.lineWidth = 1.2;
          ctx.fillRect(left, top, rw, rh);
          ctx.strokeRect(left, top, rw, rh);
          const diff = (dr.p2 ?? dr.p1) - dr.p1;
          const pips = pipSize > 0 ? Math.abs(diff) / pipSize : Math.abs(diff);
          const usd = Math.abs(diff) * defaultLot * contractSize;
          drawPillLabel(
            `${diff >= 0 ? '+' : '-'}${pips.toFixed(1)}p ($${usd.toFixed(0)})`,
            (x1 + x2) / 2,
            (y1 + y2) / 2,
            '#0B0E14',
            '#0284C7',
            '#38BDF8',
            { checkCollision: false, fontSize: 8.5 }
          );
        } else if (dr.type === 'long_rr' || dr.type === 'short_rr') {
          const isLong = dr.type === 'long_rr';
          const entryP = dr.p1;
          const slP = dr.p2 ?? (isLong ? entryP * 0.996 : entryP * 1.004);
          const tpP = dr.p3 ?? (isLong ? entryP + Math.abs(entryP - slP) * 2 : entryP - Math.abs(slP - entryP) * 2);
          const yEntry = y1;
          const ySl = toY(slP);
          const yTp = toY(tpP);
          if (ySl === null || yTp === null) continue;
          const boxLeft = Math.min(x1, x2);
          const boxW = Math.max(46, Math.abs(x2 - x1));
          // Profit Box
          ctx.fillStyle = 'rgba(8, 153, 129, 0.18)';
          ctx.strokeStyle = 'rgba(8, 153, 129, 0.65)';
          ctx.lineWidth = 1;
          ctx.fillRect(boxLeft, Math.min(yEntry, yTp), boxW, Math.abs(yTp - yEntry));
          ctx.strokeRect(boxLeft, Math.min(yEntry, yTp), boxW, Math.abs(yTp - yEntry));
          // Risk Box
          ctx.fillStyle = 'rgba(242, 54, 69, 0.18)';
          ctx.strokeStyle = 'rgba(242, 54, 69, 0.65)';
          ctx.fillRect(boxLeft, Math.min(yEntry, ySl), boxW, Math.abs(ySl - yEntry));
          ctx.strokeRect(boxLeft, Math.min(yEntry, ySl), boxW, Math.abs(ySl - yEntry));
          const rr = Math.abs(tpP - entryP) / Math.max(1e-6, Math.abs(entryP - slP));
          drawPillLabel(
            `${isLong ? 'LONG' : 'SHORT'} 1:${rr.toFixed(1)}R`,
            boxLeft + boxW / 2,
            yEntry,
            '#0B0E14',
            isLong ? '#089981' : '#F23645',
            '#FFFFFF',
            { checkCollision: false, fontSize: 8.5 }
          );
        }
      }

      if (pendingTrendPoint) {
        const px = toX(pendingTrendPoint.t1);
        const py = toY(pendingTrendPoint.p1);
        if (px !== null && py !== null) {
          ctx.save();
          ctx.fillStyle = '#F59E0B';
          ctx.strokeStyle = isLight ? '#FFFFFF' : '#0B0E14';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }, []);

  useEffect(() => {
    let rafHandle: number | null = null;
    const scheduleDraw = () => {
      if (rafHandle !== null) return;
      rafHandle = window.requestAnimationFrame(() => {
        rafHandle = null;
        drawFrame();
      });
    };
    if (redrawRef) {
      redrawRef.current = scheduleDraw;
    }
    scheduleDraw();
    return () => {
      if (rafHandle !== null) window.cancelAnimationFrame(rafHandle);
      if (redrawRef && redrawRef.current === scheduleDraw) {
        redrawRef.current = null;
      }
    };
  }, [
    redrawRef,
    drawFrame,
    props.chart,
    props.candleSeries,
    props.candles,
    props.symbol,
    props.timeframe,
    props.structure,
    props.bbUpper,
    props.bbLower,
    props.showBollinger,
    props.showVolumeProfile,
    props.showSupportResistance,
    props.showPatterns,
    props.showSwingLabels,
    props.showBosChoch,
    props.showKeyLevels,
    props.showLiquidityPools,
    props.showFibWaves,
    props.showGhostCandles,
    props.focusMode,
    props.keyLevels,
    props.liquidityPools,
    props.orderFlow,
    props.fibData,
    props.elliottWyckoff,
    props.zoneMitigations,
    props.ghostPath,
    props.spikeMarkers,
    props.userTrendlines,
    props.userDrawings,
    props.pendingTrendPoint,
    props.precision,
    props.themeMode,
    props.livePrice,
    props.isBullTick,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10"
      style={{ willChange: 'contents', transform: 'translateZ(0)' }}
    />
  );
};

export const ChartCanvasOverlay = memo(ChartCanvasOverlayInner);
