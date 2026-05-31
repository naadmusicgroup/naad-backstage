create index if not exists idx_releases_artist_sort
  on public.releases (artist_id, release_date desc nulls last, created_at desc, id);

create index if not exists idx_tracks_release_sort
  on public.tracks (release_id, track_number asc nulls last, created_at asc, id);

create index if not exists idx_release_collaborators_artist_release
  on public.release_collaborators (artist_id, release_id);
