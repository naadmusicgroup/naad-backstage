create or replace function public.get_statement_earnings_page_payload(
  target_artist_ids uuid[],
  target_page integer default 1,
  target_page_size integer default 10,
  target_period_month date default null,
  target_period_start_month date default null,
  target_period_end_month date default null,
  target_release_id uuid default null,
  target_channel_id uuid default null,
  target_territory text default null
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
      greatest(coalesce(target_page_size, 10), 1) as page_size,
      nullif(btrim(target_territory), '') as territory
  ),
  base_rows as materialized (
    select summary.*
    from public.monthly_earnings_summary as summary
    cross join params
    where summary.artist_id = any(params.artist_ids)
      and (target_period_month is null or summary.month = target_period_month)
      and (target_period_month is not null or target_period_start_month is null or summary.month >= target_period_start_month)
      and (target_period_month is not null or target_period_end_month is null or summary.month <= target_period_end_month)
  ),
  filtered_rows as materialized (
    select base.*
    from base_rows as base
    cross join params
    where (target_release_id is null or base.release_id = target_release_id)
      and (target_channel_id is null or base.channel_id = target_channel_id)
      and (params.territory is null or base.territory = params.territory)
  ),
  totals as (
    select
      coalesce(sum(filtered.revenue), 0) as total_revenue,
      coalesce(sum(filtered.streams), 0)::bigint as total_streams,
      coalesce(sum(filtered.row_count), 0)::bigint as processed_row_count,
      count(*)::bigint as grouped_row_count
    from filtered_rows as filtered
  ),
  pagination as (
    select
      least(
        params.requested_page,
        greatest(1, ceiling(totals.grouped_row_count::numeric / params.page_size)::integer)
      ) as page,
      params.page_size,
      totals.grouped_row_count as total_count,
      greatest(1, ceiling(totals.grouped_row_count::numeric / params.page_size)::integer) as total_pages
    from params
    cross join totals
  ),
  page_rows as materialized (
    select filtered.*
    from filtered_rows as filtered
    cross join pagination
    order by
      filtered.month desc,
      filtered.revenue desc nulls last,
      filtered.release_id asc nulls first,
      filtered.track_id asc nulls first,
      filtered.channel_id asc nulls first,
      filtered.territory asc nulls first
    limit (select page_size from pagination)
    offset (select (page - 1) * page_size from pagination)
  ),
  labelled_page_rows as (
    select
      page_row.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      page_row.month,
      page_row.channel_id,
      coalesce(nullif(btrim(channel.display_name), ''), nullif(btrim(channel.raw_name), ''), 'Unassigned channel') as channel_name,
      page_row.territory,
      page_row.release_id,
      release.title as release_title,
      page_row.track_id,
      track.title as track_title,
      track.isrc as track_isrc,
      page_row.revenue,
      page_row.streams,
      page_row.row_count
    from page_rows as page_row
    left join public.artists as artist
      on artist.id = page_row.artist_id
    left join public.channels as channel
      on channel.id = page_row.channel_id
    left join public.releases as release
      on release.id = page_row.release_id
    left join public.tracks as track
      on track.id = page_row.track_id
  ),
  filter_values as (
    select
      coalesce(array_agg(distinct base.release_id) filter (where base.release_id is not null), array[]::uuid[]) as release_ids,
      coalesce(array_agg(distinct base.channel_id) filter (where base.channel_id is not null), array[]::uuid[]) as channel_ids,
      coalesce(array_agg(distinct btrim(base.territory)) filter (where base.territory is not null and btrim(base.territory) <> ''), array[]::text[]) as territories
    from base_rows as base
  ),
  release_options as (
    select jsonb_agg(
      jsonb_build_object(
        'value', release_option.release_id::text,
        'label', coalesce(release.title, 'Unknown release')
      )
      order by coalesce(release.title, 'Unknown release')
    ) as rows
    from filter_values
    cross join lateral unnest(filter_values.release_ids) as release_option(release_id)
    left join public.releases as release
      on release.id = release_option.release_id
  ),
  channel_options as (
    select jsonb_agg(
      jsonb_build_object(
        'value', channel_option.channel_id::text,
        'label', coalesce(nullif(btrim(channel.display_name), ''), nullif(btrim(channel.raw_name), ''), 'Unassigned channel')
      )
      order by coalesce(nullif(btrim(channel.display_name), ''), nullif(btrim(channel.raw_name), ''), 'Unassigned channel')
    ) as rows
    from filter_values
    cross join lateral unnest(filter_values.channel_ids) as channel_option(channel_id)
    left join public.channels as channel
      on channel.id = channel_option.channel_id
  ),
  territory_options as (
    select jsonb_agg(
      jsonb_build_object(
        'value', territory_option.territory,
        'label', territory_option.territory
      )
      order by territory_option.territory
    ) as rows
    from filter_values
    cross join lateral unnest(filter_values.territories) as territory_option(territory)
  ),
  row_json as (
    select jsonb_agg(
      jsonb_build_object(
        'id',
          'earnings:' || row.month::text || ':' || row.artist_id::text || ':' ||
          coalesce(row.release_id::text, 'none') || ':' ||
          coalesce(row.track_id::text, 'none') || ':' ||
          coalesce(row.channel_id::text, 'none') || ':' ||
          coalesce(row.territory, 'none'),
        'periodMonth', row.month::text,
        'artistId', row.artist_id::text,
        'artistName', row.artist_name,
        'releaseId', row.release_id::text,
        'releaseTitle', case
          when row.release_id is null then null
          else coalesce(row.release_title, 'Unknown release')
        end,
        'trackId', row.track_id::text,
        'trackTitle', case
          when row.track_id is null then null
          else coalesce(row.track_title, 'Unknown track')
        end,
        'trackIsrc', case
          when row.track_id is null then null
          else row.track_isrc
        end,
        'channelId', row.channel_id::text,
        'channelName', row.channel_name,
        'territory', row.territory,
        'earnings', to_char(coalesce(row.revenue, 0), 'FM999999999999999999999999990.00000000'),
        'units', coalesce(row.streams, 0),
        'rowCount', coalesce(row.row_count, 0)
      )
      order by
        row.month desc,
        row.revenue desc nulls last,
        row.release_id asc nulls first,
        row.track_id asc nulls first,
        row.channel_id asc nulls first,
        row.territory asc nulls first
    ) as rows
    from labelled_page_rows as row
  )
  select jsonb_build_object(
    'rows', coalesce((select rows from row_json), '[]'::jsonb),
    'summary', jsonb_build_object(
      'totalRevenue', to_char((select total_revenue from totals), 'FM999999999999999999999999990.00000000'),
      'totalUnits', (select total_streams from totals),
      'processedRowCount', (select processed_row_count from totals),
      'groupedRowCount', (select grouped_row_count from totals)
    ),
    'filterOptions', jsonb_build_object(
      'releases', coalesce((select rows from release_options), '[]'::jsonb),
      'territories', coalesce((select rows from territory_options), '[]'::jsonb),
      'channels', coalesce((select rows from channel_options), '[]'::jsonb)
    ),
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

revoke all on function public.get_statement_earnings_page_payload(uuid[], integer, integer, date, date, date, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_statement_earnings_page_payload(uuid[], integer, integer, date, date, date, uuid, uuid, text) to service_role;
