/**
 * PostgreSQL-backed DataStore implementation (Supabase or any Postgres).
 *
 * Connection string via DATABASE_URL. SSL is required for remote hosts;
 * disabled automatically when connecting to localhost/127.0.0.1.
 *
 * Schema is applied idempotently on startup — safe to deploy without a
 * separate migration step for the initial launch.
 */
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import type {
  CreateShareInput,
  DataStore,
  PasskeyCredential,
  RecoveryCode,
  Session,
  Share,
  User,
} from "./types.ts";

// ---------- schema ----------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  email        TEXT    PRIMARY KEY,
  created_at   BIGINT  NOT NULL,
  has_passkey  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id  TEXT   PRIMARY KEY,
  email          TEXT   NOT NULL REFERENCES users(email),
  public_key     BYTEA  NOT NULL,
  counter        INTEGER NOT NULL,
  transports     TEXT,
  device_label   TEXT,
  created_at     BIGINT NOT NULL,
  last_used_at   BIGINT
);

CREATE INDEX IF NOT EXISTS idx_passkey_email
  ON passkey_credentials(email);

CREATE TABLE IF NOT EXISTS recovery_codes (
  email        TEXT   PRIMARY KEY REFERENCES users(email),
  code_hash    TEXT   NOT NULL,
  created_at   BIGINT NOT NULL,
  consumed_at  BIGINT
);

CREATE TABLE IF NOT EXISTS shares (
  id               TEXT    PRIMARY KEY,
  owner_email      TEXT    NOT NULL REFERENCES users(email),
  recipient_emails TEXT,
  byte_length      INTEGER NOT NULL,
  created_at       BIGINT  NOT NULL,
  expires_at       BIGINT  NOT NULL,
  revoked_at       BIGINT,
  view_count       INTEGER NOT NULL DEFAULT 0,
  first_viewed_at  BIGINT,
  last_viewed_at   BIGINT
);

CREATE INDEX IF NOT EXISTS idx_shares_owner
  ON shares(owner_email);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT   PRIMARY KEY,
  email       TEXT   NOT NULL REFERENCES users(email),
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_email
  ON sessions(email);

CREATE TABLE IF NOT EXISTS verify_attempts (
  id           BIGSERIAL PRIMARY KEY,
  share_id     TEXT    NOT NULL,
  ip           TEXT    NOT NULL,
  attempted_at BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verify_share_time
  ON verify_attempts(share_id, attempted_at);
`;

// ---------- row types ----------
// BIGINT columns come back as strings from the postgres driver; we convert
// with Number(). BOOLEAN comes back as a native JS boolean.

interface UserRow {
  email: string;
  created_at: string;
  has_passkey: boolean;
}

interface PasskeyRow {
  credential_id: string;
  email: string;
  public_key: Buffer;
  counter: number;
  transports: string | null;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

interface RecoveryRow {
  email: string;
  code_hash: string;
  created_at: string;
  consumed_at: string | null;
}

interface ShareRow {
  id: string;
  owner_email: string;
  recipient_emails: string | null;
  byte_length: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
}

interface SessionRow {
  token: string;
  email: string;
  created_at: string;
  expires_at: string;
}

// ---------- row converters ----------

const userFromRow = (r: UserRow): User => ({
  email: r.email,
  createdAt: Number(r.created_at),
  hasPasskey: r.has_passkey,
});

const passkeyFromRow = (r: PasskeyRow): PasskeyCredential => ({
  credentialId: r.credential_id,
  email: r.email,
  publicKey: new Uint8Array(r.public_key),
  counter: r.counter,
  transports: r.transports ? (JSON.parse(r.transports) as string[]) : null,
  deviceLabel: r.device_label,
  createdAt: Number(r.created_at),
  lastUsedAt: r.last_used_at !== null ? Number(r.last_used_at) : null,
});

const recoveryFromRow = (r: RecoveryRow): RecoveryCode => ({
  email: r.email,
  codeHash: r.code_hash,
  createdAt: Number(r.created_at),
  consumedAt: r.consumed_at !== null ? Number(r.consumed_at) : null,
});

const shareFromRow = (r: ShareRow): Share => ({
  id: r.id,
  ownerEmail: r.owner_email,
  recipientEmails: r.recipient_emails ? r.recipient_emails.split(",") : null,
  byteLength: r.byte_length,
  createdAt: Number(r.created_at),
  expiresAt: Number(r.expires_at),
  revokedAt: r.revoked_at !== null ? Number(r.revoked_at) : null,
  viewCount: r.view_count,
  firstViewedAt: r.first_viewed_at !== null ? Number(r.first_viewed_at) : null,
  lastViewedAt: r.last_viewed_at !== null ? Number(r.last_viewed_at) : null,
});

const sessionFromRow = (r: SessionRow): Session => ({
  token: r.token,
  email: r.email,
  createdAt: Number(r.created_at),
  expiresAt: Number(r.expires_at),
});

// ---------- factory ----------

export async function createPostgresStore(url: string): Promise<DataStore> {
  const isLocal =
    url.includes("localhost") || url.includes("127.0.0.1");

  const sql = postgres(url, {
    ssl: isLocal ? false : "require",
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  });

  // Apply schema idempotently. sql.unsafe() is needed for multi-statement DDL.
  await sql.unsafe(SCHEMA);

  return {
    users: {
      async upsertAnonymous(email, when) {
        await sql`
          INSERT INTO users (email, created_at)
          VALUES (${email}, ${when})
          ON CONFLICT (email) DO NOTHING
        `;
        const [row] = await sql<UserRow[]>`
          SELECT * FROM users WHERE email = ${email}
        `;
        return userFromRow(row);
      },
      async get(email) {
        const [row] = await sql<UserRow[]>`
          SELECT * FROM users WHERE email = ${email}
        `;
        return row ? userFromRow(row) : null;
      },
      async setHasPasskey(email, hasPasskey) {
        await sql`
          UPDATE users SET has_passkey = ${hasPasskey} WHERE email = ${email}
        `;
      },
    },

    passkeys: {
      async insert(cred) {
        await sql`
          INSERT INTO passkey_credentials
            (credential_id, email, public_key, counter, transports, device_label, created_at, last_used_at)
          VALUES (
            ${cred.credentialId}, ${cred.email},
            ${Buffer.from(cred.publicKey)}, ${cred.counter},
            ${cred.transports ? JSON.stringify(cred.transports) : null},
            ${cred.deviceLabel ?? null},
            ${cred.createdAt}, ${cred.lastUsedAt ?? null}
          )
        `;
      },
      async getByCredentialId(credentialId) {
        const [row] = await sql<PasskeyRow[]>`
          SELECT * FROM passkey_credentials WHERE credential_id = ${credentialId}
        `;
        return row ? passkeyFromRow(row) : null;
      },
      async listByEmail(email) {
        const rows = await sql<PasskeyRow[]>`
          SELECT * FROM passkey_credentials WHERE email = ${email} ORDER BY created_at
        `;
        return rows.map(passkeyFromRow);
      },
      async updateCounter(credentialId, counter, lastUsedAt) {
        await sql`
          UPDATE passkey_credentials
          SET counter = ${counter}, last_used_at = ${lastUsedAt}
          WHERE credential_id = ${credentialId}
        `;
      },
      async delete(credentialId) {
        await sql`DELETE FROM passkey_credentials WHERE credential_id = ${credentialId}`;
      },
    },

    recoveryCodes: {
      async set(email, codeHash, when) {
        await sql`
          INSERT INTO recovery_codes (email, code_hash, created_at, consumed_at)
          VALUES (${email}, ${codeHash}, ${when}, NULL)
          ON CONFLICT (email) DO UPDATE SET
            code_hash   = EXCLUDED.code_hash,
            created_at  = EXCLUDED.created_at,
            consumed_at = NULL
        `;
      },
      async get(email) {
        const [row] = await sql<RecoveryRow[]>`
          SELECT * FROM recovery_codes WHERE email = ${email}
        `;
        return row ? recoveryFromRow(row) : null;
      },
      async consume(email, when) {
        await sql`
          UPDATE recovery_codes
          SET consumed_at = ${when}
          WHERE email = ${email} AND consumed_at IS NULL
        `;
      },
    },

    shares: {
      async create(input: CreateShareInput, when) {
        await sql`
          INSERT INTO shares
            (id, owner_email, recipient_emails, byte_length, created_at, expires_at)
          VALUES (
            ${input.id}, ${input.ownerEmail},
            ${input.recipientEmails?.join(",") ?? null},
            ${input.byteLength}, ${when}, ${input.expiresAt}
          )
        `;
        const [row] = await sql<ShareRow[]>`SELECT * FROM shares WHERE id = ${input.id}`;
        return shareFromRow(row);
      },
      async get(id) {
        const [row] = await sql<ShareRow[]>`SELECT * FROM shares WHERE id = ${id}`;
        return row ? shareFromRow(row) : null;
      },
      async countByOwner(email) {
        const [{ n }] = await sql<[{ n: string }]>`
          SELECT COUNT(*) AS n FROM shares WHERE owner_email = ${email}
        `;
        return Number(n);
      },
      async listByOwner(email, opts) {
        const limit = opts?.limit ?? 100;
        const rows = await sql<ShareRow[]>`
          SELECT * FROM shares WHERE owner_email = ${email}
          ORDER BY created_at DESC LIMIT ${limit}
        `;
        return rows.map(shareFromRow);
      },
      async recordView(id, when) {
        await sql`
          UPDATE shares SET
            view_count      = view_count + 1,
            first_viewed_at = COALESCE(first_viewed_at, ${when}),
            last_viewed_at  = ${when}
          WHERE id = ${id}
        `;
      },
      async revoke(id, when) {
        await sql`
          UPDATE shares SET revoked_at = ${when}
          WHERE id = ${id} AND revoked_at IS NULL
        `;
      },
    },

    sessions: {
      async create(email, ttlMs, now) {
        const token = randomBytes(32).toString("base64url");
        const expiresAt = now + ttlMs;
        await sql`
          INSERT INTO sessions (token, email, created_at, expires_at)
          VALUES (${token}, ${email}, ${now}, ${expiresAt})
        `;
        return { token, email, createdAt: now, expiresAt };
      },
      async get(token) {
        const [row] = await sql<SessionRow[]>`
          SELECT * FROM sessions WHERE token = ${token}
        `;
        return row ? sessionFromRow(row) : null;
      },
      async delete(token) {
        await sql`DELETE FROM sessions WHERE token = ${token}`;
      },
      async deleteExpired(now) {
        const result = await sql`DELETE FROM sessions WHERE expires_at < ${now}`;
        return Number(result.count);
      },
    },

    verifyAttempts: {
      async record(shareId, ip, when) {
        await sql`
          INSERT INTO verify_attempts (share_id, ip, attempted_at)
          VALUES (${shareId}, ${ip}, ${when})
        `;
      },
      async countRecent(shareId, sinceTimestamp) {
        const [{ n }] = await sql<[{ n: string }]>`
          SELECT COUNT(*) AS n FROM verify_attempts
          WHERE share_id = ${shareId} AND attempted_at >= ${sinceTimestamp}
        `;
        return Number(n);
      },
    },

    close() {
      return sql.end();
    },
  };
}
