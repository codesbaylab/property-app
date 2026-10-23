-- Admin tools: reports from users, an activity log, and the actions the admin dashboard performs.
-- Every admin action is a function that checks the caller's role itself and writes to the activity log.

-- ---------------------------------------------------------------- reports (from the app)
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('listing', 'user')),
  target_id   uuid not null,
  reason      text not null check (char_length(reason) between 3 and 80),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  handled_by  uuid references public.profiles (id) on delete set null,
  handled_at  timestamptz,
  resolution  text,
  created_at  timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)          -- one report per person per item
);
create index reports_status_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);
alter table public.reports enable row level security;
create policy reports_insert_own on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy reports_read_own   on public.reports for select to authenticated using (reporter_id = (select auth.uid()));
create policy reports_admin_read on public.reports for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.reports from anon, authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;

-- ---------------------------------------------------------------- activity log
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text,
  action      text not null,
  target_type text not null,
  target_id   text,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_log_target_idx on public.audit_log (target_type, target_id, created_at desc);
create index audit_log_time_idx   on public.audit_log (created_at desc);
alter table public.audit_log enable row level security;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_log from anon, authenticated;

create function public.log_admin(p_action text, p_type text, p_target text, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, actor_name, action, target_type, target_id, details)
  values ((select auth.uid()), (select p.name from public.profiles p where p.id = (select auth.uid())), p_action, p_type, p_target, coalesce(p_details, '{}'))
$$;
revoke execute on function public.log_admin(text, text, text, jsonb) from public, anon, authenticated;

-- three open reports on a live listing hide it automatically until the team has looked
create function public.on_report_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if new.target_type = 'listing' then
    select count(*) into n from public.reports where target_type = 'listing' and target_id = new.target_id and status = 'open';
    if n >= 3 then
      update public.listings set status = 'hidden' where id = new.target_id and status = 'live';
      if found then
        insert into public.audit_log (actor_name, action, target_type, target_id, details)
        values ('System', 'listing.auto_hide', 'listing', new.target_id::text, jsonb_build_object('open_reports', n));
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger reports_after_insert after insert on public.reports for each row execute function public.on_report_created();

-- ---------------------------------------------------------------- dashboard numbers
create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin team only'; end if;
  return jsonb_build_object(
    'listings', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.listings group by status) s), '{}'),
    'users', (select count(*) from public.profiles),
    'agents_verified', (select count(*) from public.profiles where agent_status = 'verified'),
    'agents_pending', (select count(*) from public.profiles where agent_status = 'pending'),
    'suspended', (select count(*) from public.profiles where account_status <> 'active'),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'saved', (select count(*) from public.saved_listings),
    'live_by_type', coalesce((select jsonb_object_agg(type, n) from (select type, count(*) n from public.listings where status = 'live' group by type) t), '{}'),
    'daily', (select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
              from generate_series(current_date - 13, current_date, interval '1 day') d
              left join (select created_at::date as day, count(*) as n from public.listings group by 1) c on c.day = d::date)
  );
end $$;

-- ---------------------------------------------------------------- listings
create function public.admin_listings(
  p_status text default null, p_search text default null, p_mode text default null, p_type text default null,
  p_limit int default 25, p_offset int default 0
) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare total int; rows jsonb; q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then raise exception 'Admin team only'; end if;
  with f as (
    select l.*, p.name owner_name, u.email owner_email
    from public.listings l
    join public.profiles p on p.id = l.owner_id
    left join auth.users u on u.id = l.owner_id
    where (p_status is null or l.status::text = p_status)
      and (p_mode is null or l.mode::text = p_mode)
      and (p_type is null or l.type::text = p_type)
      and (q is null or l.address ilike '%' || q || '%' or l.locality ilike '%' || q || '%' or p.name ilike '%' || q || '%'
           or u.email ilike '%' || q || '%' or l.id::text = q)
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(r) from (
           select jsonb_build_object(
             'id', f.id, 'address', f.address, 'locality', f.locality, 'type', f.type, 'mode', f.mode, 'price', f.price, 'status', f.status,
             'is_verified', f.is_verified, 'created_at', f.created_at, 'owner_id', f.owner_id, 'owner_name', f.owner_name, 'owner_email', f.owner_email,
             'posted_as', f.posted_as, 'reject_reason', f.reject_reason,
             'photos', (select count(*) from public.listing_photos ph where ph.listing_id = f.id),
             'cover', (select ph.path from public.listing_photos ph where ph.listing_id = f.id order by ph.sort_order limit 1),
             'open_reports', (select count(*) from public.reports r where r.target_type = 'listing' and r.target_id = f.id and r.status = 'open')
           ) r
           from f order by f.created_at desc limit least(p_limit, 100) offset greatest(p_offset, 0)
         ) x), '[]'::jsonb)
  into total, rows;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

create function public.admin_listing_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare l public.listings; ppsf numeric; avg_ppsf numeric; ratio numeric; dups int; photos int; flags jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'Admin team only'; end if;
  select * into l from public.listings where id = p_id;
  if not found then return null; end if;
  select count(*) into photos from public.listing_photos where listing_id = p_id;
  select count(*) into dups from public.listings x where x.id <> l.id and x.status <> 'rejected' and lower(x.address) = lower(l.address) and coalesce(x.locality, '') = coalesce(l.locality, '');
  if l.area_sqft > 0 then
    ppsf := l.price / l.area_sqft;
    select avg(x.price / x.area_sqft) into avg_ppsf from public.listings x where x.status = 'live' and x.mode = l.mode and x.type = l.type and x.area_sqft > 0 and x.id <> l.id;
    if avg_ppsf > 0 then ratio := ppsf / avg_ppsf; end if;
  end if;
  flags := flags || jsonb_build_array(case when photos >= 3 then jsonb_build_object('level', 'ok', 'text', photos || ' photos') else jsonb_build_object('level', 'warn', 'text', 'Only ' || photos || ' photo(s), at least 3 are expected') end);
  flags := flags || jsonb_build_array(case when dups = 0 then jsonb_build_object('level', 'ok', 'text', 'No duplicate address') else jsonb_build_object('level', 'warn', 'text', 'Same address as ' || dups || ' other listing(s)') end);
  if ratio is not null then
    flags := flags || jsonb_build_array(case
      when ratio < 0.6 then jsonb_build_object('level', 'warn', 'text', 'Price per sq ft is ' || round((1 - ratio) * 100) || '% below similar live listings')
      when ratio > 1.8 then jsonb_build_object('level', 'warn', 'text', 'Price per sq ft is ' || round((ratio - 1) * 100) || '% above similar live listings')
      else jsonb_build_object('level', 'ok', 'text', 'Price is in line with similar listings') end);
  end if;
  flags := flags || jsonb_build_array(case when coalesce(length(trim(l.description)), 0) >= 40 then jsonb_build_object('level', 'ok', 'text', 'Has a description') else jsonb_build_object('level', 'warn', 'text', 'Description is missing or very short') end);
  return jsonb_build_object(
    'id', l.id, 'status', l.status, 'mode', l.mode, 'type', l.type, 'price', l.price, 'deposit', l.deposit, 'maintenance', l.maintenance,
    'beds', l.beds, 'baths', l.baths, 'area_sqft', l.area_sqft, 'floor', l.floor, 'facing', l.facing, 'furnishing', l.furnishing,
    'address', l.address, 'locality', l.locality, 'city', l.city, 'description', l.description, 'amenities', l.amenities,
    'lat', extensions.st_y(l.location::extensions.geometry), 'lng', extensions.st_x(l.location::extensions.geometry),
    'is_verified', l.is_verified, 'reject_reason', l.reject_reason, 'created_at', l.created_at, 'expires_at', l.expires_at, 'posted_as', l.posted_as, 'source', l.source,
    'photos', coalesce((select jsonb_agg(ph.path order by ph.sort_order) from public.listing_photos ph where ph.listing_id = l.id), '[]'::jsonb),
    'owner', (select jsonb_build_object('id', p.id, 'name', p.name, 'email', u.email, 'phone', p.phone, 'agent_status', p.agent_status, 'account_status', p.account_status,
                'listings', (select count(*) from public.listings o where o.owner_id = p.id))
              from public.profiles p left join auth.users u on u.id = p.id where p.id = l.owner_id),
    'flags', flags,
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc)
                         from public.reports r where r.target_type = 'listing' and r.target_id = l.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(h order by h.created_at desc) from (
                  select a.action, a.actor_name, a.details, a.created_at from public.audit_log a where a.target_type = 'listing' and a.target_id = l.id::text order by a.created_at desc limit 20) h), '[]'::jsonb)
  );
end $$;

create function public.admin_review_listing(p_id uuid, p_action text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.listings; reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.can_moderate() then raise exception 'Only moderators and super admins can do this'; end if;
  select * into l from public.listings where id = p_id for update;
  if not found then raise exception 'Listing not found'; end if;
  if p_action = 'approve' then
    if l.status not in ('pending', 'hidden', 'rejected', 'expired') then raise exception 'A % listing cannot be approved', l.status; end if;
    update public.listings set status = 'live', is_verified = true, reject_reason = null, expires_at = now() + interval '30 days' where id = p_id;
  elsif p_action = 'reject' then
    if reason is null then raise exception 'A reason is required'; end if;
    update public.listings set status = 'rejected', reject_reason = reason where id = p_id;
  elsif p_action = 'request_changes' then
    if reason is null then raise exception 'Tell the owner what to change'; end if;
    update public.listings set status = 'rejected', reject_reason = 'Changes requested: ' || reason where id = p_id;
  elsif p_action = 'unpublish' then
    if l.status <> 'live' then raise exception 'Only live listings can be unpublished'; end if;
    update public.listings set status = 'hidden' where id = p_id;
  else
    raise exception 'Unknown action %', p_action;
  end if;
  perform public.log_admin('listing.' || p_action, 'listing', p_id::text, jsonb_build_object('reason', reason, 'from', l.status));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- users
create function public.admin_users(p_search text default null, p_filter text default 'all', p_limit int default 25, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total int; rows jsonb; q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then raise exception 'Admin team only'; end if;
  with f as (
    select p.*, u.email, u.last_sign_in_at, a.role admin_role,
           (select count(*) from public.listings l where l.owner_id = p.id) listings,
           (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = p.id and r.status = 'open') open_reports
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join public.admin_users a on a.user_id = p.id
    where (q is null or p.name ilike '%' || q || '%' or u.email ilike '%' || q || '%' or p.phone ilike '%' || q || '%' or p.id::text = q)
      and case coalesce(p_filter, 'all')
            when 'agents' then p.agent_status = 'verified'
            when 'pending_agents' then p.agent_status = 'pending'
            when 'owners' then exists (select 1 from public.listings l where l.owner_id = p.id)
            when 'suspended' then p.account_status <> 'active'
            when 'admins' then a.role is not null
            else true end
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(r) from (
           select jsonb_build_object('id', f.id, 'name', f.name, 'email', f.email, 'phone', f.phone, 'city', f.city, 'account_status', f.account_status,
                  'agent_status', f.agent_status, 'admin_role', f.admin_role, 'listings', f.listings, 'open_reports', f.open_reports,
                  'created_at', f.created_at, 'last_sign_in_at', f.last_sign_in_at) r
           from f order by f.created_at desc limit least(p_limit, 100) offset greatest(p_offset, 0)) x), '[]'::jsonb)
  into total, rows;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

create function public.admin_set_user_status(p_user uuid, p_account text default null, p_agent text default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare target_admin public.admin_role; hidden int := 0;
begin
  if not public.can_moderate() then raise exception 'Only moderators and super admins can do this'; end if;
  if p_user = (select auth.uid()) then raise exception 'You cannot change your own account'; end if;
  select role into target_admin from public.admin_users where user_id = p_user;
  if target_admin = 'super_admin' and (select role from public.admin_users where user_id = (select auth.uid())) <> 'super_admin' then
    raise exception 'Only a super admin can change a super admin';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'User not found'; end if;
  update public.profiles set
    account_status = coalesce(p_account::public.account_status, account_status),
    agent_status   = coalesce(p_agent::public.agent_status, agent_status)
  where id = p_user;
  if p_account in ('suspended', 'banned') then
    update public.listings set status = 'hidden' where owner_id = p_user and status = 'live';
    get diagnostics hidden = row_count;
  end if;
  perform public.log_admin('user.update', 'user', p_user::text, jsonb_build_object('account_status', p_account, 'agent_status', p_agent, 'reason', nullif(trim(coalesce(p_reason, '')), ''), 'listings_hidden', hidden));
  return jsonb_build_object('ok', true, 'listings_hidden', hidden);
end $$;

-- ---------------------------------------------------------------- reports
create function public.admin_reports(p_status text default 'open', p_limit int default 25, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total int; rows jsonb;
begin
  if not public.is_admin() then raise exception 'Admin team only'; end if;
  with f as (select r.* from public.reports r where (p_status is null or r.status = p_status))
  select (select count(*) from f),
         coalesce((select jsonb_agg(x.r) from (
           select jsonb_build_object('id', f.id, 'target_type', f.target_type, 'target_id', f.target_id, 'reason', f.reason, 'details', f.details,
                  'status', f.status, 'resolution', f.resolution, 'created_at', f.created_at, 'handled_at', f.handled_at,
                  'reporter', (select p.name from public.profiles p where p.id = f.reporter_id),
                  'target_label', case f.target_type
                      when 'listing' then (select l.address || coalesce(', ' || l.locality, '') from public.listings l where l.id = f.target_id)
                      else (select p.name from public.profiles p where p.id = f.target_id) end,
                  'target_status', case f.target_type
                      when 'listing' then (select l.status::text from public.listings l where l.id = f.target_id)
                      else (select p.account_status::text from public.profiles p where p.id = f.target_id) end,
                  'same_target', (select count(*) from public.reports o where o.target_type = f.target_type and o.target_id = f.target_id and o.status = 'open')) r
           from f order by f.created_at desc limit least(p_limit, 100) offset greatest(p_offset, 0)) x), '[]'::jsonb)
  into total, rows;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

create function public.admin_handle_report(p_id uuid, p_outcome text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.reports; owner uuid; note text := nullif(trim(coalesce(p_note, '')), ''); new_status text;
begin
  if not public.can_moderate() then raise exception 'Only moderators and super admins can do this'; end if;
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'Report not found'; end if;
  if p_outcome = 'dismiss' then
    new_status := 'dismissed';
  elsif p_outcome = 'hide_listing' then
    if r.target_type <> 'listing' then raise exception 'This report is not about a listing'; end if;
    update public.listings set status = 'hidden' where id = r.target_id and status = 'live';
    new_status := 'resolved';
  elsif p_outcome = 'suspend_user' then
    owner := case r.target_type when 'user' then r.target_id else (select l.owner_id from public.listings l where l.id = r.target_id) end;
    if owner is null then raise exception 'Nobody to suspend'; end if;
    if owner = (select auth.uid()) then raise exception 'You cannot suspend yourself'; end if;
    update public.profiles set account_status = 'suspended' where id = owner;
    update public.listings set status = 'hidden' where owner_id = owner and status = 'live';
    new_status := 'resolved';
  elsif p_outcome = 'resolve' then
    new_status := 'resolved';
  else
    raise exception 'Unknown outcome %', p_outcome;
  end if;
  update public.reports set status = new_status, handled_by = (select auth.uid()), handled_at = now(), resolution = coalesce(note, p_outcome)
  where target_type = r.target_type and target_id = r.target_id and status = 'open';
  perform public.log_admin('report.' || p_outcome, r.target_type, r.target_id::text, jsonb_build_object('report', p_id, 'note', note));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- admin team and activity log
create function public.admin_team() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin team only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'role', a.role, 'name', p.name, 'email', u.email, 'last_sign_in_at', u.last_sign_in_at, 'created_at', a.created_at) order by a.created_at)
                   from public.admin_users a join public.profiles p on p.id = a.user_id left join auth.users u on u.id = a.user_id), '[]'::jsonb);
end $$;

create function public.admin_set_role(p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if (select role from public.admin_users where user_id = (select auth.uid())) is distinct from 'super_admin' then raise exception 'Only a super admin can manage the team'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No account with that email. The person must sign up first.'; end if;
  if uid = (select auth.uid()) then raise exception 'You cannot change your own role'; end if;
  if p_role = 'none' then
    delete from public.admin_users where user_id = uid;
  elsif p_role in ('super_admin', 'moderator', 'support') then
    insert into public.admin_users (user_id, role) values (uid, p_role::public.admin_role) on conflict (user_id) do update set role = excluded.role;
  else
    raise exception 'Unknown role %', p_role;
  end if;
  perform public.log_admin('team.set_role', 'user', uid::text, jsonb_build_object('email', lower(trim(p_email)), 'role', p_role));
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_audit(p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total int;
begin
  if not public.is_admin() then raise exception 'Admin team only'; end if;
  select count(*) into total from public.audit_log;
  return jsonb_build_object('total', total, 'rows', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'actor_name', a.actor_name, 'target_type', a.target_type, 'target_id', a.target_id, 'details', a.details, 'created_at', a.created_at) order by a.id desc)
    from (select * from public.audit_log order by id desc limit least(p_limit, 200) offset greatest(p_offset, 0)) a), '[]'::jsonb));
end $$;

-- the functions check the caller's role themselves; only signed-in accounts may call them
do $$
declare f text;
begin
  foreach f in array array[
    'admin_stats()', 'admin_listings(text,text,text,text,int,int)', 'admin_listing_detail(uuid)', 'admin_review_listing(uuid,text,text)',
    'admin_users(text,text,int,int)', 'admin_set_user_status(uuid,text,text,text)', 'admin_reports(text,int,int)', 'admin_handle_report(uuid,text,text)',
    'admin_team()', 'admin_set_role(text,text)', 'admin_audit(int,int)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
