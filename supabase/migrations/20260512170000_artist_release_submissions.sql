create table if not exists public.artist_release_submissions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null unique references public.releases (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete restrict,
  submitted_by uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  source_cover_art_url text not null,
  final_cover_art_url text,
  target_stores jsonb not null default '[]'::jsonb,
  artist_notes text,
  admin_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_release_submission_tracks (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.artist_release_submissions (id) on delete cascade,
  track_id uuid not null unique references public.tracks (id) on delete cascade,
  source_audio_url text not null,
  final_audio_url text,
  source_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, track_id)
);

create index if not exists idx_artist_release_submissions_status_created
  on public.artist_release_submissions (status, created_at desc);

create index if not exists idx_artist_release_submissions_artist_created
  on public.artist_release_submissions (artist_id, created_at desc);

create index if not exists idx_artist_release_submission_tracks_submission
  on public.artist_release_submission_tracks (submission_id);

drop trigger if exists artist_release_submissions_set_updated_at on public.artist_release_submissions;
create trigger artist_release_submissions_set_updated_at
before update on public.artist_release_submissions
for each row
execute function public.set_updated_at();

drop trigger if exists artist_release_submission_tracks_set_updated_at on public.artist_release_submission_tracks;
create trigger artist_release_submission_tracks_set_updated_at
before update on public.artist_release_submission_tracks
for each row
execute function public.set_updated_at();

alter table public.artist_release_submissions enable row level security;
alter table public.artist_release_submission_tracks enable row level security;

drop policy if exists artist_release_submissions_select on public.artist_release_submissions;
create policy artist_release_submissions_select on public.artist_release_submissions
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists artist_release_submissions_artist_insert on public.artist_release_submissions;
create policy artist_release_submissions_artist_insert on public.artist_release_submissions
for insert
with check (
  public.can_access_artist(artist_id)
  and submitted_by = auth.uid()
);

drop policy if exists artist_release_submissions_admin_update on public.artist_release_submissions;
create policy artist_release_submissions_admin_update on public.artist_release_submissions
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists artist_release_submission_tracks_select on public.artist_release_submission_tracks;
create policy artist_release_submission_tracks_select on public.artist_release_submission_tracks
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.artist_release_submissions s
    where s.id = artist_release_submission_tracks.submission_id
      and public.can_access_artist(s.artist_id)
  )
);

drop policy if exists artist_release_submission_tracks_artist_insert on public.artist_release_submission_tracks;
create policy artist_release_submission_tracks_artist_insert on public.artist_release_submission_tracks
for insert
with check (
  exists (
    select 1
    from public.artist_release_submissions s
    where s.id = artist_release_submission_tracks.submission_id
      and public.can_access_artist(s.artist_id)
      and s.submitted_by = auth.uid()
  )
);

drop policy if exists artist_release_submission_tracks_admin_update on public.artist_release_submission_tracks;
create policy artist_release_submission_tracks_admin_update on public.artist_release_submission_tracks
for update
using (public.is_admin())
with check (public.is_admin());
