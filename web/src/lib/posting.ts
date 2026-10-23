/** Everything the "Post a property" flow and "My homes" read from and write to the database. */
import { PT, RES, type Mode, type PType } from "./listing";
import { photoUrl } from "./data";
import { supabase } from "./supabase";

export type Status = "draft" | "pending" | "live" | "rejected" | "sold_or_rented" | "expired" | "hidden";

export const DB_TYPE: Record<PType, string> = {
  Apartment: "apartment", House: "house", Villa: "villa", Plot: "plot", Commercial: "commercial", "PG / Hostel": "pg_hostel",
};
const LABEL = Object.fromEntries(Object.entries(DB_TYPE).map(([label, db]) => [db, label as PType])) as Record<string, PType>;

export const FURNISHING = ["Unfurnished", "Semi-furnished", "Furnished"] as const;
export const FACING = ["East", "West", "North", "South"] as const;
export const AMENITIES = ["Covered parking", "Lift", "Gym", "Garden", "24h security", "Power backup", "Swimming pool", "Balcony", "Wi-Fi", "Near school", "Near bus stop"];

export const MAX_PHOTOS = 8;
export const MIN_PHOTOS_TO_SUBMIT = 1;

export interface MyPhoto { id: string; path: string; url: string }

export interface MyListing {
  id: string;
  status: Status;
  rejectReason: string | null;
  mode: Mode;
  type: PType;
  price: number;
  deposit: number | null;
  beds: number;
  baths: number;
  areaSqft: number | null;
  floor: number | null;
  facing: string;
  furnishing: string;
  description: string;
  address: string;
  locality: string;
  amenities: string[];
  lat: number;
  lng: number;
  photos: MyPhoto[];
}

interface Row {
  id: string; status: Status; reject_reason: string | null; mode: Mode; type: string; price: number | string; deposit: number | string | null;
  beds: number; baths: number; area_sqft: number | null; floor: number | null; facing: string | null; furnishing: string | null;
  description: string | null; address: string; locality: string | null; amenities: string[] | null; lat: number; lng: number;
  photos: { id: string; path: string }[];
}

const toListing = (r: Row): MyListing => ({
  id: r.id, status: r.status, rejectReason: r.reject_reason, mode: r.mode, type: LABEL[r.type] ?? "Apartment",
  price: Number(r.price), deposit: r.deposit == null ? null : Number(r.deposit), beds: r.beds, baths: r.baths, areaSqft: r.area_sqft,
  floor: r.floor, facing: r.facing ?? "", furnishing: r.furnishing ?? "", description: r.description ?? "", address: r.address,
  locality: r.locality ?? "", amenities: r.amenities ?? [], lat: r.lat, lng: r.lng,
  photos: r.photos.map(p => ({ id: p.id, path: p.path, url: photoUrl(p.path) })),
});

export async function loadMine(): Promise<MyListing[]> {
  const { data, error } = await supabase().rpc("my_listings");
  if (error) throw new Error("Could not load your listings.");
  return (data as Row[]).map(toListing);
}

/** What the form edits. Numbers are kept as text while typing. */
export interface Form {
  mode: Mode; type: PType; price: string; deposit: string; beds: number; baths: number; areaSqft: string; floor: string;
  facing: string; furnishing: string; description: string; address: string; locality: string; amenities: string[];
  pin: { lat: number; lng: number } | null;
}

export const emptyForm = (): Form => ({
  mode: "rent", type: "Apartment", price: "", deposit: "", beds: 2, baths: 2, areaSqft: "", floor: "", facing: "", furnishing: "",
  description: "", address: "", locality: "", amenities: [], pin: null,
});

export const formOf = (l: MyListing): Form => ({
  mode: l.mode, type: l.type, price: String(l.price), deposit: l.deposit == null ? "" : String(l.deposit), beds: l.beds, baths: l.baths,
  areaSqft: l.areaSqft == null ? "" : String(l.areaSqft), floor: l.floor == null ? "" : String(l.floor), facing: l.facing,
  furnishing: l.furnishing, description: l.description, address: l.address, locality: l.locality, amenities: l.amenities, pin: { lat: l.lat, lng: l.lng },
});

/** Property types that can be listed for the chosen mode. */
export const typesFor = (mode: Mode) => PT.filter(t => t.m.includes(mode)).map(t => t.k);
export const hasRooms = (t: PType) => RES.includes(t);

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));

/** A message for the first thing wrong with the form, or null. `forReview` is stricter than saving a draft. */
export function problemWith(f: Form, photoCount: number, forReview: boolean): string | null {
  const price = num(f.price);
  if (price == null || !(price > 0)) return "Enter the " + (f.mode === "rent" ? "monthly rent." : "price.");
  if (!f.address.trim()) return "Enter the address.";
  if (!f.pin) return "Drop a pin on the map so people find the exact spot.";
  const area = num(f.areaSqft);
  if (area != null && !(area > 0)) return "Size must be more than zero.";
  if (!forReview) return null;
  if (photoCount < MIN_PHOTOS_TO_SUBMIT) return "Add at least one photo.";
  if (f.description.trim().length < 20) return "Write a short description (at least 20 characters).";
  return null;
}

/** Creates (as a draft) or updates a listing and returns its id. Sending it for review is a separate step: setStatus. Throws an Error with a message fit to show. */
export async function saveListing(userId: string, existingId: string | null, f: Form): Promise<string> {
  const rooms = hasRooms(f.type);
  const fields = {
    mode: f.mode, type: DB_TYPE[f.type], price: num(f.price), deposit: f.mode === "rent" ? num(f.deposit) : null,
    beds: rooms ? f.beds : 0, baths: rooms ? f.baths : 0, area_sqft: num(f.areaSqft), floor: num(f.floor),
    facing: f.facing || null, furnishing: f.furnishing || null, description: f.description.trim() || null,
    address: f.address.trim(), locality: f.locality.trim() || null, amenities: f.amenities,
    location: `SRID=4326;POINT(${f.pin!.lng} ${f.pin!.lat})`,
  };
  const db = supabase();
  if (existingId) {
    const { error } = await db.from("listings").update(fields).eq("id", existingId);
    if (error) throw new Error(friendly(error.message));
    return existingId;
  }
  const { data, error } = await db.from("listings").insert({ ...fields, owner_id: userId, status: "draft" }).select("id").single();
  if (error) throw new Error(friendly(error.message));
  return data.id as string;
}

function friendly(m: string): string {
  if (m.includes("up to 3 listings")) return "Free accounts can have up to 3 listings. Delete one or mark it sold or rented to add another.";
  if (m.includes("cannot move")) return "This listing can't be changed in its current state.";
  return "Could not save the listing. Please try again.";
}

/** Moves a listing to the next stage the owner is allowed to. */
export async function setStatus(id: string, status: Status): Promise<string | null> {
  const { error } = await supabase().from("listings").update({ status }).eq("id", id);
  return error ? friendly(error.message) : null;
}

export async function deleteListing(l: MyListing): Promise<string | null> {
  const db = supabase();
  const { error } = await db.from("listings").delete().eq("id", l.id);
  if (error) return "Could not delete the listing.";
  const own = l.photos.filter(p => !/^https?:\/\//.test(p.path)).map(p => p.path);
  if (own.length) await db.storage.from("listing-photos").remove(own);
  return null;
}

/** Shrinks a photo to at most 1600px on the long side and re-encodes it as JPEG, so phone photos upload quickly. */
async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale), height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not read that photo.");
  return { blob, width, height };
}

/** Uploads photos for a listing and records them after the ones it already has. Returns a message if any failed, else null. */
export async function addPhotos(userId: string, listingId: string, files: File[], startAt: number): Promise<string | null> {
  const db = supabase();
  let failed = 0;
  for (const [i, file] of files.entries()) {
    try {
      const { blob, width, height } = await shrink(file);
      const path = `${userId}/${listingId}/${crypto.randomUUID()}.jpg`;
      const up = await db.storage.from("listing-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const row = await db.from("listing_photos").insert({ listing_id: listingId, path, sort_order: startAt + i, width, height });
      if (row.error) { await db.storage.from("listing-photos").remove([path]); throw row.error; }
    } catch { failed++; }
  }
  return failed ? `${failed} ${failed === 1 ? "photo" : "photos"} could not be uploaded.` : null;
}

export async function removePhoto(p: MyPhoto): Promise<void> {
  const db = supabase();
  await db.from("listing_photos").delete().eq("id", p.id);
  if (!/^https?:\/\//.test(p.path)) await db.storage.from("listing-photos").remove([p.path]);
}
