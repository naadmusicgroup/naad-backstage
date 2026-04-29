create or replace function public.approve_release_change_request(
  target_request_id uuid,
  actor_admin_id uuid,
  review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.release_change_requests%rowtype;
  release_row public.releases%rowtype;
  approval_timestamp timestamptz := now();
  normalized_notes text := nullif(trim(coalesce(review_notes, '')), '');
  release_patch jsonb;
  tracks_snapshot jsonb;
  track_entry jsonb;
  credit_entry jsonb;
  existing_track_ids uuid[] := array[]::uuid[];
  seen_track_ids uuid[] := array[]::uuid[];
  submitted_track_id_text text;
  submitted_track_id uuid;
  target_track_id uuid;
  normalized_release_title text;
  normalized_release_type text;
  normalized_release_genre text;
  normalized_release_upc text;
  normalized_release_cover_art_url text;
  normalized_release_streaming_link text;
  normalized_release_date date;
  release_date_text text;
  normalized_release_status text;
  should_update_release_genre boolean := false;
  normalized_track_title text;
  normalized_track_isrc text;
  normalized_track_number integer;
  normalized_track_audio_preview_url text;
  normalized_track_status text;
  track_number_text text;
  credits_snapshot jsonb;
  credit_index integer;
  normalized_credit_name text;
  linked_artist_id_text text;
  normalized_linked_artist_id uuid;
  normalized_role_code text;
  normalized_instrument text;
  normalized_display_credit text;
  normalized_credit_notes text;
  normalized_credit_sort_order integer;
  credit_sort_order_text text;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if target_request_id is null then
    raise exception 'Request id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = actor_admin_id
      and role = 'admin'
  ) then
    raise exception 'Admin id is invalid.';
  end if;

  select *
  into request_row
  from public.release_change_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'The selected release request does not exist.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Only pending requests can be approved.';
  end if;

  select *
  into release_row
  from public.releases
  where id = request_row.release_id
  for update;

  if not found then
    raise exception 'The selected release does not exist.';
  end if;

  update public.release_change_requests
  set
    status = 'approved',
    admin_notes = normalized_notes,
    reviewed_by = actor_admin_id,
    reviewed_at = approval_timestamp
  where id = target_request_id
  returning *
  into request_row;

  insert into public.release_events (
    release_id,
    event_type,
    actor_role,
    actor_profile_id,
    payload
  )
  values (
    request_row.release_id,
    'request_approved',
    'admin',
    actor_admin_id,
    jsonb_build_object(
      'requestId', target_request_id,
      'requestType', request_row.request_type,
      'adminNotes', normalized_notes
    )
  );

  if request_row.request_type = 'draft_edit' then
    if release_row.status <> 'draft' then
      raise exception 'Only draft releases can accept a draft edit request.';
    end if;

    release_patch := coalesce(request_row.proposed_release, '{}'::jsonb);
    tracks_snapshot := coalesce(request_row.proposed_tracks, '[]'::jsonb);

    if jsonb_typeof(release_patch) <> 'object' then
      raise exception 'Release snapshot must be an object.';
    end if;

    if jsonb_typeof(tracks_snapshot) <> 'array' then
      raise exception 'Track snapshot must be a list.';
    end if;

    if release_patch ? 'title' then
      normalized_release_title := trim(coalesce(release_patch ->> 'title', ''));

      if length(normalized_release_title) < 2 then
        raise exception 'Release title must be at least 2 characters.';
      end if;
    end if;

    if release_patch ? 'type' then
      normalized_release_type := lower(trim(coalesce(release_patch ->> 'type', '')));

      if normalized_release_type not in ('single', 'ep', 'album') then
        raise exception 'Release type must be single, ep, or album.';
      end if;
    end if;

    if request_row.proposed_genre is not null then
      normalized_release_genre := trim(request_row.proposed_genre);
      should_update_release_genre := true;
    elsif release_patch ? 'genre' and release_patch ->> 'genre' is not null then
      normalized_release_genre := trim(release_patch ->> 'genre');
      should_update_release_genre := true;
    end if;

    if should_update_release_genre and length(normalized_release_genre) < 2 then
      raise exception 'Genre must be at least 2 characters.';
    end if;

    if release_patch ? 'upc' then
      normalized_release_upc := nullif(trim(coalesce(release_patch ->> 'upc', '')), '');
    end if;

    if release_patch ? 'coverArtUrl' then
      normalized_release_cover_art_url := nullif(trim(coalesce(release_patch ->> 'coverArtUrl', '')), '');

      if normalized_release_cover_art_url is not null
        and normalized_release_cover_art_url !~* '^https?://[^[:space:]]+$'
      then
        raise exception 'Cover art URL must be a valid URL.';
      end if;
    end if;

    if release_patch ? 'streamingLink' then
      normalized_release_streaming_link := nullif(trim(coalesce(release_patch ->> 'streamingLink', '')), '');

      if normalized_release_streaming_link is not null
        and normalized_release_streaming_link !~* '^https?://[^[:space:]]+$'
      then
        raise exception 'Streaming link must be a valid URL.';
      end if;
    end if;

    if release_patch ? 'releaseDate' then
      release_date_text := nullif(trim(coalesce(release_patch ->> 'releaseDate', '')), '');

      if release_date_text is null then
        normalized_release_date := null;
      elsif release_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Release date must use YYYY-MM-DD format.';
      else
        normalized_release_date := release_date_text::date;
      end if;
    end if;

    if release_patch ? 'status' then
      normalized_release_status := lower(trim(coalesce(release_patch ->> 'status', '')));

      if normalized_release_status = '' then
        normalized_release_status := 'draft';
      end if;

      if normalized_release_status not in ('draft', 'live', 'taken_down', 'deleted') then
        raise exception 'Release status must be draft, live, taken_down, or deleted.';
      end if;
    end if;

    update public.releases
    set
      title = case when release_patch ? 'title' then normalized_release_title else title end,
      type = case when release_patch ? 'type' then normalized_release_type else type end,
      genre = case when should_update_release_genre then normalized_release_genre else genre end,
      upc = case when release_patch ? 'upc' then normalized_release_upc else upc end,
      cover_art_url = case when release_patch ? 'coverArtUrl' then normalized_release_cover_art_url else cover_art_url end,
      streaming_link = case when release_patch ? 'streamingLink' then normalized_release_streaming_link else streaming_link end,
      release_date = case when release_patch ? 'releaseDate' then normalized_release_date else release_date end,
      status = case when release_patch ? 'status' then normalized_release_status else status end
    where id = request_row.release_id;

    select coalesce(array_agg(id), array[]::uuid[])
    into existing_track_ids
    from (
      select id
      from public.tracks
      where release_id = request_row.release_id
      for update
    ) as locked_tracks;

    for track_entry in
      select value
      from jsonb_array_elements(tracks_snapshot) as proposed_track(value)
    loop
      if jsonb_typeof(track_entry) <> 'object' then
        raise exception 'Track snapshot entries must be objects.';
      end if;

      submitted_track_id := null;
      submitted_track_id_text := nullif(trim(coalesce(track_entry ->> 'id', '')), '');

      if submitted_track_id_text is not null
        and submitted_track_id_text ~* uuid_pattern
      then
        submitted_track_id := submitted_track_id_text::uuid;
      end if;

      normalized_track_title := null;
      if track_entry ? 'title' then
        normalized_track_title := trim(coalesce(track_entry ->> 'title', ''));

        if length(normalized_track_title) < 2 then
          raise exception 'Track title must be at least 2 characters.';
        end if;
      end if;

      normalized_track_isrc := null;
      if track_entry ? 'isrc' then
        normalized_track_isrc := upper(trim(coalesce(track_entry ->> 'isrc', '')));

        if length(normalized_track_isrc) < 2 then
          raise exception 'ISRC must be at least 2 characters.';
        end if;

        if normalized_track_isrc !~ '^[A-Z0-9-]+$' then
          raise exception 'ISRC can contain only letters, numbers, and hyphens.';
        end if;
      end if;

      normalized_track_number := null;
      if track_entry ? 'trackNumber' then
        track_number_text := nullif(trim(coalesce(track_entry ->> 'trackNumber', '')), '');

        if track_number_text is not null then
          if track_number_text !~ '^\d+$' then
            raise exception 'Track number must be a whole number.';
          end if;

          normalized_track_number := track_number_text::integer;
        end if;
      end if;

      normalized_track_audio_preview_url := null;
      if track_entry ? 'audioPreviewUrl' then
        normalized_track_audio_preview_url := nullif(trim(coalesce(track_entry ->> 'audioPreviewUrl', '')), '');

        if normalized_track_audio_preview_url is not null
          and normalized_track_audio_preview_url !~* '^https?://[^[:space:]]+$'
        then
          raise exception 'Audio preview URL must be a valid URL.';
        end if;
      end if;

      if track_entry ? 'status' then
        normalized_track_status := lower(trim(coalesce(track_entry ->> 'status', '')));

        if normalized_track_status = '' then
          normalized_track_status := 'draft';
        end if;

        if normalized_track_status not in ('draft', 'live', 'deleted') then
          raise exception 'Track status must be draft, live, or deleted.';
        end if;
      else
        normalized_track_status := 'draft';
      end if;

      if submitted_track_id is not null and submitted_track_id = any(existing_track_ids) then
        update public.tracks
        set
          title = case when track_entry ? 'title' then normalized_track_title else title end,
          isrc = case when track_entry ? 'isrc' then normalized_track_isrc else isrc end,
          track_number = case when track_entry ? 'trackNumber' then normalized_track_number else track_number end,
          audio_preview_url = case when track_entry ? 'audioPreviewUrl' then normalized_track_audio_preview_url else audio_preview_url end,
          status = normalized_track_status,
          deleted_by = case when normalized_track_status = 'deleted' then actor_admin_id else null end
        where id = submitted_track_id
        returning id
        into target_track_id;
      else
        if normalized_track_title is null then
          raise exception 'Track title must be at least 2 characters.';
        end if;

        if normalized_track_isrc is null then
          raise exception 'ISRC must be at least 2 characters.';
        end if;

        insert into public.tracks (
          release_id,
          title,
          isrc,
          track_number,
          audio_preview_url,
          status
        )
        values (
          request_row.release_id,
          normalized_track_title,
          normalized_track_isrc,
          normalized_track_number,
          normalized_track_audio_preview_url,
          normalized_track_status
        )
        returning id
        into target_track_id;
      end if;

      seen_track_ids := array_append(seen_track_ids, target_track_id);

      delete from public.track_credits
      where track_id = target_track_id;

      credits_snapshot := case
        when not (track_entry ? 'credits') or jsonb_typeof(track_entry -> 'credits') = 'null' then '[]'::jsonb
        else track_entry -> 'credits'
      end;

      if jsonb_typeof(credits_snapshot) <> 'array' then
        raise exception 'Track credits must be a list.';
      end if;

      credit_index := 0;

      for credit_entry in
        select value
        from jsonb_array_elements(credits_snapshot) as proposed_credit(value)
      loop
        if jsonb_typeof(credit_entry) <> 'object' then
          raise exception 'Track credits must be a list of objects.';
        end if;

        normalized_credit_name := trim(coalesce(credit_entry ->> 'creditedName', ''));
        if length(normalized_credit_name) < 2 then
          raise exception 'Credit % name must be at least 2 characters.', credit_index + 1;
        end if;

        linked_artist_id_text := nullif(trim(coalesce(credit_entry ->> 'linkedArtistId', '')), '');
        normalized_linked_artist_id := null;

        if linked_artist_id_text is not null then
          if linked_artist_id_text !~* uuid_pattern then
            raise exception 'Credit % linked artist is invalid.', credit_index + 1;
          end if;

          normalized_linked_artist_id := linked_artist_id_text::uuid;
        end if;

        normalized_role_code := trim(coalesce(credit_entry ->> 'roleCode', ''));
        if length(normalized_role_code) < 2 then
          raise exception 'Credit % role must be at least 2 characters.', credit_index + 1;
        end if;

        normalized_instrument := nullif(trim(coalesce(credit_entry ->> 'instrument', '')), '');
        normalized_display_credit := nullif(trim(coalesce(credit_entry ->> 'displayCredit', '')), '');
        normalized_credit_notes := nullif(trim(coalesce(credit_entry ->> 'notes', '')), '');
        normalized_credit_sort_order := credit_index;
        credit_sort_order_text := nullif(trim(coalesce(credit_entry ->> 'sortOrder', '')), '');

        if credit_sort_order_text is not null then
          if credit_sort_order_text !~ '^\d+$' then
            raise exception 'Credit % sort order must be a whole number.', credit_index + 1;
          end if;

          normalized_credit_sort_order := credit_sort_order_text::integer;
        end if;

        insert into public.track_credits (
          track_id,
          credited_name,
          linked_artist_id,
          role_code,
          instrument,
          display_credit,
          notes,
          sort_order,
          created_by,
          updated_by
        )
        values (
          target_track_id,
          normalized_credit_name,
          normalized_linked_artist_id,
          normalized_role_code,
          normalized_instrument,
          normalized_display_credit,
          normalized_credit_notes,
          normalized_credit_sort_order,
          actor_admin_id,
          actor_admin_id
        );

        credit_index := credit_index + 1;
      end loop;
    end loop;

    update public.tracks
    set
      status = 'deleted',
      deleted_by = actor_admin_id
    where id = any(existing_track_ids)
      and not (id = any(seen_track_ids));
  elsif request_row.request_type = 'takedown' then
    update public.releases
    set
      status = 'taken_down',
      takedown_reason = request_row.takedown_reason,
      takedown_proof_urls = case
        when jsonb_typeof(request_row.proof_urls) = 'array' then (
          select coalesce(jsonb_agg(proof_url.value), '[]'::jsonb)
          from jsonb_array_elements_text(request_row.proof_urls) as proof_url(value)
        )
        else '[]'::jsonb
      end,
      takedown_requested_at = approval_timestamp,
      takedown_requested_by = request_row.requested_by,
      takedown_completed_at = approval_timestamp,
      takedown_completed_by = actor_admin_id
    where id = request_row.release_id;

    insert into public.release_events (
      release_id,
      event_type,
      actor_role,
      actor_profile_id,
      payload
    )
    values (
      request_row.release_id,
      'takedown_completed',
      'admin',
      actor_admin_id,
      jsonb_build_object(
        'requestId', target_request_id,
        'reason', request_row.takedown_reason
      )
    );
  else
    raise exception 'Release request type is invalid.';
  end if;

  update public.release_change_requests
  set
    status = 'applied',
    admin_notes = normalized_notes,
    reviewed_by = actor_admin_id,
    reviewed_at = approval_timestamp,
    applied_at = approval_timestamp
  where id = target_request_id
  returning *
  into request_row;

  insert into public.release_events (
    release_id,
    event_type,
    actor_role,
    actor_profile_id,
    payload
  )
  values (
    request_row.release_id,
    'request_applied',
    'admin',
    actor_admin_id,
    jsonb_build_object(
      'requestId', target_request_id,
      'requestType', request_row.request_type
    )
  );

  insert into public.admin_activity_log (
    admin_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    actor_admin_id,
    'release.request.approved',
    'release_change_request',
    target_request_id,
    jsonb_build_object(
      'release_id', request_row.release_id,
      'request_type', request_row.request_type
    )
  );

  return jsonb_build_object(
    'requestId', request_row.id,
    'releaseId', request_row.release_id,
    'requestType', request_row.request_type,
    'status', request_row.status
  );
end;
$$;

revoke all on function public.approve_release_change_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_release_change_request(uuid, uuid, text) to service_role;
