/**
 * Phase 0 Dirty Dozen Security Specification Test Matrix
 * Verifies all 12 adversarial payloads are structurally blocked by firestore.rules.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Post Create',
    collectionPath: '/posts/p_spoof',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { authorId: 'victim_uid', authorName: 'Attacker', text: 'spoofed' },
  },
  {
    id: 2,
    name: 'Shadow Field Injection on Profile',
    collectionPath: '/users_public/attacker_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'attacker_uid', displayName: 'A', isVerified: true },
  },
  {
    id: 3,
    name: 'PII Read Leak on users_private',
    collectionPath: '/users_private/victim_uid',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Timestamp Forgery on Post Create',
    collectionPath: '/posts/p_time',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 5,
    name: 'Orphan Comment Without Parent Post',
    collectionPath: '/posts/nonexistent_post/comments/c1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { postId: 'nonexistent_post', authorId: 'attacker_uid', text: 'orphan' },
  },
  {
    id: 6,
    name: 'Unauthorized Post Edit by Non-Author',
    collectionPath: '/posts/victim_post',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { text: 'hijacked text' },
  },
  {
    id: 7,
    name: 'Reaction Impersonation',
    collectionPath: '/posts/p1/reactions/victim_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { postId: 'p1', userId: 'victim_uid', type: 'angry' },
  },
  {
    id: 8,
    name: 'Terminal Friend Request Reopen',
    collectionPath: '/friend_requests/req1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { status: 'pending' },
  },
  {
    id: 9,
    name: 'Unauthorized Chat Eavesdropping',
    collectionPath: '/chats/c1/messages',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Self-Friend Request',
    collectionPath: '/friend_requests/self_req',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { fromUid: 'attacker_uid', toUid: 'attacker_uid', status: 'pending' },
  },
  {
    id: 11,
    name: 'Oversized String Poisoning',
    collectionPath: '/posts/p_big',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { text: 'x'.repeat(3500) },
  },
  {
    id: 12,
    name: 'Unverified Email Write',
    collectionPath: '/posts/p_unverified',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
];
