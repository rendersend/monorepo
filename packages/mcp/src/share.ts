/**
 * Shared share-html implementation used by the MCP server and the CLI.
 *
 * Encrypts on the user's machine, uploads opaque ciphertext, returns
 * a viewer link with the AES key in the URL fragment. The server
 * never sees the key in either the upload request or the resulting URL.
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
  ownerEmail: string;
  recipientEmails?: string[] | null;
  expiresInSeconds?: number;
}

export interface ShareResult {
  url: string;
  id: string;
  expiresAt: number;
  byteLength: number;
  requiresVerify: boolean;
}

export async function shareHtml(
  html: string,
  opts: ShareOptions,
): Promise<ShareResult> {
  if (!html || typeof html !== "string") {
    throw new Error("html must be a non-empty string");
  }
  if (!opts.ownerEmail || !opts.ownerEmail.includes("@")) {
    throw new Error("ownerEmail is required and must be a valid email");
  }

  const key = await generateKey();
  const plaintext = encodeUtf8(html);
  const blob = await encrypt(key, plaintext);
  const packed = packBlob(blob);

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "X-Owner-Email": opts.ownerEmail,
  };
  if (opts.recipientEmails?.length) {
    headers["X-Recipient-Emails"] = opts.recipientEmails.join(",");
  }
  if (opts.expiresInSeconds) {
    headers["X-Expires-In-Seconds"] = String(opts.expiresInSeconds);
  }

  const uploadResp = await fetch(`${opts.apiBase}/blobs`, {
    method: "POST",
    headers,
    body: packed,
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    throw new Error(`upload failed: HTTP ${uploadResp.status} — ${text}`);
  }

  const { id, expiresAt, requiresVerify } = (await uploadResp.json()) as {
    id: string;
    expiresAt: number;
    requiresVerify: boolean;
  };

  const rawKey = await exportKeyRaw(key);
  const keyB64 = bytesToB64Url(rawKey);
  const url = `${opts.viewerBase}/v/${id}#${keyB64}`;

  return { url, id, expiresAt, byteLength: packed.byteLength, requiresVerify };
}
