import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

interface LiveMarketsPayload {
  updatedAt: string;
  source: 'live' | 'snapshot';
  xauUsd: number;
  xagUsd: number;
  btcUsd: number;
  assets: Array<{
    id: string;
    tvSymbol: string;
    displayPair: string;
    name: string;
    category: 'Metals' | 'Crypto';
    livePrice: number;
    changePct24h: number;
    provider: string;
    unitLabel?: string;
  }>;
}

let marketsCache: { expiresAt: number; payload: LiveMarketsPayload } | null = null;

async function fetchJsonWithTimeout<T>(url: string, ms = 4500): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function getLiveMarketsPayload(): Promise<LiveMarketsPayload> {
  if (marketsCache && marketsCache.expiresAt > Date.now()) {
    return marketsCache.payload;
  }

  const [xauRes, xagRes, cgRes, btcCbRes] = await Promise.all([
    fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAU'),
    fetchJsonWithTimeout<{ price?: number }>('https://api.gold-api.com/price/XAG'),
    fetchJsonWithTimeout<
      Record<string, { usd?: number; usd_24h_change?: number }>
    >(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple&vs_currencies=usd&include_24hr_change=true'
    ),
    fetchJsonWithTimeout<{ data?: { amount?: string } }>('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
  ]);

  const xauUsd =
    typeof xauRes?.price === 'number' && xauRes.price > 500
      ? Number(xauRes.price.toFixed(2))
      : 2664.8;
  const xagUsd =
    typeof xagRes?.price === 'number' && xagRes.price > 5
      ? Number(xagRes.price.toFixed(2))
      : 31.42;

  const btcFromCg = cgRes?.bitcoin?.usd;
  const btcFromCb = Number(cgRes?.bitcoin?.usd ?? btcCbRes?.data?.amount);
  const btcUsd =
    typeof btcFromCg === 'number' && btcFromCg > 1000
      ? Number(btcFromCg.toFixed(2))
      : Number.isFinite(btcFromCb) && btcFromCb > 1000
        ? Number(btcFromCb.toFixed(2))
        : 91850.0;

  const ethUsd = Number((cgRes?.ethereum?.usd ?? 3145.5).toFixed(2));
  const solUsd = Number((cgRes?.solana?.usd ?? 218.4).toFixed(2));
  const bnbUsd = Number((cgRes?.binancecoin?.usd ?? 624.8).toFixed(2));
  const xrpUsd = Number((cgRes?.ripple?.usd ?? 1.12).toFixed(4));

  const anyLive = Boolean(xauRes?.price || xagRes?.price || cgRes?.bitcoin?.usd || btcCbRes?.data?.amount);

  const payload: LiveMarketsPayload = {
    updatedAt: new Date().toISOString(),
    source: anyLive ? 'live' : 'snapshot',
    xauUsd,
    xagUsd,
    btcUsd,
    assets: [
      {
        id: 'xauusd',
        tvSymbol: 'OANDA:XAUUSD',
        displayPair: 'XAU/USD',
        name: 'Gold Spot (Troy Oz)',
        category: 'Metals',
        livePrice: xauUsd,
        changePct24h: 0.64,
        provider: xauRes?.price ? 'Gold-API Live' : 'Bullion Snapshot',
        unitLabel: 'oz',
      },
      {
        id: 'xagusd',
        tvSymbol: 'OANDA:XAGUSD',
        displayPair: 'XAG/USD',
        name: 'Silver Spot (Troy Oz)',
        category: 'Metals',
        livePrice: xagUsd,
        changePct24h: 0.42,
        provider: xagRes?.price ? 'Gold-API Live' : 'Bullion Snapshot',
        unitLabel: 'oz',
      },
      {
        id: 'btcusd',
        tvSymbol: 'BINANCE:BTCUSDT',
        displayPair: 'BTC/USD',
        name: 'Bitcoin',
        category: 'Crypto',
        livePrice: btcUsd,
        changePct24h: Number((cgRes?.bitcoin?.usd_24h_change ?? 1.84).toFixed(2)),
        provider: cgRes?.bitcoin?.usd ? 'CoinGecko Live' : btcCbRes?.data?.amount ? 'Coinbase Live' : 'Crypto Snapshot',
      },
      {
        id: 'ethusd',
        tvSymbol: 'BINANCE:ETHUSDT',
        displayPair: 'ETH/USD',
        name: 'Ethereum',
        category: 'Crypto',
        livePrice: ethUsd,
        changePct24h: Number((cgRes?.ethereum?.usd_24h_change ?? 1.21).toFixed(2)),
        provider: cgRes?.ethereum?.usd ? 'CoinGecko Live' : 'Crypto Snapshot',
      },
      {
        id: 'solusd',
        tvSymbol: 'BINANCE:SOLUSDT',
        displayPair: 'SOL/USD',
        name: 'Solana',
        category: 'Crypto',
        livePrice: solUsd,
        changePct24h: Number((cgRes?.solana?.usd_24h_change ?? 2.75).toFixed(2)),
        provider: cgRes?.solana?.usd ? 'CoinGecko Live' : 'Crypto Snapshot',
      },
      {
        id: 'bnbusd',
        tvSymbol: 'BINANCE:BNBUSDT',
        displayPair: 'BNB/USD',
        name: 'BNB',
        category: 'Crypto',
        livePrice: bnbUsd,
        changePct24h: Number((cgRes?.binancecoin?.usd_24h_change ?? 0.92).toFixed(2)),
        provider: cgRes?.binancecoin?.usd ? 'CoinGecko Live' : 'Crypto Snapshot',
      },
      {
        id: 'xrpusd',
        tvSymbol: 'BINANCE:XRPUSDT',
        displayPair: 'XRP/USD',
        name: 'Ripple XRP',
        category: 'Crypto',
        livePrice: xrpUsd,
        changePct24h: Number((cgRes?.ripple?.usd_24h_change ?? -0.48).toFixed(2)),
        provider: cgRes?.ripple?.usd ? 'CoinGecko Live' : 'Crypto Snapshot',
      },
    ],
  };

  marketsCache = {
    expiresAt: Date.now() + 12000,
    payload,
  };

  return payload;
}

async function startServer() {
  ensureUploadsDir();
  const app = express();

  app.use(express.json({ limit: '4mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'VartaPress', timestamp: new Date().toISOString() });
  });

  app.get('/api/markets/live', async (_req, res) => {
    const payload = await getLiveMarketsPayload();
    res.json(payload);
  });

  interface LiveYoutubeReelItem {
    id: string;
    title: string;
    creator: string;
    category: string;
    videoUrl: string;
    youtubeVideoId?: string;
    playlistId?: string;
    thumbnailUrl?: string;
    publishedAt?: string;
    externalLink?: string;
    isFallbackPlaylist?: boolean;
    durationSec: number;
    likesCount: number;
    comments: never[];
    sourceName: string;
  }

  let youtubeReelsCache: {
    expiresAt: number;
    payload: { videos: LiveYoutubeReelItem[]; feedMode: 'rss2json' | 'youtube-xml' | 'playlist-fallback'; fetchedAt: string };
  } | null = null;

  const YT_REEL_CHANNELS = [
    {
      channelId: 'UC7TghOL755nBk7HelHoi9LQ',
      playlistId: 'UU7TghOL755nBk7HelHoi9LQ',
      channelName: 'CoinDesk',
      category: 'Crypto News',
    },
    {
      channelId: 'UCRqBu-grVX1p97WaX4d-OuQ',
      playlistId: 'UURqBu-grVX1p97WaX4d-OuQ',
      channelName: 'Cointelegraph',
      category: 'Crypto & Gold',
    },
    {
      channelId: 'UC9ijza42jVR3T6b8bColgvg',
      playlistId: 'UU9ijza42jVR3T6b8bColgvg',
      channelName: 'Kitco NEWS',
      category: 'Gold & Forex',
    },
    {
      channelId: 'UC7xoPVyj6Av0deAoQqfeJZw',
      playlistId: 'UU7xoPVyj6Av0deAoQqfeJZw',
      channelName: 'FXStreet',
      category: 'Forex & Gold',
    },
  ] as const;

  function extractYtVideoIdFromString(input: string): string | null {
    if (!input) return null;
    const vMatch = input.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (vMatch?.[1]) return vMatch[1];
    const shortsMatch = input.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
    if (shortsMatch?.[1]) return shortsMatch[1];
    const shortUrlMatch = input.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (shortUrlMatch?.[1]) return shortUrlMatch[1];
    const guidMatch = input.match(/yt:video:([A-Za-z0-9_-]{11})/);
    if (guidMatch?.[1]) return guidMatch[1];
    return null;
  }

  function decodeXmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function buildPlaylistFallbackReels(): LiveYoutubeReelItem[] {
    return YT_REEL_CHANNELS.map((ch) => ({
      id: `yt-pl-${ch.channelId}`,
      title: `${ch.channelName} Live & Trending Headlines Stream`,
      creator: ch.channelName,
      category: ch.category,
      videoUrl: `https://www.youtube.com/embed?listType=playlist&list=${ch.playlistId}&rel=0&modestbranding=1`,
      playlistId: ch.playlistId,
      externalLink: `https://www.youtube.com/channel/${ch.channelId}`,
      isFallbackPlaylist: true,
      durationSec: 60,
      likesCount: 420,
      comments: [],
      sourceName: `${ch.channelName} Auto Playlist`,
    }));
  }

  app.get('/api/live-shorts', async (_req, res) => {
    try {
      if (youtubeReelsCache && Date.now() < youtubeReelsCache.expiresAt) {
        res.json(youtubeReelsCache.payload);
        return;
      }

      let usedXmlFallback = false;
      const perChannelLists = await Promise.all(
        YT_REEL_CHANNELS.map(async (ch) => {
          const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`;
          const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

          // 1. Primary: rss2json.com
          const rssJson = await fetchJsonWithTimeout<{
            status?: string;
            items?: Array<{
              title?: string;
              pubDate?: string;
              link?: string;
              guid?: string;
              thumbnail?: string;
              author?: string;
            }>;
          }>(rss2jsonUrl, 5000);

          if (rssJson?.status === 'ok' && Array.isArray(rssJson.items) && rssJson.items.length > 0) {
            return rssJson.items
              .slice(0, 8)
              .map((item): LiveYoutubeReelItem | null => {
                const videoId =
                  extractYtVideoIdFromString(item.link || '') ||
                  extractYtVideoIdFromString(item.guid || '');
                if (!videoId) return null;
                let seed = 0;
                for (let i = 0; i < videoId.length; i += 1) seed += videoId.charCodeAt(i);
                return {
                  id: `yt-${videoId}`,
                  title: (item.title || `${ch.channelName} Update`).trim(),
                  creator: ch.channelName,
                  category: ch.category,
                  videoUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
                  youtubeVideoId: videoId,
                  thumbnailUrl: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                  publishedAt: item.pubDate || new Date().toISOString(),
                  externalLink: item.link || `https://www.youtube.com/watch?v=${videoId}`,
                  durationSec: 45,
                  likesCount: 120 + (seed % 850),
                  comments: [],
                  sourceName: 'YouTube RSS2JSON',
                };
              })
              .filter((v): v is LiveYoutubeReelItem => v !== null);
          }

          // 2. Direct YouTube XML RSS fallback if rss2json rate-limits
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const xmlRes = await fetch(rssUrl, { signal: controller.signal });
            clearTimeout(timer);
            if (xmlRes.ok) {
              const xmlText = await xmlRes.text();
              const entries = xmlText.split('<entry>').slice(1, 9);
              const parsed = entries
                .map((entry): LiveYoutubeReelItem | null => {
                  const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
                  const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
                  const pubMatch = entry.match(/<published>([^<]+)<\/published>/);
                  const videoId = idMatch?.[1]?.trim();
                  if (!videoId) return null;
                  usedXmlFallback = true;
                  let seed = 0;
                  for (let i = 0; i < videoId.length; i += 1) seed += videoId.charCodeAt(i);
                  return {
                    id: `yt-${videoId}`,
                    title: decodeXmlEntities(titleMatch?.[1]?.trim() || `${ch.channelName} Update`),
                    creator: ch.channelName,
                    category: ch.category,
                    videoUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
                    youtubeVideoId: videoId,
                    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    publishedAt: pubMatch?.[1]?.trim() || new Date().toISOString(),
                    externalLink: `https://www.youtube.com/watch?v=${videoId}`,
                    durationSec: 45,
                    likesCount: 120 + (seed % 850),
                    comments: [],
                    sourceName: 'YouTube Live RSS',
                  };
                })
                .filter((v): v is LiveYoutubeReelItem => v !== null);
              if (parsed.length > 0) return parsed;
            }
          } catch {
            // Fall through to playlist fallback for this channel
          }

          return [];
        })
      );

      // Interleave items across Aaj Tak, Zee News, and CNBC-TV18 sorted newest-first
      const merged = perChannelLists
        .flat()
        .sort((a, b) => {
          const tA = a.publishedAt ? Date.parse(a.publishedAt) : 0;
          const tB = b.publishedAt ? Date.parse(b.publishedAt) : 0;
          return (Number.isFinite(tB) ? tB : 0) - (Number.isFinite(tA) ? tA : 0);
        });

      const finalVideos = merged.length > 0 ? merged : buildPlaylistFallbackReels();
      const feedMode =
        merged.length === 0
          ? 'playlist-fallback'
          : usedXmlFallback
            ? 'youtube-xml'
            : 'rss2json';

      const payload = {
        videos: finalVideos,
        feedMode,
        fetchedAt: new Date().toISOString(),
      } as const;

      youtubeReelsCache = {
        expiresAt: Date.now() + 180_000,
        payload,
      };

      res.json(payload);
    } catch {
      res.json({
        videos: buildPlaylistFallbackReels(),
        feedMode: 'playlist-fallback',
        fetchedAt: new Date().toISOString(),
      });
    }
  });

  app.post('/api/upload-image', (req, res) => {
    try {
      const { dataUrl } = req.body as { dataUrl?: unknown };
      if (typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }

      const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are supported' });
        return;
      }

      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 2.5 * 1024 * 1024) {
        res.status(413).json({ error: 'Image must be smaller than 2.5 MB' });
        return;
      }

      ensureUploadsDir();
      const filename = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filepath, buffer);

      res.json({ url: `/uploads/${filename}` });
    } catch {
      res.status(500).json({ error: 'Failed to store uploaded image' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VartaPress server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
