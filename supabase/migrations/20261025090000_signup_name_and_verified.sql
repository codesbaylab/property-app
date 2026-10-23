-- 1) A new account's name (typed on the sign-up form) becomes their profile name.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, name)
  values (new.id, new.phone, nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), ''))
  on conflict (id) do nothing;
  return new;
end $$;

-- 2) The map's lightweight listing rows now say whether a listing has been verified,
--    so the app only shows a "Verified" badge when it is true.
drop function public.listings_in_bounds(double precision, double precision, double precision, double precision, public.listing_mode, public.property_type, numeric, int, int);
create function public.listings_in_bounds(
  p_west double precision, p_south double precision, p_east double precision, p_north double precision,
  p_mode public.listing_mode,
  p_type public.property_type default null,
  p_max_price numeric default null,
  p_min_beds int default 0,
  p_limit int default 2000
) returns table (
  id uuid, lat double precision, lng double precision, mode public.listing_mode, price numeric, type public.property_type,
  beds int, baths int, area_sqft int, address text, cover_path text, boosted boolean, is_verified boolean
)
language sql stable set search_path = public, extensions as $$
  select l.id, st_y(l.location::geometry), st_x(l.location::geometry), l.mode, l.price, l.type,
         l.beds, l.baths, l.area_sqft, l.address,
         (select p.path from public.listing_photos p where p.listing_id = l.id order by p.sort_order limit 1),
         (l.boosted_until is not null and l.boosted_until > now()),
         l.is_verified
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
