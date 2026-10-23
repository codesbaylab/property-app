/**
 * The only place the app reads listings from.
 * With Supabase keys set it reads from the database; without them it uses the built-in sample data.
 */
import type { Bounds, Listing, Mode, PType } from "./listing";
import { generateListing, listingsForBounds as sampleListings } from "./sample";
import { supabase, supabaseConfigured, supabaseUrl } from "./supabase";

export const usingDatabase = supabaseConfigured;

export interface Query { mode: Mode; type: PType | null; maxPrice: number | null; beds: number }

const DB_TYPE: Record<PType, string> = {
  Apartment: "apartment", House: "house", Villa: "villa", Plot: "plot", Commercial: "commercial", "PG / Hostel": "pg_hostel",
};
const LABEL = Object.fromEntries(Object.entries(DB_TYPE).map(([label, db]) => [db, label as PType])) as Record<string, PType>;

export const isSampleId = (id: string) => /^c-?\d+_-?\d+_\d+$/.test(id);

/** Photos are stored either as full links (seed data) or as a path inside the listing-photos storage bucket. */
const photoUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${supabaseUrl}/storage/v1/object/public/listing-photos/${path}`);

/** A stable number from the id, used to vary generated wording. */
const hashOf = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 1000; };

interface PinRow {
  id: string; lat: number; lng: number; mode: Mode; price: number | string; type: string;
  beds: number; baths: number; area_sqft: number | null; address: string; cover_path: string | null;
}
const priced = (mode: Mode, price: number | string) => ({ buy: mode === "buy" ? Number(price) : 0, rent: mode === "rent" ? Number(price) : 0 });

function fromPin(r: PinRow): Listing {
  return {
    id: r.id, n: hashOf(r.id), lat: r.lat, lng: r.lng, type: LABEL[r.type] ?? "Apartment",
    beds: r.beds, baths: r.baths, sqft: r.area_sqft ?? 0, ...priced(r.mode, r.price),
    addr: r.address, img: r.cover_path ? photoUrl(r.cover_path) : `https://picsum.photos/seed/${r.id}/600/450`,
  };
}

/** Listings for the part of the map on screen. `onBatch` may be called more than once. */
export async function loadListings(view: Bounds, q: Query, onBatch: (ls: Listing[]) => void): Promise<void> {
  if (!usingDatabase) return sampleListings(view, onBatch);
  // ask for a little more than is visible so small pans don't need a new request
  const padX = (view.east - view.west) * 0.25, padY = (view.north - view.south) * 0.25;
  const { data, error } = await supabase().rpc("listings_in_bounds", {
    p_west: view.west - padX, p_south: view.south - padY, p_east: view.east + padX, p_north: view.north + padY,
    p_mode: q.mode, p_type: q.type ? DB_TYPE[q.type] : null, p_max_price: q.maxPrice, p_min_beds: q.beds,
  });
  if (error) { console.error("Could not load listings:", error.message); return; }
  onBatch((data as PinRow[]).map(fromPin));
}

interface DetailRow extends Omit<PinRow, "cover_path"> {
  locality: string | null; city: string | null; description: string | null; amenities: string[] | null;
  floor: number | null; facing: string | null; is_verified: boolean; photos: string[];
  agent: { name: string | null; verified: boolean } | null;
}

/** One listing with everything the property page needs. Works on the server and in the browser. */
export async function getListing(id: string): Promise<Listing | null> {
  if (isSampleId(id)) return generateListing(id);
  if (!usingDatabase || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase().rpc("listing_detail", { p_id: id });
  if (error || !data) return null;
  const r = data as DetailRow;
  const photos = r.photos.map(photoUrl);
  return {
    id: r.id, n: hashOf(r.id), lat: r.lat, lng: r.lng, type: LABEL[r.type] ?? "Apartment",
    beds: r.beds, baths: r.baths, sqft: r.area_sqft ?? 0, ...priced(r.mode, r.price),
    addr: [r.address, r.locality].filter(Boolean).join(", "), img: photos[0] ?? `https://picsum.photos/seed/${r.id}/600/450`,
    full: true, description: r.description ?? undefined, amenities: r.amenities ?? undefined, photos: photos.length ? photos : undefined,
    facing: r.facing ?? undefined, floor: r.floor ?? undefined,
    agent: r.agent?.name ? { name: r.agent.name, verified: r.agent.verified } : undefined,
  };
}
