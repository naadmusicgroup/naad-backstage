-- Per-artist NaadLink subdomain, verified once over FTP and reused forever.
-- A subdomain (e.g. prabesh.naad.link) belongs to one artist and hosts all of
-- their release pages, so verification is an artist-level fact — not per link
-- and not tied to any slug.

create table if not exists public.naadlink_subdomains (
  artist_id uuid primary key references public.artists (id) on delete cascade,
  subdomain text not null,
  verified boolean not null default false,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint naadlink_subdomains_format check (subdomain ~ '^[a-z0-9-]+$')
);

-- One subdomain maps to exactly one artist.
create unique index if not exists idx_naadlink_subdomains_subdomain
  on public.naadlink_subdomains (subdomain);

drop trigger if exists naadlink_subdomains_set_updated_at on public.naadlink_subdomains;
create trigger naadlink_subdomains_set_updated_at
before update on public.naadlink_subdomains
for each row execute function public.set_updated_at();

alter table public.naadlink_subdomains enable row level security;

drop policy if exists naadlink_subdomains_admin_all on public.naadlink_subdomains;
create policy naadlink_subdomains_admin_all on public.naadlink_subdomains
for all
using (public.is_admin())
with check (public.is_admin());

alter table public.naadlink_subdomains force row level security;

grant select, insert, update, delete on public.naadlink_subdomains to authenticated;
