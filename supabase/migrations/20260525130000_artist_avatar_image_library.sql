create table if not exists public.artist_avatar_images (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  storage_path text not null unique,
  avatar_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists artist_avatar_images_artist_created_idx
  on public.artist_avatar_images (artist_id, created_at desc);

alter table public.artist_avatar_images enable row level security;

drop policy if exists artist_avatar_images_select on public.artist_avatar_images;
create policy artist_avatar_images_select on public.artist_avatar_images
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists artist_avatar_images_insert on public.artist_avatar_images;
create policy artist_avatar_images_insert on public.artist_avatar_images
for insert
with check (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists artist_avatar_images_delete on public.artist_avatar_images;
create policy artist_avatar_images_delete on public.artist_avatar_images
for delete
using (public.is_admin() or public.can_access_artist(artist_id));
