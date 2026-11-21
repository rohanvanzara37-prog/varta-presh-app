import React, { useState } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Image as ImageIcon, Trash2 } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, formatFirestoreTime, handleFirestoreError, OperationType } from '../firebase';
import { BLUEPRINT_LIMITS, type AppLang, type StoryItem, type UserPublic } from '../types/social';
import { LOCAL_ASSETS, UI_COPY } from '../data/socialPresets';
import { compressAndUploadImage } from '../utils/imageUpload';
import { AvatarImg } from './AvatarImg';

interface StoriesStripProps {
  currentUser: UserPublic;
  stories: StoryItem[];
  lang: AppLang;
}

const STORY_COLORS = [
  '#1877F2',
  '#E11D48',
  '#0D9488',
  '#7C3AED',
  '#D97706',
  '#1E293B',
];

export const StoriesStrip: React.FC<StoriesStripProps> = ({
  currentUser,
  stories,
  lang,
}) => {
  const t = UI_COPY[lang];
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [bgColor, setBgColor] = useState(STORY_COLORS[0]);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      const url = await compressAndUploadImage(file);
      setImageUrl(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCaption = caption.trim().slice(0, BLUEPRINT_LIMITS.STORY_CAPTION_MAX);
    if (!cleanCaption && !imageUrl) {
      setErrorMsg(lang === 'hi' ? 'कृपया टेक्स्ट लिखें या फोटो चुनें' : 'Add a caption or photo for your story.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const payload: Record<string, unknown> = {
        authorId: currentUser.uid,
        authorName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        caption: cleanCaption,
        bgColor,
        visibility: 'public',
        createdAt: serverTimestamp(),
      };
      if (currentUser.avatarUrl) {
        payload.authorAvatar = currentUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX);
      }
      if (imageUrl) {
        payload.imageUrl = imageUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX);
      }
      await addDoc(collection(db, 'stories'), payload);
      setCaption('');
      setImageUrl('');
      setCreateOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'stories');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    try {
      await deleteDoc(doc(db, 'stories', storyId));
      setViewerIndex(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `stories/${storyId}`);
    }
  };

  const activeStory = viewerIndex !== null ? stories[viewerIndex] : null;

  return (
    <>
      <section aria-label="Stories" className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-3">
        <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-28 h-48 rounded-xl overflow-hidden border border-[#CED0D4] dark:border-[#3E4042] bg-[#F0F2F5] dark:bg-[#3A3B3C] shrink-0 flex flex-col cursor-pointer group hover:opacity-95 transition-opacity"
          >
            <div className="relative h-32 w-full overflow-hidden bg-[#1877F2]/10">
              <img
                src={currentUser.avatarUrl || LOCAL_ASSETS.coverCommunity}
                alt={currentUser.displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </div>
            <div className="relative flex-1 w-full bg-white dark:bg-[#242526] flex flex-col items-center justify-end pb-2.5 px-1.5">
              <div className="absolute -top-4 w-8 h-8 rounded-full bg-[#1877F2] text-white border-4 border-white dark:border-[#242526] flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-center leading-tight line-clamp-2">
                {t.createStory}
              </span>
            </div>
          </button>

          {stories.map((story, idx) => (
            <button
              key={story.id}
              type="button"
              onClick={() => setViewerIndex(idx)}
              style={!story.imageUrl ? { backgroundColor: story.bgColor || '#1877F2' } : undefined}
              className="relative w-28 h-48 rounded-xl overflow-hidden shrink-0 text-left cursor-pointer group border border-[#CED0D4]/60 dark:border-[#3E4042]"
            >
              {story.imageUrl && (
                <img
                  src={story.imageUrl}
                  alt={story.caption || story.authorName}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/25" />
              <div className="relative z-10 h-full p-2.5 flex flex-col justify-between">
                <div className="w-9 h-9 rounded-full p-0.5 bg-[#1877F2]">
                  <AvatarImg
                    src={story.authorAvatar}
                    name={story.authorName}
                    sizeClass="w-8 h-8"
                  />
                </div>
                <div>
                  {!story.imageUrl && story.caption && (
                    <p className="text-[11px] text-white/95 font-medium line-clamp-3 mb-1.5 leading-snug">
                      {story.caption}
                    </p>
                  )}
                  <p className="text-xs font-semibold text-white truncate">
                    {story.authorName}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#CED0D4] dark:border-[#3E4042] pb-3">
              <h3 className="font-display text-lg font-bold">{t.createStory}</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="min-h-[36px] min-w-[36px] rounded-full bg-[#E4E6EB] dark:bg-[#3A3B3C] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStory} className="space-y-4">
              <div
                style={!imageUrl ? { backgroundColor: bgColor } : undefined}
                className="relative h-56 rounded-xl overflow-hidden flex items-center justify-center p-5 text-center border border-[#CED0D4] dark:border-[#3E4042]"
              >
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Story preview"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                {imageUrl && <div className="absolute inset-0 bg-black/35" />}
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.STORY_CAPTION_MAX}
                  placeholder={lang === 'hi' ? 'अपनी स्टोरी लिखें...' : 'Type something for your story...'}
                  className="relative z-10 w-full bg-transparent text-white placeholder:text-white/75 text-center font-semibold text-lg resize-none focus:outline-none"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {STORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        setBgColor(color);
                        setImageUrl('');
                      }}
                      style={{ backgroundColor: color }}
                      aria-label={`Story color ${color}`}
                      className={`w-7 h-7 rounded-full cursor-pointer border-2 ${
                        bgColor === color && !imageUrl
                          ? 'border-[#050505] dark:border-white scale-110'
                          : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>

                <label className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:opacity-90">
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  <span>{uploading ? '...' : lang === 'hi' ? 'फोटो चुनें' : 'Add Photo'}</span>
                  <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </label>
              </div>

              {errorMsg && <p className="text-xs text-rose-600 dark:text-rose-400">{errorMsg}</p>}

              <button
                type="submit"
                disabled={saving || uploading}
                className="w-full min-h-[44px] rounded-xl bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 text-white font-semibold text-sm cursor-pointer"
              >
                {saving ? (lang === 'hi' ? 'शेयर हो रहा है...' : 'Sharing...') : lang === 'hi' ? 'स्टोरी शेयर करें' : 'Share to Story'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeStory && viewerIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div
            style={!activeStory.imageUrl ? { backgroundColor: activeStory.bgColor || '#1877F2' } : undefined}
            className="relative max-w-sm w-full h-[78vh] max-h-[680px] rounded-2xl overflow-hidden flex flex-col justify-between p-4 border border-white/15"
          >
            {activeStory.imageUrl && (
              <img
                src={activeStory.imageUrl}
                alt={activeStory.caption || activeStory.authorName}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/75" />

            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <AvatarImg src={activeStory.authorAvatar} name={activeStory.authorName} sizeClass="w-9 h-9" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{activeStory.authorName}</p>
                  <p className="text-xs text-white/80 font-mono-tabular">{formatFirestoreTime(activeStory.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {activeStory.authorId === currentUser.uid && (
                  <button
                    type="button"
                    onClick={() => handleDeleteStory(activeStory.id)}
                    aria-label="Delete story"
                    className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer hover:bg-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewerIndex(null)}
                  aria-label="Close story"
                  className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="relative z-10 flex items-center justify-between">
              <button
                type="button"
                disabled={viewerIndex <= 0}
                onClick={() => setViewerIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))}
                className="w-10 h-10 rounded-full bg-black/40 text-white disabled:opacity-25 flex items-center justify-center cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                disabled={viewerIndex >= stories.length - 1}
                onClick={() =>
                  setViewerIndex((prev) => (prev !== null && prev < stories.length - 1 ? prev + 1 : prev))
                }
                className="w-10 h-10 rounded-full bg-black/40 text-white disabled:opacity-25 flex items-center justify-center cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="relative z-10 text-center px-2 pb-2">
              {activeStory.caption && (
                <p className="text-base font-medium text-white drop-shadow-sm">{activeStory.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
