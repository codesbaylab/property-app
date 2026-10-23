-- Who can set a listing's source. Demo (seed) listings are never taken down by the expiry job, and bulk import is for verified agents,
-- so ordinary accounts may only create 'manual' listings.
create function public.guard_listing_source() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if session_user in ('postgres', 'supabase_admin') or (select auth.role()) = 'service_role' or public.is_admin() then
    return new;
  end if;
  if new.source = 'manual' then return new; end if;
  if new.source = 'import' and (select p.agent_status from public.profiles p where p.id = new.owner_id) = 'verified' then return new; end if;
  raise exception 'Only verified agents can import listings';
end $$;
create trigger listings_source_guard before insert on public.listings for each row execute function public.guard_listing_source();
