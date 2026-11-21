import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import {
  addDoc,
  collection,
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
  type ChatMessage,
  type ChatThread,
  type UserPublic,
} from '../types/social';
import { UI_COPY } from '../data/socialPresets';
import { AvatarImg } from './AvatarImg';

interface MessengerViewProps {
  currentUser: UserPublic;
  allUsers: UserPublic[];
  chats: ChatThread[];
  activeChatId: string | null;
  onSelectChatId: (chatId: string | null) => void;
  onStartChatWithUser: (target: UserPublic) => Promise<void>;
  lang: AppLang;
}

export const MessengerView: React.FC<MessengerViewProps> = ({
  currentUser,
  allUsers,
  chats,
  activeChatId,
  onSelectChatId,
  onStartChatWithUser,
  lang,
}) => {
  const t = UI_COPY[lang];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    const msgsQuery = query(
      collection(db, 'chats', activeChatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      msgsQuery,
      (snap) => {
        const list: ChatMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChatMessage, 'id'>),
        }));
        setMessages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `chats/${activeChatId}/messages`)
    );
    return unsub;
  }, [activeChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const getPeerFromChat = (chat: ChatThread): { uid: string; name: string; avatar?: string } => {
    const peerUid = chat.participants.find((id) => id !== currentUser.uid) ?? currentUser.uid;
    const found = allUsers.find((u) => u.uid === peerUid);
    return {
      uid: peerUid,
      name: found?.displayName || chat.participantNames?.[peerUid] || 'MitraBook User',
      avatar: found?.avatarUrl,
    };
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat) return;
    const clean = draft.trim().slice(0, BLUEPRINT_LIMITS.CHAT_MSG_MAX);
    if (!clean || sending) return;

    setSending(true);
    try {
      await addDoc(collection(db, 'chats', activeChat.id, 'messages'), {
        chatId: activeChat.id,
        participants: activeChat.participants,
        senderId: currentUser.uid,
        senderName: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        text: clean,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'chats', activeChat.id), {
        lastMessage: clean.slice(0, BLUEPRINT_LIMITS.CHAT_LAST_MSG_MAX),
        lastSenderId: currentUser.uid,
        updatedAt: serverTimestamp(),
      });
      setDraft('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `chats/${activeChat.id}/messages`);
    } finally {
      setSending(false);
    }
  };

  const otherUsers = allUsers.filter((u) => u.uid !== currentUser.uid);

  return (
    <div className="bg-white dark:bg-[#242526] rounded-xl border border-[#CED0D4] dark:border-[#3E4042] overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[540px] max-h-[75vh]">
      <aside
        className={`md:col-span-5 border-r border-[#CED0D4] dark:border-[#3E4042] flex flex-col overflow-hidden ${
          activeChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-[#CED0D4] dark:border-[#3E4042]">
          <h2 className="font-display text-lg font-bold">{t.messenger}</h2>
          <p className="text-xs text-[#65676B] dark:text-[#B0B3B8]">
            {lang === 'hi' ? 'रियल-टाइम प्राइवेट चैट' : 'Real-time direct messages'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#CED0D4]/50 dark:divide-[#3E4042]">
          {chats.map((chat) => {
            const peer = getPeerFromChat(chat);
            const selected = chat.id === activeChatId;
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => onSelectChatId(chat.id)}
                className={`w-full p-3.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                  selected
                    ? 'bg-[#1877F2]/10'
                    : 'hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C]/60'
                }`}
              >
                <AvatarImg src={peer.avatar} name={peer.name} sizeClass="w-11 h-11" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{peer.name}</span>
                    <span className="text-[11px] text-[#65676B] dark:text-[#B0B3B8] font-mono-tabular shrink-0">
                      {formatFirestoreTime(chat.updatedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-[#65676B] dark:text-[#B0B3B8] truncate mt-0.5">
                    {chat.lastSenderId === currentUser.uid ? `${lang === 'hi' ? 'आप: ' : 'You: '}` : ''}
                    {chat.lastMessage || (lang === 'hi' ? 'बातचीत शुरू करें' : 'Start a conversation')}
                  </p>
                </div>
              </button>
            );
          })}

          <div className="p-3 bg-[#F0F2F5]/60 dark:bg-[#18191A]/40">
            <p className="text-xs font-semibold text-[#65676B] dark:text-[#B0B3B8] mb-2">
              {lang === 'hi' ? 'नया चैट शुरू करें' : 'Start a chat with someone'}
            </p>
            {otherUsers.length === 0 ? (
              <p className="text-xs text-[#65676B] dark:text-[#B0B3B8]">
                {lang === 'hi'
                  ? 'जब दूसरे यूज़र्स जुड़ेंगे, आप यहाँ उनसे चैट कर पाएंगे।'
                  : 'Other MitraBook members will appear here as soon as they sign in.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {otherUsers.map((person) => (
                  <button
                    key={person.uid}
                    type="button"
                    onClick={() => onStartChatWithUser(person)}
                    className="w-full p-2 rounded-lg hover:bg-white dark:hover:bg-[#3A3B3C] flex items-center gap-2.5 text-left transition-colors cursor-pointer"
                  >
                    <AvatarImg src={person.avatarUrl} name={person.displayName} sizeClass="w-8 h-8" />
                    <span className="text-xs font-semibold truncate">{person.displayName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      <section
        className={`md:col-span-7 flex flex-col overflow-hidden ${
          activeChat ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-[#1877F2]/10 text-[#1877F2] flex items-center justify-center mb-3">
              <MessageCircle className="w-7 h-7" />
            </div>
            <h3 className="font-display text-lg font-bold">
              {lang === 'hi' ? 'अपना मैसेंजर इनबॉक्स चुनें' : 'Select a conversation'}
            </h3>
            <p className="mt-1 text-sm text-[#65676B] dark:text-[#B0B3B8] max-w-xs">
              {lang === 'hi'
                ? 'बाईं ओर से किसी दोस्त को चुनकर तुरंत लाइव चैट शुरू करें।'
                : 'Choose a conversation or click any member on the left to message them live.'}
            </p>
          </div>
        ) : (
          <>
            {(() => {
              const peer = getPeerFromChat(activeChat);
              return (
                <div className="px-4 py-3 border-b border-[#CED0D4] dark:border-[#3E4042] flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectChatId(null)}
                    aria-label="Back to chats"
                    className="md:hidden min-h-[36px] min-w-[36px] rounded-full hover:bg-[#F0F2F5] dark:hover:bg-[#3A3B3C] flex items-center justify-center cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <AvatarImg src={peer.avatar} name={peer.name} sizeClass="w-9 h-9" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{peer.name}</p>
                    <p className="text-[11px] text-[#65676B] dark:text-[#B0B3B8]">
                      {lang === 'hi' ? 'MitraBook मैसेंजर' : 'MitraBook Messenger'}
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#F0F2F5]/45 dark:bg-[#18191A]/40">
              {messages.length === 0 ? (
                <p className="text-center text-xs text-[#65676B] dark:text-[#B0B3B8] py-8">
                  {lang === 'hi' ? 'नमस्ते कहकर बातचीत शुरू करें!' : 'Say hello to start chatting!'}
                </p>
              ) : (
                messages.map((msg) => {
                  const mine = msg.senderId === currentUser.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-snug break-words ${
                          mine
                            ? 'bg-[#1877F2] text-white'
                            : 'bg-white dark:bg-[#3A3B3C] border border-[#CED0D4]/60 dark:border-transparent'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="mt-0.5 text-[10px] text-[#65676B] dark:text-[#B0B3B8] font-mono-tabular px-1">
                        {formatFirestoreTime(msg.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="p-3 border-t border-[#CED0D4] dark:border-[#3E4042] flex items-center gap-2"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.CHAT_MSG_MAX}
                placeholder={lang === 'hi' ? 'मैसेज लिखें...' : 'Aa...'}
                className="flex-1 min-h-[42px] px-4 rounded-xl bg-[#F0F2F5] dark:bg-[#3A3B3C] text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Send message"
                className="min-h-[42px] min-w-[42px] rounded-xl bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 text-white flex items-center justify-center cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
};

export async function ensureDirectChat(currentUser: UserPublic, targetUser: UserPublic): Promise<string> {
  const participants = [currentUser.uid, targetUser.uid].sort();
  const chatId = `${participants[0]}_${participants[1]}`.slice(0, 128);
  const chatRef = doc(db, 'chats', chatId);
  try {
    await setDoc(
      chatRef,
      {
        participants,
        participantNames: {
          [currentUser.uid]: currentUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
          [targetUser.uid]: targetUser.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        },
        lastMessage: '',
        lastSenderId: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
  }
  return chatId;
}
