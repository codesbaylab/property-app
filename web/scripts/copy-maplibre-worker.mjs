// MapLibre runs clustering and tile parsing in a background worker. Bundlers can't find it on their own,
// so we serve the worker files from /public and point MapLibre at them (see MapView.tsx).
import { cpSync, mkdirSync } from "node:fs";

const from = new URL("../node_modules/maplibre-gl/dist/", import.meta.url);
const to = new URL("../public/maplibre/", import.meta.url);
mkdirSync(to, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) cpSync(new URL(f, from), new URL(f, to));
console.log("copied maplibre worker files to public/maplibre");
