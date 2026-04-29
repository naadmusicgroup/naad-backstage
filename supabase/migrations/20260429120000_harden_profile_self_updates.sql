create or replace function public.reject_client_profile_role_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.role is distinct from new.role
    and current_role not in ('service_role', 'postgres', 'supabase_admin')
  then
    raise exception 'Profile role changes must be performed by the service role.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_reject_client_role_change on public.profiles;
create trigger profiles_reject_client_role_change
before update of role on public.profiles
for each row
execute function public.reject_client_profile_role_change();

revoke all on function public.reject_client_profile_role_change() from public, anon, authenticated;
grant execute on function public.reject_client_profile_role_change() to service_role;

drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_self_update on public.profiles;

create policy profiles_admin_update on public.profiles
for update
using (public.is_admin())
with check (public.is_admin());

create policy profiles_self_update on public.profiles
for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = 'artist'
);

revoke update on public.profiles from public, anon, authenticated;
grant update (full_name, avatar_url, phone, country, bio) on public.profiles to authenticated;
