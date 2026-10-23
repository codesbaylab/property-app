"use client";
/** Leads: people who messaged about your homes, each with a stage. A lead is a chat seen from the seller side. */
import { photoUrl } from "./data";
import { supabase } from "./supabase";

export type Stage = "new" | "contacted" | "viewing" | "closed";
export const STAGES: { k: Stage; label: string }[] = [
  { k: "new", label: "New" }, { k: "contacted", label: "Contacted" }, { k: "viewing", label: "Viewing" }, { k: "closed", label: "Closed" },
];

export interface Lead {
  id: string;
  listingId: string;
  stage: Stage;
  lastMessageAt: string | null;
  buyerName: string;
  address: string;
  price: number;
  mode: "buy" | "rent";
  type: string;
  cover: string | null;
  last: { body: string; mine: boolean } | null;
  unread: number;
  visit: "requested" | "proposed" | "confirmed" | null;
}

interface LeadRow {
  id: string; listing_id: string; stage: Stage; last_message_at: string | null;
  listing: { address: string; price: number | string; mode: "buy" | "rent"; type: string; cover: string | null };
  buyer: { name: string | null } | null; last: { body: string; mine: boolean } | null; unread: number | string; visit: Lead["visit"];
}

const TYPE: Record<string, string> = { apartment: "Apartment", house: "House", villa: "Villa", plot: "Plot", commercial: "Commercial", pg_hostel: "PG / Hostel" };

export async function loadLeads(): Promise<Lead[]> {
  const { data, error } = await supabase().rpc("my_leads");
  if (error) throw new Error("Could not load your leads.");
  return (data as LeadRow[]).map(r => ({
    id: r.id, listingId: r.listing_id, stage: r.stage, lastMessageAt: r.last_message_at, buyerName: r.buyer?.name || "Nestmap user",
    address: r.listing.address, price: Number(r.listing.price), mode: r.listing.mode, type: TYPE[r.listing.type] ?? r.listing.type,
    cover: r.listing.cover ? photoUrl(r.listing.cover) : null, last: r.last, unread: Number(r.unread), visit: r.visit,
  }));
}

export async function setLeadStage(id: string, stage: Stage): Promise<string | null> {
  const { error } = await supabase().rpc("set_lead_stage", { p_conversation: id, p_stage: stage });
  return error ? "Could not move this lead. Please try again." : null;
}
