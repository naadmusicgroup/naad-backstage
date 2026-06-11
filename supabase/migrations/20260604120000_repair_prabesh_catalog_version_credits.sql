do $$
declare
  prabesh_artist_id uuid;
  utsav_artist_id uuid;
  original_track_id uuid;
  acoustic_track_id uuid;
  original_release_id uuid;
  acoustic_release_id uuid;
begin
  select id
  into prabesh_artist_id
  from public.artists
  where lower(name) = lower('Prabesh Kumar Shrestha')
    and lower(coalesce(email, '')) = lower('prabeshkshresthaoff@gmail.com')
    and is_active = true
  order by created_at asc
  limit 1;

  select id
  into utsav_artist_id
  from public.artists
  where lower(name) = lower('Utsav')
    and is_active = true
  order by created_at asc
  limit 1;

  select id, release_id
  into original_track_id, original_release_id
  from public.tracks
  where isrc = 'TCAFZ2271114'
  limit 1;

  select id, release_id
  into acoustic_track_id, acoustic_release_id
  from public.tracks
  where isrc = 'TCAGD2203981'
  limit 1;

  if original_release_id is not null then
    update public.releases
    set
      upc = '859752940474',
      status = 'live',
      is_active = true,
      deleted_at = null,
      deleted_by = null,
      updated_at = now()
    where id = original_release_id;

    insert into public.release_events (
      release_id,
      actor_role,
      event_type,
      payload
    )
    values (
      original_release_id,
      'system',
      'release_edited',
      jsonb_build_object(
        'repair', 'restore_mistakenly_archived_release',
        'isrc', 'TCAFZ2271114',
        'upc', '859752940474'
      )
    );
  end if;

  if acoustic_track_id is not null then
    update public.tracks
    set
      title = 'Merai Tira - Acoustic',
      version_line = 'Acoustic',
      updated_at = now()
    where id = acoustic_track_id;

    if acoustic_release_id is not null then
      insert into public.release_events (
        release_id,
        actor_role,
        event_type,
        payload
      )
      values (
        acoustic_release_id,
        'system',
        'release_edited',
        jsonb_build_object(
          'repair', 'catalog_track_version_line_backfill',
          'isrc', 'TCAGD2203981',
          'versionLine', 'Acoustic'
        )
      );
    end if;
  end if;

  if original_track_id is not null then
    delete from public.track_credits
    where track_id = original_track_id
      and role_code = 'Main Artist';

    insert into public.track_credits (
      track_id,
      credited_name,
      linked_artist_id,
      role_code,
      sort_order
    )
    values
      (original_track_id, 'Utsav', utsav_artist_id, 'Main Artist', 0),
      (original_track_id, 'Prabesh Kumar Shrestha', prabesh_artist_id, 'Main Artist', 1);
  end if;

  if acoustic_track_id is not null then
    delete from public.track_credits
    where track_id = acoustic_track_id
      and role_code = 'Main Artist';

    insert into public.track_credits (
      track_id,
      credited_name,
      linked_artist_id,
      role_code,
      sort_order
    )
    values
      (acoustic_track_id, 'Utsav', utsav_artist_id, 'Main Artist', 0),
      (acoustic_track_id, 'Prabesh Kumar Shrestha', prabesh_artist_id, 'Main Artist', 1);
  end if;
end $$;
