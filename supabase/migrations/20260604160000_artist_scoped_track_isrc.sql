alter table public.tracks
  add column if not exists artist_id uuid references public.artists (id) on delete restrict;

update public.tracks as track
set
  artist_id = release.artist_id,
  isrc = upper(btrim(track.isrc))
from public.releases as release
where release.id = track.release_id
  and (
    track.artist_id is distinct from release.artist_id
    or track.isrc is distinct from upper(btrim(track.isrc))
  );

alter table public.tracks
  alter column artist_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tracks'::regclass
      and conname = 'tracks_artist_id_fkey'
  ) then
    alter table public.tracks
      add constraint tracks_artist_id_fkey
      foreign key (artist_id)
      references public.artists (id)
      on delete restrict;
  end if;
end;
$$;

create or replace function public.sync_track_artist_id_from_release()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owning_artist_id uuid;
begin
  select artist_id
  into owning_artist_id
  from public.releases
  where id = new.release_id;

  if owning_artist_id is null then
    raise exception 'Track release does not exist.';
  end if;

  new.artist_id := owning_artist_id;
  new.isrc := upper(btrim(new.isrc));

  return new;
end;
$$;

drop trigger if exists sync_track_artist_id_from_release on public.tracks;

create trigger sync_track_artist_id_from_release
before insert or update of release_id, artist_id, isrc
on public.tracks
for each row
execute function public.sync_track_artist_id_from_release();

create or replace function public.sync_tracks_artist_id_after_release_owner_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.artist_id is distinct from old.artist_id then
    update public.tracks
    set artist_id = new.artist_id
    where release_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_tracks_artist_id_after_release_owner_change on public.releases;

create trigger sync_tracks_artist_id_after_release_owner_change
after update of artist_id
on public.releases
for each row
execute function public.sync_tracks_artist_id_after_release_owner_change();

alter table public.tracks
  drop constraint if exists tracks_isrc_key;

drop index if exists public.tracks_isrc_key;

create index if not exists idx_tracks_artist_id
  on public.tracks (artist_id);

create unique index if not exists tracks_artist_isrc_unique
  on public.tracks (artist_id, upper(btrim(isrc)));
