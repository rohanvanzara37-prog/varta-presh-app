import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  CandlestickSeries,
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Sparkles, TrendingUp, TrendingDown, Zap, CheckCircle2 } from 'lucide-react';
import type { AppTab, ThemeMode } from '../types/news';
import type { SmcSymbol, SmcTimeframe } from './ProSmcTerminal';
import {
  DEMO_SYMBOL_SPECS,
  formatUsd,
  type DemoAccountMetrics,
  type DemoPosition,
} from '../utils/demoAccount';
import {
  analyzeChartStructure,
  computeAiScalpAnalysis,
  sanitizeCandles,
  type AiScalpAnalysisState,
  type TerminalCandle,
} from '../utils/chartAnalysis';

interface AiSuiteViewProps {
  onNavigateTab: (tab: AppTab) => void;
  onSelectSymbolAndJump: (tvSymbol: string) => void;
  themeMode?: ThemeMode;
  demoPositions: DemoPosition[];
  demoMetrics: DemoAccountMetrics;
  demoBalance: number;
  onExecuteDemoOrder: (symbol: SmcSymbol, side: 'BUY' | 'SELL', lots: number) => string | null;
  onCloseDemoPosition: (positionId: string) => void;
  onApplyAiSetupToTerminal: (setup: AiScalpAnalysisState, symbol: SmcSymbol) => void;
}

const AI_SUITE_ASSETS: Array<{ symbol: SmcSymbol; tvSymbol: string; label: string; precision: number }> = [
  { symbol: 'XAUUSD', tvSymbol: 'OANDA:XAUUSD', label: 'XAU/USD', precision: 2 },
  { symbol: 'BTCUSDT', tvSymbol: 'BINANCE:BTCUSDT', label: 'BTC/USD', precision: 2 },
  { symbol: 'ETHUSDT', tvSymbol: 'BINANCE:ETHUSDT', label: 'ETH/USD', precision: 2 },
  { symbol: 'EURUSD', tvSymbol: 'FX:EURUSD', label: 'EUR/USD', precision: 4 },
];

const AI_TIMEFRAMES: SmcTimeframe[] = ['1m', '5m', '15m', '1h'];

export const AiSuiteView: React.FC<AiSuiteViewProps> = ({
  onNavigateTab,
  onSelectSymbolAndJump,
  demoMetrics,
  onExecuteDemoOrder,
  onApplyAiSetupToTerminal,
}) => {
  const [symbol, setSymbol] = useState<SmcSymbol>('XAUUSD');
  const [timeframe, setTimeframe] = useState<SmcTimeframe>('15m');
  const [candles, setCandles] = useState<TerminalCandle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [aiAnalysis, setAiAnalysis] = useState<AiScalpAnalysisState | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [execNotice, setExecNotice] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const priceLinesRef = useRef<Array<ReturnType<ISeriesApi<'Candlestick', Time>['createPriceLine']>>>([]);

  const activeAssetSpec = AI_SUITE_ASSETS.find((a) => a.symbol === symbol) ?? AI_SUITE_ASSETS[0];

  // Initialize Lightweight Chart instance
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#FFFFFF' },
        textColor: '#131722',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(19, 23, 34, 0.04)' },
        horzLines: { color: 'rgba(19, 23, 34, 0.04)' },
      },
      timeScale: {
        borderColor: '#E5E7EB',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#E5E7EB',
        autoScale: true,
        scaleMargins: { top: 0.18, bottom: 0.18 },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#F23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#F23645',
      priceLineVisible: true,
    });

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        chart.resize(Math.floor(rect.width), Math.floor(rect.height));
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  // Fetch candles & run AI analysis
  const loadCandlesAndAnalyze = useCallback(async () => {
    setIsLoading(true);
    const controller = new AbortController();
    try {
      const res = await fetch(`/api/klines?symbol=${symbol}&interval=${timeframe}&limit=220`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = (await res.json()) as { candles?: TerminalCandle[] };
      if (Array.isArray(json.candles) && json.candles.length > 0) {
        const tfSec = timeframe === '1h' ? 3600 : timeframe === '15m' ? 900 : timeframe === '5m' ? 300 : 60;
        const cleaned = sanitizeCandles(json.candles, tfSec);
        setCandles(cleaned);

        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(cleaned);
          chartApiRef.current?.timeScale().fitContent();
        }

        const struct = analyzeChartStructure(cleaned);
        const analysis = computeAiScalpAnalysis(cleaned, struct, timeframe, activeAssetSpec.precision);
        setAiAnalysis(analysis);

        // Visually draw AI lines on the chart
        if (candleSeriesRef.current) {
          for (const line of priceLinesRef.current) {
            try {
              candleSeriesRef.current.removePriceLine(line);
            } catch {
              // ignore
            }
          }
          priceLinesRef.current = [];

          if (analysis?.actionable && analysis.entry !== null) {
            const isBuy = analysis.direction === 'BUY';
            try {
              const entryLine = candleSeriesRef.current.createPriceLine({
                price: analysis.entry,
                color: '#B45309',
                lineWidth: 2,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: `AI Entry (${analysis.direction})`,
              });
              priceLinesRef.current.push(entryLine);

              if (analysis.sl !== null) {
                const slLine = candleSeriesRef.current.createPriceLine({
                  price: analysis.sl,
                  color: '#F23645',
                  lineWidth: 2,
                  lineStyle: LineStyle.Dotted,
                  axisLabelVisible: true,
                  title: 'AI Stop Loss',
                });
                priceLinesRef.current.push(slLine);
              }

              if (analysis.tp1 !== null) {
                const tp1Line = candleSeriesRef.current.createPriceLine({
                  price: analysis.tp1,
                  color: '#089981',
                  lineWidth: 2,
                  lineStyle: LineStyle.Dotted,
                  axisLabelVisible: true,
                  title: 'AI Target (TP1)',
                });
                priceLinesRef.current.push(tp1Line);
              }
            } catch {
              // ignore series unmount
            }
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setIsAnalyzing(false);
    }
  }, [symbol, timeframe, activeAssetSpec.precision]);

  useEffect(() => {
    void loadCandlesAndAnalyze();
  }, [loadCandlesAndAnalyze]);

  const handleRunAnalysisNow = () => {
    setIsAnalyzing(true);
    void loadCandlesAndAnalyze();
  };

  const handleExecuteTrade = () => {
    if (!aiAnalysis || !aiAnalysis.actionable || aiAnalysis.direction === 'WAIT') {
      setExecNotice('No actionable setup to execute right now.');
      return;
    }
    const side: 'BUY' | 'SELL' = aiAnalysis.direction === 'BUY' ? 'BUY' : 'SELL';
    const err = onExecuteDemoOrder(symbol, side, 0.1);
    if (err) {
      setExecNotice(err);
    } else {
      setExecNotice(`Successfully executed Market ${side} 0.10 lot on ${activeAssetSpec.label}!`);
    }
  };

  const decisionLabel = aiAnalysis?.actionable
    ? aiAnalysis.direction === 'BUY'
      ? 'BUY NOW'
      : 'SELL NOW'
    : 'WAIT (No Setup)';

  const decisionColor = aiAnalysis?.actionable
    ? aiAnalysis.direction === 'BUY'
      ? '#089981'
      : '#F23645'
    : '#F59E0B';

  return (
    <div className="mx-auto max-w-7xl px-2.5 sm:px-4 py-2 space-y-2 bg-[#FFFFFF] text-[#131722] h-[calc(100dvh-110px)] md:h-[calc(100dvh-56px)] flex flex-col justify-between overflow-hidden select-none">
      {/* 1. Top Bar (Compact Asset Selector + Timeframe + Analyze Now) */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {AI_SUITE_ASSETS.map((ast) => {
            const active = symbol === ast.symbol;
            return (
              <button
                key={ast.symbol}
                type="button"
                onClick={() => setSymbol(ast.symbol)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer whitespace-nowrap transition-colors ${
                  active ? 'bg-[#131722] text-[#FFFFFF]' : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#64748B] hover:text-[#131722]'
                }`}
              >
                {ast.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[#E5E7EB] rounded-lg p-0.5">
            {AI_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded px-2 py-0.5 text-[10.5px] font-mono-tabular font-bold cursor-pointer ${
                  timeframe === tf ? 'bg-[#131722] text-[#FFFFFF]' : 'text-[#64748B] hover:text-[#131722]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleRunAnalysisNow}
            className="inline-flex items-center gap-1 rounded-lg bg-[#089981] hover:brightness-110 disabled:opacity-60 px-3 py-1.5 text-xs font-bold text-[#FFFFFF] cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#F59E0B]" />
            <span>{isAnalyzing ? 'Scanning...' : '⚡ Analyze Now'}</span>
          </button>
        </div>
      </div>

      {/* 2. Middle (~60% Screen Height — Visual AI Chart with Drawn Lines) */}
      <div
        ref={chartContainerRef}
        className="relative flex-1 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] overflow-hidden min-h-[240px] shadow-xs"
      >
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#FFFFFF]/80 text-xs font-semibold text-[#131722]">
            Loading {activeAssetSpec.label} ({timeframe}) Visual AI Chart...
          </div>
        )}
      </div>

      {/* 3. Bottom (~30% Screen Height — Single Unified AI Signal Box) */}
      <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 space-y-2 shrink-0 shadow-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className="rounded-lg px-2.5 py-1 font-mono-tabular text-xs font-extrabold text-[#FFFFFF] shadow-xs"
              style={{ backgroundColor: decisionColor }}
            >
              {decisionLabel}
            </span>
            <span className="font-mono-tabular text-xs font-bold text-[#131722]">
              Confidence: {aiAnalysis?.score ?? 82}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (aiAnalysis) {
                  onApplyAiSetupToTerminal(aiAnalysis, symbol);
                  onNavigateTab('terminal');
                }
              }}
              className="rounded-lg border border-[#E5E7EB] bg-[#FFFFFF] hover:bg-[#F1F5F9] px-2.5 py-1 text-xs font-bold text-[#131722] cursor-pointer"
            >
              Inspect Terminal ↗
            </button>

            <button
              type="button"
              disabled={!aiAnalysis?.actionable}
              onClick={handleExecuteTrade}
              className="rounded-lg bg-[#131722] hover:bg-[#1E293B] disabled:opacity-45 px-3.5 py-1 text-xs font-bold text-[#FFFFFF] cursor-pointer shadow-sm"
            >
              ⚡ Execute Trade
            </button>
          </div>
        </div>

        {/* Exact Numbers in 1 clean row */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#E5E7EB] bg-[#FFFFFF] px-3 py-1.5 font-mono-tabular text-xs">
          <div>
            <span className="text-[10px] text-[#64748B]">Entry:</span>{' '}
            <strong className="text-[#B45309]">
              {aiAnalysis?.entry !== null && aiAnalysis?.entry !== undefined
                ? aiAnalysis.entry.toFixed(activeAssetSpec.precision)
                : '--.--'}
            </strong>
          </div>
          <div>
            <span className="text-[10px] text-[#64748B]">SL:</span>{' '}
            <strong className="text-[#F23645]">
              {aiAnalysis?.sl !== null && aiAnalysis?.sl !== undefined
                ? aiAnalysis.sl.toFixed(activeAssetSpec.precision)
                : '--.--'}
            </strong>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-[#64748B]">TP1:</span>{' '}
            <strong className="text-[#089981]">
              {aiAnalysis?.tp1 !== null && aiAnalysis?.tp1 !== undefined
                ? aiAnalysis.tp1.toFixed(activeAssetSpec.precision)
                : '--.--'}
            </strong>
          </div>
        </div>

        {/* Short clear reason */}
        <div className="flex items-center justify-between text-[11px] text-[#475569]">
          <span className="truncate">
            <strong>AI Reason:</strong> {aiAnalysis?.reason ?? 'Analyzing order block, FVG, and candlestick rejection levels...'}
          </span>
          {execNotice && <span className="font-bold text-[#089981] truncate ml-2">{execNotice}</span>}
        </div>
      </div>
    </div>
  );
};
