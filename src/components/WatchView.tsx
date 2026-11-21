import React, { useEffect, useState } from 'react';
import { Play, Pause, Heart, Share2, Eye } from 'lucide-react';
import { WATCH_REELS } from '../data/socialPresets';
import type { AppLang } from '../types/social';
import { AvatarImg } from './AvatarImg';

interface WatchViewProps {
  lang: AppLang;
  onShareReelToFeed: (title: string, imageUrl: string) => void;
}

const CATEGORIES = ['All', 'Travel', 'Food', 'Lifestyle'];

export const WatchView: React.FC<WatchViewProps> = ({ lang, onShareReelToFeed }) => {
  const [category, setCategory] = useState('All');
  const [playingId, setPlayingId] = useState<string | null>(WATCH_REELS[0].id);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!playingId) return;
    const reel = WATCH_REELS.find((r) => r.id === playingId);
    if (!reel) return;

    const timer = window.setInterval(() => {
      setProgressMap((prev) => {
        const next = ((prev[playingId] ?? 0) + 100 / (reel.durationSec * 4)) % 100;
        return { ...prev, [playingId]: next };
      });
    }, 250);

    return () => window.clearInterval(timer);
  }, [playingId]);

  const filtered = WATCH_REELS.filter((r) => category === 'All' || r.category === category);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">
            {lang === 'hi' ? 'Watch · वीडियो और रील्स' : 'Watch & Reels'}
          </h2>
          <p className="text-xs text-[#65676B] dark:text-[#B0B3B8]">
            {lang === 'hi'
              ? 'कम्युनिटी के चुनिंदा वीडियो और ट्रैवल क्लिप्स देखें'
              : 'Featured community reels, travel moments & food stories'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F0F2F5] dark:bg-[#3A3B3C] rounded-lg overflow-x-auto no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                category === cat
                  ? 'bg-white dark:bg-[#242526] text-[#1877F2] shadow-xs'
                  : 'text-[#65676B] dark:text-[#B0B3B8]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((reel) => {
          const isPlaying = playingId === reel.id;
          const pct = progressMap[reel.id] ?? 0;
          const liked = Boolean(likedIds[reel.id]);

          return (
            <article
              key={reel.id}
              className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] overflow-hidden"
            >
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarImg src={reel.creatorAvatar} name={reel.creatorName} sizeClass="w-10 h-10" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{reel.creatorName}</p>
                    <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] font-mono-tabular">
                      {reel.category} · {reel.viewsLabel}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono-tabular text-[#65676B] dark:text-[#B0B3B8] flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {reel.durationSec}s
                </span>
              </div>

              <div className="px-4 pb-3">
                <h3 className="font-display text-base font-bold">{reel.title}</h3>
                <p className="text-sm text-[#65676B] dark:text-[#B0B3B8] mt-1">{reel.description}</p>
              </div>

              <div className="relative bg-black overflow-hidden">
                <img
                  src={reel.imageUrl}
                  alt={reel.title}
                  className={`w-full h-72 sm:h-80 object-cover transition-transform duration-1000 ${
                    isPlaying ? 'scale-105' : 'scale-100'
                  }`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

                <button
                  type="button"
                  onClick={() => setPlayingId(isPlaying ? null : reel.id)}
                  aria-label={isPlaying ? 'Pause reel' : 'Play reel'}
                  className="absolute inset-0 flex items-center justify-center cursor-pointer group"
                >
                  <div className="w-14 h-14 rounded-full bg-black/60 text-white flex items-center justify-center group-hover:bg-[#1877F2] transition-colors">
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                  </div>
                </button>

                <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                  <div className="h-1.5 w-full rounded-full bg-white/30 overflow-hidden">
                    <div
                      className="h-full bg-[#1877F2] transition-all duration-200"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="px-4 py-2.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setLikedIds((p) => ({ ...p, [reel.id]: !p[reel.id] }))}
                  className={`min-h-[40px] px-4 rounded-lg flex items-center gap-2 text-sm font-semibold cursor-pointer transition-colors ${
                    liked
                      ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/30'
                      : 'text-[#65676B] dark:text-[#B0B3B8] hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C]'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                  <span>{liked ? (lang === 'hi' ? 'लाइक किया' : 'Liked') : lang === 'hi' ? 'लाइक' : 'Like'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onShareReelToFeed(reel.title, reel.imageUrl)}
                  className="min-h-[40px] px-4 rounded-lg text-sm font-semibold text-[#1877F2] hover:bg-[#1877F2]/10 flex items-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{lang === 'hi' ? 'फीड में शेयर करें' : 'Share to Feed'}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
