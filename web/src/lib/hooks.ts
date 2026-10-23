"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

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

/** Saved homes, kept in this browser for now. Moves to the database once accounts exist. */
export function useSaved() {
  const raw = useStored("saved");
  const saved = useMemo(() => {
    try { return new Set<string>(raw ? JSON.parse(raw) : []); } catch { return new Set<string>(); }
  }, [raw]);
  const toggle = useCallback((id: string) => {
    const next = new Set(saved);
    if (next.has(id)) next.delete(id); else next.add(id);
    write("saved", JSON.stringify([...next]));
  }, [saved]);
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
