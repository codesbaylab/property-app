-- Admin team permissions, as designed:
--   super_admin and moderator: review and change listings, verify agents, suspend users
--   support: can read listings and users, cannot change anything
-- Until now every admin role could do everything.

create function public.can_moderate() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.admin_users where user_id = (select auth.uid()) and role in ('super_admin', 'moderator')
  ), false)
$$;

-- listings: all admins can read, only moderators and super admins can change
drop policy listings_admin_all on public.listings;
create policy listings_admin_read   on public.listings for select to authenticated using (public.is_admin());
create policy listings_admin_update on public.listings for update to authenticated using (public.can_moderate()) with check (public.can_moderate());
create policy listings_admin_delete on public.listings for delete to authenticated using (public.can_moderate());

drop policy photos_admin_all on public.listing_photos;
create policy photos_admin_read  on public.listing_photos for select to authenticated using (public.is_admin());
create policy photos_admin_write on public.listing_photos for all    to authenticated using (public.can_moderate()) with check (public.can_moderate());

-- the columns only the team may change are granted to the API role, and the trigger below checks who is asking
grant update (is_verified, reject_reason, boosted_until, expires_at) on public.listings to authenticated;

create or replace function public.guard_listing_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if session_user in ('postgres', 'supabase_admin') or (select auth.role()) = 'service_role' or public.can_moderate() then
    return new;
  end if;
  if new.owner_id <> old.owner_id or new.is_verified <> old.is_verified or new.view_count <> old.view_count
     or new.boosted_until is distinct from old.boosted_until or new.reject_reason is distinct from old.reject_reason
     or new.expires_at is distinct from old.expires_at then
    raise exception 'These fields can only be changed by the Nestmap team';
  end if;
  if new.status is distinct from old.status
     and (old.status::text || '>' || new.status::text) not in
         ('draft>pending', 'pending>draft', 'rejected>draft', 'rejected>pending', 'live>hidden', 'live>sold_or_rented', 'hidden>pending', 'expired>pending') then
    raise exception 'A listing cannot move from % to %', old.status, new.status;
  end if;
  return new;
end $$;

-- profiles: moderators can verify agents and suspend accounts; nobody else can touch those fields
grant update (account_status, agent_status) on public.profiles to authenticated;
create policy profiles_admin_update on public.profiles for update to authenticated using (public.can_moderate()) with check (public.can_moderate());

create function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if session_user in ('postgres', 'supabase_admin') or (select auth.role()) = 'service_role' or public.can_moderate() then
    return new;
  end if;
  if new.account_status <> old.account_status or new.agent_status <> old.agent_status then
    raise exception 'These fields can only be changed by the Nestmap team';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();
