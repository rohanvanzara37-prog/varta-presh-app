export type AppTab = 'terminal' | 'news' | 'academy';

export type ThemeMode = 'light' | 'dark';

export interface ColorPalette {
  id: string;
  name: string;
  isCustom?: boolean;
  mode: ThemeMode;
  primary: string;
  secondary: string;
  accent: string;
  canvas: string;
  surface: string;
  elevated: string;
  text: string;
  mutedText: string;
  msgSelfBg: string;
  msgOtherBg: string;
  createdAt?: number;
}

export type FontOptionId =
  | 'plus-jakarta'
  | 'fraunces'
  | 'playfair'
  | 'source-serif'
  | 'lora'
  | 'dm-sans'
  | 'manrope'
  | 'bricolage'
  | 'jetbrains';

export interface FontOption {
  id: FontOptionId;
  label: string;
  category: 'Editorial Serif' | 'Modern Sans' | 'Monospace';
  cssFamily: string;
  sampleText: string;
}

export type MessageBubbleStyle = 'rounded' | 'editorial' | 'compact';

export interface TypographySettings {
  headlineFont: FontOptionId;
  articleFont: FontOptionId;
  articleFontSize: number;
  articleLineHeight: number;
  messageFont: FontOptionId;
  messageFontSize: number;
  messageBubbleStyle: MessageBubbleStyle;
  messageColorMode: 'palette' | 'custom';
  customMsgSelfBg: string;
  customMsgOtherBg: string;
}

export type LanguageCode =
  | 'all'
  | 'en'
  | 'hi'
  | 'te'
  | 'ta'
  | 'ml'
  | 'mr'
  | 'bn'
  | 'kn'
  | 'gu'
  | 'pa'
  | 'or'
  | 'ur'
  | 'as'
  | 'bho';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
  glyph: string;
  greeting: string;
}

export interface Publisher {
  id: string;
  name: string;
  shortMark: string;
  brandBg: string;
  brandFg: string;
  verified: boolean;
  tagline: string;
}

export type NewsTopicId =
  | 'top'
  | 'india'
  | 'business'
  | 'sports'
  | 'technology'
  | 'world'
  | 'entertainment'
  | 'science'
  | 'health';

export interface NewsArticle {
  id: string;
  category: string;
  title: string;
  localizedTitles?: Partial<Record<LanguageCode, string>>;
  summary: string;
  body: string[];
  publisherId: string;
  sourceName?: string;
  sourceUrl?: string;
  publishedAgo: string;
  publishedAtMs?: number;
  readTimeMin: number;
  imageUrl: string;
  imageAlt: string;
  shareCount: number;
  commentCount: number;
  isBreaking?: boolean;
  isLiveWire?: boolean;
  xpressoTag?: string;
}

export interface LiveChannel {
  id: string;
  name: string;
  shortLogo: string;
  brandBg: string;
  brandFg: string;
  language: string;
  programTitle: string;
  anchorName: string;
  viewersCount: string;
  tickerHeadlines: string[];
  backdropImage: string;
}

export interface CricketMatch {
  id: string;
  series: string;
  matchNumber: string;
  status: 'LIVE' | 'UPCOMING' | 'RESULT';
  teamA: {
    code: string;
    name: string;
    flag: string;
    score: string;
    overs: string;
  };
  teamB: {
    code: string;
    name: string;
    flag: string;
    score: string;
    overs: string;
  };
  statusNote: string;
  lastSixBalls: string[];
  pollTotalVotes: number;
  teamAPercent: number;
}

export interface PointsTableRow {
  team: string;
  flag: string;
  played: number;
  won: number;
  lost: number;
  nr: number;
  nrr: string;
  pts: number;
}

export interface CricketQuizItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface NewsMessage {
  id: string;
  roomId: 'breaking' | 'cricket' | 'tech' | 'regional';
  articleId?: string;
  sender: string;
  isSelf: boolean;
  text: string;
  timestamp: string;
  quotedHeadline?: string;
  quotedPublisher?: string;
}

export interface ReadingHistoryEntry {
  article: NewsArticle;
  viewedAt: number;
}

export interface MarketAsset {
  id: string;
  tvSymbol: string;
  displayPair: string;
  name: string;
  category: 'Metals' | 'Crypto' | 'Indices' | 'Commodities';
  livePrice: number;
  changePct24h: number;
  provider: string;
  unitLabel?: string;
}

export interface PriceAlertRecord {
  id: string;
  ownerId: string;
  symbol: string;
  displayPair: string;
  condition: 'above' | 'below';
  targetPrice: number;
  active: boolean;
  triggered: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

