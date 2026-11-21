import type { AppLang, ReactionType } from '../types/social';

export const LOCAL_ASSETS = {
  coverCommunity: '/src/assets/images/hero_community_cover_1795158537596.jpg',
  travelHills: '/src/assets/images/post_travel_hills_1795158537812.jpg',
  streetFood: '/src/assets/images/post_street_food_1795158537986.jpg',
  avatarPriya: '/src/assets/images/avatar_priya_1795158537488.jpg',
  avatarAarav: '/src/assets/images/avatar_aarav_1795158537449.jpg',
  avatarRohan: '/src/assets/images/avatar_rohan_1795158538064.jpg',
} as const;

export const REACTION_META: Record<
  ReactionType,
  { emoji: string; labelEn: string; labelHi: string; colorClass: string }
> = {
  like: { emoji: '👍', labelEn: 'Like', labelHi: 'लाइक', colorClass: 'text-[#1877F2]' },
  love: { emoji: '❤️', labelEn: 'Love', labelHi: 'लव', colorClass: 'text-rose-600' },
  haha: { emoji: '😂', labelEn: 'Haha', labelHi: 'हाहा', colorClass: 'text-amber-500' },
  wow: { emoji: '😮', labelEn: 'Wow', labelHi: 'वाह', colorClass: 'text-amber-500' },
  sad: { emoji: '😢', labelEn: 'Sad', labelHi: 'दुखी', colorClass: 'text-amber-600' },
  angry: { emoji: '🙏', labelEn: 'Care', labelHi: 'शुक्रिया', colorClass: 'text-orange-600' },
};

export const POST_BG_STYLES: { id: string; label: string; className: string }[] = [
  { id: 'none', label: 'Classic', className: '' },
  { id: 'blue', label: 'Royal Blue', className: 'bg-[#1877F2] text-white' },
  { id: 'sunset', label: 'Warm Sunset', className: 'bg-gradient-to-br from-rose-600 to-amber-500 text-white' },
  { id: 'emerald', label: 'Forest Teal', className: 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white' },
  { id: 'slate', label: 'Midnight Ink', className: 'bg-gradient-to-br from-slate-800 to-slate-950 text-white' },
];

export const FEELING_PRESETS = [
  '😊 Happy',
  '🎉 Celebrating',
  '☕ Sipping Chai',
  '✈️ Traveling',
  '💪 Motivated',
  '🙏 Grateful',
];

export interface WatchReelItem {
  id: string;
  creatorName: string;
  creatorAvatar: string;
  title: string;
  description: string;
  imageUrl: string;
  durationSec: number;
  viewsLabel: string;
  category: string;
}

export const WATCH_REELS: WatchReelItem[] = [
  {
    id: 'reel-darjeeling-sunrise',
    creatorName: 'Aarav Travelogues',
    creatorAvatar: LOCAL_ASSETS.avatarAarav,
    title: 'Morning Mist Over Darjeeling Tea Gardens',
    description: 'Golden sunbeams breaking through early fog above the eastern ridges at 5:45 AM.',
    imageUrl: LOCAL_ASSETS.travelHills,
    durationSec: 18,
    viewsLabel: '48.2K views',
    category: 'Travel',
  },
  {
    id: 'reel-monsoon-chai',
    creatorName: 'Priya Kitchen Notes',
    creatorAvatar: LOCAL_ASSETS.avatarPriya,
    title: 'Monsoon Evening Kulhad Chai & Street Platter',
    description: 'Steaming ginger-cardamom masala chai served warm while rain taps on the cafe roof.',
    imageUrl: LOCAL_ASSETS.streetFood,
    durationSec: 15,
    viewsLabel: '92.4K views',
    category: 'Food',
  },
  {
    id: 'reel-rooftop-evening',
    creatorName: 'Rohan Lens',
    creatorAvatar: LOCAL_ASSETS.avatarRohan,
    title: 'Weekend Terrace Chai Reunion in Mumbai',
    description: 'Nothing beats catching up with old college friends as city lights come alive.',
    imageUrl: LOCAL_ASSETS.coverCommunity,
    durationSec: 22,
    viewsLabel: '31.7K views',
    category: 'Lifestyle',
  },
];

export const UI_COPY: Record<
  AppLang,
  {
    feed: string;
    friends: string;
    groups: string;
    watch: string;
    messenger: string;
    saved: string;
    notifications: string;
    profile: string;
    createPost: string;
    whatsOnMind: string;
    photo: string;
    feeling: string;
    colorBg: string;
    postBtn: string;
    like: string;
    comment: string;
    share: string;
    save: string;
    savedDone: string;
    addFriend: string;
    confirm: string;
    decline: string;
    message: string;
    contacts: string;
    friendRequests: string;
    signOut: string;
    darkMode: string;
    lightMode: string;
    createStory: string;
    noPostsYet: string;
    writeComment: string;
    editProfile: string;
  }
> = {
  en: {
    feed: 'Feed',
    friends: 'Friends',
    groups: 'Groups',
    watch: 'Watch',
    messenger: 'Messenger',
    saved: 'Saved',
    notifications: 'Notifications',
    profile: 'Profile',
    createPost: 'Create Post',
    whatsOnMind: "What's on your mind?",
    photo: 'Photo',
    feeling: 'Feeling',
    colorBg: 'Backdrop',
    postBtn: 'Post',
    like: 'Like',
    comment: 'Comment',
    share: 'Share',
    save: 'Save post',
    savedDone: 'Saved',
    addFriend: 'Add Friend',
    confirm: 'Confirm',
    decline: 'Delete',
    message: 'Message',
    contacts: 'Contacts',
    friendRequests: 'Friend Requests',
    signOut: 'Log out',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    createStory: 'Create Story',
    noPostsYet: 'No posts in your feed yet. Share your first update above!',
    writeComment: 'Write a comment...',
    editProfile: 'Edit Profile',
  },
  hi: {
    feed: 'फीड',
    friends: 'दोस्त',
    groups: 'ग्रुप्स',
    watch: 'वीडियो',
    messenger: 'मैसेज',
    saved: 'सेव्ड',
    notifications: 'नोटिफिकेशन',
    profile: 'प्रोफाइल',
    createPost: 'नई पोस्ट',
    whatsOnMind: 'आपके मन में क्या है?',
    photo: 'फ़ोटो',
    feeling: 'फीलिंग',
    colorBg: 'रंग',
    postBtn: 'पोस्ट करें',
    like: 'लाइक',
    comment: 'कमेंट',
    share: 'शेयर',
    save: 'सेव करें',
    savedDone: 'सेव्ड',
    addFriend: 'दोस्त बनाएं',
    confirm: 'कन्फर्म',
    decline: 'हटाएं',
    message: 'मैसेज',
    contacts: 'कॉन्टैक्ट्स',
    friendRequests: 'फ्रेंड रिक्वेस्ट',
    signOut: 'लॉग आउट',
    darkMode: 'डार्क मोड',
    lightMode: 'लाइट मोड',
    createStory: 'स्टोरी बनाएं',
    noPostsYet: 'अभी कोई पोस्ट नहीं है। ऊपर अपनी पहली पोस्ट शेयर करें!',
    writeComment: 'कमेंट लिखें...',
    editProfile: 'प्रोफाइल बदलें',
  },
};
