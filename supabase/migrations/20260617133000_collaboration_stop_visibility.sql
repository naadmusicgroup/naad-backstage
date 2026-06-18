create or replace function public.artist_has_current_catalog_access(
  target_artist_ids uuid[],
  target_release_id uuid,
  target_track_id uuid default null,
  target_period_month date default date_trunc('month', now())::date
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      coalesce(target_artist_ids, array[]::uuid[]) as artist_ids,
      target_release_id as release_id,
      target_track_id as track_id,
      date_trunc('month', coalesce(target_period_month, now()::date))::date as period_month
  ),
  release_owner as (
    select true as has_access
    from public.releases as release
    cross join params
    where release.id = params.release_id
      and release.artist_id = any(params.artist_ids)
    limit 1
  ),
  current_release_version as (
    select version.id
    from public.release_split_versions as version
    cross join params
    where version.release_id = params.release_id
      and version.effective_period_month <= params.period_month
    order by version.effective_period_month desc, version.created_at desc, version.id desc
    limit 1
  ),
  release_split_access as (
    select true as has_access
    from current_release_version as version
    join public.release_split_version_entries as entry
      on entry.version_id = version.id
    cross join params
    where entry.artist_id = any(params.artist_ids)
    limit 1
  ),
  current_target_track_version as (
    select version.id
    from public.track_split_versions as version
    cross join params
    where params.track_id is not null
      and version.track_id = params.track_id
      and version.release_id = params.release_id
      and version.effective_period_month <= params.period_month
    order by version.effective_period_month desc, version.created_at desc, version.id desc
    limit 1
  ),
  target_track_split_access as (
    select true as has_access
    from current_target_track_version as version
    join public.track_split_version_entries as entry
      on entry.version_id = version.id
    cross join params
    where entry.artist_id = any(params.artist_ids)
    limit 1
  ),
  current_release_track_versions as (
    select distinct on (version.track_id)
      version.id
    from public.track_split_versions as version
    cross join params
    where params.track_id is null
      and version.release_id = params.release_id
      and version.effective_period_month <= params.period_month
    order by version.track_id, version.effective_period_month desc, version.created_at desc, version.id desc
  ),
  release_track_split_access as (
    select true as has_access
    from current_release_track_versions as version
    join public.track_split_version_entries as entry
      on entry.version_id = version.id
    cross join params
    where entry.artist_id = any(params.artist_ids)
    limit 1
  )
  select
    exists(select 1 from release_owner)
    or case
      when (select track_id from params) is not null and exists(select 1 from current_target_track_version)
        then exists(select 1 from target_track_split_access)
      when (select track_id from params) is not null
        then exists(select 1 from release_split_access)
      else exists(select 1 from release_split_access) or exists(select 1 from release_track_split_access)
    end;
$$;

revoke all on function public.artist_has_current_catalog_access(uuid[], uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.artist_has_current_catalog_access(uuid[], uuid, uuid, date) to service_role;

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
      lower(btrim(regexp_replace(coalesce(target_search, ''), '\s+', ' ', 'g'))) as search_text,
      date_trunc('month', now())::date as current_month
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
      true as has_current_access,
      true as has_historical_access,
      array[]::text[] as collaborator_roles
    from public.releases as release
    cross join params
    where release.artist_id = any(params.artist_ids)
      and release.status <> 'deleted'
  ),
  current_release_versions as materialized (
    select distinct on (version.release_id)
      version.id,
      version.release_id,
      version.effective_period_month,
      version.created_at
    from public.release_split_versions as version
    cross join params
    where version.effective_period_month <= params.current_month
    order by version.release_id, version.effective_period_month desc, version.created_at desc, version.id desc
  ),
  current_release_contributors as (
    select
      version.release_id,
      entry.artist_id,
      entry.role,
      entry.split_pct,
      version.effective_period_month,
      version.created_at
    from current_release_versions as version
    join public.release_split_version_entries as entry
      on entry.version_id = version.id
  ),
  current_release_totals as (
    select
      contributor.release_id,
      sum(contributor.split_pct)::numeric as split_total
    from current_release_contributors as contributor
    group by contributor.release_id
  ),
  current_track_versions as materialized (
    select distinct on (version.track_id)
      version.id,
      version.track_id,
      version.release_id,
      version.effective_period_month,
      version.created_at
    from public.track_split_versions as version
    cross join params
    where version.effective_period_month <= params.current_month
    order by version.track_id, version.effective_period_month desc, version.created_at desc, version.id desc
  ),
  current_track_contributors as (
    select
      version.track_id,
      version.release_id,
      entry.artist_id,
      entry.role,
      entry.split_pct,
      version.effective_period_month,
      version.created_at
    from current_track_versions as version
    join public.track_split_version_entries as entry
      on entry.version_id = version.id
  ),
  release_current_access as (
    select
      contributor.release_id,
      false as is_owner,
      true as has_current_access,
      true as has_historical_access,
      array_agg(distinct 'Release: ' || contributor.role order by 'Release: ' || contributor.role) as collaborator_roles
    from current_release_contributors as contributor
    cross join params
    where contributor.artist_id = any(params.artist_ids)
    group by contributor.release_id
  ),
  track_current_access as (
    select
      track.release_id,
      false as is_owner,
      true as has_current_access,
      true as has_historical_access,
      array_agg(distinct 'Track: ' || track.title || ' / ' || contributor.role order by 'Track: ' || track.title || ' / ' || contributor.role) as collaborator_roles
    from current_track_contributors as contributor
    join public.tracks as track
      on track.id = contributor.track_id
    cross join params
    where contributor.artist_id = any(params.artist_ids)
    group by track.release_id
  ),
  release_historical_access as (
    select
      version.release_id,
      false as is_owner,
      false as has_current_access,
      true as has_historical_access,
      array_agg(distinct 'Release: ' || entry.role order by 'Release: ' || entry.role) as collaborator_roles
    from public.release_split_version_entries as entry
    join public.release_split_versions as version
      on version.id = entry.version_id
    cross join params
    where entry.artist_id = any(params.artist_ids)
      and version.effective_period_month <= params.current_month
    group by version.release_id
  ),
  track_historical_access as (
    select
      track.release_id,
      false as is_owner,
      false as has_current_access,
      true as has_historical_access,
      array_agg(distinct 'Track: ' || track.title || ' / ' || entry.role order by 'Track: ' || track.title || ' / ' || entry.role) as collaborator_roles
    from public.track_split_version_entries as entry
    join public.track_split_versions as version
      on version.id = entry.version_id
    join public.tracks as track
      on track.id = version.track_id
    cross join params
    where entry.artist_id = any(params.artist_ids)
      and version.effective_period_month <= params.current_month
    group by track.release_id
  ),
  earnings_historical_access as (
    select
      earning.release_id,
      false as is_owner,
      false as has_current_access,
      true as has_historical_access,
      array['Past earnings']::text[] as collaborator_roles
    from public.earnings as earning
    cross join params
    where earning.artist_id = any(params.artist_ids)
      and earning.release_id is not null
    group by earning.release_id
  ),
  access_rows as (
    select * from owned_access
    union all
    select * from release_current_access
    union all
    select * from track_current_access
    union all
    select * from release_historical_access
    union all
    select * from track_historical_access
    union all
    select * from earnings_historical_access
  ),
  access_by_release as (
    select
      access.release_id,
      bool_or(access.is_owner) as is_owner,
      bool_or(access.has_current_access) as has_current_access,
      bool_or(access.has_historical_access) as has_historical_access,
      coalesce(
        array_agg(distinct role_text) filter (where role_text is not null and role_text <> ''),
        array[]::text[]
      ) as collaborator_roles
    from access_rows as access
    left join lateral unnest(access.collaborator_roles) as role_value(role_text)
      on true
    group by access.release_id
  ),
  current_release_viewer_split as (
    select
      contributor.release_id,
      sum(contributor.split_pct)::numeric as split_pct
    from current_release_contributors as contributor
    cross join params
    where contributor.artist_id = any(params.artist_ids)
    group by contributor.release_id
  ),
  current_track_viewer_split as (
    select
      contributor.release_id,
      sum(contributor.split_pct)::numeric as split_pct
    from current_track_contributors as contributor
    cross join params
    where contributor.artist_id = any(params.artist_ids)
    group by contributor.release_id
  ),
  viewer_split_versions as (
    select
      version.release_id,
      version.effective_period_month,
      version.created_at,
      sum(entry.split_pct)::numeric as split_pct
    from public.release_split_versions as version
    join public.release_split_version_entries as entry
      on entry.version_id = version.id
    cross join params
    where entry.artist_id = any(params.artist_ids)
      and version.effective_period_month <= params.current_month
    group by version.release_id, version.id, version.effective_period_month, version.created_at
    union all
    select
      version.release_id,
      version.effective_period_month,
      version.created_at,
      sum(entry.split_pct)::numeric as split_pct
    from public.track_split_versions as version
    join public.track_split_version_entries as entry
      on entry.version_id = version.id
    cross join params
    where entry.artist_id = any(params.artist_ids)
      and version.effective_period_month <= params.current_month
    group by version.release_id, version.id, version.effective_period_month, version.created_at
  ),
  latest_viewer_split as (
    select distinct on (split.release_id)
      split.release_id,
      split.split_pct
    from viewer_split_versions as split
    order by split.release_id, split.effective_period_month desc, split.created_at desc
  ),
  stopped_months as (
    select
      version.release_id,
      version.effective_period_month
    from current_release_versions as version
    cross join params
    where exists (
      select 1
      from public.release_split_versions as historical_version
      join public.release_split_version_entries as historical_entry
        on historical_entry.version_id = historical_version.id
      where historical_version.release_id = version.release_id
        and historical_version.effective_period_month <= params.current_month
        and historical_entry.artist_id = any(params.artist_ids)
    )
    and not exists (
      select 1
      from public.release_split_version_entries as current_entry
      where current_entry.version_id = version.id
        and current_entry.artist_id = any(params.artist_ids)
    )
    union all
    select
      version.release_id,
      version.effective_period_month
    from current_track_versions as version
    cross join params
    where exists (
      select 1
      from public.track_split_versions as historical_version
      join public.track_split_version_entries as historical_entry
        on historical_entry.version_id = historical_version.id
      where historical_version.track_id = version.track_id
        and historical_version.effective_period_month <= params.current_month
        and historical_entry.artist_id = any(params.artist_ids)
    )
    and not exists (
      select 1
      from public.track_split_version_entries as current_entry
      where current_entry.version_id = version.id
        and current_entry.artist_id = any(params.artist_ids)
    )
  ),
  stopped_month_by_release as (
    select
      stopped.release_id,
      max(stopped.effective_period_month) as stopped_month
    from stopped_months as stopped
    group by stopped.release_id
  ),
  visible_releases as materialized (
    select
      release.*,
      artist.name as artist_name,
      access.is_owner,
      access.has_current_access,
      access.has_historical_access,
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
  main_artist_credit_rows as (
    select
      track.release_id,
      btrim(regexp_replace(credit.credited_name, '\s+', ' ', 'g')) as credited_name,
      lower(btrim(regexp_replace(credit.credited_name, '\s+', ' ', 'g'))) as credited_name_key,
      coalesce(track.track_number, 2147483647) as track_order,
      track.created_at as track_created_at,
      track.id::text as track_id_text,
      credit.sort_order,
      credit.id::text as credit_id_text,
      row_number() over (
        partition by track.release_id, lower(btrim(regexp_replace(credit.credited_name, '\s+', ' ', 'g')))
        order by coalesce(track.track_number, 2147483647), track.created_at, track.id, credit.sort_order, credit.id
      ) as duplicate_rank
    from visible_tracks as track
    join public.track_credits as credit
      on credit.track_id = track.id
    where credit.role_code = 'Main Artist'
      and btrim(coalesce(credit.credited_name, '')) <> ''
  ),
  main_artist_credit_names as (
    select
      release_id,
      string_agg(
        credited_name,
        ', ' order by track_order, track_created_at, track_id_text, sort_order, credit_id_text
      ) as artist_name
    from main_artist_credit_rows
    where duplicate_rank = 1
    group by release_id
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
      version.release_id,
      string_agg(distinct concat_ws(' ', artist.name, entry.role), ' ') as search_text
    from public.release_split_versions as version
    join public.release_split_version_entries as entry
      on entry.version_id = version.id
    join public.artists as artist
      on artist.id = entry.artist_id
    where version.release_id in (select release.id from visible_releases as release)
    group by version.release_id
  ),
  track_collaborator_names as (
    select
      track.release_id,
      string_agg(distinct concat_ws(' ', artist.name, entry.role), ' ') as search_text
    from visible_tracks as track
    join public.track_split_versions as version
      on version.track_id = track.id
    join public.track_split_version_entries as entry
      on entry.version_id = version.id
    join public.artists as artist
      on artist.id = entry.artist_id
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
          array_to_string(release.collaborator_roles, ' '),
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
        'artistName', coalesce(main_artist_credit_names.artist_name, release.artist_name, 'Unknown artist'),
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
        'viewerCollaborationStatus', case
          when release.is_owner then 'owner'
          when release.has_current_access then 'active'
          else 'stopped'
        end,
        'ownerCurrentSplitPct', to_char(greatest(0, 100 - coalesce(current_release_totals.split_total, 0)), 'FM999990.00'),
        'viewerCurrentSplitPct', case
          when release.is_owner or not release.has_current_access then null
          else to_char(coalesce(current_release_viewer_split.split_pct, current_track_viewer_split.split_pct, 0), 'FM999990.00')
        end,
        'viewerLastSplitPct', case
          when release.is_owner or latest_viewer_split.split_pct is null then null
          else to_char(latest_viewer_split.split_pct, 'FM999990.00')
        end,
        'viewerCollaborationEndedEffectiveMonth', case
          when release.is_owner or release.has_current_access or stopped_month_by_release.stopped_month is null then null
          else to_char(stopped_month_by_release.stopped_month, 'YYYY-MM')
        end,
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
        'canDeletePendingReview', false,
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
    left join main_artist_credit_names
      on main_artist_credit_names.release_id = release.id
    left join latest_submissions as submission
      on submission.release_id = release.id
    left join preferred_requests as request
      on request.release_id = release.id
    left join current_release_totals
      on current_release_totals.release_id = release.id
    left join current_release_viewer_split
      on current_release_viewer_split.release_id = release.id
    left join current_track_viewer_split
      on current_track_viewer_split.release_id = release.id
    left join latest_viewer_split
      on latest_viewer_split.release_id = release.id
    left join stopped_month_by_release
      on stopped_month_by_release.release_id = release.id
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
