drop function if exists public.get_artist_releases_list_payload(uuid[], integer, integer);

create or replace function public.get_artist_releases_list_payload(
  target_artist_ids uuid[],
  target_page integer default 1,
  target_page_size integer default 8,
  target_search text default ''
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      coalesce(target_artist_ids, array[]::uuid[]) as artist_ids,
      greatest(coalesce(target_page, 1), 1) as requested_page,
      greatest(coalesce(target_page_size, 8), 1) as page_size,
      lower(btrim(regexp_replace(coalesce(target_search, ''), '\s+', ' ', 'g'))) as search_text
  ),
  search_tokens as (
    select
      coalesce(array_agg(tokens.token order by tokens.ordinality), array[]::text[]) as tokens
    from params
    left join lateral regexp_split_to_table(params.search_text, '\s+') with ordinality as tokens(token, ordinality)
      on params.search_text <> ''
    where tokens.token is not null
      and tokens.token <> ''
  ),
  owned_access as (
    select
      release.id as release_id,
      true as is_owner,
      array[]::text[] as collaborator_roles
    from public.releases as release
    cross join params
    where release.artist_id = any(params.artist_ids)
      and release.status <> 'deleted'
  ),
  release_collaborator_access as (
    select
      collaborator.release_id,
      false as is_owner,
      array_agg(distinct 'Release: ' || collaborator.role order by 'Release: ' || collaborator.role) as collaborator_roles
    from public.release_collaborators as collaborator
    cross join params
    where collaborator.artist_id = any(params.artist_ids)
    group by collaborator.release_id
  ),
  track_collaborator_access as (
    select
      track.release_id,
      false as is_owner,
      array_agg(distinct 'Track: ' || track.title || ' / ' || collaborator.role order by 'Track: ' || track.title || ' / ' || collaborator.role) as collaborator_roles
    from public.track_collaborators as collaborator
    join public.tracks as track
      on track.id = collaborator.track_id
    cross join params
    where collaborator.artist_id = any(params.artist_ids)
    group by track.release_id
  ),
  access_rows as (
    select * from owned_access
    union all
    select * from release_collaborator_access
    union all
    select * from track_collaborator_access
  ),
  access_by_release as (
    select
      access.release_id,
      bool_or(access.is_owner) as is_owner,
      coalesce(
        array_agg(distinct role_text) filter (where role_text is not null and role_text <> ''),
        array[]::text[]
      ) as collaborator_roles
    from access_rows as access
    left join lateral unnest(access.collaborator_roles) as role_value(role_text)
      on true
    group by access.release_id
  ),
  visible_releases as materialized (
    select
      release.*,
      artist.name as artist_name,
      access.is_owner,
      access.collaborator_roles
    from access_by_release as access
    join public.releases as release
      on release.id = access.release_id
    left join public.artists as artist
      on artist.id = release.artist_id
    where (
      access.is_owner
      and release.status <> 'deleted'
    ) or (
      not access.is_owner
      and release.status in ('live', 'taken_down')
    )
  ),
  visible_tracks as materialized (
    select track.*
    from public.tracks as track
    where track.release_id in (select release.id from visible_releases as release)
      and coalesce(track.status, 'live') <> 'deleted'
  ),
  track_search_text as (
    select
      track.release_id,
      string_agg(
        concat_ws(
          ' ',
          track.title,
          track.isrc,
          track.version_line,
          track.status,
          track.track_number::text
        ),
        ' '
      ) as search_text
    from visible_tracks as track
    group by track.release_id
  ),
  release_collaborator_names as (
    select
      collaborator.release_id,
      string_agg(distinct concat_ws(' ', artist.name, collaborator.role), ' ') as search_text
    from public.release_collaborators as collaborator
    join public.artists as artist
      on artist.id = collaborator.artist_id
    where collaborator.release_id in (select release.id from visible_releases as release)
    group by collaborator.release_id
  ),
  track_collaborator_names as (
    select
      track.release_id,
      string_agg(distinct concat_ws(' ', artist.name, collaborator.role), ' ') as search_text
    from visible_tracks as track
    join public.track_collaborators as collaborator
      on collaborator.track_id = track.id
    join public.artists as artist
      on artist.id = collaborator.artist_id
    group by track.release_id
  ),
  track_credit_names as (
    select
      track.release_id,
      string_agg(
        distinct concat_ws(
          ' ',
          credit.credited_name,
          linked_artist.name,
          credit.role_code,
          credit.display_credit
        ),
        ' '
      ) as search_text
    from visible_tracks as track
    join public.track_credits as credit
      on credit.track_id = track.id
    left join public.artists as linked_artist
      on linked_artist.id = credit.linked_artist_id
    group by track.release_id
  ),
  searchable_releases as materialized (
    select release.*
    from visible_releases as release
    left join track_search_text
      on track_search_text.release_id = release.id
    left join release_collaborator_names
      on release_collaborator_names.release_id = release.id
    left join track_collaborator_names
      on track_collaborator_names.release_id = release.id
    left join track_credit_names
      on track_credit_names.release_id = release.id
    cross join search_tokens
    cross join lateral (
      select lower(
        concat_ws(
          ' ',
          release.title,
          release.artist_name,
          release.genre,
          release.upc,
          release.type,
          release.status,
          release.release_date::text,
          track_search_text.search_text,
          release_collaborator_names.search_text,
          track_collaborator_names.search_text,
          track_credit_names.search_text
        )
      ) as haystack
    ) as search_source
    where coalesce(array_length(search_tokens.tokens, 1), 0) = 0
       or not exists (
        select 1
        from unnest(search_tokens.tokens) as token(value)
        where position(token.value in search_source.haystack) = 0
      )
  ),
  track_counts as (
    select
      track.release_id,
      count(*)::integer as track_count
    from visible_tracks as track
    where track.release_id in (select release.id from searchable_releases as release)
    group by track.release_id
  ),
  latest_submissions as (
    select distinct on (submission.release_id)
      submission.release_id,
      submission.status,
      submission.admin_notes
    from public.artist_release_submissions as submission
    where submission.release_id in (select release.id from searchable_releases as release)
    order by submission.release_id, submission.id desc
  ),
  preferred_requests as (
    select *
    from (
      select
        request.*,
        row_number() over (
          partition by request.release_id
          order by (request.status = 'pending') desc, request.created_at desc, request.id asc
        ) as row_number
      from public.release_change_requests as request
      where request.release_id in (select release.id from searchable_releases as release)
    ) as ranked_request
    where ranked_request.row_number = 1
  ),
  totals as (
    select
      count(*)::integer as release_count,
      coalesce(sum(coalesce(track_counts.track_count, 0)), 0)::integer as track_count,
      count(*) filter (where release.is_owner)::integer as owner_release_count,
      count(*) filter (where not release.is_owner)::integer as collaborator_release_count
    from searchable_releases as release
    left join track_counts
      on track_counts.release_id = release.id
  ),
  pagination as (
    select
      least(
        params.requested_page,
        greatest(1, ceiling(totals.release_count::numeric / params.page_size)::integer)
      ) as page,
      params.page_size,
      totals.release_count as total_count,
      greatest(1, ceiling(totals.release_count::numeric / params.page_size)::integer) as total_pages
    from params
    cross join totals
  ),
  page_releases as materialized (
    select release.*
    from searchable_releases as release
    order by release.release_date desc nulls last, release.created_at desc, release.id asc
    limit (select page_size from pagination)
    offset (select (page - 1) * page_size from pagination)
  ),
  release_json as (
    select jsonb_agg(
      jsonb_build_object(
        'id', release.id::text,
        'artistId', release.artist_id::text,
        'artistName', coalesce(release.artist_name, 'Unknown artist'),
        'title', release.title,
        'type', release.type,
        'status', coalesce(nullif(release.status, ''), 'live'),
        'genre', coalesce(nullif(btrim(release.genre), ''), 'Other'),
        'upc', release.upc,
        'coverArtUrl', release.cover_art_url,
        'coverThumbUrl', coalesce(release.cover_thumb_url, release.cover_art_url),
        'streamingLink', release.streaming_link,
        'releaseDate', release.release_date::text,
        'displayStatus', case
          when release.status in ('live', 'taken_down', 'deleted') then release.status
          when submission.status = 'pending_review' then 'pending_review'
          when submission.status = 'approved' then 'scheduled'
          when submission.status = 'rejected' then 'rejected'
          else coalesce(nullif(release.status, ''), 'live')
        end,
        'submissionStatus', submission.status,
        'submissionAdminNotes', submission.admin_notes,
        'viewerRelation', case when release.is_owner then 'owner' else 'collaborator' end,
        'viewerRoles', case
          when release.is_owner then to_jsonb(array['Owner / ' || coalesce(release.artist_name, 'Artist')])
          else to_jsonb(coalesce(nullif(release.collaborator_roles, array[]::text[]), array['Collaborator']))
        end,
        'takedownReason', release.takedown_reason,
        'takedownProofUrls', coalesce(release.takedown_proof_urls, '[]'::jsonb),
        'canSubmitDraftEdit', (
          release.is_owner
          and release.status = 'draft'
          and request.id is null
          and submission.release_id is null
        ),
        'pendingRequest', case
          when release.is_owner and request.id is not null then jsonb_build_object(
            'id', request.id::text,
            'requestType', request.request_type,
            'status', request.status,
            'takedownReason', request.takedown_reason,
            'proofUrls', coalesce(request.proof_urls, '[]'::jsonb),
            'adminNotes', request.admin_notes,
            'createdAt', request.created_at,
            'reviewedAt', request.reviewed_at
          )
          else null
        end,
        'releaseCollaborators', '[]'::jsonb,
        'viewerSplitHistory', '[]'::jsonb,
        'events', '[]'::jsonb,
        'tracks', '[]'::jsonb,
        'trackCount', coalesce(track_counts.track_count, 0)
      )
      order by release.release_date desc nulls last, release.created_at desc, release.id asc
    ) as rows
    from page_releases as release
    left join track_counts
      on track_counts.release_id = release.id
    left join latest_submissions as submission
      on submission.release_id = release.id
    left join preferred_requests as request
      on request.release_id = release.id
  )
  select jsonb_build_object(
    'releaseCount', (select release_count from totals),
    'trackCount', (select track_count from totals),
    'ownerReleaseCount', (select owner_release_count from totals),
    'collaboratorReleaseCount', (select collaborator_release_count from totals),
    'releases', coalesce((select rows from release_json), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', (select page from pagination),
      'pageSize', (select page_size from pagination),
      'totalCount', (select total_count from pagination),
      'totalPages', (select total_pages from pagination),
      'hasPreviousPage', (select page > 1 from pagination),
      'hasNextPage', (select page < total_pages from pagination)
    )
  );
$$;

revoke all on function public.get_artist_releases_list_payload(uuid[], integer, integer, text) from public, anon, authenticated;
grant execute on function public.get_artist_releases_list_payload(uuid[], integer, integer, text) to service_role;
