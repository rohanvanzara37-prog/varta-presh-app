import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Copy,
  Droplets,
  Eraser,
  Flame,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { FONT_OPTIONS } from '../data/newsData';
import type { FontOptionId, TypographySettings } from '../types/news';
import { fetchRealBtcPrice, fetchRealXauGoldPrice } from '../utils/marketFeeds';

interface SandGameViewProps {
  typography: TypographySettings;
}

type MaterialType = 0 | 1 | 2 | 3 | 4 | 5;
// 0 = Empty, 1 = Gold Sand, 2 = Water, 3 = Stone Wall, 4 = Wood, 5 = Fire

interface MaterialDef {
  id: MaterialType;
  label: string;
  swatch: string;
}

const MATERIALS: MaterialDef[] = [
  { id: 1, label: 'Gold Sand', swatch: '#eab308' },
  { id: 2, label: 'Water', swatch: '#0ea5e9' },
  { id: 3, label: 'Stone', swatch: '#64748b' },
  { id: 4, label: 'Wood', swatch: '#92400e' },
  { id: 5, label: 'Fire', swatch: '#f97316' },
  { id: 0, label: 'Eraser', swatch: '#cbd5e1' },
];

const GRID_W = 120;
const GRID_H = 84;
const CELL_PX = 4; // Canvas 480x336 scaled smoothly with crisp pixels

const SHARED_APP_URL = 'https://ais-pre-vymurqepqct4ygkm2ujtqw-15849434095.asia-east1.run.app/?tab=game';
const GAME_SCORE_KEY = 'vp_sand_game_scores_v1';

export const SandGameView: React.FC<SandGameViewProps> = ({ typography }) => {
  const [activeGameTab, setActiveGameTab] = useState<'sand' | 'predict'>('sand');
  const [selectedMat, setSelectedMat] = useState<MaterialType>(1);
  const [brushRadius, setBrushRadius] = useState<number>(2);
  const [isPaused, setIsPaused] = useState(false);
  const [challengeMode, setChallengeMode] = useState(true);
  const [sandLevel, setSandLevel] = useState(1);
  const [bucketFilled, setBucketFilled] = useState(0);
  const [bestSandScore, setBestSandScore] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(GAME_SCORE_KEY);
      if (raw) return (JSON.parse(raw) as { sandBest?: number }).sandBest ?? 0;
    } catch {
      // ignore
    }
    return 0;
  });

  // Share link state
  const [copiedLink, setCopiedLink] = useState(false);

  // Market Up/Down Arcade state
  const [arcadePair, setArcadePair] = useState<'XAU/USD' | 'BTC/USD'>('XAU/USD');
  const [xauPrice, setXauPrice] = useState(2664.8);
  const [btcPrice, setBtcPrice] = useState(91850);
  const [roundState, setRoundState] = useState<'idle' | 'running' | 'result'>('idle');
  const [pickDirection, setPickDirection] = useState<'UP' | 'DOWN' | null>(null);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [currentSimPrice, setCurrentSimPrice] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(12);
  const [streak, setStreak] = useState(0);
  const [points, setPoints] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(GAME_SCORE_KEY);
      if (raw) return (JSON.parse(raw) as { arcadePts?: number }).arcadePts ?? 100;
    } catch {
      // ignore
    }
    return 100;
  });
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<Uint8Array>(new Uint8Array(GRID_W * GRID_H));
  const colorVarRef = useRef<Uint8Array>(new Uint8Array(GRID_W * GRID_H));
  const pointerDownRef = useRef(false);
  const pointerCellRef = useRef<{ x: number; y: number } | null>(null);
  const bucketGoalRef = useRef<{ x: number; y: number; w: number; h: number }>({
    x: 46,
    y: 72,
    w: 28,
    h: 9,
  });

  const getFontFamily = (id: FontOptionId) =>
    FONT_OPTIONS.find((f) => f.id === id)?.cssFamily ?? FONT_OPTIONS[0].cssFamily;

  const shareUrl =
    typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? `${window.location.origin}/?tab=game`
      : SHARED_APP_URL;

  const handleCopyGameLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VartaPress — Sand & Live Market Arcade',
          text: 'Play the Falling Sand Physics Game & XAU/BTC 1m Streak Challenge!',
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopyGameLink();
  };

  // Persist scores
  useEffect(() => {
    try {
      localStorage.setItem(
        GAME_SCORE_KEY,
        JSON.stringify({ sandBest: bestSandScore, arcadePts: points })
      );
    } catch {
      // ignore
    }
  }, [bestSandScore, points]);

  // Seed initial sand + obstacle layout for immediate visual satisfaction
  const resetSandWorld = useCallback((levelNum = 1) => {
    const grid = new Uint8Array(GRID_W * GRID_H);
    const cv = new Uint8Array(GRID_W * GRID_H);

    // Build stone floor & angled obstacle platforms based on level
    const bucketX = levelNum % 2 === 1 ? 74 : 22;
    bucketGoalRef.current = { x: bucketX, y: 71, w: 24, h: 10 };

    // Left & right bucket walls + base
    for (let y = 71; y <= 81; y += 1) {
      grid[y * GRID_W + bucketX] = 3;
      grid[y * GRID_W + (bucketX + 24)] = 3;
    }
    for (let x = bucketX; x <= bucketX + 24; x += 1) {
      grid[81 * GRID_W + x] = 3;
    }

    // Guiding stone ramp to make physics immediately fun
    const rampStart = levelNum % 2 === 1 ? 20 : 60;
    for (let i = 0; i < 36; i += 1) {
      const rx = rampStart + i;
      const ry = levelNum % 2 === 1 ? 30 + Math.floor(i * 0.45) : 46 - Math.floor(i * 0.45);
      if (rx >= 0 && rx < GRID_W && ry >= 0 && ry < GRID_H) {
        grid[ry * GRID_W + rx] = 3;
        grid[(ry + 1) * GRID_W + rx] = 3;
      }
    }

    // Small initial trickle of Gold Sand at top
    for (let x = 26; x <= 38; x += 1) {
      for (let y = 6; y <= 14; y += 1) {
        if ((x + y) % 2 === 0) {
          const idx = y * GRID_W + x;
          grid[idx] = 1;
          cv[idx] = (x * 17 + y * 31) % 255;
        }
      }
    }

    gridRef.current = grid;
    colorVarRef.current = cv;
    setBucketFilled(0);
  }, []);

  useEffect(() => {
    resetSandWorld(sandLevel);
  }, [sandLevel, resetSandWorld]);

  // Paint helper at grid coordinates
  const paintAtCell = useCallback(
    (cx: number, cy: number) => {
      const grid = gridRef.current;
      const cv = colorVarRef.current;
      for (let dy = -brushRadius; dy <= brushRadius; dy += 1) {
        for (let dx = -brushRadius; dx <= brushRadius; dx += 1) {
          if (dx * dx + dy * dy > brushRadius * brushRadius + 1) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
          const idx = ny * GRID_W + nx;
          if (selectedMat === 0) {
            grid[idx] = 0;
          } else if (selectedMat === 3 || selectedMat === 4) {
            grid[idx] = selectedMat;
            cv[idx] = (nx * 13 + ny * 7) % 255;
          } else if (grid[idx] === 0 || selectedMat === 5) {
            if (Math.random() < 0.72) {
              grid[idx] = selectedMat;
              cv[idx] = Math.floor(Math.random() * 255);
            }
          }
        }
      }
    },
    [brushRadius, selectedMat]
  );

  // Simulation + Canvas Render Loop
  useEffect(() => {
    if (activeGameTab !== 'sand') return;
    let rafId = 0;
    let frameTick = 0;

    const stepSimulation = () => {
      const grid = gridRef.current;
      const cv = colorVarRef.current;

      // Continuous pour while pointer is pressed
      if (pointerDownRef.current && pointerCellRef.current) {
        paintAtCell(pointerCellRef.current.x, pointerCellRef.current.y);
      }

      if (!isPaused) {
        const leftToRight = frameTick % 2 === 0;
        for (let y = GRID_H - 2; y >= 0; y -= 1) {
          for (let step = 0; step < GRID_W; step += 1) {
            const x = leftToRight ? step : GRID_W - 1 - step;
            const idx = y * GRID_W + x;
            const mat = grid[idx];
            if (mat === 0 || mat === 3 || mat === 4) continue;

            const below = (y + 1) * GRID_W + x;

            if (mat === 1) {
              // Gold Sand: falls down, displaces water, or slides diagonally
              if (grid[below] === 0 || grid[below] === 2) {
                const swapMat = grid[below];
                const swapCv = cv[below];
                grid[below] = 1;
                cv[below] = cv[idx];
                grid[idx] = swapMat;
                cv[idx] = swapCv;
              } else {
                const dir = Math.random() < 0.5 ? -1 : 1;
                const d1 = x + dir;
                const d2 = x - dir;
                if (
                  d1 >= 0 &&
                  d1 < GRID_W &&
                  (grid[(y + 1) * GRID_W + d1] === 0 ||
                    grid[(y + 1) * GRID_W + d1] === 2)
                ) {
                  const target = (y + 1) * GRID_W + d1;
                  const swapMat = grid[target];
                  const swapCv = cv[target];
                  grid[target] = 1;
                  cv[target] = cv[idx];
                  grid[idx] = swapMat;
                  cv[idx] = swapCv;
                } else if (
                  d2 >= 0 &&
                  d2 < GRID_W &&
                  (grid[(y + 1) * GRID_W + d2] === 0 ||
                    grid[(y + 1) * GRID_W + d2] === 2)
                ) {
                  const target = (y + 1) * GRID_W + d2;
                  const swapMat = grid[target];
                  const swapCv = cv[target];
                  grid[target] = 1;
                  cv[target] = cv[idx];
                  grid[idx] = swapMat;
                  cv[idx] = swapCv;
                }
              }
            } else if (mat === 2) {
              // Water: falls down, diagonals, or spreads horizontally
              if (grid[below] === 0) {
                grid[below] = 2;
                cv[below] = cv[idx];
                grid[idx] = 0;
              } else if (grid[below] === 5) {
                // Extinguish fire
                grid[below] = 0;
                grid[idx] = 0;
              } else {
                const dir = Math.random() < 0.5 ? -1 : 1;
                const d1 = x + dir;
                const d2 = x - dir;
                if (d1 >= 0 && d1 < GRID_W && grid[(y + 1) * GRID_W + d1] === 0) {
                  grid[(y + 1) * GRID_W + d1] = 2;
                  grid[idx] = 0;
                } else if (d2 >= 0 && d2 < GRID_W && grid[(y + 1) * GRID_W + d2] === 0) {
                  grid[(y + 1) * GRID_W + d2] = 2;
                  grid[idx] = 0;
                } else if (d1 >= 0 && d1 < GRID_W && grid[y * GRID_W + d1] === 0) {
                  grid[y * GRID_W + d1] = 2;
                  grid[idx] = 0;
                } else if (d2 >= 0 && d2 < GRID_W && grid[y * GRID_W + d2] === 0) {
                  grid[y * GRID_W + d2] = 2;
                  grid[idx] = 0;
                }
              }
            } else if (mat === 5) {
              // Fire rises, ignites nearby Wood, and fades out
              if (Math.random() < 0.14) {
                grid[idx] = 0;
                continue;
              }
              const neighbors = [
                y > 0 ? (y - 1) * GRID_W + x : -1,
                x > 0 ? y * GRID_W + (x - 1) : -1,
                x < GRID_W - 1 ? y * GRID_W + (x + 1) : -1,
                below,
              ];
              for (const nIdx of neighbors) {
                if (nIdx >= 0 && grid[nIdx] === 4 && Math.random() < 0.25) {
                  grid[nIdx] = 5;
                } else if (nIdx >= 0 && grid[nIdx] === 2) {
                  grid[idx] = 0;
                }
              }
              if (y > 0 && grid[(y - 1) * GRID_W + x] === 0 && Math.random() < 0.6) {
                const drift = x + (Math.random() < 0.33 ? -1 : Math.random() < 0.5 ? 1 : 0);
                const nx = Math.max(0, Math.min(GRID_W - 1, drift));
                const upIdx = (y - 1) * GRID_W + nx;
                if (grid[upIdx] === 0) {
                  grid[upIdx] = 5;
                  cv[upIdx] = Math.floor(Math.random() * 255);
                  grid[idx] = 0;
                }
              }
            }
          }
        }
      }

      // Draw frame
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, GRID_W * CELL_PX, GRID_H * CELL_PX);

          // Bucket goal overlay
          if (challengeMode) {
            const g = bucketGoalRef.current;
            ctx.fillStyle = 'rgba(234, 179, 8, 0.14)';
            ctx.fillRect(g.x * CELL_PX, g.y * CELL_PX, g.w * CELL_PX, g.h * CELL_PX);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(
              g.x * CELL_PX + 2,
              g.y * CELL_PX + 2,
              g.w * CELL_PX - 4,
              g.h * CELL_PX - 2
            );
          }

          let sandInBucket = 0;
          const g = bucketGoalRef.current;

          for (let y = 0; y < GRID_H; y += 1) {
            for (let x = 0; x < GRID_W; x += 1) {
              const idx = y * GRID_W + x;
              const mat = grid[idx];
              if (mat === 0) continue;

              const v = cv[idx];
              if (mat === 1) {
                ctx.fillStyle =
                  v % 3 === 0 ? '#facc15' : v % 3 === 1 ? '#eab308' : '#f59e0b';
                if (
                  challengeMode &&
                  x > g.x &&
                  x < g.x + g.w &&
                  y >= g.y &&
                  y < g.y + g.h
                ) {
                  sandInBucket += 1;
                }
              } else if (mat === 2) {
                ctx.fillStyle = v % 2 === 0 ? '#38bdf8' : '#0ea5e9';
              } else if (mat === 3) {
                ctx.fillStyle = v % 2 === 0 ? '#64748b' : '#475569';
              } else if (mat === 4) {
                ctx.fillStyle = v % 2 === 0 ? '#92400e' : '#78350f';
              } else {
                ctx.fillStyle = Math.random() < 0.5 ? '#f97316' : '#ef4444';
              }
              ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
            }
          }

          if (frameTick % 10 === 0 && challengeMode) {
            setBucketFilled(sandInBucket);
            const scoreNow = (sandLevel - 1) * 100 + sandInBucket;
            setBestSandScore((prev) => Math.max(prev, scoreNow));
          }
        }
      }

      frameTick += 1;
      rafId = window.requestAnimationFrame(stepSimulation);
    };

    rafId = window.requestAnimationFrame(stepSimulation);
    return () => window.cancelAnimationFrame(rafId);
  }, [activeGameTab, isPaused, challengeMode, paintAtCell, sandLevel]);

  const bucketTarget = 110;
  const bucketPct = Math.min(100, Math.round((bucketFilled / bucketTarget) * 100));

  // Fetch real base prices for the prediction arcade
  useEffect(() => {
    Promise.all([fetchRealXauGoldPrice(), fetchRealBtcPrice()]).then(([x, b]) => {
      setXauPrice(x.priceUsd);
      setBtcPrice(b.priceUsd);
    });
  }, []);

  // 12-second Market Up/Down Arcade timer
  useEffect(() => {
    if (roundState !== 'running' || entryPrice === null) return;
    const timer = window.setInterval(() => {
      setCurrentSimPrice((prev) => {
        const base = prev ?? entryPrice;
        const stepSize = arcadePair === 'XAU/USD' ? 0.65 : 38;
        const delta = (Math.random() - 0.48) * stepSize;
        return Number((base + delta).toFixed(2));
      });

      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(timer);
          setRoundState('result');
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [roundState, entryPrice, arcadePair]);

  // Evaluate result when timer hits 0
  useEffect(() => {
    if (roundState !== 'result' || entryPrice === null || currentSimPrice === null || !pickDirection) {
      return;
    }
    const wentUp = currentSimPrice >= entryPrice;
    const won =
      (pickDirection === 'UP' && wentUp) || (pickDirection === 'DOWN' && !wentUp);
    if (won) {
      setStreak((s) => s + 1);
      setPoints((p) => p + 25);
      setLastOutcome(
        `Won! ${arcadePair} moved ${wentUp ? 'UP' : 'DOWN'} to $${currentSimPrice.toLocaleString()} (+25 pts)`
      );
    } else {
      setStreak(0);
      setPoints((p) => Math.max(10, p - 10));
      setLastOutcome(
        `Missed — ${arcadePair} closed at $${currentSimPrice.toLocaleString()} (-10 pts)`
      );
    }
  }, [roundState, entryPrice, currentSimPrice, pickDirection, arcadePair]);

  const startPredictionRound = (dir: 'UP' | 'DOWN') => {
    const startP = arcadePair === 'XAU/USD' ? xauPrice : btcPrice;
    setPickDirection(dir);
    setEntryPrice(startP);
    setCurrentSimPrice(startP);
    setSecondsLeft(12);
    setLastOutcome(null);
    setRoundState('running');
  };

  const getCellFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_W);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_H);
    return {
      x: Math.max(0, Math.min(GRID_W - 1, x)),
      y: Math.max(0, Math.min(GRID_H - 1, y)),
    };
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20 md:pb-8">
      {/* Header + Instant Share / Send Link Bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5"
            style={{ fontFamily: getFontFamily(typography.headlineFont) }}
          >
            <Gamepad2 className="h-7 w-7" style={{ color: 'var(--vp-primary)' }} />
            <span>Sand & Market Arcade</span>
          </h1>
          <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--vp-muted)' }}>
            Play the interactive Falling Sand physics game or test your XAU Gold & BTC streak — and share the live app link
          </p>
        </div>

        {/* Mode Switcher */}
        <div
          className="flex items-center gap-1 rounded-2xl p-1.5"
          style={{ backgroundColor: 'var(--vp-elevated)' }}
        >
          <button
            type="button"
            onClick={() => setActiveGameTab('sand')}
            className="min-h-[40px] rounded-xl px-4 text-xs sm:text-sm font-semibold cursor-pointer"
            style={{
              backgroundColor: activeGameTab === 'sand' ? 'var(--vp-primary)' : 'transparent',
              color: activeGameTab === 'sand' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
            }}
          >
            Falling Sand Game
          </button>
          <button
            type="button"
            onClick={() => setActiveGameTab('predict')}
            className="min-h-[40px] rounded-xl px-4 text-xs sm:text-sm font-semibold cursor-pointer"
            style={{
              backgroundColor: activeGameTab === 'predict' ? 'var(--vp-primary)' : 'transparent',
              color: activeGameTab === 'predict' ? 'var(--vp-primary-fg)' : 'var(--vp-muted)',
            }}
          >
            Gold & BTC Prediction
          </button>
        </div>
      </div>

      {/* Shareable Game & App Link Card */}
      <section
        className="rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3"
        style={{
          backgroundColor: 'var(--vp-surface)',
          borderColor: 'var(--vp-border)',
        }}
      >
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold block" style={{ color: 'var(--vp-muted)' }}>
            SHAREABLE APP & GAME LINK
          </span>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-mono-tabular text-xs sm:text-sm font-semibold underline underline-offset-4 mt-0.5"
            style={{ color: 'var(--vp-primary)' }}
          >
            {shareUrl}
          </a>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyGameLink}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: copiedLink ? '#10b981' : 'var(--vp-elevated)',
              borderColor: copiedLink ? '#10b981' : 'var(--vp-border)',
              color: copiedLink ? '#ffffff' : 'var(--vp-text)',
            }}
          >
            {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </button>

          <button
            type="button"
            onClick={handleNativeShare}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--vp-primary)',
              color: 'var(--vp-primary-fg)',
            }}
          >
            <Share2 className="h-4 w-4" />
            <span>Send Link</span>
          </button>
        </div>
      </section>

      {activeGameTab === 'sand' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Interactive Falling Sand Physics Canvas */}
          <section
            className="lg:col-span-8 rounded-2xl border p-4 sm:p-5 space-y-4"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">
                  Level {sandLevel} · Gold Bucket Goal
                </span>
                <span
                  className="font-mono-tabular text-xs font-semibold"
                  style={{ color: 'var(--vp-primary)' }}
                >
                  {bucketPct}% filled
                </span>
              </div>

              <div className="flex items-center gap-2">
                {bucketPct >= 100 && (
                  <button
                    type="button"
                    onClick={() => setSandLevel((lv) => lv + 1)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold cursor-pointer"
                    style={{
                      backgroundColor: '#10b981',
                      color: '#ffffff',
                    }}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    <span>Next Level</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsPaused((p) => !p)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                    color: 'var(--vp-text)',
                  }}
                >
                  {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => resetSandWorld(sandLevel)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                    color: 'var(--vp-text)',
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <div
              className="w-full overflow-hidden rounded-xl border"
              style={{ borderColor: 'var(--vp-border)' }}
            >
              <canvas
                ref={canvasRef}
                width={GRID_W * CELL_PX}
                height={GRID_H * CELL_PX}
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => {
                  pointerDownRef.current = true;
                  const cell = getCellFromPointer(e);
                  pointerCellRef.current = cell;
                  if (cell) paintAtCell(cell.x, cell.y);
                }}
                onPointerMove={(e) => {
                  if (!pointerDownRef.current) return;
                  const cell = getCellFromPointer(e);
                  pointerCellRef.current = cell;
                  if (cell) paintAtCell(cell.x, cell.y);
                }}
                onPointerUp={() => {
                  pointerDownRef.current = false;
                  pointerCellRef.current = null;
                }}
                onPointerLeave={() => {
                  pointerDownRef.current = false;
                  pointerCellRef.current = null;
                }}
                className="block w-full h-auto cursor-crosshair select-none"
              />
            </div>

            <p className="text-xs" style={{ color: 'var(--vp-muted)' }}>
              Draw Stone ramps and pour Gold Sand so it flows into the highlighted yellow bucket. Mix Water, Wood, and Fire to experiment.
            </p>
          </section>

          {/* Material Palette & Brush Controls */}
          <aside
            className="lg:col-span-4 rounded-2xl border p-4 sm:p-5 space-y-5"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
            }}
          >
            <div className="space-y-2.5">
              <h2 className="text-sm font-bold">Elements</h2>
              <div className="grid grid-cols-2 gap-2">
                {MATERIALS.map((mat) => {
                  const active = selectedMat === mat.id;
                  return (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => setSelectedMat(mat.id)}
                      className="flex min-h-[44px] items-center gap-2.5 rounded-xl border px-3 text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                        color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                        borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                      }}
                    >
                      {mat.id === 0 ? (
                        <Eraser className="h-4 w-4 shrink-0" />
                      ) : mat.id === 2 ? (
                        <Droplets className="h-4 w-4 shrink-0" />
                      ) : mat.id === 5 ? (
                        <Flame className="h-4 w-4 shrink-0" />
                      ) : (
                        <span
                          className="h-3.5 w-3.5 rounded-sm shrink-0 border border-black/20"
                          style={{ backgroundColor: mat.swatch }}
                        />
                      )}
                      <span>{mat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold block">Brush Size</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Fine', r: 1 },
                  { label: 'Medium', r: 2 },
                  { label: 'Wide', r: 4 },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => setBrushRadius(b.r)}
                    className="min-h-[40px] rounded-xl border text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor:
                        brushRadius === b.r ? 'var(--vp-secondary)' : 'var(--vp-elevated)',
                      color:
                        brushRadius === b.r ? 'var(--vp-secondary-fg)' : 'var(--vp-text)',
                      borderColor: 'var(--vp-border)',
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="rounded-xl p-4 space-y-2"
              style={{ backgroundColor: 'var(--vp-elevated)' }}
            >
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--vp-muted)' }}>Best Sand Score</span>
                <span className="font-mono-tabular font-bold">{bestSandScore} pts</span>
              </div>
              <label className="flex items-center justify-between text-xs cursor-pointer pt-1">
                <span>Bucket Goal Challenge</span>
                <input
                  type="checkbox"
                  checked={challengeMode}
                  onChange={(e) => setChallengeMode(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            </div>
          </aside>
        </div>
      ) : (
        /* Gold & BTC 12-Second Up/Down Streak Prediction Game */
        <section
          className="rounded-2xl border p-5 sm:p-6 space-y-5 max-w-3xl"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5" style={{ color: 'var(--vp-accent)' }} />
                <span>XAU Gold & BTC Up/Down Streak Game</span>
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--vp-muted)' }}>
                Predict whether the price closes higher or lower after 12 seconds (+25 pts win / -10 pts miss)
              </p>
            </div>

            <div className="flex items-center gap-3 font-mono-tabular text-xs">
              <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--vp-elevated)' }}>
                Points: <strong>{points}</strong>
              </div>
              <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--vp-elevated)' }}>
                Streak: <strong>{streak}</strong>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(['XAU/USD', 'BTC/USD'] as const).map((pair) => (
              <button
                key={pair}
                type="button"
                disabled={roundState === 'running'}
                onClick={() => {
                  setArcadePair(pair);
                  setRoundState('idle');
                  setLastOutcome(null);
                }}
                className="min-h-[42px] rounded-xl border px-4 text-xs font-bold cursor-pointer"
                style={{
                  backgroundColor:
                    arcadePair === pair ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                  color:
                    arcadePair === pair ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                {pair}
              </button>
            ))}
          </div>

          <div
            className="rounded-2xl border p-5 flex flex-wrap items-center justify-between gap-4"
            style={{
              backgroundColor: 'var(--vp-elevated)',
              borderColor: 'var(--vp-border)',
            }}
          >
            <div>
              <span className="text-xs font-semibold block" style={{ color: 'var(--vp-muted)' }}>
                {roundState === 'running'
                  ? `Entry: $${entryPrice?.toLocaleString()} · Time left: ${secondsLeft}s`
                  : `Current ${arcadePair} Spot`}
              </span>
              <span className="font-mono-tabular text-3xl font-bold block mt-1">
                $
                {(roundState !== 'idle' && currentSimPrice !== null
                  ? currentSimPrice
                  : arcadePair === 'XAU/USD'
                    ? xauPrice
                    : btcPrice
                ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={roundState === 'running'}
                onClick={() => startPredictionRound('UP')}
                className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl px-5 text-sm font-bold cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: '#10b981', color: '#ffffff' }}
              >
                <ArrowUpRight className="h-4 w-4" />
                <span>Predict UP</span>
              </button>

              <button
                type="button"
                disabled={roundState === 'running'}
                onClick={() => startPredictionRound('DOWN')}
                className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl px-5 text-sm font-bold cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
              >
                <ArrowDownRight className="h-4 w-4" />
                <span>Predict DOWN</span>
              </button>
            </div>
          </div>

          {lastOutcome && (
            <div
              className="rounded-xl border px-4 py-3 text-xs sm:text-sm font-semibold"
              style={{
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-primary)',
              }}
            >
              {lastOutcome}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
