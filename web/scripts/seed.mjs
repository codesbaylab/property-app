// Fills the database with sample listings so the map is not empty while you build.
//   npm run seed [count]      default 360, around Kozhikode (uses scripts/data/buildings.json)
// Safe to run again: it replaces earlier seed listings (source = 'seed') and leaves everything else alone.
// Uses DATABASE_URL (and SUPABASE_DB_PASSWORD) from web/.env.local, so no separate secret key is needed.
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", process.env.SUPABASE_DB_PASSWORD ?? "");
if (!url || url.includes("[YOUR-PASSWORD]")) { console.error("DATABASE_URL is not set in web/.env.local (see docs/database-setup.md)."); process.exit(1); }
const dataFile = new URL("./data/buildings.json", import.meta.url);
if (!existsSync(dataFile)) { console.error("Run `npm run seed:buildings` first, so listings can be placed on real buildings."); process.exit(1); }

const COUNT = Number(process.argv[2] ?? 360);
const buildings = JSON.parse(readFileSync(dataFile, "utf8"));

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

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");

  // --- people: four verified agents who post the sample listings
  const owners = [];
  for (const name of AGENTS) {
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@seed.nestmap.invalid`;
    let id = (await db.query("select id from auth.users where email = $1", [email])).rows[0]?.id;
    if (!id) {
      // empty strings (not NULL) in the token columns keep Supabase Auth happy if this user is ever listed or edited
      id = (await db.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                                 created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, '', now(),
                 '{"provider":"email","providers":["email"]}', jsonb_build_object('name', $2::text), now(), now(), '', '', '', '')
         returning id`, [email, name])).rows[0].id;
    }
    await db.query(
      `insert into public.profiles (id, name, city, agent_status) values ($1, $2, 'Kozhikode', 'verified')
       on conflict (id) do update set name = excluded.name, city = excluded.city, agent_status = 'verified'`, [id, name]);
    owners.push(id);
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
    const place = pick(AREAS);
    rows.push({
      owner_id: pick(owners), mode, type, price, beds, baths, area_sqft: area, floor, facing,
      furnishing: ["apartment", "house", "villa"].includes(type) ? pick(FURN) : null,
      address: `${between(10, 99)}, ${pick(STREETS)}`, locality: place, lat: spot[0], lng: spot[1],
      amenities: AMEN_BY[type] ?? Array.from(new Set(Array.from({ length: 5 }, () => pick(AMEN)))),
      description: type === "plot" ? `A well-shaped ${area} sq ft plot in ${place} with clear title and road access, ready for construction.`
        : type === "commercial" ? `A ${area} sq ft commercial space in ${place} on a busy road with good footfall and parking nearby.`
        : type === "pg_hostel" ? `A clean, safe room in ${place} close to colleges and offices, with Wi-Fi, laundry and 24h security.`
        : `A bright ${beds}-bedroom ${type} in ${place}. Open living space, good ventilation and easy access to shops, schools and public transport.`,
    });
  }

  await db.query("delete from public.listings where source = 'seed'");   // photos go with them (cascade)

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const { rows: made } = await db.query(
      `insert into public.listings (owner_id, posted_as, mode, type, price, beds, baths, area_sqft, floor, facing, furnishing, address, locality, city,
                                    location, amenities, description, status, is_verified, source, expires_at)
       select t.owner_id, 'agent', t.mode::public.listing_mode, t.type::public.property_type, t.price, t.beds, t.baths, t.area_sqft, t.floor, t.facing, t.furnishing,
              t.address, t.locality, 'Kozhikode', extensions.st_setsrid(extensions.st_makepoint(t.lng, t.lat), 4326)::extensions.geography,
              array(select jsonb_array_elements_text(t.amenities)), t.description, 'live', true, 'seed', now() + interval '30 days'
       from jsonb_to_recordset($1::jsonb) as t(owner_id uuid, mode text, type text, price numeric, beds int, baths int, area_sqft int, floor int, facing text,
                                              furnishing text, address text, locality text, lat float8, lng float8, amenities jsonb, description text)
       returning id`, [JSON.stringify(rows.slice(i, i + 100))]);
    await db.query(
      `insert into public.listing_photos (listing_id, path, sort_order)
       select l, 'https://picsum.photos/seed/' || l || '-' || k || '/900/650', k from unnest($1::uuid[]) as l, generate_series(0, 3) as k`,
      [made.map(r => r.id)]);
    inserted += made.length;
  }
  await db.query("commit");
  console.log(`Done: ${inserted} sample listings (${AGENTS.length} agents) around Kozhikode.`);
} catch (err) {
  await db.query("rollback");
  console.error("Seed failed, nothing was changed:", err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
