create or replace function public.get_admin_earnings_payload(
  target_page integer default 1,
  target_page_size integer default 25,
  target_artist_id uuid default null,
  target_release_id uuid default null,
  target_track_id uuid default null,
  target_channel_id uuid default null,
  target_territory text default null,
  target_period_month date default null,
  target_earning_type text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with request_options as (
    select
      greatest(coalesce(target_page, 1), 1) as requested_page,
      least(greatest(coalesce(target_page_size, 25), 1), 100) as page_size
  ),
  filtered_earnings as materialized (
    select
      earning.id,
      earning.artist_id,
      earning.release_id,
      earning.track_id,
      earning.channel_id,
      earning.upload_id,
      earning.sale_date,
      earning.accounting_date,
      earning.reporting_date,
      earning.territory,
      earning.units,
      earning.unit_price,
      earning.original_currency,
      earning.total_amount,
      earning.earning_type,
      earning.created_at
    from public.earnings as earning
    left join public.csv_uploads as upload_filter
      on upload_filter.id = earning.upload_id
    where (target_artist_id is null or earning.artist_id = target_artist_id)
      and (target_release_id is null or earning.release_id = target_release_id)
      and (target_track_id is null or earning.track_id = target_track_id)
      and (target_channel_id is null or earning.channel_id = target_channel_id)
      and (target_territory is null or earning.territory = target_territory)
      and (target_period_month is null or upload_filter.period_month = target_period_month)
      and (target_earning_type is null or earning.earning_type = target_earning_type)
  ),
  summary_counts as (
    select
      count(*)::bigint as row_count,
      coalesce(sum(total_amount), 0)::numeric as total_revenue,
      coalesce(sum(units), 0)::bigint as total_units,
      count(distinct artist_id)::bigint as artist_count,
      count(distinct release_id)::bigint as release_count,
      count(distinct track_id)::bigint as track_count,
      count(distinct channel_id)::bigint as channel_count,
      count(distinct nullif(btrim(territory), ''))::bigint as territory_count
    from filtered_earnings
  ),
  pagination_state as (
    select
      request_options.page_size,
      summary_counts.row_count,
      greatest(1, ceil(summary_counts.row_count::numeric / request_options.page_size)::integer) as total_pages
    from request_options, summary_counts
  ),
  bounded_page as (
    select
      least(request_options.requested_page, pagination_state.total_pages) as page,
      pagination_state.page_size,
      pagination_state.row_count,
      pagination_state.total_pages
    from request_options, pagination_state
  ),
  page_earnings as materialized (
    select filtered_earnings.*
    from filtered_earnings, bounded_page
    order by sale_date desc nulls last, created_at desc, id asc
    limit (select page_size from bounded_page)
    offset (select (page - 1) * page_size from bounded_page)
  ),
  page_rows as (
    select
      earning.id,
      earning.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      earning.release_id,
      coalesce(release.title, 'Unknown release') as release_title,
      earning.track_id,
      coalesce(track.title, 'Unknown track') as track_title,
      track.isrc as track_isrc,
      earning.channel_id,
      coalesce(nullif(btrim(channel.display_name), ''), nullif(btrim(channel.raw_name), ''), 'Unknown channel') as channel_name,
      earning.upload_id,
      upload.filename as upload_filename,
      upload.period_month as period_month,
      earning.sale_date,
      earning.accounting_date,
      earning.reporting_date,
      earning.territory,
      earning.units,
      earning.unit_price,
      earning.original_currency,
      earning.total_amount,
      earning.earning_type,
      earning.created_at
    from page_earnings as earning
    left join public.artists as artist
      on artist.id = earning.artist_id
    left join public.releases as release
      on release.id = earning.release_id
    left join public.tracks as track
      on track.id = earning.track_id
    left join public.channels as channel
      on channel.id = earning.channel_id
    left join public.csv_uploads as upload
      on upload.id = earning.upload_id
  ),
  artist_options as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object('value', artist.id, 'label', artist.name, 'meta', null, 'logoKey', null)
        order by artist.name asc, artist.id asc
      ), '[]'::jsonb) as items
    from public.artists as artist
  ),
  release_options as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object('value', release.id, 'label', release.title, 'meta', release.artist_id, 'logoKey', null)
        order by release.title asc, release.id asc
      ), '[]'::jsonb) as items
    from public.releases as release
  ),
  track_options as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object(
          'value', track.id,
          'label', case
            when track.isrc is not null and track.isrc <> '' then concat(track.title, ' (', track.isrc, ')')
            else track.title
          end,
          'meta', track.release_id,
          'logoKey', null
        )
        order by track.title asc, track.id asc
      ), '[]'::jsonb) as items
    from public.tracks as track
  ),
  channel_options as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object(
          'value', channel.id,
          'label', coalesce(nullif(btrim(channel.display_name), ''), nullif(btrim(channel.raw_name), ''), 'Unknown channel'),
          'meta', null,
          'logoKey', null
        )
        order by channel.display_name asc nulls last, channel.raw_name asc, channel.id asc
      ), '[]'::jsonb) as items
    from public.channels as channel
  ),
  territory_options as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object('value', territory, 'label', territory, 'meta', null, 'logoKey', null)
        order by territory asc
      ), '[]'::jsonb) as items
    from (
      select distinct btrim(earning.territory) as territory
      from public.earnings as earning
      where nullif(btrim(earning.territory), '') is not null
    ) as territories
  ),
  period_options as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object('value', period_month, 'label', to_char(period_month, 'FMMonth YYYY'), 'meta', null, 'logoKey', null)
        order by period_month desc
      ), '[]'::jsonb) as items
    from (
      select distinct upload.period_month
      from public.csv_uploads as upload
      where upload.period_month is not null
    ) as periods
  ),
  earning_type_options as (
    select jsonb_build_array(
      jsonb_build_object('value', 'original', 'label', 'Original', 'meta', null, 'logoKey', null),
      jsonb_build_object('value', 'adjustment', 'label', 'Adjustment', 'meta', null, 'logoKey', null),
      jsonb_build_object('value', 'reversal', 'label', 'Reversal', 'meta', null, 'logoKey', null)
    ) as items
  )
  select jsonb_build_object(
    'rows',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'artistId', row.artist_id,
          'artistName', row.artist_name,
          'releaseId', row.release_id,
          'releaseTitle', row.release_title,
          'trackId', row.track_id,
          'trackTitle', row.track_title,
          'trackIsrc', row.track_isrc,
          'channelId', row.channel_id,
          'channelName', row.channel_name,
          'logoKey', null,
          'uploadId', row.upload_id,
          'uploadFilename', row.upload_filename,
          'saleDate', row.sale_date,
          'accountingDate', row.accounting_date,
          'reportingDate', row.reporting_date,
          'periodMonth', row.period_month,
          'territory', row.territory,
          'units', coalesce(row.units, 0),
          'unitPrice', to_char(coalesce(row.unit_price, 0), 'FM999999999999999999999999990.00000000'),
          'originalCurrency', row.original_currency,
          'totalAmount', to_char(coalesce(row.total_amount, 0), 'FM999999999999999999999999990.00000000'),
          'earningType', row.earning_type,
          'createdAt', row.created_at
        )
        order by row.sale_date desc nulls last, row.created_at desc, row.id asc
      )
      from page_rows as row
    ), '[]'::jsonb),
    'summary',
    jsonb_build_object(
      'rowCount', summary_counts.row_count,
      'totalRevenue', to_char(summary_counts.total_revenue, 'FM999999999999999999999999990.00000000'),
      'totalUnits', summary_counts.total_units,
      'artistCount', summary_counts.artist_count,
      'releaseCount', summary_counts.release_count,
      'trackCount', summary_counts.track_count,
      'channelCount', summary_counts.channel_count,
      'territoryCount', summary_counts.territory_count
    ),
    'filterOptions',
    jsonb_build_object(
      'artists', artist_options.items,
      'releases', release_options.items,
      'tracks', track_options.items,
      'channels', channel_options.items,
      'territories', territory_options.items,
      'periodMonths', period_options.items,
      'earningTypes', earning_type_options.items
    ),
    'pagination',
    jsonb_build_object(
      'page', bounded_page.page,
      'pageSize', bounded_page.page_size,
      'totalCount', bounded_page.row_count,
      'totalPages', bounded_page.total_pages,
      'hasPreviousPage', bounded_page.page > 1,
      'hasNextPage', bounded_page.page < bounded_page.total_pages
    )
  )
  from summary_counts,
    bounded_page,
    artist_options,
    release_options,
    track_options,
    channel_options,
    territory_options,
    period_options,
    earning_type_options;
$$;

revoke all on function public.get_admin_earnings_payload(integer, integer, uuid, uuid, uuid, uuid, text, date, text)
  from public, anon, authenticated;
grant execute on function public.get_admin_earnings_payload(integer, integer, uuid, uuid, uuid, uuid, text, date, text)
  to service_role;
