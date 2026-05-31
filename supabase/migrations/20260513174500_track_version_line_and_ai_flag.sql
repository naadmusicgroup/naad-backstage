alter table public.tracks
  add column if not exists version_line text,
  add column if not exists contains_ai_generated_elements boolean not null default false;
