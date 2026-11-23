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
import type { AppTab } from '../types/news';
import { InteractiveChartStage } from './academy/InteractiveChartStage';

interface AcademyViewProps {
  onOpenPairInTerminal?: (tvSymbol: string) => void;
  onNavigateTab?: (tab: AppTab) => void;
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

export const AcademyView: React.FC<AcademyViewProps> = ({ onNavigateTab }) => {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState<0 | 1 | 2>(0);
  const [selectedByStep, setSelectedByStep] = useState<Record<string, string>>({});
  const [xp, setXp] = useState<number>(() => loadNumber(XP_STORAGE_KEY, 120));
  const [completedIds, setCompletedIds] = useState<string[]>(loadCompleted);

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
    <div className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-white text-[#111827] flex flex-col">
      {/* 1. Compact Top Bar: Title, Timeframe Badge & XP Counter */}
      <header className="shrink-0 h-12 border-b border-[#E5E7EB] bg-white px-3 sm:px-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('terminal')}
              aria-label="Back to Terminal"
              className="inline-flex h-9 w-9 -ml-1 items-center justify-center rounded-lg text-[#374151] hover:bg-[#F3F4F6] hover:text-[#111827] cursor-pointer shrink-0 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#111827] truncate">
            Varta Presh Academy
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center rounded-md bg-[#f5b800] px-2 py-0.5 text-[11px] font-bold text-[#111827] font-mono-tabular whitespace-nowrap shrink-0">
            {scenario.timeframe}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#111827] font-mono-tabular whitespace-nowrap shrink-0">
            <Zap className="h-3.5 w-3.5 text-[#f5b800] fill-[#f5b800]" />
            {xp} XP
          </span>
        </div>
      </header>

      {/* Main Content Container */}
      <div className="mx-auto w-full max-w-4xl flex-1 min-h-0 flex flex-col px-3 sm:px-6 pt-2 pb-2.5 gap-2">
        {/* 2. Upper Half: Clean White Candlestick Chart */}
        <section
          aria-label="Interactive Candlestick Chart"
          className="flex-1 min-h-0 flex flex-col gap-1"
        >
          <div className="shrink-0 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#111827] truncate">
              {scenario.symbol} <span className="text-[#9CA3AF]" aria-hidden="true">·</span> {scenario.title}
            </span>
            <span className="text-[11px] font-medium text-[#6B7280] font-mono-tabular whitespace-nowrap shrink-0">
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
          />
        </section>

        {/* 3. Lower Half: Compact 3-Step MCQ Card */}
        <section
          aria-label="3-Step Question Card"
          className="shrink-0 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 flex flex-col gap-2"
        >
          {/* Step Indicator & Next Trigger */}
          <div className="flex items-center justify-between gap-2 h-7">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xs font-bold text-[#111827] font-mono-tabular whitespace-nowrap">
                {currentStep.stepNumber} of 3
              </span>
              <div className="flex items-center gap-1 w-20" aria-hidden="true">
                {[0, 1, 2].map((idx) => (
                  <span
                    key={idx}
                    className="h-1.5 flex-1 rounded-full transition-colors"
                    style={{
                      backgroundColor: idx <= stepIdx ? '#f5b800' : '#E5E7EB',
                    }}
                  />
                ))}
              </div>
            </div>

            {isAnswered && (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#f5b800] hover:bg-[#eab000] px-2.5 text-[11px] font-bold text-[#111827] cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <span>{stepIdx < 2 ? `Step ${stepIdx + 2}` : 'Next Setup'}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Question */}
          <h2 className="text-[13px] sm:text-sm font-semibold text-[#111827] leading-snug line-clamp-2">
            {currentStep.question}
          </h2>

          {/* 3 Short Options */}
          <div className="space-y-1.5" role="radiogroup" aria-label={`Step ${currentStep.stepNumber} options`}>
            {currentStep.options.map((opt, idx) => {
              const isPicked = pickedOptionId === opt.id;
              const isRight = opt.id === currentStep.correctOptionId;

              let containerClass =
                'bg-white border-[#E5E7EB] text-[#111827] hover:border-[#f5b800]';
              if (isAnswered) {
                if (isRight) {
                  containerClass = 'bg-[#ECFDF5] border-[#16A34A] text-[#14532D]';
                } else if (isPicked && !isRight) {
                  containerClass = 'bg-[#FEF2F2] border-[#DC2626] text-[#7F1D1D]';
                } else {
                  containerClass = 'bg-white border-[#E5E7EB] text-[#6B7280] opacity-75';
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
                  className={`min-h-[42px] w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                    isAnswered ? 'cursor-default' : 'cursor-pointer'
                  } ${containerClass}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold font-mono-tabular"
                      style={{
                        backgroundColor:
                          isAnswered && isRight
                            ? '#16A34A'
                            : isAnswered && isPicked && !isRight
                              ? '#DC2626'
                              : '#F3F4F6',
                        color:
                          isAnswered && (isRight || isPicked) ? '#FFFFFF' : '#111827',
                      }}
                    >
                      {optionLetters[idx]}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </span>

                  {isAnswered && isRight && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" aria-label="Correct option" />
                  )}
                  {isAnswered && isPicked && !isRight && (
                    <XCircle className="h-4 w-4 shrink-0 text-[#DC2626]" aria-label="Incorrect option" />
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
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#DC2626]" />
                )}
                <p
                  title={currentStep.explanation}
                  className={`truncate font-medium ${
                    isCorrect ? 'text-[#14532D]' : 'text-[#7F1D1D]'
                  }`}
                >
                  {currentStep.explanation}
                </p>
              </>
            ) : (
              <p className="truncate text-[#6B7280]">
                Pick an option to reveal the target candle and zone.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
