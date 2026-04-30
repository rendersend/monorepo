/**
 * Viewer entry point.
 *
 * Flow:
 *   1. Parse blob id from path (/v/:id) and key from URL fragment.
 *   2. Fetch the encrypted blob from the API.
 *   3. Decrypt in-browser via WebCrypto.
 *   4. Render decrypted HTML inside a sandboxed srcdoc iframe with a
 *      strict CSP that blocks all external network.
 *
 * Security invariants:
 *   - The decryption key is NEVER sent to the server (URL fragments aren't
 *     transmitted; we also avoid logging or sending it in any request).
 *   - The user HTML runs in a unique-origin sandbox and cannot access this
 *     page's `location` (which contains the key).
 *   - We strip `window.location.hash` after reading it so a casual share of
 *     the rendered page (e.g. screenshot of devtools) has fewer ways to leak.
 */
import {
  importKeyRaw,
  decrypt,
  unpackBlob,
  b64UrlToBytes,
  decodeUtf8,
} from "@rendersend/crypto";

const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined)
  ?? "http://localhost:8787";

function setStatus(title: string, body: string, isError = false): void {
  const el = document.getElementById("status");
  if (!el) return;
  el.classList.toggle("error", isError);
  el.innerHTML = "";
  const wrap = document.createElement("div");
  const h = document.createElement("h2");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  wrap.appendChild(h);
  wrap.appendChild(p);
  el.appendChild(wrap);
}

function setMeta(text: string): void {
  const el = document.getElementById("meta");
  if (el) el.textContent = text;
}

function parseLocation(): { id: string; keyB64: string } | null {
  // URL shape: /v/{id}#{keyB64}  — also support ?id=...&k=... for dev convenience.
  const path = window.location.pathname;
  const match = path.match(/\/v\/([0-9a-f]{32})/);
  let id = match?.[1] ?? null;

  let keyB64 = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";

  if (!id || !keyB64) {
    const params = new URLSearchParams(window.location.search);
    id = id ?? params.get("id");
    keyB64 = keyB64 || (params.get("k") ?? "");
  }

  if (!id || !keyB64) return null;
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(keyB64)) return null;
  return { id, keyB64 };
}

/**
 * Wraps user HTML in a minimal document with a meta-CSP that locks down
 * the iframe's network. Combined with sandbox="allow-scripts" (no
 * allow-same-origin, no allow-forms), the iframe cannot:
 *   - Read this page's location or storage (different origin)
 *   - Submit forms
 *   - Navigate the top window
 *   - Make network requests (default-src 'none' + connect-src 'none')
 *
 * Inline scripts/styles are allowed so LLM-generated reports with charts
 * and styling render correctly. This is a deliberate trade-off: zero
 * external network beats a strict no-script policy that breaks the
 * primary use case.
 */
function wrapForSandbox(userHtml: string): string {
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; ");

  // Inject CSP via <meta http-equiv> at the top of <head>. If user HTML
  // is a fragment without <html>/<head>, we still wrap it.
  const hasHtml = /<html[\s>]/i.test(userHtml);
  if (hasHtml) {
    return userHtml.replace(
      /<head(\s[^>]*)?>/i,
      (m) => `${m}<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );
  }
  return `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head><body>${userHtml}</body></html>`;
}

async function main(): Promise<void> {
  const loc = parseLocation();
  if (!loc) {
    setStatus(
      "Invalid link",
      "This link is missing or malformed. Make sure you copied the full URL including the part after #.",
      true,
    );
    setMeta("");
    return;
  }

  // Read the key, then clear the fragment from history to reduce leakage
  // surface (e.g. screen shares, accidental copy of address bar).
  const keyBytes = b64UrlToBytes(loc.keyB64);
  history.replaceState(null, "", window.location.pathname);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/blobs/${loc.id}`);
  } catch (e) {
    setStatus("Network error", `Could not reach the server: ${(e as Error).message}`, true);
    setMeta("");
    return;
  }

  if (response.status === 404) {
    setStatus("Not found", "This share doesn't exist or has been revoked.", true);
    setMeta("");
    return;
  }
  if (response.status === 410) {
    setStatus("Expired", "This share has expired and is no longer available.", true);
    setMeta("");
    return;
  }
  if (!response.ok) {
    setStatus("Server error", `HTTP ${response.status}`, true);
    setMeta("");
    return;
  }

  const packed = new Uint8Array(await response.arrayBuffer());
  const blob = unpackBlob(packed);

  let plaintext: Uint8Array;
  try {
    const key = await importKeyRaw(keyBytes);
    plaintext = await decrypt(key, blob);
  } catch {
    setStatus(
      "Decryption failed",
      "The link may be corrupted or the content has been tampered with.",
      true,
    );
    setMeta("");
    return;
  }

  const html = decodeUtf8(plaintext);

  // Replace status with the iframe.
  const status = document.getElementById("status");
  if (!status) return;
  const iframe = document.createElement("iframe");
  iframe.className = "frame";
  iframe.sandbox.add("allow-scripts");
  iframe.referrerPolicy = "no-referrer";
  iframe.srcdoc = wrapForSandbox(html);
  status.replaceWith(iframe);

  setMeta(`${(packed.byteLength / 1024).toFixed(1)} KB · decrypted locally`);
}

main();
