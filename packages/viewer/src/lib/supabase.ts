import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const AUTH_MODE =
  (import.meta.env.VITE_AUTH_MODE as string | undefined) ?? "none";
