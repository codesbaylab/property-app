"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase, supabaseConfigured } from "./supabase";

/* ---------- tiny localStorage store (falls back to memory if storage is blocked) ---------- */
const memory: Record<string, string> = {};
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  addEventListener("storage", cb);
  return () => { listeners.delete(cb); removeEventListener("storage", cb); };
};
const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return memory[key] ?? null; }
};
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { memory[key] = value; }
  listeners.forEach(l => l());
};
const useStored = (key: string) => useSyncExternalStore(subscribe, () => read(key), () => null);

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Saved homes. Signed out: kept in this browser. Signed in: stored on the account (saved_listings table),
 * and anything saved in this browser before signing in is added to the account.
 */
export function useSaved(userId: string | null) {
  const raw = useStored("saved");
  const local = useMemo(() => {
    try { return new Set<string>(raw ? JSON.parse(raw) : []); } catch { return new Set<string>(); }
  }, [raw]);
  const [remote, setRemote] = useState<{ user: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (!userId || !supabaseConfigured) return;
    let alive = true;
    (async () => {
      const db = supabase();
      const { data } = await db.from("saved_listings").select("listing_id");
      const ids = new Set<string>((data ?? []).map(r => r.listing_id as string));
      const extra = [...local].filter(id => isUuid(id) && !ids.has(id));
      if (extra.length) {
        await db.from("saved_listings").upsert(extra.map(listing_id => ({ user_id: userId, listing_id })), { onConflict: "user_id,listing_id", ignoreDuplicates: true });
        extra.forEach(id => ids.add(id));
      }
      if (alive) setRemote({ user: userId, ids });
    })();
    return () => { alive = false; };
    // only when the signed-in account changes; later saves update the list directly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onAccount = !!userId && remote?.user === userId;
  const saved = onAccount ? remote!.ids : local;

  const toggle = useCallback((id: string) => {
    if (userId && supabaseConfigured && isUuid(id)) {
      const had = onAccount && remote!.ids.has(id);
      const flip = (add: boolean) => setRemote(prev => {
        const ids = new Set(prev?.user === userId ? prev.ids : []);
        if (add) ids.add(id); else ids.delete(id);
        return { user: userId, ids };
      });
      flip(!had);   // show the change straight away
      const db = supabase();
      // a Supabase request only runs once something waits for it, hence the .then()
      (had ? db.from("saved_listings").delete().eq("listing_id", id) : db.from("saved_listings").insert({ user_id: userId, listing_id: id }))
        .then(({ error }) => { if (error) { console.error("Could not save:", error.message); flip(had); } });   // put it back if the save failed
      return;
    }
    const next = new Set(local);
    if (next.has(id)) next.delete(id); else next.add(id);
    write("saved", JSON.stringify([...next]));
  }, [userId, onAccount, remote, local]);

  return { saved, toggle };
}

export type ThemePref = "auto" | "light" | "dark";
const subscribeDark = (cb: () => void) => {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** Light / dark / auto. `dark` is the resolved value (the map needs it). */
export function useTheme() {
  const stored = useStored("theme");
  const pref: ThemePref = stored === "light" || stored === "dark" ? stored : "auto";
  const systemDark = useSyncExternalStore(subscribeDark, () => matchMedia("(prefers-color-scheme: dark)").matches, () => false);
  const dark = pref === "dark" || (pref === "auto" && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = pref === "auto" ? "" : pref;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#10141a" : "#ffffff");
  }, [pref, dark]);
  const setPref = useCallback((p: ThemePref) => write("theme", p), []);
  return { pref, setPref, dark };
}

/** A small message that fades after two seconds. */
export function useToast() {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setOn(false), 2000);
    return () => clearTimeout(t);
  }, [on, msg]);
  const toast = useCallback((m: string) => { setMsg(m); setOn(true); }, []);
  return { toast, toastMsg: msg, toastOn: on };
}
