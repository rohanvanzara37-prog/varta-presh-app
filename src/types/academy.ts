export interface AcademyCandle {
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartZoneOverlay {
  id: string;
  label: string;
  startIndex: number;
  endIndex: number;
  low: number;
  high: number;
  sentiment: 'bull' | 'bear' | 'neutral';
}

export interface ProgressiveMcqStep {
  stepNumber: 1 | 2 | 3;
  question: string;
  targetCandleIndex: number;
  targetZoneId: string;
  options: [
    { id: string; label: string },
    { id: string; label: string },
    { id: string; label: string },
  ];
  correctOptionId: string;
  explanation: string;
}

export interface AcademyScenario {
  id: string;
  order: number;
  symbol: string;
  timeframe: string;
  title: string;
  decimals: number;
  candles: AcademyCandle[];
  zones: ChartZoneOverlay[];
  steps: [ProgressiveMcqStep, ProgressiveMcqStep, ProgressiveMcqStep];
}
