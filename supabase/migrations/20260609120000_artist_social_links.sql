create table if not exists public.artist_social_links (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  platform text not null check (platform in ('facebook', 'tiktok', 'instagram', 'youtube')),
  url text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, platform),
  constraint artist_social_links_url_required check (
    nullif(trim(coalesce(url, '')), '') is not null
  )
);

drop trigger if exists artist_social_links_set_updated_at on public.artist_social_links;
create trigger artist_social_links_set_updated_at
before update on public.artist_social_links
for each row execute function public.set_updated_at();

alter table public.artist_social_links enable row level security;

drop policy if exists artist_social_links_select on public.artist_social_links;
create policy artist_social_links_select on public.artist_social_links
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists artist_social_links_upsert on public.artist_social_links;
create policy artist_social_links_upsert on public.artist_social_links
for all
using (public.is_admin() or public.can_access_artist(artist_id))
with check (public.is_admin() or public.can_access_artist(artist_id));

alter table public.artist_social_links force row level security;

grant select, insert, update, delete on public.artist_social_links to authenticated;
