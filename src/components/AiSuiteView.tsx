import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Download,
  History,
  MessageSquare,
  Radar,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Volume2,
  XCircle,
} from 'lucide-react';
import type { AppTab, ThemeMode } from '../types/news';
import type { ExecuteOrderOptions, SmcSymbol, SmcTimeframe } from './ProSmcTerminal';
import {
  DEMO_SYMBOL_SPECS,
  formatUsd,
  type DemoAccountMetrics,
  type DemoPosition,
} from '../utils/demoAccount';
import {
  analyzeChartStructure,
  computeAiScalpAnalysis,
  computeMultiTimeframeTrend,
  sanitizeCandles,
  type AiScalpAnalysisState,
  type ChartStructureOverlayData,
  type HtfTrendSummary,
  type TerminalCandle,
} from '../utils/chartAnalysis';
import {
  DEFAULT_CUSTOM_STRATEGY,
  applyCustomStrategyScore,
  buildGhostCandles,
  computeFibConfluence,
  computeZoneMitigations,
  exportTredauraCardPng,
  findHistoricalTwin,
  generateCoPilotSuggestions,
  scanOpportunityRadar,
  speakBriefingText,
  type CustomStrategyFlags,
  type OpportunityRadarItem,
} from '../utils/institutionalEngine';
import { loadCachedCalendarEvents } from '../utils/newsCalendarFallback';
import { ChartCanvasOverlay } from './ChartCanvasOverlay';

interface AiSuiteViewProps {
  onNavigateTab: (tab: AppTab) => void;
  onSelectSymbolAndJump: (tvSymbol: string) => void;
  themeMode?: ThemeMode;
  demoPositions: DemoPosition[];
  demoMetrics: DemoAccountMetrics;
  demoBalance: number;
  onExecuteDemoOrder: (
    symbol: SmcSymbol,
    side: 'BUY' | 'SELL',
    lots: number,
    opts?: ExecuteOrderOptions
  ) => string | null;
  onPlaceLimitOrder?: (
    symbol: SmcSymbol,
    side: 'BUY' | 'SELL',
    lots: number,
    limitPrice: number,
    tp?: number,
    sl?: number,
    label?: string
  ) => string | null;
  onPartialCloseDemoPosition?: (positionId: string, pct: 0.25 | 0.5) => void;
  onUpdateDemoPositionTpSl?: (positionId: string, tp: number | undefined, sl: number | undefined) => void;
  onCloseDemoPosition: (positionId: string) => void;
  onApplyAiSetupToTerminal: (setup: AiScalpAnalysisState, symbol: SmcSymbol) => void;
}

const AI_SUITE_ASSETS: Array<{ symbol: SmcSymbol; tvSymbol: string; label: string; precision: number }> = [
  { symbol: 'XAUUSD', tvSymbol: 'OANDA:XAUUSD', label: 'XAU/USD', precision: 2 },
  { symbol: 'BTCUSDT', tvSymbol: 'BINANCE:BTCUSDT', label: 'BTC/USD', precision: 2 },
  { symbol: 'ETHUSDT', tvSymbol: 'BINANCE:ETHUSDT', label: 'ETH/USD', precision: 2 },
  { symbol: 'EURUSD', tvSymbol: 'FX:EURUSD', label: 'EUR/USD', precision: 4 },
  { symbol: 'US30', tvSymbol: 'TVC:DJI', label: 'US30', precision: 2 },
];

const AI_TIMEFRAMES: SmcTimeframe[] = ['1m', '5m', '15m', '1h', '4h'];

const TF_SEC: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
};

function buildDeterministicCandles(sym: SmcSymbol, timeframe: SmcTimeframe): TerminalCandle[] {
  const spec = DEMO_SYMBOL_SPECS[sym] ?? DEMO_SYMBOL_SPECS.XAUUSD;
  const base = spec.defaultPrice;
  const tfSec = TF_SEC[timeframe] ?? 900;
  const nowSec = Math.floor(Math.floor(Date.now() / 1000) / tfSec) * tfSec;
  const out: TerminalCandle[] = [];
  let curr = base * 0.996;
  const seedOffset = sym.charCodeAt(0) * 0.37;
  for (let i = 180; i >= 0; i--) {
    const t = (nowSec - i * tfSec) as UTCTimestamp;
    const wave = Math.sin(i * 0.14 + seedOffset) * base * 0.0014 + Math.cos(i * 0.05) * base * 0.0009;
    const trendStep = base * 0.000025;
    const open = curr;
    const close = Number((open + wave * 0.35 + trendStep).toFixed(spec.precision));
    const wick = Math.abs(wave) * 0.45 + base * 0.0005;
    const high = Number((Math.max(open, close) + wick).toFixed(spec.precision));
    const low = Number((Math.min(open, close) - wick * 0.9).toFixed(spec.precision));
    out.push({
      time: t,
      open,
      high,
      low,
      close,
      volume: Math.round(900 + Math.abs(Math.sin(i * 0.3)) * 1800),
    });
    curr = close;
  }
  return out;
}

function getCandleRemainingSec(timeframe: SmcTimeframe): number {
  const tfSec = TF_SEC[timeframe] ?? 900;
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.max(0, tfSec - (nowSec % tfSec));
}

function formatMmSs(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export const AiSuiteView: React.FC<AiSuiteViewProps> = ({
  onNavigateTab,
  themeMode = 'dark',
  demoPositions,
  onExecuteDemoOrder,
  onPlaceLimitOrder,
  onPartialCloseDemoPosition,
  onUpdateDemoPositionTpSl,
  onCloseDemoPosition,
  onApplyAiSetupToTerminal,
}) => {
  const [symbol, setSymbol] = useState<SmcSymbol>('XAUUSD');
  const [timeframe, setTimeframe] = useState<SmcTimeframe>('15m');
  const [candles, setCandles] = useState<TerminalCandle[]>([]);
  const [structureOverlay, setStructureOverlay] = useState<ChartStructureOverlayData | null>(null);
  const [htfSummary, setHtfSummary] = useState<HtfTrendSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [aiAnalysis, setAiAnalysis] = useState<AiScalpAnalysisState | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [execNotice, setExecNotice] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [activeSubTab, setActiveSubTab] = useState<'plan' | 'mtf' | 'strategy' | 'chat'>('plan');
  const [strategyFlags, setStrategyFlags] = useState<CustomStrategyFlags>(DEFAULT_CUSTOM_STRATEGY);
  const [radarItems, setRadarItems] = useState<OpportunityRadarItem[]>([]);
  const [countdownSec, setCountdownSec] = useState<number>(() => getCandleRemainingSec('15m'));

  const [chatQuestion, setChatQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const overlayRedrawRef = useRef<(() => void) | null>(null);
  const priceLinesRef = useRef<Array<ReturnType<ISeriesApi<'Candlestick', Time>['createPriceLine']>>>([]);

  const activeAssetSpec = AI_SUITE_ASSETS.find((a) => a.symbol === symbol) ?? AI_SUITE_ASSETS[0];
  const isDark = themeMode === 'dark';

  // Live Sniper Candle Close Countdown
  useEffect(() => {
    setCountdownSec(getCandleRemainingSec(timeframe));
    const timer = window.setInterval(() => {
      setCountdownSec(getCandleRemainingSec(timeframe));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timeframe]);

  // Initialize Lightweight Chart instance
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#060911' : '#FFFFFF' },
        textColor: isDark ? '#FFFFFF' : '#131722',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(19,23,34,0.045)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(19,23,34,0.045)' },
      },
      timeScale: {
        borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#E5E7EB',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
      },
      rightPriceScale: {
        borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#E5E7EB',
        autoScale: true,
        scaleMargins: { top: 0.16, bottom: 0.16 },
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

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      overlayRedrawRef.current?.();
    });

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        chart.resize(Math.floor(rect.width), Math.floor(rect.height));
        overlayRedrawRef.current?.();
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

  // Sync themeMode to chart dynamically without destroying zoom
  useEffect(() => {
    chartApiRef.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#060911' : '#FFFFFF' },
        textColor: isDark ? '#FFFFFF' : '#131722',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(19,23,34,0.045)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(19,23,34,0.045)' },
      },
      timeScale: { borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#E5E7EB' },
      rightPriceScale: { borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : '#E5E7EB' },
    });
    overlayRedrawRef.current?.();
  }, [isDark]);

  const fetchSymbolCandles = useCallback(
    async (sym: SmcSymbol, tf: SmcTimeframe, signal?: AbortSignal): Promise<TerminalCandle[]> => {
      const tfSec = TF_SEC[tf] ?? 900;
      let raw: TerminalCandle[] = [];
      try {
        const res = await fetch(`/api/klines?symbol=${sym}&interval=${tf}&limit=200`, {
          signal,
          cache: 'no-store',
        });
        if (res.ok) {
          const json = (await res.json()) as { candles?: TerminalCandle[] };
          if (Array.isArray(json.candles) && json.candles.length > 0) {
            raw = json.candles;
          }
        }
      } catch {
        // fallback below
      }

      if (raw.length === 0 && (sym === 'BTCUSDT' || sym === 'ETHUSDT')) {
        try {
          const binRes = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${tf}&limit=200`,
            { signal }
          );
          if (binRes.ok) {
            const binJson = (await binRes.json()) as [number, string, string, string, string, string][];
            if (Array.isArray(binJson)) {
              raw = binJson.map((d) => ({
                time: Math.floor(d[0] / 1000) as UTCTimestamp,
                open: Number(d[1]),
                high: Number(d[2]),
                low: Number(d[3]),
                close: Number(d[4]),
                volume: Number(d[5]),
              }));
            }
          }
        } catch {
          // fallback below
        }
      }

      if (raw.length === 0) {
        raw = buildDeterministicCandles(sym, tf);
      }

      return sanitizeCandles(raw, tfSec);
    },
    []
  );

  // Fetch candles, MTF bias, & run deep SMC analysis
  const loadCandlesAndAnalyze = useCallback(async () => {
    setIsLoading(true);
    const controller = new AbortController();
    try {
      const [mainRes, r15m, r1h, r4h] = await Promise.allSettled([
        fetchSymbolCandles(symbol, timeframe, controller.signal),
        fetchSymbolCandles(symbol, '15m', controller.signal),
        fetchSymbolCandles(symbol, '1h', controller.signal),
        fetchSymbolCandles(symbol, '4h', controller.signal),
      ]);

      const cleaned =
        mainRes.status === 'fulfilled' && mainRes.value.length > 0
          ? mainRes.value
          : buildDeterministicCandles(symbol, timeframe);

      setCandles(cleaned);

      const c15m = r15m.status === 'fulfilled' && r15m.value.length > 0 ? r15m.value : cleaned;
      const c1h = r1h.status === 'fulfilled' && r1h.value.length > 0 ? r1h.value : cleaned;
      const c4h = r4h.status === 'fulfilled' && r4h.value.length > 0 ? r4h.value : c1h;
      const mtfBias = computeMultiTimeframeTrend(c15m, c4h.length > 30 ? c4h : c1h, timeframe);
      setHtfSummary(mtfBias);

      if (cleaned.length > 0) {
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(cleaned);
          chartApiRef.current?.timeScale().fitContent();
        }

        const struct = analyzeChartStructure(cleaned);
        setStructureOverlay(struct);
        const analysis = computeAiScalpAnalysis(
          cleaned,
          struct,
          timeframe,
          activeAssetSpec.precision,
          mtfBias
        );
        setAiAnalysis(analysis);

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
            try {
              const specs = [
                { price: analysis.entry, color: '#F59E0B', style: LineStyle.Dashed, title: `AI Entry` },
                ...(analysis.sl !== null
                  ? [{ price: analysis.sl, color: '#F23645', style: LineStyle.Dotted, title: 'Tight SL' }]
                  : []),
                ...(analysis.tp1 !== null
                  ? [{ price: analysis.tp1, color: '#089981', style: LineStyle.Dotted, title: 'TP1' }]
                  : []),
                ...(analysis.tp2 !== null
                  ? [{ price: analysis.tp2, color: '#10B981', style: LineStyle.Dashed, title: 'TP2' }]
                  : []),
              ];
              for (const sp of specs) {
                const line = candleSeriesRef.current.createPriceLine({
                  price: sp.price,
                  color: sp.color,
                  lineWidth: 1,
                  lineStyle: sp.style,
                  axisLabelVisible: true,
                  title: sp.title,
                });
                priceLinesRef.current.push(line);
              }
            } catch {
              // ignore series unmount
            }
          }
        }
        window.requestAnimationFrame(() => overlayRedrawRef.current?.());
      }
    } catch {
      const fb = buildDeterministicCandles(symbol, timeframe);
      setCandles(fb);
      const struct = analyzeChartStructure(fb);
      setStructureOverlay(struct);
      setAiAnalysis(computeAiScalpAnalysis(fb, struct, timeframe, activeAssetSpec.precision));
    } finally {
      setIsLoading(false);
      setIsAnalyzing(false);
    }
  }, [symbol, timeframe, activeAssetSpec.precision, fetchSymbolCandles]);

  useEffect(() => {
    void loadCandlesAndAnalyze();
  }, [loadCandlesAndAnalyze]);

  // Listen for top-bar chart refresh button without resetting demo balance/trades
  useEffect(() => {
    const onRefresh = () => {
      void loadCandlesAndAnalyze();
    };
    window.addEventListener('tredaura-refresh-charts', onRefresh);
    return () => window.removeEventListener('tredaura-refresh-charts', onRefresh);
  }, [loadCandlesAndAnalyze]);

  // Keep AI Suite chart ticks live (WebSocket for crypto, live backend/micro-tick pulse for all pairs)
  useEffect(() => {
    let disposed = false;
    const isCrypto = symbol === 'BTCUSDT' || symbol === 'ETHUSDT';
    let ws: WebSocket | null = null;
    const tfSec = TF_SEC[timeframe] ?? 900;

    const pushLiveClose = (nextCloseRaw: number, candleTime?: number) => {
      if (disposed || !Number.isFinite(nextCloseRaw) || nextCloseRaw <= 0) return;
      const prec = activeAssetSpec.precision;
      const nextClose = Number(nextCloseRaw.toFixed(prec));
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const bucket = (
          candleTime
            ? Math.floor(candleTime / tfSec) * tfSec
            : Math.floor(Math.floor(Date.now() / 1000) / tfSec) * tfSec
        ) as UTCTimestamp;
        const updatedBar: TerminalCandle =
          bucket > last.time
            ? {
                time: bucket,
                open: last.close,
                high: Math.max(last.close, nextClose),
                low: Math.min(last.close, nextClose),
                close: nextClose,
                volume: 950,
              }
            : {
                ...last,
                high: Math.max(last.high, nextClose),
                low: Math.min(last.low, nextClose),
                close: nextClose,
              };
        candleSeriesRef.current?.update({
          time: updatedBar.time,
          open: updatedBar.open,
          high: updatedBar.high,
          low: updatedBar.low,
          close: updatedBar.close,
        });
        return bucket > last.time ? [...prev.slice(-199), updatedBar] : [...prev.slice(0, -1), updatedBar];
      });
    };

    if (isCrypto) {
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${timeframe}`);
        ws.onmessage = (ev) => {
          if (disposed) return;
          try {
            const k = (JSON.parse(ev.data as string) as { k?: { t: number; c: string } })?.k;
            if (!k) return;
            pushLiveClose(Number.parseFloat(k.c), Math.floor(k.t / 1000));
          } catch {
            // ignore
          }
        };
      } catch {
        // ignore WS error
      }
    }

    const pollTimer = window.setInterval(async () => {
      if (disposed || isCrypto) return;
      try {
        const res = await fetch(`/api/klines?symbol=${symbol}&interval=${timeframe}&limit=5`, { cache: 'no-store' });
        if (!res.ok || disposed) return;
        const json = (await res.json()) as { candles?: TerminalCandle[] };
        const latest = json.candles?.[json.candles.length - 1];
        if (latest && Number.isFinite(latest.close)) {
          pushLiveClose(latest.close, Number(latest.time));
        }
      } catch {
        // ignore transient network errors
      }
    }, 3500);

    return () => {
      disposed = true;
      window.clearInterval(pollTimer);
      ws?.close();
    };
  }, [symbol, timeframe, activeAssetSpec.precision]);

  // Scan Multi-Pair Opportunity Radar in background
  useEffect(() => {
    let disposed = false;
    const scanAll = async () => {
      const snapshots = await Promise.all(
        AI_SUITE_ASSETS.map(async (ast) => ({
          symbol: ast.symbol,
          label: ast.label,
          candles: await fetchSymbolCandles(ast.symbol, '15m'),
        }))
      );
      if (!disposed) {
        setRadarItems(scanOpportunityRadar(snapshots));
      }
    };
    void scanAll();
    const timer = window.setInterval(() => void scanAll(), 45_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [fetchSymbolCandles]);

  const fibData = useMemo(
    () => computeFibConfluence(candles, activeAssetSpec.precision),
    [candles, activeAssetSpec.precision]
  );
  const zoneMitigations = useMemo(
    () => computeZoneMitigations(candles, structureOverlay),
    [candles, structureOverlay]
  );
  const ghostPath = useMemo(
    () => buildGhostCandles(candles, aiAnalysis, activeAssetSpec.precision),
    [candles, aiAnalysis, activeAssetSpec.precision]
  );
  const historicalTwin = useMemo(() => findHistoricalTwin(candles), [candles]);
  const customVerdict = useMemo(
    () => applyCustomStrategyScore(aiAnalysis, strategyFlags),
    [aiAnalysis, strategyFlags]
  );

  // Derived TP3 & Optimal Limit Entry (50% of latest active OB or midpoint)
  const { tp3Price, rrText, optimalLimitPrice } = useMemo(() => {
    const entry = aiAnalysis?.entry;
    const sl = aiAnalysis?.sl;
    const tp2 = aiAnalysis?.tp2;
    const prec = activeAssetSpec.precision;
    if (entry === null || entry === undefined || sl === null || sl === undefined) {
      return { tp3Price: null, rrText: '1:2.5', optimalLimitPrice: null };
    }
    const risk = Math.max(1e-6, Math.abs(entry - sl));
    const dir = aiAnalysis?.direction === 'SELL' ? -1 : 1;
    const tp3 = Number((entry + dir * risk * 3.5).toFixed(prec));
    const reward = tp2 ? Math.abs(tp2 - entry) : risk * 2.5;
    const rr = (reward / risk).toFixed(1);

    const activeZone =
      structureOverlay?.orderBlocks.find((ob) =>
        dir === 1 ? ob.type === 'Bullish' && !ob.mitigated : ob.type === 'Bearish' && !ob.mitigated
      ) ??
      structureOverlay?.fvgs.find((f) =>
        dir === 1 ? f.type === 'Bullish' && !f.mitigated : f.type === 'Bearish' && !f.mitigated
      );
    const limitPx = activeZone
      ? Number(((activeZone.high + activeZone.low) / 2).toFixed(prec))
      : Number((entry - dir * risk * 0.35).toFixed(prec));

    return { tp3Price: tp3, rrText: `1:${rr}`, optimalLimitPrice: limitPx };
  }, [aiAnalysis, activeAssetSpec.precision, structureOverlay]);

  const livePricesMap = useMemo(() => {
    const map: Partial<Record<SmcSymbol, number>> = {};
    radarItems.forEach((r) => {
      map[r.symbol] = r.price;
    });
    if (candles.length > 0) {
      map[symbol] = candles[candles.length - 1].close;
    }
    return map;
  }, [radarItems, candles, symbol]);

  const coPilotSuggestions = useMemo(
    () => generateCoPilotSuggestions(demoPositions, livePricesMap, candles, symbol),
    [demoPositions, livePricesMap, candles, symbol]
  );

  const handleRunAnalysisNow = () => {
    setIsAnalyzing(true);
    void loadCandlesAndAnalyze();
  };

  const handleExecuteTrade = () => {
    if (!aiAnalysis || !aiAnalysis.actionable || aiAnalysis.direction === 'WAIT') {
      setExecNotice('Waiting for higher confluence setup before executing.');
      return;
    }
    const side: 'BUY' | 'SELL' = aiAnalysis.direction === 'BUY' ? 'BUY' : 'SELL';
    const err = onExecuteDemoOrder(symbol, side, 0.1, {
      tp: aiAnalysis.tp1 ?? undefined,
      sl: aiAnalysis.sl ?? undefined,
      autoBreakeven: true,
      note: `TREDAURA AI ${aiAnalysis.score}%`,
    });
    if (err) {
      setExecNotice(err);
    } else {
      setExecNotice(`Executed ${side} 0.10 on ${activeAssetSpec.label} with TP/SL & +1R Auto-BE!`);
    }
  };

  const handleAutoPlaceOptimalLimit = () => {
    if (!onPlaceLimitOrder || !aiAnalysis || !optimalLimitPrice || aiAnalysis.direction === 'WAIT') {
      setExecNotice('No active OB/FVG limit zone ready right now.');
      return;
    }
    const side: 'BUY' | 'SELL' = aiAnalysis.direction === 'BUY' ? 'BUY' : 'SELL';
    const err = onPlaceLimitOrder(
      symbol,
      side,
      0.1,
      optimalLimitPrice,
      aiAnalysis.tp2 ?? aiAnalysis.tp1 ?? undefined,
      aiAnalysis.sl ?? undefined,
      'AI 50% OB/FVG Sniper'
    );
    if (err) {
      setExecNotice(err);
    } else {
      setExecNotice(
        `Limit ${side} placed @ ${optimalLimitPrice.toFixed(activeAssetSpec.precision)} (50% OB/FVG EQ)`
      );
    }
  };

  const handleSpeakBriefing = () => {
    const dir = aiAnalysis?.direction ?? 'WAIT';
    const px = candles[candles.length - 1]?.close?.toFixed(activeAssetSpec.precision) ?? '--';
    const text =
      lang === 'hi'
        ? `TREDAURA AI briefing ${activeAssetSpec.label} ${timeframe} chart par. Current price ${px} hai. Setup ${dir} hai with ${customVerdict.score} percent confluence. ${aiAnalysis?.reason ?? ''}`
        : `TREDAURA AI Briefing for ${activeAssetSpec.label} on the ${timeframe} chart. Price is ${px}. Direction is ${dir} with ${customVerdict.score}% confluence. ${aiAnalysis?.reason ?? ''}`;
    speakBriefingText(text, lang);
  };

  const handleDownloadShareCard = () => {
    const prec = activeAssetSpec.precision;
    exportTredauraCardPng({
      title: 'TREDAURA AI Setup',
      symbolLabel: activeAssetSpec.label,
      timeframe,
      direction: aiAnalysis?.actionable ? `${aiAnalysis.direction} NOW` : 'WATCHING SETUP',
      confidencePct: customVerdict.score,
      entry: aiAnalysis?.entry ? aiAnalysis.entry.toFixed(prec) : '--',
      sl: aiAnalysis?.sl ? aiAnalysis.sl.toFixed(prec) : '--',
      tp1: aiAnalysis?.tp1 ? aiAnalysis.tp1.toFixed(prec) : '--',
      tp2: aiAnalysis?.tp2 ? aiAnalysis.tp2.toFixed(prec) : '--',
      thesis: aiAnalysis?.reason ?? 'Multi-timeframe SMC Liquidity + Order Block confluence setup.',
      filename: `tredaura-${symbol.toLowerCase()}-${timeframe}.png`,
    });
    setExecNotice('Exported TREDAURA AI PNG setup card!');
  };

  const handleAskAiChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = chatQuestion.trim();
    if (!q || chatLoading) return;
    setChatQuestion('');
    setChatMessages((prev) => [...prev, { role: 'user', text: q }]);
    setChatLoading(true);

    const lastPx = candles[candles.length - 1]?.close ?? DEMO_SYMBOL_SPECS[symbol].defaultPrice;
    try {
      const res = await fetch('/api/ai-deep-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: activeAssetSpec.label,
          timeframe,
          price: lastPx,
          trend: htfSummary?.bias === 'BULLISH' ? 1 : htfSummary?.bias === 'BEARISH' ? -1 : 0,
          score: customVerdict.score,
          direction: aiAnalysis?.direction ?? 'BUY',
          question: q,
          lang,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          institutionalThesis?: string;
          riskNote?: string;
          verdict?: string;
        };
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'ai',
            text: `${data.verdict ?? ''} — ${data.institutionalThesis ?? ''} (${data.riskNote ?? ''})`,
          },
        ]);
        return;
      }
    } catch {
      // use local fallback below
    } finally {
      setChatLoading(false);
    }

    // Instant deterministic institutional reply fallback
    const localReply =
      lang === 'hi'
        ? `${activeAssetSpec.label} (${timeframe}) par bias ${htfSummary?.label ?? 'Neutral'} hai. Optimal zone ${optimalLimitPrice?.toFixed(activeAssetSpec.precision) ?? lastPx.toFixed(activeAssetSpec.precision)} par hai; tight SL ${aiAnalysis?.sl?.toFixed(activeAssetSpec.precision) ?? '--'} ke sath 1% se kam risk rakhein.`
        : `On ${activeAssetSpec.label} (${timeframe}), HTF structure is ${htfSummary?.label ?? 'Balanced'} with ${customVerdict.score}% confluence. Key mitigation level is near ${optimalLimitPrice?.toFixed(activeAssetSpec.precision) ?? lastPx.toFixed(activeAssetSpec.precision)} with strict SL at ${aiAnalysis?.sl?.toFixed(activeAssetSpec.precision) ?? '--'}.`;
    setChatMessages((prev) => [...prev, { role: 'ai', text: localReply }]);
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

  const latestClose = candles[candles.length - 1]?.close ?? null;
  const sniperTriggered = Boolean(aiAnalysis?.actionable && customVerdict.score >= 75);
  const currentTfLabel = timeframe === '1h' ? '1H' : timeframe === '4h' ? '4H' : timeframe;
  const newsShieldAlert = useMemo(() => {
    const nowMs = Date.now();
    const events = loadCachedCalendarEvents();
    const matched = events.find((ev) => {
      if (ev.impact !== 'High') return false;
      const cur = ev.currency.toUpperCase();
      if (cur !== 'USD' && cur !== 'XAU') return false;
      return ev.timestampMs >= nowMs - 2 * 60_000 && ev.timestampMs <= nowMs + 15 * 60_000;
    });
    if (!matched) return null;
    const minsLeft = Math.max(0, Math.min(15, Math.ceil((matched.timestampMs - nowMs) / 60_000)));
    return {
      event: matched,
      bannerText: `⚠ High-Impact News in ${minsLeft > 0 ? `${minsLeft}m` : '15m'} — High Slippage Risk`,
    };
  }, [symbol, timeframe]);

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4 py-1.5 space-y-2 bg-[var(--vp-canvas)] text-[var(--vp-text)] min-h-[calc(100dvh-110px)] md:min-h-[calc(100dvh-56px)] flex flex-col overflow-x-hidden">
      {/* 1. Multi-Pair Opportunity Radar Strip */}
      <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] px-2.5 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--vp-accent-text)] shrink-0">
            <Radar className="h-3.5 w-3.5" />
            Radar
          </span>
          {(radarItems.length > 0
            ? radarItems
            : AI_SUITE_ASSETS.map((a) => ({
                symbol: a.symbol,
                label: a.label,
                direction: 'WAIT' as const,
                score: 60,
                grade: 'SCAN',
                price: DEMO_SYMBOL_SPECS[a.symbol].defaultPrice,
                reason: '',
              }))
          ).map((item) => {
            const active = item.symbol === symbol;
            const col =
              item.direction === 'BUY' ? '#089981' : item.direction === 'SELL' ? '#F23645' : '#F59E0B';
            return (
              <button
                key={item.symbol}
                type="button"
                onClick={() => setSymbol(item.symbol)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-mono-tabular whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'border-[#F59E0B] bg-[#F59E0B]/12 text-[var(--vp-text)]'
                    : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
                }`}
              >
                <span className="font-bold text-[var(--vp-text)]">{item.label}</span>
                <span className="font-extrabold" style={{ color: col }}>
                  {item.direction} {item.score}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Top Controls: Asset Selector + Timeframes + EN/HI + Voice + Analyze Now */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] px-2.5 py-1.5 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {AI_SUITE_ASSETS.map((ast) => {
            const active = symbol === ast.symbol;
            return (
              <button
                key={ast.symbol}
                type="button"
                onClick={() => setSymbol(ast.symbol)}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]'
                    : 'bg-[var(--vp-elevated)] border border-[var(--vp-border)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
                }`}
              >
                {ast.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-0.5 bg-[var(--vp-elevated)] border border-[var(--vp-border)] rounded-lg p-0.5">
            {AI_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded px-2 py-0.5 text-[10px] font-mono-tabular font-bold cursor-pointer ${
                  timeframe === tf
                    ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]'
                    : 'text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setLang((l) => (l === 'en' ? 'hi' : 'en'))}
            className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2 py-1 text-[10px] font-bold text-[var(--vp-text)] cursor-pointer"
          >
            {lang.toUpperCase()}
          </button>

          <button
            type="button"
            onClick={handleSpeakBriefing}
            title="Play 10-sec Audio Briefing"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-accent-text)] cursor-pointer"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleRunAnalysisNow}
            className="inline-flex items-center gap-1 rounded-lg bg-[#089981] hover:brightness-110 disabled:opacity-60 px-2.5 py-1 text-[11px] font-bold text-[#FFFFFF] cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Sparkles className="h-3 w-3 text-[#F59E0B]" />
            <span>{isAnalyzing ? 'Scanning...' : 'Analyze Now'}</span>
          </button>
        </div>
      </div>

      {/* 3. Live Open-Trade AI Co-Pilot Banner */}
      {coPilotSuggestions.length > 0 && (
        <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1.5 space-y-1 shrink-0">
          {coPilotSuggestions.map((cp) => {
            const pos = demoPositions.find((p) => p.id === cp.positionId);
            return (
              <div
                key={cp.positionId}
                className="flex items-center justify-between gap-2 text-[10.5px] flex-wrap"
              >
                <span className="font-semibold text-[var(--vp-text)]">
                  <strong className="text-[#F59E0B]">AI Co-Pilot:</strong> {cp.suggestion}
                </span>
                {pos && (
                  <div className="flex items-center gap-1 shrink-0">
                    {cp.action === 'MOVE_BE' && (
                      <button
                        type="button"
                        onClick={() => onUpdateDemoPositionTpSl?.(pos.id, pos.tp, pos.entryPrice)}
                        className="rounded bg-[#089981] px-2 py-0.5 text-[9.5px] font-bold text-white cursor-pointer"
                      >
                        Move SL to BE
                      </button>
                    )}
                    {cp.action === 'PARTIAL_50' && (
                      <button
                        type="button"
                        onClick={() => onPartialCloseDemoPosition?.(pos.id, 0.5)}
                        className="rounded bg-[#0284C7] px-2 py-0.5 text-[9.5px] font-bold text-white cursor-pointer"
                      >
                        Close 50%
                      </button>
                    )}
                    {cp.action === 'EARLY_EXIT' && (
                      <button
                        type="button"
                        onClick={() => onCloseDemoPosition(pos.id)}
                        className="rounded bg-[#F23645] px-2 py-0.5 text-[9.5px] font-bold text-white cursor-pointer"
                      >
                        Early Exit
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Visual AI Chart Stage with Mitigation %, Fib 50% EQ, Ghost Candles & Sniper Countdown */}
      <div className="relative h-[300px] sm:h-[340px] rounded-xl border border-[var(--vp-border)] bg-[var(--vp-canvas)] overflow-hidden shadow-xs shrink-0">
        <div ref={chartContainerRef} className="absolute inset-0" />

        <ChartCanvasOverlay
          redrawRef={overlayRedrawRef}
          chart={chartApiRef.current}
          candleSeries={candleSeriesRef.current}
          candles={candles}
          symbol={symbol}
          timeframe={timeframe}
          structure={structureOverlay}
          bbUpper={[]}
          bbLower={[]}
          showBollinger={false}
          showVolumeProfile={false}
          showSupportResistance={true}
          showPatterns={true}
          showSwingLabels={false}
          showBosChoch={true}
          showFibWaves={true}
          showGhostCandles={true}
          fibData={fibData}
          zoneMitigations={zoneMitigations}
          ghostPath={ghostPath}
          precision={activeAssetSpec.precision}
          themeMode={themeMode}
          livePrice={latestClose}
          isBullTick={
            candles.length > 0 ? candles[candles.length - 1].close >= candles[candles.length - 1].open : true
          }
        />

        {/* Top-Left Sniper Countdown Pill */}
        <div className="pointer-events-none absolute top-2 left-2 z-20 flex items-center gap-1.5 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-surface)]/92 px-2 py-1 text-[10px] font-mono-tabular shadow-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              sniperTriggered ? 'bg-[#089981] animate-ping' : 'bg-[#F59E0B] animate-pulse'
            }`}
          />
          <span className="font-bold text-[var(--vp-text)]">
            {sniperTriggered
              ? 'SNIPER ENTRY TRIGGERED'
              : `Waiting Candle Close (${formatMmSs(countdownSec)})`}
          </span>
        </div>

        {/* Top-Right 30-Day Win-Rate & Historical Twin Proof */}
        {historicalTwin && (
          <div className="pointer-events-none absolute top-2 right-16 z-20 hidden sm:flex items-center gap-1.5 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-surface)]/92 px-2 py-1 text-[9.5px] font-mono-tabular shadow-sm">
            <ShieldCheck className="h-3 w-3 text-[#089981]" />
            <span className="font-bold text-[var(--vp-text)]">
              30D Win Rate: <strong className="text-[#089981]">{historicalTwin.winRate30dPct}%</strong>
            </span>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--vp-canvas)]/80 text-xs font-semibold text-[var(--vp-text)]">
            Syncing {activeAssetSpec.label} ({timeframe}) Institutional SMC AI Chart...
          </div>
        )}
      </div>

      {/* 5. AI Short-Term Market Analyst Card (Moved from Terminal) */}
      <section
        aria-label="AI Short-Term Market Analyst"
        className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-2.5 sm:p-3 space-y-2 shrink-0"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="h-3.5 w-3.5 text-[var(--vp-accent-text)] shrink-0" />
            <h2 className="text-xs sm:text-[13px] font-bold text-[var(--vp-text)] truncate">
              AI Short-Term Market Analyst
            </h2>
            <span className="rounded border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-1.5 py-0.5 text-[9.5px] font-mono-tabular font-bold text-[var(--vp-muted)] shrink-0">
              {currentTfLabel} · {htfSummary?.label ?? '15m / 1H'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular">
            {aiAnalysis && (
              <>
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold"
                  style={{
                    backgroundColor:
                      aiAnalysis.score >= 75
                        ? 'rgba(8,153,129,0.14)'
                        : aiAnalysis.score >= 50
                          ? 'rgba(245,158,11,0.14)'
                          : 'var(--vp-elevated)',
                    color:
                      aiAnalysis.score >= 75
                        ? '#089981'
                        : aiAnalysis.score >= 50
                          ? '#D97706'
                          : 'var(--vp-muted)',
                  }}
                >
                  {aiAnalysis.score}% Confluence
                </span>
                <span className="text-[10px] font-bold text-[var(--vp-text)] whitespace-nowrap hidden sm:inline">
                  {aiAnalysis.grade}
                </span>
              </>
            )}
            <button
              type="button"
              onClick={handleDownloadShareCard}
              aria-label="Share AI Setup"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--vp-border)] bg-[var(--vp-elevated)] hover:opacity-90 px-2 py-0.5 text-[10px] font-bold text-[var(--vp-text)] cursor-pointer whitespace-nowrap"
            >
              <ArrowUpRight className="h-3 w-3" />
              <span>Share</span>
            </button>
          </div>
        </div>

        {newsShieldAlert && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-2.5 py-1.5 text-[10.5px] font-bold text-[#D97706]"
          >
            <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#D97706]" />
              <span className="truncate">{newsShieldAlert.bannerText}</span>
            </span>
            <span className="font-mono-tabular text-[9.5px] shrink-0">
              {newsShieldAlert.event.currency}
            </span>
          </div>
        )}

        {aiAnalysis ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {aiAnalysis.rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`rounded-lg border px-2 py-1 text-[10px] ${
                    rule.passed
                      ? 'border-[#089981]/35 bg-[#089981]/10'
                      : 'border-[var(--vp-border)] bg-[var(--vp-elevated)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 font-bold text-[var(--vp-text)]">
                    <span className="truncate">{rule.label}</span>
                    {rule.passed ? (
                      <CheckCircle2 className="h-3 w-3 text-[#089981] shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-[var(--vp-muted)] shrink-0" />
                    )}
                  </div>
                  <div
                    className="text-[9.5px] font-mono-tabular truncate mt-0.5"
                    style={{ color: rule.passed ? '#089981' : 'var(--vp-muted)' }}
                  >
                    {rule.detail}
                  </div>
                </div>
              ))}
            </div>

            {aiAnalysis.actionable && aiAnalysis.entry !== null ? (
              <div className="rounded-lg border border-[#089981]/35 bg-[#089981]/8 p-2 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="rounded px-2 py-0.5 text-[10.5px] font-extrabold font-mono-tabular text-[#FFFFFF]"
                      style={{
                        backgroundColor: aiAnalysis.direction === 'BUY' ? '#089981' : '#F23645',
                      }}
                    >
                      SMART SCALP · {aiAnalysis.direction}
                    </span>
                    <span className="text-[10.5px] font-medium text-[var(--vp-text)] truncate">
                      {aiAnalysis.reason}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onApplyAiSetupToTerminal(aiAnalysis, symbol);
                      onNavigateTab('terminal');
                    }}
                    className="rounded-lg bg-[var(--vp-primary)] text-[var(--vp-primary-fg)] hover:brightness-110 px-2.5 py-1 text-[10.5px] font-bold cursor-pointer shrink-0 transition-colors"
                  >
                    Apply Setup to Chart
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-md border border-[var(--vp-border)] bg-[var(--vp-canvas)] px-2 py-1 font-mono-tabular text-[10px]">
                  <div className="min-w-0">
                    <span className="block text-[8.5px] uppercase text-[var(--vp-muted)]">Entry</span>
                    <span className="font-bold text-[var(--vp-accent-text)] truncate block">
                      {aiAnalysis.entry.toFixed(activeAssetSpec.precision)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[8.5px] uppercase text-[var(--vp-muted)]">Tight SL</span>
                    <span className="font-bold text-[#F23645] truncate block">
                      {aiAnalysis.sl !== null ? aiAnalysis.sl.toFixed(activeAssetSpec.precision) : '--.--'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[8.5px] uppercase text-[var(--vp-muted)]">TP1 (1.5R)</span>
                    <span className="font-bold text-[#089981] truncate block">
                      {aiAnalysis.tp1 !== null ? aiAnalysis.tp1.toFixed(activeAssetSpec.precision) : '--.--'}
                    </span>
                  </div>
                  <div className="min-w-0 sm:text-right">
                    <span className="block text-[8.5px] uppercase text-[var(--vp-muted)]">TP2 (2.5R)</span>
                    <span className="font-bold text-[#089981] truncate block">
                      {aiAnalysis.tp2 !== null ? aiAnalysis.tp2.toFixed(activeAssetSpec.precision) : '--.--'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold text-[var(--vp-accent-text)]">
                    NO TRADE / WAIT — Market Choppy
                  </p>
                  <p className="text-[10px] text-[var(--vp-muted)] truncate">
                    {aiAnalysis.reason}
                  </p>
                </div>
                <span className="rounded border border-[var(--vp-border)] bg-[var(--vp-surface)] px-2 py-0.5 text-[10px] font-mono-tabular font-bold text-[var(--vp-muted)] shrink-0">
                  Need ≥ 75%
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-3 py-2 text-[11px] text-[var(--vp-muted)]">
            Scanning 15m/1H HTF trend, 20/50 EMA, SMC structure, RSI(14), and candle strength...
          </div>
        )}
      </section>

      {/* 6. Bottom Unified Institutional Trade Plan + Sub-Tabs (Trade Plan / MTF Scan / Strategy / Ask AI) */}
      <div className="rounded-xl border border-[var(--vp-border)] bg-[var(--vp-surface)] p-2.5 sm:p-3 space-y-2.5 shrink-0">
        {/* Sub-Tab Selector */}
        <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[var(--vp-border)] pb-2">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'plan', label: 'Trade Plan', icon: Target },
                { id: 'mtf', label: 'MTF & Twin Proof', icon: History },
                { id: 'strategy', label: 'Strategy Builder', icon: SlidersHorizontal },
                { id: 'chat', label: 'Ask AI Chart', icon: MessageSquare },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)]'
                      : 'bg-[var(--vp-elevated)] text-[var(--vp-muted)] hover:text-[var(--vp-text)]'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 font-mono-tabular">
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-extrabold text-[#FFFFFF]"
              style={{ backgroundColor: decisionColor }}
            >
              {decisionLabel}
            </span>
            <span className="text-[11px] font-bold text-[var(--vp-text)]">
              {customVerdict.score}% · R:R {rrText}
            </span>
          </div>
        </div>

        {activeSubTab === 'plan' && (
          <div className="space-y-2">
            {/* Entry / SL / TP1 / TP2 / TP3 Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-canvas)] px-2 py-1.5 font-mono-tabular text-[10.5px]">
              <div>
                <span className="block text-[9px] text-[var(--vp-muted)]">Entry</span>
                <strong className="text-[#F59E0B]">
                  {aiAnalysis?.entry ? aiAnalysis.entry.toFixed(activeAssetSpec.precision) : '--'}
                </strong>
              </div>
              <div>
                <span className="block text-[9px] text-[var(--vp-muted)]">Tight SL</span>
                <strong className="text-[#F23645]">
                  {aiAnalysis?.sl ? aiAnalysis.sl.toFixed(activeAssetSpec.precision) : '--'}
                </strong>
              </div>
              <div>
                <span className="block text-[9px] text-[var(--vp-muted)]">TP1 (1.5R)</span>
                <strong className="text-[#089981]">
                  {aiAnalysis?.tp1 ? aiAnalysis.tp1.toFixed(activeAssetSpec.precision) : '--'}
                </strong>
              </div>
              <div>
                <span className="block text-[9px] text-[var(--vp-muted)]">TP2 (2.5R)</span>
                <strong className="text-[#089981]">
                  {aiAnalysis?.tp2 ? aiAnalysis.tp2.toFixed(activeAssetSpec.precision) : '--'}
                </strong>
              </div>
              <div className="text-right">
                <span className="block text-[9px] text-[var(--vp-muted)]">TP3 (3.5R)</span>
                <strong className="text-[#10B981]">
                  {tp3Price ? tp3Price.toFixed(activeAssetSpec.precision) : '--'}
                </strong>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--vp-muted)] flex-wrap">
              <p className="truncate flex-1 min-w-[200px]">
                <strong className="text-[var(--vp-text)]">AI Thesis:</strong>{' '}
                {aiAnalysis?.reason ?? 'Scanning MTF trend, liquidity pools, Order Blocks, and Fair Value Gaps...'}
              </p>
              {execNotice && <span className="font-bold text-[#089981] text-[10.5px]">{execNotice}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={!aiAnalysis?.actionable}
                onClick={handleExecuteTrade}
                className="rounded-lg bg-[#089981] hover:brightness-110 disabled:opacity-45 px-3 py-1.5 text-[11px] font-bold text-[#FFFFFF] cursor-pointer"
              >
                ⚡ Execute Trade (0.10)
              </button>
              <button
                type="button"
                disabled={!aiAnalysis?.actionable || !optimalLimitPrice}
                onClick={handleAutoPlaceOptimalLimit}
                className="rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/12 hover:bg-[#F59E0B]/20 disabled:opacity-45 px-2.5 py-1.5 text-[11px] font-bold text-[var(--vp-accent-text)] cursor-pointer"
              >
                Auto-Limit 50% OB ({optimalLimitPrice ? optimalLimitPrice.toFixed(activeAssetSpec.precision) : '--'})
              </button>
              <button
                type="button"
                onClick={() => {
                  if (aiAnalysis) {
                    onApplyAiSetupToTerminal(aiAnalysis, symbol);
                    onNavigateTab('terminal');
                  }
                }}
                className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--vp-text)] cursor-pointer"
              >
                Inspect Terminal ↗
              </button>
              <button
                type="button"
                onClick={handleDownloadShareCard}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--vp-text)] cursor-pointer ml-auto"
              >
                <Download className="h-3 w-3" />
                <span>Share PNG</span>
              </button>
            </div>
          </div>
        )}

        {activeSubTab === 'mtf' && (
          <div className="space-y-2 text-[11px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] p-2.5 space-y-1">
                <div className="text-[10px] font-bold uppercase text-[var(--vp-muted)]">
                  Multi-Timeframe (MTF) Structural Alignment
                </div>
                <div className="font-bold text-[var(--vp-text)]">
                  HTF Bias (1H/4H): {htfSummary?.label ?? 'Balanced'}
                </div>
                <div className="text-[10px] text-[var(--vp-muted)] font-mono-tabular">
                  Active SMC Zone Mitigations:{' '}
                  {zoneMitigations
                    .slice(0, 3)
                    .map((z) => `${z.kind} (${z.fillPct}%)`)
                    .join(' · ') || 'Fresh Unmitigated Structure'}
                </div>
              </div>

              <div className="rounded-lg border border-[var(--vp-border)] bg-[var(--vp-elevated)] p-2.5 space-y-1">
                <div className="text-[10px] font-bold uppercase text-[var(--vp-muted)]">
                  Historical Twin & Backtest Match
                </div>
                {historicalTwin ? (
                  <>
                    <div className="font-bold text-[#089981]">
                      Match Similarity: {historicalTwin.similarityPct}% · 30D Win Rate: {historicalTwin.winRate30dPct}%
                    </div>
                    <div className="text-[10px] text-[var(--vp-muted)]">{historicalTwin.summary}</div>
                  </>
                ) : (
                  <div className="text-[10px] text-[var(--vp-muted)]">Need 60+ bars for historical pattern twin.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'strategy' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-[var(--vp-text)]">
                Custom AI Strategy Rules (Live Recalculated Verdict:{' '}
                <strong style={{ color: customVerdict.verdict === 'BUY NOW' ? '#089981' : customVerdict.verdict === 'SELL NOW' ? '#F23645' : '#F59E0B' }}>
                  {customVerdict.verdict} {customVerdict.score}%
                </strong>
                )
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {(
                [
                  { key: 'requireHtfTrend', label: '1H/4H HTF Trend' },
                  { key: 'requireEmaAlign', label: 'EMA 20/50 Cross' },
                  { key: 'requireFvgOrOb', label: 'OB / FVG Zone' },
                  { key: 'requireRsiConfirm', label: 'RSI Momentum' },
                  { key: 'requireLiquiditySweep', label: 'Liquidity Sweep' },
                ] as const
              ).map((rule) => {
                const enabled = strategyFlags[rule.key];
                return (
                  <button
                    key={rule.key}
                    type="button"
                    onClick={() =>
                      setStrategyFlags((prev) => ({ ...prev, [rule.key]: !prev[rule.key] }))
                    }
                    className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold cursor-pointer transition-colors ${
                      enabled
                        ? 'border-[#089981] bg-[#089981]/15 text-[#089981]'
                        : 'border-[var(--vp-border)] bg-[var(--vp-elevated)] text-[var(--vp-muted)]'
                    }`}
                  >
                    {enabled ? '✓ ' : ''}
                    {rule.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeSubTab === 'chat' && (
          <div className="space-y-2">
            {chatMessages.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1.5 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-canvas)] p-2 text-[11px]">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg px-2.5 py-1.5 ${
                      msg.role === 'user'
                        ? 'bg-[var(--vp-primary)] text-[var(--vp-primary-fg)] ml-8'
                        : 'bg-[var(--vp-elevated)] text-[var(--vp-text)] mr-4'
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAskAiChat} className="flex items-center gap-1.5">
              <input
                type="text"
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                placeholder={
                  lang === 'hi'
                    ? `Poochein AI se (${activeAssetSpec.label} OB, SL, ya trend ke baare mein)...`
                    : `Ask AI about ${activeAssetSpec.label} OB, FVG, Liquidity or SL placement...`
                }
                className="flex-1 h-8 rounded-lg border border-[var(--vp-border)] bg-[var(--vp-canvas)] px-2.5 text-xs text-[var(--vp-text)] outline-none focus:border-[#F59E0B]"
              />
              <button
                type="submit"
                disabled={chatLoading}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#089981] px-3 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
              >
                <Send className="h-3 w-3" />
                <span>{chatLoading ? '...' : 'Ask'}</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
