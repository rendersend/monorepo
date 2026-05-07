/**
 * Data layer contracts.
 *
 * The API code talks only to these interfaces. Concrete implementations
 * (sqlite for dev, supabase for production) live alongside this file.
 * Switching backends is a one-line change in store.ts.
 *
 * All timestamps are unix milliseconds.
 */

export interface User {
  email: string;
  createdAt: number;
  hasPasskey: boolean;
}

export interface PasskeyCredential {
  credentialId: string;
  email: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[] | null;
  deviceLabel: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface RecoveryCode {
  email: string;
  codeHash: string;
  createdAt: number;
  consumedAt: number | null;
}

export interface Share {
  id: string;
  ownerEmail: string;
  recipientEmails: string[] | null;
  byteLength: number;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  viewCount: number;
  firstViewedAt: number | null;
  lastViewedAt: number | null;
}

export interface CreateShareInput {
  id: string;
  ownerEmail: string;
  recipientEmails: string[] | null;
  byteLength: number;
  expiresAt: number;
}

export interface Session {
  token: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

export interface VerifyAttempt {
  shareId: string;
  ip: string;
  attemptedAt: number;
}

// ---------- repository contracts ----------

export interface UserRepo {
  /** Insert if missing; return current row. */
  upsertAnonymous(email: string, when: number): Promise<User>;
  get(email: string): Promise<User | null>;
  setHasPasskey(email: string, hasPasskey: boolean): Promise<void>;
}

export interface PasskeyRepo {
  insert(cred: PasskeyCredential): Promise<void>;
  getByCredentialId(credentialId: string): Promise<PasskeyCredential | null>;
  listByEmail(email: string): Promise<PasskeyCredential[]>;
  updateCounter(credentialId: string, counter: number, lastUsedAt: number): Promise<void>;
  delete(credentialId: string): Promise<void>;
}

export interface RecoveryCodeRepo {
  /** Replace any existing recovery code for the user. */
  set(email: string, codeHash: string, when: number): Promise<void>;
  get(email: string): Promise<RecoveryCode | null>;
  /** Mark consumed; idempotent (ignored if already consumed). */
  consume(email: string, when: number): Promise<void>;
}

export interface ShareRepo {
  create(input: CreateShareInput, when: number): Promise<Share>;
  get(id: string): Promise<Share | null>;
  countByOwner(email: string): Promise<number>;
  listByOwner(email: string, opts?: { limit?: number }): Promise<Share[]>;
  recordView(id: string, when: number): Promise<void>;
  revoke(id: string, when: number): Promise<void>;
}

export interface SessionRepo {
  create(email: string, ttlMs: number, now: number): Promise<Session>;
  get(token: string): Promise<Session | null>;
  delete(token: string): Promise<void>;
  deleteExpired(now: number): Promise<number>;
}

export interface VerifyAttemptRepo {
  record(shareId: string, ip: string, when: number): Promise<void>;
  countRecent(shareId: string, sinceTimestamp: number): Promise<number>;
}

export interface DataStore {
  users: UserRepo;
  passkeys: PasskeyRepo;
  recoveryCodes: RecoveryCodeRepo;
  shares: ShareRepo;
  sessions: SessionRepo;
  verifyAttempts: VerifyAttemptRepo;
  close(): void;
}
