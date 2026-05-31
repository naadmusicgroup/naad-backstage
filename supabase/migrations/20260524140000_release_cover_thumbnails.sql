alter table public.releases
  add column if not exists source_cover_art_url text,
  add column if not exists cover_storage_path text,
  add column if not exists cover_thumb_url text,
  add column if not exists cover_thumb_storage_path text;
