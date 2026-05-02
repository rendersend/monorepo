/**
 * DataStore behavioural tests. Runs against the SQLite backend in a
 * temp file. The Supabase backend will run the same suite once it lands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSqliteStore } from "../src/db/sqlite.ts";

async function freshStore() {
  const dir = await mkdtemp(join(tmpdir(), "rs-store-"));
  const store = createSqliteStore(join(dir, "test.db"));
  return {
    store,
    cleanup: async () => {
      await store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("upsertAnonymous is idempotent", async () => {
  const { store, cleanup } = await freshStore();
  try {
    const a = await store.users.upsertAnonymous("alice@example.com", 1000);
    const b = await store.users.upsertAnonymous("alice@example.com", 2000);
    assert.equal(a.email, "alice@example.com");
    assert.equal(a.createdAt, 1000);
    assert.equal(b.createdAt, 1000, "idempotent: createdAt preserved");
    assert.equal(a.hasPasskey, false);
  } finally {
    await cleanup();
  }
});

test("setHasPasskey toggles flag", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.users.upsertAnonymous("alice@example.com", 1000);
    await store.users.setHasPasskey("alice@example.com", true);
    const u = await store.users.get("alice@example.com");
    assert.equal(u?.hasPasskey, true);
  } finally {
    await cleanup();
  }
});

test("share create / count / list / view / revoke", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.users.upsertAnonymous("alice@example.com", 1000);

    const share = await store.shares.create({
      id: "abc123",
      ownerEmail: "alice@example.com",
      recipientEmails: ["bob@example.com"],
      byteLength: 1024,
      expiresAt: 9999999999,
    }, 2000);

    assert.equal(share.id, "abc123");
    assert.deepEqual(share.recipientEmails, ["bob@example.com"]);
    assert.equal(share.viewCount, 0);
    assert.equal(await store.shares.countByOwner("alice@example.com"), 1);

    await store.shares.recordView("abc123", 3000);
    await store.shares.recordView("abc123", 4000);
    const after = await store.shares.get("abc123");
    assert.equal(after?.viewCount, 2);
    assert.equal(after?.firstViewedAt, 3000);
    assert.equal(after?.lastViewedAt, 4000);

    await store.shares.revoke("abc123", 5000);
    assert.equal((await store.shares.get("abc123"))?.revokedAt, 5000);

    // revoke is idempotent
    await store.shares.revoke("abc123", 6000);
    assert.equal((await store.shares.get("abc123"))?.revokedAt, 5000);

    const list = await store.shares.listByOwner("alice@example.com");
    assert.equal(list.length, 1);
  } finally {
    await cleanup();
  }
});

test("passkey insert / lookup / counter update", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.users.upsertAnonymous("alice@example.com", 1000);
    await store.passkeys.insert({
      credentialId: "cred-1",
      email: "alice@example.com",
      publicKey: new Uint8Array([1, 2, 3, 4]),
      counter: 0,
      transports: ["internal"],
      deviceLabel: "MacBook",
      createdAt: 1000,
      lastUsedAt: null,
    });

    const got = await store.passkeys.getByCredentialId("cred-1");
    assert.ok(got);
    assert.deepEqual(Array.from(got.publicKey), [1, 2, 3, 4]);
    assert.deepEqual(got.transports, ["internal"]);

    await store.passkeys.updateCounter("cred-1", 5, 2000);
    const after = await store.passkeys.getByCredentialId("cred-1");
    assert.equal(after?.counter, 5);
    assert.equal(after?.lastUsedAt, 2000);
  } finally {
    await cleanup();
  }
});

test("session create / get / delete / deleteExpired", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.users.upsertAnonymous("alice@example.com", 1000);
    const s1 = await store.sessions.create("alice@example.com", 60_000, 1000);
    const s2 = await store.sessions.create("alice@example.com", 60_000, 2000);

    assert.notEqual(s1.token, s2.token);
    assert.equal((await store.sessions.get(s1.token))?.email, "alice@example.com");

    await store.sessions.delete(s1.token);
    assert.equal(await store.sessions.get(s1.token), null);

    // s2 still around; expire it
    const removed = await store.sessions.deleteExpired(s2.expiresAt + 1);
    assert.equal(removed, 1);
    assert.equal(await store.sessions.get(s2.token), null);
  } finally {
    await cleanup();
  }
});

test("recovery code upsert and consume", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.users.upsertAnonymous("alice@example.com", 1000);
    await store.recoveryCodes.set("alice@example.com", "hash-1", 1000);
    let got = await store.recoveryCodes.get("alice@example.com");
    assert.equal(got?.codeHash, "hash-1");
    assert.equal(got?.consumedAt, null);

    // overwrite
    await store.recoveryCodes.set("alice@example.com", "hash-2", 2000);
    got = await store.recoveryCodes.get("alice@example.com");
    assert.equal(got?.codeHash, "hash-2");
    assert.equal(got?.createdAt, 2000);
    assert.equal(got?.consumedAt, null);

    await store.recoveryCodes.consume("alice@example.com", 3000);
    got = await store.recoveryCodes.get("alice@example.com");
    assert.equal(got?.consumedAt, 3000);

    // re-consume is a no-op
    await store.recoveryCodes.consume("alice@example.com", 4000);
    got = await store.recoveryCodes.get("alice@example.com");
    assert.equal(got?.consumedAt, 3000);
  } finally {
    await cleanup();
  }
});

test("verify attempts: record + countRecent", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.verifyAttempts.record("share-1", "1.1.1.1", 1000);
    await store.verifyAttempts.record("share-1", "1.1.1.1", 2000);
    await store.verifyAttempts.record("share-1", "1.1.1.1", 3000);
    await store.verifyAttempts.record("share-2", "1.1.1.1", 1500);

    assert.equal(await store.verifyAttempts.countRecent("share-1", 0), 3);
    assert.equal(await store.verifyAttempts.countRecent("share-1", 2000), 2);
    assert.equal(await store.verifyAttempts.countRecent("share-2", 0), 1);
  } finally {
    await cleanup();
  }
});
