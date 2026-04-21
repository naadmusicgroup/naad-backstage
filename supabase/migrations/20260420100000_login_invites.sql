create table if not exists public.login_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'artist')),
  full_name text not null,
  artist_name text,
  country text,
  bio text,
  provider text not null default 'google' check (provider in ('google')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid not null references public.profiles (id) on delete restrict,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint login_invites_artist_name_required check (
    (role = 'artist' and artist_name is not null and btrim(artist_name) <> '')
    or role = 'admin'
  )
);

create unique index if not exists idx_login_invites_email on public.login_invites (lower(email));
create index if not exists idx_login_invites_status on public.login_invites (status, created_at desc);

drop trigger if exists login_invites_set_updated_at on public.login_invites;
create trigger login_invites_set_updated_at before update on public.login_invites for each row execute function public.set_updated_at();

alter table public.login_invites enable row level security;

drop policy if exists login_invites_select on public.login_invites;
create policy login_invites_select on public.login_invites
for select
using (public.is_admin());

drop policy if exists login_invites_admin_write on public.login_invites;
create policy login_invites_admin_write on public.login_invites
for all
using (public.is_admin())
with check (public.is_admin());

alter table public.login_invites force row level security;
