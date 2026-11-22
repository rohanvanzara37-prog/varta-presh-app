import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Layers,
  Loader2,
  Newspaper,
  Sparkles,
} from 'lucide-react';
import type { AppTab } from '../types/news';
import type { SmcTelemetrySnapshot } from './ProSmcTerminal';

interface TerminalTopicBoxesProps {
  telemetry: SmcTelemetrySnapshot | null;
  fallbackPairLabel: string;
  fallbackPrice: number | null;
  onNavigateTab?: (tab: AppTab) => void;
}

interface AiScanResult {
  headline: string;
  summary: string;
  invalidation: string;
}

const GUIDE_ITEMS = [
  {
    id: 'omye',
    label: 'OMYE (1m)',
    desc: 'One-Minute Market Engine streams 1m EMA(9/21), RSI(14), and bull/bear candle pressure ticks continuously to calibrate micro Entry, TP & SL.',
  },
  {
    id: 'ob',
    label: 'Order Block',
    desc: 'Last opposing candle before a strong displacement impulse. Unmitigated OB+ (green) acts as institutional demand; OB- (red) acts as supply.',
  },
  {
    id: 'fvg',
    label: 'FVG Zone',
    desc: 'Fair Value Gap is a 3-candle price imbalance where wicks do not overlap. Price frequently rebalances into the FVG before continuing trend.',
  },
  {
    id: 'bos',
    label: 'BOS / CHoCH',
    desc: 'Break of Structure (BOS) confirms trend continuation on candle body close. CHoCH warns of the earliest structural shift against the prior trend.',
  },
] as const;

export const TerminalTopicBoxes: React.FC<TerminalTopicBoxesProps> = ({
  telemetry,
  fallbackPairLabel,
  fallbackPrice,
  onNavigateTab,
}) => {
  const [activeGuideId, setActiveGuideId] = useState<(typeof GUIDE_ITEMS)[number]['id']>('omye');
  const [aiScan, setAiScan] = useState<AiScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [academyDoneCount, setAcademyDoneCount] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('vp_academy_completed_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) setAcademyDoneCount(parsed.length);
      }
    } catch {
      // ignore storage read error
    }
  }, []);

  // Reset AI scan insight when active symbol changes
  useEffect(() => {
    setAiScan(null);
    setScanError(null);
  }, [telemetry?.symbol, fallbackPairLabel]);

  const activeSymbolLabel = telemetry?.symbol ?? fallbackPairLabel;
  const activePrice = telemetry?.price ?? fallbackPrice;
  const patternName = telemetry?.smc?.pattern?.name ?? 'Range / Consolidation';
  const patternBias = telemetry?.smc?.pattern?.bias ?? 'Breakout';
  const trendLabel = telemetry?.smc?.trend === -1 ? 'Bearish' : 'Bullish';

  const handleRunAiScan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch('/api/pattern-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: activeSymbolLabel,
          timeframe: telemetry?.timeframe ?? '15m',
          price: activePrice ?? 0,
          pattern: patternName,
          trend: trendLabel,
          support: telemetry?.smc?.supportPrice ?? null,
          resistance: telemetry?.smc?.resistancePrice ?? null,
          omyeSignal: telemetry?.omye?.signal ?? 'NEUTRAL',
          rsi1m: telemetry?.omye?.rsi1m ?? null,
        }),
      });
      const json = (await res.json()) as Partial<AiScanResult> & { error?: string };
      if (!res.ok || json.error) {
        setScanError(json.error ?? 'AI scan unavailable right now.');
      } else {
        setAiScan({
          headline: json.headline ?? `${activeSymbolLabel} ${patternName}`,
          summary: json.summary ?? 'Watch candle closes above/below active S/R zones.',
          invalidation: json.invalidation ?? 'Structural swing close.',
        });
      }
    } catch {
      setScanError('Network error running AI pattern scan.');
    } finally {
      setScanning(false);
    }
  };

  const activeGuide = GUIDE_ITEMS.find((g) => g.id === activeGuideId) ?? GUIDE_ITEMS[0];

  return (
    <section
      aria-label="Chart Intelligence, Guides & Academy Topics"
      className="grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      {/* Box 1: AI Pattern Analysis */}
      <article className="rounded-2xl border border-[#2B3139] bg-[#12161C] p-4 flex flex-col justify-between gap-3">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#F0B90B]/15 text-[#F0B90B]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <span className="block text-[10px] font-mono-tabular uppercase tracking-wider text-[#848E9C]">
                  Topic 01 · Live Scan
                </span>
                <h3 className="text-sm font-bold text-[#EAECEF]">AI Pattern Analysis</h3>
              </div>
            </div>

            <span
              className="rounded px-2 py-0.5 text-[10px] font-bold font-mono-tabular"
              style={{
                backgroundColor:
                  patternBias === 'Bullish'
                    ? 'rgba(0, 192, 135, 0.15)'
                    : patternBias === 'Bearish'
                      ? 'rgba(246, 70, 93, 0.15)'
                      : 'rgba(240, 185, 11, 0.15)',
                color:
                  patternBias === 'Bullish'
                    ? '#00C087'
                    : patternBias === 'Bearish'
                      ? '#F6465D'
                      : '#F0B90B',
              }}
            >
              {patternBias}
            </span>
          </div>

          <div className="rounded-xl border border-[#2B3139] bg-[#1E2329] p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#848E9C]">Active Pattern</span>
              <span className="font-bold text-[#F0B90B]">{patternName}</span>
            </div>
            <div className="flex items-center justify-between gap-2 font-mono-tabular">
              <span className="text-[#00C087]">
                S1: {telemetry?.smc?.supportPrice ? telemetry.smc.supportPrice.toFixed(2) : '--'}
              </span>
              <span className="text-[#EAECEF]">
                {activeSymbolLabel} · {telemetry?.timeframe ?? '15m'}
              </span>
              <span className="text-[#F6465D]">
                R1: {telemetry?.smc?.resistancePrice ? telemetry.smc.resistancePrice.toFixed(2) : '--'}
              </span>
            </div>
          </div>

          {aiScan ? (
            <div className="rounded-xl border border-[#F0B90B]/40 bg-[#1E2329] p-2.5 space-y-1 text-xs">
              <div className="font-bold text-[#F0B90B]">{aiScan.headline}</div>
              <p className="text-[#EAECEF] leading-relaxed">{aiScan.summary}</p>
              <p className="text-[11px] text-[#848E9C]">Invalidation: {aiScan.invalidation}</p>
            </div>
          ) : scanError ? (
            <p className="text-[11px] text-[#F6465D]">{scanError}</p>
          ) : (
            <p className="text-xs text-[#848E9C] leading-relaxed">
              Auto-drawn support, resistance &amp; geometric chart patterns sync live with WebSocket
              candles. Run an instant AI structural read below.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#2B3139]">
          <button
            type="button"
            onClick={handleRunAiScan}
            disabled={scanning}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#F0B90B] px-3 text-xs font-bold text-[#0B0E11] cursor-pointer disabled:opacity-60"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>{aiScan ? 'Rescan Pattern' : 'AI Deep Scan'}</span>
          </button>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('news')}
              className="inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-[#EAECEF] hover:text-[#F0B90B] cursor-pointer"
            >
              <Newspaper className="h-3.5 w-3.5" />
              <span>Crypto/FX News</span>
            </button>
          )}
        </div>
      </article>

      {/* Box 2: SMC & OMYE Guide */}
      <article className="rounded-2xl border border-[#2B3139] bg-[#12161C] p-4 flex flex-col justify-between gap-3">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#00C087]/15 text-[#00C087]">
                <Layers className="h-4 w-4" />
              </span>
              <div>
                <span className="block text-[10px] font-mono-tabular uppercase tracking-wider text-[#848E9C]">
                  Topic 02 · Playbook
                </span>
                <h3 className="text-sm font-bold text-[#EAECEF]">SMC &amp; OMYE Guide</h3>
              </div>
            </div>

            <span className="text-[10px] font-mono-tabular font-bold text-[#00C087]">
              {telemetry?.omye?.signal ?? '1m LIVE'}
            </span>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {GUIDE_ITEMS.map((item) => {
              const active = item.id === activeGuideId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveGuideId(item.id)}
                  className="min-h-[28px] rounded-lg px-2.5 text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: active ? '#F0B90B' : '#1E2329',
                    color: active ? '#0B0E11' : '#848E9C',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-[#2B3139] bg-[#1E2329] p-3 text-xs text-[#EAECEF] leading-relaxed">
            {activeGuide.desc}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#2B3139]">
          <span className="text-[11px] font-mono-tabular text-[#848E9C]">
            {telemetry?.smc?.orderBlock
              ? `${telemetry.smc.orderBlock.type} OB Active`
              : 'BOS · OB · FVG · OMYE'}
          </span>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('academy')}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#1E2329] border border-[#2B3139] px-3 text-xs font-bold text-[#F0B90B] hover:border-[#F0B90B] cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Study SMC Guide</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </article>

      {/* Box 3: Chart Learning Academy */}
      <article className="rounded-2xl border border-[#2B3139] bg-[#12161C] p-4 flex flex-col justify-between gap-3">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#F0B90B]/15 text-[#F0B90B]">
                <GraduationCap className="h-4 w-4" />
              </span>
              <div>
                <span className="block text-[10px] font-mono-tabular uppercase tracking-wider text-[#848E9C]">
                  Topic 03 · Curriculum
                </span>
                <h3 className="text-sm font-bold text-[#EAECEF]">Chart Learning Academy</h3>
              </div>
            </div>

            <span className="text-[11px] font-mono-tabular font-bold text-[#00C087]">
              {academyDoneCount}/4 Done
            </span>
          </div>

          <ul className="space-y-1.5 text-xs">
            <li className="rounded-xl border border-[#2B3139] bg-[#1E2329] px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[#EAECEF] font-medium truncate">
                01. HH / HL / LH / LL Market Structure
              </span>
              <span className="text-[10px] font-mono-tabular text-[#00C087] shrink-0">4m</span>
            </li>
            <li className="rounded-xl border border-[#2B3139] bg-[#1E2329] px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[#EAECEF] font-medium truncate">
                02. BOS vs CHoCH + Order Block Entry
              </span>
              <span className="text-[10px] font-mono-tabular text-[#F0B90B] shrink-0">6m</span>
            </li>
            <li className="rounded-xl border border-[#2B3139] bg-[#1E2329] px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[#EAECEF] font-medium truncate">
                03. Trading Gold around CPI, PCE &amp; FOMC
              </span>
              <span className="text-[10px] font-mono-tabular text-[#848E9C] shrink-0">5m</span>
            </li>
          </ul>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#2B3139]">
          <span className="text-[11px] text-[#848E9C]">Interactive quizzes included</span>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('academy')}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#F0B90B] px-3 text-xs font-bold text-[#0B0E11] cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Open Academy</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </article>
    </section>
  );
};
