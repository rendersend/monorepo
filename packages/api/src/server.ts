/**
 * Rendersend prototype API.
 *
 * Stores opaque encrypted blobs and returns them on demand. The server has
 * no decryption key and cannot read content. This is intentional and is the
 * core of the zero-access claim.
 *
 * Storage backend: filesystem under ./storage/. Will be swapped for
 * Cloudflare R2 + D1 in the MVP. The Hono framework runs unchanged on
 * Workers; only the storage layer changes.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8787);
const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? "./storage");
const MAX_BLOB_BYTES = 10 * 1024 * 1024; // 10 MB — matches MVP limit

await mkdir(STORAGE_DIR, { recursive: true });

const app = new Hono();

// Permissive CORS for prototype: viewer runs on a different port locally.
// Production will lock this to viewer.rendersend.com only.
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

app.get("/health", (c) => c.json({ ok: true }));

/**
 * POST /blobs
 * Body: raw bytes (application/octet-stream) — packed [IV || ciphertext+tag]
 * Returns: { id, expiresAt }
 *
 * The server treats the body as opaque. It does not parse, validate the
 * structure of, or attempt to read the contents.
 */
app.post("/blobs", async (c) => {
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) {
    return c.json({ error: "empty body" }, 400);
  }
  if (body.byteLength > MAX_BLOB_BYTES) {
    return c.json({ error: "blob too large", maxBytes: MAX_BLOB_BYTES }, 413);
  }

  const id = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7d default

  const meta = { id, createdAt: Date.now(), expiresAt, byteLength: body.byteLength };
  await writeFile(join(STORAGE_DIR, `${id}.bin`), Buffer.from(body));
  await writeFile(join(STORAGE_DIR, `${id}.json`), JSON.stringify(meta));

  return c.json({ id, expiresAt });
});

/**
 * GET /blobs/:id
 * Returns: raw bytes (application/octet-stream).
 *
 * Public endpoint by design for the link-share mode. Knowledge of the id
 * alone is insufficient to read content — the decryption key lives in the
 * URL fragment, never reaches the server. Brute-forcing the 128-bit id is
 * infeasible.
 *
 * Private-share mode (MVP) will gate this behind a recipient auth check.
 */
app.get("/blobs/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f]{32}$/.test(id)) {
    return c.json({ error: "invalid id" }, 400);
  }

  let metaRaw: string;
  try {
    metaRaw = await readFile(join(STORAGE_DIR, `${id}.json`), "utf8");
  } catch {
    return c.json({ error: "not found" }, 404);
  }
  const meta = JSON.parse(metaRaw) as { expiresAt: number };
  if (meta.expiresAt < Date.now()) {
    return c.json({ error: "expired" }, 410);
  }

  const data = await readFile(join(STORAGE_DIR, `${id}.bin`));
  c.header("Content-Type", "application/octet-stream");
  c.header("Cache-Control", "private, max-age=300");
  return c.body(data);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
  console.log(`[api] storage at ${STORAGE_DIR}`);
});
