"use client";
/** Visit requests: a buyer asks to see a home at a time; the lister accepts, declines or suggests another time. */
import { useCallback, useEffect, useState } from "react";
import { photoUrl } from "./data";
import { supabase } from "./supabase";

export type VisitStatus = "requested" | "proposed" | "confirmed" | "declined" | "cancelled";

export interface Visit {
  id: string;
  listingId: string;
  at: Date;
  status: VisitStatus;
  note: string;
  asBuyer: boolean;
  address: string;
  price: number;
  mode: "buy" | "rent";
  type: string;
  cover: string | null;
  otherName: string;
}

interface VisitRow {
  id: string; listing_id: string; visit_at: string; status: VisitStatus; note: string | null; as_buyer: boolean;
  listing: { address: string; price: number | string; mode: "buy" | "rent"; type: string; cover: string | null };
  other: { name: string | null } | null;
}

const TYPE: Record<string, string> = { apartment: "Apartment", house: "House", villa: "Villa", plot: "Plot", commercial: "Commercial", pg_hostel: "PG / Hostel" };

const friendly = (m: string) => {
  if (m.includes("own listing")) return "This is your own listing.";
  if (m.includes("not available")) return "This listing is no longer available.";
  if (m.includes("at least an hour")) return "Pick a time at least an hour from now.";
  if (m.includes("within the next 30")) return "Pick a time within the next 30 days.";
  if (m.includes("already have a visit")) return "You already have a visit for this home. Find it under Visits.";
  if (m.includes("too many open")) return "You have too many open requests. Wait for replies first.";
  if (m.includes("cannot request")) return "Your account can't request visits right now.";
  if (m.includes("already closed")) return "This visit is already closed.";
  if (m.includes("not possible")) return "That is no longer possible. Refresh and try again.";
  return "Something went wrong. Please try again.";
};

export async function requestVisit(listingId: string, at: Date, note: string): Promise<string | null> {
  const { error } = await supabase().rpc("request_visit", { p_listing: listingId, p_at: at.toISOString(), p_note: note.trim() || null });
  return error ? friendly(error.message) : null;
}

export type VisitAction = "accept" | "decline" | "propose" | "cancel";

export async function respondVisit(id: string, action: VisitAction, at?: Date): Promise<string | null> {
  const { error } = await supabase().rpc("respond_visit", { p_visit: id, p_action: action, p_at: at ? at.toISOString() : null });
  return error ? friendly(error.message) : null;
}

export async function loadVisits(): Promise<Visit[]> {
  const { data, error } = await supabase().rpc("my_visits");
  if (error) throw new Error("Could not load your visits.");
  return (data as VisitRow[]).map(r => ({
    id: r.id, listingId: r.listing_id, at: new Date(r.visit_at), status: r.status, note: r.note ?? "", asBuyer: r.as_buyer,
    address: r.listing.address, price: Number(r.listing.price), mode: r.listing.mode, type: TYPE[r.listing.type] ?? r.listing.type,
    cover: r.listing.cover ? photoUrl(r.listing.cover) : null, otherName: r.other?.name || "Nestmap user",
  }));
}

/** How many visits are waiting on the signed-in person (requests to answer, times to confirm). */
export function useVisitTodo(userId: string | null) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    if (!userId) { setCount(0); return; }
    const { data } = await supabase().rpc("my_visit_todo");
    setCount(Number(data ?? 0));
  }, [userId]);
  useEffect(() => { const t = setTimeout(refresh, 0); return () => clearTimeout(t); }, [refresh]);
  return { todo: userId ? count : 0, refreshTodo: refresh };
}
