import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CandlestickChart,
  CheckCircle2,
  Clock,
  GraduationCap,
} from 'lucide-react';

interface AcademyViewProps {
  onOpenPairInTerminal: (tvSymbol: string) => void;
}

interface AcademyLesson {
  id: string;
  level: 'Beginner' | 'Intermediate' | 'Pro SMC';
  duration: string;
  practiceSymbol: string;
  practiceLabel: string;
  title: string;
  summary: string;
  points: string[];
  quizQuestion: string;
  quizOptions: string[];
  correctIndex: number;
}

const LESSONS: AcademyLesson[] = [
  {
    id: 'lesson-hh-hl',
    level: 'Beginner',
    duration: '4 min',
    practiceSymbol: 'OANDA:XAUUSD',
    practiceLabel: 'XAU/USD Gold',
    title: '01. Market Structure: HH, HL, LH & LL',
    summary:
      'Identify whether buyers or sellers control the chart by mapping confirmed swing highs and swing lows.',
    points: [
      'Uptrends print Higher Highs (HH) followed by Higher Lows (HL).',
      'Downtrends print Lower Highs (LH) followed by Lower Lows (LL).',
      'Always wait for 4–5 closed candles to confirm a true swing pivot.',
    ],
    quizQuestion: 'Which sequence defines a healthy bullish uptrend?',
    quizOptions: [
      'Lower Highs and Lower Lows (LH / LL)',
      'Higher Highs and Higher Lows (HH / HL)',
      'Equal Highs without candle closes',
    ],
    correctIndex: 1,
  },
  {
    id: 'lesson-bos-choch',
    level: 'Pro SMC',
    duration: '6 min',
    practiceSymbol: 'BINANCE:BTCUSDT',
    practiceLabel: 'BTC/USDT',
    title: '02. Break of Structure (BOS) vs CHoCH',
    summary:
      'Separate trend continuation signals (BOS) from early structural reversals (CHoCH) using candle body closes.',
    points: [
      'BOS occurs when price closes beyond a prior swing in the same direction as the prevailing trend.',
      'CHoCH occurs when price breaks the opposite structural swing for the first time.',
      'Wicks alone are liquidity sweeps; wait for a clean body close to confirm BOS or CHoCH.',
    ],
    quizQuestion: 'What does a bullish CHoCH signal during a downtrend?',
    quizOptions: [
      'Price closed above the most recent Lower High (first upside shift)',
      'Price wicked below a support line and closed lower',
      'RSI stayed flat at 50',
    ],
    correctIndex: 0,
  },
  {
    id: 'lesson-gold-macro',
    level: 'Intermediate',
    duration: '5 min',
    practiceSymbol: 'OANDA:XAUUSD',
    practiceLabel: 'XAU/USD Gold',
    title: '03. Trading Gold Around CPI, PCE & FOMC',
    summary:
      'Understand how US inflation releases, Treasury yields, and Federal Reserve rate decisions move Spot Gold.',
    points: [
      'Hotter CPI/PCE inflation often lifts yields and pressures Gold short-term.',
      'Dovish FOMC guidance or weaker ISM PMI data frequently fuels Gold upside breakouts.',
      'Avoid market orders in the first 60 seconds of a news spike; wait for spread normalization.',
    ],
    quizQuestion: 'Why wait 1–5 minutes after FOMC/CPI prints before entering Gold?',
    quizOptions: [
      'To let initial spike spreads and liquidity sweeps settle',
      'Because charts stop updating after news',
      'Because Gold only trades on weekends',
    ],
    correctIndex: 0,
  },
  {
    id: 'lesson-risk-rr',
    level: 'Beginner',
    duration: '5 min',
    practiceSymbol: 'FOREXCOM:SPXUSD',
    practiceLabel: 'S&P 500',
    title: '04. 1:2 Risk-to-Reward & Stop Loss Placement',
    summary:
      'Protect account equity with structural invalidation stops and fixed fractional position sizing.',
    points: [
      'Anchor Stop Loss beyond the invalidation swing (below HL for longs, above LH for shorts).',
      'Targeting at least 1:2 Risk-to-Reward means winning only 40% of trades remains profitable.',
      'Use 14-period ATR to confirm your stop has breathing room outside routine noise.',
    ],
    quizQuestion: 'With a 1:2 Risk-to-Reward ratio, what win rate breaks even?',
    quizOptions: ['66.7%', '50.0%', '33.3%'],
    correctIndex: 2,
  },
];

const COMPLETED_STORAGE_KEY = 'vp_academy_completed_v1';

export const AcademyView: React.FC<AcademyViewProps> = ({ onOpenPairInTerminal }) => {
  const [selectedLevel, setSelectedLevel] = useState<'All' | AcademyLesson['level']>('All');
  const [activeLessonId, setActiveLessonId] = useState<string>(LESSONS[0].id);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [completedIds, setCompletedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(COMPLETED_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(completedIds));
    } catch {
      // ignore storage errors
    }
  }, [completedIds]);

  const filteredLessons = LESSONS.filter(
    (l) => selectedLevel === 'All' || l.level === selectedLevel
  );
  const activeLesson = LESSONS.find((l) => l.id === activeLessonId) ?? LESSONS[0];
  const progressPct = Math.round((completedIds.length / LESSONS.length) * 100);
  const chosenOption = selectedAnswers[activeLesson.id];

  const handleChooseAnswer = (lesson: AcademyLesson, idx: number) => {
    setSelectedAnswers((prev) => ({ ...prev, [lesson.id]: idx }));
    if (idx === lesson.correctIndex && !completedIds.includes(lesson.id)) {
      setCompletedIds((prev) => [...prev, lesson.id]);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-24 md:pb-8">
      {/* Progress Overview + Level Filter */}
      <section className="rounded-2xl border border-[#2B3139] bg-[#12161C] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#848E9C]">
              <GraduationCap className="h-4 w-4 text-[#F0B90B]" />
              <span className="font-bold text-[#F0B90B]">SMC &amp; TRADING ACADEMY</span>
              <span aria-hidden="true">·</span>
              <span>
                {completedIds.length}/{LESSONS.length} Completed
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#EAECEF]">
              Master Market Structure, BOS/CHoCH &amp; Risk Management
            </h1>
          </div>

          <div className="w-full sm:w-56 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono-tabular">
              <span className="text-[#848E9C]">Track Progress</span>
              <span className="font-bold text-[#00C087]">{progressPct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#1E2329] overflow-hidden">
              <div
                className="h-full bg-[#00C087] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(['All', 'Beginner', 'Intermediate', 'Pro SMC'] as const).map((lvl) => {
            const active = selectedLevel === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setSelectedLevel(lvl)}
                className="min-h-[34px] rounded-lg px-3 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                style={{
                  backgroundColor: active ? '#F0B90B' : '#1E2329',
                  color: active ? '#0B0E11' : '#848E9C',
                }}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </section>

      {/* Curriculum List + Active Lesson Reader */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5 space-y-2.5">
          {filteredLessons.map((lesson) => {
            const isSelected = lesson.id === activeLesson.id;
            const isDone = completedIds.includes(lesson.id);
            return (
              <button
                key={lesson.id}
                type="button"
                onClick={() => setActiveLessonId(lesson.id)}
                className="w-full text-left rounded-2xl border p-4 transition-colors cursor-pointer space-y-1.5"
                style={{
                  backgroundColor: isSelected ? '#1E2329' : '#12161C',
                  borderColor: isSelected ? '#F0B90B' : '#2B3139',
                }}
              >
                <div className="flex items-center justify-between gap-2 text-xs font-mono-tabular">
                  <div className="flex items-center gap-2 text-[#848E9C]">
                    <span className="font-bold text-[#F0B90B]">{lesson.level}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {lesson.duration}
                    </span>
                  </div>
                  {isDone && (
                    <span className="inline-flex items-center gap-1 font-bold text-[#00C087]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Done
                    </span>
                  )}
                </div>

                <h2 className="text-sm sm:text-[15px] font-bold text-[#EAECEF] leading-snug">
                  {lesson.title}
                </h2>
                <p className="text-xs text-[#848E9C] line-clamp-2">{lesson.summary}</p>
              </button>
            );
          })}
        </div>

        {/* Active Lesson Reader & Quick Check */}
        <section className="lg:col-span-7 rounded-2xl border border-[#2B3139] bg-[#12161C] p-5 space-y-5">
          <div className="space-y-2 border-b border-[#2B3139] pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular text-[#848E9C]">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#F0B90B]">
                <BookOpen className="h-3.5 w-3.5" />
                {activeLesson.level} · {activeLesson.duration}
              </span>
              <button
                type="button"
                onClick={() => onOpenPairInTerminal(activeLesson.practiceSymbol)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#F0B90B] px-3 text-xs font-bold text-[#0B0E11] cursor-pointer"
              >
                <CandlestickChart className="h-3.5 w-3.5" />
                <span>Practice {activeLesson.practiceLabel}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#EAECEF]">{activeLesson.title}</h2>
            <p className="text-sm text-[#848E9C] leading-relaxed">{activeLesson.summary}</p>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#848E9C]">
              Key Desk Rules
            </h3>
            <ul className="space-y-2">
              {activeLesson.points.map((pt, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-[#2B3139] bg-[#1E2329] px-3.5 py-2.5 text-xs sm:text-sm text-[#EAECEF] leading-relaxed"
                >
                  {pt}
                </li>
              ))}
            </ul>
          </div>

          {/* Interactive Knowledge Check */}
          <div className="space-y-3 pt-3 border-t border-[#2B3139]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#F0B90B]">
              Quick Knowledge Check
            </h3>
            <p className="text-sm font-semibold text-[#EAECEF]">{activeLesson.quizQuestion}</p>

            <div className="space-y-2">
              {activeLesson.quizOptions.map((opt, idx) => {
                const picked = chosenOption === idx;
                const isCorrect = idx === activeLesson.correctIndex;
                let borderColor = '#2B3139';
                let bg = '#1E2329';
                if (chosenOption !== undefined) {
                  if (isCorrect) {
                    borderColor = '#00C087';
                    bg = 'rgba(0, 192, 135, 0.12)';
                  } else if (picked) {
                    borderColor = '#F6465D';
                    bg = 'rgba(246, 70, 93, 0.12)';
                  }
                }
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleChooseAnswer(activeLesson, idx)}
                    className="w-full min-h-[44px] text-left rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm font-medium text-[#EAECEF] cursor-pointer transition-colors"
                    style={{ backgroundColor: bg, borderColor }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
