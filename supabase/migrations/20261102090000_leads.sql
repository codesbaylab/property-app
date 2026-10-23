-- Leads: every person who has messaged about one of your homes, with a stage you move them through.
-- A lead is simply a conversation seen from the seller's side, so nothing new is stored except the stage.

alter table public.conversations add column seller_stage text not null default 'new' check (seller_stage in ('new', 'contacted', 'viewing', 'closed'));

-- the stage is changed through set_lead_stage() only (conversations already allow no direct writes)
create function public.set_lead_stage(p_conversation uuid, p_stage text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_stage not in ('new', 'contacted', 'viewing', 'closed') then raise exception 'Unknown stage'; end if;
  update public.conversations set seller_stage = p_stage where id = p_conversation and seller_id = (select auth.uid());
  if not found then raise exception 'Lead not found'; end if;
end $$;

-- Conversations where the signed-in person is the seller and the buyer has written, newest first.
create function public.my_leads() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(q.row order by q.sort desc), '[]'::jsonb) from (
    select c.last_message_at as sort, jsonb_build_object(
      'id', c.id, 'listing_id', l.id, 'stage', c.seller_stage, 'last_message_at', c.last_message_at,
      'listing', jsonb_build_object('address', l.address, 'price', l.price, 'mode', l.mode, 'type', l.type, 'status', l.status,
        'cover', (select p.path from public.listing_photos p where p.listing_id = l.id order by p.sort_order limit 1)),
      'buyer', (select jsonb_build_object('name', pp.name) from public.public_profiles pp where pp.id = c.buyer_id),
      'last', (select jsonb_build_object('body', m.body, 'mine', m.sender_id = (select auth.uid())) from public.messages m
               where m.conversation_id = c.id order by m.created_at desc limit 1),
      'unread', (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> (select auth.uid()) and m.created_at > c.seller_last_read_at),
      'visit', (select v.status from public.visits v where v.listing_id = c.listing_id and v.buyer_id = c.buyer_id
                and v.status in ('requested', 'proposed', 'confirmed') order by v.visit_at limit 1)
    ) as row
    from public.conversations c join public.listings l on l.id = c.listing_id
    where c.seller_id = (select auth.uid()) and c.last_message_at is not null
  ) q
$$;

revoke execute on function public.set_lead_stage(uuid, text), public.my_leads() from public, anon;
grant  execute on function public.set_lead_stage(uuid, text), public.my_leads() to authenticated;
