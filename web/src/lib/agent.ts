"use client";
/** Applying to become a verified agent. Documents go to a private bucket that only the applicant and the team can open. */
import { supabase } from "./supabase";

export interface Application { agency: string; licenceNo: string; city: string; phone: string; rejectionReason: string | null; submittedAt: Date }

export interface ApplicationForm { agency: string; licenceNo: string; city: string; phone: string }

export const MAX_DOCS = 3;
const MAX_DOC_BYTES = 8 * 1024 * 1024;
const DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function loadApplication(userId: string): Promise<Application | null> {
  const { data, error } = await supabase().from("agent_applications").select("agency, licence_no, city, phone, rejection_reason, submitted_at").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Could not load your application.");
  return data ? { agency: data.agency, licenceNo: data.licence_no ?? "", city: data.city, phone: data.phone, rejectionReason: data.rejection_reason, submittedAt: new Date(data.submitted_at) } : null;
}

export function problemWithApplication(f: ApplicationForm, files: File[]): string | null {
  if (f.agency.trim().length < 2) return "Enter your agency or business name.";
  if (f.city.trim().length < 2) return "Enter the city you work in.";
  if (!/^[0-9+() -]{7,20}$/.test(f.phone.trim())) return "Enter a phone number the team can reach you on.";
  if (files.length < 1) return "Add a photo or PDF of your agent licence or ID.";
  if (files.length > MAX_DOCS) return `You can add up to ${MAX_DOCS} documents.`;
  if (files.some(x => !DOC_TYPES.includes(x.type))) return "Documents must be photos (JPG, PNG, WebP) or PDF files.";
  if (files.some(x => x.size > MAX_DOC_BYTES)) return "Each document must be 8 MB or smaller.";
  return null;
}

/** Uploads the documents and sends the application. Returns an error message or null. */
export async function applyAgent(userId: string, f: ApplicationForm, files: File[]): Promise<string | null> {
  const problem = problemWithApplication(f, files);
  if (problem) return problem;
  const db = supabase();
  const paths: string[] = [];
  try {
    for (const file of files) {
      const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const up = await db.storage.from("agent-docs").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      paths.push(path);
    }
    const { error } = await db.rpc("apply_agent", { p_agency: f.agency, p_licence: f.licenceNo, p_city: f.city, p_phone: f.phone, p_docs: paths });
    if (error) throw error;
    return null;
  } catch (e) {
    if (paths.length) await db.storage.from("agent-docs").remove(paths);
    const m = (e as Error).message ?? "";
    if (m.includes("already applied")) return "You have already applied. We'll let you know once the team has looked.";
    if (m.includes("cannot apply")) return "Your account can't apply right now.";
    return "Could not send your application. Please try again.";
  }
}
