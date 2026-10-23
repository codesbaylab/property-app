// Downloads real building locations (OpenStreetMap) around the launch city and saves them to scripts/data/buildings.json.
// The seed script uses them so sample listings sit on land, on real streets.
//   npm run seed:buildings [lat] [lng] [radius_m]      defaults: Kozhikode, 7000 m
// The free Overpass service is often busy; this tries several servers and waits between attempts.
import { mkdirSync, writeFileSync } from "node:fs";

const [lat = "11.2588", lng = "75.7804", radius = "7000"] = process.argv.slice(2);
const hosts = ["https://overpass.kumi.systems", "https://overpass-api.de", "https://overpass.private.coffee", "https://overpass.osm.jp"];
const query = `[out:json][timeout:60];way["building"](around:${radius},${lat},${lng});out center 4000;`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (let round = 1; round <= 4; round++) {
  for (const host of hosts) {
    try {
      process.stdout.write(`Round ${round}: ${host} ... `);
      const res = await fetch(`${host}/api/interpreter`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "nestmap-seed/1.0" },
        body: "data=" + encodeURIComponent(query), signal: AbortSignal.timeout(70000),
      });
      if (!res.ok) { console.log(`HTTP ${res.status}`); continue; }
      const json = await res.json();
      const pts = json.elements.filter(e => e.center).map(e => [+e.center.lat.toFixed(6), +e.center.lon.toFixed(6)]);
      if (pts.length < 50) { console.log(`only ${pts.length} buildings`); continue; }
      mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
      writeFileSync(new URL("./data/buildings.json", import.meta.url), JSON.stringify(pts));
      console.log(`${pts.length} buildings saved to scripts/data/buildings.json`);
      process.exit(0);
    } catch (e) { console.log(e.name === "TimeoutError" ? "timed out" : e.message); }
  }
  console.log("Waiting 15 s before trying again...");
  await sleep(15000);
}
console.error("\nCould not download building locations right now. Try again in a few minutes.");
process.exit(1);
