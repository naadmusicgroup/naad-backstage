-- NaadLinks: saved smart-link pages built from Naad releases.
-- Admin-only. Each row stores the full release.json payload used to generate
-- the downloadable cPanel zip, plus references back to the source release.

create table if not exists public.naad_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  artist_id uuid references public.artists (id) on delete set null,
  release_id uuid references public.releases (id) on delete set null,
  track_id uuid references public.tracks (id) on delete set null,
  title text not null default '',
  artist_name text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint naad_links_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create index if not exists idx_naad_links_created_at on public.naad_links (created_at desc);
create index if not exists idx_naad_links_artist on public.naad_links (artist_id);

drop trigger if exists naad_links_set_updated_at on public.naad_links;
create trigger naad_links_set_updated_at
before update on public.naad_links
for each row execute function public.set_updated_at();

alter table public.naad_links enable row level security;

drop policy if exists naad_links_admin_all on public.naad_links;
create policy naad_links_admin_all on public.naad_links
for all
using (public.is_admin())
with check (public.is_admin());

alter table public.naad_links force row level security;

grant select, insert, update, delete on public.naad_links to authenticated;
