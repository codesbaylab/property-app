-- Nestmap core schema: people, listings, photos, saved homes, admin roles, map search.
-- Later phases (chat, visits, reviews, payments, support) get their own migration files.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------- types
create type public.listing_mode   as enum ('buy', 'rent');
create type public.property_type  as enum ('apartment', 'house', 'villa', 'plot', 'commercial', 'pg_hostel');
create type public.listing_status as enum ('draft', 'pending', 'live', 'rejected', 'sold_or_rented', 'expired', 'hidden');
create type public.account_status as enum ('active', 'suspended', 'banned');
create type public.agent_status   as enum ('none', 'pending', 'verified', 'rejected');
create type public.admin_role     as enum ('super_admin', 'moderator', 'support');

-- ---------------------------------------------------------------- people
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  name           text,
  phone          text,
  avatar_url     text,
  city           text,
  account_status public.account_status not null default 'active',
  agent_status   public.agent_status   not null default 'none',
  language       text not null default 'en',
  created_at     timestamptz not null default now()
);

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.admin_role not null,
  created_at timestamptz not null default now()
);

-- a profile row is created automatically when someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone) values (new.id, new.phone) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()))
$$;

-- only name, picture, city and language can be edited by the user; status fields are admin-only
revoke update on public.profiles from anon, authenticated;
grant update (name, avatar_url, city, language) on public.profiles to authenticated;

-- what other people may see about a user: never the phone number
create view public.public_profiles as
  select id, name, avatar_url, (agent_status = 'verified') as is_verified from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------- listings
create table public.listings (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  posted_as        text not null default 'owner' check (posted_as in ('owner', 'agent')),
  mode             public.listing_mode not null,
  type             public.property_type not null,
  price            numeric(14, 0) not null check (price > 0),          -- total (buy) or monthly (rent), INR
  deposit          numeric(14, 0),
  maintenance      numeric(14, 0),
  beds             int not null default 0 check (beds >= 0),
  baths            int not null default 0 check (baths >= 0),
  area_sqft        int check (area_sqft > 0),
  floor            int,
  total_floors     int,
  facing           text,
  age_years        int,
  furnishing       text,
  available_from   date,
  description      text,
  address          text not null,
  locality         text,
  city             text,
  location         extensions.geography (Point, 4326) not null,
  amenities        text[] not null default '{}',
  rera_id          text,
  status           public.listing_status not null default 'draft',
  reject_reason    text,
  is_verified      boolean not null default false,
  expires_at       timestamptz,
  boosted_until    timestamptz,
  view_count       int not null default 0,
  source           text not null default 'manual' check (source in ('manual', 'import', 'seed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index listings_location_idx on public.listings using gist (location);
create index listings_search_idx   on public.listings (status, mode, type, price);
create index listings_owner_idx    on public.listings (owner_id);

create table public.listing_photos (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  path       text not null,
  sort_order int not null default 0,
  width      int,
  height     int
);
create index listing_photos_listing_idx on public.listing_photos (listing_id, sort_order);

create table public.saved_listings (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();

-- Owners can edit their own listing's details, but they cannot approve it, verify it, boost it or hand it to someone else.
-- Admins, the dashboard and server-side code are exempt.
create function public.guard_listing_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if session_user in ('postgres', 'supabase_admin') or (select auth.role()) = 'service_role' or public.is_admin() then
    return new;
  end if;
  if new.owner_id <> old.owner_id or new.is_verified <> old.is_verified or new.view_count <> old.view_count
     or new.boosted_until is distinct from old.boosted_until or new.reject_reason is distinct from old.reject_reason then
    raise exception 'These fields can only be changed by the Nestmap team';
  end if;
  if new.status is distinct from old.status
     and (old.status::text || '>' || new.status::text) not in
         ('draft>pending', 'pending>draft', 'rejected>draft', 'rejected>pending', 'live>hidden', 'live>sold_or_rented', 'hidden>pending', 'expired>pending') then
    raise exception 'A listing cannot move from % to %', old.status, new.status;
  end if;
  return new;
end $$;
create trigger listings_guard before update on public.listings for each row execute function public.guard_listing_update();

revoke update on public.listings from anon, authenticated;
grant update (posted_as, mode, type, price, deposit, maintenance, beds, baths, area_sqft, floor, total_floors, facing, age_years,
              furnishing, available_from, description, address, locality, city, location, amenities, rera_id, status)
  on public.listings to authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles       enable row level security;
alter table public.admin_users    enable row level security;   -- no policies: only the server side can read it
alter table public.listings       enable row level security;
alter table public.listing_photos enable row level security;
alter table public.saved_listings enable row level security;

create policy profiles_read_own   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_admin_read on public.profiles for select to authenticated using (public.is_admin());

create policy listings_read_live  on public.listings for select to anon, authenticated using (status = 'live');
create policy listings_read_own   on public.listings for select to authenticated using (owner_id = (select auth.uid()));
create policy listings_admin_all  on public.listings for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy listings_insert_own on public.listings for insert to authenticated
  with check (owner_id = (select auth.uid()) and status in ('draft', 'pending') and not is_verified and boosted_until is null);
create policy listings_update_own on public.listings for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy listings_delete_own on public.listings for delete to authenticated
  using (owner_id = (select auth.uid()) and status in ('draft', 'rejected', 'hidden'));

create policy photos_read on public.listing_photos for select to anon, authenticated using (
  exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'live' or l.owner_id = (select auth.uid()))));
create policy photos_write_own on public.listing_photos for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
create policy photos_admin_all on public.listing_photos for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy saved_own on public.saved_listings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- map search
-- Everything the map and the list need for whatever part of the map is on screen, in one call.
-- Row level security still applies, so only live listings come back.
create function public.listings_in_bounds(
  p_west double precision, p_south double precision, p_east double precision, p_north double precision,
  p_mode public.listing_mode,
  p_type public.property_type default null,
  p_max_price numeric default null,
  p_min_beds int default 0,
  p_limit int default 2000
) returns table (
  id uuid, lat double precision, lng double precision, mode public.listing_mode, price numeric, type public.property_type,
  beds int, baths int, area_sqft int, address text, cover_path text, boosted boolean
)
language sql stable set search_path = public, extensions as $$
  select l.id, st_y(l.location::geometry), st_x(l.location::geometry), l.mode, l.price, l.type,
         l.beds, l.baths, l.area_sqft, l.address,
         (select p.path from public.listing_photos p where p.listing_id = l.id order by p.sort_order limit 1),
         (l.boosted_until is not null and l.boosted_until > now())
  from public.listings l
  where l.status = 'live' and l.mode = p_mode
    and st_intersects(l.location, st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography)
    and (p_type is null or l.type = p_type)
    and (p_max_price is null or l.price <= p_max_price)
    and l.beds >= p_min_beds
  order by (l.boosted_until is not null and l.boosted_until > now()) desc, l.created_at desc
  limit least(p_limit, 5000)
$$;
grant execute on function public.listings_in_bounds to anon, authenticated;

-- ---------------------------------------------------------------- property page
-- One call returns everything the detail page shows (position, photos, the lister's public name).
create function public.listing_detail(p_id uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', l.id, 'lat', st_y(l.location::geometry), 'lng', st_x(l.location::geometry),
    'mode', l.mode, 'price', l.price, 'type', l.type, 'beds', l.beds, 'baths', l.baths, 'area_sqft', l.area_sqft,
    'address', l.address, 'locality', l.locality, 'city', l.city, 'description', l.description, 'amenities', l.amenities,
    'floor', l.floor, 'total_floors', l.total_floors, 'facing', l.facing, 'furnishing', l.furnishing, 'age_years', l.age_years,
    'available_from', l.available_from, 'rera_id', l.rera_id, 'is_verified', l.is_verified, 'deposit', l.deposit, 'maintenance', l.maintenance,
    'photos', coalesce((select jsonb_agg(p.path order by p.sort_order) from public.listing_photos p where p.listing_id = l.id), '[]'::jsonb),
    'agent', (select jsonb_build_object('name', pp.name, 'verified', pp.is_verified) from public.public_profiles pp where pp.id = l.owner_id)
  )
  from public.listings l
  where l.id = p_id and (l.status = 'live' or l.owner_id = (select auth.uid()))
$$;
grant execute on function public.listing_detail to anon, authenticated;
