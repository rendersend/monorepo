/**
 * Rendersend API.
 *
 * Stores opaque encrypted blobs and serves them to viewers. The server
 * cannot decrypt content — the AES key lives only in URL fragments
 * (link-share mode) or with the recipient (recovery via passkey, MVP+).
 *
 * Two share modes:
 *   - Link share (no recipient pinned): GET /blobs/:id returns ciphertext
 *     directly. Anyone with the link decrypts in-browser.
 *   - Email-pinned share: GET /blobs/:id returns 403 verify_required.
 *     Recipient must POST /blobs/:id/access with the matching email
 *     before the ciphertext is served.
 *
 * Storage backends (selected by env vars — see .env.example):
 *   Blobs    → BLOB_STORE=fs (default) | s3
 *   Metadata → RENDERSEND_DB=sqlite (default) | postgres
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getStore } from "./db/store.ts";
import { getBlobStore } from "./storage/blob.ts";
import { initEvents, emit } from "./events.ts";
import type { EventLevel, SessionSource, Share } from "./db/types.ts";

const PORT = Number(process.env.PORT ?? 8787);
const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? "./storage");
const MAX_BLOB_BYTES = 10 * 1024 * 1024;
const DEBUG_ENABLED = process.env.RENDERSEND_DEBUG === "true";

const VERIFY_WINDOW_MS = 10 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 5;

const ALLOWED_EXPIRY_SECONDS = new Set([
  24 * 60 * 60,
  7 * 24 * 60 * 60,
  30 * 24 * 60 * 60,
  365 * 24 * 60 * 60,
]);
const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

const [store, blobs] = await Promise.all([
  getStore(),
  getBlobStore(STORAGE_DIR),
]);

initEvents(store);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function isValidEmail(s: string): boolean {
  return s.length > 0 && s.length < 320 && EMAIL_RE.test(s);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function sessionId(c: { req: { header: (h: string) => string | undefined } }): string | null {
  return c.req.header("x-session-id") ?? null;
}

const app = new Hono();

app.use("*", cors({
  origin: process.env.CORS_ORIGIN ?? "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: [
    "Content-Type", "X-Owner-Email", "X-Recipient-Emails",
    "X-Expires-In-Seconds", "X-Session-ID", "X-Source",
  ],
}));

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;
  const flag = status >= 500 ? "ERR" : status >= 400 ? "WRN" : " OK";
  console.log(`[api] ${flag} ${c.req.method} ${c.req.path} ${status} ${ms}ms`);
});

app.get("/health", (c) => c.json({ ok: true }));

// ---------- session creation ----------

app.post("/sessions", async (c) => {
  let body: { source?: unknown; user_email?: unknown } = {};
  try { body = await c.req.json(); } catch { /* body is optional */ }

  const rawSource = typeof body.source === "string" ? body.source : "api";
  const source: SessionSource =
    rawSource === "mcp" ? "mcp" : rawSource === "web" ? "web" : "api";

  const userEmail = typeof body.user_email === "string" && isValidEmail(body.user_email)
    ? normalizeEmail(body.user_email) : null;

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = c.req.header("user-agent") ?? null;

  const session = await store.debug.sessions.create(
    { source, userEmail, userAgent, ip },
    Date.now(),
  );

  await emit({
    sessionId: session.id,
    level: "info",
    event: "session.started",
    message: `New ${source.toUpperCase()} session started${userEmail ? ` for ${userEmail}` : ""}`,
    payload: { source, userEmail, ip },
  });

  return c.json({ id: session.id, createdAt: session.createdAt });
});

// ---------- blob upload ----------

app.post("/blobs", async (c) => {
  const sid = sessionId(c);

  const ownerHeader = c.req.header("x-owner-email");
  if (!ownerHeader) {
    if (sid) await emit({ sessionId: sid, level: "warn", event: "request.validation_error",
      message: "POST /blobs rejected — missing x-owner-email header", payload: {} });
    return c.json({ error: "x-owner-email header required" }, 400);
  }
  const ownerEmail = normalizeEmail(ownerHeader);
  if (!isValidEmail(ownerEmail)) {
    if (sid) await emit({ sessionId: sid, level: "warn", event: "request.validation_error",
      message: `POST /blobs rejected — invalid owner email "${ownerEmail}"`, payload: { ownerEmail } });
    return c.json({ error: "invalid owner email" }, 400);
  }

  const recipientHeader = c.req.header("x-recipient-emails");
  let recipientEmails: string[] | null = null;
  if (recipientHeader && recipientHeader.trim()) {
    const parsed = recipientHeader.split(",").map(normalizeEmail).filter(Boolean);
    for (const em of parsed) {
      if (!isValidEmail(em)) {
        return c.json({ error: "invalid recipient email", email: em }, 400);
      }
    }
    recipientEmails = parsed.length > 0 ? parsed : null;
  }

  let expiresInSeconds = DEFAULT_EXPIRY_SECONDS;
  const expiresHeader = c.req.header("x-expires-in-seconds");
  if (expiresHeader !== undefined) {
    const n = Number(expiresHeader);
    if (!ALLOWED_EXPIRY_SECONDS.has(n)) {
      return c.json({ error: "invalid x-expires-in-seconds" }, 400);
    }
    expiresInSeconds = n;
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: "empty body" }, 400);
  if (body.byteLength > MAX_BLOB_BYTES) {
    if (sid) await emit({ sessionId: sid, level: "warn", event: "share.upload.failed",
      message: `Upload rejected — blob too large (${formatBytes(body.byteLength)}, max ${formatBytes(MAX_BLOB_BYTES)})`,
      payload: { byteLength: body.byteLength, maxBytes: MAX_BLOB_BYTES } });
    return c.json({ error: "blob too large", maxBytes: MAX_BLOB_BYTES }, 413);
  }

  const id = randomBytes(16).toString("hex");
  const now = Date.now();
  const expiresAt = now + expiresInSeconds * 1000;
  const recipientCount = recipientEmails?.length ?? 0;

  if (sid) await emit({
    sessionId: sid, level: "info", event: "share.upload.started",
    message: `Upload started — ${formatBytes(body.byteLength)} encrypted blob for ${ownerEmail}` +
      (recipientCount > 0 ? `, ${recipientCount} recipient(s)` : " (link share)"),
    payload: { ownerEmail, byteLength: body.byteLength, recipientCount, expiresInSeconds },
  });

  await store.users.upsertAnonymous(ownerEmail, now);
  const share = await store.shares.create(
    { id, ownerEmail, recipientEmails, byteLength: body.byteLength, expiresAt },
    now,
  );

  await blobs.write(id, Buffer.from(body));

  if (sid) await emit({
    sessionId: sid, level: "info", event: "share.created",
    shareId: id,
    message: `Share ${id.slice(0, 8)}… created — expires ${new Date(expiresAt).toISOString()}` +
      (recipientCount > 0 ? `, pinned to ${recipientEmails!.join(", ")}` : ", link share"),
    payload: { shareId: id, ownerEmail, recipientEmails, byteLength: body.byteLength, expiresAt, expiresInSeconds },
  });

  return c.json({
    id: share.id,
    expiresAt: share.expiresAt,
    requiresVerify: !!share.recipientEmails?.length,
  });
});

// ---------- helpers ----------

interface AccessibilityResult {
  ok: boolean;
  status?: ContentfulStatusCode;
  body?: Record<string, unknown>;
  share?: Share;
}

async function checkShareAccessibility(id: string): Promise<AccessibilityResult> {
  if (!/^[0-9a-f]{32}$/.test(id)) {
    return { ok: false, status: 400, body: { error: "invalid id" } };
  }
  const share = await store.shares.get(id);
  if (!share) return { ok: false, status: 404, body: { error: "not found" } };
  if (share.revokedAt) return { ok: false, status: 410, body: { error: "revoked" } };
  if (share.expiresAt < Date.now()) return { ok: false, status: 410, body: { error: "expired" } };
  return { ok: true, share };
}

// ---------- blob fetch (link share) ----------

app.get("/blobs/:id", async (c) => {
  const id = c.req.param("id");
  const sid = sessionId(c);
  const check = await checkShareAccessibility(id);

  if (!check.ok) {
    if (sid && (check.status === 410)) {
      await emit({ sessionId: sid, level: "warn",
        event: check.body?.error === "expired" ? "blob.fetch.expired" : "blob.fetch.revoked",
        shareId: id,
        message: `Share ${id.slice(0, 8)}… is ${check.body?.error}`,
        payload: { shareId: id } });
    }
    return c.json(check.body!, check.status!);
  }

  const share = check.share!;
  if (share.recipientEmails !== null) {
    if (sid) await emit({ sessionId: sid, level: "info", event: "blob.fetch.pinned",
      shareId: id,
      message: `Share ${id.slice(0, 8)}… requested — email verification required before serving`,
      payload: { shareId: id, recipientCount: share.recipientEmails.length } });
    return c.json({ error: "verify_required" }, 403);
  }

  const data = await blobs.read(id);
  if (!data) return c.json({ error: "not found" }, 404);

  await store.shares.recordView(id, Date.now());

  if (sid) await emit({ sessionId: sid, level: "info", event: "blob.fetch.link_share",
    shareId: id,
    message: `Share ${id.slice(0, 8)}… fetched — link share, view #${share.viewCount + 1}`,
    payload: { shareId: id, viewCount: share.viewCount + 1, byteLength: data.byteLength } });

  c.header("Content-Type", "application/octet-stream");
  c.header("Cache-Control", "private, max-age=300");
  return c.body(new Uint8Array(data));
});

// ---------- email-pinned access ----------

app.post("/blobs/:id/access", async (c) => {
  const id = c.req.param("id");
  const sid = sessionId(c);
  const check = await checkShareAccessibility(id);
  if (!check.ok) return c.json(check.body!, check.status!);

  const share = check.share!;
  const now = Date.now();

  const recent = await store.verifyAttempts.countRecent(id, now - VERIFY_WINDOW_MS);
  if (recent >= VERIFY_MAX_ATTEMPTS) {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (sid) await emit({ sessionId: sid, level: "warn", event: "verify.ratelimited",
      shareId: id,
      message: `Rate limit hit — ${VERIFY_MAX_ATTEMPTS} attempts in 10 min for share ${id.slice(0, 8)}… from ${ip}`,
      payload: { shareId: id, ip, attempts: recent } });
    return c.json({ error: "rate_limited" }, 429);
  }

  let payload: { email?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body" }, 400);
  }
  if (typeof payload.email !== "string") {
    return c.json({ error: "email_required" }, 400);
  }

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  await store.verifyAttempts.record(id, ip, now);

  const entered = normalizeEmail(payload.email);
  const matched = isValidEmail(entered) && !!share.recipientEmails?.includes(entered);

  if (!matched) {
    if (sid) await emit({ sessionId: sid, level: "warn", event: "verify.attempt.failed",
      shareId: id,
      message: `Recipient entered wrong email for share ${id.slice(0, 8)}… (attempt ${recent + 1} of ${VERIFY_MAX_ATTEMPTS})`,
      payload: { shareId: id, attempt: recent + 1, ip } });
    return c.json({ error: "verify_failed" }, 401);
  }

  const data = await blobs.read(id);
  if (!data) return c.json({ error: "not found" }, 404);

  await store.shares.recordView(id, now);

  if (sid) await emit({ sessionId: sid, level: "info", event: "verify.attempt.matched",
    shareId: id,
    message: `Recipient verified as ${entered} for share ${id.slice(0, 8)}… — blob served (view #${share.viewCount + 1})`,
    payload: { shareId: id, email: entered, viewCount: share.viewCount + 1 } });

  c.header("Content-Type", "application/octet-stream");
  return c.body(new Uint8Array(data));
});

// ---------- debug endpoints ----------

const debugGuard: MiddlewareHandler = async (c, next) => {
  if (!DEBUG_ENABLED) return c.json({ error: "debug endpoints are disabled" }, 403);
  await next();
};

app.get("/debug/sessions", debugGuard, async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const sessions = await store.debug.sessions.list({ limit });
  return c.json(sessions);
});

app.get("/debug/sessions/:id", debugGuard, async (c) => {
  const id = c.req.param("id");
  const [session, events] = await Promise.all([
    store.debug.sessions.get(id),
    store.debug.events.listBySession(id),
  ]);
  if (!session) return c.json({ error: "not found" }, 404);
  return c.json({ session, events });
});

app.get("/debug/sessions/:id/events.jsonl", debugGuard, async (c) => {
  const id = c.req.param("id");
  const events = await store.debug.events.listBySession(id);
  const lines = events.map((e) => JSON.stringify(e)).join("\n");
  c.header("Content-Type", "application/x-ndjson");
  c.header("Content-Disposition", `attachment; filename="session-${id}.jsonl"`);
  return c.body(lines);
});

const VALID_LEVELS = new Set(["info", "warn", "error"]);
const VALID_SOURCES = new Set(["mcp", "web", "api"]);

app.get("/debug/events", debugGuard, async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 200), 500);
  const rawLevel = c.req.query("level");
  const rawSource = c.req.query("source");
  const events = await store.debug.events.listRecent({
    limit,
    shareId: c.req.query("share_id") ?? null,
    sessionId: c.req.query("session_id") ?? null,
    level: rawLevel && VALID_LEVELS.has(rawLevel) ? (rawLevel as EventLevel) : null,
    source: rawSource && VALID_SOURCES.has(rawSource) ? (rawSource as SessionSource) : null,
  });
  if (c.req.query("format") === "jsonl") {
    const lines = events.map((e) => JSON.stringify(e)).join("\n");
    c.header("Content-Type", "application/x-ndjson");
    c.header("Content-Disposition", `attachment; filename="events.jsonl"`);
    return c.body(lines);
  }
  return c.json(events);
});

// ---------- startup ----------

serve({ fetch: app.fetch, port: PORT }, (info) => {
  const db = process.env.RENDERSEND_DB ?? "sqlite";
  const blobStore = (process.env.BLOB_STORE ?? "fs").split(/\s/)[0];
  console.log(`[api] listening on http://localhost:${info.port}`);
  console.log(`[api] db=${db}  blobs=${blobStore}  debug=${DEBUG_ENABLED}`);
});
