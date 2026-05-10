/**
 * SQLite-backed DataStore implementation. Used for local development
 * and the MVP itself. A Supabase implementation will live alongside
 * this file and conform to the same DataStore interface.
 */
import Database from "better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
import { migrateSqlite } from "./migrate.ts";
import type {
  CreateDebugSessionInput,
  CreateShareInput,
  DataStore,
  DebugEvent,
  DebugSession,
  EmitEventInput,
  FlatEvent,
  ListEventsOpts,
  PasskeyCredential,
  RecoveryCode,
  Session,
  SessionSource,
  Share,
  User,
} from "./types.ts";


interface UserRow {
  email: string;
  created_at: number;
  has_passkey: number;
}

interface PasskeyRow {
  credential_id: string;
  email: string;
  public_key: Buffer;
  counter: number;
  transports: string | null;
  device_label: string | null;
  created_at: number;
  last_used_at: number | null;
}

interface RecoveryRow {
  email: string;
  code_hash: string;
  created_at: number;
  consumed_at: number | null;
}

interface ShareRow {
  id: string;
  owner_email: string;
  owner_user_id: string | null;
  recipient_emails: string | null;
  byte_length: number;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
  view_count: number;
  first_viewed_at: number | null;
  last_viewed_at: number | null;
}

interface SessionRow {
  token: string;
  email: string;
  created_at: number;
  expires_at: number;
}

interface DebugSessionRow {
  id: string;
  user_email: string | null;
  source: string;
  user_agent: string | null;
  ip: string | null;
  created_at: number;
  last_event_at: number | null;
  event_count: number;
}

interface DebugEventRow {
  id: string;
  session_id: string;
  ts: number;
  level: string;
  event: string;
  message: string;
  share_id: string | null;
  payload: string;
}

const userFromRow = (r: UserRow): User => ({
  email: r.email,
  createdAt: r.created_at,
  hasPasskey: r.has_passkey === 1,
});

const passkeyFromRow = (r: PasskeyRow): PasskeyCredential => ({
  credentialId: r.credential_id,
  email: r.email,
  publicKey: new Uint8Array(r.public_key),
  counter: r.counter,
  transports: r.transports ? (JSON.parse(r.transports) as string[]) : null,
  deviceLabel: r.device_label,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
});

const recoveryFromRow = (r: RecoveryRow): RecoveryCode => ({
  email: r.email,
  codeHash: r.code_hash,
  createdAt: r.created_at,
  consumedAt: r.consumed_at,
});

const shareFromRow = (r: ShareRow): Share => ({
  id: r.id,
  ownerEmail: r.owner_email,
  ownerUserId: r.owner_user_id,
  recipientEmails: r.recipient_emails ? r.recipient_emails.split(",") : null,
  byteLength: r.byte_length,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  viewCount: r.view_count,
  firstViewedAt: r.first_viewed_at,
  lastViewedAt: r.last_viewed_at,
});

const sessionFromRow = (r: SessionRow): Session => ({
  token: r.token,
  email: r.email,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});

const debugSessionFromRow = (r: DebugSessionRow): DebugSession => ({
  id: r.id,
  userEmail: r.user_email,
  source: r.source as DebugSession["source"],
  userAgent: r.user_agent,
  ip: r.ip,
  createdAt: r.created_at,
  lastEventAt: r.last_event_at,
  eventCount: r.event_count,
});

const debugEventFromRow = (r: DebugEventRow): DebugEvent => ({
  id: r.id,
  sessionId: r.session_id,
  ts: r.ts,
  level: r.level as DebugEvent["level"],
  event: r.event,
  message: r.message,
  shareId: r.share_id,
  payload: JSON.parse(r.payload) as Record<string, unknown>,
});

interface FlatEventRow extends DebugEventRow {
  session_source: string;
  session_user_email: string | null;
}

const flatEventFromRow = (r: FlatEventRow): FlatEvent => ({
  ...debugEventFromRow(r),
  source: r.session_source as SessionSource,
  userEmail: r.session_user_email,
});

export function createSqliteStore(path: string): DataStore {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrateSqlite(db);

  // ---------- users ----------
  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)`,
  );
  const getUser = db.prepare(`SELECT * FROM users WHERE email = ?`);
  const setUserHasPasskey = db.prepare(
    `UPDATE users SET has_passkey = ? WHERE email = ?`,
  );

  // ---------- passkeys ----------
  const insertPasskey = db.prepare(`
    INSERT INTO passkey_credentials
      (credential_id, email, public_key, counter, transports, device_label, created_at, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getPasskeyById = db.prepare(
    `SELECT * FROM passkey_credentials WHERE credential_id = ?`,
  );
  const listPasskeysByEmail = db.prepare(
    `SELECT * FROM passkey_credentials WHERE email = ? ORDER BY created_at`,
  );
  const updatePasskeyCounter = db.prepare(
    `UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?`,
  );
  const deletePasskey = db.prepare(
    `DELETE FROM passkey_credentials WHERE credential_id = ?`,
  );

  // ---------- recovery codes ----------
  const upsertRecovery = db.prepare(`
    INSERT INTO recovery_codes (email, code_hash, created_at, consumed_at)
    VALUES (?, ?, ?, NULL)
    ON CONFLICT(email) DO UPDATE SET
      code_hash = excluded.code_hash,
      created_at = excluded.created_at,
      consumed_at = NULL
  `);
  const getRecovery = db.prepare(`SELECT * FROM recovery_codes WHERE email = ?`);
  const consumeRecovery = db.prepare(
    `UPDATE recovery_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL`,
  );

  // ---------- shares ----------
  const insertShare = db.prepare(`
    INSERT INTO shares
      (id, owner_email, owner_user_id, recipient_emails, byte_length, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const getShare = db.prepare(`SELECT * FROM shares WHERE id = ?`);
  const countSharesByOwner = db.prepare(
    `SELECT COUNT(*) AS n FROM shares WHERE owner_email = ?`,
  );
  const listSharesByOwner = db.prepare(`
    SELECT * FROM shares WHERE owner_email = ?
    ORDER BY created_at DESC LIMIT ?
  `);
  const recordView = db.prepare(`
    UPDATE shares SET
      view_count = view_count + 1,
      first_viewed_at = COALESCE(first_viewed_at, ?),
      last_viewed_at = ?
    WHERE id = ?
  `);
  const revokeShare = db.prepare(
    `UPDATE shares SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
  );

  // ---------- sessions ----------
  const insertSession = db.prepare(`
    INSERT INTO sessions (token, email, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  const getSession = db.prepare(`SELECT * FROM sessions WHERE token = ?`);
  const deleteSession = db.prepare(`DELETE FROM sessions WHERE token = ?`);
  const deleteExpiredSessions = db.prepare(
    `DELETE FROM sessions WHERE expires_at < ?`,
  );

  // ---------- verify attempts ----------
  const insertVerify = db.prepare(`
    INSERT INTO verify_attempts (share_id, ip, attempted_at) VALUES (?, ?, ?)
  `);
  const countRecentVerify = db.prepare(`
    SELECT COUNT(*) AS n FROM verify_attempts
    WHERE share_id = ? AND attempted_at >= ?
  `);

  // ---------- debug sessions ----------
  const insertDebugSession = db.prepare(`
    INSERT INTO debug_sessions (id, user_email, source, user_agent, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const getDebugSession = db.prepare(`SELECT * FROM debug_sessions WHERE id = ?`);
  const listDebugSessions = db.prepare(`
    SELECT * FROM debug_sessions ORDER BY created_at DESC LIMIT ?
  `);

  // ---------- debug events ----------
  const insertDebugEvent = db.prepare(`
    INSERT INTO debug_events (id, session_id, ts, level, event, message, share_id, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const touchDebugSession = db.prepare(`
    UPDATE debug_sessions SET last_event_at = ?, event_count = event_count + 1 WHERE id = ?
  `);
  const emitDebugEventTx = db.transaction(
    (id: string, sessionId: string, ts: number, level: string, event: string,
     message: string, shareId: string | null, payload: string) => {
      insertDebugEvent.run(id, sessionId, ts, level, event, message, shareId, payload);
      touchDebugSession.run(ts, sessionId);
    },
  );
  const listDebugEventsBySession = db.prepare(`
    SELECT * FROM debug_events WHERE session_id = ? ORDER BY ts ASC
  `);
  // listRecent uses a dynamic query — built inline to support filters

  return {
    users: {
      async upsertAnonymous(email, when) {
        insertUser.run(email, when);
        return userFromRow(getUser.get(email) as UserRow);
      },
      async get(email) {
        const row = getUser.get(email) as UserRow | undefined;
        return row ? userFromRow(row) : null;
      },
      async setHasPasskey(email, hasPasskey) {
        setUserHasPasskey.run(hasPasskey ? 1 : 0, email);
      },
    },

    passkeys: {
      async insert(cred) {
        insertPasskey.run(
          cred.credentialId,
          cred.email,
          Buffer.from(cred.publicKey),
          cred.counter,
          cred.transports ? JSON.stringify(cred.transports) : null,
          cred.deviceLabel,
          cred.createdAt,
          cred.lastUsedAt,
        );
      },
      async getByCredentialId(credentialId) {
        const row = getPasskeyById.get(credentialId) as PasskeyRow | undefined;
        return row ? passkeyFromRow(row) : null;
      },
      async listByEmail(email) {
        const rows = listPasskeysByEmail.all(email) as PasskeyRow[];
        return rows.map(passkeyFromRow);
      },
      async updateCounter(credentialId, counter, lastUsedAt) {
        updatePasskeyCounter.run(counter, lastUsedAt, credentialId);
      },
      async delete(credentialId) {
        deletePasskey.run(credentialId);
      },
    },

    recoveryCodes: {
      async set(email, codeHash, when) {
        upsertRecovery.run(email, codeHash, when);
      },
      async get(email) {
        const row = getRecovery.get(email) as RecoveryRow | undefined;
        return row ? recoveryFromRow(row) : null;
      },
      async consume(email, when) {
        consumeRecovery.run(when, email);
      },
    },

    shares: {
      async create(input: CreateShareInput, when) {
        insertShare.run(
          input.id,
          input.ownerEmail,
          input.ownerUserId ?? null,
          input.recipientEmails?.join(",") ?? null,
          input.byteLength,
          when,
          input.expiresAt,
        );
        return shareFromRow(getShare.get(input.id) as ShareRow);
      },
      async get(id) {
        const row = getShare.get(id) as ShareRow | undefined;
        return row ? shareFromRow(row) : null;
      },
      async countByOwner(email) {
        return (countSharesByOwner.get(email) as { n: number }).n;
      },
      async listByOwner(email, opts) {
        const rows = listSharesByOwner.all(email, opts?.limit ?? 100) as ShareRow[];
        return rows.map(shareFromRow);
      },
      async recordView(id, when) {
        recordView.run(when, when, id);
      },
      async revoke(id, when) {
        revokeShare.run(when, id);
      },
    },

    sessions: {
      async create(email, ttlMs, now) {
        const token = randomBytes(32).toString("base64url");
        const expiresAt = now + ttlMs;
        insertSession.run(token, email, now, expiresAt);
        return { token, email, createdAt: now, expiresAt };
      },
      async get(token) {
        const row = getSession.get(token) as SessionRow | undefined;
        return row ? sessionFromRow(row) : null;
      },
      async delete(token) {
        deleteSession.run(token);
      },
      async deleteExpired(now) {
        return deleteExpiredSessions.run(now).changes;
      },
    },

    verifyAttempts: {
      async record(shareId, ip, when) {
        insertVerify.run(shareId, ip, when);
      },
      async countRecent(shareId, sinceTimestamp) {
        return (countRecentVerify.get(shareId, sinceTimestamp) as { n: number }).n;
      },
    },

    debug: {
      sessions: {
        async create(input: CreateDebugSessionInput, when: number): Promise<DebugSession> {
          const id = randomUUID();
          insertDebugSession.run(
            id, input.userEmail ?? null, input.source,
            input.userAgent ?? null, input.ip ?? null, when,
          );
          return debugSessionFromRow(getDebugSession.get(id) as DebugSessionRow);
        },
        async get(id: string): Promise<DebugSession | null> {
          const row = getDebugSession.get(id) as DebugSessionRow | undefined;
          return row ? debugSessionFromRow(row) : null;
        },
        async list(opts?: { limit?: number }): Promise<DebugSession[]> {
          const rows = listDebugSessions.all(opts?.limit ?? 100) as DebugSessionRow[];
          return rows.map(debugSessionFromRow);
        },
      },
      events: {
        async emit(input: EmitEventInput, when: number): Promise<DebugEvent> {
          const id = randomUUID();
          const payload = JSON.stringify(input.payload ?? {});
          emitDebugEventTx(
            id, input.sessionId, when, input.level, input.event,
            input.message, input.shareId ?? null, payload,
          );
          return {
            id, sessionId: input.sessionId, ts: when,
            level: input.level, event: input.event, message: input.message,
            shareId: input.shareId ?? null, payload: input.payload ?? {},
          };
        },
        async listBySession(sessionId: string): Promise<DebugEvent[]> {
          const rows = listDebugEventsBySession.all(sessionId) as DebugEventRow[];
          return rows.map(debugEventFromRow);
        },
        async listRecent(opts?: ListEventsOpts): Promise<FlatEvent[]> {
          const limit = Math.min(opts?.limit ?? 200, 500);
          const conditions: string[] = [];
          const params: unknown[] = [];
          if (opts?.shareId) { conditions.push("e.share_id = ?"); params.push(opts.shareId); }
          if (opts?.sessionId) { conditions.push("e.session_id = ?"); params.push(opts.sessionId); }
          if (opts?.level) { conditions.push("e.level = ?"); params.push(opts.level); }
          if (opts?.source) { conditions.push("s.source = ?"); params.push(opts.source); }
          params.push(limit);
          const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
          const rows = db.prepare(`
            SELECT e.*, s.source AS session_source, s.user_email AS session_user_email
            FROM debug_events e
            JOIN debug_sessions s ON s.id = e.session_id
            ${where}
            ORDER BY e.ts DESC LIMIT ?
          `).all(...params) as FlatEventRow[];
          return rows.map(flatEventFromRow);
        },
      },
    },

    close() {
      db.close();
    },
  };
}
