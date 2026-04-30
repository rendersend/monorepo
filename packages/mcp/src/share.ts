/**
 * Shared share-html implementation used by both the MCP server and the
 * standalone CLI test harness. Encrypts on the user's machine, uploads
 * the opaque blob to the API, and returns a link with the key in the
 * URL fragment.
 *
 * Zero-access invariant: the key never leaves this process except as
 * part of the returned link string. The HTTP request to the API does
 * not include the key in any header, body, or URL component.
 */
import {
  generateKey,
  exportKeyRaw,
  encrypt,
  packBlob,
  bytesToB64Url,
  encodeUtf8,
} from "@rendersend/crypto";

export interface ShareOptions {
  apiBase: string;
  viewerBase: string;
}

export interface ShareResult {
  url: string;
  id: string;
  expiresAt: number;
  byteLength: number;
}

export async function shareHtml(
  html: string,
  opts: ShareOptions,
): Promise<ShareResult> {
  if (!html || typeof html !== "string") {
    throw new Error("html must be a non-empty string");
  }

  const key = await generateKey();
  const plaintext = encodeUtf8(html);
  const blob = await encrypt(key, plaintext);
  const packed = packBlob(blob);

  const uploadResp = await fetch(`${opts.apiBase}/blobs`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: packed,
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    throw new Error(`upload failed: HTTP ${uploadResp.status} — ${text}`);
  }

  const { id, expiresAt } = (await uploadResp.json()) as {
    id: string;
    expiresAt: number;
  };

  const rawKey = await exportKeyRaw(key);
  const keyB64 = bytesToB64Url(rawKey);

  // Key in URL fragment — browsers do not send fragments to servers.
  const url = `${opts.viewerBase}/v/${id}#${keyB64}`;

  return { url, id, expiresAt, byteLength: packed.byteLength };
}
