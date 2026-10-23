/** Typed calls to the admin functions in the database. Each one checks the caller's role on the server side. */
import { supabase } from "./supabase";

export interface Paged<T> { total: number; rows: T[] }

export interface Stats {
  listings: Record<string, number>;
  users: number; agents_verified: number; agents_pending: number; suspended: number; open_reports: number; saved: number;
  live_by_type: Record<string, number>;
  daily: { day: string; n: number }[];
}

export interface AdminListing {
  id: string; address: string; locality: string | null; type: string; mode: "buy" | "rent"; price: number; status: string; is_verified: boolean;
  created_at: string; owner_id: string; owner_name: string | null; owner_email: string | null; posted_as: string; reject_reason: string | null;
  photos: number; cover: string | null; open_reports: number;
}

export interface ListingDetail {
  id: string; status: string; mode: "buy" | "rent"; type: string; price: number; deposit: number | null; maintenance: number | null;
  beds: number; baths: number; area_sqft: number | null; floor: number | null; facing: string | null; furnishing: string | null;
  address: string; locality: string | null; city: string | null; description: string | null; amenities: string[] | null;
  lat: number; lng: number; is_verified: boolean; reject_reason: string | null; created_at: string; expires_at: string | null; posted_as: string; source: string;
  photos: string[];
  owner: { id: string; name: string | null; email: string | null; phone: string | null; agent_status: string; account_status: string; listings: number } | null;
  flags: { level: "ok" | "warn"; text: string }[];
  reports: { id: string; reason: string; details: string | null; status: string; created_at: string }[];
  history: { action: string; actor_name: string | null; details: Record<string, unknown>; created_at: string }[];
}

export interface AdminUser {
  id: string; name: string | null; email: string | null; phone: string | null; city: string | null;
  account_status: "active" | "suspended" | "banned"; agent_status: "none" | "pending" | "verified" | "rejected";
  admin_role: "super_admin" | "moderator" | "support" | null; listings: number; open_reports: number; created_at: string; last_sign_in_at: string | null;
}

export interface ReportRow {
  id: string; target_type: "listing" | "user"; target_id: string; reason: string; details: string | null; status: "open" | "resolved" | "dismissed";
  resolution: string | null; created_at: string; handled_at: string | null; reporter: string | null; target_label: string | null; target_status: string | null; same_target: number;
}

export interface TeamMember { user_id: string; role: "super_admin" | "moderator" | "support"; name: string | null; email: string | null; last_sign_in_at: string | null; created_at: string }
export interface AuditRow { id: number; action: string; actor_name: string | null; target_type: string; target_id: string | null; details: Record<string, unknown>; created_at: string }

export interface AgentApplicationInfo { agency: string; licence_no: string | null; city: string; phone: string; rejection_reason: string | null; submitted_at: string; docs: { name: string; url: string }[] }

/** An agent's application with short-lived links to the documents they uploaded. */
async function agentApplication(userId: string): Promise<AgentApplicationInfo | null> {
  const db = supabase();
  const { data, error } = await db.from("agent_applications").select("agency, licence_no, city, phone, rejection_reason, submitted_at, docs").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const docs = await Promise.all((data.docs as string[]).map(async (path, i) => {
    const { data: signed } = await db.storage.from("agent-docs").createSignedUrl(path, 600);
    return { name: `Document ${i + 1} (${path.split(".").pop()?.toUpperCase()})`, url: signed?.signedUrl ?? "" };
  }));
  return { ...data, docs } as AgentApplicationInfo;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const PAGE = 25;

export const adminApi = {
  stats: () => rpc<Stats>("admin_stats"),
  listings: (a: { status?: string; search?: string; mode?: string; type?: string; page?: number }) =>
    rpc<Paged<AdminListing>>("admin_listings", { p_status: a.status || null, p_search: a.search || null, p_mode: a.mode || null, p_type: a.type || null, p_limit: PAGE, p_offset: (a.page ?? 0) * PAGE }),
  listing: (id: string) => rpc<ListingDetail | null>("admin_listing_detail", { p_id: id }),
  review: (id: string, action: "approve" | "reject" | "request_changes" | "unpublish", reason?: string) =>
    rpc<{ ok: true }>("admin_review_listing", { p_id: id, p_action: action, p_reason: reason ?? null }),
  agentApplication,
  users: (a: { search?: string; filter?: string; page?: number }) =>
    rpc<Paged<AdminUser>>("admin_users", { p_search: a.search || null, p_filter: a.filter || "all", p_limit: PAGE, p_offset: (a.page ?? 0) * PAGE }),
  setUser: (id: string, change: { account?: string; agent?: string; reason?: string }) =>
    rpc<{ ok: true; listings_hidden: number }>("admin_set_user_status", { p_user: id, p_account: change.account ?? null, p_agent: change.agent ?? null, p_reason: change.reason ?? null }),
  reports: (status: string | null, page = 0) => rpc<Paged<ReportRow>>("admin_reports", { p_status: status, p_limit: PAGE, p_offset: page * PAGE }),
  handleReport: (id: string, outcome: "dismiss" | "hide_listing" | "suspend_user" | "resolve", note?: string) =>
    rpc<{ ok: true }>("admin_handle_report", { p_id: id, p_outcome: outcome, p_note: note ?? null }),
  team: () => rpc<TeamMember[]>("admin_team"),
  setRole: (email: string, role: "super_admin" | "moderator" | "support" | "none") => rpc<{ ok: true }>("admin_set_role", { p_email: email, p_role: role }),
  audit: (page = 0) => rpc<Paged<AuditRow>>("admin_audit", { p_limit: 50, p_offset: page * 50 }),
};
