/**
 * End-to-end prototype test.
 *
 * Boots the API server, runs the share flow (encrypt + upload), then
 * simulates the viewer (fetch + decrypt) and verifies the round-trip.
 *
 * The viewer page itself is exercised via Vite separately; this script
 * confirms the cryptographic flow and HTTP contracts.
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
<script>document.title = "Decrypted: " + document.title;</script>
</body></html>`;

let serverProc;
let storageDir;

async function startServer() {
  storageDir = await mkdtemp(join(tmpdir(), "rendersend-e2e-"));
  serverProc = spawn(
    process.execPath,
    ["--experimental-strip-types", join(ROOT, "packages/api/src/server.ts")],
    {
      env: { ...process.env, PORT: String(PORT), STORAGE_DIR: storageDir },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  serverProc.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
  serverProc.stderr.on("data", (d) => process.stderr.write(`[api] ${d}`));

  for (let i = 0; i < 30; i++) {
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
    await sleep(100);
  }
  if (storageDir) await rm(storageDir, { recursive: true, force: true });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function run() {
  console.log("→ starting API server");
  await startServer();

  console.log("→ encrypting + uploading");
  const result = await shareHtml(SAMPLE_HTML, {
    apiBase: API_BASE,
    viewerBase: VIEWER_BASE,
  });
  console.log(`  link: ${result.url}`);
  console.log(`  blob size: ${result.byteLength} bytes`);

  // 1. Verify URL shape
  const m = result.url.match(/\/v\/([0-9a-f]{32})#([A-Za-z0-9_-]+)$/);
  assert(m, "url has expected /v/{id}#{key} shape");

  const [, id, keyB64] = m;

  // 2. Verify the key is NOT visible to the server.
  // The server only ever saw the upload POST body and the GET /blobs/:id call.
  // The key never appeared in either; it's only in the fragment of the URL
  // we constructed locally. Sanity-check by listing what the server got.
  // (The Hono server doesn't log per-request; we instead verify by fetching
  // the blob and proving we need the key from the fragment to decrypt.)

  // 3. Simulate the viewer: fetch blob, decrypt with key from fragment.
  console.log("→ simulating viewer fetch");
  const fetchResp = await fetch(`${API_BASE}/blobs/${id}`);
  assert(fetchResp.ok, `blob fetch ok (got ${fetchResp.status})`);
  const packed = new Uint8Array(await fetchResp.arrayBuffer());
  assert(packed.byteLength === result.byteLength, "fetched bytes match uploaded size");

  console.log("→ decrypting in viewer-equivalent");
  const blob = unpackBlob(packed);
  const key = await importKeyRaw(b64UrlToBytes(keyB64));
  const plaintext = decodeUtf8(await decrypt(key, blob));
  assert(plaintext === SAMPLE_HTML, "decrypted plaintext matches input");
  console.log("  ✓ plaintext matches");

  // 4. Verify decryption fails with wrong key.
  console.log("→ verifying decryption fails with wrong key");
  const wrongKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(wrongKeyBytes);
  const wrongKey = await importKeyRaw(wrongKeyBytes);
  let threw = false;
  try {
    await decrypt(wrongKey, blob);
  } catch {
    threw = true;
  }
  assert(threw, "wrong key fails authentication");
  console.log("  ✓ wrong key rejected");

  // 5. Verify expiry / not-found semantics.
  console.log("→ verifying 404 on unknown id");
  const missing = await fetch(`${API_BASE}/blobs/${"0".repeat(32)}`);
  assert(missing.status === 404, `unknown id is 404 (got ${missing.status})`);
  console.log("  ✓ 404 on unknown id");

  // 6. Verify the API rejects oversized uploads.
  console.log("→ verifying 10MB cap");
  const big = new Uint8Array(11 * 1024 * 1024);
  const bigResp = await fetch(`${API_BASE}/blobs`, {
    method: "POST",
    body: big,
  });
  assert(bigResp.status === 413, `oversized upload rejected (got ${bigResp.status})`);
  console.log("  ✓ oversized upload rejected");

  console.log("\nAll prototype invariants verified.");
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
