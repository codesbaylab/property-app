"use client";
import { useEffect } from "react";

/** Action buttons that should never fire twice from a double tap: the main buttons, hearts and the admin buttons. Counters, chips and tabs stay instant. */
const ACTION = ".btn, .adm-btn, .hbtn, .round.heart, .reportlink";
const LOCK_MS = 700;

/**
 * Shows a button was pressed and ignores a second tap on it for a moment, so a double tap can't send a request, a message or a payment twice.
 * It sits in front of every click, so individual screens only need their own busy state for the slow actions.
 */
export default function ButtonFeedback() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(ACTION) as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled) return;
      if (Date.now() < Number(el.dataset.lockUntil ?? 0)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      el.dataset.lockUntil = String(Date.now() + LOCK_MS);
      el.classList.add("pressed");
      setTimeout(() => el.classList.remove("pressed"), LOCK_MS);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
