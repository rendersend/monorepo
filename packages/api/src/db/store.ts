/**
 * DataStore factory.
 *
 * Driver selected via RENDERSEND_DB env var (default: sqlite).
 *
 *   RENDERSEND_DB=sqlite    local SQLite file (dev / single-server)
 *   RENDERSEND_DB=postgres  PostgreSQL via DATABASE_URL (Supabase, etc.)
 */
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type { DataStore } from "./types";
import { createSqliteStore } from "./sqlite";
import { createPostgresStore } from "./postgres";

let cached: DataStore | null = null;

export async function getStore(): Promise<DataStore> {
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
    case "postgres": {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL env var is required when RENDERSEND_DB=postgres");
      cached = await createPostgresStore(url);
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

export type { DataStore } from "./types";
export type {
  CreateShareInput,
  PasskeyCredential,
  RecoveryCode,
  Session,
  Share,
  User,
  VerifyAttempt,
} from "./types";
