"use client";
/** Chat between a buyer and the person who posted a listing. */
import { useCallback, useEffect, useState } from "react";
import { photoUrl } from "./data";
import { supabase } from "./supabase";

export interface Conversation {
  id: string;
  listingId: string;
  asBuyer: boolean;
  lastMessageAt: string | null;
  address: string;
  price: number;
  mode: "buy" | "rent";
  type: string;
  listingLive: boolean;
  cover: string | null;
  otherName: string;
  otherVerified: boolean;
  last: { body: string; mine: boolean } | null;
  unread: number;
}

export interface Message { id: string; senderId: string; body: string; createdAt: string }

interface ConvRow {
  id: string; listing_id: string; as_buyer: boolean; last_message_at: string | null;
  listing: { address: string; price: number | string; mode: "buy" | "rent"; type: string; status: string; cover: string | null };
  other: { name: string | null; verified: boolean } | null;
  last: { body: string; mine: boolean } | null; unread: number | string;
}

const friendly = (m: string) => {
  if (m.includes("own listing")) return "This is your own listing.";
  if (m.includes("not available")) return "This listing is no longer available.";
  if (m.includes("too fast")) return "You are sending messages too fast. Wait a moment.";
  if (m.includes("cannot send")) return "Your account can't send messages right now.";
  return "Something went wrong. Please try again.";
};

/** Opens (or finds) the chat with a listing's poster. Returns the conversation id or an error message. */
export async function startConversation(listingId: string): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase().rpc("start_conversation", { p_listing: listingId });
  return error ? { error: friendly(error.message) } : { id: data as string };
}

export async function loadConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase().rpc("my_conversations");
  if (error) throw new Error("Could not load your messages.");
  return (data as ConvRow[]).map(r => ({
    id: r.id, listingId: r.listing_id, asBuyer: r.as_buyer, lastMessageAt: r.last_message_at,
    address: r.listing.address, price: Number(r.listing.price), mode: r.listing.mode, type: r.listing.type, listingLive: r.listing.status === "live",
    cover: r.listing.cover ? photoUrl(r.listing.cover) : null, otherName: r.other?.name || "Nestmap user", otherVerified: !!r.other?.verified,
    last: r.last, unread: Number(r.unread),
  }));
}

interface MsgRow { id: string; sender_id: string; body: string; created_at: string }
const toMessage = (r: MsgRow): Message => ({ id: r.id, senderId: r.sender_id, body: r.body, createdAt: r.created_at });

/** The latest 100 messages of a chat, oldest first. */
export async function loadMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase().from("messages").select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Could not load this chat.");
  return (data as MsgRow[]).map(toMessage).reverse();
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<{ message: Message } | { error: string }> {
  const { data, error } = await supabase().from("messages").insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select("id, sender_id, body, created_at").single();
  return error ? { error: friendly(error.message) } : { message: toMessage(data as MsgRow) };
}

export const markRead = (conversationId: string) => supabase().rpc("mark_conversation_read", { p_conversation: conversationId });

/** Calls `onNew` whenever a message arrives for the signed-in person (or, with a conversation id, in that chat). Returns the unsubscribe. */
export function onNewMessage(conversationId: string | null, onNew: (m: Message) => void): () => void {
  const db = supabase();
  const channel = db.channel(`messages:${conversationId ?? "all"}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}) },
      payload => onNew(toMessage(payload.new as MsgRow)))
    .subscribe();
  return () => { db.removeChannel(channel); };
}

/** How many unread messages the signed-in person has, kept up to date as messages arrive. */
export function useUnread(userId: string | null) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    if (!userId) { setCount(0); return; }
    const { data } = await supabase().rpc("my_unread_count");
    setCount(Number(data ?? 0));
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(refresh, 0);
    const off = onNewMessage(null, () => refresh());
    return () => { clearTimeout(t); off(); };
  }, [userId, refresh]);
  return { unread: userId ? count : 0, refreshUnread: refresh };
}
