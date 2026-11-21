# MitraBook Security Specification (Phase 0)

## 1. Data Invariants
1. PII (`email`, private preferences, saved post IDs) MUST be isolated in `users_private/{userId}` and readable/writable ONLY by `request.auth.uid == userId`.
2. Every post, story, comment, reaction, chat message, and notification MUST carry an immutable `authorId` / `userId` / `senderId` / `fromUid` equal to `request.auth.uid` on creation.
3. All `createdAt` and `updatedAt` timestamps MUST equal `request.time`.
4. Subcollection records (`comments`, `reactions`, `messages`, `members`) MUST verify existence of their parent document on creation (Master Gate).
5. `friend_requests` MUST transition only from `pending` -> `accepted` or `declined`; once accepted or declined, `status` is terminally locked.
6. Every `allow list` rule MUST evaluate `resource.data` directly without delegating filtering to the client or invoking `get()`/`exists()`.

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing on Post Create**: Creating `/posts/p1` with `authorId: "victim_uid"` while authenticated as `"attacker_uid"` -> `PERMISSION_DENIED`.
2. **Shadow Field Injection on Profile**: Creating `/users_public/attacker` with extra field `isVerified: true` -> `PERMISSION_DENIED`.
3. **PII Read Leak**: Reading `/users_private/victim_uid` as `"attacker_uid"` -> `PERMISSION_DENIED`.
4. **Timestamp Forgery**: Creating `/posts/p1` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
5. **Comment Author Override / Orphan**: Creating `/posts/nonexistent/comments/c1` -> `PERMISSION_DENIED`.
6. **Unauthorized Post Edit**: Updating `text` on `/posts/victim_post` as `"attacker_uid"` -> `PERMISSION_DENIED`.
7. **Reaction Impersonation**: Creating `/posts/p1/reactions/victim_uid` as `"attacker_uid"` -> `PERMISSION_DENIED`.
8. **Terminal Friend Request Reopen**: Updating `/friend_requests/req1` from `accepted` back to `pending` -> `PERMISSION_DENIED`.
9. **Unauthorized Chat Eavesdropping**: Listing `/chats/c1/messages` when `request.auth.uid` is not in `participants` -> `PERMISSION_DENIED`.
10. **Self-Friend Request**: Creating `/friend_requests/self` with `fromUid == toUid` -> `PERMISSION_DENIED`.
11. **Oversized String / Resource Poisoning**: Creating `/posts/p1` with `text` > 3000 chars or document ID > 128 chars -> `PERMISSION_DENIED`.
12. **Unverified Email Write**: Creating `/posts/p1` when `request.auth.token.email_verified == false` -> `PERMISSION_DENIED`.
