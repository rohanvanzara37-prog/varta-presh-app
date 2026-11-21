import React from 'react';
import { UserPlus, UserCheck, MessageCircle, X, Search } from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  type AppLang,
  type FriendRequest,
  type UserPublic,
} from '../types/social';
import { UI_COPY } from '../data/socialPresets';
import { AvatarImg } from './AvatarImg';

interface FriendsViewProps {
  currentUser: UserPublic;
  allUsers: UserPublic[];
  friendRequests: FriendRequest[];
  onStartChat: (targetUser: UserPublic) => void;
  onOpenProfile: (uid: string) => void;
  lang: AppLang;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  currentUser,
  allUsers,
  friendRequests,
  onStartChat,
  onOpenProfile,
  lang,
}) => {
  const t = UI_COPY[lang];
  const [search, setSearch] = React.useState('');

  const incomingRequests = friendRequests.filter(
    (r) => r.toUid === currentUser.uid && r.status === 'pending'
  );
  const outgoingRequests = friendRequests.filter(
    (r) => r.fromUid === currentUser.uid && r.status === 'pending'
  );
  const acceptedRequests = friendRequests.filter((r) => r.status === 'accepted');

  const friendUids = new Set(
    acceptedRequests.map((r) => (r.fromUid === currentUser.uid ? r.toUid : r.fromUid))
  );
  const relatedUids = new Set([
    currentUser.uid,
    ...friendRequests
      .filter((r) => r.status === 'pending' || r.status === 'accepted')
      .map((r) => (r.fromUid === currentUser.uid ? r.toUid : r.fromUid)),
  ]);

  const friendsList = allUsers.filter(
    (u) =>
      friendUids.has(u.uid) &&
      u.displayName.toLowerCase().includes(search.trim().toLowerCase())
  );

  const suggestions = allUsers.filter(
    (u) =>
      !relatedUids.has(u.uid) &&
      u.displayName.toLowerCase().includes(search.trim().toLowerCase())
  );

  const handleSendRequest = async (target: UserPublic) => {
    const reqId = `${currentUser.uid}_${target.uid}`.slice(0, 128);
    try {
      await setDoc(doc(db, 'friend_requests', reqId), {
        fromUid: currentUser.uid,
        fromName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        ...(currentUser.avatarUrl ? { fromAvatar: currentUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX) } : {}),
        toUid: target.uid,
        toName: target.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        ...(target.avatarUrl ? { toAvatar: target.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX) } : {}),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'notifications'), {
        toUid: target.uid,
        fromUid: currentUser.uid,
        fromName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        ...(currentUser.avatarUrl ? { fromAvatar: currentUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX) } : {}),
        type: 'friend_request',
        message: `${currentUser.displayName} sent you a friend request.`,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `friend_requests/${reqId}`);
    }
  };

  const handleRespond = async (req: FriendRequest, accept: boolean) => {
    try {
      await updateDoc(doc(db, 'friend_requests', req.id), {
        status: accept ? 'accepted' : 'declined',
        updatedAt: serverTimestamp(),
      });
      if (accept) {
        const sender = allUsers.find((u) => u.uid === req.fromUid);
        await updateDoc(doc(db, 'users_public', currentUser.uid), {
          friendsCount: currentUser.friendsCount + 1,
          updatedAt: serverTimestamp(),
        });
        if (sender) {
          await updateDoc(doc(db, 'users_public', sender.uid), {
            friendsCount: sender.friendsCount + 1,
            updatedAt: serverTimestamp(),
          });
        }
        await addDoc(collection(db, 'notifications'), {
          toUid: req.fromUid,
          fromUid: currentUser.uid,
          fromName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
          ...(currentUser.avatarUrl ? { fromAvatar: currentUser.avatarUrl.slice(0, BLUEPRINT_LIMITS.URL_MAX) } : {}),
          type: 'friend_accept',
          message: `${currentUser.displayName} accepted your friend request.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `friend_requests/${req.id}`);
    }
  };

  const handleCancelOrRemove = async (reqId: string, decrementCounts = false, otherUid?: string) => {
    try {
      await deleteDoc(doc(db, 'friend_requests', reqId));
      if (decrementCounts) {
        await updateDoc(doc(db, 'users_public', currentUser.uid), {
          friendsCount: Math.max(0, currentUser.friendsCount - 1),
          updatedAt: serverTimestamp(),
        });
        if (otherUid) {
          const other = allUsers.find((u) => u.uid === otherUid);
          if (other) {
            await updateDoc(doc(db, 'users_public', other.uid), {
              friendsCount: Math.max(0, other.friendsCount - 1),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `friend_requests/${reqId}`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{t.friends}</h2>
          <p className="text-xs text-[#65676B] dark:text-[#B0B3B8]">
            {lang === 'hi'
              ? `${friendsList.length} दोस्त · ${incomingRequests.length} नई रिक्वेस्ट`
              : `${friendsList.length} friends · ${incomingRequests.length} incoming requests`}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#65676B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'hi' ? 'लोगों को खोजें...' : 'Search people...'}
            className="w-full min-h-[40px] pl-9 pr-3 rounded-lg bg-[#F0F2F5] dark:bg-[#3A3B3C] text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
          />
        </div>
      </div>

      {incomingRequests.length > 0 && (
        <section className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-4 space-y-3">
          <h3 className="font-display text-base font-bold">
            {t.friendRequests} ({incomingRequests.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {incomingRequests.map((req) => (
              <div
                key={req.id}
                className="rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-3 flex items-center gap-3"
              >
                <button
                  type="button"
                  onClick={() => onOpenProfile(req.fromUid)}
                  className="cursor-pointer shrink-0"
                >
                  <AvatarImg src={req.fromAvatar} name={req.fromName} sizeClass="w-12 h-12" />
                </button>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(req.fromUid)}
                    className="text-sm font-semibold hover:underline truncate block cursor-pointer"
                  >
                    {req.fromName}
                  </button>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRespond(req, true)}
                      className="flex-1 min-h-[36px] px-3 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-semibold cursor-pointer"
                    >
                      {t.confirm}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(req, false)}
                      className="flex-1 min-h-[36px] px-3 rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-xs font-semibold cursor-pointer"
                    >
                      {t.decline}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {outgoingRequests.length > 0 && (
        <section className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-4 space-y-3">
          <h3 className="font-display text-base font-bold">
            {lang === 'hi' ? 'भेजी गई रिक्वेस्ट' : 'Sent Requests'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {outgoingRequests.map((req) => (
              <div
                key={req.id}
                className="rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarImg src={req.toAvatar} name={req.toName} sizeClass="w-10 h-10" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{req.toName}</p>
                    <p className="text-xs text-[#65676B] dark:text-[#B0B3B8]">
                      {lang === 'hi' ? 'पेंडिंग' : 'Pending'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancelOrRemove(req.id)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{lang === 'hi' ? 'रद्द करें' : 'Cancel'}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-4 space-y-3">
        <h3 className="font-display text-base font-bold">
          {lang === 'hi' ? 'आपके दोस्त' : 'Your Friends'}
        </h3>
        {friendsList.length === 0 ? (
          <p className="text-sm text-[#65676B] dark:text-[#B0B3B8] py-2">
            {lang === 'hi'
              ? 'अभी कोई जुड़ा हुआ दोस्त नहीं है। नीचे से लोगों को फ्रेंड रिक्वेस्ट भेजें!'
              : 'No connected friends yet. Add people below or invite friends via your link!'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {friendsList.map((friend) => {
              const rel = acceptedRequests.find(
                (r) =>
                  (r.fromUid === currentUser.uid && r.toUid === friend.uid) ||
                  (r.toUid === currentUser.uid && r.fromUid === friend.uid)
              );
              return (
                <div
                  key={friend.uid}
                  className="rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-3 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProfile(friend.uid)}
                    className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                  >
                    <AvatarImg src={friend.avatarUrl} name={friend.displayName} sizeClass="w-11 h-11" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate hover:underline">{friend.displayName}</p>
                      <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] truncate">
                        {friend.city || friend.work || (lang === 'hi' ? 'MitraBook सदस्य' : 'MitraBook member')}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onStartChat(friend)}
                      className="min-h-[36px] px-3 rounded-lg bg-[#1877F2]/10 text-[#1877F2] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{t.message}</span>
                    </button>
                    {rel && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrRemove(rel.id, true, friend.uid)}
                        title={lang === 'hi' ? 'अनफ्रेंड करें' : 'Unfriend'}
                        className="min-h-[36px] min-w-[36px] rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-[#65676B] dark:text-[#B0B3B8] flex items-center justify-center cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-4 space-y-3">
        <h3 className="font-display text-base font-bold">
          {lang === 'hi' ? 'लोग जिन्हें आप जानते होंगे' : 'People You May Know'}
        </h3>
        {suggestions.length === 0 ? (
          <p className="text-sm text-[#65676B] dark:text-[#B0B3B8]">
            {lang === 'hi'
              ? 'कोई नया सुझाव अभी उपलब्ध नहीं है। जब और यूज़र्स जुड़ेंगे तो वे यहाँ दिखेंगे।'
              : 'No new suggestions right now. Share your MitraBook link with friends so they appear here!'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((person) => (
              <div
                key={person.uid}
                className="rounded-xl border border-[#CED0D4] dark:border-[#3E4042] p-3 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => onOpenProfile(person.uid)}
                  className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                >
                  <AvatarImg src={person.avatarUrl} name={person.displayName} sizeClass="w-11 h-11" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate hover:underline">{person.displayName}</p>
                    <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] truncate">
                      {person.city || person.work || (lang === 'hi' ? 'MitraBook यूज़र' : 'MitraBook user')}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSendRequest(person)}
                    className="min-h-[36px] px-3 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{t.addFriend}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartChat(person)}
                    aria-label={t.message}
                    className="min-h-[36px] min-w-[36px] rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] flex items-center justify-center cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
