-- Public profile of a verified agent: who they are and what they currently have on the map.
-- Only verified agents have one. The agency name and city come from their approved application; phone and documents stay private.

create function public.agent_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'agency', a.agency, 'city', a.city, 'since', p.created_at,
    'live_count', (select count(*) from public.listings l where l.owner_id = p.id and l.status = 'live'),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'mode', l.mode, 'type', l.type, 'price', l.price, 'address', l.address, 'beds', l.beds, 'baths', l.baths,
        'cover', (select ph.path from public.listing_photos ph where ph.listing_id = l.id order by ph.sort_order limit 1)
      ) order by l.created_at desc)
      from (select * from public.listings x where x.owner_id = p.id and x.status = 'live' order by x.created_at desc limit 30) l
    ), '[]'::jsonb)
  )
  from public.profiles p left join public.agent_applications a on a.user_id = p.id
  where p.id = p_id and p.agent_status = 'verified' and p.account_status = 'active'
$$;
revoke execute on function public.agent_profile(uuid) from public;
grant  execute on function public.agent_profile(uuid) to anon, authenticated;

-- the property page also needs to know whom to link to
create or replace function public.listing_detail(p_id uuid) returns jsonb
language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', l.id, 'lat', st_y(l.location::geometry), 'lng', st_x(l.location::geometry),
    'mode', l.mode, 'price', l.price, 'type', l.type, 'beds', l.beds, 'baths', l.baths, 'area_sqft', l.area_sqft,
    'address', l.address, 'locality', l.locality, 'city', l.city, 'description', l.description, 'amenities', l.amenities,
    'floor', l.floor, 'total_floors', l.total_floors, 'facing', l.facing, 'furnishing', l.furnishing, 'age_years', l.age_years,
    'available_from', l.available_from, 'rera_id', l.rera_id, 'is_verified', l.is_verified, 'deposit', l.deposit, 'maintenance', l.maintenance,
    'photos', coalesce((select jsonb_agg(p.path order by p.sort_order) from public.listing_photos p where p.listing_id = l.id), '[]'::jsonb),
    'agent', (select jsonb_build_object('id', pp.id, 'name', pp.name, 'verified', pp.is_verified) from public.public_profiles pp where pp.id = l.owner_id)
  )
  from public.listings l
  where l.id = p_id and (l.status = 'live' or l.owner_id = (select auth.uid()))
$$;
