import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Users, X } from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  type AppLang,
  type SocialGroup,
  type SocialPost,
  type UserPublic,
} from '../types/social';
import { LOCAL_ASSETS } from '../data/socialPresets';
import { PostCard } from './PostCard';

interface GroupsViewProps {
  currentUser: UserPublic;
  groups: SocialGroup[];
  posts: SocialPost[];
  savedPostIds: string[];
  onToggleSave: (postId: string) => void;
  onOpenProfile: (uid: string) => void;
  onOpenGroupComposer: (group: SocialGroup) => void;
  lang: AppLang;
}

export const GroupsView: React.FC<GroupsViewProps> = ({
  currentUser,
  groups,
  posts,
  savedPostIds,
  onToggleSave,
  onOpenProfile,
  onOpenGroupComposer,
  lang,
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Community');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [joinedMap, setJoinedMap] = useState<Record<string, boolean>>({});

  const activeGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  useEffect(() => {
    if (groups.length === 0) return;
    const unsubs = groups.map((g) =>
      onSnapshot(
        doc(db, 'groups', g.id, 'members', currentUser.uid),
        (snap) => {
          setJoinedMap((prev) => ({ ...prev, [g.id]: snap.exists() }));
        },
        (err) => handleFirestoreError(err, OperationType.GET, `groups/${g.id}/members/${currentUser.uid}`)
      )
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [groups, currentUser.uid]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().slice(0, BLUEPRINT_LIMITS.GROUP_NAME_MAX);
    const cleanDesc = description.trim().slice(0, BLUEPRINT_LIMITS.GROUP_DESC_MAX);
    if (cleanName.length < 2) return;

    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'groups'), {
        name: cleanName,
        category: category.slice(0, BLUEPRINT_LIMITS.GROUP_CAT_MAX),
        description: cleanDesc || 'Community discussions and shared updates.',
        coverUrl: LOCAL_ASSETS.coverCommunity,
        creatorId: currentUser.uid,
        membersCount: 1,
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'groups', ref.id, 'members', currentUser.uid), {
        groupId: ref.id,
        userId: currentUser.uid,
        role: 'admin',
        joinedAt: serverTimestamp(),
      });
      setName('');
      setDescription('');
      setCreateOpen(false);
      setSelectedGroupId(ref.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'groups');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMembership = async (group: SocialGroup) => {
    const isMember = Boolean(joinedMap[group.id]);
    const memberRef = doc(db, 'groups', group.id, 'members', currentUser.uid);
    const groupRef = doc(db, 'groups', group.id);
    try {
      if (isMember) {
        await deleteDoc(memberRef);
        await updateDoc(groupRef, {
          membersCount: Math.max(1, group.membersCount - 1),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(memberRef, {
          groupId: group.id,
          userId: currentUser.uid,
          role: 'member',
          joinedAt: serverTimestamp(),
        });
        await updateDoc(groupRef, {
          membersCount: group.membersCount + 1,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${group.id}/members`);
    }
  };

  if (activeGroup) {
    const groupPosts = posts.filter((p) => p.groupId === activeGroup.id);
    const isMember = Boolean(joinedMap[activeGroup.id]);

    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] overflow-hidden">
          <div className="relative h-44 bg-[#1877F2]/15">
            <img
              src={activeGroup.coverUrl || LOCAL_ASSETS.coverCommunity}
              alt={activeGroup.name}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => setSelectedGroupId(null)}
              className="absolute top-3 left-3 min-h-[36px] px-3 rounded-lg bg-black/60 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{lang === 'hi' ? 'सभी ग्रुप्स' : 'All Groups'}</span>
            </button>
          </div>
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">{activeGroup.name}</h2>
              <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] mt-0.5 font-mono-tabular">
                {activeGroup.category} · {activeGroup.membersCount}{' '}
                {lang === 'hi' ? 'सदस्य' : 'members'}
              </p>
              <p className="text-sm mt-2">{activeGroup.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleToggleMembership(activeGroup)}
                className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold cursor-pointer ${
                  isMember
                    ? 'bg-[#E4E6EB] dark:bg-[#3A3B3C]'
                    : 'bg-[#1877F2] hover:bg-[#166FE5] text-white'
                }`}
              >
                {isMember
                  ? lang === 'hi'
                    ? 'जुड़े हुए हैं'
                    : 'Joined'
                  : lang === 'hi'
                  ? 'ग्रुप जॉइन करें'
                  : 'Join Group'}
              </button>
              <button
                type="button"
                onClick={() => onOpenGroupComposer(activeGroup)}
                className="min-h-[40px] px-4 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-semibold cursor-pointer"
              >
                {lang === 'hi' ? 'ग्रुप में पोस्ट करें' : 'Post in Group'}
              </button>
            </div>
          </div>
        </div>

        {groupPosts.length === 0 ? (
          <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-8 text-center text-sm text-[#65676B] dark:text-[#B0B3B8]">
            {lang === 'hi'
              ? 'इस ग्रुप में अभी कोई पोस्ट नहीं है। पहली पोस्ट आप करें!'
              : 'No posts in this group yet. Start the first conversation!'}
          </div>
        ) : (
          groupPosts.map((post) => (
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
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">
            {lang === 'hi' ? 'कम्युनिटी ग्रुप्स' : 'Community Groups'}
          </h2>
          <p className="text-xs text-[#65676B] dark:text-[#B0B3B8]">
            {lang === 'hi'
              ? 'अपनी पसंद के ग्रुप से जुड़ें या नया ग्रुप बनाएं'
              : 'Join shared interest groups or create your own community'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="min-h-[40px] px-4 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'hi' ? 'नया ग्रुप' : 'Create Group'}</span>
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-8 text-center space-y-3">
          <Users className="w-10 h-10 text-[#1877F2] mx-auto" />
          <p className="text-sm text-[#65676B] dark:text-[#B0B3B8]">
            {lang === 'hi'
              ? 'अभी कोई ग्रुप नहीं बना है। अपना पहला कम्युनिटी ग्रुप बनाएं!'
              : 'No groups yet. Create the first community group on MitraBook!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {groups.map((group) => {
            const isMember = Boolean(joinedMap[group.id]);
            return (
              <div
                key={group.id}
                className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] overflow-hidden flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  className="h-32 w-full overflow-hidden bg-[#F0F2F5] cursor-pointer"
                >
                  <img
                    src={group.coverUrl || LOCAL_ASSETS.coverCommunity}
                    alt={group.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                  />
                </button>
                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      className="font-display text-base font-bold hover:underline text-left cursor-pointer"
                    >
                      {group.name}
                    </button>
                    <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] mt-0.5 font-mono-tabular">
                      {group.category} · {group.membersCount} {lang === 'hi' ? 'सदस्य' : 'members'}
                    </p>
                    <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] mt-2 line-clamp-2">
                      {group.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleMembership(group)}
                      className={`flex-1 min-h-[38px] rounded-lg text-xs font-semibold cursor-pointer ${
                        isMember
                          ? 'bg-[#E4E6EB] dark:bg-[#3A3B3C]'
                          : 'bg-[#1877F2] hover:bg-[#166FE5] text-white'
                      }`}
                    >
                      {isMember ? (lang === 'hi' ? 'जुड़े हैं' : 'Joined') : lang === 'hi' ? 'जॉइन करें' : 'Join'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      className="min-h-[38px] px-3 rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-xs font-semibold cursor-pointer"
                    >
                      {lang === 'hi' ? 'खोलें' : 'Open'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#242526] border border-[#CED0D4] dark:border-[#3E4042] rounded-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#CED0D4] dark:border-[#3E4042] pb-3">
              <h3 className="font-display text-lg font-bold">
                {lang === 'hi' ? 'नया ग्रुप बनाएं' : 'Create New Group'}
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="w-9 h-9 rounded-full bg-[#E4E6EB] dark:bg-[#3A3B3C] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  {lang === 'hi' ? 'ग्रुप का नाम' : 'Group Name'}
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={BLUEPRINT_LIMITS.GROUP_NAME_MAX}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mumbai Chai & Startups"
                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#F0F2F5] dark:bg-[#3A3B3C] text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  {lang === 'hi' ? 'कैटेगरी' : 'Category'}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-lg bg-[#F0F2F5] dark:bg-[#3A3B3C] text-sm focus:outline-none"
                >
                  <option value="Community">Community</option>
                  <option value="Travel">Travel</option>
                  <option value="Food">Food & Chai</option>
                  <option value="Tech">Tech & Startups</option>
                  <option value="Cricket">Cricket & Sports</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  {lang === 'hi' ? 'विवरण' : 'Description'}
                </label>
                <textarea
                  rows={3}
                  maxLength={BLUEPRINT_LIMITS.GROUP_DESC_MAX}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={lang === 'hi' ? 'ग्रुप के बारे में लिखें...' : 'What is this group about?'}
                  className="w-full p-3 rounded-lg bg-[#F0F2F5] dark:bg-[#3A3B3C] text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>

              <button
                type="submit"
                disabled={saving || name.trim().length < 2}
                className="w-full min-h-[44px] rounded-xl bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
              >
                {saving ? '...' : lang === 'hi' ? 'ग्रुप बनाएं' : 'Create Group'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
