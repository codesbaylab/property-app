"use client";
/** Bulk import: an agent uploads a spreadsheet (CSV), every row is checked, and the homes are added as drafts to finish with photos. */
import { DB_TYPE, FACING, FURNISHING } from "./posting";
import { hasRooms } from "./posting";
import { supabase } from "./supabase";
import type { Mode, PType } from "./listing";

export const MAX_IMPORT_ROWS = 100;

export const TEMPLATE = [
  "mode,type,price,address,locality,latitude,longitude,bedrooms,bathrooms,area_sqft,floor,deposit,furnishing,facing,description",
  "rent,Apartment,18000,\"Flat 4B, Lake View Apartments\",Mavoor Road,11.2588,75.7804,2,2,1100,4,50000,Semi-furnished,East,\"Bright 2 bedroom flat close to the bus stop, covered parking.\"",
  "sale,Plot,2500000,Near Government School,Feroke,11.1780,75.8310,,,2400,,,,,\"10 cent plot with clear title and road access.\"",
].join("\n");

export interface ImportRow {
  mode: Mode; type: PType; price: number; address: string; locality: string | null; lat: number; lng: number;
  beds: number; baths: number; areaSqft: number | null; floor: number | null; deposit: number | null;
  furnishing: string | null; facing: string | null; description: string | null;
}

export interface Checked { rows: ImportRow[]; problems: string[] }

/** Splits CSV text into rows of cells. Handles quoted cells with commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === "\"") { if (src[i + 1] === "\"") { cell += "\""; i++; } else quoted = false; } else cell += c;
    } else if (c === "\"") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); cell = ""; out.push(row); row = []; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out.filter(r => r.some(x => x.trim() !== ""));
}

const TYPES: Record<string, PType> = {
  apartment: "Apartment", flat: "Apartment", house: "House", villa: "Villa", plot: "Plot", land: "Plot",
  commercial: "Commercial", shop: "Commercial", office: "Commercial", pg: "PG / Hostel", hostel: "PG / Hostel", "pg / hostel": "PG / Hostel", "pg/hostel": "PG / Hostel",
};
const pickFrom = (list: readonly string[], v: string) => list.find(x => x.toLowerCase() === v.trim().toLowerCase()) ?? null;

/** Checks a parsed spreadsheet. `problems` is empty only when every row is good. */
export function checkRows(table: string[][]): Checked {
  const problems: string[] = [];
  if (table.length < 2) return { rows: [], problems: ["The file has no homes in it. Use the template and add one home per row."] };
  const head = table[0].map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (name: string, ...alts: string[]) => [name, ...alts].map(n => head.indexOf(n)).find(i => i >= 0) ?? -1;
  const idx = {
    mode: col("mode"), type: col("type"), price: col("price"), address: col("address"), locality: col("locality", "area"),
    lat: col("latitude", "lat"), lng: col("longitude", "lng", "lon"), beds: col("bedrooms", "beds"), baths: col("bathrooms", "baths"),
    area: col("area_sqft", "size_sqft", "sqft"), floor: col("floor"), deposit: col("deposit"), furnishing: col("furnishing"), facing: col("facing"), description: col("description"),
  };
  const missing = (["mode", "type", "price", "address", "lat", "lng"] as const).filter(k => idx[k] < 0).map(k => ({ lat: "latitude", lng: "longitude" } as Record<string, string>)[k] ?? k);
  if (missing.length) return { rows: [], problems: [`The file is missing these columns: ${missing.join(", ")}. Use the template for the right headings.`] };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { rows: [], problems: [`Import up to ${MAX_IMPORT_ROWS} homes at a time. This file has ${table.length - 1}.`] };

  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, n) => {
    const at = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const bad = (m: string) => problems.push(`Row ${n + 2}: ${m}`);
    const int = (v: string) => (v === "" ? null : /^\d+$/.test(v.replace(/[,\s]/g, "")) ? Number(v.replace(/[,\s]/g, "")) : NaN);
    const modeRaw = at(idx.mode).toLowerCase();
    const mode: Mode | null = modeRaw === "rent" ? "rent" : modeRaw === "sale" || modeRaw === "buy" || modeRaw === "sell" ? "buy" : null;
    const type = TYPES[at(idx.type).toLowerCase()] ?? null;
    const price = int(at(idx.price)), lat = Number(at(idx.lat)), lng = Number(at(idx.lng));
    const beds = int(at(idx.beds)), baths = int(at(idx.baths)), area = int(at(idx.area)), floor = int(at(idx.floor)), deposit = int(at(idx.deposit));
    const furnishing = at(idx.furnishing) ? pickFrom(FURNISHING, at(idx.furnishing)) : null, facing = at(idx.facing) ? pickFrom(FACING, at(idx.facing)) : null;
    const before = problems.length;
    if (!mode) bad("mode must be rent or sale.");
    if (!type) bad(`type "${at(idx.type)}" is not one of Apartment, House, Villa, Plot, Commercial, PG / Hostel.`);
    if (mode && type && mode === "buy" && type === "PG / Hostel") bad("PG / Hostel can only be for rent.");
    if (mode && type && mode === "rent" && type === "Plot") bad("Plot can only be for sale.");
    if (price === null || Number.isNaN(price) || price <= 0) bad("price must be a number above zero.");
    if (at(idx.address).length < 3) bad("address is required.");
    if (!(lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98) || at(idx.lat) === "" || at(idx.lng) === "") bad("latitude and longitude must be a real place in India (for example 11.2588 and 75.7804).");
    for (const [label, v] of [["bedrooms", beds], ["bathrooms", baths], ["area_sqft", area], ["floor", floor], ["deposit", deposit]] as const) if (v !== null && Number.isNaN(v)) bad(`${label} must be a whole number.`);
    if (at(idx.furnishing) && !furnishing) bad(`furnishing must be one of ${FURNISHING.join(", ")}.`);
    if (at(idx.facing) && !facing) bad(`facing must be one of ${FACING.join(", ")}.`);
    if (problems.length === before && mode && type && price) {
      const rooms = hasRooms(type);
      rows.push({
        mode, type, price, address: at(idx.address).slice(0, 200), locality: at(idx.locality).slice(0, 80) || null, lat, lng,
        beds: rooms ? Math.min(beds ?? 0, 20) : 0, baths: rooms ? Math.min(baths ?? 0, 20) : 0, areaSqft: area && area > 0 ? area : null, floor: floor ?? null,
        deposit: mode === "rent" ? deposit : null, furnishing, facing, description: at(idx.description).slice(0, 1500) || null,
      });
    }
  });
  return { rows: problems.length ? [] : rows, problems };
}

/** Adds every row as a draft in one go (all or nothing). Returns an error message or null. */
export async function importRows(userId: string, rows: ImportRow[]): Promise<string | null> {
  const { error } = await supabase().from("listings").insert(rows.map(r => ({
    owner_id: userId, status: "draft", source: "import", mode: r.mode, type: DB_TYPE[r.type], price: r.price, deposit: r.deposit, beds: r.beds, baths: r.baths,
    area_sqft: r.areaSqft, floor: r.floor, furnishing: r.furnishing, facing: r.facing, description: r.description, address: r.address, locality: r.locality,
    location: `SRID=4326;POINT(${r.lng} ${r.lat})`,
  })));
  if (!error) return null;
  if (error.message.includes("Only verified agents")) return "Bulk import is for verified agents.";
  if (error.message.includes("up to 3 listings")) return "Free accounts can have up to 3 listings. Bulk import is for verified agents.";
  return "Could not import the homes. Nothing was added. Please try again.";
}
