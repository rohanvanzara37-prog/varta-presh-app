import React, { memo, useCallback, useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from 'lightweight-charts';
import type { ThemeMode } from '../types/news';
import {
  computeVisibleVolumeProfile,
  type ChartStructureOverlayData,
  type TerminalCandle,
  type VolumeProfileBucket,
} from '../utils/chartAnalysis';

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

interface ChartCanvasOverlayProps {
  redrawRef?: React.MutableRefObject<(() => void) | null>;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick', Time> | null;
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
    // Cap at 2x DPR for crisp Retina clarity while reducing Android GPU fill-rate by >2.25x vs 3x
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
      const fontSize = options?.fontSize ?? 10;
      const textW = measureCached(text, fontSize);
      const padX = 6;
      const boxW = Math.ceil(textW + padX * 2);
      const boxH = fontSize + 6;

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
      ctx.lineWidth = 1;
      ctx.strokeStyle = border;
      ctx.stroke();

      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x1 + boxW / 2, y1 + boxH / 2 + 0.5);
      return true;
    };

    // Reserve only compact bottom-left zoom bar area (timeframe controls live above the chart canvas)
    placedBoxes.push({ x1: 0, y1: Math.max(0, height - 34), x2: Math.min(width - 40, 145), y2: height });

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

    // 2. Visible Range Volume Profile (VPVR) keyed per symbol & timeframe
    if (showVolumeProfile && candles.length > 0) {
      const range = ts.getVisibleLogicalRange();
      const fromIdx = range ? Math.max(0, Math.floor(range.from)) : 0;
      const toIdx = range ? Math.min(candles.length - 1, Math.ceil(range.to)) : candles.length - 1;
      const firstBar = candles[0];
      const fromBar = candles[fromIdx];
      const toBar = candles[toIdx];
      const lastBar = candles[candles.length - 1];
      const vpKey = `${symbol}:${timeframe}:${firstBar?.time ?? 0}:${fromBar?.time ?? 0}:${toBar?.time ?? 0}:${lastBar?.time ?? 0}:${lastBar?.high ?? 0}:${lastBar?.low ?? 0}:${lastBar?.close ?? 0}:${lastBar?.volume ?? 0}:${candles.length}:${fromIdx}:${toIdx}`;

      let vp = vpCacheRef.current;
      if (!vp || vp.key !== vpKey) {
        const visible = candles.slice(fromIdx, toIdx + 1);
        const computed = computeVisibleVolumeProfile(visible.length > 0 ? visible : candles, 24);
        vp = { key: vpKey, ...computed };
        vpCacheRef.current = vp;
      }

      if (vp.maxVol > 0) {
        const maxBarW = Math.min(88, width * 0.2);
        // Subtle right-edge baseline anchor for histogram
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
              ? isLight
                ? 'rgba(217, 119, 6, 0.55)'
                : 'rgba(245, 158, 11, 0.50)'
              : inValueArea
                ? isLight
                  ? 'rgba(220, 38, 38, 0.36)'
                  : 'rgba(242, 54, 69, 0.34)'
                : isLight
                  ? 'rgba(220, 38, 38, 0.20)'
                  : 'rgba(242, 54, 69, 0.18)';
            ctx.fillRect(plotRight - bullW - bearW, y, bearW, h);
          }
          if (bullW > 0) {
            ctx.fillStyle = b.isPoc
              ? isLight
                ? 'rgba(217, 119, 6, 0.72)'
                : 'rgba(245, 158, 11, 0.68)'
              : inValueArea
                ? isLight
                  ? 'rgba(8, 153, 129, 0.42)'
                  : 'rgba(8, 153, 129, 0.40)'
                : isLight
                  ? 'rgba(8, 153, 129, 0.24)'
                  : 'rgba(8, 153, 129, 0.22)';
            ctx.fillRect(plotRight - bullW, y, bullW, h);
          }
        }
      }

      if (vp.pocPrice !== null) {
        const pocY = toY(vp.pocPrice);
        if (pocY !== null && pocY >= 0 && pocY <= height) {
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = isLight ? 'rgba(180, 83, 9, 0.82)' : 'rgba(245, 158, 11, 0.78)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(0, pocY);
          ctx.lineTo(plotRight, pocY);
          ctx.stroke();
          ctx.restore();

          if (canPlaceRightTag(pocY, 18)) {
            usedRightYs.push(pocY);
            drawPillLabel(
              `POC ${vp.pocPrice.toFixed(precision)}`,
              plotRight - 6,
              pocY - 10,
              isLight ? 'rgba(255,251,235,0.96)' : 'rgba(17,22,33,0.92)',
              isLight ? 'rgba(180, 83, 9, 0.75)' : 'rgba(245, 158, 11, 0.7)',
              isLight ? '#B45309' : '#F59E0B',
              { align: 'right', fontSize: 9.5 }
            );
          }
        }
      }
    }

    if (structure) {
      // 3. Order Blocks & FVG Shaded Zones
      if (showBosChoch) {
        for (let i = 0; i < structure.orderBlocks.length; i += 1) {
          const ob = structure.orderBlocks[i];
          if (ob.mitigated) continue;
          const x1 = toX(ob.startTime) ?? 0;
          const x2 = Math.min(plotRight, (toX(ob.endTime) ?? plotRight) + 28);
          const yTop = toY(ob.high);
          const yBot = toY(ob.low);
          if (yTop === null || yBot === null || x2 <= 0 || x1 > plotRight) continue;
          const drawX1 = Math.max(0, x1);
          const drawY = Math.min(yTop, yBot);
          const drawH = Math.max(3, Math.abs(yBot - yTop));
          const isBull = ob.type === 'Bullish';

          ctx.fillStyle = isBull ? 'rgba(5, 150, 105, 0.10)' : 'rgba(220, 38, 38, 0.10)';
          ctx.strokeStyle = isBull ? 'rgba(5, 150, 105, 0.38)' : 'rgba(220, 38, 38, 0.38)';
          ctx.lineWidth = 1;
          ctx.fillRect(drawX1, drawY, Math.max(8, x2 - drawX1), drawH);
          ctx.strokeRect(drawX1, drawY, Math.max(8, x2 - drawX1), drawH);

          drawPillLabel(
            isBull ? 'OB+' : 'OB-',
            Math.min(plotRight - 42, drawX1 + 22),
            drawY + drawH / 2,
            isLight ? 'rgba(255,255,255,0.94)' : 'rgba(13,17,23,0.88)',
            isBull ? 'rgba(5, 150, 105, 0.65)' : 'rgba(220, 38, 38, 0.65)',
            isBull ? '#059669' : '#DC2626',
            { align: 'left', fontSize: 9 }
          );
        }

        for (let i = 0; i < structure.fvgs.length; i += 1) {
          const fvg = structure.fvgs[i];
          if (fvg.mitigated) continue;
          const x1 = toX(fvg.startTime) ?? 0;
          const x2 = Math.min(plotRight, (toX(fvg.endTime) ?? plotRight) + 20);
          const yTop = toY(fvg.high);
          const yBot = toY(fvg.low);
          if (yTop === null || yBot === null || x2 <= 0 || x1 > plotRight) continue;
          const drawX1 = Math.max(0, x1);
          const drawY = Math.min(yTop, yBot);
          const drawH = Math.max(2, Math.abs(yBot - yTop));
          const isBull = fvg.type === 'Bullish';

          ctx.fillStyle = isBull ? 'rgba(56, 189, 248, 0.08)' : 'rgba(251, 146, 60, 0.08)';
          ctx.fillRect(drawX1, drawY, Math.max(8, x2 - drawX1), drawH);
        }
      }

      // 4. Support & Resistance Horizontal Levels (Collision-Safe Right Tags)
      if (showSupportResistance) {
        for (let i = 0; i < structure.srLevels.length; i += 1) {
          const sr = structure.srLevels[i];
          const y = toY(sr.price);
          if (y === null || y < 4 || y > height - 4) continue;
          const xStart = Math.max(0, toX(sr.startTime) ?? 0);
          const isPrimary = sr.label === 'S1' || sr.label === 'R1';

          ctx.save();
          ctx.strokeStyle = sr.color;
          ctx.lineWidth = isPrimary ? 1.5 : 1;
          if (!isPrimary) ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(xStart, y);
          ctx.lineTo(plotRight, y);
          ctx.stroke();
          ctx.restore();

          const tagX = canPlaceRightTag(y, 20) ? plotRight - 6 : plotRight - 96;
          if (tagX === plotRight - 6) {
            usedRightYs.push(y);
          }
          drawPillLabel(
            `${sr.label} ${sr.price.toFixed(precision)}`,
            tagX,
            y,
            isLight ? 'rgba(255,255,255,0.96)' : 'rgba(13,17,23,0.92)',
            sr.color,
            sr.kind === 'support' ? '#059669' : '#DC2626',
            { align: 'right', fontSize: 9.5 }
          );
        }
      }

      // 5. Chart Patterns (Trendlines, Neckline & Single Non-Overlapping Pattern Badge)
      if (showPatterns && structure.pattern) {
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
          for (let j = 1; j < pts.length; j += 1) {
            ctx.lineTo(pts[j].x, pts[j].y);
          }
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
            { fontSize: 9.5 }
          );
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

          const midX = (clampedX1 + clampedX2) / 2;
          const labelY = seg.direction === 'bull' ? y - 10 : y + 10;
          drawPillLabel(
            seg.kind,
            midX,
            labelY,
            isLight ? 'rgba(255,255,255,0.92)' : 'rgba(13,17,23,0.9)',
            seg.color,
            seg.color,
            { fontSize: 9 }
          );
        }
      }

      // 7. Swing Labels (HH / HL / LH / LL) — Strictly De-Collided
      if (showSwingLabels) {
        for (let i = structure.swings.length - 1; i >= 0; i -= 1) {
          const sw = structure.swings[i];
          const x = toX(sw.time);
          const y = toY(sw.price);
          if (x === null || y === null || x < 14 || x > plotRight - 14) continue;
          if (y < 14 || y > height - 14) continue;

          const labelY = sw.position === 'above' ? y - 14 : y + 14;
          drawPillLabel(
            sw.label,
            x,
            labelY,
            isLight ? 'rgba(255,255,255,0.92)' : 'rgba(13,17,23,0.88)',
            sw.color,
            sw.color,
            { fontSize: 9 }
          );
        }
      }
    }

    // 8. Live Price Pulse Anchor synced identically with Lightweight Charts priceLine
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
  }, []);

  useEffect(() => {
    if (redrawRef) {
      redrawRef.current = drawFrame;
    }
    drawFrame();
    return () => {
      if (redrawRef && redrawRef.current === drawFrame) {
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
