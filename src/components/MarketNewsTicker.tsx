import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  Minus,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';

export type TickerTopic =
  | 'ALL'
  | 'GOLD'
  | 'CRYPTO'
  | 'USDT'
  | 'CPI'
  | 'PCE/PCA'
  | 'NFT'
  | 'FOMC'
  | 'ISM'
  | 'SENTIMENT';

interface FilteredTickerItem {
  id: string;
  headline: string;
  category: Exclude<TickerTopic, 'ALL'>;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  source: string;
  url: string;
  publishedAt: string;
}

interface NewsTickerResponse {
  updatedAt: string;
  filteredByGemini: boolean;
  globalSentiment: {
    label: 'Risk-On' | 'Risk-Off' | 'Cautious' | 'Mixed';
    summary: string;
  };
  items: FilteredTickerItem[];
  error?: string;
  code?: string;
}

const TOPIC_FILTERS: { id: TickerTopic; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'GOLD', label: 'Gold' },
  { id: 'CRYPTO', label: 'Crypto' },
  { id: 'USDT', label: 'USDT' },
  { id: 'CPI', label: 'CPI' },
  { id: 'PCE/PCA', label: 'PCE/PCA' },
  { id: 'FOMC', label: 'FOMC' },
  { id: 'ISM', label: 'ISM' },
  { id: 'NFT', label: 'NFT' },
  { id: 'SENTIMENT', label: 'Sentiment' },
];

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function getSentimentColor(sentiment: 'Bullish' | 'Bearish' | 'Neutral'): string {
  if (sentiment === 'Bullish') return '#26a69a';
  if (sentiment === 'Bearish') return '#ef5350';
  return '#9aa7b8';
}

export const MarketNewsTicker: React.FC = () => {
  const [data, setData] = useState<NewsTickerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<TickerTopic>('ALL');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<FilteredTickerItem | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchTicker = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const endpoint = force ? '/api/news-ticker?refresh=1' : '/api/news-ticker';
      const res = await fetch(endpoint);
      const json = (await res.json()) as NewsTickerResponse;
      if (!res.ok || json.error) {
        setErrorMsg(json.error ?? 'Unable to load Gemini news ticker.');
        setData(null);
      } else {
        setData(json);
        setErrorMsg(null);
      }
    } catch {
      setErrorMsg('Network error loading live market headlines.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTicker(false);
    const intervalId = window.setInterval(() => {
      fetchTicker(false);
    }, 10 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [fetchTicker]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        setActiveItem(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [drawerOpen]);

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    if (selectedTopic === 'ALL') return items;
    const matching = items.filter((item) => item.category === selectedTopic);
    return matching.length > 0 ? matching : items;
  }, [data?.items, selectedTopic]);

  const pulseLabel = data?.globalSentiment.label ?? 'Market Pulse';

  return (
    <div
      ref={containerRef}
      className="relative w-full border-b bg-[#0e1117] border-[#2a2e39] text-[#d1d4dc]"
    >
      <div className="mx-auto max-w-7xl px-2.5 sm:px-6 py-2 flex items-center gap-2.5">
        {/* Left LIVE Badge (clickable to filter topics / view sentiment pulse) */}
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-expanded={drawerOpen}
          title={data?.globalSentiment.summary ?? 'Open live Gemini news wire & topic filter'}
          className="inline-flex items-center gap-1.5 rounded bg-[#ef5350] px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shadow-[0_2px_5px_rgba(239,83,80,0.4)] shrink-0 cursor-pointer"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span>LIVE</span>
          {selectedTopic !== 'ALL' && (
            <span className="text-[10px] font-mono-tabular opacity-90">· {selectedTopic}</span>
          )}
          <ChevronDown className={`h-3 w-3 transition-transform ${drawerOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Scrolling News Track */}
        <div
          className="ticker-wrap flex-1 min-w-0 overflow-hidden pl-1.5"
          data-paused={isPaused ? 'true' : 'false'}
        >
          {loading && !data ? (
            <div className="text-[13px] text-[#9aa7b8] truncate">
              Loading Gold, Crypto, USDT, CPI, PCE/PCA, FOMC, ISM &amp; NFT wire...
            </div>
          ) : errorMsg ? (
            <div className="flex items-center gap-2 text-[13px] text-[#9aa7b8] truncate">
              <span className="truncate">{errorMsg}</span>
              <button
                type="button"
                onClick={() => fetchTicker(true)}
                className="underline font-semibold text-[#26a69a] shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="animate-ticker items-center">
              {[0, 1].map((dupIdx) => (
                <div
                  key={dupIdx}
                  aria-hidden={dupIdx === 1}
                  className="inline-flex items-center"
                >
                  {filteredItems.map((item) => {
                    const sColor = getSentimentColor(item.sentiment);
                    const arrow =
                      item.sentiment === 'Bullish'
                        ? '▲'
                        : item.sentiment === 'Bearish'
                          ? '▼'
                          : '•';
                    return (
                      <button
                        key={`${dupIdx}-${item.id}`}
                        type="button"
                        tabIndex={dupIdx === 1 ? -1 : 0}
                        onClick={() => setActiveItem(item)}
                        className="inline-flex items-center gap-1.5 px-5 border-r border-[#2a2e39] text-[13px] text-[#d1d4dc] hover:text-white cursor-pointer whitespace-nowrap"
                      >
                        <span className="font-semibold text-white">{item.category}</span>
                        <span className="font-bold" style={{ color: sColor }}>
                          {arrow} {item.sentiment}
                        </span>
                        <span>- {item.headline}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Subtle Pause/Play & Refresh Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {filteredItems.length > 0 && (
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              aria-label={isPaused ? 'Resume news ticker' : 'Pause news ticker'}
              title={isPaused ? 'Resume ticker' : 'Pause ticker'}
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#2a2e39] bg-[#161b22] text-[#9aa7b8] hover:text-white cursor-pointer"
            >
              {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchTicker(true)}
            disabled={loading}
            aria-label="Refresh market news headlines"
            title="Refresh live headlines"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#2a2e39] bg-[#161b22] text-[#9aa7b8] hover:text-white cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expandable Topic Filter & All Headlines Drawer */}
      {drawerOpen && (
        <div
          className="absolute left-0 right-0 top-full z-40 border-b shadow-xl"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
            color: 'var(--vp-text)',
          }}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
                <span className="font-bold">Global Sentiment: {pulseLabel}</span>
                {data?.globalSentiment.summary && (
                  <span style={{ color: 'var(--vp-muted)' }}>— {data.globalSentiment.summary}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close news drawer"
                className="p-1 rounded-md cursor-pointer"
                style={{ color: 'var(--vp-muted)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {TOPIC_FILTERS.map((topic) => {
                const active = selectedTopic === topic.id;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setSelectedTopic(topic.id)}
                    className="min-h-[26px] rounded-md border px-2.5 text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                      color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                      borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                    }}
                  >
                    {topic.label}
                  </button>
                );
              })}
            </div>

            {errorMsg ? (
              <p className="text-xs py-2" style={{ color: 'var(--vp-muted)' }}>
                {errorMsg}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveItem(item);
                      setDrawerOpen(false);
                    }}
                    className="text-left rounded-lg border px-3 py-2 flex items-start justify-between gap-2 cursor-pointer transition-colors hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor: 'var(--vp-border)',
                    }}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono-tabular">
                        <span className="font-bold">{item.category}</span>
                        <span className="font-semibold" style={{ color: getSentimentColor(item.sentiment) }}>
                          {item.sentiment}
                        </span>
                        <span style={{ color: 'var(--vp-muted)' }}>
                          · {item.source} · {item.publishedAt}
                        </span>
                      </div>
                      <p className="text-xs font-medium leading-snug line-clamp-2">{item.headline}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compact Headline Reader Modal */}
      {activeItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Market headline detail"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
          onClick={() => setActiveItem(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-4 space-y-3 shadow-2xl"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
              color: 'var(--vp-text)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-mono-tabular">
                <span
                  className="rounded px-2 py-0.5 font-bold"
                  style={{ backgroundColor: 'var(--vp-elevated)' }}
                >
                  {activeItem.category}
                </span>
                <span
                  className="inline-flex items-center gap-1 font-semibold"
                  style={{ color: getSentimentColor(activeItem.sentiment) }}
                >
                  {activeItem.sentiment === 'Bullish' ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : activeItem.sentiment === 'Bearish' ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                  {activeItem.sentiment}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveItem(null)}
                aria-label="Close headline detail"
                className="p-1 rounded-md cursor-pointer"
                style={{ color: 'var(--vp-muted)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <h3 className="text-sm font-bold leading-snug">{activeItem.headline}</h3>

            <p className="text-xs" style={{ color: 'var(--vp-muted)' }}>
              Source: {activeItem.source} · {activeItem.publishedAt}
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              {isSafeExternalUrl(activeItem.url) && (
                <a
                  href={activeItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--vp-primary)',
                    color: 'var(--vp-primary-fg)',
                  }}
                >
                  <span>Read Full Article</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setActiveItem(null)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
