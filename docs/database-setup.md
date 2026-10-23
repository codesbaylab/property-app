# Database setup (about 10 minutes, no Docker)

The app already knows how to read from Supabase. Until you add your keys it uses built-in sample data, so nothing breaks.

## 1. Create the project

1. Make a new free Supabase account (a different one from your other apps, so the free limit starts fresh).
2. **New project**, name it `nestmap`, choose the region closest to your users (**Mumbai, ap-south-1**), and set a database password. **Save that password.**

## 2. Copy four values

| Where in the dashboard | Goes into `web/.env.local` as |
|---|---|
| Project Settings > API > **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` |
| Project Settings > API > **Publishable key** (`sb_publishable_...`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| *Optional for now:* Project Settings > API > **Secret key** (`sb_secret_...`) | `SUPABASE_SECRET_KEY` (only needed later for server-side features; setup and the sample data do not use it) |
| The database password you chose | `SUPABASE_DB_PASSWORD` |
| **Connect** button > **Session pooler** > URI (replace `[YOUR-PASSWORD]` with your password) | `DATABASE_URL` |

Copy `web/.env.example` to `web/.env.local` and paste the values in. Use the **Session pooler** string, not "Direct connection": the direct one needs IPv6, which many home networks don't have.

The database password, connection string and secret key stay on your computer in `.env.local`. Don't paste them into chat or commit them.

## 3. Run three commands (in the `web` folder)

```bash
npm run db:migrate        # creates the tables, security rules and map search function
npm run seed:buildings    # downloads real building spots around Kozhikode (once; skip if scripts/data/buildings.json exists)
npm run seed              # adds about 360 sample listings and 4 sample agents
npm run db:check          # health check: tables, security rules, functions
```

Then `npm run dev`. The map now reads from your database.

## Everyday use

- **Change the database:** add a new file in `supabase/migrations/` named like `20261105090000_add_visits.sql`, then run `npm run db:migrate`. It applies only files it hasn't applied before.
- **Look at the data:** Supabase dashboard > **Table Editor** and **SQL Editor**. In your editor you can also connect an extension such as SQLTools using the same `DATABASE_URL`.
- **Reset sample data:** run `npm run seed` again. It replaces earlier sample listings only.
- **Ask Claude:** Claude can write the migration files for you. It can't reach a project in a separate account on its own, so you run `npm run db:migrate` after.

## What the first migration creates

| Table | Purpose |
|---|---|
| `profiles` | One per user (created automatically at sign-up). Phone numbers are never exposed publicly. |
| `admin_users` | Who is on the admin team. Not readable from the app. |
| `listings` | Every property, with a map location, status and review fields. |
| `listing_photos` | Photos in order. |
| `saved_listings` | A user's saved homes. |

And two functions: `listings_in_bounds` (the pins and list for the part of the map on screen) and `listing_detail` (everything the property page shows).

**Security rules built in:** anyone can read live listings. Owners can only edit their own. Only the Nestmap team can approve, verify or boost a listing. Users can only change their own name, picture, city and language.
