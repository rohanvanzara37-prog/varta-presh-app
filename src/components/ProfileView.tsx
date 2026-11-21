import React, { useState } from 'react';
import { Briefcase, Camera, Edit3, MapPin, MessageCircle, UserPlus, X } from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  type AppLang,
  type FriendRequest,
  type SocialPost,
  type UserPublic,
} from '../types/social';
import { LOCAL_ASSETS, UI_COPY } from '../data/socialPresets';
import { compressAndUploadImage } from '../utils/imageUpload';
import { AvatarImg } from './AvatarImg';
import { PostCard } from './PostCard';

interface ProfileViewProps {
  profileUser: UserPublic;
  currentUser: UserPublic;
  posts: SocialPost[];
  savedPostIds: string[];
  friendRequests: FriendRequest[];
  onToggleSave: (postId: string) => void;
  onStartChat: (target: UserPublic) => void;
  onOpenProfile: (uid: string) => void;
  lang: AppLang;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profileUser,
  currentUser,
  posts,
  savedPostIds,
  friendRequests,
  onToggleSave,
  onStartChat,
  onOpenProfile,
  lang,
}) => {
  const t = UI_COPY[lang];
  const isMe = profileUser.uid === currentUser.uid;
  const [tab, setTab] = useState<'posts' | 'about' | 'photos'>('posts');
  const [editOpen, setEditOpen] = useState(false);

  const [displayName, setDisplayName] = useState(profileUser.displayName);
  const [bio, setBio] = useState(profileUser.bio);
  const [city, setCity] = useState(profileUser.city);
  const [work, setWork] = useState(profileUser.work);
  const [avatarUrl, setAvatarUrl] = useState(profileUser.avatarUrl);
  const [coverUrl, setCoverUrl] = useState(profileUser.coverUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const userPosts = posts.filter((p) => p.authorId === profileUser.uid);
  const userPhotos = userPosts.filter((p) => Boolean(p.imageUrl));

  const relation = friendRequests.find(
    (r) =>
      (r.fromUid === currentUser.uid && r.toUid === profileUser.uid) ||
      (r.toUid === currentUser.uid && r.fromUid === profileUser.uid)
  );

  const openEditor = () => {
    setDisplayName(profileUser.displayName);
    setBio(profileUser.bio);
    setCity(profileUser.city);
    setWork(profileUser.work);
    setAvatarUrl(profileUser.avatarUrl);
    setCoverUrl(profileUser.coverUrl);
    setEditOpen(true);
  };

  const handleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (url: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await compressAndUploadImage(file);
      setter(url);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users_public', currentUser.uid), {
        displayName: (displayName.trim() || currentUser.displayName).slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        bio: bio.trim().slice(0, BLUEPRINT_LIMITS.BIO_MAX),
        city: city.trim().slice(0, BLUEPRINT_LIMITS.CITY_MAX),
        work: work.trim().slice(0, BLUEPRINT_LIMITS.WORK_MAX),
        avatarUrl: avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX),
        coverUrl: coverUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX),
        updatedAt: serverTimestamp(),
      });
      setEditOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users_public/${currentUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSendFriendRequest = async () => {
    const reqId = `${currentUser.uid}_${profileUser.uid}`.slice(0, 128);
    try {
      await setDoc(doc(db, 'friend_requests', reqId), {
        fromUid: currentUser.uid,
        fromName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        ...(currentUser.avatarUrl ? { fromAvatar: currentUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX) } : {}),
        toUid: profileUser.uid,
        toName: profileUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        ...(profileUser.avatarUrl ? { toAvatar: profileUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX) } : {}),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `friend_requests/${reqId}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] overflow-hidden">
        <div className="relative h-48 sm:h-60 bg-[#1877F2]/15">
          <img
            src={profileUser.coverUrl || LOCAL_ASSETS.coverCommunity}
            alt={`${profileUser.displayName} cover`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="px-5 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="w-28 h-28 rounded-full p-1 bg-white dark:bg-[#242526] shrink-0 shadow-sm">
                <AvatarImg
                  src={profileUser.avatarUrl}
                  name={profileUser.displayName}
                  sizeClass="w-full h-full"
                />
              </div>
              <div className="pb-1">
                <h2 className="font-display text-2xl font-extrabold">{profileUser.displayName}</h2>
                <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] font-mono-tabular mt-0.5">
                  {profileUser.friendsCount} {lang === 'hi' ? 'दोस्त' : 'friends'} · {userPosts.length}{' '}
                  {lang === 'hi' ? 'पोस्ट्स' : 'posts'}
                </p>
                {profileUser.bio && (
                  <p className="text-sm mt-1.5 max-w-lg">{profileUser.bio}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isMe ? (
                <button
                  type="button"
                  onClick={openEditor}
                  className="min-h-[40px] px-4 rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-sm font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>{t.editProfile}</span>
                </button>
              ) : (
                <>
                  {!relation && (
                    <button
                      type="button"
                      onClick={handleSendFriendRequest}
                      className="min-h-[40px] px-4 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>{t.addFriend}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onStartChat(profileUser)}
                    className="min-h-[40px] px-4 rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-sm font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{t.message}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-[#CED0D4] dark:border-[#3E4042] flex items-center gap-2">
            {(['posts', 'about', 'photos'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`min-h-[40px] px-4 rounded-lg text-sm font-semibold capitalize cursor-pointer ${
                  tab === item
                    ? 'bg-[#1877F2]/10 text-[#1877F2]'
                    : 'text-[#65676B] dark:text-[#B0B3B8] hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'about' && (
        <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-5 space-y-3">
          <h3 className="font-display text-base font-bold">
            {lang === 'hi' ? 'परिचय' : 'About'}
          </h3>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5">
              <Briefcase className="w-4 h-4 text-[#65676B]" />
              <span>{profileUser.work || (lang === 'hi' ? 'MitraBook क्रिएटर' : 'Member at MitraBook')}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-[#65676B]" />
              <span>{profileUser.city || (lang === 'hi' ? 'भारत' : 'India')}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'photos' && (
        <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-4">
          {userPhotos.length === 0 ? (
            <p className="text-sm text-[#65676B] dark:text-[#B0B3B8] text-center py-6">
              {lang === 'hi' ? 'अभी कोई फोटो पोस्ट नहीं की गई है।' : 'No photos posted yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {userPhotos.map((p) => (
                <img
                  key={p.id}
                  src={p.imageUrl}
                  alt={p.text || 'Photo'}
                  referrerPolicy="no-referrer"
                  className="w-full h-40 object-cover rounded-lg border border-[#CED0D4]/60 dark:border-[#3E4042]"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'posts' && (
        <div className="space-y-4">
          {userPosts.length === 0 ? (
            <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-8 text-center text-sm text-[#65676B] dark:text-[#B0B3B8]">
              {t.noPostsYet}
            </div>
          ) : (
            userPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                isSaved={savedPostIds.includes(post.id)}
                onToggleSave={onToggleSave}
                onOpenProfile={onOpenProfile}
                lang={lang}
              />
            ))
          )}
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042] rounded-2xl max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#CED0D4] dark:border-[#3E4042] pb-3">
              <h3 className="font-display text-lg font-bold">{t.editProfile}</h3>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="w-9 h-9 rounded-full bg-[#E4E6EB] dark:bg-[#3A3B3C] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <AvatarImg src={avatarUrl} name={displayName} sizeClass="w-14 h-14" />
                <div className="flex items-center gap-2">
                  <label className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{lang === 'hi' ? 'प्रोफाइल फोटो' : 'Change Avatar'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleUpload(e, setAvatarUrl)}
                      className="hidden"
                    />
                  </label>
                  <label className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{lang === 'hi' ? 'कवर फोटो' : 'Change Cover'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleUpload(e, setCoverUrl)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  {lang === 'hi' ? 'नाम' : 'Display Name'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.DISPLAY_NAME_MAX}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-lg bg-[#F0F2F5] dark:bg-[#3A3B3C] text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  {lang === 'hi' ? 'बायो' : 'Bio'}
                </label>
                <textarea
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.BIO_MAX}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full p-3 rounded-lg bg-[#F0F2F5] dark:bg-[#3A3B3C] text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    {lang === 'hi' ? 'शहर' : 'City'}
                  </label>
                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.CITY_MAX}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-lg bg-[#F0F2F5] dark:bg-[#3A3B3C] text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    {lang === 'hi' ? 'काम / पेशा' : 'Work'}
                  </label>
                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.WORK_MAX}
                    value={work}
                    onChange={(e) => setWork(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-lg bg-[#F0F2F5] dark:bg-[#3A3B3C] text-sm focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || uploading}
                className="w-full min-h-[44px] rounded-xl bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
              >
                {saving || uploading ? '...' : lang === 'hi' ? 'सेव करें' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
