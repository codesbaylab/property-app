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
      adminRole: r.admin_role ?? null, verifiedAgent: r.agent_status === "verified", listings: r.listings ?? 0,
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

  return { account, ready, signIn, signOut };
}
