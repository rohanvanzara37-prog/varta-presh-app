export type AppLang = 'en' | 'hi';

export type AppView =
  | 'feed'
  | 'friends'
  | 'messenger'
  | 'groups'
  | 'watch'
  | 'saved'
  | 'notifications'
  | 'profile';

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

export type PostVisibility = 'public' | 'friends' | 'only_me';

export const BLUEPRINT_LIMITS = {
  DISPLAY_NAME_MAX: 80,
  BIO_MAX: 240,
  CITY_MAX: 80,
  WORK_MAX: 100,
  URL_MAX: 600,
  POST_TEXT_MAX: 3000,
  FEELING_MAX: 60,
  COMMENT_MAX: 1000,
  STORY_CAPTION_MAX: 220,
  CHAT_LAST_MSG_MAX: 400,
  CHAT_MSG_MAX: 1500,
  GROUP_NAME_MAX: 80,
  GROUP_CAT_MAX: 40,
  GROUP_DESC_MAX: 400,
  NOTIF_MSG_MAX: 240,
  SAVED_MAX: 100,
} as const;

export interface UserPublic {
  uid: string;
  displayName: string;
  bio: string;
  city: string;
  work: string;
  avatarUrl: string;
  coverUrl: string;
  isDiscoverable: boolean;
  friendsCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivate {
  uid: string;
  email: string;
  savedPostIds: string[];
  language: AppLang;
  darkMode: boolean;
  updatedAt?: unknown;
}

export interface SocialPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  imageUrl?: string;
  feeling?: string;
  bgStyle?: string;
  groupId?: string;
  groupName?: string;
  visibility: PostVisibility;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  createdAt?: unknown;
}

export interface PostReaction {
  postId: string;
  userId: string;
  userName: string;
  type: ReactionType;
  createdAt?: unknown;
}

export interface StoryItem {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  caption: string;
  imageUrl?: string;
  bgColor?: string;
  visibility: 'public';
  createdAt?: unknown;
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromName: string;
  fromAvatar?: string;
  toUid: string;
  toName: string;
  toAvatar?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatThread {
  id: string;
  participants: string[];
  participantNames?: Record<string, string>;
  lastMessage: string;
  lastSenderId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  participants: string[];
  senderId: string;
  senderName: string;
  text: string;
  createdAt?: unknown;
}

export interface SocialGroup {
  id: string;
  name: string;
  category: string;
  description: string;
  coverUrl?: string;
  creatorId: string;
  membersCount: number;
  visibility: 'public';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SocialNotification {
  id: string;
  toUid: string;
  fromUid: string;
  fromName: string;
  fromAvatar?: string;
  type: 'like' | 'comment' | 'friend_request' | 'friend_accept';
  postId?: string;
  message: string;
  read: boolean;
  createdAt?: unknown;
}
