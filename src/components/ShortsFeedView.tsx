import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Film,
  Heart,
  Link2,
  Maximize2,
  MessageCircle,
  Minimize2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  Share2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { FONT_OPTIONS } from '../data/newsData';
import type {
  FontOptionId,
  ShortVideoComment,
  ShortVideoItem,
  TypographySettings,
} from '../types/news';
import {
  AUTO_YOUTUBE_REEL_CHANNELS,
  buildPlaylistFallbackVideos,
  fetchLiveShortsVideos,
} from '../utils/marketFeeds';

interface ShortsFeedViewProps {
  typography: TypographySettings;
  userName?: string;
}

interface ReelCreatorProfile {
  key: string;
  creator: string;
  handle: string;
  initials: string;
  ringGradient: string;
  bio: string;
  categories: string[];
  followersCount: number;
  totalLikes: number;
  videos: ShortVideoItem[];
  verified: boolean;
}

const SHORTS_LIKES_KEY = 'vp_shorts_likes_state_v1';
const SHORTS_COMMENTS_KEY = 'vp_shorts_comments_state_v1';
const SHORTS_FOLLOWED_KEY = 'vp_shorts_followed_v1';
const SHORTS_SAVED_KEY = 'vp_shorts_saved_v1';

const RING_GRADIENTS = [
  'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
  'linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #0ea5e9 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 60%, #ec4899 100%)',
];

function normalizeHandle(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 24);
  return cleaned || 'channel';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return 'VP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) % 100000;
  }
  return h;
}

function formatCompactCount(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(val);
}

function formatRelativePublished(iso?: string): string {
  if (!iso) return 'Latest';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'Latest';
  const diffHours = Math.max(0, Math.floor((Date.now() - ms) / 3_600_000));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function buildYouTubeEmbedSrc(
  video: ShortVideoItem,
  isActive: boolean,
  initialMuted: boolean
): string {
  const originParam =
    typeof window !== 'undefined' && window.location?.origin
      ? `&origin=${encodeURIComponent(window.location.origin)}`
      : '';
  const commonParams = `rel=0&modestbranding=1&playsinline=1&enablejsapi=1&autoplay=${
    isActive ? 1 : 0
  }&mute=${initialMuted ? 1 : 0}${originParam}`;

  if (video.isFallbackPlaylist && video.playlistId) {
    return `https://www.youtube.com/embed?listType=playlist&list=${encodeURIComponent(
      video.playlistId
    )}&${commonParams}`;
  }
  if (video.youtubeVideoId) {
    return `https://www.youtube.com/embed/${encodeURIComponent(
      video.youtubeVideoId
    )}?${commonParams}`;
  }
  return video.videoUrl;
}

function isDirectVideoFile(video: ShortVideoItem): boolean {
  if (video.youtubeVideoId || video.isFallbackPlaylist) return false;
  return /\.(mp4|webm|mov)(\?|$)/i.test(video.videoUrl) || video.videoUrl.startsWith('blob:');
}

export const ShortsFeedView: React.FC<ShortsFeedViewProps> = ({
  typography,
  userName = 'You',
}) => {
  const [liveShorts, setLiveShorts] = useState<ShortVideoItem[]>(() =>
    buildPlaylistFallbackVideos()
  );
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(SHORTS_LIKES_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(SHORTS_SAVED_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [followedMap, setFollowedMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(SHORTS_FOLLOWED_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [commentsMap, setCommentsMap] = useState<Record<string, ShortVideoComment[]>>(() => {
    try {
      const raw = localStorage.getItem(SHORTS_COMMENTS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, ShortVideoComment[]>) : {};
    } catch {
      return {};
    }
  });

  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullScreenReels, setIsFullScreenReels] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  // Comment Drawer State
  const [commentDrawerId, setCommentDrawerId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');

  // Instagram-Style Channel Reel Profiles Modal State
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalMode, setProfileModalMode] = useState<'profile' | 'directory'>('profile');
  const [selectedCreatorKey, setSelectedCreatorKey] = useState<string | null>(null);
  const [profileSubTab, setProfileSubTab] = useState<'reels' | 'saved'>('reels');
  const [creatorSearch, setCreatorSearch] = useState('');

  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const mountMutedRef = useRef<Record<string, boolean>>({});
  const isMutedRef = useRef<boolean>(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const getFontFamily = (id: FontOptionId) =>
    FONT_OPTIONS.find((f) => f.id === id)?.cssFamily ?? FONT_OPTIONS[0].cssFamily;

  const showNotice = (msg: string) => {
    setToastNotice(msg);
    window.setTimeout(() => {
      setToastNotice((prev) => (prev === msg ? null : prev));
    }, 2400);
  };

  const loadAutoReels = async () => {
    setLoading(true);
    const fetched = await fetchLiveShortsVideos();
    setLiveShorts(fetched.length > 0 ? fetched : buildPlaylistFallbackVideos());
    setLastSyncedAt(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    setLoading(false);
  };

  useEffect(() => {
    loadAutoReels();
    // Auto-refresh feed silently every 10 minutes
    const timer = window.setInterval(() => {
      loadAutoReels();
    }, 600_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SHORTS_LIKES_KEY, JSON.stringify(likedMap));
    } catch {
      // ignore
    }
  }, [likedMap]);

  useEffect(() => {
    try {
      localStorage.setItem(SHORTS_SAVED_KEY, JSON.stringify(savedMap));
    } catch {
      // ignore
    }
  }, [savedMap]);

  useEffect(() => {
    try {
      localStorage.setItem(SHORTS_FOLLOWED_KEY, JSON.stringify(followedMap));
    } catch {
      // ignore
    }
  }, [followedMap]);

  useEffect(() => {
    try {
      localStorage.setItem(SHORTS_COMMENTS_KEY, JSON.stringify(commentsMap));
    } catch {
      // ignore
    }
  }, [commentsMap]);

  // Escape exits fullscreen vertical reels mode
  useEffect(() => {
    if (!isFullScreenReels) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullScreenReels(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullScreenReels]);

  const filteredVideos = useMemo(() => {
    if (channelFilter === 'ALL') return liveShorts;
    return liveShorts.filter((v) => v.creator === channelFilter);
  }, [liveShorts, channelFilter]);

  const creatorProfiles = useMemo<ReelCreatorProfile[]>(() => {
    return AUTO_YOUTUBE_REEL_CHANNELS.map((ch) => {
      const key = normalizeHandle(ch.channelName);
      const seed = hashSeed(key);
      const channelVideos = liveShorts.filter((v) => v.creator === ch.channelName);
      const totalLikes = channelVideos.reduce(
        (sum, v) => sum + v.likesCount + (likedMap[v.id] ? 1 : 0),
        0
      );
      const followersCount =
        (ch.channelName === 'Kitco NEWS'
          ? 685000
          : ch.channelName === 'CoinDesk'
            ? 410000
            : ch.channelName === 'Cointelegraph'
              ? 325000
              : 245000) + (followedMap[key] ? 1 : 0);

      return {
        key,
        creator: ch.channelName,
        handle: `@${key}`,
        initials: getInitials(ch.channelName),
        ringGradient: RING_GRADIENTS[seed % RING_GRADIENTS.length],
        bio: `Official automated YouTube RSS feed for ${ch.channelName} (${ch.category}).`,
        categories: [ch.category],
        followersCount,
        totalLikes,
        videos: channelVideos,
        verified: true,
      };
    });
  }, [liveShorts, likedMap, followedMap]);

  const activeProfile = useMemo(() => {
    if (selectedCreatorKey) {
      return (
        creatorProfiles.find((p) => p.key === selectedCreatorKey) ??
        creatorProfiles[0] ??
        null
      );
    }
    return creatorProfiles[0] ?? null;
  }, [creatorProfiles, selectedCreatorKey]);

  const savedVideos = useMemo(
    () => liveShorts.filter((v) => Boolean(savedMap[v.id])),
    [liveShorts, savedMap]
  );

  const sendYouTubeCommand = (
    iframe: HTMLIFrameElement | null | undefined,
    func: string,
    args: unknown[] = []
  ) => {
    const win = iframe?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    } catch {
      // ignore cross-origin postMessage restrictions
    }
  };

  const applyAudioToReel = (videoId: string, nextMuted: boolean) => {
    const videoEl = videoRefs.current[videoId];
    if (videoEl) {
      videoEl.muted = nextMuted;
      videoEl.volume = nextMuted ? 0 : 1.0;
      if (!nextMuted && videoEl.paused) {
        videoEl.play().catch(() => {});
      }
    }

    const iframeEl = iframeRefs.current[videoId];
    if (iframeEl) {
      if (nextMuted) {
        sendYouTubeCommand(iframeEl, 'mute');
      } else {
        sendYouTubeCommand(iframeEl, 'unMute');
        sendYouTubeCommand(iframeEl, 'setVolume', [100]);
        sendYouTubeCommand(iframeEl, 'playVideo');
      }
    }
  };

  const handleSetMutedState = (nextMuted: boolean, targetVideoId?: string) => {
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);

    const activeVidId = targetVideoId ?? filteredVideos[activeIndex]?.id;
    if (activeVidId) {
      applyAudioToReel(activeVidId, nextMuted);
      if (!nextMuted) {
        window.setTimeout(() => applyAudioToReel(activeVidId, false), 150);
      }
    }

    // Sync any mounted direct video tags so scrolled cards remember the unmuted audio state
    Object.values(videoRefs.current).forEach((el) => {
      if (!el) return;
      el.muted = nextMuted;
      el.volume = nextMuted ? 0 : 1.0;
    });
  };

  const handleToggleMute = (videoId: string) => {
    handleSetMutedState(!isMutedRef.current, videoId);
  };

  const handleTapVideoToUnmute = (videoId: string) => {
    if (isMutedRef.current) {
      handleSetMutedState(false, videoId);
      return;
    }
    const videoEl = videoRefs.current[videoId];
    if (videoEl) {
      videoEl.muted = false;
      videoEl.volume = 1.0;
      if (videoEl.paused) {
        videoEl.play().catch(() => {});
      } else {
        videoEl.pause();
      }
    }
  };

  // Sync audio & playback automatically whenever user scrolls to a new active reel
  useEffect(() => {
    const activeVid = filteredVideos[activeIndex];
    if (!activeVid) return;

    // Pause/mute non-active reels so only the active reel plays audio cleanly
    filteredVideos.forEach((v, idx) => {
      if (idx === activeIndex) return;
      const vidEl = videoRefs.current[v.id];
      if (vidEl && !vidEl.paused) {
        vidEl.pause();
      }
      const frameEl = iframeRefs.current[v.id];
      if (frameEl) {
        sendYouTubeCommand(frameEl, 'pauseVideo');
        sendYouTubeCommand(frameEl, 'mute');
      }
    });

    // Play & apply remembered mute/unmute state on the newly visible active reel
    const syncActive = () => {
      const vidEl = videoRefs.current[activeVid.id];
      if (vidEl) {
        vidEl.muted = isMutedRef.current;
        vidEl.volume = isMutedRef.current ? 0 : 1.0;
        vidEl.play().catch(() => {});
      }
      const frameEl = iframeRefs.current[activeVid.id];
      if (frameEl) {
        sendYouTubeCommand(frameEl, 'playVideo');
        if (isMutedRef.current) {
          sendYouTubeCommand(frameEl, 'mute');
        } else {
          sendYouTubeCommand(frameEl, 'unMute');
          sendYouTubeCommand(frameEl, 'setVolume', [100]);
        }
      }
    };

    syncActive();
    const t1 = window.setTimeout(syncActive, 180);
    const t2 = window.setTimeout(syncActive, 500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [activeIndex, isMuted, filteredVideos]);

  // Track visible snap-scroll reel card
  useEffect(() => {
    const container = feedContainerRef.current;
    if (!container || filteredVideos.length === 0) return;

    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-reel-index]'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number(entry.target.getAttribute('data-reel-index'));
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveIndex(idx);
          }
        });
      },
      { root: container, threshold: [0.6] }
    );

    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [filteredVideos.length, channelFilter, isFullScreenReels]);

  const scrollToIndex = (targetIdx: number) => {
    const clamped = Math.max(0, Math.min(filteredVideos.length - 1, targetIdx));
    const container = feedContainerRef.current;
    const targetEl = container?.querySelector<HTMLElement>(
      `[data-reel-index="${clamped}"]`
    );
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveIndex(clamped);
  };

  const toggleLike = (videoId: string) => {
    setLikedMap((prev) => ({
      ...prev,
      [videoId]: !prev[videoId],
    }));
  };

  const toggleSave = (videoId: string) => {
    setSavedMap((prev) => {
      const nextVal = !prev[videoId];
      showNotice(nextVal ? 'Reel saved to Saved list' : 'Removed from Saved reels');
      return { ...prev, [videoId]: nextVal };
    });
  };

  const toggleFollowCreator = (creatorKey: string, displayName: string) => {
    setFollowedMap((prev) => {
      const next = !prev[creatorKey];
      showNotice(next ? `Following ${displayName}` : `Unfollowed ${displayName}`);
      return { ...prev, [creatorKey]: next };
    });
  };

  const handleShareReel = async (video: ShortVideoItem) => {
    const shareUrl =
      video.externalLink ||
      (video.youtubeVideoId
        ? `https://www.youtube.com/watch?v=${video.youtubeVideoId}`
        : window.location.href);
    const shareText = `${video.title} — ${video.creator} on Varta Presh Reels`;
    if (navigator.share) {
      try {
        await navigator.share({ title: video.title, text: shareText, url: shareUrl });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} (${shareUrl})`);
      showNotice('Video link copied to clipboard');
    } catch {
      showNotice(`Ready to share: ${video.title}`);
    }
  };

  const handleCopyProfileLink = async (profile: ReelCreatorProfile) => {
    const ch = AUTO_YOUTUBE_REEL_CHANNELS.find(
      (c) => normalizeHandle(c.channelName) === profile.key
    );
    const url = ch
      ? `https://www.youtube.com/channel/${ch.channelId}`
      : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showNotice(`Copied ${profile.creator} channel link`);
    } catch {
      showNotice(`${profile.creator} channel link ready`);
    }
  };

  const openCreatorProfile = (
    creatorNameOrKey: string,
    mode: 'profile' | 'directory' = 'profile'
  ) => {
    setSelectedCreatorKey(normalizeHandle(creatorNameOrKey));
    setProfileModalMode(mode);
    setProfileSubTab('reels');
    setProfileModalOpen(true);
  };

  const jumpToReel = (videoId: string) => {
    setChannelFilter('ALL');
    setProfileModalOpen(false);
    window.setTimeout(() => {
      const container = feedContainerRef.current;
      const target = container?.querySelector<HTMLElement>(
        `[data-reel-id="${videoId}"]`
      );
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 90);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentDrawerId) return;
    const text = commentInput.trim();
    if (!text) return;

    const entry: ShortVideoComment = {
      id: `sc-${Date.now()}`,
      author: userName || 'You',
      text,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setCommentsMap((prev) => ({
      ...prev,
      [commentDrawerId]: [...(prev[commentDrawerId] ?? []), entry],
    }));
    setCommentInput('');
  };

  const drawerVideo = liveShorts.find((v) => v.id === commentDrawerId) ?? null;
  const drawerComments = commentDrawerId ? commentsMap[commentDrawerId] ?? [] : [];

  const filteredDirectoryProfiles = useMemo(() => {
    const q = creatorSearch.trim().toLowerCase();
    if (!q) return creatorProfiles;
    return creatorProfiles.filter(
      (p) =>
        p.creator.toLowerCase().includes(q) ||
        p.handle.toLowerCase().includes(q) ||
        p.categories.some((c) => c.toLowerCase().includes(q))
    );
  }, [creatorProfiles, creatorSearch]);

  const activeReel = filteredVideos[activeIndex] ?? filteredVideos[0];
  const isPlaylistFallbackActive = liveShorts.every((v) => v.isFallbackPlaylist);

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-16 md:pb-6">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold" style={{ color: 'var(--vp-muted)' }}>
            <Radio className="h-3.5 w-3.5 text-emerald-500" />
            <span>100% Automatic Crypto &amp; Forex YouTube RSS2JSON Feed</span>
            <span aria-hidden="true">·</span>
            <span>CoinDesk · Cointelegraph · Kitco NEWS · FXStreet</span>
            {lastSyncedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">Synced {lastSyncedAt}</span>
              </>
            )}
          </div>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5"
            style={{ fontFamily: getFontFamily(typography.headlineFont) }}
          >
            Crypto &amp; Forex Market Reels
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              openCreatorProfile(
                AUTO_YOUTUBE_REEL_CHANNELS[0].channelName,
                'directory'
              )
            }
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
              color: 'var(--vp-text)',
            }}
          >
            <Users className="h-3.5 w-3.5" style={{ color: 'var(--vp-primary)' }} />
            <span>Channel Profiles ({creatorProfiles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullScreenReels(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
              color: 'var(--vp-text)',
            }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Full Screen Feed</span>
          </button>

          <button
            type="button"
            onClick={loadAutoReels}
            disabled={loading}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--vp-primary)',
              color: 'var(--vp-primary-fg)',
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Syncing RSS...' : 'Sync Latest'}</span>
          </button>
        </div>
      </div>

      {/* Inline Toast Feedback */}
      {toastNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-primary)',
            color: 'var(--vp-text)',
          }}
        >
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            {toastNotice}
          </span>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            aria-label="Dismiss notification"
            className="cursor-pointer opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Channel Filter + Story-Ring Profile Strip */}
      <section
        aria-label="Channel reel profiles and filters"
        className="rounded-2xl border p-3.5 space-y-3"
        style={{
          backgroundColor: 'var(--vp-surface)',
          borderColor: 'var(--vp-border)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', ...AUTO_YOUTUBE_REEL_CHANNELS.map((c) => c.channelName)] as const).map(
              (chName) => {
                const active = channelFilter === chName;
                const count =
                  chName === 'ALL'
                    ? liveShorts.length
                    : liveShorts.filter((v) => v.creator === chName).length;
                return (
                  <button
                    key={chName}
                    type="button"
                    onClick={() => {
                      setChannelFilter(chName);
                      setActiveIndex(0);
                      if (feedContainerRef.current) {
                        feedContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="min-h-[36px] rounded-xl border px-3 text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                      color: active ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                      borderColor: active ? 'var(--vp-primary)' : 'var(--vp-border)',
                    }}
                  >
                    {chName === 'ALL' ? `All Channels (${count})` : `${chName} (${count})`}
                  </button>
                );
              }
            )}
          </div>

          <span className="text-[11px] font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
            {isPlaylistFallbackActive
              ? 'Auto Playlist Fallback Active'
              : 'Live YouTube RSS2JSON Active'}
          </span>
        </div>

        {/* Story Rings for Each Channel Profile */}
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pt-1">
          {creatorProfiles.map((prof) => {
            const isPlayingCreator =
              activeReel && normalizeHandle(activeReel.creator) === prof.key;
            return (
              <button
                key={prof.key}
                type="button"
                onClick={() => openCreatorProfile(prof.key, 'profile')}
                className="flex items-center gap-2.5 rounded-xl border px-3 py-2 shrink-0 cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: isPlayingCreator ? 'var(--vp-primary)' : 'var(--vp-border)',
                }}
              >
                <div
                  className="p-[2px] rounded-full shrink-0"
                  style={{ background: prof.ringGradient }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--vp-surface)',
                      borderColor: 'var(--vp-elevated)',
                    }}
                  >
                    {prof.initials}
                  </div>
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold">{prof.creator}</span>
                    <BadgeCheck className="h-3.5 w-3.5 text-sky-500" />
                  </div>
                  <span className="block text-[11px] font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
                    {prof.categories[0]} · {prof.videos.length} reels
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Layout: Full-Height Vertical Reels Snap Feed + Active Channel Profile & Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Vertical Swipe Reels Player (h-screen snap-y snap-mandatory overflow-y-scroll) */}
        <div
          className={
            isFullScreenReels
              ? 'fixed inset-0 z-[95] bg-black flex items-center justify-center'
              : 'lg:col-span-7 flex justify-center'
          }
        >
          <div
            className={
              isFullScreenReels
                ? 'relative w-full max-w-[480px] h-screen'
                : 'relative w-full max-w-[440px]'
            }
          >
            {isFullScreenReels && (
              <button
                type="button"
                onClick={() => setIsFullScreenReels(false)}
                aria-label="Exit full screen reels"
                className="fixed top-4 right-4 z-[100] inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-black/75 border border-white/25 px-3.5 text-xs font-semibold text-white backdrop-blur-md cursor-pointer"
              >
                <Minimize2 className="h-4 w-4" />
                <span>Exit (Esc)</span>
              </button>
            )}

            <div
              ref={feedContainerRef}
              className="h-screen max-h-[820px] snap-y snap-mandatory overflow-y-scroll no-scrollbar rounded-3xl bg-black shadow-2xl"
              style={
                isFullScreenReels
                  ? { height: '100vh', maxHeight: '100vh', borderRadius: 0 }
                  : undefined
              }
            >
              {filteredVideos.map((video, idx) => {
                const liked = Boolean(likedMap[video.id]);
                const saved = Boolean(savedMap[video.id]);
                const creatorKey = normalizeHandle(video.creator);
                const isFollowing = Boolean(followedMap[creatorKey]);
                const creatorProfile = creatorProfiles.find((p) => p.key === creatorKey);
                const totalLikes = video.likesCount + (liked ? 1 : 0);
                const commentsCount =
                  (commentsMap[video.id]?.length ?? 0) + video.comments.length;
                const shouldRenderIframe = Math.abs(idx - activeIndex) <= 1;
                const directVideo = isDirectVideoFile(video);
                if (idx !== activeIndex || mountMutedRef.current[video.id] === undefined) {
                  mountMutedRef.current[video.id] = isMuted;
                }
                const embedSrc = buildYouTubeEmbedSrc(
                  video,
                  idx === activeIndex,
                  mountMutedRef.current[video.id]
                );

                return (
                  <section
                    key={video.id}
                    data-reel-index={idx}
                    data-reel-id={video.id}
                    className="relative h-full w-full snap-start snap-always flex items-center justify-center bg-black overflow-hidden"
                  >
                    {/* Direct Video Tag OR YouTube Embed Iframe for Active/Adjacent Slides */}
                    {directVideo ? (
                      <video
                        ref={(el) => {
                          videoRefs.current[video.id] = el;
                          if (el) {
                            el.muted = isMuted;
                            el.volume = isMuted ? 0 : 1.0;
                          }
                        }}
                        src={video.videoUrl}
                        loop
                        playsInline
                        autoPlay={idx === activeIndex}
                        muted={isMuted}
                        onClick={() => handleTapVideoToUnmute(video.id)}
                        className="h-full w-full object-cover cursor-pointer"
                      />
                    ) : shouldRenderIframe ? (
                      <iframe
                        ref={(el) => {
                          iframeRefs.current[video.id] = el;
                        }}
                        key={`${video.id}-${idx === activeIndex ? 'active' : 'idle'}`}
                        src={embedSrc}
                        title={video.title}
                        onLoad={() => {
                          if (idx === activeIndex) {
                            applyAudioToReel(video.id, isMutedRef.current);
                          } else {
                            sendYouTubeCommand(iframeRefs.current[video.id], 'mute');
                          }
                        }}
                        allow="autoplay; encrypted-media; accelerometer; clipboard-write; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        className="h-full w-full border-0"
                      />
                    ) : (
                      <div className="relative h-full w-full bg-black">
                        {video.thumbnailUrl && (
                          <img
                            src={video.thumbnailUrl}
                            alt={video.title}
                            className="h-full w-full object-cover opacity-80"
                          />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/65 text-white">
                            <Play className="h-7 w-7 fill-current ml-1" />
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Tap-Anywhere Overlay While Muted to Immediately Unmute & Remember Audio */}
                    {isMuted && !directVideo && (
                      <button
                        type="button"
                        onClick={() => handleTapVideoToUnmute(video.id)}
                        aria-label="Tap anywhere on video to unmute audio"
                        className="absolute inset-0 z-[5] flex items-center justify-center bg-transparent cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2 rounded-full bg-black/70 border border-white/25 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md shadow-lg">
                          <VolumeX className="h-4 w-4 text-amber-400" />
                          <span>Tap anywhere for sound</span>
                        </span>
                      </button>
                    )}

                    {/* Top Metadata & Category Badge + Visible Speaker Button */}
                    <div className="pointer-events-none absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/80 to-transparent" />
                    <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between gap-2 z-10">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="rounded-lg px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shrink-0"
                          style={{ backgroundColor: 'var(--vp-primary)' }}
                        >
                          {video.category}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-white/90 truncate">
                          {formatRelativePublished(video.publishedAt)} · {idx + 1}/
                          {filteredVideos.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleMute(video.id)}
                          aria-label={isMuted ? 'Unmute video audio' : 'Mute video audio'}
                          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/25 px-3 text-xs font-semibold text-white backdrop-blur-md cursor-pointer"
                          style={{
                            backgroundColor: isMuted
                              ? 'rgba(0, 0, 0, 0.7)'
                              : 'rgba(16, 185, 129, 0.85)',
                          }}
                        >
                          {isMuted ? (
                            <>
                              <VolumeX className="h-4 w-4" />
                              <span>Muted</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="h-4 w-4" />
                              <span>Sound On</span>
                            </>
                          )}
                        </button>

                        {video.externalLink && (
                          <a
                            href={video.externalLink}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open video on YouTube"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Bottom Scrim */}
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

                    {/* Right Side Overlay Action Controls: Prev/Next, Sound, Like, Comment, Share, Save */}
                    <div className="absolute right-3 bottom-16 flex flex-col items-center gap-3 z-10">
                      <button
                        type="button"
                        onClick={() => scrollToIndex(idx - 1)}
                        disabled={idx === 0}
                        aria-label="Previous reel"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md cursor-pointer disabled:opacity-35"
                      >
                        <ChevronUp className="h-5 w-5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleMute(video.id)}
                        className="flex flex-col items-center gap-0.5 text-white cursor-pointer"
                        aria-label={isMuted ? 'Turn sound on' : 'Mute sound'}
                      >
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition-transform active:scale-90"
                          style={{
                            backgroundColor: isMuted
                              ? 'rgba(0, 0, 0, 0.65)'
                              : 'rgba(16, 185, 129, 0.85)',
                            color: '#ffffff',
                          }}
                        >
                          {isMuted ? (
                            <VolumeX className="h-5 w-5" />
                          ) : (
                            <Volume2 className="h-5 w-5" />
                          )}
                        </span>
                        <span className="text-[11px] font-semibold">
                          {isMuted ? 'Unmute' : 'Audio'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleLike(video.id)}
                        className="flex flex-col items-center gap-0.5 text-white cursor-pointer"
                        aria-label={liked ? 'Unlike video' : 'Like video'}
                      >
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-md transition-transform active:scale-90"
                          style={{ color: liked ? '#f43f5e' : '#ffffff' }}
                        >
                          <Heart className={`h-6 w-6 ${liked ? 'fill-current' : ''}`} />
                        </span>
                        <span className="text-xs font-mono-tabular font-semibold">
                          {formatCompactCount(totalLikes)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCommentDrawerId(video.id)}
                        className="flex flex-col items-center gap-0.5 text-white cursor-pointer"
                        aria-label="Open comments"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-md">
                          <MessageCircle className="h-6 w-6" />
                        </span>
                        <span className="text-xs font-mono-tabular font-semibold">
                          {formatCompactCount(commentsCount)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareReel(video)}
                        className="flex flex-col items-center gap-0.5 text-white cursor-pointer"
                        aria-label="Share video"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-md">
                          <Share2 className="h-5 w-5" />
                        </span>
                        <span className="text-[11px] font-semibold">Share</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleSave(video.id)}
                        className="flex flex-col items-center gap-0.5 text-white cursor-pointer"
                        aria-label={saved ? 'Remove saved reel' : 'Save reel'}
                      >
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-md"
                          style={{ color: saved ? '#facc15' : '#ffffff' }}
                        >
                          <Bookmark className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
                        </span>
                        <span className="text-[11px] font-semibold">
                          {saved ? 'Saved' : 'Save'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => scrollToIndex(idx + 1)}
                        disabled={idx >= filteredVideos.length - 1}
                        aria-label="Next reel"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md cursor-pointer disabled:opacity-35"
                      >
                        <ChevronDown className="h-5 w-5" />
                      </button>
                    </div>

                    {/* Bottom-Left Channel Info, Category, & Video Title */}
                    <div className="absolute bottom-4 left-3.5 right-20 text-white space-y-1.5 z-10">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openCreatorProfile(creatorKey, 'profile')}
                          className="inline-flex items-center gap-2 cursor-pointer group"
                        >
                          <span
                            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold shrink-0"
                            style={{
                              background: creatorProfile?.ringGradient ?? RING_GRADIENTS[0],
                            }}
                          >
                            {creatorProfile?.initials ?? getInitials(video.creator)}
                          </span>
                          <span className="text-sm font-bold group-hover:underline">
                            {video.creator}
                          </span>
                          <BadgeCheck className="h-4 w-4 text-sky-400 shrink-0" />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleFollowCreator(creatorKey, video.creator)}
                          className="min-h-[30px] rounded-lg border px-2.5 text-xs font-semibold cursor-pointer backdrop-blur-md"
                          style={{
                            backgroundColor: isFollowing
                              ? 'rgba(255,255,255,0.22)'
                              : 'rgba(255,255,255,0.1)',
                            borderColor: 'rgba(255,255,255,0.55)',
                            color: '#ffffff',
                          }}
                        >
                          {isFollowing ? 'Following' : 'Follow'}
                        </button>
                      </div>

                      <h2 className="text-sm sm:text-base font-bold leading-snug line-clamp-2">
                        {video.title}
                      </h2>

                      <p className="text-[11px] text-white/80 truncate">
                        {video.sourceName} · Swipe up/down or use arrows to switch reels
                      </p>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Desk: Active Channel Reels Profile & Auto-Fetched Queue */}
        <aside className="lg:col-span-5 space-y-4">
          {activeReel && (() => {
            const activeKey = normalizeHandle(activeReel.creator);
            const prof =
              creatorProfiles.find((p) => p.key === activeKey) ?? creatorProfiles[0];
            if (!prof) return null;
            const isFollowing = Boolean(followedMap[prof.key]);

            return (
              <div
                className="rounded-2xl border p-4 sm:p-5 space-y-4"
                style={{
                  backgroundColor: 'var(--vp-surface)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="p-[2.5px] rounded-full shrink-0"
                      style={{ background: prof.ringGradient }}
                    >
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-bold"
                        style={{
                          backgroundColor: 'var(--vp-elevated)',
                          borderColor: 'var(--vp-surface)',
                        }}
                      >
                        {prof.initials}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-base font-bold truncate">{prof.creator}</h2>
                        <BadgeCheck className="h-4 w-4 text-sky-500 shrink-0" />
                      </div>
                      <p className="text-xs font-mono-tabular truncate" style={{ color: 'var(--vp-muted)' }}>
                        {prof.handle} · {prof.categories[0]}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleFollowCreator(prof.key, prof.creator)}
                    className="min-h-[36px] rounded-xl px-3.5 text-xs font-semibold cursor-pointer shrink-0"
                    style={{
                      backgroundColor: isFollowing ? 'var(--vp-elevated)' : 'var(--vp-primary)',
                      color: isFollowing ? 'var(--vp-text)' : 'var(--vp-primary-fg)',
                    }}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                </div>

                {/* Stats */}
                <div
                  className="grid grid-cols-3 gap-2 rounded-xl border p-3 text-center font-mono-tabular"
                  style={{
                    backgroundColor: 'var(--vp-elevated)',
                    borderColor: 'var(--vp-border)',
                  }}
                >
                  <div>
                    <span className="block text-sm font-bold">{prof.videos.length}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                      Auto Reels
                    </span>
                  </div>
                  <div>
                    <span className="block text-sm font-bold">
                      {formatCompactCount(prof.followersCount)}
                    </span>
                    <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                      Subscribers
                    </span>
                  </div>
                  <div>
                    <span className="block text-sm font-bold">
                      {formatCompactCount(prof.totalLikes)}
                    </span>
                    <span className="block text-[11px]" style={{ color: 'var(--vp-muted)' }}>
                      Likes
                    </span>
                  </div>
                </div>

                {/* Latest Reels Queue for Quick Tap-to-Play */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Up Next from {prof.creator}</span>
                    <button
                      type="button"
                      onClick={() => openCreatorProfile(prof.key, 'profile')}
                      className="cursor-pointer hover:underline"
                      style={{ color: 'var(--vp-primary)' }}
                    >
                      View Grid
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {prof.videos.slice(0, 6).map((clip) => {
                      const isCurrent = clip.id === activeReel.id;
                      return (
                        <button
                          key={clip.id}
                          type="button"
                          onClick={() => jumpToReel(clip.id)}
                          className="w-full flex items-center gap-3 rounded-xl border p-2 text-left cursor-pointer transition-colors"
                          style={{
                            backgroundColor: isCurrent
                              ? 'var(--vp-surface)'
                              : 'var(--vp-elevated)',
                            borderColor: isCurrent ? 'var(--vp-primary)' : 'var(--vp-border)',
                          }}
                        >
                          <div className="relative h-14 w-24 rounded-lg overflow-hidden bg-black shrink-0">
                            {clip.thumbnailUrl ? (
                              <img
                                src={clip.thumbnailUrl}
                                alt={clip.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-white text-[10px] font-bold">
                                PLAYLIST
                              </div>
                            )}
                            <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                              <Play className="h-4 w-4 fill-current" />
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-bold line-clamp-2 leading-snug">
                              {clip.title}
                            </span>
                            <span
                              className="block text-[11px] font-mono-tabular mt-0.5"
                              style={{ color: 'var(--vp-muted)' }}
                            >
                              {formatRelativePublished(clip.publishedAt)} · {clip.category}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </aside>
      </div>

      {/* Channel Reel Profiles & All Profiles Directory Modal */}
      {profileModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Channel reel profiles"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setProfileModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-t-3xl sm:rounded-2xl border p-5 space-y-4 max-h-[88vh] flex flex-col"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
              color: 'var(--vp-text)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b shrink-0"
              style={{ borderColor: 'var(--vp-border)' }}
            >
              <div className="flex items-center gap-2">
                {profileModalMode === 'profile' && activeProfile ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setProfileModalMode('directory')}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border px-2.5 text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor: 'var(--vp-elevated)',
                        borderColor: 'var(--vp-border)',
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>All Channels</span>
                    </button>
                    <span className="text-sm sm:text-base font-bold">
                      {activeProfile.creator}
                    </span>
                    <BadgeCheck className="h-4 w-4 text-sky-500 shrink-0" />
                  </>
                ) : (
                  <span className="text-base font-bold">
                    All Crypto &amp; Forex Reel Profiles ({creatorProfiles.length})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1 rounded-xl p-1"
                  style={{ backgroundColor: 'var(--vp-elevated)' }}
                >
                  <button
                    type="button"
                    onClick={() => setProfileModalMode('profile')}
                    className="min-h-[32px] rounded-lg px-2.5 text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor:
                        profileModalMode === 'profile' ? 'var(--vp-primary)' : 'transparent',
                      color:
                        profileModalMode === 'profile'
                          ? 'var(--vp-primary-fg)'
                          : 'var(--vp-muted)',
                    }}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileModalMode('directory')}
                    className="min-h-[32px] rounded-lg px-2.5 text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor:
                        profileModalMode === 'directory' ? 'var(--vp-primary)' : 'transparent',
                      color:
                        profileModalMode === 'directory'
                          ? 'var(--vp-primary-fg)'
                          : 'var(--vp-muted)',
                    }}
                  >
                    All Profiles ({creatorProfiles.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="p-2 rounded-lg cursor-pointer"
                  aria-label="Close profile dialog"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {profileModalMode === 'profile' && activeProfile ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className="p-[3px] rounded-full shrink-0"
                        style={{ background: activeProfile.ringGradient }}
                      >
                        <div
                          className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full border-2 text-lg sm:text-xl font-bold"
                          style={{
                            backgroundColor: 'var(--vp-elevated)',
                            borderColor: 'var(--vp-surface)',
                          }}
                        >
                          {activeProfile.initials}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-lg font-bold">{activeProfile.creator}</h3>
                          <BadgeCheck className="h-4 w-4 text-sky-500" />
                        </div>
                        <p className="text-xs font-mono-tabular" style={{ color: 'var(--vp-muted)' }}>
                          {activeProfile.handle} · {activeProfile.categories.join(', ')}
                        </p>
                        <p className="text-xs max-w-md" style={{ color: 'var(--vp-muted)' }}>
                          {activeProfile.bio}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          toggleFollowCreator(activeProfile.key, activeProfile.creator)
                        }
                        className="min-h-[40px] rounded-xl px-4 text-xs font-semibold cursor-pointer"
                        style={{
                          backgroundColor: followedMap[activeProfile.key]
                            ? 'var(--vp-elevated)'
                            : 'var(--vp-primary)',
                          color: followedMap[activeProfile.key]
                            ? 'var(--vp-text)'
                            : 'var(--vp-primary-fg)',
                        }}
                      >
                        {followedMap[activeProfile.key] ? 'Following' : 'Follow'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyProfileLink(activeProfile)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold cursor-pointer"
                        style={{
                          backgroundColor: 'var(--vp-elevated)',
                          borderColor: 'var(--vp-border)',
                        }}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        <span>Copy Link</span>
                      </button>
                    </div>
                  </div>

                  <div
                    className="grid grid-cols-3 gap-2 rounded-xl border p-3 text-center font-mono-tabular"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor: 'var(--vp-border)',
                    }}
                  >
                    <div>
                      <span className="block text-base font-bold">
                        {activeProfile.videos.length}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--vp-muted)' }}>
                        Auto Reels
                      </span>
                    </div>
                    <div>
                      <span className="block text-base font-bold">
                        {formatCompactCount(activeProfile.followersCount)}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--vp-muted)' }}>
                        Subscribers
                      </span>
                    </div>
                    <div>
                      <span className="block text-base font-bold">
                        {formatCompactCount(activeProfile.totalLikes)}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--vp-muted)' }}>
                        Total Likes
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: 'var(--vp-border)' }}>
                    <button
                      type="button"
                      onClick={() => setProfileSubTab('reels')}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor:
                          profileSubTab === 'reels' ? 'var(--vp-primary)' : 'var(--vp-elevated)',
                        color:
                          profileSubTab === 'reels' ? 'var(--vp-primary-fg)' : 'var(--vp-text)',
                      }}
                    >
                      <Film className="h-3.5 w-3.5" />
                      <span>Channel Reels ({activeProfile.videos.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProfileSubTab('saved')}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor:
                          profileSubTab === 'saved'
                            ? 'var(--vp-primary)'
                            : 'var(--vp-elevated)',
                        color:
                          profileSubTab === 'saved'
                            ? 'var(--vp-primary-fg)'
                            : 'var(--vp-text)',
                      }}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      <span>Your Saved ({savedVideos.length})</span>
                    </button>
                  </div>

                  {(() => {
                    const gridVideos =
                      profileSubTab === 'saved' ? savedVideos : activeProfile.videos;
                    if (gridVideos.length === 0) {
                      return (
                        <p
                          className="text-sm py-8 text-center font-semibold"
                          style={{ color: 'var(--vp-muted)' }}
                        >
                          {profileSubTab === 'saved'
                            ? 'No saved reels yet. Tap Save on any reel to bookmark it here.'
                            : 'No clips currently returned for this channel.'}
                        </p>
                      );
                    }

                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {gridVideos.map((clip) => (
                          <button
                            key={clip.id}
                            type="button"
                            onClick={() => jumpToReel(clip.id)}
                            className="relative aspect-[9/16] rounded-xl overflow-hidden bg-black group cursor-pointer border text-left"
                            style={{ borderColor: 'var(--vp-border)' }}
                          >
                            {clip.thumbnailUrl ? (
                              <img
                                src={clip.thumbnailUrl}
                                alt={clip.title}
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-white text-xs font-bold">
                                {clip.creator}
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/20" />
                            <span className="absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              {clip.category}
                            </span>
                            <div className="absolute bottom-2 left-2 right-2 text-white space-y-1">
                              <p className="text-[11px] font-bold line-clamp-2 leading-snug">
                                {clip.title}
                              </p>
                              <div className="flex items-center justify-between text-[10px] font-mono-tabular text-white/90">
                                <span className="inline-flex items-center gap-1">
                                  <Heart className="h-3 w-3 fill-current text-rose-400" />
                                  {formatCompactCount(
                                    clip.likesCount + (likedMap[clip.id] ? 1 : 0)
                                  )}
                                </span>
                                <span>{formatRelativePublished(clip.publishedAt)}</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <Search
                      className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--vp-muted)' }}
                    />
                    <input
                      type="text"
                      value={creatorSearch}
                      onChange={(e) => setCreatorSearch(e.target.value)}
                      placeholder="Search channel or category..."
                      className="w-full min-h-[42px] rounded-xl border pl-9 pr-3 text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--vp-elevated)',
                        borderColor: 'var(--vp-border)',
                        color: 'var(--vp-text)',
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredDirectoryProfiles.map((prof) => {
                      const isFollowing = Boolean(followedMap[prof.key]);
                      return (
                        <article
                          key={prof.key}
                          className="rounded-2xl border p-4 space-y-3"
                          style={{
                            backgroundColor: 'var(--vp-elevated)',
                            borderColor: 'var(--vp-border)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => openCreatorProfile(prof.key, 'profile')}
                              className="flex items-center gap-3 min-w-0 text-left cursor-pointer group"
                            >
                              <div
                                className="p-[2px] rounded-full shrink-0"
                                style={{ background: prof.ringGradient }}
                              >
                                <div
                                  className="flex h-11 w-11 items-center justify-center rounded-full border-2 text-xs font-bold"
                                  style={{
                                    backgroundColor: 'var(--vp-surface)',
                                    borderColor: 'var(--vp-elevated)',
                                  }}
                                >
                                  {prof.initials}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-bold truncate group-hover:underline">
                                    {prof.creator}
                                  </span>
                                  <BadgeCheck className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                                </div>
                                <span
                                  className="block text-[11px] font-mono-tabular truncate"
                                  style={{ color: 'var(--vp-muted)' }}
                                >
                                  {prof.categories[0]} · {prof.videos.length} reels
                                </span>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleFollowCreator(prof.key, prof.creator)}
                              className="min-h-[34px] rounded-xl px-3 text-xs font-semibold cursor-pointer shrink-0"
                              style={{
                                backgroundColor: isFollowing
                                  ? 'var(--vp-surface)'
                                  : 'var(--vp-primary)',
                                color: isFollowing
                                  ? 'var(--vp-text)'
                                  : 'var(--vp-primary-fg)',
                              }}
                            >
                              {isFollowing ? 'Following' : 'Follow'}
                            </button>
                          </div>

                          {prof.videos.length > 0 && (
                            <div className="grid grid-cols-3 gap-1.5">
                              {prof.videos.slice(0, 3).map((clip) => (
                                <button
                                  key={clip.id}
                                  type="button"
                                  onClick={() => jumpToReel(clip.id)}
                                  className="relative aspect-[9/16] rounded-lg overflow-hidden bg-black cursor-pointer group"
                                >
                                  {clip.thumbnailUrl ? (
                                    <img
                                      src={clip.thumbnailUrl}
                                      alt={clip.title}
                                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                    />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-[10px] text-white font-bold">
                                      LIVE
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                                  <span className="absolute bottom-1 left-1.5 text-[10px] font-mono-tabular font-bold text-white inline-flex items-center gap-0.5">
                                    <Play className="h-2.5 w-2.5 fill-current" />
                                    {formatRelativePublished(clip.publishedAt)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => openCreatorProfile(prof.key, 'profile')}
                            className="w-full min-h-[36px] rounded-xl border text-xs font-semibold cursor-pointer"
                            style={{
                              backgroundColor: 'var(--vp-surface)',
                              borderColor: 'var(--vp-border)',
                            }}
                          >
                            View {prof.creator} Reels
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comments Drawer Modal */}
      {drawerVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Short video comments"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setCommentDrawerId(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border p-5 space-y-4 max-h-[75vh] flex flex-col"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
              color: 'var(--vp-text)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: 'var(--vp-border)' }}>
              <div className="min-w-0">
                <h3 className="text-base font-bold truncate">Comments ({drawerComments.length})</h3>
                <p className="text-xs truncate" style={{ color: 'var(--vp-muted)' }}>
                  {drawerVideo.creator} · {drawerVideo.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCommentDrawerId(null)}
                className="p-2 rounded-lg cursor-pointer"
                aria-label="Close comments"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {drawerComments.length === 0 ? (
                <p className="text-xs py-6 text-center" style={{ color: 'var(--vp-muted)' }}>
                  No comments yet. Share your thoughts on this reel!
                </p>
              ) : (
                drawerComments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl p-3 space-y-1"
                    style={{ backgroundColor: 'var(--vp-elevated)' }}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold">{c.author}</span>
                      <span style={{ color: 'var(--vp-muted)' }}>{c.createdAt}</span>
                    </div>
                    <p className="text-sm">{c.text}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddComment} className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--vp-border)' }}>
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 min-h-[42px] rounded-xl border px-3 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              />
              <button
                type="submit"
                className="min-h-[42px] rounded-xl px-4 font-semibold text-sm inline-flex items-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: 'var(--vp-primary)',
                  color: 'var(--vp-primary-fg)',
                }}
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
