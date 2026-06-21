-- Pin a stable search_path on the set_updated_at trigger function.
--
-- The Supabase database linter (0011_function_search_path_mutable) flagged
-- public.set_updated_at as having a role-mutable search_path. Every other
-- function in the schema already pins `set search_path = public`; this brings
-- the lone trigger function in line so it cannot resolve objects through an
-- attacker-influenced search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
