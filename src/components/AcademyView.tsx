import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Play,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { ACADEMY_SCENARIOS } from '../data/academyData';
import type { AcademyDirection, AcademyPatternType } from '../types/academy';
import type { AppTab, ThemeMode } from '../types/news';
import { InteractiveChartStage } from './academy/InteractiveChartStage';

interface AcademyViewProps {
  onOpenPairInTerminal?: (tvSymbol: string) => void;
  onNavigateTab?: (tab: AppTab) => void;
  themeMode?: ThemeMode;
}

const XP_STORAGE_KEY = 'tredaura_academy_xp_v1';
const COMPLETED_STORAGE_KEY = 'tredaura_academy_completed_v1';

const PATTERNS: { id: AcademyPatternType; label: string }[] = [
  { id: 'BOS', label: 'BOS' },
  { id: 'OB', label: 'OB' },
  { id: 'FVG', label: 'FVG' },
];

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function loadCompleted(): string[] {
  try {
    const raw = localStorage.getItem(COMPLETED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function getRankBadge(xp: number): { label: 'Rookie' | 'Pro' | 'Master'; bg: string; fg: string } {
  if (xp >= 500) {
    return { label: 'Master', bg: '#ECFDF5', fg: '#065F46' };
  }
  if (xp >= 200) {
    return { label: 'Pro', bg: '#FEF3C7', fg: '#92400E' };
  }
  return { label: 'Rookie', bg: '#F3F4F6', fg: '#131722' };
}

export const AcademyView: React.FC<AcademyViewProps> = ({
  onNavigateTab,
  themeMode = 'light',
}) => {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [selectedPattern, setSelectedPattern] = useState<AcademyPatternType>('OB');
  const [selectedDirection, setSelectedDirection] = useState<AcademyDirection>('BUY');
  const [phase, setPhase] = useState<'predict' | 'replaying' | 'resolved'>('predict');
  const [revealedFutureCount, setRevealedFutureCount] = useState(0);
  const [xp, setXp] = useState<number>(() => loadNumber(XP_STORAGE_KEY, 120));
  const [completedIds, setCompletedIds] = useState<string[]>(loadCompleted);
  const [lastEarnedXp, setLastEarnedXp] = useState<number>(0);

  const replayTimerRef = useRef<number | null>(null);
  const scenario = ACADEMY_SCENARIOS[scenarioIdx] ?? ACADEMY_SCENARIOS[0];
  const rank = getRankBadge(xp);

  useEffect(() => {
    try {
      localStorage.setItem(XP_STORAGE_KEY, String(xp));
    } catch {
      // ignore storage errors
    }
  }, [xp]);

  useEffect(() => {
    try {
      localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(completedIds));
    } catch {
      // ignore storage errors
    }
  }, [completedIds]);

  useEffect(() => {
    return () => {
      if (replayTimerRef.current !== null) {
        window.clearInterval(replayTimerRef.current);
      }
    };
  }, []);

  const clearReplayTimer = () => {
    if (replayTimerRef.current !== null) {
      window.clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
  };

  // Strict zero-spoiler visibility: future candles stay 100% hidden until user submits
  const visibleCandles = useMemo(() => {
    if (phase === 'predict' || revealedFutureCount <= 0) {
      return scenario.candles;
    }
    return [...scenario.candles, ...scenario.futureCandles.slice(0, revealedFutureCount)];
  }, [scenario.candles, scenario.futureCandles, phase, revealedFutureCount]);

  // Compute displayed TP/SL matching the user's chosen direction so opposite direction realistically shows SL loss
  const { activeTp, activeSl, isDirectionCorrect, isPatternCorrect } = useMemo(() => {
    const dirRight = selectedDirection === scenario.setup.correctDirection;
    const patRight = selectedPattern === scenario.setup.correctPattern;
    if (dirRight) {
      return {
        activeTp: scenario.setup.tp,
        activeSl: scenario.setup.sl,
        isDirectionCorrect: true,
        isPatternCorrect: patRight,
      };
    }
    // Mirror TP & SL around entry for wrong direction
    const tpDist = Math.abs(scenario.setup.tp - scenario.setup.entry);
    const slDist = Math.abs(scenario.setup.entry - scenario.setup.sl);
    const sign = selectedDirection === 'BUY' ? 1 : -1;
    return {
      activeTp: Number((scenario.setup.entry + sign * tpDist).toFixed(scenario.decimals)),
      activeSl: Number((scenario.setup.entry - sign * slDist).toFixed(scenario.decimals)),
      isDirectionCorrect: false,
      isPatternCorrect: patRight,
    };
  }, [selectedDirection, selectedPattern, scenario]);

  const outcomeStatus: 'idle' | 'replaying' | 'tp' | 'sl' =
    phase === 'predict'
      ? 'idle'
      : phase === 'replaying'
        ? 'replaying'
        : isDirectionCorrect
          ? 'tp'
          : 'sl';

  const handleSubmitAndReplay = () => {
    if (phase !== 'predict') return;
    clearReplayTimer();
    setPhase('replaying');
    setRevealedFutureCount(1);

    let count = 1;
    const totalFuture = scenario.futureCandles.length;
    replayTimerRef.current = window.setInterval(() => {
      count += 1;
      setRevealedFutureCount(count);
      if (count >= totalFuture) {
        clearReplayTimer();
        setPhase('resolved');
        const earned =
          (selectedDirection === scenario.setup.correctDirection ? 30 : 0) +
          (selectedPattern === scenario.setup.correctPattern ? 15 : 0);
        setLastEarnedXp(earned);
        if (earned > 0) {
          setXp((prev) => prev + earned);
        }
        if (
          selectedDirection === scenario.setup.correctDirection &&
          !completedIds.includes(scenario.id)
        ) {
          setCompletedIds((prev) => [...prev, scenario.id]);
        }
      }
    }, 240);
  };

  const handleResetCurrent = () => {
    clearReplayTimer();
    setPhase('predict');
    setRevealedFutureCount(0);
    setLastEarnedXp(0);
  };

  const handleNextSetup = () => {
    clearReplayTimer();
    const nextIdx = (scenarioIdx + 1) % ACADEMY_SCENARIOS.length;
    setScenarioIdx(nextIdx);
    setPhase('predict');
    setRevealedFutureCount(0);
    setLastEarnedXp(0);
  };

  const fmtPts = (pts: number) =>
    scenario.decimals >= 4 ? `${pts.toFixed(0)} pips` : `${pts.toFixed(2)} pts`;

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden pb-[68px] bg-[#FFFFFF] text-[#131722] flex flex-col">
      {/* Compact Pure-White Top Header */}
      <header className="shrink-0 h-11 border-b border-[#E5E7EB] bg-[#FFFFFF] px-3 sm:px-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('terminal')}
              aria-label="Back to Terminal"
              className="inline-flex h-8 w-8 -ml-1 items-center justify-center rounded-lg text-[#475569] hover:bg-[#F3F4F6] hover:text-[#131722] cursor-pointer shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#131722] truncate">
            TREDAURA Academy
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0"
            style={{ backgroundColor: rank.bg, color: rank.fg }}
          >
            <Award className="h-3 w-3" />
            {rank.label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 py-0.5 text-[11px] font-bold text-[#131722] font-mono-tabular whitespace-nowrap shrink-0">
            <Zap className="h-3 w-3 text-[#F59E0B] fill-[#F59E0B]" />
            {xp} XP
          </span>
        </div>
      </header>

      {/* Main Content (Pure White Single-Screen Fit) */}
      <div className="mx-auto w-full max-w-4xl flex-1 min-h-0 flex flex-col px-3 sm:px-6 pt-2 pb-2 gap-2">
        {/* Interactive Market Replay Chart */}
        <section
          aria-label="Market Replay Chart"
          className="flex-1 min-h-0 flex flex-col gap-1"
        >
          <div className="shrink-0 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-bold text-[#92400E] font-mono-tabular shrink-0">
                {scenario.timeframe}
              </span>
              <span className="font-bold text-[#131722] truncate">
                {scenario.symbol} · {scenario.title}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-[#64748B] font-mono-tabular whitespace-nowrap shrink-0">
              Setup {scenarioIdx + 1}/{ACADEMY_SCENARIOS.length}
            </span>
          </div>

          <InteractiveChartStage
            symbol={scenario.symbol}
            decimals={scenario.decimals}
            initialCount={scenario.candles.length}
            visibleCandles={visibleCandles}
            decisionSubmitted={phase !== 'predict'}
            chosenDirection={selectedDirection}
            entry={scenario.setup.entry}
            tp={activeTp}
            sl={activeSl}
            outcomeStatus={outcomeStatus}
            themeMode={themeMode}
          />
        </section>

        {/* Bottom Decision & Replay Control Card */}
        <section
          aria-label="Market Replay Controls"
          className="shrink-0 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-2.5 sm:p-3 flex flex-col gap-2"
        >
          {phase === 'resolved' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isDirectionCorrect ? (
                    <CheckCircle2 className="h-4 w-4 text-[#089981] shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-[#F23645] shrink-0" />
                  )}
                  <span
                    className={`text-xs sm:text-sm font-extrabold font-mono-tabular ${
                      isDirectionCorrect ? 'text-[#089981]' : 'text-[#F23645]'
                    }`}
                  >
                    {isDirectionCorrect
                      ? `TP Hit (+${fmtPts(scenario.setup.pointsGain)})`
                      : `SL Hit (-${fmtPts(scenario.setup.pointsLoss)})`}
                  </span>
                  <span className="text-[10px] font-bold text-[#64748B] font-mono-tabular">
                    · SMC: {scenario.setup.correctPattern} {isPatternCorrect ? '✓' : '✕'}
                  </span>
                </div>
                {lastEarnedXp > 0 && (
                  <span className="rounded-full bg-[#ECFDF5] border border-[#089981]/30 px-2 py-0.5 text-[10px] font-bold text-[#089981] font-mono-tabular shrink-0">
                    +{lastEarnedXp} XP
                  </span>
                )}
              </div>

              <p className="text-[11px] sm:text-xs text-[#475569] leading-snug">
                {scenario.setup.explanation}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleResetCurrent}
                  className="h-9 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-xs font-bold text-[#131722] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Replay Setup</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextSetup}
                  className="h-9 rounded-lg bg-[#089981] hover:bg-[#077F6B] text-xs font-bold text-[#FFFFFF] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Next Setup</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-[#131722]">
                  1. Identify SMC Pattern &amp; Bias
                </span>
                <span className="font-mono-tabular text-[#64748B]">
                  {phase === 'replaying'
                    ? `Revealing bar ${revealedFutureCount}/${scenario.futureCandles.length}...`
                    : `Entry ${scenario.setup.entry.toFixed(scenario.decimals)}`}
                </span>
              </div>

              {/* Pattern Selector (BOS / OB / FVG) */}
              <div className="grid grid-cols-3 gap-1.5">
                {PATTERNS.map((pat) => {
                  const active = selectedPattern === pat.id;
                  return (
                    <button
                      key={pat.id}
                      type="button"
                      disabled={phase !== 'predict'}
                      onClick={() => setSelectedPattern(pat.id)}
                      className={`h-8 rounded-lg border text-xs font-bold font-mono-tabular transition-colors cursor-pointer ${
                        active
                          ? 'border-[#131722] bg-[#131722] text-[#FFFFFF]'
                          : 'border-[#E5E7EB] bg-[#F8FAFC] text-[#131722] hover:border-[#94A3B8]'
                      }`}
                    >
                      {pat.label}
                    </button>
                  );
                })}
              </div>

              {/* Direction (BUY / SELL) + Submit & Replay */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  disabled={phase !== 'predict'}
                  onClick={() => setSelectedDirection('BUY')}
                  className={`h-9 rounded-lg border text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                    selectedDirection === 'BUY'
                      ? 'border-[#089981] bg-[#089981] text-[#FFFFFF]'
                      : 'border-[#E5E7EB] bg-[#FFFFFF] text-[#089981] hover:bg-[#ECFDF5]'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>BUY</span>
                </button>
                <button
                  type="button"
                  disabled={phase !== 'predict'}
                  onClick={() => setSelectedDirection('SELL')}
                  className={`h-9 rounded-lg border text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                    selectedDirection === 'SELL'
                      ? 'border-[#F23645] bg-[#F23645] text-[#FFFFFF]'
                      : 'border-[#E5E7EB] bg-[#FFFFFF] text-[#F23645] hover:bg-[#FEF2F2]'
                  }`}
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  <span>SELL</span>
                </button>
                <button
                  type="button"
                  disabled={phase !== 'predict'}
                  onClick={handleSubmitAndReplay}
                  className={`h-9 rounded-lg text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                    phase === 'replaying'
                      ? 'bg-[#64748B] text-[#FFFFFF] cursor-wait'
                      : 'bg-[#F59E0B] hover:bg-[#D97706] text-[#131722]'
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>{phase === 'replaying' ? 'Replay...' : 'Replay'}</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
