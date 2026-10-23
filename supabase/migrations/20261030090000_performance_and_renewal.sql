-- Listing performance (views, enquiries, visits, saves) for owners, and listing expiry with one-tap renewal.

-- ---------------------------------------------------------------- views
-- One row per listing per day. Written only by record_view(), read only through my_listing_stats().
create table public.listing_views (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day        date not null default current_date,
  views      int  not null default 0,
  primary key (listing_id, day)
);
alter table public.listing_views enable row level security;
revoke all on public.listing_views from anon, authenticated;

-- Counts one view of a live listing. The lister's own views do not count.
create function public.record_view(p_listing uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.listings l where l.id = p_listing and l.status = 'live' and l.owner_id is distinct from (select auth.uid())) then
    return;
  end if;
  insert into public.listing_views as v (listing_id, day, views) values (p_listing, current_date, 1)
    on conflict (listing_id, day) do update set views = v.views + 1;
end $$;

-- Numbers for every listing the signed-in person owns, keyed by listing id.
create function public.my_listing_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(l.id, jsonb_build_object(
    'views',     coalesce((select sum(v.views) from public.listing_views v where v.listing_id = l.id), 0),
    'views_7d',  coalesce((select sum(v.views) from public.listing_views v where v.listing_id = l.id and v.day > current_date - 7), 0),
    'enquiries', (select count(*) from public.conversations c where c.listing_id = l.id and c.last_message_at is not null),
    'visits',    (select count(*) from public.visits x where x.listing_id = l.id and x.status in ('requested', 'proposed', 'confirmed')),
    'saves',     (select count(*) from public.saved_listings s where s.listing_id = l.id),
    'expires_at', l.expires_at
  )), '{}'::jsonb)
  from public.listings l where l.owner_id = (select auth.uid())
$$;

-- ---------------------------------------------------------------- expiry and renewal
-- Owners may renew through renew_listing() only: it raises a transaction-local flag that the guard below accepts for that one listing.
create or replace function public.guard_listing_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_renewing boolean := coalesce(current_setting('nestmap.renew', true), '') = old.id::text;
begin
  if session_user in ('postgres', 'supabase_admin') or (select auth.role()) = 'service_role' or public.can_moderate() then
    return new;
  end if;
  if new.owner_id <> old.owner_id or new.is_verified <> old.is_verified or new.view_count <> old.view_count
     or new.boosted_until is distinct from old.boosted_until or new.reject_reason is distinct from old.reject_reason
     or (new.expires_at is distinct from old.expires_at and not v_renewing) then
    raise exception 'These fields can only be changed by the Nestmap team';
  end if;
  if new.status is distinct from old.status
     and (old.status::text || '>' || new.status::text) not in
         ('draft>pending', 'pending>draft', 'rejected>draft', 'rejected>pending', 'live>hidden', 'live>sold_or_rented', 'hidden>pending', 'expired>pending')
     and not (v_renewing and old.status = 'expired' and new.status = 'live') then
    raise exception 'A listing cannot move from % to %', old.status, new.status;
  end if;
  return new;
end $$;

-- Keeps a live listing up for 30 more days. Allowed in the last 7 days before it expires, or after it has expired.
-- The content was already approved and cannot be edited while live, so no new review is needed.
create function public.renew_listing(p_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v public.listings%rowtype; v_until timestamptz := now() + interval '30 days';
begin
  select * into v from public.listings where id = p_id and owner_id = (select auth.uid());
  if not found then raise exception 'Listing not found'; end if;
  if v.status = 'live' and (v.expires_at is null or v.expires_at > now() + interval '7 days') then raise exception 'Too early to renew'; end if;
  if v.status not in ('live', 'expired') then raise exception 'This listing cannot be renewed'; end if;
  if not v.is_verified then raise exception 'This listing cannot be renewed'; end if;
  perform set_config('nestmap.renew', p_id::text, true);
  update public.listings set status = 'live', expires_at = v_until where id = p_id;
  return v_until;
end $$;

-- Takes down live listings that ran past their date. Demo (seed) listings are left alone.
create function public.expire_listings() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.listings set status = 'expired' where status = 'live' and expires_at is not null and expires_at < now() and source <> 'seed';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.record_view(uuid) from public;
grant  execute on function public.record_view(uuid) to anon, authenticated;
revoke execute on function public.my_listing_stats(), public.renew_listing(uuid) from public, anon;
grant  execute on function public.my_listing_stats(), public.renew_listing(uuid) to authenticated;
revoke execute on function public.expire_listings() from public, anon, authenticated;

-- run the expiry every hour
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-listings', '7 * * * *', 'select public.expire_listings()');
exception when others then
  raise notice 'pg_cron is not available (%). Run select public.expire_listings() on a schedule instead.', sqlerrm;
end $$;
