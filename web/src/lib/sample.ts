/**
 * Sample data provider. Everything in here is replaced by the Supabase queries later
 * (the rest of the app only calls `listingsForBounds` and `generateListing`).
 *
 * The world is cut into small grid cells. Each cell always generates the same listings,
 * so pins and detail links stay stable between visits.
 */
import { PT, type Bounds, type Listing, type PType } from "./listing";

const CELL = 0.06;          // degrees, about 6.5 km
const PER_CELL = 30;
const STREETS = ["Marina Rd", "Lake View St", "Park Ave", "Temple St", "Garden Lane", "Beach Rd", "Main St", "Hill Rd", "Canal Rd", "Rose Ave"];

const mulberry32 = (a: number) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const idOf = (ix: number, iy: number, k: number) => `c${ix}_${iy}_${k}`;

/** Builds one listing from its id. `land` = real building spots so pins don't land in the sea. */
export function generateListing(id: string, land?: [number, number][]): Listing | null {
  const m = /^c(-?\d+)_(-?\d+)_(\d+)$/.exec(id);
  if (!m) return null;
  const ix = +m[1], iy = +m[2], k = +m[3];
  if (k >= PER_CELL) return null;
  const rnd = mulberry32(((ix * 73856093) ^ (iy * 19349663) ^ (k * 83492791)) >>> 0);

  const type: PType = PT[Math.floor(rnd() * PT.length)].k;
  let beds = 1 + Math.floor(rnd() * 4);
  let baths = Math.max(1, beds - Math.floor(rnd() * 2));
  let sqft = 450 + beds * 350 + Math.floor(rnd() * 300);
  let rent = Math.round(8 + beds * 7 + rnd() * 12) * 1000;
  let buy = Math.round(35 + beds * 28 + rnd() * 60) * 100000;
  if (type === "Plot") {
    beds = baths = 0; sqft = 1500 + Math.floor(rnd() * 4500); rent = 0;
    buy = Math.min(2e7, Math.max(2e6, Math.round(sqft * (900 + rnd() * 1500) / 1e5) * 1e5));
  } else if (type === "Commercial") {
    beds = 0; baths = 1; sqft = 400 + Math.floor(rnd() * 2600);
    buy = Math.min(2e7, Math.round(sqft * (4000 + rnd() * 5000) / 1e5) * 1e5);
    rent = Math.min(1e5, Math.round(sqft * (40 + rnd() * 60) / 1000) * 1000);
  } else if (type === "PG / Hostel") {
    beds = 1; baths = 1; sqft = 120 + Math.floor(rnd() * 180); rent = Math.round(5 + rnd() * 8) * 1000; buy = 0;
  }
  const spot = land && land.length ? land[Math.floor(rnd() * land.length)] : null;
  const lat = spot ? spot[0] : (iy + rnd()) * CELL;
  const lng = spot ? spot[1] : (ix + rnd()) * CELL;
  return {
    id, n: Math.floor(rnd() * 1000), lat, lng, type, beds, baths, sqft, rent, buy,
    addr: `${10 + Math.floor(rnd() * 90)}, ${STREETS[Math.floor(rnd() * STREETS.length)]}`,
    img: `https://picsum.photos/seed/${id}/600/450`,
    approx: !spot,
  };
}

/** Real building locations from OpenStreetMap near a cell (demo only). */
const HOSTS = ["https://overpass.kumi.systems", "https://overpass-api.de"];
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
// the free service rate-limits, so requests go one at a time
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T,>(job: () => Promise<T>): Promise<T> => { const run = queue.then(job, job); queue = run.catch(() => {}); return run; };

async function landNear(ix: number, iy: number): Promise<[number, number][]> {
  const lat = (iy + 0.5) * CELL, lng = (ix + 0.5) * CELL;
  const q = `[out:json][timeout:20];way["building"](around:4800,${lat},${lng});out center 500;`;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const host of HOSTS) {
      try {
        const res = await fetch(`${host}/api/interpreter?data=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;   // busy or blocked: try the next host
        const json = await res.json() as { elements: { center?: { lat: number; lon: number } }[] };
        const pts = json.elements.filter(e => e.center).map(e => [e.center!.lat, e.center!.lon] as [number, number]);
        if (pts.length) return pts;
      } catch { /* try the next host */ }
    }
    await sleep(1000);
  }
  return [];
}

const landCache = new Map<string, Promise<[number, number][]>>();
function landFor(ix: number, iy: number) {
  const key = `${ix}_${iy}`;
  let p = landCache.get(key);
  if (!p) {
    p = enqueue(() => landNear(ix, iy));
    landCache.set(key, p);
    p.then(l => { if (!l.length) landCache.delete(key); });   // failed or empty: allow a retry on a later move
  }
  return p;
}
const build = (ix: number, iy: number, land: [number, number][]) =>
  Array.from({ length: PER_CELL }, (_, k) => generateListing(idOf(ix, iy, k), land)!);

/**
 * Listings in the cells that cover the view. `onCells` is called as each cell is ready.
 * If the building data takes longer than ~2.5 s, approximate positions are shown first and
 * replaced (same ids) once the real spots arrive.
 */
export async function listingsForBounds(b: Bounds, onCells: (ls: Listing[]) => void): Promise<void> {
  const x0 = Math.floor(b.west / CELL), x1 = Math.floor(b.east / CELL);
  const y0 = Math.floor(b.south / CELL), y1 = Math.floor(b.north / CELL);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 12) return;   // zoomed far out
  const jobs: Promise<void>[] = [];
  for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
    jobs.push((async () => {
      const landP = landFor(ix, iy);
      const early = await Promise.race([landP, sleep(2500).then(() => null)]);
      if (early && early.length) { onCells(build(ix, iy, early)); return; }
      onCells(build(ix, iy, []));                                   // approximate for now
      const land = await landP;
      if (land.length) onCells(build(ix, iy, land));                // upgrade to real building spots
    })());
  }
  await Promise.all(jobs);
}
