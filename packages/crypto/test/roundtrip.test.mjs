import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKey,
  exportKeyRaw,
  importKeyRaw,
  encrypt,
  decrypt,
  packBlob,
  unpackBlob,
  bytesToB64Url,
  b64UrlToBytes,
  encodeUtf8,
  decodeUtf8,
} from "../src/index.ts";

test("encrypt/decrypt roundtrip", async () => {
  const key = await generateKey();
  const plaintext = encodeUtf8("<h1>secret report</h1>");
  const blob = await encrypt(key, plaintext);
  const decrypted = await decrypt(key, blob);
  assert.equal(decodeUtf8(decrypted), "<h1>secret report</h1>");
});

test("decrypt fails with wrong key", async () => {
  const k1 = await generateKey();
  const k2 = await generateKey();
  const blob = await encrypt(k1, encodeUtf8("hello"));
  await assert.rejects(() => decrypt(k2, blob));
});

test("decrypt fails on tampered ciphertext", async () => {
  const key = await generateKey();
  const blob = await encrypt(key, encodeUtf8("hello"));
  blob.ciphertext[0] ^= 0xff;
  await assert.rejects(() => decrypt(key, blob));
});

test("key export/import preserves identity", async () => {
  const k1 = await generateKey();
  const raw = await exportKeyRaw(k1);
  const k2 = await importKeyRaw(raw);
  const blob = await encrypt(k1, encodeUtf8("hello"));
  const decrypted = await decrypt(k2, blob);
  assert.equal(decodeUtf8(decrypted), "hello");
});

test("pack/unpack preserves blob", async () => {
  const key = await generateKey();
  const blob = await encrypt(key, encodeUtf8("x".repeat(1000)));
  const packed = packBlob(blob);
  const unpacked = unpackBlob(packed);
  const decrypted = await decrypt(key, unpacked);
  assert.equal(decodeUtf8(decrypted), "x".repeat(1000));
});

test("base64url roundtrip on key bytes", async () => {
  const key = await generateKey();
  const raw = await exportKeyRaw(key);
  const s = bytesToB64Url(raw);
  assert.match(s, /^[A-Za-z0-9_-]+$/, "should be url-safe");
  const back = b64UrlToBytes(s);
  assert.deepEqual(back, raw);
});
