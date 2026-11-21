import React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, formatFirestoreTime, handleFirestoreError, OperationType } from '../firebase';
import type { AppLang, SocialNotification } from '../types/social';
import { AvatarImg } from './AvatarImg';

interface NotificationsViewProps {
  notifications: SocialNotification[];
  onOpenProfile: (uid: string) => void;
  lang: AppLang;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onOpenProfile,
  lang,
}) => {
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markOneRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
    }
  };

  const markAllRead = async () => {
    try {
      await Promise.all(
        notifications
          .filter((n) => !n.read)
          .map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true }))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications');
    }
  };

  return (
    <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] overflow-hidden">
      <div className="p-4 border-b border-[#CED0D4] dark:border-[#3E4042] flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">
            {lang === 'hi' ? 'नोटिफिकेशंस' : 'Notifications'}
          </h2>
          <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] font-mono-tabular">
            {unreadCount} {lang === 'hi' ? 'अपठित' : 'unread'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="min-h-[38px] px-3 rounded-lg bg-[#E4E6EB] dark:bg-[#3A3B3C] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCheck className="w-4 h-4 text-[#1877F2]" />
            <span>{lang === 'hi' ? 'सभी पढ़े हुए मानें' : 'Mark all read'}</span>
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <Bell className="w-9 h-9 text-[#1877F2] mx-auto" />
          <p className="text-sm text-[#65676B] dark:text-[#B0B3B8]">
            {lang === 'hi'
              ? 'अभी कोई नया नोटिफिकेशन नहीं है।'
              : 'You are all caught up. Likes, comments, and friend alerts will appear here.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#CED0D4]/60 dark:divide-[#3E4042]">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (!n.read) void markOneRead(n.id);
                onOpenProfile(n.fromUid);
              }}
              className={`w-full p-4 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                n.read
                  ? 'hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C]/50'
                  : 'bg-[#1877F2]/8 hover:bg-[#1877F2]/12'
              }`}
            >
              <AvatarImg src={n.fromAvatar} name={n.fromName} sizeClass="w-11 h-11" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.read ? '' : 'font-semibold'}`}>{n.message}</p>
                <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] mt-0.5 font-mono-tabular">
                  {formatFirestoreTime(n.createdAt)}
                </p>
              </div>
              {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-[#1877F2] shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
