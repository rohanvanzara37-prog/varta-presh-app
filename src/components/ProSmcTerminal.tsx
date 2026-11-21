import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';

export type SmcSymbol =
  | 'XAUUSD'
  | 'BTCUSDT'
  | 'ETHUSDT'
  | 'SOLUSDT'
  | 'BNBUSDT'
  | 'XRPUSDT'
  | 'US500'
  | 'USOIL';

export type SmcTimeframe = '1m' | '5m' | '15m' | '1h';

interface ProSmcTerminalProps {
  externalTvSymbol?: string;
}

interface SmcAnalysisState {
  trend: 1 | -1;
  lastEvent: string;
  lastHighLabel: string;
  lastLowLabel: string;
  lastHighPrice: number | null;
  lastLowPrice: number | null;
  bosCount: number;
  chochCount: number;
  entry: number;
  tp: number;
  sl: number;
}

interface SymbolMeta {
  value: SmcSymbol;
  label: string;
  isCrypto: boolean;
  precision: number;
  minMove: number;
}

const SYMBOL_OPTIONS: SymbolMeta[] = [
  { value: 'XAUUSD', label: 'XAU/USD · Gold', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'BTCUSDT', label: 'BTC/USDT · Bitcoin', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'ETHUSDT', label: 'ETH/USDT · Ethereum', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'US500', label: 'US500 · S&P 500', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'USOIL', label: 'USOIL · WTI Crude', isCrypto: false, precision: 2, minMove: 0.01 },
  { value: 'SOLUSDT', label: 'SOL/USDT · Solana', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'BNBUSDT', label: 'BNB/USDT · BNB', isCrypto: true, precision: 2, minMove: 0.01 },
  { value: 'XRPUSDT', label: 'XRP/USDT · Ripple', isCrypto: true, precision: 4, minMove: 0.0001 },
];

const TIMEFRAME_OPTIONS: { value: SmcTimeframe; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
];

function mapTvSymbolToSmc(tvSymbol?: string): SmcSymbol | null {
  if (!tvSymbol) return null;
  if (tvSymbol.includes('XAU')) return 'XAUUSD';
  if (tvSymbol.includes('SPX') || tvSymbol.includes('US500')) return 'US500';
  if (tvSymbol.includes('USOIL')) return 'USOIL';
  if (tvSymbol.includes('BTC')) return 'BTCUSDT';
  if (tvSymbol.includes('ETH')) return 'ETHUSDT';
  if (tvSymbol.includes('SOL')) return 'SOLUSDT';
  if (tvSymbol.includes('BNB')) return 'BNBUSDT';
  if (tvSymbol.includes('XRP')) return 'XRPUSDT';
  return null;
}

async function fetchCandles(
  symbol: SmcSymbol,
  tf: SmcTimeframe,
  signal: AbortSignal
): Promise<CandlestickData<UTCTimestamp>[]> {
  // Primary unified server endpoint (works for XAU/USD, S&P 500, US Oil & Crypto)
  try {
    const res = await fetch(`/api/klines?symbol=${symbol}&interval=${tf}`, {
      signal,
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as {
        candles?: Array<{ time: number; open: number; high: number; low: number; close: number }>;
      };
      if (Array.isArray(json.candles) && json.candles.length >= 10) {
        return json.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
      }
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
  }

  // Fallback direct Binance REST for crypto symbols
  const meta = SYMBOL_OPTIONS.find((s) => s.value === symbol);
  if (!meta?.isCrypto) return [];

  const endpoints = [
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=160`,
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=160`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const raw = (await res.json()) as [number, string, string, string, string][];
      if (!Array.isArray(raw) || raw.length < 10) continue;

      const byTime = new Map<number, CandlestickData<UTCTimestamp>>();
      for (const d of raw) {
        const t = Math.floor(d[0] / 1000);
        const open = Number(d[1]);
        const high = Number(d[2]);
        const low = Number(d[3]);
        const close = Number(d[4]);
        if ([t, open, high, low, close].every(Number.isFinite)) {
          byTime.set(t, { time: t as UTCTimestamp, open, high, low, close });
        }
      }
      return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
    }
  }
  return [];
}

function formatTerminalPrice(val: number | null, precision = 2): string {
  if (val === null || !Number.isFinite(val)) return '--.--';
  return val.toFixed(precision);
}

export const ProSmcTerminal: React.FC<ProSmcTerminalProps> = ({ externalTvSymbol }) => {
  const [symbol, setSymbol] = useState<SmcSymbol>(() => mapTvSymbolToSmc(externalTvSymbol) ?? 'XAUUSD');
  const [timeframe, setTimeframe] = useState<SmcTimeframe>('15m');
  const [showSwingLabels, setShowSwingLabels] = useState(true);
  const [showBosChoch, setShowBosChoch] = useState(true);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [isBullTick, setIsBullTick] = useState<boolean>(true);
  const [streamStatus, setStreamStatus] = useState<'CONNECTING' | 'LIVE STREAM' | 'LIVE FEED'>('CONNECTING');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [smc, setSmc] = useState<SmcAnalysisState | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const structureSeriesRef = useRef<ISeriesApi<'Line', Time>[]>([]);
  const latestCandlesRef = useRef<CandlestickData<UTCTimestamp>[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const showSwingLabelsRef = useRef(showSwingLabels);
  const showBosChochRef = useRef(showBosChoch);

  useEffect(() => {
    showSwingLabelsRef.current = showSwingLabels;
    showBosChochRef.current = showBosChoch;
  }, [showSwingLabels, showBosChoch]);

  const symbolMeta = SYMBOL_OPTIONS.find((s) => s.value === symbol) ?? SYMBOL_OPTIONS[0];

  // Sync when user clicks Gold / BTC / ETH / S&P 500 / US Oil in the top ticker strip
  useEffect(() => {
    const mapped = mapTvSymbolToSmc(externalTvSymbol);
    if (mapped && mapped !== symbol) {
      setSymbol(mapped);
    }
  }, [externalTvSymbol]);

  // Initialize Lightweight Chart once
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth || 320,
      height: el.clientHeight || 340,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E11' },
        textColor: '#D1D4DC',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: '#2B3139',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 7,
      },
      rightPriceScale: {
        borderColor: '#2B3139',
        scaleMargins: { top: 0.14, bottom: 0.14 },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00C087',
      downColor: '#F6465D',
      borderUpColor: '#00C087',
      borderDownColor: '#F6465D',
      wickUpColor: '#00C087',
      wickDownColor: '#F6465D',
    });

    const markersPlugin = createSeriesMarkers(candleSeries, []);

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    markersPluginRef.current = markersPlugin;

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      markersPlugin.detach();
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      markersPluginRef.current = null;
      structureSeriesRef.current = [];
    };
  }, []);

  // Update candle series price precision when switching symbols
  useEffect(() => {
    candleSeriesRef.current?.applyOptions({
      priceFormat: {
        type: 'price',
        precision: symbolMeta.precision,
        minMove: symbolMeta.minMove,
      },
    });
  }, [symbolMeta.precision, symbolMeta.minMove]);

  const clearStructureLines = useCallback(() => {
    const chart = chartApiRef.current;
    if (!chart) return;
    structureSeriesRef.current.forEach((line) => {
      try {
        chart.removeSeries(line);
      } catch {
        // already removed
      }
    });
    structureSeriesRef.current = [];
  }, []);

  // Compute & render full SMC Market Structure: HH, LH, HL, LL + BOS & CHoCH
  const runSmcAndSetup = useCallback(
    (candles: CandlestickData<UTCTimestamp>[], swingOn: boolean, bosOn: boolean) => {
      const chart = chartApiRef.current;
      const markersPlugin = markersPluginRef.current;
      if (!chart || !markersPlugin || candles.length < 12) return;

      clearStructureLines();

      const pivotLen = 4;
      const markers: SeriesMarker<Time>[] = [];
      const structureLinesQueue: Array<{
        t1: UTCTimestamp;
        t2: UTCTimestamp;
        price: number;
        color: string;
        style: LineStyle;
        width: 1 | 2;
      }> = [];

      let prevSwingHigh: { idx: number; time: UTCTimestamp; price: number } | null = null;
      let prevSwingLow: { idx: number; time: UTCTimestamp; price: number } | null = null;
      let activeHigh: { time: UTCTimestamp; price: number; broken: boolean } | null = null;
      let activeLow: { time: UTCTimestamp; price: number; broken: boolean } | null = null;

      let lastHighLabel = 'HH';
      let lastLowLabel = 'HL';
      let trend: 1 | -1 = 1;
      let lastEvent = 'BOS (Bull)';
      let bosCount = 0;
      let chochCount = 0;

      for (let i = pivotLen; i < candles.length; i += 1) {
        // Confirm swing point at idx = i - pivotLen once right pivotLen bars close
        const pivotIdx = i - pivotLen;
        if (pivotIdx >= pivotLen) {
          let isHigh = true;
          let isLow = true;
          for (let j = 1; j <= pivotLen; j += 1) {
            if (
              candles[pivotIdx].high <= candles[pivotIdx - j].high ||
              candles[pivotIdx].high < candles[pivotIdx + j].high
            ) {
              isHigh = false;
            }
            if (
              candles[pivotIdx].low >= candles[pivotIdx - j].low ||
              candles[pivotIdx].low > candles[pivotIdx + j].low
            ) {
              isLow = false;
            }
          }

          if (isHigh) {
            const label =
              prevSwingHigh === null
                ? 'HH'
                : candles[pivotIdx].high > prevSwingHigh.price
                  ? 'HH'
                  : 'LH';
            lastHighLabel = label;
            prevSwingHigh = {
              idx: pivotIdx,
              time: candles[pivotIdx].time,
              price: candles[pivotIdx].high,
            };
            activeHigh = {
              time: candles[pivotIdx].time,
              price: candles[pivotIdx].high,
              broken: false,
            };

            if (swingOn) {
              markers.push({
                time: candles[pivotIdx].time,
                position: 'aboveBar',
                color: label === 'HH' ? '#00C087' : '#F0B90B',
                shape: 'arrowDown',
                text: label,
              });
            }
          }

          if (isLow) {
            const label =
              prevSwingLow === null
                ? 'HL'
                : candles[pivotIdx].low < prevSwingLow.price
                  ? 'LL'
                  : 'HL';
            lastLowLabel = label;
            prevSwingLow = {
              idx: pivotIdx,
              time: candles[pivotIdx].time,
              price: candles[pivotIdx].low,
            };
            activeLow = {
              time: candles[pivotIdx].time,
              price: candles[pivotIdx].low,
              broken: false,
            };

            if (swingOn) {
              markers.push({
                time: candles[pivotIdx].time,
                position: 'belowBar',
                color: label === 'LL' ? '#F6465D' : '#00C087',
                shape: 'arrowUp',
                text: label,
              });
            }
          }
        }

        // Evaluate candle-close Break of Structure (BOS) and Change of Character (CHoCH)
        const closePrice = candles[i].close;
        const barTime = candles[i].time;

        if (activeHigh && !activeHigh.broken && closePrice > activeHigh.price) {
          activeHigh.broken = true;
          const isChoch = trend === -1;
          trend = 1;
          if (isChoch) {
            chochCount += 1;
            lastEvent = 'CHoCH (Bull)';
          } else {
            bosCount += 1;
            lastEvent = 'BOS (Bull)';
          }

          if (bosOn) {
            structureLinesQueue.push({
              t1: activeHigh.time,
              t2: barTime,
              price: activeHigh.price,
              color: '#00C087',
              style: isChoch ? LineStyle.Solid : LineStyle.Dashed,
              width: isChoch ? 2 : 1,
            });
            markers.push({
              time: barTime,
              position: 'aboveBar',
              color: '#00C087',
              shape: 'circle',
              text: isChoch ? 'CHoCH' : 'BOS',
            });
          }
        }

        if (activeLow && !activeLow.broken && closePrice < activeLow.price) {
          activeLow.broken = true;
          const isChoch = trend === 1;
          trend = -1;
          if (isChoch) {
            chochCount += 1;
            lastEvent = 'CHoCH (Bear)';
          } else {
            bosCount += 1;
            lastEvent = 'BOS (Bear)';
          }

          if (bosOn) {
            structureLinesQueue.push({
              t1: activeLow.time,
              t2: barTime,
              price: activeLow.price,
              color: '#F6465D',
              style: isChoch ? LineStyle.Solid : LineStyle.Dashed,
              width: isChoch ? 2 : 1,
            });
            markers.push({
              time: barTime,
              position: 'belowBar',
              color: '#F6465D',
              shape: 'circle',
              text: isChoch ? 'CHoCH' : 'BOS',
            });
          }
        }
      }

      // Draw up to the 10 most recent BOS/CHoCH lines plus active unbroken trigger levels
      const latestBarTime = candles[candles.length - 1].time;
      if (bosOn) {
        for (const seg of structureLinesQueue.slice(-10)) {
          if (seg.t1 >= seg.t2) continue;
          const line = chart.addSeries(LineSeries, {
            color: seg.color,
            lineWidth: seg.width,
            lineStyle: seg.style,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          line.setData([
            { time: seg.t1, value: seg.price },
            { time: seg.t2, value: seg.price },
          ]);
          structureSeriesRef.current.push(line);
        }

        // Extend current unbroken Swing High / Low trigger lines to latest candle
        if (activeHigh && !activeHigh.broken && activeHigh.time < latestBarTime) {
          const line = chart.addSeries(LineSeries, {
            color: 'rgba(0, 192, 135, 0.5)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
          });
          line.setData([
            { time: activeHigh.time, value: activeHigh.price },
            { time: latestBarTime, value: activeHigh.price },
          ]);
          structureSeriesRef.current.push(line);
        }
        if (activeLow && !activeLow.broken && activeLow.time < latestBarTime) {
          const line = chart.addSeries(LineSeries, {
            color: 'rgba(246, 70, 93, 0.5)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
          });
          line.setData([
            { time: activeLow.time, value: activeLow.price },
            { time: latestBarTime, value: activeLow.price },
          ]);
          structureSeriesRef.current.push(line);
        }
      }

      markers.sort((a, b) => Number(a.time) - Number(b.time));
      markersPlugin.setMarkers(markers);

      const lastCandle = candles[candles.length - 1];
      const lastClose = lastCandle.close;
      setLivePrice(lastClose);
      setIsBullTick(lastClose >= lastCandle.open);

      const swingLowVal = prevSwingLow?.price ?? null;
      const swingHighVal = prevSwingHigh?.price ?? null;

      if (trend === 1) {
        const rawSl = swingLowVal !== null && swingLowVal < lastClose ? swingLowVal : lastClose * 0.992;
        const risk = Math.max(lastClose * 0.0025, lastClose - rawSl);
        const tp = lastClose + risk * 2;
        setSmc({
          trend: 1,
          lastEvent,
          lastHighLabel,
          lastLowLabel,
          lastHighPrice: swingHighVal,
          lastLowPrice: swingLowVal,
          bosCount,
          chochCount,
          entry: lastClose,
          tp,
          sl: rawSl,
        });
      } else {
        const rawSl = swingHighVal !== null && swingHighVal > lastClose ? swingHighVal : lastClose * 1.008;
        const risk = Math.max(lastClose * 0.0025, rawSl - lastClose);
        const tp = Math.max(0.0001, lastClose - risk * 2);
        setSmc({
          trend: -1,
          lastEvent,
          lastHighLabel,
          lastLowLabel,
          lastHighPrice: swingHighVal,
          lastLowPrice: swingLowVal,
          bosCount,
          chochCount,
          entry: lastClose,
          tp,
          sl: rawSl,
        });
      }
    },
    [clearStructureLines]
  );

  // Re-run SMC overlays immediately when user toggles HH/LL or BOS/CHoCH pills
  useEffect(() => {
    if (latestCandlesRef.current.length >= 12) {
      runSmcAndSetup(latestCandlesRef.current, showSwingLabels, showBosChoch);
    }
  }, [showSwingLabels, showBosChoch, runSmcAndSetup]);

  // Load REST Klines + Live WebSocket (Crypto) or Live Polling (XAU/USD, S&P 500, US Oil)
  useEffect(() => {
    const controller = new AbortController();
    let pollTimer: number | null = null;
    let disposed = false;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setLoadError(null);
    setStreamStatus('CONNECTING');

    const startPolling = () => {
      if (disposed || pollTimer !== null) return;
      setStreamStatus('LIVE FEED');
      pollTimer = window.setInterval(async () => {
        if (disposed) return;
        try {
          const fresh = await fetchCandles(symbol, timeframe, controller.signal);
          if (!disposed && fresh.length > 0 && candleSeriesRef.current) {
            latestCandlesRef.current = fresh;
            candleSeriesRef.current.setData(fresh);
            runSmcAndSetup(fresh, showSwingLabelsRef.current, showBosChochRef.current);
          }
        } catch {
          // ignore transient poll abort
        }
      }, 6000);
    };

    const startWebSocket = () => {
      if (disposed || !symbolMeta.isCrypto) {
        startPolling();
        return;
      }
      const stream = `${symbol.toLowerCase()}@kline_${timeframe}`;
      try {
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!disposed) setStreamStatus('LIVE STREAM');
        };

        ws.onmessage = (event) => {
          if (disposed || !candleSeriesRef.current) return;
          try {
            const parsed = JSON.parse(event.data as string) as {
              k?: { t: number; o: string; h: string; l: string; c: string; x?: boolean };
            };
            const k = parsed?.k;
            if (!k) return;
            const liveCandle: CandlestickData<UTCTimestamp> = {
              time: Math.floor(k.t / 1000) as UTCTimestamp,
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
            };
            candleSeriesRef.current.update(liveCandle);
            const arr = latestCandlesRef.current;
            if (arr.length > 0) {
              if (arr[arr.length - 1].time === liveCandle.time) {
                arr[arr.length - 1] = liveCandle;
              } else if (liveCandle.time > arr[arr.length - 1].time) {
                arr.push(liveCandle);
              }
            }
            if (k.x && arr.length >= 12) {
              runSmcAndSetup(arr, showSwingLabelsRef.current, showBosChochRef.current);
            }
            setLivePrice(liveCandle.close);
            setIsBullTick(liveCandle.close >= liveCandle.open);
          } catch {
            // ignore malformed frame
          }
        };

        ws.onerror = () => {
          if (!disposed) startPolling();
        };

        ws.onclose = () => {
          if (!disposed) startPolling();
        };
      } catch {
        startPolling();
      }
    };

    fetchCandles(symbol, timeframe, controller.signal)
      .then((candles) => {
        if (disposed) return;
        if (candles.length === 0) {
          setLoadError(`Unable to load live ${symbol} candlesticks.`);
          return;
        }
        latestCandlesRef.current = candles;
        candleSeriesRef.current?.setData(candles);
        // Zoom nicely onto latest 68 candles so wicks & BOS/CHoCH labels are crisp
        chartApiRef.current?.timeScale().setVisibleLogicalRange({
          from: Math.max(0, candles.length - 68),
          to: candles.length + 4,
        });
        runSmcAndSetup(candles, showSwingLabelsRef.current, showBosChochRef.current);
        startWebSocket();
      })
      .catch((err) => {
        if (!disposed && (err as Error)?.name !== 'AbortError') {
          setLoadError(`Failed to load ${symbol} chart data.`);
        }
      });

    return () => {
      disposed = true;
      controller.abort();
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, timeframe, symbolMeta.isCrypto, reloadNonce, runSmcAndSetup]);

  return (
    <section
      aria-label="Pro SMC Trading Terminal"
      className="rounded-xl border overflow-hidden bg-[#0B0E11] border-[#2B3139] text-[#EAECEF]"
    >
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#161A1E] border-b border-[#2B3139]">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="Select trading symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as SmcSymbol)}
            className="rounded bg-[#2B3139] text-[#EAECEF] px-2.5 py-1.5 text-xs font-semibold outline-none cursor-pointer"
          >
            {SYMBOL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {TIMEFRAME_OPTIONS.map((tf) => {
              const active = timeframe === tf.value;
              return (
                <button
                  key={tf.value}
                  type="button"
                  onClick={() => setTimeframe(tf.value)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#F0B90B] text-[#0B0E11]'
                      : 'bg-[#2B3139] text-[#EAECEF] hover:bg-[#363c46]'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowSwingLabels((v) => !v)}
            className={`rounded px-2 py-1 text-[11px] font-semibold cursor-pointer border transition-colors ${
              showSwingLabels
                ? 'bg-[#00C087]/15 border-[#00C087]/50 text-[#00C087]'
                : 'bg-[#2B3139] border-transparent text-[#848E9C]'
            }`}
          >
            HH/HL/LH/LL
          </button>

          <button
            type="button"
            onClick={() => setShowBosChoch((v) => !v)}
            className={`rounded px-2 py-1 text-[11px] font-semibold cursor-pointer border transition-colors ${
              showBosChoch
                ? 'bg-[#F0B90B]/15 border-[#F0B90B]/50 text-[#F0B90B]'
                : 'bg-[#2B3139] border-transparent text-[#848E9C]'
            }`}
          >
            BOS/CHoCH
          </button>
        </div>

        <div
          className="font-mono-tabular text-[15px] font-bold"
          style={{ color: isBullTick ? '#00C087' : '#F6465D' }}
        >
          ${formatTerminalPrice(livePrice, symbolMeta.precision)}
        </div>
      </div>

      {/* Main Workspace: Side-by-Side on Desktop, Compact Split on Mobile */}
      <div className="flex flex-col md:flex-row md:h-[500px]">
        {/* Chart Box */}
        <div className="relative h-[340px] md:h-full md:flex-[3] min-w-0 border-b md:border-b-0 md:border-r border-[#2B3139]">
          <div ref={chartWrapRef} className="w-full h-full" />
          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0B0E11]/90 p-4 text-center text-xs text-[#848E9C]">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                className="rounded bg-[#F0B90B] px-3 py-1 font-semibold text-[#0B0E11] cursor-pointer"
              >
                Retry Chart
              </button>
            </div>
          )}
        </div>

        {/* Right / Bottom Smart Analysis Panel */}
        <div className="md:flex-1 md:min-w-[260px] md:max-w-[320px] bg-[#12161C] p-2 sm:p-2.5 flex flex-row md:flex-col justify-between gap-2">
          {/* Live Smart Setup Card */}
          <div className="flex-1 rounded-md border border-[#2B3139] bg-[#1E2329] px-2.5 py-2 flex flex-col justify-between">
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-[#848E9C] mb-1">
                Live Smart Setup (Auto)
              </div>
              <span
                className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                  !smc
                    ? 'bg-[#2B3139] text-[#EAECEF]'
                    : smc.trend === 1
                      ? 'bg-[#00C087]/15 text-[#00C087]'
                      : 'bg-[#F6465D]/15 text-[#F6465D]'
                }`}
              >
                {!smc
                  ? 'ANALYZING...'
                  : smc.trend === 1
                    ? 'SMART BUY SETUP'
                    : 'SMART SELL SETUP'}
              </span>
            </div>

            <div className="space-y-1 mt-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#848E9C]">Entry:</span>
                <span className="font-mono-tabular font-bold text-[#F0B90B]">
                  {formatTerminalPrice(smc?.entry ?? null, symbolMeta.precision)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#848E9C]">Target (TP):</span>
                <span className="font-mono-tabular font-bold text-[#00C087]">
                  {formatTerminalPrice(smc?.tp ?? null, symbolMeta.precision)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#848E9C]">Stop Loss:</span>
                <span className="font-mono-tabular font-bold text-[#F6465D]">
                  {formatTerminalPrice(smc?.sl ?? null, symbolMeta.precision)}
                </span>
              </div>
            </div>
          </div>

          {/* SMC Market Structure Card */}
          <div className="flex-1 rounded-md border border-[#2B3139] bg-[#1E2329] px-2.5 py-2 flex flex-col justify-between">
            <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-[#848E9C] mb-1">
              SMC Structure &amp; Trend
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#848E9C]">Market Trend:</span>
                <span
                  className="font-bold"
                  style={{ color: smc?.trend === -1 ? '#F6465D' : '#00C087' }}
                >
                  {smc?.trend === -1 ? 'BEARISH' : 'BULLISH'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#848E9C]">Last Event:</span>
                <span className="font-mono-tabular font-bold text-[#F0B90B]">
                  {smc?.lastEvent ?? 'BOS (Bull)'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#848E9C]">
                  High ({smc?.lastHighLabel ?? 'HH'}):
                </span>
                <span className="font-mono-tabular font-semibold text-[#00C087]">
                  {formatTerminalPrice(smc?.lastHighPrice ?? null, symbolMeta.precision)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#848E9C]">
                  Low ({smc?.lastLowLabel ?? 'LL'}):
                </span>
                <span className="font-mono-tabular font-semibold text-[#F6465D]">
                  {formatTerminalPrice(smc?.lastLowPrice ?? null, symbolMeta.precision)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#848E9C]">BOS / CHoCH:</span>
                <span className="font-mono-tabular text-[#D1D4DC]">
                  {smc ? `${smc.bosCount} / ${smc.chochCount}` : '0 / 0'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#848E9C]">Status:</span>
                <span className="font-semibold text-[#00C087]">{streamStatus}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
