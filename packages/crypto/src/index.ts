/**
 * Rendersend crypto primitives.
 *
 * Runs unmodified in Node 20+ and modern browsers via the WebCrypto API.
 *
 * Prototype scope: AES-256-GCM symmetric encryption only.
 * MVP will add X25519 key wrapping for per-recipient private shares.
 *
 * Threat model assumption: the server never sees a plaintext key.
 * In link-share mode, the key lives only in the URL fragment (after `#`),
 * which browsers do not transmit to servers. In private-share mode, the key
 * will be wrapped per-recipient with their X25519 public key (MVP).
 */

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard
const ALG = "AES-GCM";

export interface EncryptedBlob {
  /** Ciphertext including the GCM auth tag (Web Crypto appends it). */
  ciphertext: Uint8Array;
  /** 96-bit IV. Random per encryption. */
  iv: Uint8Array;
}

export interface ShareEnvelope {
  /** Opaque blob identifier returned by the API. */
  id: string;
  /** Base64url-encoded raw key bytes. Lives in URL fragment, never sent to server. */
  keyB64: string;
}

/** Generate a fresh random 256-bit AES key. */
export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALG, length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/** Export a CryptoKey as raw bytes. */
export async function exportKeyRaw(key: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(buf);
}

/** Import raw 32-byte key material as an AES-GCM CryptoKey. */
export async function importKeyRaw(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== KEY_BYTES) {
    throw new Error(`expected ${KEY_BYTES}-byte key, got ${raw.byteLength}`);
  }
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: ALG },
    true,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt plaintext with the given key. Generates a fresh IV per call. */
export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt({ name: ALG, iv }, key, plaintext);
  return { ciphertext: new Uint8Array(ct), iv };
}

/** Decrypt; throws if the auth tag fails. */
export async function decrypt(
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: ALG, iv: blob.iv },
    key,
    blob.ciphertext,
  );
  return new Uint8Array(pt);
}

/**
 * Wire format for blob upload:
 *   [12 bytes IV][N bytes ciphertext+tag]
 *
 * Keeping IV and ciphertext together means the API endpoint stores a single
 * opaque blob and never needs to know the structure.
 */
export function packBlob(blob: EncryptedBlob): Uint8Array {
  const out = new Uint8Array(blob.iv.byteLength + blob.ciphertext.byteLength);
  out.set(blob.iv, 0);
  out.set(blob.ciphertext, blob.iv.byteLength);
  return out;
}

export function unpackBlob(packed: Uint8Array): EncryptedBlob {
  if (packed.byteLength <= IV_BYTES) {
    throw new Error("packed blob too short");
  }
  return {
    iv: packed.slice(0, IV_BYTES),
    ciphertext: packed.slice(IV_BYTES),
  };
}

/** URL-safe base64 (no padding). Used for keys in URL fragments. */
export function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === "function"
    ? btoa(bin)
    : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = typeof atob === "function"
    ? atob(b64)
    : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

export function encodeUtf8(s: string): Uint8Array {
  return TEXT_ENCODER.encode(s);
}

export function decodeUtf8(b: Uint8Array): string {
  return TEXT_DECODER.decode(b);
}
