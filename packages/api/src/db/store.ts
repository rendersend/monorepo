/**
 * Factory for the application's DataStore.
 *
 * Driver is selected by RENDERSEND_DB env var. Default is sqlite. The
 * intent is that adding a Supabase implementation later requires no
 * changes outside this file:
 *
 *   case "supabase":
 *     return createSupabaseStore({ url: ..., serviceRoleKey: ... });
 */
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { DataStore } from "./types.ts";
import { createSqliteStore } from "./sqlite.ts";

let cached: DataStore | null = null;

export function getStore(): DataStore {
  if (cached) return cached;

  const driver = process.env.RENDERSEND_DB ?? "sqlite";
  switch (driver) {
    case "sqlite": {
      const path = resolve(
        process.env.RENDERSEND_DB_PATH ?? "./storage/rendersend.db",
      );
      mkdirSync(resolve(path, ".."), { recursive: true });
      cached = createSqliteStore(path);
      return cached;
    }
    default:
      throw new Error(`unknown RENDERSEND_DB driver: ${driver}`);
  }
}

export function resetStoreForTests(): void {
  if (cached) {
    cached.close();
    cached = null;
  }
}

export type { DataStore } from "./types.ts";
export type {
  CreateShareInput,
  PasskeyCredential,
  RecoveryCode,
  Session,
  Share,
  User,
  VerifyAttempt,
} from "./types.ts";
