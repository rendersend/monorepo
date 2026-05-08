/**
 * Factory for the application's DataStore.
 *
 * Uses Supabase as the only backend.
 */
import type { DataStore } from "./types";
import { createSupabaseStore } from "./supabase";

let cached: DataStore | null = null;

export function getStore(): DataStore {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL || "https://mdfohqjsgnplmjjnypqj.supabase.co";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY environment variable is required");
  }
  
  cached = createSupabaseStore({ url, serviceRoleKey });
  return cached;
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
