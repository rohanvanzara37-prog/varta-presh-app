import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Globe,
  Lock,
  MessageSquare,
  Send,
  Share2,
  ThumbsUp,
  Trash2,
  Users,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, formatFirestoreTime, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  type AppLang,
  type PostComment,
  type PostReaction,
  type ReactionType,
  type SocialPost,
  type UserPublic,
} from '../types/social';
import { POST_BG_STYLES, REACTION_META, UI_COPY } from '../data/socialPresets';
import { AvatarImg } from './AvatarImg';

interface PostCardProps {
  post: SocialPost;
  currentUser: UserPublic;
  isSaved: boolean;
  onToggleSave: (postId: string) => void;
  onOpenProfile: (uid: string) => void;
  lang: AppLang;
}

const REACTION_KEYS: ReactionType[] = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUser,
  isSaved,
  onToggleSave,
  onOpenProfile,
  lang,
}) => {
  const t = UI_COPY[lang];
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [showReactionTray, setShowReactionTray] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [post.imageUrl]);

  useEffect(() => {
    const reactionRef = doc(db, 'posts', post.id, 'reactions', currentUser.uid);
    const unsub = onSnapshot(
      reactionRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PostReaction;
          setMyReaction(data.type);
        } else {
          setMyReaction(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `posts/${post.id}/reactions/${currentUser.uid}`)
    );
    return unsub;
  }, [post.id, currentUser.uid]);

  useEffect(() => {
    if (!commentsOpen) return;
    const commentsQuery = query(
      collection(db, 'posts', post.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      commentsQuery,
      (snap) => {
        const list: PostComment[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PostComment, 'id'>),
        }));
        setComments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `posts/${post.id}/comments`)
    );
    return unsub;
  }, [commentsOpen, post.id]);

  const handleReact = async (type: ReactionType) => {
    setShowReactionTray(false);
    const reactionRef = doc(db, 'posts', post.id, 'reactions', currentUser.uid);
    const postRef = doc(db, 'posts', post.id);

    try {
      if (myReaction === type) {
        await deleteDoc(reactionRef);
        await updateDoc(postRef, {
          likesCount: Math.max(0, post.likesCount - 1),
          updatedAt: serverTimestamp(),
        });
      } else {
        const wasReacted = myReaction !== null;
        await setDoc(reactionRef, {
          postId: post.id,
          userId: currentUser.uid,
          userName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
          type,
          createdAt: serverTimestamp(),
        });
        if (!wasReacted) {
          await updateDoc(postRef, {
            likesCount: post.likesCount + 1,
            updatedAt: serverTimestamp(),
          });
          if (post.authorId !== currentUser.uid) {
            await addDoc(collection(db, 'notifications'), {
              toUid: post.authorId,
              fromUid: currentUser.uid,
              fromName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
              ...(currentUser.avatarUrl ? { fromAvatar: currentUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX) } : {}),
              type: 'like',
              postId: post.id,
              message: `${currentUser.displayName} reacted (${REACTION_META[type].emoji}) to your post.`,
              read: false,
              createdAt: serverTimestamp(),
            });
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/reactions`);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = commentDraft.trim().slice(0, BLUEPRINT_LIMITS.COMMENT_MAX);
    if (!clean || sendingComment) return;
    setSendingComment(true);
    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        postId: post.id,
        authorId: currentUser.uid,
        authorName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        ...(currentUser.avatarUrl ? { authorAvatar: currentUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX) } : {}),
        text: clean,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', post.id), {
        commentsCount: post.commentsCount + 1,
        updatedAt: serverTimestamp(),
      });
      if (post.authorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUid: post.authorId,
          fromUid: currentUser.uid,
          fromName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
          ...(currentUser.avatarUrl ? { fromAvatar: currentUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX) } : {}),
          type: 'comment',
          postId: post.id,
          message: `${currentUser.displayName} commented: "${clean.slice(0, 60)}"`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      setCommentDraft('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `posts/${post.id}/comments`);
    } finally {
      setSendingComment(false);
    }
  };

  const handleShare = async () => {
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        sharesCount: post.sharesCount + 1,
        updatedAt: serverTimestamp(),
      });
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${window.location.origin}/?post=${post.id}`).catch(() => {});
      }
      setShareFeedback(lang === 'hi' ? 'लिंक कॉपी हो गया!' : 'Link copied & shared!');
      setTimeout(() => setShareFeedback(null), 2200);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const handleDeletePost = async () => {
    try {
      await deleteDoc(doc(db, 'posts', post.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
    }
  };

  const bgDef = POST_BG_STYLES.find((s) => s.id === post.bgStyle);
  const hasColoredBackdrop = Boolean(bgDef && bgDef.id !== 'none' && !post.imageUrl);
  const activeReactionMeta = myReaction ? REACTION_META[myReaction] : null;

  return (
    <article className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] overflow-hidden">
      <div className="p-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onOpenProfile(post.authorId)}
            className="cursor-pointer shrink-0"
          >
            <AvatarImg src={post.authorAvatar} name={post.authorName} sizeClass="w-10 h-10" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 text-sm leading-snug">
              <button
                type="button"
                onClick={() => onOpenProfile(post.authorId)}
                className="font-semibold hover:underline cursor-pointer text-left"
              >
                {post.authorName}
              </button>
              {post.feeling && (
                <span className="text-[#65676B] dark:text-[#B0B3B8]">— {post.feeling}</span>
              )}
              {post.groupName && (
                <span className="text-[#65676B] dark:text-[#B0B3B8]">
                  · {post.groupName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#65676B] dark:text-[#B0B3B8] mt-0.5">
              <span className="font-mono-tabular">{formatFirestoreTime(post.createdAt)}</span>
              <span aria-hidden="true">·</span>
              {post.visibility === 'public' && <Globe className="w-3.5 h-3.5" />}
              {post.visibility === 'friends' && <Users className="w-3.5 h-3.5" />}
              {post.visibility === 'only_me' && <Lock className="w-3.5 h-3.5" />}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onToggleSave(post.id)}
            aria-label={isSaved ? t.savedDone : t.save}
            className={`min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              isSaved
                ? 'text-[#1877F2] bg-[#1877F2]/10'
                : 'text-[#65676B] dark:text-[#B0B3B8] hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C]'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
          </button>
          {post.authorId === currentUser.uid && (
            <button
              type="button"
              onClick={handleDeletePost}
              aria-label="Delete post"
              className="min-h-[36px] min-w-[36px] rounded-lg text-[#65676B] dark:text-[#B0B3B8] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-center transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {post.text && (
        <div
          className={
            hasColoredBackdrop && bgDef
              ? `${bgDef.className} px-6 py-12 text-center text-xl font-bold leading-snug`
              : 'px-4 pb-3 text-[15px] leading-relaxed whitespace-pre-wrap'
          }
        >
          {post.text}
        </div>
      )}

      {post.imageUrl && !imgFailed && (
        <div className="bg-[#F0F2F5] dark:bg-[#18191A] border-y border-[#CED0D4]/60 dark:border-[#3E4042]">
          <img
            src={post.imageUrl}
            alt={post.text || `${post.authorName} post`}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full max-h-[480px] object-cover"
          />
        </div>
      )}

      <div className="px-4 py-2.5 flex items-center justify-between text-xs text-[#65676B] dark:text-[#B0B3B8] border-b border-[#CED0D4]/60 dark:border-[#3E4042]">
        <div className="flex items-center gap-1.5 font-mono-tabular">
          {post.likesCount > 0 && (
            <span>
              {activeReactionMeta ? activeReactionMeta.emoji : '👍'} {post.likesCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 font-mono-tabular">
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            className="hover:underline cursor-pointer"
          >
            {post.commentsCount} {lang === 'hi' ? 'कमेंट्स' : 'comments'}
          </button>
          <span>
            {post.sharesCount} {lang === 'hi' ? 'शेयर' : 'shares'}
          </span>
        </div>
      </div>

      {shareFeedback && (
        <div className="px-4 py-1.5 bg-[#1877F2]/10 text-[#1877F2] text-xs font-medium text-center">
          {shareFeedback}
        </div>
      )}

      <div
        className="relative px-2 py-1 grid grid-cols-3 gap-1"
        onMouseLeave={() => setShowReactionTray(false)}
      >
        {showReactionTray && (
          <div className="absolute -top-12 left-3 z-20 bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042] rounded-2xl shadow-lg px-2 py-1.5 flex items-center gap-1">
            {REACTION_KEYS.map((rk) => (
              <button
                key={rk}
                type="button"
                onClick={() => handleReact(rk)}
                title={lang === 'hi' ? REACTION_META[rk].labelHi : REACTION_META[rk].labelEn}
                className="w-9 h-9 rounded-xl hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C] text-xl flex items-center justify-center hover:scale-115 transition-transform cursor-pointer"
              >
                {REACTION_META[rk].emoji}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onMouseEnter={() => setShowReactionTray(true)}
          onClick={() => handleReact(myReaction ?? 'like')}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowReactionTray((v) => !v);
          }}
          className={`min-h-[42px] rounded-lg flex items-center justify-center gap-2 text-sm font-semibold hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C] transition-colors cursor-pointer ${
            activeReactionMeta ? activeReactionMeta.colorClass : 'text-[#65676B] dark:text-[#B0B3B8]'
          }`}
        >
          {activeReactionMeta ? (
            <>
              <span className="text-base">{activeReactionMeta.emoji}</span>
              <span>{lang === 'hi' ? activeReactionMeta.labelHi : activeReactionMeta.labelEn}</span>
            </>
          ) : (
            <>
              <ThumbsUp className="w-4 h-4" />
              <span>{t.like}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="min-h-[42px] rounded-lg flex items-center justify-center gap-2 text-sm font-semibold text-[#65676B] dark:text-[#B0B3B8] hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C] transition-colors cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          <span>{t.comment}</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="min-h-[42px] rounded-lg flex items-center justify-center gap-2 text-sm font-semibold text-[#65676B] dark:text-[#B0B3B8] hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C] transition-colors cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          <span>{t.share}</span>
        </button>
      </div>

      {commentsOpen && (
        <div className="px-4 py-3 border-t border-[#CED0D4]/60 dark:border-[#3E4042] bg-[#F0F2F5]/45 dark:bg-[#18191A]/40 space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => onOpenProfile(c.authorId)}
                className="shrink-0 cursor-pointer"
              >
                <AvatarImg src={c.authorAvatar} name={c.authorName} sizeClass="w-8 h-8" />
              </button>
              <div className="flex-1 min-w-0 bg-white dark:bg-[#3A3B3C] rounded-xl px-3 py-2 border border-[#CED0D4]/50 dark:border-transparent">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(c.authorId)}
                    className="text-xs font-bold hover:underline cursor-pointer"
                  >
                    {c.authorName}
                  </button>
                  <span className="text-[11px] text-[#65676B] dark:text-[#B0B3B8] font-mono-tabular">
                    {formatFirestoreTime(c.createdAt)}
                  </span>
                </div>
                <p className="text-sm mt-0.5 break-words">{c.text}</p>
              </div>
            </div>
          ))}

          <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-1">
            <AvatarImg src={currentUser.avatarUrl} name={currentUser.displayName} sizeClass="w-8 h-8" />
            <input
              type="text"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.COMMENT_MAX}
              placeholder={t.writeComment}
              className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#3A3B3C] border border-[#CED0D4] dark:border-[#3E4042] text-sm focus:outline-none focus:border-[#1877F2]"
            />
            <button
              type="submit"
              disabled={!commentDraft.trim() || sendingComment}
              aria-label="Send comment"
              className="min-h-[40px] min-w-[40px] rounded-xl bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 text-white flex items-center justify-center cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </article>
  );
};
