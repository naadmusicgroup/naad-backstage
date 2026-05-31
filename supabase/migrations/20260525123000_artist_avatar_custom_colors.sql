alter table public.artists
  add column if not exists avatar_custom_colors jsonb;

alter table public.artists
  drop constraint if exists artists_avatar_preset_check;

alter table public.artists
  add constraint artists_avatar_preset_check
  check (avatar_preset in ('aurora', 'champagne', 'opal', 'lagoon', 'ember', 'violet', 'rose', 'mint', 'custom'));

alter table public.artists
  drop constraint if exists artists_avatar_custom_colors_check;

alter table public.artists
  add constraint artists_avatar_custom_colors_check
  check (
    avatar_custom_colors is null
    or (
      jsonb_typeof(avatar_custom_colors) = 'array'
      and jsonb_array_length(avatar_custom_colors) = 5
    )
  );
