-- Becoming a verified agent: the person applies with their agency details and documents, the team approves or declines with a reason,
-- and a declined agent can fix things and apply again.

create table public.agent_applications (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  agency           text not null check (char_length(btrim(agency)) between 2 and 120),
  licence_no       text check (licence_no is null or char_length(licence_no) <= 60),
  city             text not null check (char_length(btrim(city)) between 2 and 80),
  phone            text not null check (phone ~ '^[0-9+() -]{7,20}$'),
  docs             text[] not null check (cardinality(docs) between 1 and 3),
  rejection_reason text,
  submitted_at     timestamptz not null default now(),
  reviewed_at      timestamptz
);
alter table public.agent_applications enable row level security;
create policy agent_app_read_own   on public.agent_applications for select to authenticated using (user_id = (select auth.uid()));
create policy agent_app_read_admin on public.agent_applications for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.agent_applications from anon, authenticated;

-- ---------------------------------------------------------------- documents (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agent-docs', 'agent-docs', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy agent_docs_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'agent-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy agent_docs_select_own on storage.objects for select to authenticated
  using (bucket_id = 'agent-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy agent_docs_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'agent-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy agent_docs_select_admin on storage.objects for select to authenticated
  using (bucket_id = 'agent-docs' and public.is_admin());

-- ---------------------------------------------------------------- applying
-- People may not change their own agent status, except to go from none / rejected to pending through apply_agent().
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_applying boolean := coalesce(current_setting('nestmap.agent_apply', true), '') = old.id::text;
begin
  if session_user in ('postgres', 'supabase_admin') or (select auth.role()) = 'service_role' or public.can_moderate() then
    return new;
  end if;
  if new.account_status <> old.account_status
     or (new.agent_status <> old.agent_status and not (v_applying and old.agent_status in ('none', 'rejected') and new.agent_status = 'pending')) then
    raise exception 'These fields can only be changed by the Nestmap team';
  end if;
  return new;
end $$;

create function public.apply_agent(p_agency text, p_licence text, p_city text, p_phone text, p_docs text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_status public.agent_status; d text;
begin
  if v_me is null then raise exception 'Sign in first'; end if;
  select agent_status into v_status from public.profiles where id = v_me and account_status = 'active';
  if not found then raise exception 'Your account cannot apply'; end if;
  if v_status not in ('none', 'rejected') then raise exception 'You have already applied'; end if;
  if p_docs is null or cardinality(p_docs) not between 1 and 3 then raise exception 'Add 1 to 3 documents'; end if;
  foreach d in array p_docs loop
    if split_part(d, '/', 1) <> v_me::text then raise exception 'Add 1 to 3 documents'; end if;
  end loop;
  insert into public.agent_applications as a (user_id, agency, licence_no, city, phone, docs)
    values (v_me, btrim(p_agency), nullif(btrim(coalesce(p_licence, '')), ''), btrim(p_city), btrim(p_phone), p_docs)
    on conflict (user_id) do update set agency = excluded.agency, licence_no = excluded.licence_no, city = excluded.city, phone = excluded.phone,
      docs = excluded.docs, rejection_reason = null, submitted_at = now(), reviewed_at = null;
  perform set_config('nestmap.agent_apply', v_me::text, true);
  update public.profiles set agent_status = 'pending' where id = v_me;
end $$;
revoke execute on function public.apply_agent(text, text, text, text, text[]) from public, anon;
grant  execute on function public.apply_agent(text, text, text, text, text[]) to authenticated;

-- ---------------------------------------------------------------- team decision
-- Same as before, plus: declining needs a reason (the agent sees it) and the application records the outcome.
create or replace function public.admin_set_user_status(p_user uuid, p_account text default null, p_agent text default null, p_reason text default null) returns jsonb
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
  if p_agent = 'rejected' and char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why, so the agent can fix it'; end if;
  update public.profiles set
    account_status = coalesce(p_account::public.account_status, account_status),
    agent_status   = coalesce(p_agent::public.agent_status, agent_status)
  where id = p_user;
  if p_agent in ('verified', 'rejected') then
    update public.agent_applications set reviewed_at = now(), rejection_reason = case when p_agent = 'rejected' then trim(p_reason) else null end where user_id = p_user;
  end if;
  if p_account in ('suspended', 'banned') then
    update public.listings set status = 'hidden' where owner_id = p_user and status = 'live';
    get diagnostics hidden = row_count;
  end if;
  perform public.log_admin('user.update', 'user', p_user::text, jsonb_build_object('account_status', p_account, 'agent_status', p_agent, 'reason', nullif(trim(coalesce(p_reason, '')), ''), 'listings_hidden', hidden));
  return jsonb_build_object('ok', true, 'listings_hidden', hidden);
end $$;
