export interface AcademyCandle {
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type AcademyPatternType = 'BOS' | 'OB' | 'FVG';
export type AcademyDirection = 'BUY' | 'SELL';
export type AcademyDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface AcademyScenario {
  id: string;
  order: number;
  symbol: string;
  tvSymbol: string;
  timeframe: string;
  difficulty: AcademyDifficulty;
  title: string;
  decimals: number;
  candles: AcademyCandle[];
  futureCandles: AcademyCandle[];
  setup: {
    correctPattern: AcademyPatternType;
    correctDirection: AcademyDirection;
    entry: number;
    tp: number;
    sl: number;
    pointsGain: number;
    pointsLoss: number;
    explanation: string;
    mentorAnnotation: string;
  };
}
