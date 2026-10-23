export type Mode = "buy" | "rent";
export type PType = "Apartment" | "House" | "Villa" | "Plot" | "Commercial" | "PG / Hostel";

/** Which property types exist for each mode (Plot is buy-only, PG / Hostel is rent-only). */
export interface TypeDef { k: PType; i: string; m: Mode[] }
export const PT: TypeDef[] = [
  { k: "Apartment", i: "building", m: ["buy", "rent"] },
  { k: "House", i: "home", m: ["buy", "rent"] },
  { k: "Villa", i: "villa", m: ["buy", "rent"] },
  { k: "Plot", i: "plot", m: ["buy"] },
  { k: "Commercial", i: "store", m: ["buy", "rent"] },
  { k: "PG / Hostel", i: "bed", m: ["rent"] },
];
/** Types where bedrooms make sense. */
export const RES: PType[] = ["Apartment", "House", "Villa"];

export interface Listing {
  id: string;
  /** stable number used to vary descriptions */
  n: number;
  lat: number;
  lng: number;
  type: PType;
  beds: number;
  baths: number;
  sqft: number;
  /** monthly rent in INR, 0 if not for rent */
  rent: number;
  /** sale price in INR, 0 if not for sale */
  buy: number;
  addr: string;
  img: string;
  /** demo only: position is a guess (no building data yet) and may be replaced later */
  approx?: boolean;
  // the fields below exist for listings that come from the database
  /** true once the full record (description, photos, agent) has been loaded */
  full?: boolean;
  description?: string;
  amenities?: string[];
  photos?: string[];
  facing?: string;
  floor?: number;
  agent?: { name: string; verified: boolean };
}

export const RANGE: Record<Mode, [number, number, number]> = {
  buy: [2_000_000, 20_000_000, 500_000],
  rent: [5_000, 100_000, 1_000],
};

export const priceFor = (l: Listing, mode: Mode) => (mode === "rent" ? l.rent : l.buy);
/** The mode to show for a listing: the preferred one, or the other if it only exists there. */
export const modeFor = (l: Listing, preferred: Mode): Mode =>
  priceFor(l, preferred) > 0 ? preferred : preferred === "rent" ? "buy" : "rent";

export function fmt(n: number, mode: Mode): string {
  if (mode === "rent") return "₹" + (n / 1000).toFixed(n % 1000 ? 1 : 0) + "k";
  return n >= 1e7 ? "₹" + (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + " Cr" : "₹" + (n / 1e5).toFixed(0) + " L";
}

const DIR = ["East", "West", "North", "South"];
const USE = ["Shop", "Office", "Showroom"];
const SHARE = ["Single", "Double", "Triple"];
const FLOOR = ["Ground", "1st", "2nd"];
const isRes = (l: Listing) => RES.includes(l.type);

export function spec(l: Listing): string {
  if (isRes(l)) return `${l.beds} bed · ${l.baths} bath · ${l.sqft} sqft`;
  if (l.type === "Plot") return `${l.sqft} sq ft plot · ${l.facing ?? DIR[l.n % 4]} facing`;
  if (l.type === "Commercial") return `${l.sqft} sq ft · ${USE[l.n % 3]}`;
  return `${SHARE[l.n % 3]} sharing · ${l.n % 2 ? "Food included" : "No food"}`;
}

export function factsOf(l: Listing): [string | number, string][] {
  if (isRes(l)) return [[l.beds, "Bedrooms"], [l.baths, "Bathrooms"], [l.sqft, "Sq ft"]];
  if (l.type === "Plot") return [[l.sqft, "Sq ft"], ["Freehold", "Ownership"], [l.facing ?? DIR[l.n % 4], "Facing"]];
  if (l.type === "Commercial") return [[l.sqft, "Sq ft"], [USE[l.n % 3], "Use"], [l.floor != null ? (l.floor === 0 ? "Ground" : `${l.floor}`) : FLOOR[l.n % 3], "Floor"]];
  return [[SHARE[l.n % 3], "Sharing"], [l.n % 2 ? "Included" : "Not incl.", "Meals"], [l.sqft, "Sq ft"]];
}

export function aboutOf(l: Listing): string {
  if (l.description) return l.description;
  if (isRes(l)) return `A bright ${l.beds}-bedroom ${l.type.toLowerCase()} in a quiet, well-connected neighbourhood. Open living space, good ventilation and easy access to shops, schools and public transport.`;
  if (l.type === "Plot") return `A well-shaped ${l.sqft} sq ft plot with clear title and road access, ready for construction. Close to schools, markets and public transport.`;
  if (l.type === "Commercial") return `A ${l.sqft} sq ft ${USE[l.n % 3].toLowerCase()} space on a busy road with good footfall, parking nearby and 24h access.`;
  return `A clean, safe ${SHARE[l.n % 3].toLowerCase()}-sharing room close to colleges and offices, with Wi-Fi, laundry and 24h security.`;
}

const AMEN = ["Covered parking", "Lift", "Gym", "Garden", "24h security", "Power backup", "Swimming pool", "Balcony", "Near school", "Near bus stop"];
const AMEN_BY: Partial<Record<PType, string[]>> = {
  Plot: ["Clear title", "Road access", "Water connection", "Near highway", "Gated layout"],
  Commercial: ["Main road", "Parking", "Power backup", "Lift", "24h access"],
  "PG / Hostel": ["Wi-Fi", "Laundry", "24h security", "Housekeeping", "Near bus stop"],
};
export const amenitiesOf = (l: Listing): string[] => (l.amenities?.length ? l.amenities : AMEN_BY[l.type]) ?? [0, 1, 2, 3, 4].map(k => AMEN[(l.n * 3 + k * 2) % AMEN.length]);

export const AGENTS = ["Anil Kumar", "Fathima R.", "Suresh Nair", "Meera Das"];
export const agentOf = (l: Listing) => l.agent?.name ?? AGENTS[l.n % AGENTS.length];

export interface Bounds { west: number; south: number; east: number; north: number }
export const inBounds = (l: { lat: number; lng: number }, b: Bounds) =>
  l.lat >= b.south && l.lat <= b.north && l.lng >= b.west && l.lng <= b.east;
