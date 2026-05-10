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
import { randomBytes, randomUUID } from "node:crypto";
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
import { migratePostgres } from "./migrate.ts";


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

interface DebugSessionRow {
  id: string;
  user_email: string | null;
  source: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_event_at: string | null;
  event_count: number;
}

interface DebugEventRow {
  id: string;
  session_id: string;
  ts: string;
  level: string;
  event: string;
  message: string;
  share_id: string | null;
  payload: Record<string, unknown>;
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

const debugSessionFromRow = (r: DebugSessionRow): DebugSession => ({
  id: r.id,
  userEmail: r.user_email,
  source: r.source as DebugSession["source"],
  userAgent: r.user_agent,
  ip: r.ip,
  createdAt: Number(r.created_at),
  lastEventAt: r.last_event_at !== null ? Number(r.last_event_at) : null,
  eventCount: r.event_count,
});

const debugEventFromRow = (r: DebugEventRow): DebugEvent => ({
  id: r.id,
  sessionId: r.session_id,
  ts: Number(r.ts),
  level: r.level as DebugEvent["level"],
  event: r.event,
  message: r.message,
  shareId: r.share_id,
  payload: r.payload,
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

// ---------- factory ----------

export async function createPostgresStore(url: string): Promise<DataStore> {
  // Parse the URL manually and pass fields explicitly. The postgres npm package
  // truncates usernames containing dots (e.g. "postgres.projectref") when it
  // parses connection URLs itself, which breaks Supabase pooler connections.
  const parsed = new URL(url);
  const isLocal =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  const sql = postgres({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    // DATABASE_PASSWORD env var takes precedence — avoids URL-encoding issues
    // with special characters in Supabase-generated passwords.
    password: process.env.DATABASE_PASSWORD ?? decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1) || "postgres",
    ssl: isLocal ? false : "require",
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {}, // suppress IF NOT EXISTS notices on startup
  });

  await migratePostgres(sql);

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

    debug: {
      sessions: {
        async create(input: CreateDebugSessionInput, when: number): Promise<DebugSession> {
          const id = randomUUID();
          await sql`
            INSERT INTO debug_sessions (id, user_email, source, user_agent, ip, created_at)
            VALUES (${id}, ${input.userEmail ?? null}, ${input.source},
                    ${input.userAgent ?? null}, ${input.ip ?? null}, ${when})
          `;
          const [row] = await sql<DebugSessionRow[]>`
            SELECT * FROM debug_sessions WHERE id = ${id}
          `;
          return debugSessionFromRow(row);
        },
        async get(id: string): Promise<DebugSession | null> {
          const [row] = await sql<DebugSessionRow[]>`
            SELECT * FROM debug_sessions WHERE id = ${id}
          `;
          return row ? debugSessionFromRow(row) : null;
        },
        async list(opts?: { limit?: number }): Promise<DebugSession[]> {
          const limit = opts?.limit ?? 100;
          const rows = await sql<DebugSessionRow[]>`
            SELECT * FROM debug_sessions ORDER BY created_at DESC LIMIT ${limit}
          `;
          return rows.map(debugSessionFromRow);
        },
      },
      events: {
        async emit(input: EmitEventInput, when: number): Promise<DebugEvent> {
          const id = randomUUID();
          const payload = input.payload ?? {};
          await sql`
            INSERT INTO debug_events (id, session_id, ts, level, event, message, share_id, payload)
            VALUES (${id}, ${input.sessionId}, ${when}, ${input.level},
                    ${input.event}, ${input.message}, ${input.shareId ?? null},
                    ${sql.json(payload as never)})
          `;
          await sql`
            UPDATE debug_sessions
            SET last_event_at = ${when}, event_count = event_count + 1
            WHERE id = ${input.sessionId}
          `;
          return {
            id, sessionId: input.sessionId, ts: when,
            level: input.level, event: input.event, message: input.message,
            shareId: input.shareId ?? null, payload,
          };
        },
        async listBySession(sessionId: string): Promise<DebugEvent[]> {
          const rows = await sql<DebugEventRow[]>`
            SELECT * FROM debug_events WHERE session_id = ${sessionId} ORDER BY ts ASC
          `;
          return rows.map(debugEventFromRow);
        },
        async listRecent(opts?: ListEventsOpts): Promise<FlatEvent[]> {
          const limit = Math.min(opts?.limit ?? 200, 500);
          const conditions: string[] = [];
          const values: unknown[] = [];
          let i = 1;
          if (opts?.shareId) { conditions.push(`e.share_id = $${i++}`); values.push(opts.shareId); }
          if (opts?.sessionId) { conditions.push(`e.session_id = $${i++}`); values.push(opts.sessionId); }
          if (opts?.level) { conditions.push(`e.level = $${i++}`); values.push(opts.level); }
          if (opts?.source) { conditions.push(`s.source = $${i++}`); values.push(opts.source); }
          values.push(limit);
          const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
          const rows = await sql.unsafe<FlatEventRow[]>(`
            SELECT e.*, s.source AS session_source, s.user_email AS session_user_email
            FROM debug_events e
            JOIN debug_sessions s ON s.id = e.session_id
            ${where}
            ORDER BY e.ts DESC LIMIT $${i}
          `, values as Parameters<typeof sql.unsafe>[1]);
          return rows.map(flatEventFromRow);
        },
      },
    },

    close() {
      return sql.end();
    },
  };
}
