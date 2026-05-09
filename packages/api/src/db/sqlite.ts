/**
 * SQLite-backed DataStore implementation. Used for local development
 * and the MVP itself. A Supabase implementation will live alongside
 * this file and conform to the same DataStore interface.
 */
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import type {
  CreateShareInput,
  DataStore,
  PasskeyCredential,
  RecoveryCode,
  Session,
  Share,
  User,
} from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  has_passkey INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  device_label TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY (email) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_passkey_email ON passkey_credentials(email);

CREATE TABLE IF NOT EXISTS recovery_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (email) REFERENCES users(email)
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  recipient_emails TEXT,
  byte_length INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  first_viewed_at INTEGER,
  last_viewed_at INTEGER,
  FOREIGN KEY (owner_email) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares(owner_email);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (email) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

CREATE TABLE IF NOT EXISTS verify_attempts (
  share_id TEXT NOT NULL,
  ip TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verify_share_time
  ON verify_attempts(share_id, attempted_at);
`;

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

export function createSqliteStore(path: string): DataStore {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  // Rename recipient_email → recipient_emails (one-time migration for existing DBs)
  const shareColumns = db.pragma("table_info(shares)") as Array<{ name: string }>;
  if (shareColumns.some((c) => c.name === "recipient_email")) {
    db.exec("ALTER TABLE shares RENAME COLUMN recipient_email TO recipient_emails");
  }

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
      (id, owner_email, recipient_emails, byte_length, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
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

    close() {
      db.close();
    },
  };
}
