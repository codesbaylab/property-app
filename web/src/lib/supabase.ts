import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True once the Supabase URL and public key are set in web/.env.local. Until then the app uses sample data. */
export const supabaseConfigured = Boolean(url && key);
export const supabaseUrl = url ?? "";

let client: SupabaseClient | null = null;

/** The app's database client. Row level security decides what each visitor or signed-in account can read and change. */
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in web/.env.local");
  client ??= createClient(url, key, { auth: { persistSession: typeof window !== "undefined", autoRefreshToken: typeof window !== "undefined" } });
  return client;
}
