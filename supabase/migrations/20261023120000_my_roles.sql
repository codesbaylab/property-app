-- What kind of account is signed in? Used by the app to show the right labels (agent, owner, admin team).
create function public.my_roles() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admin_role',   (select a.role from public.admin_users a where a.user_id = (select auth.uid())),
    'agent_status', (select p.agent_status from public.profiles p where p.id = (select auth.uid())),
    'listings',     (select count(*) from public.listings l where l.owner_id = (select auth.uid()))
  )
$$;
revoke execute on function public.my_roles() from public, anon;
grant execute on function public.my_roles() to authenticated;
