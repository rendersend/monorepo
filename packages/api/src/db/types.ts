/**
 * Data layer contracts.
 *
 * All methods are async so implementations can be backed by either a
 * synchronous local driver (SQLite/better-sqlite3) or an async remote
 * one (PostgreSQL via Supabase). All timestamps are unix milliseconds.
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
  set(email: string, codeHash: string, when: number): Promise<void>;
  get(email: string): Promise<RecoveryCode | null>;
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

// ---------- debug / observability ----------

export type EventLevel = "info" | "warn" | "error";
export type SessionSource = "mcp" | "web" | "api";

export interface DebugSession {
  id: string;
  userEmail: string | null;
  source: SessionSource;
  userAgent: string | null;
  ip: string | null;
  createdAt: number;
  lastEventAt: number | null;
  eventCount: number;
}

export interface DebugEvent {
  id: string;
  sessionId: string;
  ts: number;
  level: EventLevel;
  event: string;
  message: string;
  shareId: string | null;
  payload: Record<string, unknown>;
}

export interface CreateDebugSessionInput {
  userEmail?: string | null;
  source: SessionSource;
  userAgent?: string | null;
  ip?: string | null;
}

export interface EmitEventInput {
  sessionId: string;
  level: EventLevel;
  event: string;
  message: string;
  shareId?: string | null;
  payload?: Record<string, unknown>;
}

export interface DebugSessionRepo {
  create(input: CreateDebugSessionInput, when: number): Promise<DebugSession>;
  get(id: string): Promise<DebugSession | null>;
  list(opts?: { limit?: number }): Promise<DebugSession[]>;
}

export interface ListEventsOpts {
  limit?: number;
  shareId?: string | null;
  sessionId?: string | null;
  level?: EventLevel | null;
  source?: SessionSource | null;
}

export interface FlatEvent extends DebugEvent {
  source: SessionSource;
  userEmail: string | null;
}

export interface DebugEventRepo {
  emit(input: EmitEventInput, when: number): Promise<DebugEvent>;
  listBySession(sessionId: string): Promise<DebugEvent[]>;
  listRecent(opts?: ListEventsOpts): Promise<FlatEvent[]>;
}

export interface DataStore {
  users: UserRepo;
  passkeys: PasskeyRepo;
  recoveryCodes: RecoveryCodeRepo;
  shares: ShareRepo;
  sessions: SessionRepo;
  verifyAttempts: VerifyAttemptRepo;
  debug: {
    sessions: DebugSessionRepo;
    events: DebugEventRepo;
  };
  close(): void | Promise<void>;
}
