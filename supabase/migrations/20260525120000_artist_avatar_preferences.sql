alter table public.artists
  add column if not exists avatar_mode text not null default 'mesh',
  add column if not exists avatar_preset text not null default 'aurora',
  add column if not exists avatar_storage_path text,
  add column if not exists avatar_updated_at timestamptz;

do $$
begin
  alter table public.artists
    add constraint artists_avatar_mode_check
    check (avatar_mode in ('mesh', 'uploaded'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.artists
    add constraint artists_avatar_preset_check
    check (avatar_preset in ('aurora', 'champagne', 'opal', 'lagoon', 'ember', 'violet', 'rose', 'mint'));
exception
  when duplicate_object then null;
end $$;

update public.artists
set
  avatar_mode = 'uploaded',
  avatar_updated_at = coalesce(avatar_updated_at, updated_at, now())
where avatar_url is not null
  and btrim(avatar_url) <> ''
  and avatar_mode = 'mesh';
