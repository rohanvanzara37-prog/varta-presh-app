import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Zap,
} from 'lucide-react';
import { ACADEMY_SCENARIOS } from '../data/academyData';
import type { AppTab, ThemeMode } from '../types/news';
import { InteractiveChartStage } from './academy/InteractiveChartStage';

interface AcademyViewProps {
  onOpenPairInTerminal?: (tvSymbol: string) => void;
  onNavigateTab?: (tab: AppTab) => void;
  themeMode?: ThemeMode;
}

const XP_STORAGE_KEY = 'vp_academy_xp_v3';
const COMPLETED_STORAGE_KEY = 'vp_academy_completed_v1';

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

export const AcademyView: React.FC<AcademyViewProps> = ({
  onNavigateTab,
  themeMode = 'light',
}) => {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState<0 | 1 | 2>(0);
  const [selectedByStep, setSelectedByStep] = useState<Record<string, string>>({});
  const [xp, setXp] = useState<number>(() => loadNumber(XP_STORAGE_KEY, 120));
  const [completedIds, setCompletedIds] = useState<string[]>(loadCompleted);

  const isLight = themeMode === 'light';
  const scenario = ACADEMY_SCENARIOS[scenarioIdx] ?? ACADEMY_SCENARIOS[0];
  const currentStep = scenario.steps[stepIdx];
  const stepKey = `${scenario.id}:${currentStep.stepNumber}`;
  const pickedOptionId = selectedByStep[stepKey];
  const isAnswered = Boolean(pickedOptionId);
  const isCorrect = pickedOptionId === currentStep.correctOptionId;

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

  const handleSelectOption = (optionId: string) => {
    if (isAnswered) return;
    setSelectedByStep((prev) => ({ ...prev, [stepKey]: optionId }));

    if (optionId === currentStep.correctOptionId) {
      setXp((prev) => prev + 15);
      if (stepIdx === 2 && !completedIds.includes(scenario.id)) {
        setCompletedIds((prev) => [...prev, scenario.id]);
      }
    }
  };

  const handleNext = () => {
    if (stepIdx < 2) {
      setStepIdx((prev) => (prev + 1) as 0 | 1 | 2);
      return;
    }
    const nextScenarioIdx = (scenarioIdx + 1) % ACADEMY_SCENARIOS.length;
    setScenarioIdx(nextScenarioIdx);
    setStepIdx(0);
    setSelectedByStep({});
  };

  const optionLetters = ['A', 'B', 'C'] as const;

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden pb-[68px] bg-[#FFFFFF] text-[#0F172A] flex flex-col transition-colors duration-200">
      {/* 1. Compact Top Bar: Title, Timeframe Badge & XP Counter */}
      <header className="shrink-0 h-12 border-b border-[var(--vp-border)] bg-[var(--vp-header)]/95 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-2 transition-colors">
        <div className="flex items-center gap-1.5 min-w-0">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('terminal')}
              aria-label="Back to Terminal"
              className="vp-pill-btn inline-flex h-8 w-8 -ml-1 items-center justify-center text-[var(--vp-muted)] hover:bg-[var(--vp-elevated)] hover:text-[var(--vp-text)] cursor-pointer shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h1 className="text-sm sm:text-base font-bold tracking-tight text-[var(--vp-text)] truncate">
            Varta Presh Academy
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center rounded-full bg-[#F59E0B] px-2.5 py-0.5 text-[11px] font-bold text-[#0F172A] font-mono-tabular whitespace-nowrap shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.28)]">
            {scenario.timeframe}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2.5 py-0.5 text-xs font-bold text-[var(--vp-text)] font-mono-tabular whitespace-nowrap shrink-0">
            <Zap className="h-3.5 w-3.5 text-[#F59E0B] fill-[#F59E0B]" />
            {xp} XP
          </span>
        </div>
      </header>

      {/* Main Content Container */}
      <div className="mx-auto w-full max-w-4xl flex-1 min-h-0 flex flex-col px-3 sm:px-6 pt-2.5 pb-3 gap-2.5">
        {/* 2. Upper Half: Flagship Interactive Candlestick Chart */}
        <section
          aria-label="Interactive Candlestick Chart"
          className="flex-1 min-h-0 flex flex-col gap-1.5"
        >
          <div className="shrink-0 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[var(--vp-text)] truncate">
              {scenario.symbol}{' '}
              <span className="text-[var(--vp-muted)]" aria-hidden="true">
                ·
              </span>{' '}
              {scenario.title}
            </span>
            <span className="text-[11px] font-medium text-[var(--vp-muted)] font-mono-tabular whitespace-nowrap shrink-0">
              Setup {scenarioIdx + 1}/{ACADEMY_SCENARIOS.length}
            </span>
          </div>

          <InteractiveChartStage
            symbol={scenario.symbol}
            decimals={scenario.decimals}
            candles={scenario.candles}
            zones={scenario.zones}
            targetCandleIndex={currentStep.targetCandleIndex}
            targetZoneId={currentStep.targetZoneId}
            isAnswered={isAnswered}
            themeMode={themeMode}
          />
        </section>

        {/* 3. Lower Half: Compact 3-Step MCQ Card */}
        <section
          aria-label="3-Step Question Card"
          className="shrink-0 vp-glass-card rounded-2xl p-3 sm:p-3.5 flex flex-col gap-2"
        >
          {/* Step Indicator & Next Trigger */}
          <div className="flex items-center justify-between gap-2 h-7">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xs font-bold text-[var(--vp-text)] font-mono-tabular whitespace-nowrap">
                {currentStep.stepNumber} of 3
              </span>
              <div className="flex items-center gap-1 w-20" aria-hidden="true">
                {[0, 1, 2].map((idx) => (
                  <span
                    key={idx}
                    className="h-1.5 flex-1 rounded-full transition-colors"
                    style={{
                      backgroundColor:
                        idx <= stepIdx ? '#F59E0B' : isLight ? '#E2E8F0' : '#1E2433',
                    }}
                  />
                ))}
              </div>
            </div>

            {isAnswered && (
              <button
                type="button"
                onClick={handleNext}
                className="vp-pill-btn inline-flex h-7 items-center gap-1 bg-[#F59E0B] hover:bg-[#D97706] px-3 text-[11px] font-bold text-[#0F172A] cursor-pointer whitespace-nowrap shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
              >
                <span>{stepIdx < 2 ? `Step ${stepIdx + 2}` : 'Next Setup'}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Question */}
          <h2 className="text-[13px] sm:text-sm font-semibold text-[var(--vp-text)] leading-snug line-clamp-2">
            {currentStep.question}
          </h2>

          {/* 3 Short Options */}
          <div className="space-y-1.5" role="radiogroup" aria-label={`Step ${currentStep.stepNumber} options`}>
            {currentStep.options.map((opt, idx) => {
              const isPicked = pickedOptionId === opt.id;
              const isRight = opt.id === currentStep.correctOptionId;

              let containerClass =
                'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-text)] hover:border-[#F59E0B]/70';
              if (isAnswered) {
                if (isRight) {
                  containerClass = isLight
                    ? 'bg-[#ECFDF5] border-[#089981] text-[#065F46]'
                    : 'bg-[#089981]/15 border-[#089981] text-[#34D399]';
                } else if (isPicked && !isRight) {
                  containerClass = isLight
                    ? 'bg-[#FEF2F2] border-[#F23645] text-[#991B1B]'
                    : 'bg-[#F23645]/15 border-[#F23645] text-[#FCA5A5]';
                } else {
                  containerClass =
                    'bg-[var(--vp-elevated)] border-[var(--vp-border)] text-[var(--vp-muted)] opacity-70';
                }
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isPicked}
                  disabled={isAnswered}
                  onClick={() => handleSelectOption(opt.id)}
                  className={`min-h-[42px] w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-left text-xs font-medium transition-all ${
                    isAnswered ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'
                  } ${containerClass}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold font-mono-tabular"
                      style={{
                        backgroundColor:
                          isAnswered && isRight
                            ? '#089981'
                            : isAnswered && isPicked && !isRight
                              ? '#F23645'
                              : isLight
                                ? '#E2E8F0'
                                : '#1E2433',
                        color:
                          isAnswered && (isRight || isPicked)
                            ? '#FFFFFF'
                            : isLight
                              ? '#0F172A'
                              : '#E2E8F0',
                      }}
                    >
                      {optionLetters[idx]}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </span>

                  {isAnswered && isRight && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#089981]" aria-label="Correct option" />
                  )}
                  {isAnswered && isPicked && !isRight && (
                    <XCircle className="h-4 w-4 shrink-0 text-[#F23645]" aria-label="Incorrect option" />
                  )}
                </button>
              );
            })}
          </div>

          {/* 1-Line Explanation Slot */}
          <div className="h-5 flex items-center gap-1.5 text-[11px] sm:text-xs min-w-0">
            {isAnswered ? (
              <>
                {isCorrect ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#089981]" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#F23645]" />
                )}
                <p
                  title={currentStep.explanation}
                  className={`truncate font-medium ${
                    isCorrect ? 'text-[var(--vp-bull)]' : 'text-[var(--vp-bear)]'
                  }`}
                >
                  {currentStep.explanation}
                </p>
              </>
            ) : (
              <p className="truncate text-[var(--vp-muted)]">
                Pick an option to reveal the target candle and zone.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

