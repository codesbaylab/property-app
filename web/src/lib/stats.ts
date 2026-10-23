"use client";
/** How a listing is doing (for its owner), counting views, and renewing a listing before or after it expires. */
import { supabase } from "./supabase";

export interface ListingStats { views: number; views7d: number; enquiries: number; visits: number; saves: number; expiresAt: Date | null }

interface StatsRow { views: number | string; views_7d: number | string; enquiries: number | string; visits: number | string; saves: number | string; expires_at: string | null }

export async function loadStats(): Promise<Record<string, ListingStats>> {
  const { data, error } = await supabase().rpc("my_listing_stats");
  if (error) throw new Error("Could not load your listing numbers.");
  return Object.fromEntries(Object.entries(data as Record<string, StatsRow>).map(([id, r]) => [id, {
    views: Number(r.views), views7d: Number(r.views_7d), enquiries: Number(r.enquiries), visits: Number(r.visits), saves: Number(r.saves),
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
  }]));
}

/** Days until a date, rounded up (0 or less once it has passed). */
export const daysLeft = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 864e5);

export async function renewListing(id: string): Promise<string | null> {
  const { error } = await supabase().rpc("renew_listing", { p_id: id });
  if (!error) return null;
  if (error.message.includes("Too early")) return "It's too early to renew. You can renew in the last 7 days.";
  if (error.message.includes("cannot be renewed")) return "This listing can't be renewed. Send it for review instead.";
  return "Something went wrong. Please try again.";
}

const seen = new Set<string>();
/** Counts one view of a listing, once per browser session. */
export function recordView(listingId: string) {
  if (seen.has(listingId)) return;
  seen.add(listingId);
  void Promise.resolve(supabase().rpc("record_view", { p_listing: listingId })).catch(() => {});
}
