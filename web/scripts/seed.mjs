// Fills the database with sample listings so the map is not empty while you build.
//   npm run seed [count]      default 360, around Kozhikode (uses scripts/data/buildings.json)
// Safe to run again: it replaces earlier seed listings (source = 'seed') and leaves everything else alone.
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in web/.env.local. The secret key never goes in the browser or in chat.
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in web/.env.local (see docs/database-setup.md)."); process.exit(1); }
const dataFile = new URL("./data/buildings.json", import.meta.url);
if (!existsSync(dataFile)) { console.error("Run `npm run seed:buildings` first, so listings can be placed on real buildings."); process.exit(1); }

const COUNT = Number(process.argv[2] ?? 360);
const buildings = JSON.parse(readFileSync(dataFile, "utf8"));
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

// small repeatable random generator, so the same seed gives the same listings
let state = 20261022;
const rnd = () => { state |= 0; state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const roundTo = (n, step) => Math.round(n / step) * step;

const AGENTS = ["Anil Kumar", "Fathima R.", "Suresh Nair", "Meera Das"];
const STREETS = ["Marina Rd", "Lake View St", "Park Ave", "Temple St", "Garden Lane", "Beach Rd", "Main St", "Hill Rd", "Canal Rd", "Rose Ave"];
const AREAS = ["Palayam", "Mavoor Road", "Beach Road", "West Hill", "Nadakkave", "Medical College", "Feroke", "Thondayad", "Kallai", "Puthiyara", "Eranhipalam", "Pantheerankavu"];
const AMEN = ["Covered parking", "Lift", "Gym", "Garden", "24h security", "Power backup", "Swimming pool", "Balcony", "Near school", "Near bus stop"];
const AMEN_BY = { plot: ["Clear title", "Road access", "Water connection", "Near highway", "Gated layout"], commercial: ["Main road", "Parking", "Power backup", "Lift", "24h access"], pg_hostel: ["Wi-Fi", "Laundry", "24h security", "Housekeeping", "Near bus stop"] };
const DIRS = ["East", "West", "North", "South"];
const FURN = ["Unfurnished", "Semi-furnished", "Fully furnished"];

// --- people: four verified agents who post the sample listings
const owners = [];
const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });
for (const name of AGENTS) {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@seed.nestmap.invalid`;
  let user = existing?.users.find(u => u.email === email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name } });
    if (error) { console.error("Could not create a sample agent:", error.message); process.exit(1); }
    user = data.user;
  }
  const { error } = await db.from("profiles").upsert({ id: user.id, name, city: "Kozhikode", agent_status: "verified" });
  if (error) { console.error("Could not update a profile:", error.message); process.exit(1); }
  owners.push(user.id);
}

// --- listings
const spots = [...buildings].sort(() => rnd() - 0.5);
const rows = [];
for (let i = 0; i < COUNT; i++) {
  const spot = spots[i % spots.length];
  const type = pick(["apartment", "apartment", "apartment", "house", "house", "villa", "plot", "commercial", "pg_hostel"]);
  const mode = type === "plot" ? "buy" : type === "pg_hostel" ? "rent" : rnd() < 0.55 ? "buy" : "rent";
  let beds = between(1, 4), baths = Math.max(1, beds - between(0, 1)), area = 450 + beds * 350 + between(0, 300), price, floor = null, facing = null;
  if (type === "plot") { beds = baths = 0; area = between(1500, 6000); price = Math.min(2e7, Math.max(2e6, roundTo(area * between(900, 2400), 1e5))); facing = pick(DIRS); }
  else if (type === "commercial") { beds = 0; baths = 1; area = between(400, 3000); floor = between(0, 2); price = mode === "buy" ? Math.min(2e7, roundTo(area * between(4000, 9000), 1e5)) : Math.min(1e5, roundTo(area * between(40, 100), 1000)); }
  else if (type === "pg_hostel") { beds = 1; baths = 1; area = between(120, 300); price = roundTo(between(5000, 13000), 500); }
  else { price = mode === "buy" ? roundTo((35 + beds * 28 + rnd() * 60) * 1e5, 1e5) : roundTo((8 + beds * 7 + rnd() * 12) * 1000, 500); floor = type === "apartment" ? between(0, 12) : null; }
  const area_name = pick(AREAS);
  rows.push({
    owner_id: pick(owners), posted_as: "agent", mode, type, price, beds, baths, area_sqft: area, floor, facing,
    furnishing: ["apartment", "house", "villa"].includes(type) ? pick(FURN) : null,
    address: `${between(10, 99)}, ${pick(STREETS)}`, locality: area_name, city: "Kozhikode",
    location: `SRID=4326;POINT(${spot[1]} ${spot[0]})`,
    amenities: AMEN_BY[type] ?? Array.from(new Set(Array.from({ length: 5 }, () => pick(AMEN)))),
    description: type === "plot" ? `A well-shaped ${area} sq ft plot in ${area_name} with clear title and road access, ready for construction.`
      : type === "commercial" ? `A ${area} sq ft commercial space in ${area_name} on a busy road with good footfall and parking nearby.`
      : type === "pg_hostel" ? `A clean, safe room in ${area_name} close to colleges and offices, with Wi-Fi, laundry and 24h security.`
      : `A bright ${beds}-bedroom ${type} in ${area_name}. Open living space, good ventilation and easy access to shops, schools and public transport.`,
    status: "live", is_verified: true, source: "seed", expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
  });
}

const { error: delErr } = await db.from("listings").delete().eq("source", "seed");
if (delErr) { console.error("Could not clear earlier seed listings:", delErr.message); process.exit(1); }

let inserted = 0;
for (let i = 0; i < rows.length; i += 100) {
  const { data, error } = await db.from("listings").insert(rows.slice(i, i + 100)).select("id");
  if (error) { console.error("Insert failed:", error.message); process.exit(1); }
  const photos = data.flatMap(l => [0, 1, 2, 3].map(k => ({ listing_id: l.id, path: `https://picsum.photos/seed/${l.id}-${k}/900/650`, sort_order: k })));
  const { error: pErr } = await db.from("listing_photos").insert(photos);
  if (pErr) { console.error("Photo insert failed:", pErr.message); process.exit(1); }
  inserted += data.length;
}
console.log(`Done: ${inserted} sample listings (${AGENTS.length} agents) around Kozhikode.`);
