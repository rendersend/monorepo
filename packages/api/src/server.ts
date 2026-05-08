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
 *     before the ciphertext is served. Crypto is identical; the email
 *     check is a soft gate for "this was meant for you" cross-check,
 *     not real access control.
 *
 * Persistence: filesystem for ciphertext blobs (storage/blobs/{id}.bin),
 * SQLite for metadata via the DataStore wrapper. Backend swappable
 * via RENDERSEND_DB env (sqlite | supabase later).
 */
// Load .env file manually
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(__dirname, "../../../.env"),
  resolve(__dirname, "../../../../.env"),
];

let envPath = null;
for (const path of envPaths) {
  if (existsSync(path)) {
    envPath = path;
    console.log(`[env] Loading from: ${path}`);
    break;
  }
}

if (envPath) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { randomBytes } from "node:crypto";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getStore } from "./db/store";
import { createSupabaseStorage } from "./supabase-storage";

const PORT = Number(process.env.PORT ?? 8787);
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

const store = getStore();

// Validate required environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY");
}

// Initialize Supabase Storage
const storage = createSupabaseStorage({
  url: SUPABASE_URL,
  serviceRoleKey: SUPABASE_KEY,
});

// Ensure storage bucket exists
await storage.ensureBucket();
console.log("[storage] Supabase Storage initialized");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function isValidEmail(s: string): boolean {
  return s.length > 0 && s.length < 320 && EMAIL_RE.test(s);
}

// CORS configuration from environment
const CORS_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(",").map(origin => origin.trim())
  : ["*"]; // Default to allow all origins

const app = new Hono();
app.use("*", cors({
  origin: CORS_ORIGINS,
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "X-Owner-Email", "X-Recipient-Emails", "X-Expires-In-Seconds"],
}));

app.get("/health", (c) => c.json({ ok: true }));

/**
 * POST /blobs
 * Headers:
 *   X-Owner-Email (required)        — owner identity (auto-creates anonymous user)
 *   X-Recipient-Email (optional)    — pin for cross-check; if present, viewer
 *                                     must call /access before decryption
 *   X-Expires-In-Seconds (optional) — 86400 / 604800 / 2592000 / 31536000
 * Body: raw bytes (application/octet-stream) — packed [IV || ciphertext+tag]
 *
 * The body is treated as opaque. The server never inspects, parses, or
 * stores it as anything but bytes.
 */
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
    const parsed = recipientHeader
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean);
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
  if (body.byteLength === 0) {
    return c.json({ error: "empty body" }, 400);
  }
  if (body.byteLength > MAX_BLOB_BYTES) {
    return c.json({ error: "blob too large", maxBytes: MAX_BLOB_BYTES }, 413);
  }

  const id = randomBytes(16).toString("hex");
  const now = Date.now();
  const expiresAt = now + expiresInSeconds * 1000;

  await store.users.upsertAnonymous(ownerEmail, now);
  const share = await store.shares.create(
    {
      id,
      ownerEmail,
      recipientEmails,
      byteLength: body.byteLength,
      expiresAt,
    },
    now,
  );

  await storage.uploadBlob(id, Buffer.from(body));

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
  share?: Awaited<ReturnType<typeof store.shares.get>>;
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

async function readBlob(id: string): Promise<Buffer | null> {
  return await storage.downloadBlob(id);
}

/**
 * GET /blobs/:id
 *
 * For pure link shares (no recipient pin), returns the ciphertext directly.
 * For email-pinned shares, returns 403 with `error: "verify_required"`,
 * directing the viewer to use POST /access.
 */
app.get("/blobs/:id", async (c) => {
  const id = c.req.param("id");
  const check = await checkShareAccessibility(id);
  if (!check.ok) return c.json(check.body!, check.status!);

  const share = check.share!;
  if (share.recipientEmails !== null) {
    return c.json({ error: "verify_required" }, 403);
  }

  const data = await readBlob(id);
  if (!data) return c.json({ error: "not found" }, 404);

  await store.shares.recordView(id, Date.now());
  c.header("Content-Type", "application/octet-stream");
  c.header("Cache-Control", "private, max-age=300");
  return c.body(new Uint8Array(data));
});

/**
 * POST /blobs/:id/access
 * Body: { email: string }
 *
 * Cross-check the entered email against the share's pinned recipient.
 * On match, returns ciphertext bytes. On mismatch, returns a generic
 * 401 with `verify_failed` — same response whether the share exists,
 * is pinned, or the email matches, to avoid info leak.
 *
 * Rate-limited per share: VERIFY_MAX_ATTEMPTS in VERIFY_WINDOW_MS.
 *
 * The email check is NOT cryptographic — it's a UX gate. Anyone who
 * knows the pinned email and has the URL with the key in the fragment
 * can still decrypt. Documented as such.
 */
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

  const data = await readBlob(id);
  if (!data) return c.json({ error: "not found" }, 404);

  await store.shares.recordView(id, now);
  c.header("Content-Type", "application/octet-stream");
  return c.body(new Uint8Array(data));
});

// Vercel serverless export
export default app;

// Local development server
if (process.env.NODE_ENV !== "production") {
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[api] listening on http://localhost:${info.port}`);
    console.log(`[api] storage: Supabase Storage (bucket: rendersend-blobs)`);
  });
} else {
  // Production server still needs to run locally for testing
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[api] production server listening on http://localhost:${info.port}`);
    console.log(`[api] storage: Supabase Storage (bucket: rendersend-blobs)`);
  });
}
