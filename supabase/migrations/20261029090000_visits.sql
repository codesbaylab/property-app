-- Visit requests: a buyer asks to see a live listing at a time; the lister accepts, declines or suggests another time.
-- All changes go through request_visit() and respond_visit() so the rules live in one place.

create type public.visit_status as enum ('requested', 'proposed', 'confirmed', 'declined', 'cancelled');

create table public.visits (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  buyer_id    uuid not null references public.profiles (id) on delete cascade,
  seller_id   uuid not null references public.profiles (id) on delete cascade,
  visit_at    timestamptz not null,
  status      public.visit_status not null default 'requested',
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create index visits_buyer_idx  on public.visits (buyer_id, visit_at);
create index visits_seller_idx on public.visits (seller_id, visit_at);
-- one open visit per buyer per listing
create unique index visits_one_open_idx on public.visits (listing_id, buyer_id) where status in ('requested', 'proposed', 'confirmed');

alter table public.visits enable row level security;
create policy visits_read_own on public.visits for select to authenticated using ((select auth.uid()) in (buyer_id, seller_id));
create policy visits_admin_read on public.visits for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.visits from anon, authenticated;

-- ---------------------------------------------------------------- functions
create function public.request_visit(p_listing uuid, p_at timestamptz, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_owner uuid; v_id uuid;
begin
  if v_me is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.profiles where id = v_me and account_status = 'active') then raise exception 'Your account cannot request visits'; end if;
  select owner_id into v_owner from public.listings where id = p_listing and status = 'live';
  if v_owner is null then raise exception 'This listing is not available'; end if;
  if v_owner = v_me then raise exception 'This is your own listing'; end if;
  if p_at < now() + interval '1 hour' then raise exception 'Pick a time at least an hour from now'; end if;
  if p_at > now() + interval '30 days' then raise exception 'Pick a time within the next 30 days'; end if;
  if exists (select 1 from public.visits where listing_id = p_listing and buyer_id = v_me and status in ('requested', 'proposed', 'confirmed')) then
    raise exception 'You already have a visit for this home';
  end if;
  if (select count(*) from public.visits where buyer_id = v_me and status in ('requested', 'proposed')) >= 10 then
    raise exception 'You have too many open requests';
  end if;
  insert into public.visits (listing_id, buyer_id, seller_id, visit_at, note)
    values (p_listing, v_me, v_owner, p_at, nullif(btrim(p_note), '')) returning id into v_id;
  return v_id;
end $$;

-- p_action: accept | decline | propose | cancel. propose needs p_at.
create function public.respond_visit(p_visit uuid, p_action text, p_at timestamptz default null) returns public.visit_status
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v public.visits%rowtype; v_new public.visit_status;
begin
  if v_me is null then raise exception 'Sign in first'; end if;
  select * into v from public.visits where id = p_visit and v_me in (buyer_id, seller_id) for update;
  if not found then raise exception 'Visit not found'; end if;
  if v.status in ('declined', 'cancelled') then raise exception 'This visit is already closed'; end if;

  if p_action = 'cancel' then
    v_new := 'cancelled';
  elsif v_me = v.seller_id and v.status = 'requested' and p_action = 'accept' then
    v_new := 'confirmed';
  elsif v_me = v.seller_id and v.status = 'requested' and p_action = 'decline' then
    v_new := 'declined';
  elsif v_me = v.seller_id and v.status = 'requested' and p_action = 'propose' then
    if p_at is null or p_at < now() + interval '1 hour' or p_at > now() + interval '30 days' then raise exception 'Pick a time within the next 30 days'; end if;
    v_new := 'proposed';
  elsif v_me = v.buyer_id and v.status = 'proposed' and p_action = 'accept' then
    v_new := 'confirmed';
  elsif v_me = v.buyer_id and v.status = 'proposed' and p_action = 'decline' then
    v_new := 'cancelled';
  else
    raise exception 'That is not possible right now';
  end if;

  update public.visits set status = v_new, updated_at = now(), visit_at = case when p_action = 'propose' then p_at else visit_at end where id = p_visit;
  return v_new;
end $$;

-- Every visit the person is in, soonest first. 'as_buyer' says which side they are on.
create function public.my_visits() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(q.row order by q.sort), '[]'::jsonb) from (
    select v.visit_at as sort, jsonb_build_object(
      'id', v.id, 'listing_id', l.id, 'visit_at', v.visit_at, 'status', v.status, 'note', v.note,
      'as_buyer', v.buyer_id = (select auth.uid()),
      'listing', jsonb_build_object('address', l.address, 'price', l.price, 'mode', l.mode, 'type', l.type, 'status', l.status,
        'cover', (select p.path from public.listing_photos p where p.listing_id = l.id order by p.sort_order limit 1)),
      'other', (select jsonb_build_object('name', pp.name, 'verified', pp.is_verified) from public.public_profiles pp
                where pp.id = case when v.buyer_id = (select auth.uid()) then v.seller_id else v.buyer_id end)
    ) as row
    from public.visits v join public.listings l on l.id = v.listing_id
    where (select auth.uid()) in (v.buyer_id, v.seller_id)
  ) q
$$;

-- Things waiting on this person: requests to a lister, and suggested times for a buyer.
create function public.my_visit_todo() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.visits v
  where v.visit_at > now() and ((v.seller_id = (select auth.uid()) and v.status = 'requested') or (v.buyer_id = (select auth.uid()) and v.status = 'proposed'))
$$;

revoke execute on function public.request_visit(uuid, timestamptz, text), public.respond_visit(uuid, text, timestamptz), public.my_visits(), public.my_visit_todo() from public, anon;
grant execute on function public.request_visit(uuid, timestamptz, text), public.respond_visit(uuid, text, timestamptz), public.my_visits(), public.my_visit_todo() to authenticated;
