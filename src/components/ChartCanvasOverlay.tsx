import React, { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from 'lightweight-charts';
import type { ThemeMode } from '../types/news';
import {
  computeVisibleVolumeProfile,
  type ChartStructureOverlayData,
  type TerminalCandle,
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
  renderTick: number;
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick', Time> | null;
  candles: TerminalCandle[];
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

export const ChartCanvasOverlay: React.FC<ChartCanvasOverlayProps> = ({
  renderTick,
  chart,
  candleSeries,
  candles,
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    void renderTick;
    const canvas = canvasRef.current;
    if (!canvas || !chart || !candleSeries) return;

    const pane = chart.paneSize(0);
    if (!pane || pane.width <= 0 || pane.height <= 0) return;

    const width = Math.floor(pane.width);
    const height = Math.floor(pane.height);
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
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
      for (const used of usedRightYs) {
        if (Math.abs(used - y) < minGap) return false;
      }
      return true;
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
      ctx.font = `700 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
      const textW = ctx.measureText(text).width;
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
        for (const existing of placedBoxes) {
          if (boxesOverlap(candidate, existing, 4)) return false;
        }
      }
      placedBoxes.push(candidate);

      ctx.save();
      ctx.beginPath();
      const r = 4;
      ctx.roundRect(x1, y1, boxW, boxH, r);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = border;
      ctx.stroke();

      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x1 + boxW / 2, y1 + boxH / 2 + 0.5);
      ctx.restore();
      return true;
    };

    // Reserve top-left OHLCV legend + tools space so automated labels never collide with HUD
    placedBoxes.push({ x1: 0, y1: 0, x2: Math.min(width * 0.65, 360), y2: 52 });

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
        ctx.save();
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
        ctx.restore();
      }
    }

    // 2. Visible Range Volume Profile (VPVR)
    if (showVolumeProfile && candles.length > 0) {
      const range = ts.getVisibleLogicalRange();
      const fromIdx = range ? Math.max(0, Math.floor(range.from)) : 0;
      const toIdx = range ? Math.min(candles.length - 1, Math.ceil(range.to)) : candles.length - 1;
      const visible = candles.slice(fromIdx, toIdx + 1);
      const vp = computeVisibleVolumeProfile(visible.length > 0 ? visible : candles, 24);

      if (vp.maxVol > 0) {
        const maxBarW = Math.min(86, width * 0.19);
        for (const b of vp.buckets) {
          const yTop = toY(b.high);
          const yBot = toY(b.low);
          if (yTop === null || yBot === null) continue;
          const y = Math.min(yTop, yBot);
          const h = Math.max(2, Math.abs(yBot - yTop) - 1);
          const bullW = (b.bullVol / vp.maxVol) * maxBarW;
          const bearW = (b.bearVol / vp.maxVol) * maxBarW;

          if (bearW > 0) {
            ctx.fillStyle = b.isPoc ? 'rgba(245, 158, 11, 0.45)' : 'rgba(242, 54, 69, 0.28)';
            ctx.fillRect(plotRight - bullW - bearW, y, bearW, h);
          }
          if (bullW > 0) {
            ctx.fillStyle = b.isPoc ? 'rgba(245, 158, 11, 0.65)' : 'rgba(8, 153, 129, 0.34)';
            ctx.fillRect(plotRight - bullW, y, bullW, h);
          }
        }
      }

      if (vp.pocPrice !== null) {
        const pocY = toY(vp.pocPrice);
        if (pocY !== null && pocY >= 0 && pocY <= height) {
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.78)';
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
              isLight ? 'rgba(255,251,235,0.94)' : 'rgba(17,22,33,0.92)',
              'rgba(245, 158, 11, 0.7)',
              isLight ? '#B45309' : '#F59E0B',
              { align: 'right', fontSize: 9.5 }
            );
          }
        }
      }
    }

    if (structure) {
      // 3. Order Blocks & FVG Shaded Zones (when BOS/CHoCH structure is enabled)
      if (showBosChoch) {
        for (const ob of structure.orderBlocks) {
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

          ctx.save();
          ctx.fillStyle = isBull ? 'rgba(8, 153, 129, 0.10)' : 'rgba(242, 54, 69, 0.10)';
          ctx.strokeStyle = isBull ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)';
          ctx.lineWidth = 1;
          ctx.fillRect(drawX1, drawY, Math.max(8, x2 - drawX1), drawH);
          ctx.strokeRect(drawX1, drawY, Math.max(8, x2 - drawX1), drawH);
          ctx.restore();

          drawPillLabel(
            isBull ? 'OB+' : 'OB-',
            Math.min(plotRight - 42, drawX1 + 22),
            drawY + drawH / 2,
            isLight ? 'rgba(255,255,255,0.9)' : 'rgba(13,17,23,0.88)',
            isBull ? 'rgba(8, 153, 129, 0.55)' : 'rgba(242, 54, 69, 0.55)',
            isBull ? '#089981' : '#F23645',
            { align: 'left', fontSize: 9 }
          );
        }

        for (const fvg of structure.fvgs) {
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

          ctx.save();
          ctx.fillStyle = isBull ? 'rgba(56, 189, 248, 0.08)' : 'rgba(251, 146, 60, 0.08)';
          ctx.fillRect(drawX1, drawY, Math.max(8, x2 - drawX1), drawH);
          ctx.restore();
        }
      }

      // 4. Support & Resistance Horizontal Levels (Collision-Safe Right Tags)
      if (showSupportResistance) {
        for (const sr of structure.srLevels) {
          const y = toY(sr.price);
          if (y === null || y < 4 || y > height - 4) continue;
          const xStart = Math.max(0, toX(sr.startTime) ?? 0);
          const isPrimary = sr.label === 'S1' || sr.label === 'R1';

          ctx.save();
          ctx.strokeStyle = sr.color;
          ctx.lineWidth = isPrimary ? 1.5 : 1;
          ctx.setLineDash(isPrimary ? [] : [5, 4]);
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
            isLight ? 'rgba(255,255,255,0.94)' : 'rgba(13,17,23,0.92)',
            sr.color,
            sr.kind === 'support' ? '#089981' : '#F23645',
            { align: 'right', fontSize: 9.5 }
          );
        }
      }

      // 5. Chart Patterns (Trendlines, Neckline & Single Non-Overlapping Pattern Badge)
      if (showPatterns && structure.pattern) {
        for (const ln of structure.pattern.lines) {
          const pts = ln.points
            .map((p) => {
              const x = toX(p.time);
              const y = toY(p.price);
              return x !== null && y !== null ? { x, y } : null;
            })
            .filter((p): p is { x: number; y: number } => p !== null);

          if (pts.length < 2) continue;
          ctx.save();
          ctx.strokeStyle = ln.color;
          ctx.lineWidth = ln.width ?? 1.6;
          if (ln.dashed) ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i += 1) {
            ctx.lineTo(pts[i].x, pts[i].y);
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

      // 6. BOS / CHoCH Break Segments & Labels (Collision-Checked)
      if (showBosChoch) {
        for (const seg of structure.breaks) {
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
          ctx.setLineDash(seg.kind === 'CHoCH' ? [] : [4, 3]);
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
        // Prioritize most recent swings first so latest structure labels always win collisions
        const swingsNewestFirst = [...structure.swings].reverse();
        for (const sw of swingsNewestFirst) {
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

    // 8. Live Price Pulse Anchor synced identically with Lightweight Charts priceLine & right scale
    if (liveY !== null && liveY >= 0 && liveY <= height && candles.length > 0) {
      const lastBar = candles[candles.length - 1];
      const lastX = toX(lastBar.time);
      const pulseColor = isBullTick ? '#089981' : '#F23645';

      ctx.save();
      const grad = ctx.createLinearGradient(0, liveY, plotRight, liveY);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.65, isBullTick ? 'rgba(8, 153, 129, 0.10)' : 'rgba(242, 54, 69, 0.10)');
      grad.addColorStop(1, isBullTick ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, liveY - 1.5, plotRight, 3);

      const dotX = lastX !== null && lastX > 12 && lastX < plotRight - 4 ? lastX : plotRight - 6;
      ctx.beginPath();
      ctx.arc(dotX, liveY, 6, 0, Math.PI * 2);
      ctx.fillStyle = isBullTick ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(dotX, liveY, 2.75, 0, Math.PI * 2);
      ctx.fillStyle = pulseColor;
      ctx.fill();
      ctx.restore();
    }
  }, [
    renderTick,
    chart,
    candleSeries,
    candles,
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
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-10"
    />
  );
};
