alter table public.tracks
  add column if not exists lyrics text;

create table if not exists public.artist_dsp_profile_preferences (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  platform text not null check (platform in ('spotify', 'apple_music', 'amazon_music')),
  profile_exists boolean not null default false,
  profile_url text,
  display_name text,
  avatar_url text,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, platform),
  constraint artist_dsp_profile_url_required check (
    profile_exists = false
    or nullif(trim(coalesce(profile_url, '')), '') is not null
  )
);

drop trigger if exists artist_dsp_profile_preferences_set_updated_at on public.artist_dsp_profile_preferences;
create trigger artist_dsp_profile_preferences_set_updated_at
before update on public.artist_dsp_profile_preferences
for each row execute function public.set_updated_at();

alter table public.artist_dsp_profile_preferences enable row level security;

drop policy if exists artist_dsp_profile_preferences_select on public.artist_dsp_profile_preferences;
create policy artist_dsp_profile_preferences_select on public.artist_dsp_profile_preferences
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists artist_dsp_profile_preferences_upsert on public.artist_dsp_profile_preferences;
create policy artist_dsp_profile_preferences_upsert on public.artist_dsp_profile_preferences
for all
using (public.is_admin() or public.can_access_artist(artist_id))
with check (public.is_admin() or public.can_access_artist(artist_id));

alter table public.artist_dsp_profile_preferences force row level security;

grant select, insert, update, delete on public.artist_dsp_profile_preferences to authenticated;
