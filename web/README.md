# Nestmap web app

Next.js 16 (App Router, React 19, TypeScript) + MapLibre GL. See `../docs/build-plan.md` for the plan.

## Run it

```bash
cd web
npm install        # also copies the MapLibre worker files into public/maplibre
npm run dev        # http://localhost:3000
npm run build && npm start   # production check
```

## Database

Without Supabase keys the app uses built-in sample data. To use a real database follow `../docs/database-setup.md` (about 10 minutes, no Docker). In short:

```bash
npm run db:migrate        # applies supabase/migrations/*.sql
npm run seed:buildings    # one-off download of real building spots (already saved in scripts/data/buildings.json)
npm run seed              # about 360 sample listings around Kozhikode
```

All reads go through `src/lib/data.ts`, which picks the database or the sample data.

## Map provider

Without any settings it uses the free Esri grey basemap (demo only). To switch to MapTiler (or any style URL) create `web/.env.local`:

```
NEXT_PUBLIC_MAP_STYLE_LIGHT=https://api.maptiler.com/maps/<light-style>/style.json?key=YOUR_KEY
NEXT_PUBLIC_MAP_STYLE_DARK=https://api.maptiler.com/maps/<dark-style>/style.json?key=YOUR_KEY
```

## Where things are

| Path | What |
|---|---|
| `src/app/page.tsx` | Map home (`components/Explore.tsx`) |
| `src/app/home/[id]/page.tsx` | Shareable listing page with title and preview image for Google and WhatsApp |
| `src/components/MapView.tsx` | MapLibre map, clustered pins, price pills |
| `src/components/ModeControl.tsx` | Left Buy / Rent control with sub-types |
| `src/components/Views.tsx` | Saved, Inbox, Post, Profile pages |
| `src/lib/listing.ts` | Types and formatting (what the database will return) |
| `src/lib/data.ts` | The only place listings are read from (Supabase when configured, else sample data) |
| `src/lib/sample.ts` | Demo data used when Supabase is not configured |
| `../supabase/migrations/` | SQL for the database, applied with `npm run db:migrate` |
| `src/app/nestmap.css` | Design tokens and styles (light, dark, desktop rail) |

## Notes

- Saved homes and the theme are kept in the browser for now (`src/lib/hooks.ts`).
- Message, Call, OTP and Post are placeholders until the database and login exist.
- `AGENTS.md` is written by Next.js: this version differs from older ones, so check `node_modules/next/dist/docs/` before using an API you are unsure about.
