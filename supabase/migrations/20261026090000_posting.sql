-- Posting: photo storage, the free-listing limit, and the "My homes" read.

-- ---------------------------------------------------------------- photo storage
-- Anyone can see photos; people can only add, change or remove files inside their own folder (<user id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy listing_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy listing_photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy listing_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- free listing limit
-- Owners may have 3 listings at a time (drafts, waiting for review, live or hidden). Verified agents and the team are exempt.
create function public.guard_listing_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if session_user in ('postgres', 'supabase_admin') or (select auth.role()) = 'service_role' or public.is_admin() then
    return new;
  end if;
  if (select p.agent_status from public.profiles p where p.id = new.owner_id) = 'verified' then
    return new;
  end if;
  if (select count(*) from public.listings l
      where l.owner_id = new.owner_id and l.status in ('draft', 'pending', 'live', 'hidden', 'rejected')) >= 3 then
    raise exception 'Free accounts can have up to 3 listings. Delete one or mark it sold or rented to add another.';
  end if;
  return new;
end $$;
create trigger listings_limit before insert on public.listings for each row execute function public.guard_listing_limit();

-- A listing that goes back for review is no longer rejected for the old reason
create function public.clear_reject_reason() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'pending' and old.status = 'rejected' then new.reject_reason = null; end if;
  return new;
end $$;
-- runs after the ownership guard (triggers fire in name order), and only touches the one field the guard protects
create trigger listings_zclear_reason before update on public.listings for each row execute function public.clear_reject_reason();

-- ---------------------------------------------------------------- my homes
-- The signed-in person's own listings with position, photos and the team's feedback, newest first.
create function public.my_listings() returns jsonb
language sql stable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(row order by created_at desc), '[]'::jsonb) from (
    select l.created_at, jsonb_build_object(
      'id', l.id, 'status', l.status, 'reject_reason', l.reject_reason, 'created_at', l.created_at,
      'lat', st_y(l.location::geometry), 'lng', st_x(l.location::geometry),
      'mode', l.mode, 'type', l.type, 'price', l.price, 'deposit', l.deposit, 'maintenance', l.maintenance,
      'beds', l.beds, 'baths', l.baths, 'area_sqft', l.area_sqft, 'floor', l.floor, 'total_floors', l.total_floors,
      'facing', l.facing, 'furnishing', l.furnishing, 'age_years', l.age_years, 'description', l.description,
      'address', l.address, 'locality', l.locality, 'city', l.city, 'amenities', l.amenities, 'rera_id', l.rera_id,
      'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path) order by p.sort_order) from public.listing_photos p where p.listing_id = l.id), '[]'::jsonb)
    ) as row
    from public.listings l
    where l.owner_id = (select auth.uid())
  ) q
$$;
revoke execute on function public.my_listings() from public, anon;
grant execute on function public.my_listings() to authenticated;
