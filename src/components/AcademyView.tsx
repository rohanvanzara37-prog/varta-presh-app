import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
  Sparkles,
  Swords,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { ACADEMY_SCENARIOS } from '../data/academyData';
import type { AcademyDifficulty, AcademyDirection, AcademyPatternType } from '../types/academy';
import type { AppTab, ThemeMode } from '../types/news';
import { formatUsd } from '../utils/demoAccount';
import { InteractiveChartStage } from './academy/InteractiveChartStage';

interface AcademyViewProps {
  onOpenPairInTerminal?: (tvSymbol: string) => void;
  onNavigateTab?: (tab: AppTab) => void;
  themeMode?: ThemeMode;
  demoFloatingPnl?: number;
  openPositionsCount?: number;
  onOpenDemoDrawer?: () => void;
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

function getRankBadge(xp: number): { label: 'Rookie' | 'Pro' | 'Institutional'; bg: string; fg: string } {
  if (xp >= 500) {
    return { label: 'Institutional', bg: 'rgba(8,153,129,0.16)', fg: '#089981' };
  }
  if (xp >= 200) {
    return { label: 'Pro', bg: 'rgba(245,158,11,0.16)', fg: '#F59E0B' };
  }
  return { label: 'Rookie', bg: 'var(--vp-elevated)', fg: 'var(--vp-text)' };
}

export const AcademyView: React.FC<AcademyViewProps> = ({
  onNavigateTab,
  themeMode = 'dark',
  demoFloatingPnl = 0,
  openPositionsCount = 0,
  onOpenDemoDrawer,
}) => {
  const [difficultyFilter, setDifficultyFilter] = useState<'ALL' | AcademyDifficulty>('ALL');
  const [scenarioIdx, setScenarioIdx] = useState(() => Math.floor(Math.random() * ACADEMY_SCENARIOS.length));
  const [selectedPattern, setSelectedPattern] = useState<AcademyPatternType>('OB');
  const [selectedDirection, setSelectedDirection] = useState<AcademyDirection>('BUY');
  const [phase, setPhase] = useState<'predict' | 'replaying' | 'resolved'>('predict');
  const [revealedFutureCount, setRevealedFutureCount] = useState(0);
  const [xp, setXp] = useState<number>(() => loadNumber(XP_STORAGE_KEY, 120));
  const [completedIds, setCompletedIds] = useState<string[]>(loadCompleted);
  const [lastEarnedXp, setLastEarnedXp] = useState<number>(0);

  // 10-Trade Boss Battle Challenge state
  const [bossMode, setBossMode] = useState(false);
  const [bossStep, setBossStep] = useState(0);
  const [bossWins, setBossWins] = useState(0);

  const replayTimerRef = useRef<number | null>(null);

  const filteredPool = useMemo(() => {
    if (difficultyFilter === 'ALL') return ACADEMY_SCENARIOS;
    return ACADEMY_SCENARIOS.filter((s) => s.difficulty === difficultyFilter);
  }, [difficultyFilter]);

  const scenario = filteredPool[scenarioIdx % filteredPool.length] ?? ACADEMY_SCENARIOS[0];
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

  const visibleCandles = useMemo(() => {
    if (phase === 'predict' || revealedFutureCount <= 0) {
      return scenario.candles;
    }
    return [...scenario.candles, ...scenario.futureCandles.slice(0, revealedFutureCount)];
  }, [scenario.candles, scenario.futureCandles, phase, revealedFutureCount]);

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

  const resolveOutcome = () => {
    setPhase('resolved');
    const dirOk = selectedDirection === scenario.setup.correctDirection;
    const patOk = selectedPattern === scenario.setup.correctPattern;
    const earned = (dirOk ? 30 : 0) + (patOk ? 15 : 0);
    setLastEarnedXp(earned);
    if (earned > 0) setXp((prev) => prev + earned);
    if (dirOk && !completedIds.includes(scenario.id)) {
      setCompletedIds((prev) => [...prev, scenario.id]);
    }
    if (bossMode) {
      setBossStep((s) => Math.min(10, s + 1));
      if (dirOk) setBossWins((w) => w + 1);
    }
  };

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
        resolveOutcome();
      }
    }, 240);
  };

  // Manual Sandbox Bar-by-Bar Step
  const handleManualStepBar = () => {
    clearReplayTimer();
    if (phase === 'predict') {
      setPhase('replaying');
      setRevealedFutureCount(1);
      return;
    }
    if (phase === 'replaying') {
      const next = revealedFutureCount + 1;
      setRevealedFutureCount(next);
      if (next >= scenario.futureCandles.length) {
        resolveOutcome();
      }
    }
  };

  const handleResetCurrent = () => {
    clearReplayTimer();
    setPhase('predict');
    setRevealedFutureCount(0);
    setLastEarnedXp(0);
  };

  const handleRandomizeSetup = () => {
    clearReplayTimer();
    const len = filteredPool.length;
    let next = Math.floor(Math.random() * len);
    if (len > 1 && next === scenarioIdx % len) {
      next = (next + 1) % len;
    }
    setScenarioIdx(next);
    setPhase('predict');
    setRevealedFutureCount(0);
    setLastEarnedXp(0);
  };

  const handleNextSetup = () => {
    clearReplayTimer();
    setScenarioIdx((idx) => (idx + 1) % filteredPool.length);
    setPhase('predict');
    setRevealedFutureCount(0);
    setLastEarnedXp(0);
  };

  const handleToggleBossMode = () => {
    clearReplayTimer();
    if (bossMode) {
      setBossMode(false);
    } else {
      setBossMode(true);
      setBossStep(0);
      setBossWins(0);
      handleRandomizeSetup();
    }
  };

  const fmtPts = (pts: number) =>
    scenario.decimals >= 4 ? `${pts.toFixed(0)} pips` : `${pts.toFixed(2)} pts`;

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden pb-[68px] bg-[var(--vp-canvas)] text-[var(--vp-text)] flex flex-col">
      {/* Top Header with Rank, XP & Floating Live PnL Pill */}
      <header className="shrink-0 h-11 border-b border-[var(--vp-border)] bg-[var(--vp-surface)] px-3 sm:px-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('terminal')}
              aria-label="Back to Terminal"
              className="inline-flex h-8 w-8 -ml-1 items-center justify-center rounded-lg text-[var(--vp-muted)] hover:bg-[var(--vp-elevated)] hover:text-[var(--vp-text)] cursor-pointer shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h1 className="text-sm sm:text-base font-bold tracking-tight text-[var(--vp-text)] truncate">
            TREDAURA Academy
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {openPositionsCount > 0 && onOpenDemoDrawer && (
            <button
              type="button"
              onClick={onOpenDemoDrawer}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2 py-0.5 text-[10px] font-mono-tabular font-extrabold cursor-pointer"
              style={{ color: demoFloatingPnl >= 0 ? '#089981' : '#F23645' }}
            >
              <span>{openPositionsCount} Live:</span>
              <span>{formatUsd(demoFloatingPnl, true)}</span>
            </button>
          )}
          <span
            className="inline-flex items-center gap-1 rounded-full border border-[var(--vp-border)] px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0"
            style={{ backgroundColor: rank.bg, color: rank.fg }}
          >
            <Award className="h-3 w-3" />
            {rank.label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--vp-text)] font-mono-tabular whitespace-nowrap shrink-0">
            <Zap className="h-3 w-3 text-[#F59E0B] fill-[#F59E0B]" />
            {xp} XP
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto w-full max-w-4xl flex-1 min-h-0 flex flex-col px-2.5 sm:px-6 pt-1.5 pb-2 gap-1.5">
        {/* Difficulty Filter + Randomize + 10-Trade Boss Battle Bar */}
        <div className="shrink-0 flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(['ALL', 'Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  setDifficultyFilter(lvl);
                  setScenarioIdx(0);
                  handleResetCurrent();
                }}
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                  difficultyFilter === lvl
                    ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]'
                    : 'border border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-muted)]'
                }`}
              >
                {lvl === 'ALL' ? 'All Levels' : lvl}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleRandomizeSetup}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2 py-0.5 text-[10px] font-bold text-[var(--vp-text)] cursor-pointer hover:border-[#F59E0B]"
            >
              <Shuffle className="h-3 w-3 text-[#F59E0B]" />
              <span>Randomize</span>
            </button>
            <button
              type="button"
              onClick={handleToggleBossMode}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                bossMode
                  ? 'border-[#F23645] bg-[#F23645]/15 text-[#F23645]'
                  : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-muted)]'
              }`}
            >
              <Swords className="h-3 w-3" />
              <span>
                {bossMode ? `Boss ${bossStep}/10 (${bossWins}W)` : 'Boss Battle (10)'}
              </span>
            </button>
          </div>
        </div>

        {/* Interactive Market Replay Chart */}
        <section aria-label="Market Replay Chart" className="flex-1 min-h-0 flex flex-col gap-1">
          <div className="shrink-0 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#F59E0B] font-mono-tabular shrink-0">
                {scenario.timeframe}
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[9.5px] font-bold shrink-0"
                style={{
                  backgroundColor:
                    scenario.difficulty === 'Advanced'
                      ? 'rgba(242,54,69,0.14)'
                      : scenario.difficulty === 'Intermediate'
                        ? 'rgba(245,158,11,0.14)'
                        : 'rgba(8,153,129,0.14)',
                  color:
                    scenario.difficulty === 'Advanced'
                      ? '#F23645'
                      : scenario.difficulty === 'Intermediate'
                        ? '#F59E0B'
                        : '#089981',
                }}
              >
                {scenario.difficulty}
              </span>
              <span className="font-bold text-[var(--vp-text)] truncate">
                {scenario.symbol} · {scenario.title}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-[var(--vp-muted)] font-mono-tabular whitespace-nowrap shrink-0">
              #{(scenarioIdx % filteredPool.length) + 1}/{filteredPool.length}
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

        {/* Bottom Decision & Sandbox Bar Replay Control Card */}
        <section
          aria-label="Market Replay Controls"
          className="shrink-0 rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-2.5 sm:p-3 flex flex-col gap-2"
        >
          {phase === 'resolved' ? (
            <div className="space-y-1.5">
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
                  <span className="text-[10px] font-bold text-[var(--vp-muted)] font-mono-tabular">
                    · SMC: {scenario.setup.correctPattern} {isPatternCorrect ? '✓' : '✕'}
                  </span>
                </div>
                {lastEarnedXp > 0 && (
                  <span className="rounded-full bg-[#089981]/15 border border-[#089981]/30 px-2 py-0.5 text-[10px] font-bold text-[#089981] font-mono-tabular shrink-0">
                    +{lastEarnedXp} XP
                  </span>
                )}
              </div>

              <p className="text-[11px] text-[var(--vp-muted)] leading-snug">
                {scenario.setup.explanation}
              </p>

              <div className="rounded-lg border border-[#F59E0B]/35 bg-[#F59E0B]/8 px-2.5 py-1.5 text-[10.5px] text-[var(--vp-text)] flex items-start gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#F59E0B] shrink-0 mt-0.5" />
                <span>{scenario.setup.mentorAnnotation}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleResetCurrent}
                  className="h-8 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:opacity-90 text-xs font-bold text-[var(--vp-text)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Replay Setup</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextSetup}
                  className="h-8 rounded-lg bg-[#089981] hover:brightness-110 text-xs font-bold text-[#FFFFFF] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Next Setup</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-[var(--vp-text)]">
                  1. Identify SMC Pattern &amp; Bias
                </span>
                <span className="font-mono-tabular text-[var(--vp-muted)]">
                  {phase === 'replaying'
                    ? `Revealing bar ${revealedFutureCount}/${scenario.futureCandles.length}...`
                    : `Entry ${scenario.setup.entry.toFixed(scenario.decimals)}`}
                </span>
              </div>

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
                          ? 'border-[var(--vp-primary)] bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]'
                          : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-text)]'
                      }`}
                    >
                      {pat.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  disabled={phase !== 'predict'}
                  onClick={() => setSelectedDirection('BUY')}
                  className={`h-8 rounded-lg border text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                    selectedDirection === 'BUY'
                      ? 'border-[#089981] bg-[#089981] text-[#FFFFFF]'
                      : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[#089981]'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>BUY</span>
                </button>
                <button
                  type="button"
                  disabled={phase !== 'predict'}
                  onClick={() => setSelectedDirection('SELL')}
                  className={`h-8 rounded-lg border text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                    selectedDirection === 'SELL'
                      ? 'border-[#F23645] bg-[#F23645] text-[#FFFFFF]'
                      : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[#F23645]'
                  }`}
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  <span>SELL</span>
                </button>
                <button
                  type="button"
                  onClick={handleManualStepBar}
                  title="Step +1 candle bar manually"
                  className="h-8 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] text-xs font-bold text-[var(--vp-text)] inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <SkipForward className="h-3 w-3" />
                  <span>+1 Bar</span>
                </button>
                <button
                  type="button"
                  disabled={phase !== 'predict'}
                  onClick={handleSubmitAndReplay}
                  className={`h-8 rounded-lg text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                    phase === 'replaying'
                      ? 'bg-[#64748B] text-[#FFFFFF] cursor-wait'
                      : 'bg-[#F59E0B] hover:brightness-110 text-[#0B0E14]'
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>{phase === 'replaying' ? '...' : 'Replay'}</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
