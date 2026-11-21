import React, { useState } from 'react';
import { X, Image as ImageIcon, Smile, Globe, Users, Lock } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  type AppLang,
  type PostVisibility,
  type SocialGroup,
  type UserPublic,
} from '../types/social';
import { FEELING_PRESETS, LOCAL_ASSETS, POST_BG_STYLES, UI_COPY } from '../data/socialPresets';
import { compressAndUploadImage } from '../utils/imageUpload';
import { AvatarImg } from './AvatarImg';

interface PostComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserPublic;
  lang: AppLang;
  activeGroup?: SocialGroup | null;
}

export const PostComposerModal: React.FC<PostComposerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  lang,
  activeGroup,
}) => {
  const t = UI_COPY[lang];
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [feeling, setFeeling] = useState('');
  const [bgStyle, setBgStyle] = useState('none');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [showFeelings, setShowFeelings] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      const url = await compressAndUploadImage(file);
      setImageUrl(url);
      setBgStyle('none');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = text.trim().slice(0, BLUEPRINT_LIMITS.POST_TEXT_MAX);
    if (!cleanText && !imageUrl) {
      setErrorMsg(lang === 'hi' ? 'कुछ लिखें या फोटो जोड़ें।' : 'Write something or attach a photo.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload: Record<string, unknown> = {
        authorId: currentUser.uid,
        authorName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        text: cleanText,
        visibility,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (currentUser.avatarUrl) {
        payload.authorAvatar = currentUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX);
      }
      if (imageUrl) {
        payload.imageUrl = imageUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX);
      }
      if (feeling) {
        payload.feeling = feeling.slice(0, BLUEPRINT_LIMITS.FEELING_MAX);
      }
      if (bgStyle !== 'none' && !imageUrl) {
        payload.bgStyle = bgStyle;
      }
      if (activeGroup) {
        payload.groupId = activeGroup.id;
        payload.groupName = activeGroup.name.slice(0, BLUEPRINT_LIMITS.GROUP_NAME_MAX);
      }

      await addDoc(collection(db, 'posts'), payload);
      setText('');
      setImageUrl('');
      setFeeling('');
      setBgStyle('none');
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'posts');
    } finally {
      setSubmitting(false);
    }
  };

  const activeBg = POST_BG_STYLES.find((s) => s.id === bgStyle) ?? POST_BG_STYLES[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042] rounded-2xl max-w-lg w-full shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#CED0D4] dark:border-[#3E4042]">
          <h2 className="font-display text-lg font-bold">
            {activeGroup ? `${t.createPost} · ${activeGroup.name}` : t.createPost}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close composer"
            className="min-h-[36px] min-w-[36px] rounded-full bg-[#E4E6EB] dark:bg-[#3A3B3C] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <AvatarImg src={currentUser.avatarUrl} name={currentUser.displayName} sizeClass="w-10 h-10" />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {currentUser.displayName}
                  {feeling && <span className="font-normal text-[#65676B] dark:text-[#B0B3B8]"> — {feeling}</span>}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as PostVisibility)}
                    className="text-xs font-medium bg-[#E4E6EB] dark:bg-[#3A3B3C] rounded-md px-2 py-1 focus:outline-none cursor-pointer"
                  >
                    <option value="public">{lang === 'hi' ? 'पब्लिक (सभी)' : 'Public'}</option>
                    <option value="friends">{lang === 'hi' ? 'सिर्फ दोस्त' : 'Friends'}</option>
                    <option value="only_me">{lang === 'hi' ? 'सिर्फ मैं' : 'Only me'}</option>
                  </select>
                  {visibility === 'public' && <Globe className="w-3.5 h-3.5 text-[#65676B]" />}
                  {visibility === 'friends' && <Users className="w-3.5 h-3.5 text-[#65676B]" />}
                  {visibility === 'only_me' && <Lock className="w-3.5 h-3.5 text-[#65676B]" />}
                </div>
              </div>
            </div>
          </div>

          <div
            className={`rounded-xl transition-colors ${
              bgStyle !== 'none' && !imageUrl
                ? `${activeBg.className} p-6 min-h-[160px] flex items-center justify-center`
                : ''
            }`}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.POST_TEXT_MAX}
              placeholder={`${currentUser.displayName.split(' ')[0]}, ${t.whatsOnMind}`}
              rows={bgStyle !== 'none' && !imageUrl ? 4 : 4}
              className={`w-full bg-transparent focus:outline-none resize-none ${
                bgStyle !== 'none' && !imageUrl
                  ? 'text-center text-xl font-bold placeholder:text-white/80'
                  : 'text-base placeholder:text-[#65676B] dark:placeholder:text-[#B0B3B8]'
              }`}
            />
          </div>

          {imageUrl && (
            <div className="relative rounded-xl overflow-hidden border border-[#CED0D4] dark:border-[#3E4042]">
              <img src={imageUrl} alt="Selected upload" className="w-full max-h-60 object-cover" />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {!imageUrl && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-xs text-[#65676B] dark:text-[#B0B3B8] shrink-0">{t.colorBg}:</span>
              {POST_BG_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setBgStyle(style.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium shrink-0 border cursor-pointer ${
                    bgStyle === style.id
                      ? 'border-[#1877F2] bg-[#1877F2]/10 text-[#1877F2]'
                      : 'border-[#CED0D4] dark:border-[#3E4042]'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          )}

          {showFeelings && (
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#3A3B3C]/60">
              {FEELING_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setFeeling((prev) => (prev === preset ? '' : preset));
                    setShowFeelings(false);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    feeling === preset
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-white dark:bg-[#242526] hover:bg-[#E4E6EB]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-[#CED0D4] dark:border-[#3E4042] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#65676B] dark:text-[#B0B3B8]">
              {lang === 'hi' ? 'पोस्ट में जोड़ें' : 'Add to your post'}
            </span>
            <div className="flex items-center gap-2">
              <label className="min-h-[36px] px-2.5 py-1.5 rounded-lg hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C] text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                <span>{uploading ? '...' : t.photo}</span>
                <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
              </label>

              <button
                type="button"
                onClick={() => {
                  setImageUrl(LOCAL_ASSETS.travelHills);
                  setBgStyle('none');
                }}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C] text-xs font-medium cursor-pointer"
              >
                {lang === 'hi' ? 'सैंपल फोटो' : 'Sample Photo'}
              </button>

              <button
                type="button"
                onClick={() => setShowFeelings((v) => !v)}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Smile className="w-4 h-4 text-amber-500" />
                <span>{t.feeling}</span>
              </button>
            </div>
          </div>

          {errorMsg && <p className="text-xs text-rose-600 dark:text-rose-400">{errorMsg}</p>}

          <button
            type="submit"
            disabled={submitting || uploading}
            className="w-full min-h-[44px] rounded-xl bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            {submitting ? (lang === 'hi' ? 'पोस्ट हो रहा है...' : 'Publishing...') : t.postBtn}
          </button>
        </form>
      </div>
    </div>
  );
};
