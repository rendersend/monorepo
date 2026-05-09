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
 *   Blobs   → BLOB_STORE=fs (default) | s3
 *   Metadata → RENDERSEND_DB=sqlite (default) | postgres
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getStore } from "./db/store.ts";
import { getBlobStore } from "./storage/blob.ts";
import type { Share } from "./db/types.ts";

const PORT = Number(process.env.PORT ?? 8787);
const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? "./storage");
const MAX_BLOB_BYTES = 10 * 1024 * 1024;

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function isValidEmail(s: string): boolean {
  return s.length > 0 && s.length < 320 && EMAIL_RE.test(s);
}

const app = new Hono();
app.use("*", cors({
  origin: process.env.CORS_ORIGIN ?? "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "X-Owner-Email", "X-Recipient-Emails", "X-Expires-In-Seconds"],
}));

app.get("/health", (c) => c.json({ ok: true }));

app.post("/blobs", async (c) => {
  const ownerHeader = c.req.header("x-owner-email");
  if (!ownerHeader) {
    return c.json({ error: "x-owner-email header required" }, 400);
  }
  const ownerEmail = normalizeEmail(ownerHeader);
  if (!isValidEmail(ownerEmail)) {
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
    return c.json({ error: "blob too large", maxBytes: MAX_BLOB_BYTES }, 413);
  }

  const id = randomBytes(16).toString("hex");
  const now = Date.now();
  const expiresAt = now + expiresInSeconds * 1000;

  await store.users.upsertAnonymous(ownerEmail, now);
  const share = await store.shares.create(
    { id, ownerEmail, recipientEmails, byteLength: body.byteLength, expiresAt },
    now,
  );

  await blobs.write(id, Buffer.from(body));

  return c.json({
    id: share.id,
    expiresAt: share.expiresAt,
    requiresVerify: !!share.recipientEmails?.length,
  });
});

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
  if (!share) {
    return { ok: false, status: 404, body: { error: "not found" } };
  }
  if (share.revokedAt) {
    return { ok: false, status: 410, body: { error: "revoked" } };
  }
  if (share.expiresAt < Date.now()) {
    return { ok: false, status: 410, body: { error: "expired" } };
  }
  return { ok: true, share };
}

app.get("/blobs/:id", async (c) => {
  const id = c.req.param("id");
  const check = await checkShareAccessibility(id);
  if (!check.ok) return c.json(check.body!, check.status!);

  const share = check.share!;
  if (share.recipientEmails !== null) {
    return c.json({ error: "verify_required" }, 403);
  }

  const data = await blobs.read(id);
  if (!data) return c.json({ error: "not found" }, 404);

  await store.shares.recordView(id, Date.now());
  c.header("Content-Type", "application/octet-stream");
  c.header("Cache-Control", "private, max-age=300");
  return c.body(data);
});

app.post("/blobs/:id/access", async (c) => {
  const id = c.req.param("id");
  const check = await checkShareAccessibility(id);
  if (!check.ok) return c.json(check.body!, check.status!);

  const share = check.share!;
  const now = Date.now();

  const recent = await store.verifyAttempts.countRecent(id, now - VERIFY_WINDOW_MS);
  if (recent >= VERIFY_MAX_ATTEMPTS) {
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
  if (!isValidEmail(entered) || !share.recipientEmails?.includes(entered)) {
    return c.json({ error: "verify_failed" }, 401);
  }

  const data = await blobs.read(id);
  if (!data) return c.json({ error: "not found" }, 404);

  await store.shares.recordView(id, now);
  c.header("Content-Type", "application/octet-stream");
  return c.body(data);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
  console.log(`[api] db=${process.env.RENDERSEND_DB ?? "sqlite"}  blobs=${process.env.BLOB_STORE ?? "fs"}`);
});
