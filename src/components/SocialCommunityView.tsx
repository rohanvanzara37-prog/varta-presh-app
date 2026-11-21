import React, { useEffect, useState } from 'react';
import {
  Globe,
  Image as ImageIcon,
  MessageSquare,
  Send,
  Share2,
  Smile,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import { FONT_OPTIONS } from '../data/newsData';
import type {
  CommunityComment,
  CommunityPost,
  FontOptionId,
  TypographySettings,
} from '../types/news';

interface SocialCommunityViewProps {
  typography: TypographySettings;
  firebaseUser: User | null;
  onRequestSignIn: () => void;
}

const COMMUNITY_POSTS_KEY = 'vp_community_posts_v1';
const FEELINGS = ['Watching Live News', 'Tracking Gold & BTC', 'Sharing Update', 'Community Poll'];

export const SocialCommunityView: React.FC<SocialCommunityViewProps> = ({
  typography,
  firebaseUser,
  onRequestSignIn,
}) => {
  const [localPosts, setLocalPosts] = useState<CommunityPost[]>(() => {
    try {
      const raw = localStorage.getItem(COMMUNITY_POSTS_KEY);
      return raw ? (JSON.parse(raw) as CommunityPost[]) : [];
    } catch {
      return [];
    }
  });
  const [cloudPosts, setCloudPosts] = useState<CommunityPost[]>([]);

  // Composer state
  const [authorName, setAuthorName] = useState<string>(
    firebaseUser?.displayName || 'Varta Presh Member'
  );
  const [postText, setPostText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [feeling, setFeeling] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [posting, setPosting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Per-post comments UI state
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [shareCopiedId, setShareCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (firebaseUser?.displayName) {
      setAuthorName(firebaseUser.displayName);
    }
  }, [firebaseUser?.displayName]);

  useEffect(() => {
    try {
      localStorage.setItem(COMMUNITY_POSTS_KEY, JSON.stringify(localPosts));
    } catch {
      // ignore localStorage quota errors
    }
  }, [localPosts]);

  // Listen to real public posts in Cloud Firestore when user is signed in
  useEffect(() => {
    if (!firebaseUser) {
      setCloudPosts([]);
      return;
    }

    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const mapped: CommunityPost[] = snap.docs
          .map((d): CommunityPost => {
            const data = d.data();
            return {
              id: `fs-${d.id}`,
              authorId: String(data.authorId ?? ''),
              authorName: String(data.authorName ?? 'Member'),
              authorAvatar: typeof data.authorAvatar === 'string' ? data.authorAvatar : undefined,
              text: String(data.text ?? ''),
              imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
              feeling: typeof data.feeling === 'string' ? data.feeling : undefined,
              visibility: data.visibility === 'friends' ? 'friends' : 'public',
              likesCount: Number(data.likesCount ?? 0),
              likedByMe: false,
              sharesCount: Number(data.sharesCount ?? 0),
              comments: [],
              createdAtMs:
                data.createdAt && typeof data.createdAt.toMillis === 'function'
                  ? data.createdAt.toMillis()
                  : Date.now(),
              syncedToCloud: true,
            };
          })
          .filter((p) => p.text.length > 0 || p.imageUrl);
        setCloudPosts(mapped);
      },
      () => {
        // Silently keep local posts if Firestore read fails
      }
    );

    return () => unsub();
  }, [firebaseUser]);

  const getFontFamily = (id: FontOptionId) =>
    FONT_OPTIONS.find((f) => f.id === id)?.cssFamily ?? FONT_OPTIONS[0].cssFamily;

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    setUploadingImage(true);
    setErrorMsg(null);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });

      // Try uploading to server /api/upload-image for clean URL, fall back cleanly to local preview dataUrl
      try {
        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        });
        if (res.ok) {
          const json = (await res.json()) as { url?: string };
          if (json.url) {
            setImageUrl(json.url);
            setUploadingImage(false);
            return;
          }
        }
      } catch {
        // Use local dataUrl preview
      }

      setImageUrl(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Image preview failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = postText.trim();
    if (!cleanText && !imageUrl) {
      setErrorMsg('Write an update or attach a photo before posting.');
      return;
    }

    setPosting(true);
    setErrorMsg(null);
    const displayAuthor = authorName.trim() || firebaseUser?.displayName || 'Varta Presh Reader';

    const newPost: CommunityPost = {
      id: `post-${Date.now()}`,
      authorId: firebaseUser?.uid ?? 'local-user',
      authorName: displayAuthor,
      authorAvatar: firebaseUser?.photoURL ?? undefined,
      text: cleanText,
      imageUrl: imageUrl || undefined,
      feeling: feeling || undefined,
      visibility,
      likesCount: 0,
      likedByMe: false,
      sharesCount: 0,
      comments: [],
      createdAtMs: Date.now(),
    };

    if (firebaseUser && (!imageUrl || imageUrl.length <= 600)) {
      try {
        await addDoc(collection(db, 'posts'), {
          authorId: firebaseUser.uid,
          authorName: displayAuthor.slice(0, 80),
          ...(firebaseUser.photoURL ? { authorAvatar: firebaseUser.photoURL.slice(0, 600) } : {}),
          text: cleanText.slice(0, 3000),
          ...(imageUrl ? { imageUrl: imageUrl.slice(0, 600) } : {}),
          ...(feeling ? { feeling: feeling.slice(0, 60) } : {}),
          visibility,
          likesCount: 0,
          commentsCount: 0,
          sharesCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Also keep in localPosts so user sees post immediately
        setLocalPosts((prev) => [newPost, ...prev]);
      }
    } else {
      setLocalPosts((prev) => [newPost, ...prev]);
    }

    setPostText('');
    setImageUrl('');
    setFeeling('');
    setPosting(false);
  };

  const handleToggleLike = (postId: string) => {
    setLocalPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByMe: !p.likedByMe,
              likesCount: p.likedByMe ? Math.max(0, p.likesCount - 1) : p.likesCount + 1,
            }
          : p
      )
    );
  };

  const handleAddComment = (e: React.FormEvent, postId: string) => {
    e.preventDefault();
    const draft = (commentDrafts[postId] ?? '').trim();
    if (!draft) return;
    const comment: CommunityComment = {
      id: `c-${Date.now()}`,
      author: authorName.trim() || 'You',
      text: draft,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setLocalPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, comment] } : p))
    );
    setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
    setOpenCommentsId(postId);
  };

  const handleSharePost = async (post: CommunityPost) => {
    setLocalPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, sharesCount: p.sharesCount + 1 } : p))
    );
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${post.authorName}: ${post.text}`);
      }
    } catch {
      // ignore clipboard errors
    }
    setShareCopiedId(post.id);
    window.setTimeout(() => setShareCopiedId(null), 2000);
  };

  const handleDeleteLocalPost = (postId: string) => {
    setLocalPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const allFeedPosts = [...localPosts, ...cloudPosts].sort(
    (a, b) => b.createdAtMs - a.createdAtMs
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ fontFamily: getFontFamily(typography.headlineFont) }}
          >
            Varta Presh Community
          </h1>
          <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--vp-muted)' }}>
            Share posts, photos, market thoughts, and discuss live headlines with the community
          </p>
        </div>

        {!firebaseUser && (
          <button
            type="button"
            onClick={onRequestSignIn}
            className="min-h-[40px] rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--vp-surface)',
              borderColor: 'var(--vp-border)',
              color: 'var(--vp-primary)',
            }}
          >
            Sign in with Google to Sync Cloud Feed
          </button>
        )}
      </div>

      {/* Facebook-Style Post Creator Card */}
      <section
        aria-label="Create a community post"
        className="rounded-2xl border p-4 sm:p-5 space-y-4"
        style={{
          backgroundColor: 'var(--vp-surface)',
          borderColor: 'var(--vp-border)',
        }}
      >
        <form onSubmit={handlePublishPost} className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shrink-0"
                style={{
                  backgroundColor: 'var(--vp-primary)',
                  color: 'var(--vp-primary-fg)',
                }}
              >
                {authorName.slice(0, 1).toUpperCase()}
              </div>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                aria-label="Your display name"
                className="min-h-[36px] rounded-lg border px-2.5 text-sm font-semibold outline-none"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              />
            </div>

            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value === 'friends' ? 'friends' : 'public')}
              aria-label="Post audience"
              className="min-h-[36px] rounded-lg border px-2.5 text-xs font-semibold outline-none cursor-pointer"
              style={{
                backgroundColor: 'var(--vp-elevated)',
                borderColor: 'var(--vp-border)',
                color: 'var(--vp-text)',
              }}
            >
              <option value="public">Public</option>
              <option value="friends">Followers</option>
            </select>
          </div>

          <textarea
            rows={3}
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder={`What's happening right now, ${authorName.split(' ')[0]}?`}
            className="w-full rounded-xl border p-3.5 text-sm outline-none resize-y"
            style={{
              backgroundColor: 'var(--vp-elevated)',
              borderColor: 'var(--vp-border)',
              color: 'var(--vp-text)',
            }}
          />

          {imageUrl && (
            <div className="relative overflow-hidden rounded-xl border" style={{ borderColor: 'var(--vp-border)' }}>
              <img
                src={imageUrl}
                alt="Post attachment preview"
                className="max-h-80 w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                aria-label="Remove image"
                className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {feeling && (
            <div className="flex items-center justify-between text-xs px-1" style={{ color: 'var(--vp-muted)' }}>
              <span>Activity: <strong style={{ color: 'var(--vp-text)' }}>{feeling}</strong></span>
              <button type="button" onClick={() => setFeeling('')} className="underline cursor-pointer">
                Clear
              </button>
            </div>
          )}

          {errorMsg && <p className="text-xs font-semibold text-red-500">{errorMsg}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'var(--vp-border)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <label
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                <ImageIcon className="h-4 w-4" style={{ color: '#10b981' }} />
                <span>{uploadingImage ? 'Uploading...' : 'Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImagePick}
                  className="hidden"
                />
              </label>

              <select
                value={feeling}
                onChange={(e) => setFeeling(e.target.value)}
                aria-label="Select activity"
                className="min-h-[40px] rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer outline-none"
                style={{
                  backgroundColor: 'var(--vp-elevated)',
                  borderColor: 'var(--vp-border)',
                  color: 'var(--vp-text)',
                }}
              >
                <option value="">+ Activity</option>
                {FEELINGS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={posting || uploadingImage}
              className="min-h-[40px] rounded-xl px-5 py-2 text-sm font-semibold cursor-pointer transition-transform active:scale-[0.98]"
              style={{
                backgroundColor: 'var(--vp-primary)',
                color: 'var(--vp-primary-fg)',
              }}
            >
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      </section>

      {/* Posts Feed */}
      {allFeedPosts.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center space-y-2"
          style={{
            backgroundColor: 'var(--vp-surface)',
            borderColor: 'var(--vp-border)',
          }}
        >
          <Smile className="h-8 w-8 mx-auto opacity-70" style={{ color: 'var(--vp-primary)' }} />
          <h2 className="text-base font-bold">Start the Community Conversation</h2>
          <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--vp-muted)' }}>
            No posts yet — write your first status update or attach a photo above. Every post supports instant likes, comments, and sharing.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {allFeedPosts.map((post) => {
            const commentsOpen = openCommentsId === post.id;
            const timeLabel = new Date(post.createdAtMs).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <article
                key={post.id}
                className="rounded-2xl border overflow-hidden"
                style={{
                  backgroundColor: 'var(--vp-surface)',
                  borderColor: 'var(--vp-border)',
                }}
              >
                {/* Post Header */}
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {post.authorAvatar ? (
                      <img
                        src={post.authorAvatar}
                        alt={post.authorName}
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shrink-0"
                        style={{
                          backgroundColor: 'var(--vp-secondary)',
                          color: 'var(--vp-secondary-fg)',
                        }}
                      >
                        {post.authorName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="font-bold truncate">{post.authorName}</span>
                        {post.feeling && (
                          <span className="text-xs" style={{ color: 'var(--vp-muted)' }}>
                            is {post.feeling}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--vp-muted)' }}>
                        <span>{timeLabel}</span>
                        <span aria-hidden="true">·</span>
                        <Globe className="h-3 w-3" />
                        <span>{post.visibility === 'public' ? 'Public' : 'Followers'}</span>
                      </div>
                    </div>
                  </div>

                  {!post.syncedToCloud && (
                    <button
                      type="button"
                      onClick={() => handleDeleteLocalPost(post.id)}
                      aria-label="Delete post"
                      className="p-1.5 rounded-lg cursor-pointer hover:opacity-80"
                      style={{ color: 'var(--vp-muted)' }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Body */}
                {post.text && (
                  <p className="px-4 pb-3 text-sm sm:text-base whitespace-pre-wrap leading-relaxed">
                    {post.text}
                  </p>
                )}

                {post.imageUrl && (
                  <div className="bg-black/5">
                    <img
                      src={post.imageUrl}
                      alt="Community post attachment"
                      className="max-h-[480px] w-full object-cover"
                    />
                  </div>
                )}

                {/* Counts Bar */}
                <div
                  className="px-4 py-2 flex items-center justify-between text-xs border-t"
                  style={{ borderColor: 'var(--vp-border)', color: 'var(--vp-muted)' }}
                >
                  <span>{post.likesCount} Likes</span>
                  <span>
                    {post.comments.length} Comments · {post.sharesCount} Shares
                  </span>
                </div>

                {/* Actions Row */}
                <div
                  className="grid grid-cols-3 border-t"
                  style={{ borderColor: 'var(--vp-border)' }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleLike(post.id)}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                    style={{
                      color: post.likedByMe ? 'var(--vp-primary)' : 'var(--vp-muted)',
                    }}
                  >
                    <ThumbsUp className={`h-4 w-4 ${post.likedByMe ? 'fill-current' : ''}`} />
                    <span>{post.likedByMe ? 'Liked' : 'Like'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOpenCommentsId(commentsOpen ? null : post.id)}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold cursor-pointer"
                    style={{ color: 'var(--vp-muted)' }}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Comment</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSharePost(post)}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold cursor-pointer"
                    style={{ color: 'var(--vp-muted)' }}
                  >
                    <Share2 className="h-4 w-4" />
                    <span>{shareCopiedId === post.id ? 'Copied' : 'Share'}</span>
                  </button>
                </div>

                {/* Inline Comments */}
                {commentsOpen && (
                  <div
                    className="border-t p-4 space-y-3"
                    style={{
                      backgroundColor: 'var(--vp-elevated)',
                      borderColor: 'var(--vp-border)',
                    }}
                  >
                    {post.comments.length > 0 && (
                      <div className="space-y-2">
                        {post.comments.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-xl border px-3 py-2 text-xs space-y-0.5"
                            style={{
                              backgroundColor: 'var(--vp-surface)',
                              borderColor: 'var(--vp-border)',
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{c.author}</span>
                              <span style={{ color: 'var(--vp-muted)' }}>{c.createdAt}</span>
                            </div>
                            <p className="text-sm">{c.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={(e) => handleAddComment(e, post.id)} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={commentDrafts[post.id] ?? ''}
                        onChange={(e) =>
                          setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                        }
                        placeholder="Write a comment..."
                        className="flex-1 min-h-[40px] rounded-xl border px-3 text-sm outline-none"
                        style={{
                          backgroundColor: 'var(--vp-surface)',
                          borderColor: 'var(--vp-border)',
                          color: 'var(--vp-text)',
                        }}
                      />
                      <button
                        type="submit"
                        className="min-h-[40px] rounded-xl px-3.5 font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--vp-primary)',
                          color: 'var(--vp-primary-fg)',
                        }}
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
