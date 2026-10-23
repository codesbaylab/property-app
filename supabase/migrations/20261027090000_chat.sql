-- Chat between a buyer and the person who posted a listing (text only for now).
-- Phone numbers are never exposed: people talk through the app.

create table public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  listing_id          uuid not null references public.listings (id) on delete cascade,
  buyer_id            uuid not null references public.profiles (id) on delete cascade,
  seller_id           uuid not null references public.profiles (id) on delete cascade,
  last_message_at     timestamptz,
  buyer_last_read_at  timestamptz not null default now(),
  seller_last_read_at timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);
create index conversations_buyer_idx  on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index messages_thread_idx on public.messages (conversation_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

create function public.in_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations c
                 where c.id = p_conversation and (select auth.uid()) in (c.buyer_id, c.seller_id))
$$;

-- A conversation is visible only to its two people. Conversations are created through start_conversation() and read marks go through mark_conversation_read().
create policy conversations_read_own on public.conversations for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id));
create policy conversations_admin_read on public.conversations for select to authenticated using (public.is_admin());

create policy messages_read_own on public.messages for select to authenticated using (public.in_conversation(conversation_id));
create policy messages_send on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.in_conversation(conversation_id)
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_status = 'active'));

revoke insert, update, delete on public.conversations from anon, authenticated;
revoke update, delete on public.messages from anon, authenticated;

-- 20 messages a minute per person; keeps the conversation's ordering fresh
create function public.on_message_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.messages m where m.sender_id = new.sender_id and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You are sending messages too fast. Wait a moment.';
  end if;
  update public.conversations set last_message_at = new.created_at,
    buyer_last_read_at  = case when buyer_id  = new.sender_id then new.created_at else buyer_last_read_at end,
    seller_last_read_at = case when seller_id = new.sender_id then new.created_at else seller_last_read_at end
  where id = new.conversation_id;
  return new;
end $$;
create trigger messages_sent before insert on public.messages for each row execute function public.on_message_sent();

-- ---------------------------------------------------------------- functions
-- Opens (or finds) the conversation between the signed-in person and the lister of a live listing.
create function public.start_conversation(p_listing uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_owner uuid; v_id uuid;
begin
  if v_me is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.profiles where id = v_me and account_status = 'active') then raise exception 'Your account cannot send messages'; end if;
  select owner_id into v_owner from public.listings where id = p_listing and status = 'live';
  if v_owner is null then raise exception 'This listing is not available'; end if;
  if v_owner = v_me then raise exception 'This is your own listing'; end if;
  insert into public.conversations (listing_id, buyer_id, seller_id) values (p_listing, v_me, v_owner)
    on conflict (listing_id, buyer_id) do nothing;
  select id into v_id from public.conversations where listing_id = p_listing and buyer_id = v_me;
  return v_id;
end $$;

create function public.mark_conversation_read(p_conversation uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversations set
    buyer_last_read_at  = case when buyer_id  = (select auth.uid()) then now() else buyer_last_read_at end,
    seller_last_read_at = case when seller_id = (select auth.uid()) then now() else seller_last_read_at end
  where id = p_conversation and (select auth.uid()) in (buyer_id, seller_id)
$$;

-- The inbox: every conversation the person is in, newest first. A seller only sees conversations that have a message.
create function public.my_conversations() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(q.row order by q.sort desc), '[]'::jsonb) from (
    select coalesce(c.last_message_at, c.created_at) as sort, jsonb_build_object(
      'id', c.id, 'listing_id', l.id, 'last_message_at', c.last_message_at,
      'as_buyer', c.buyer_id = (select auth.uid()),
      'listing', jsonb_build_object('address', l.address, 'price', l.price, 'mode', l.mode, 'type', l.type, 'status', l.status,
        'cover', (select p.path from public.listing_photos p where p.listing_id = l.id order by p.sort_order limit 1)),
      'other', (select jsonb_build_object('name', pp.name, 'verified', pp.is_verified) from public.public_profiles pp
                where pp.id = case when c.buyer_id = (select auth.uid()) then c.seller_id else c.buyer_id end),
      'last', (select jsonb_build_object('body', m.body, 'mine', m.sender_id = (select auth.uid())) from public.messages m
               where m.conversation_id = c.id order by m.created_at desc limit 1),
      'unread', (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> (select auth.uid())
                 and m.created_at > case when c.buyer_id = (select auth.uid()) then c.buyer_last_read_at else c.seller_last_read_at end)
    ) as row
    from public.conversations c join public.listings l on l.id = c.listing_id
    where (select auth.uid()) in (c.buyer_id, c.seller_id)
      and (c.buyer_id = (select auth.uid()) or c.last_message_at is not null)
  ) q
$$;

create function public.my_unread_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.messages m join public.conversations c on c.id = m.conversation_id
  where (select auth.uid()) in (c.buyer_id, c.seller_id) and m.sender_id <> (select auth.uid())
    and m.created_at > case when c.buyer_id = (select auth.uid()) then c.buyer_last_read_at else c.seller_last_read_at end
$$;

revoke execute on function public.start_conversation(uuid), public.mark_conversation_read(uuid), public.my_conversations(), public.my_unread_count() from public, anon;
grant execute on function public.start_conversation(uuid), public.mark_conversation_read(uuid), public.my_conversations(), public.my_unread_count() to authenticated;
revoke execute on function public.in_conversation(uuid), public.on_message_sent() from public, anon;
grant execute on function public.in_conversation(uuid) to authenticated;

-- new messages reach open chats instantly (row level security still decides who receives them)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
