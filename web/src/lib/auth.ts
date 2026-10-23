"use client";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";

export interface Account {
  id: string;
  email: string | null;
  name: string;
  city: string | null;
  adminRole: "super_admin" | "moderator" | "support" | null;
  verifiedAgent: boolean;
  agentStatus: "none" | "pending" | "verified" | "rejected";
  listings: number;
}

/** Who is signed in. Until Supabase is configured nobody can sign in and the app runs on sample data. */
export function useAuth() {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(!supabaseConfigured);

  const load = useCallback(async (session: Session | null) => {
    if (!session) { setAccount(null); setReady(true); return; }
    const db = supabase();
    const [{ data: profile }, { data: roles }] = await Promise.all([
      db.from("profiles").select("name, city").eq("id", session.user.id).maybeSingle(),
      db.rpc("my_roles"),
    ]);
    const r = (roles ?? {}) as { admin_role?: Account["adminRole"]; agent_status?: string; listings?: number };
    setAccount({
      id: session.user.id, email: session.user.email ?? null, name: profile?.name || session.user.email?.split("@")[0] || "You", city: profile?.city ?? null,
      adminRole: r.admin_role ?? null, verifiedAgent: r.agent_status === "verified", agentStatus: (r.agent_status as Account["agentStatus"]) ?? "none", listings: r.listings ?? 0,
    });
    setReady(true);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const db = supabase();
    db.auth.getSession().then(({ data }) => load(data.session));
    // run later: supabase-js must not be called from inside its own auth callback
    const { data } = db.auth.onAuthStateChange((_event, session) => { setTimeout(() => load(session), 0); });
    return () => data.subscription.unsubscribe();
  }, [load]);

  /** Returns an error message, or null when it worked. */
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    return error ? (error.message === "Invalid login credentials" ? "Wrong email or password." : error.message) : null;
  }, []);
  const signOut = useCallback(async () => { await supabase().auth.signOut(); }, []);

  /** Creates an account. `confirm` is true when Supabase wants the email address confirmed before the first sign-in. */
  const signUp = useCallback(async (name: string, email: string, password: string): Promise<{ error?: string; confirm?: boolean }> => {
    const { data, error } = await supabase().auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() }, emailRedirectTo: location.origin } });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("already registered")) return { error: "An account with this email already exists. Try signing in instead." };
      if (m.includes("rate limit")) return { error: "Too many sign-up emails were sent. Please try again in a little while." };
      if (m.includes("invalid") && m.includes("email")) return { error: "That email address doesn't look right." };
      return { error: error.message };
    }
    // Supabase hides whether an email is taken: an existing address comes back as a user with no identities
    if (data.user && data.user.identities?.length === 0) return { error: "An account with this email already exists. Try signing in instead." };
    return data.session ? {} : { confirm: true };
  }, []);

  /** Reloads the account, for after something changed its roles (such as sending an agent application). */
  const refresh = useCallback(async () => { const { data } = await supabase().auth.getSession(); await load(data.session); }, [load]);

  return { account, ready, signIn, signUp, signOut, refresh };
}
