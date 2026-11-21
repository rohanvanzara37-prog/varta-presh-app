import React, { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  Pause,
  Play,
  Radio,
  Send,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { FONT_OPTIONS, LIVE_CHANNELS } from '../data/newsData';
import type {
  FontOptionId,
  NewsMessage,
  TypographySettings,
} from '../types/news';
import { NewsImage } from './NewsImage';

interface LiveTvViewProps {
  typography: TypographySettings;
  messages: NewsMessage[];
  onSendMessage: (msg: Omit<NewsMessage, 'id' | 'timestamp'>) => void;
}

const CHANNEL_STREAM_META: Record<
  string,
  { youtubeChannelId?: string; watchUrl: string; focusCategory: string }
> = {
  fxstreet: {
    youtubeChannelId: 'UC7xoPVyj6Av0deAoQqfeJZw',
    watchUrl: 'https://www.youtube.com/@FXStreet/live',
    focusCategory: 'Forex & Gold (XAU)',
  },
  kitco: {
    youtubeChannelId: 'UC9ijza42jVR3T6b8bColgvg',
    watchUrl: 'https://www.youtube.com/@KitcoNEWS/live',
    focusCategory: 'Gold (XAU) & Forex',
  },
  coindesk: {
    youtubeChannelId: 'UC7TghOL755nBk7HelHoi9LQ',
    watchUrl: 'https://www.youtube.com/@CoinDesk/live',
    focusCategory: 'Crypto Markets',
  },
  cointelegraph: {
    youtubeChannelId: 'UCRqBu-grVX1p97WaX4d-OuQ',
    watchUrl: 'https://www.youtube.com/@Cointelegraph/live',
    focusCategory: 'Bitcoin & Crypto',
  },
  tradingview: {
    youtubeChannelId: 'UCfOflihrkOKDQZ_ZKtF2VfQ',
    watchUrl: 'https://www.youtube.com/@TradingView/live',
    focusCategory: 'Crypto & Forex Charts',
  },
};

export const LiveTvView: React.FC<LiveTvViewProps> = ({
  typography,
  messages,
  onSendMessage,
}) => {
  const [activeChannelId, setActiveChannelId] = useState('fxstreet');
  const [streamMode, setStreamMode] = useState<'studio' | 'youtube'>('youtube');
  const [isAudioLive, setIsAudioLive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [chatInput, setChatInput] = useState('');

  const channel =
    LIVE_CHANNELS.find((c) => c.id === activeChannelId) ?? LIVE_CHANNELS[0];
  const streamMeta = CHANNEL_STREAM_META[channel.id];

  const liveHeadlines = useMemo(() => {
    return channel.tickerHeadlines.map((headline, idx) => ({
      id: `${channel.id}-${idx}`,
      title: headline,
      source: channel.name,
      publishedAgo: 'Live',
      imageUrl: channel.backdropImage,
    }));
  }, [channel]);

  const currentBulletin =
    liveHeadlines[tickerIdx % Math.max(1, liveHeadlines.length)] ?? liveHeadlines[0];

  useEffect(() => {
    if (!isPlaying || liveHeadlines.length <= 1) return;
    const timer = window.setInterval(() => {
      setTickerIdx((prev) => (prev + 1) % liveHeadlines.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [channel.id, liveHeadlines.length, isPlaying]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (!isAudioLive || !currentBulletin) return;

    const utterance = new SpeechSynthesisUtterance(
      `${channel.name} Live. ${currentBulletin.title}`
    );
    utterance.lang = 'en-US';
    utterance.onend = () => {
      if (isPlaying && liveHeadlines.length > 1) {
        setTickerIdx((prev) => (prev + 1) % liveHeadlines.length);
      }
    };
    window.speechSynthesis.speak(utterance);

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [isAudioLive, currentBulletin?.id, channel.id]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const getFontFamily = (id: FontOptionId) =>
    FONT_OPTIONS.find((f) => f.id === id)?.cssFamily ?? FONT_OPTIONS[0].cssFamily;

  const bubbleRadius =
    typography.messageBubbleStyle === 'rounded'
      ? '14px'
      : typography.messageBubbleStyle === 'editorial'
        ? '8px'
        : '4px';

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onSendMessage({
      roomId: 'breaking',
      sender: 'You',
      isSelf: true,
      text: trimmed,
      quotedHeadline: currentBulletin
        ? `${channel.name}: ${currentBulletin.title}`
        : `${channel.name}: Live Bulletin`,
    });
    setChatInput('');
  };

  const liveChatMessages = messages.slice(-6);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20 md:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: getFontFamily(typography.headlineFont) }}
          >
            Crypto &amp; Forex Live TV
          </h1>
          <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--vp-muted)' }}>
            Global Crypto, Gold (XAU/USD), and Forex market broadcasts &amp; trader chat
          </p>
        </div>

        <div
          className="flex items-center gap-1 rounded-xl border p-1"
          style={{
            backgroundColor: 'var(--vp-elevated)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <button
            type="button"
            onClick={() => setStreamMode('studio')}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: streamMode === 'studio' ? 'var(--vp-primary)' : 'transparent',
              color: streamMode === 'studio' ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
            }}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>Live Bulletin Desk</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAudioLive(false);
              setStreamMode('youtube');
            }}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: streamMode === 'youtube' ? 'var(--vp-primary)' : 'transparent',
              color: streamMode === 'youtube' ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
            }}
          >
            <Tv className="h-3.5 w-3.5" />
            <span>YouTube Live Stream</span>
          </button>
        </div>
      </div>

      {/* Desktop 2-Column Broadcast + Live Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Video / Live Bulletin Viewport & Queue */}
        <div className="lg:col-span-8 space-y-5">
          <div
            className="overflow-hidden rounded-2xl border shadow-sm"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
            }}
          >
            {streamMode === 'youtube' && streamMeta?.youtubeChannelId ? (
              <div className="space-y-0">
                <div className="relative aspect-video w-full bg-slate-950">
                  <iframe
                    key={channel.id}
                    src={`https://www.youtube-nocookie.com/embed/live_stream?channel=${streamMeta.youtubeChannelId}&autoplay=0&rel=0`}
                    title={`${channel.name} live YouTube stream`}
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    color: 'var(--vp-muted)',
                  }}
                >
                  <span>
                    Streaming <strong style={{ color: 'var(--vp-text)' }}>{channel.name}</strong> ·{' '}
                    {streamMeta.focusCategory}
                  </span>
                  <a
                    href={streamMeta.watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold hover:underline"
                    style={{ color: 'var(--vp-primary)' }}
                  >
                    <span>Open Official Live Stream</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                <NewsImage
                  src={currentBulletin?.imageUrl || channel.backdropImage}
                  alt={currentBulletin?.title || `${channel.name} live broadcast`}
                  className={`h-full w-full object-cover transition-transform duration-700 ${
                    isPlaying ? 'scale-[1.02]' : 'scale-100 opacity-80'
                  }`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/35" />

                {/* Top Broadcast Overlay */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white tracking-wide">
                      LIVE DESK
                    </span>
                    <span className="rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                      {channel.language} · {currentBulletin?.publishedAgo}
                    </span>
                  </div>
                  <span
                    className="rounded-md px-2.5 py-1 text-xs font-extrabold"
                    style={{ backgroundColor: channel.brandBg, color: channel.brandFg }}
                  >
                    {channel.shortLogo}
                  </span>
                </div>

                {/* Bottom Live Headline & Controls */}
                <div className="absolute bottom-0 inset-x-0 p-3 sm:p-5 space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                        {channel.name} · {currentBulletin?.source}
                      </p>
                      <h2
                        className="text-base sm:text-xl font-bold text-white line-clamp-2 leading-snug"
                        style={{ fontFamily: getFontFamily(typography.headlineFont) }}
                      >
                        {currentBulletin?.title}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsPlaying((p) => !p)}
                        aria-label={isPlaying ? 'Pause live ticker' : 'Resume live ticker'}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-black/65 text-white backdrop-blur-sm cursor-pointer"
                      >
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAudioLive((m) => !m)}
                        aria-label={isAudioLive ? 'Mute voice anchor' : 'Listen to voice anchor'}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold backdrop-blur-sm cursor-pointer"
                        style={{
                          backgroundColor: isAudioLive ? 'var(--vp-primary)' : 'rgba(0,0,0,0.65)',
                          color: isAudioLive ? 'var(--vp-primary-fg)' : '#ffffff',
                        }}
                      >
                        {isAudioLive ? (
                          <Volume2 className="h-4 w-4" />
                        ) : (
                          <VolumeX className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">
                          {isAudioLive ? 'Anchor On' : 'Voice Anchor'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--vp-primary)',
                      color: 'var(--vp-primary-fg)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="uppercase tracking-wider text-[10px] opacity-85 shrink-0">
                        Live Wire {(tickerIdx % liveHeadlines.length) + 1}/{liveHeadlines.length}
                      </span>
                      <span className="truncate">{currentBulletin?.title}</span>
                    </div>
                    {streamMeta?.watchUrl && (
                      <a
                        href={streamMeta.watchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] underline shrink-0"
                      >
                        <span>Watch Live</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Channel Switcher Buttons directly below Player */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'fxstreet', label: 'FXStreet Forex Live' },
              { id: 'kitco', label: 'Kitco Gold & FX' },
              { id: 'coindesk', label: 'CoinDesk Crypto' },
              { id: 'cointelegraph', label: 'Cointelegraph' },
              { id: 'tradingview', label: 'TradingView Live' },
            ].map((item) => {
              const active = channel.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveChannelId(item.id);
                    setTickerIdx(0);
                  }}
                  className="min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border whitespace-nowrap cursor-pointer transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-surface)',
                    color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                    borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Live Bulletin Queue (Click to jump or open full article) */}
          <div
            className="rounded-2xl border p-4 space-y-3"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Live Bulletin Queue</h3>
              <span className="text-xs font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
                Synced from live wire
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {liveHeadlines.slice(0, 4).map((item, idx) => {
                const active = idx === tickerIdx % liveHeadlines.length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTickerIdx(idx)}
                    className="rounded-xl border p-3 text-left transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--vp-elevated)' : 'var(--vp-surface)',
                      borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                    }}
                  >
                    <span
                      className="block text-[11px] font-semibold"
                      style={{ color: active ? 'var(--vp-primary)' : 'var(--vp-accent)' }}
                    >
                      {item.source} · {item.publishedAgo}
                    </span>
                    <span className="block text-xs sm:text-sm font-semibold line-clamp-2 mt-1">
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Channel Switcher Grid */}
          <div>
            <h3 className="text-sm font-bold mb-3">All Live Channels</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {LIVE_CHANNELS.map((ch) => {
                const isSelected = ch.id === channel.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setActiveChannelId(ch.id);
                      setTickerIdx(0);
                    }}
                    className="flex flex-col items-center gap-2 rounded-2xl border p-2.5 transition-all cursor-pointer"
                    style={{
                      backgroundColor: isSelected ? 'var(--vp-elevated)' : 'var(--vp-surface)',
                      borderColor: isSelected ? 'var(--vp-primary)' : 'var(--vp-border)',
                    }}
                  >
                    <div
                      className="flex h-14 w-full items-center justify-center rounded-xl text-sm sm:text-base font-extrabold tracking-tight"
                      style={{
                        backgroundColor: ch.brandBg,
                        color: ch.brandFg,
                      }}
                    >
                      {ch.shortLogo}
                    </div>
                    <span className="text-xs font-semibold truncate w-full text-center">
                      {ch.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Viewer Chat Sidebar */}
        <aside
          className="lg:col-span-4 flex flex-col justify-between rounded-2xl border p-4 space-y-4"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <div className="border-b pb-3" style={{ borderColor: 'var(--vp-border)' }}>
            <h3 className="text-sm font-bold">Live Broadcast Chat</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--vp-muted)' }}>
              Using your custom message font & bubble palette
            </p>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[380px] pr-1">
            {liveChatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}
              >
                <div
                  className="max-w-[90%] px-3 py-2"
                  style={{
                    fontFamily: getFontFamily(typography.messageFont),
                    fontSize: `${typography.messageFontSize}px`,
                    backgroundColor: msg.isSelf ? 'var(--vp-msg-self-bg)' : 'var(--vp-msg-other-bg)',
                    color: msg.isSelf ? 'var(--vp-msg-self-fg)' : 'var(--vp-msg-other-fg)',
                    borderRadius: bubbleRadius,
                  }}
                >
                  <span className="block text-[10px] font-semibold opacity-75 mb-0.5">
                    {msg.sender} · {msg.timestamp}
                  </span>
                  <span className="leading-snug">{msg.text}</span>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={`Comment on ${channel.name}...`}
              className="flex-1 min-h-[44px] rounded-xl border px-3 text-sm outline-none"
              style={{
                fontFamily: getFontFamily(typography.messageFont),
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
                color: 'var(--vp-text)',
              }}
            />
            <button
              type="submit"
              aria-label="Send broadcast chat message"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl cursor-pointer"
              style={{
                backgroundColor: 'var(--vp-primary)',
                color: 'var(--vp-primary-fg)',
              }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
};
