alter table public.tracks
  add column if not exists tiktok_preview_start_seconds integer;

alter table public.tracks
  drop constraint if exists tracks_tiktok_preview_start_seconds_check;

alter table public.tracks
  add constraint tracks_tiktok_preview_start_seconds_check
  check (
    tiktok_preview_start_seconds is null
    or (
      tiktok_preview_start_seconds >= 0
      and tiktok_preview_start_seconds <= 3599
    )
  );
