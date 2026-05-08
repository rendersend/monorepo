/**
 * End-to-end test harness for Phase A.
 *
 * Boots the API server in a temp dir (sqlite + filesystem blobs), then
 * exercises the full share flow plus the new owner/recipient + cross-check
 * + rate-limit invariants.
 *
 * Designed to be runnable in CI: no external deps, deterministic teardown.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { shareHtml } from "../packages/mcp/src/share.ts";
import {
  importKeyRaw,
  decrypt,
  unpackBlob,
  b64UrlToBytes,
  decodeUtf8,
} from "../packages/crypto/src/index.ts";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 18787;
const API_BASE = `http://localhost:${PORT}`;
const VIEWER_BASE = "http://localhost:5173";

const SAMPLE_HTML = `<!doctype html>
<html><head><title>Q3 Report</title></head>
<body>
<h1>Q3 Financial Summary</h1>
<p>Revenue: <strong>$4.2M</strong></p>
</body></html>`;

let serverProc;
let storageDir;

async function startServer() {
  storageDir = await mkdtemp(join(tmpdir(), "rendersend-e2e-"));
  serverProc = spawn(
    process.execPath,
    ["--experimental-strip-types", join(ROOT, "packages/api/src/server.ts")],
    {
      env: {
        ...process.env,
        PORT: String(PORT),
        STORAGE_DIR: storageDir,
        RENDERSEND_DB_PATH: join(storageDir, "test.db"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  serverProc.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
  serverProc.stderr.on("data", (d) => process.stderr.write(`[api] ${d}`));

  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${API_BASE}/health`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error("api server did not start");
}

async function stopServer() {
  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGTERM");
    await sleep(150);
  }
  if (storageDir) await rm(storageDir, { recursive: true, force: true });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function parseShareUrl(url) {
  const m = url.match(/\/v\/([0-9a-f]{32})#([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error(`bad share url: ${url}`);
  return { id: m[1], keyB64: m[2] };
}

async function decryptBlobBytes(packed, keyB64) {
  const blob = unpackBlob(packed);
  const key = await importKeyRaw(b64UrlToBytes(keyB64));
  return decodeUtf8(await decrypt(key, blob));
}

async function run() {
  console.log("→ starting API server");
  await startServer();

  // ──────────────────────────────────────────────────────────────
  console.log("\n[1] link share (no recipient)");
  const linkResult = await shareHtml(SAMPLE_HTML, {
    apiBase: API_BASE,
    viewerBase: VIEWER_BASE,
    ownerEmail: "alice@example.com",
  });
  assert(linkResult.requiresVerify === false, "link share does not require verify");
  const linkParsed = parseShareUrl(linkResult.url);

  const linkFetch = await fetch(`${API_BASE}/blobs/${linkParsed.id}`);
  assert(linkFetch.ok, `link share GET ok (got ${linkFetch.status})`);
  const linkPlaintext = await decryptBlobBytes(
    new Uint8Array(await linkFetch.arrayBuffer()),
    linkParsed.keyB64,
  );
  assert(linkPlaintext === SAMPLE_HTML, "link share decrypts to original HTML");
  console.log("  ✓ link share roundtrip works without verify");

  // ──────────────────────────────────────────────────────────────
  console.log("\n[2] email-pinned share — wrong direct GET is gated");
  const pinnedResult = await shareHtml(SAMPLE_HTML, {
    apiBase: API_BASE,
    viewerBase: VIEWER_BASE,
    ownerEmail: "alice@example.com",
    recipientEmails: ["bob@example.com"],
  });
  assert(pinnedResult.requiresVerify === true, "pinned share requires verify");
  const pinnedParsed = parseShareUrl(pinnedResult.url);

  const directGet = await fetch(`${API_BASE}/blobs/${pinnedParsed.id}`);
  assert(directGet.status === 403, `direct GET on pinned share is 403 (got ${directGet.status})`);
  const directBody = await directGet.json();
  assert(directBody.error === "verify_required", "error code is verify_required");
  console.log("  ✓ pinned share refuses direct GET");

  // ──────────────────────────────────────────────────────────────
  console.log("\n[3] email-pinned share — wrong email rejected, right email serves blob");
  const wrongEmailResp = await fetch(`${API_BASE}/blobs/${pinnedParsed.id}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "wrong@example.com" }),
  });
  assert(wrongEmailResp.status === 401, `wrong email is 401 (got ${wrongEmailResp.status})`);
  const wrongBody = await wrongEmailResp.json();
  assert(wrongBody.error === "verify_failed", "wrong email returns generic verify_failed");

  const rightEmailResp = await fetch(`${API_BASE}/blobs/${pinnedParsed.id}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "  BOB@example.com  " }), // whitespace + case
  });
  assert(rightEmailResp.ok, `correct email serves blob (got ${rightEmailResp.status})`);
  const rightBytes = new Uint8Array(await rightEmailResp.arrayBuffer());
  const rightPlaintext = await decryptBlobBytes(rightBytes, pinnedParsed.keyB64);
  assert(rightPlaintext === SAMPLE_HTML, "decrypted plaintext matches");
  console.log("  ✓ wrong email rejected; right email (whitespace+case insensitive) serves blob");

  // ──────────────────────────────────────────────────────────────
  console.log("\n[4] rate limit: 5 attempts within window then 429");
  const rateResult = await shareHtml(SAMPLE_HTML, {
    apiBase: API_BASE,
    viewerBase: VIEWER_BASE,
    ownerEmail: "alice@example.com",
    recipientEmails: ["rate@example.com"],
  });
  const rateParsed = parseShareUrl(rateResult.url);
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${API_BASE}/blobs/${rateParsed.id}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `wrong${i}@example.com` }),
    });
    assert(r.status === 401, `attempt ${i + 1}: 401 (got ${r.status})`);
  }
  const sixth = await fetch(`${API_BASE}/blobs/${rateParsed.id}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "rate@example.com" }),
  });
  assert(sixth.status === 429, `6th attempt is 429 (got ${sixth.status})`);
  console.log("  ✓ 6th attempt within window blocked even with the right email");

  // ──────────────────────────────────────────────────────────────
  console.log("\n[5] missing owner email rejected");
  const missingOwner = await fetch(`${API_BASE}/blobs`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array([1, 2, 3]),
  });
  assert(missingOwner.status === 400, `missing owner is 400 (got ${missingOwner.status})`);
  console.log("  ✓ POST /blobs without X-Owner-Email rejected");

  // ──────────────────────────────────────────────────────────────
  console.log("\n[6] expired/oversized still enforced");
  const big = new Uint8Array(11 * 1024 * 1024);
  const bigResp = await fetch(`${API_BASE}/blobs`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Owner-Email": "alice@example.com" },
    body: big,
  });
  assert(bigResp.status === 413, `oversized 413 (got ${bigResp.status})`);

  const missing = await fetch(`${API_BASE}/blobs/${"0".repeat(32)}`);
  assert(missing.status === 404, `unknown id 404 (got ${missing.status})`);
  console.log("  ✓ size cap and 404 on unknown id intact");

  console.log("\nAll Phase A invariants verified.");
}

let exitCode = 0;
try {
  await run();
} catch (e) {
  console.error("\n✗ test failed:", e);
  exitCode = 1;
} finally {
  await stopServer();
}
process.exit(exitCode);
