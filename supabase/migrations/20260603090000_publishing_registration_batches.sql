create table if not exists public.publishing_writers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  first_name text,
  middle_name text,
  last_name text,
  ipi_number text,
  pro_name text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_by_artist_id uuid references public.artists (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_publishing_writers (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  writer_id uuid not null references public.publishing_writers (id) on delete cascade,
  source text not null default 'artist_saved' check (source in ('artist_saved', 'artist_submission', 'admin_direct')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, writer_id)
);

create table if not exists public.publishing_registration_batches (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete restrict,
  source text not null check (source in ('artist_request', 'admin_direct')),
  status text not null default 'pending_review' check (status in ('pending_review', 'partially_reviewed', 'accepted', 'rejected')),
  artist_notes text,
  admin_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.publishing_registration_tracks (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.publishing_registration_batches (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  track_id uuid references public.tracks (id) on delete set null,
  release_id uuid references public.releases (id) on delete set null,
  source text not null check (source in ('catalog', 'manual')),
  status text not null default 'pending_review' check (status in ('pending_review', 'accepted', 'rejected')),
  song_title text not null,
  performer_name text not null,
  spotify_url text,
  submitted_by uuid not null references public.profiles (id) on delete restrict,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publishing_registration_track_source_check check (
    (source = 'catalog' and track_id is not null and release_id is not null)
    or (source = 'manual' and track_id is null)
  )
);

create table if not exists public.publishing_registration_track_writers (
  id uuid primary key default gen_random_uuid(),
  registration_track_id uuid not null references public.publishing_registration_tracks (id) on delete cascade,
  writer_id uuid not null references public.publishing_writers (id) on delete restrict,
  role text not null default 'Songwriter',
  share_pct numeric(5,2) not null check (share_pct >= 0 and share_pct <= 100),
  collect_royalties boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_track_id, writer_id, role)
);

create index if not exists idx_publishing_writers_search
  on public.publishing_writers (lower(full_name), coalesce(ipi_number, ''));

create index if not exists idx_artist_publishing_writers_artist
  on public.artist_publishing_writers (artist_id, created_at desc);

create index if not exists idx_artist_publishing_writers_writer
  on public.artist_publishing_writers (writer_id);

create index if not exists idx_publishing_registration_batches_artist
  on public.publishing_registration_batches (artist_id, created_at desc);

create index if not exists idx_publishing_registration_batches_status
  on public.publishing_registration_batches (status, created_at desc);

create index if not exists idx_publishing_registration_tracks_artist_status
  on public.publishing_registration_tracks (artist_id, status, created_at desc);

create index if not exists idx_publishing_registration_tracks_batch
  on public.publishing_registration_tracks (batch_id, status, created_at desc);

create index if not exists idx_publishing_registration_track_writers_track
  on public.publishing_registration_track_writers (registration_track_id, sort_order);

create index if not exists idx_publishing_registration_track_writers_writer
  on public.publishing_registration_track_writers (writer_id);

drop trigger if exists publishing_writers_set_updated_at on public.publishing_writers;
create trigger publishing_writers_set_updated_at
before update on public.publishing_writers
for each row
execute function public.set_updated_at();

drop trigger if exists artist_publishing_writers_set_updated_at on public.artist_publishing_writers;
create trigger artist_publishing_writers_set_updated_at
before update on public.artist_publishing_writers
for each row
execute function public.set_updated_at();

drop trigger if exists publishing_registration_batches_set_updated_at on public.publishing_registration_batches;
create trigger publishing_registration_batches_set_updated_at
before update on public.publishing_registration_batches
for each row
execute function public.set_updated_at();

drop trigger if exists publishing_registration_tracks_set_updated_at on public.publishing_registration_tracks;
create trigger publishing_registration_tracks_set_updated_at
before update on public.publishing_registration_tracks
for each row
execute function public.set_updated_at();

drop trigger if exists publishing_registration_track_writers_set_updated_at on public.publishing_registration_track_writers;
create trigger publishing_registration_track_writers_set_updated_at
before update on public.publishing_registration_track_writers
for each row
execute function public.set_updated_at();

create or replace function public.enforce_publishing_registration_writer_shares()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_track_id uuid;
  track_exists boolean;
  writer_count integer;
  share_total numeric(8,2);
begin
  if tg_table_name = 'publishing_registration_tracks' then
    target_track_id := coalesce(new.id, old.id);
  else
    target_track_id := coalesce(new.registration_track_id, old.registration_track_id);
  end if;

  select exists (
    select 1
    from public.publishing_registration_tracks
    where id = target_track_id
  )
  into track_exists;

  if not track_exists then
    return coalesce(new, old);
  end if;

  select count(*), coalesce(sum(share_pct), 0)
  into writer_count, share_total
  from public.publishing_registration_track_writers
  where registration_track_id = target_track_id;

  if writer_count = 0 or abs(share_total - 100) > 0.001 then
    raise exception 'Publishing writer shares must total exactly 100 percent for each track.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists publishing_registration_track_writers_share_guard on public.publishing_registration_track_writers;
create constraint trigger publishing_registration_track_writers_share_guard
after insert or update or delete on public.publishing_registration_track_writers
deferrable initially deferred
for each row
execute function public.enforce_publishing_registration_writer_shares();

alter table public.publishing_writers enable row level security;
alter table public.artist_publishing_writers enable row level security;
alter table public.publishing_registration_batches enable row level security;
alter table public.publishing_registration_tracks enable row level security;
alter table public.publishing_registration_track_writers enable row level security;

drop policy if exists publishing_writers_select on public.publishing_writers;
create policy publishing_writers_select on public.publishing_writers
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.artist_publishing_writers scoped_writer
    where scoped_writer.writer_id = publishing_writers.id
      and public.can_access_artist(scoped_writer.artist_id)
  )
);

drop policy if exists publishing_writers_admin_write on public.publishing_writers;
create policy publishing_writers_admin_write on public.publishing_writers
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists artist_publishing_writers_select on public.artist_publishing_writers;
create policy artist_publishing_writers_select on public.artist_publishing_writers
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists artist_publishing_writers_admin_write on public.artist_publishing_writers;
create policy artist_publishing_writers_admin_write on public.artist_publishing_writers
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists publishing_registration_batches_select on public.publishing_registration_batches;
create policy publishing_registration_batches_select on public.publishing_registration_batches
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists publishing_registration_batches_admin_write on public.publishing_registration_batches;
create policy publishing_registration_batches_admin_write on public.publishing_registration_batches
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists publishing_registration_tracks_select on public.publishing_registration_tracks;
create policy publishing_registration_tracks_select on public.publishing_registration_tracks
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists publishing_registration_tracks_admin_write on public.publishing_registration_tracks;
create policy publishing_registration_tracks_admin_write on public.publishing_registration_tracks
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists publishing_registration_track_writers_select on public.publishing_registration_track_writers;
create policy publishing_registration_track_writers_select on public.publishing_registration_track_writers
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.publishing_registration_tracks registration_track
    where registration_track.id = publishing_registration_track_writers.registration_track_id
      and public.can_access_artist(registration_track.artist_id)
  )
);

drop policy if exists publishing_registration_track_writers_admin_write on public.publishing_registration_track_writers;
create policy publishing_registration_track_writers_admin_write on public.publishing_registration_track_writers
for all
using (public.is_admin())
with check (public.is_admin());

alter table public.publishing_writers force row level security;
alter table public.artist_publishing_writers force row level security;
alter table public.publishing_registration_batches force row level security;
alter table public.publishing_registration_tracks force row level security;
alter table public.publishing_registration_track_writers force row level security;
