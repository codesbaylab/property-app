# Nestmap build plan

Status: **phases 0 to 3 are built, phase 4 has text chat only; phases 5 to 7 are mostly not started.** Originally written 2026-10-19, updated 2026-10-23 to match the code. Section 4 has the current status of each phase, and the notes under it list where the build differs from this plan.

## 1. Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Owners **and** agents can post at launch | Confirmed |
| 2 | Stack: Next.js, MapLibre, Supabase, **Cashfree** (payments), MSG91 (OTP) | Confirmed. Next.js, MapLibre and Supabase are in use; Cashfree and MSG91 are not wired up yet |
| 3 | First users come from Facebook ads | Confirmed (see section 6) |
| 4 | Posting is free for now (owners: 3 listings at a time; agents: paid plan later) | Confirmed, the 3-listing limit is enforced in the database |
| 5 | Launch city is Kozhikode | Confirmed |
| 6 | Payments through **Cashfree** (already have an account) | Confirmed |
| 7 | Name "Nestmap" | **At risk: nestmap.in is already a live India property site. See section 8.** |

## 2. Architecture

- **Web app:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. One codebase for desktop, tablet, mobile and the installed PWA. Public listing pages are server-rendered so Google and WhatsApp can read them.
- **Admin:** the same app under `/admin`, protected by role checks. Admin sign-in is separate from public sign-in.
- **Map:** MapLibre GL JS with vector tiles from MapTiler. Clusters in the browser up to a few thousand pins, then grid clustering in the database.
- **Data:** Supabase in the Mumbai region: Postgres with PostGIS, Auth, Storage, Realtime.
- **Services:** MSG91 (OTP), Cashfree (payments), Resend (email), Web Push, a WhatsApp provider (later).
- **Hosting:** Vercel for the app. Cloudflare in front for caching and protection.

## 3. Database design

Postgres naming: snake_case, `uuid` keys, `timestamptz` times. Enums are shown in brackets.

### People
- **profiles**: `id` (= auth user id), `name`, `phone`, `email`, `city`, `avatar_url`, `account_status` [active, suspended, banned], `agent_status` [none, pending, verified, rejected], `language`, `created_at`.
- **agent_profiles**: `user_id`, `agency_name`, `licence_no`, `id_doc_path`, `licence_doc_path`, `selfie_path`, `verified_at`, `rating_avg`, `rating_count`, `avg_reply_minutes`.
- **admin_users**: `user_id`, `role` [super_admin, moderator, support], `totp_enabled`.
- A public view, **public_profiles**, exposes only name, avatar, verified flag and rating. Phone numbers are never public.

### Listings
- **listings**: `id`, `owner_id`, `posted_as` [owner, agent], `mode` [buy, rent], `type` [apartment, house, villa, plot, commercial, pg_hostel], `price`, `deposit`, `maintenance`, `beds`, `baths`, `area_sqft`, `floor`, `total_floors`, `facing`, `age_years`, `furnishing`, `available_from`, `preferred_tenants`, `pets_allowed`, `description`, `address`, `locality`, `city`, `location` (geography point), `amenities` (text array), `rera_id`, `status` [draft, pending, live, rejected, sold_or_rented, expired, hidden], `reject_reason`, `is_verified`, `expires_at`, `renewed_at`, `boosted_until`, `view_count`, `source` [manual, import], `import_batch_id`, `created_at`, `updated_at`.
- **listing_photos**: `id`, `listing_id`, `path`, `position`, `width`, `height`.
- **listing_events**: `listing_id`, `kind` [view, save, enquiry], `created_at`. Used for owner stats and analytics.
- **import_batches**: `id`, `created_by`, `file_name`, `rows_total`, `rows_ok`, `rows_failed`, `status`.

### Buyer activity
- **saved_listings**: `user_id`, `listing_id`.
- **saved_searches**: `id`, `user_id`, `mode`, `type`, `max_price`, `beds`, `area` (geography), `alerts_on`.
- **conversations**: `id`, `listing_id`, `buyer_id`, `seller_id`, `last_message_at`.
- **messages**: `id`, `conversation_id`, `sender_id`, `kind` [text, image, location, visit], `body`, `attachment_path`, `read_at`, `created_at`.
- **visit_requests**: `id`, `listing_id`, `buyer_id`, `seller_id`, `proposed_at`, `status` [requested, confirmed, declined, rescheduled, cancelled, done], `note`.
- **reviews**: `id`, `agent_id`, `reviewer_id`, `visit_id`, `rating`, `tags`, `comment`.
- **notifications**: `id`, `user_id`, `kind`, `payload` (json), `read_at`, `created_at`. **push_subscriptions**: `user_id`, `endpoint`, `keys`.

### Trust, support, money
- **reports**: `id`, `reporter_id`, `target_type` [listing, user, message], `target_id`, `reason`, `details`, `status`, `handled_by`.
- **support_tickets**: `id`, `user_id`, `topic`, `listing_id`, `priority`, `status`, `assigned_to`. **ticket_messages**: `id`, `ticket_id`, `sender_id`, `body`.
- **payments**: `id`, `user_id`, `listing_id`, `kind` [boost, agent_pro], `amount`, `gst`, `cashfree_order_id`, `cashfree_payment_id`, `status`.
- **subscriptions**: `user_id`, `plan`, `status`, `current_period_end`.
- **promo_codes**, **referrals**, **announcements**.
- **data_requests**: `id`, `user_id`, `kind` [delete, export], `status`, `due_at`.
- **settings**: `key`, `value`. This holds the rules such as listing expiry days, free listing limit, posts per hour and the number of reports that auto-hides a listing.
- **audit_log**: `id`, `actor_id`, `action`, `target_type`, `target_id`, `changes` (json), `created_at`.

### Indexes and map query
- A spatial index on `listings.location`, and indexes on `status`, `mode`, `type` and `price`.
- One database function, `listings_in_bounds(west, south, east, north, mode, type, max_price, beds, limit)`, returns lightweight pin rows (id, position, price, type). The detail page loads the full row only when opened.
- Boosted listings sort first, then newest.

### Security rules (row-level)
- **Listings:** anyone can read `live` listings. Owners can read and edit their own. Only an admin can set a listing to `live` or `rejected`. Owners can move a listing between `draft`, `pending`, `hidden` and `sold_or_rented`.
- **Profiles and messages:** a profile is private to its owner. A conversation is visible only to its two participants.
- **Admin tables:** reachable only through a database function that checks the caller's admin role. Moderators cannot touch payments or the team. Support is read-only on listings and users.
- **Storage:** `listing-photos` is public to read and writable only inside the owner's own folder. `kyc-docs` is private to the owner and admins.
- **Phone privacy:** numbers are never returned by any public query. Calls and chat go through the app.
- **Abuse limits:** posts per hour, OTP attempts per hour, and message rate limits are enforced in the database and at the edge.

## 4. Build phases

Each phase ends with something you can open and use.

| Phase | What gets built | Status |
|---|---|---|
| **0. Setup** | Next.js project, Supabase project (Mumbai), environments, design tokens ported from the prototype, CI | **Done**, except CI and a deployed copy (no pipeline or Vercel project yet) |
| **1. Map and listings (read)** | Tables, 300+ seed listings, MapLibre map, the left Buy/Rent control, filters, clusters, server-rendered detail pages, share links | **Done.** About 360 sample listings around Kozhikode, price labels that switch with zoom, shareable `/home/[id]` pages. Place search uses the free OpenStreetMap Nominatim service and the map uses a free Esri demo basemap, both for demo use only. Not done: switching to MapTiler (set the style URLs in `.env.local`) |
| **2. Accounts** | Phone OTP login, profile, Saved homes and searches, the nav pages | **Mostly done.** Sign in and sign up use **email and password**, not phone OTP (see notes). Saved homes are stored on the account and merged from the browser on first sign-in. Not done: saved searches, alerts |
| **3. Posting and review** | Post flow with photo upload, drafts, My homes, edit, renewal and expiry, **admin review queue**, rejected-listing feedback | **Mostly done.** Post form with map pin and up to 8 photos, drafts, My homes with status and the team's feedback, send for review, withdraw, hide, mark sold or rented, delete, 3-listing limit, admin review queue. Not done: renewal and automatic expiry, editing a live listing (owners can only hide or close it), duplicate-photo checks. The posting migration (`20261026090000_posting.sql`) must be run with `npm run db:migrate` |
| **4. Messages and visits** | Realtime chat, visit requests and calendar, notifications and push | **Chat is built (text only).** Message on a listing opens a chat with whoever posted it; the Inbox lists conversations with the last message and unread counts; messages arrive live; the nav shows an unread badge; 20 messages a minute limit. Not done: visit requests and calendar, push and email notifications, photo or location messages, reporting a message, an admin view of chats. The chat migration (`20261027090000_chat.sql`) must be run with `npm run db:migrate`. **Calls are not built** (the Call button is a placeholder; see the open question on masked calls) |
| **5. Agents** | Verification, public agent profile, lead board, bulk CSV import, reviews, admin user and agent screens | **Barely started.** Admin can list users, suspend or ban them, and the profile shows a verified-agent badge. Not done: agent applications and document checks, agent profile pages, CSV import, reviews |
| **6. Money and support** | Cashfree boosts and Agent Pro, GST receipts, help and tickets, reports, announcements, compliance requests | **Partly done.** Listing reports and the admin reports screen are built, with auto-hide after three reports. Not done: payments, support tickets, announcements, data requests |
| **7. Launch hardening** | Sentry, PostHog, rate limits, backups, legal pages and consent, PWA install checks, load test, Meta Pixel with consent | **Barely started.** The app installs as a PWA and has a friendly not-found page. Not done: everything else in this phase |

**Admin (planned across phases 3, 5 and 6) is built early.** `/admin` has a dashboard, review queue, listings, users, reports, and a team and activity log. Roles are enforced in the database: super admins can do everything, moderators can review listings, and support is read-only.

Phases 1 to 3 are the first public version. Phases 4 and 5 are what make it worth returning to.

### Where the build differs from the plan
- **Sign-in is email and password**, not phone OTP. Phone login needs MSG91 and DLT registration, which have not been set up. The profile page says phone login is coming soon.
- **Saved searches, notifications and push** are not built.
- **Chat tables:** `conversations` and `messages` are simpler than section 3. Read state is two timestamps on the conversation (`buyer_last_read_at`, `seller_last_read_at`) instead of `messages.read_at`, and messages are text only (no `kind` or `attachment_path`). Conversations are created through `start_conversation()`, one per buyer and listing; people cannot message their own listing. A seller sees a conversation only once it has a message.
- **Tables built so far:** profiles, admin_users, listings, listing_photos, saved_listings, reports and audit_log. The rest of section 3 is still to come, with later phases adding their own migrations.
- **Column names differ slightly:** `listing_photos.sort_order` (plan: `position`), `listings.source` allows `manual`, `import` or `seed`, and `profiles` has no `email` column because email lives in Supabase Auth.
- **Fields in section 3 not yet in the database:** `preferred_tenants`, `pets_allowed`, `renewed_at`, `import_batch_id`, and the agent profile columns.
- **Storage:** the `listing-photos` bucket is public to read and writable only inside the owner's own folder, with a 5 MB limit and JPEG, PNG or WebP only. The `kyc-docs` bucket does not exist yet.
- **Listing limit:** owners can have 3 listings at a time (drafts, in review, live, hidden or rejected). Verified agents and admins are exempt.
- **Phone privacy:** phone numbers are not shown to the public or in listings. Only the admin Users screen shows them to the team.
- **Sample data:** every account type has a demo login created by `npm run seed:users`, and the listings are sample data until real ones are posted.

## 5. Accounts and services to set up

You will need to create these. Some need a registered business.
- **Supabase** (Pro plan for production) and **Vercel**.
- **MapTiler** (or Stadia) for map tiles and place search.
- **MSG91** for OTP SMS. India needs **DLT registration** of your sender ID and message templates, which can take days, so start early.
- **Cashfree**: you already have an account. Confirm UPI, cards and subscriptions are enabled for your business type.
- **Meta Business account** and ad account for Facebook ads, plus a **WhatsApp Business** provider later.
- **Resend** for email, **Sentry** and **PostHog** at launch.
- A **domain** and a **legal entity** for the above. Check that "Nestmap" is available as a name and domain before building brand assets on it.

## 6. Facebook ads: what to plan for

Ads bring people, but a map product needs **listings first**. A buyer who opens an empty map leaves and does not come back.

1. **Run supply ads before demand ads.** Target owners and agents in Kozhikode with "List your property free" lead ads. Send them to a simple posting or WhatsApp sign-up.
2. **Seed with agents.** Bulk-import from a few active local agents, which is what the Phase 5 CSV import is for.
3. **Set a launch gate.** Do not spend on buyer ads until there are about 300 live listings in the launch city. Measure cost per posted listing, then cost per enquiry.
4. **Expect Facebook's in-app browser.** Most ad clicks open inside the Facebook app. That browser limits PWA install, location prompts and some storage. Landing pages must work there and then suggest opening in Chrome or Safari.
5. **Tracking needs consent.** Meta Pixel and the Conversions API need a consent banner under India's data protection rules. This is in Phase 7.

## 7. Risks

| Risk | How we handle it |
|---|---|
| Empty map at launch | Supply ads first, agent bulk import, launch gate of about 300 listings |
| Fake or duplicate listings | Review queue, photo and duplicate checks, report button, auto-hide after reports |
| OTP cost and fraud | Rate limits, MSG91 rates, watch the cost screen in admin |
| Map costs | Vector tiles, caching, track usage from day one |
| DLT approval and Cashfree activation delay launch | Start both while Phase 0 and 1 are being built |
| Stale listings | Expiry and renewal flow in Phase 3 |

## 8. Name check: "Nestmap"

Checked on 2026-10-19 with web search and direct requests to the domains. I could not search trademark registries or app stores, so this is not legal clearance.

- **nestmap.in is live and is the same idea in the same country:** it calls itself "India's map-first property marketplace" (flats, houses, PG, plots, for sale and rent). It shows no company name, a "© 2026 NestMap" notice, empty counters, and about eight listings, so it looks new and small. It is still a direct clash in your market.
- **nestmap.app** is an unrelated home-inventory app.
- **nestmap.com** redirects to a domain-for-sale marketplace.
- **nestmap.co.in, .io, .org, .homes** returned no DNS record, which suggests they may be unregistered, but that is not confirmed.
- **Recommendation:** pick a different name before building brand assets, buying a domain or filing anything. Search IP India's trademark database (classes 35, 36 and 42) for any new name, and check the domain, Facebook page name and app-store names too.

## 9. Open questions

1. Choose a new name (see above).
2. How should calls work? Masked phone calls through a provider such as Exotel keep numbers private but need a registered business and cost per call. Chat only is the cheapest start.
3. Do you have a registered business entity? Cashfree already works, but MSG91 DLT registration and WhatsApp Business also need one.
