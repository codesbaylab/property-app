import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True once the Supabase URL and public key are set in web/.env.local. Until then the app uses sample data. */
export const supabaseConfigured = Boolean(url && key);
export const supabaseUrl = url ?? "";

let client: SupabaseClient | null = null;

/** Public (read-only by row level security) client. Login support arrives with the accounts phase. */
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in web/.env.local");
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
