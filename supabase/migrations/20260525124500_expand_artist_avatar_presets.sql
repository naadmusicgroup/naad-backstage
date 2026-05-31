alter table public.artists
  drop constraint if exists artists_avatar_preset_check;

alter table public.artists
  add constraint artists_avatar_preset_check
  check (
    avatar_preset in (
      'aurora',
      'champagne',
      'opal',
      'lagoon',
      'ember',
      'violet',
      'rose',
      'mint',
      'solar',
      'frost',
      'peacock',
      'coral',
      'graphite',
      'citrus',
      'lilac',
      'cobalt',
      'sand',
      'blush',
      'jade',
      'midnight',
      'custom'
    )
  );
