create index if not exists idx_statement_periods_admin_settings_sort
on public.statement_periods (period_month desc, created_at desc, id);

create index if not exists idx_artists_inactive_admin_settings
on public.artists (deactivated_at desc nulls last, id)
where is_active = false;

create index if not exists idx_releases_deleted_admin_settings
on public.releases (updated_at desc, id)
where status = 'deleted';

create index if not exists idx_tracks_deleted_admin_settings
on public.tracks (updated_at desc, id)
where status = 'deleted';

create index if not exists idx_channels_admin_settings_sort
on public.channels (display_name, raw_name, id);

create or replace function public.get_admin_settings_payload()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with statement_period_rows as materialized (
    select
      id,
      artist_id,
      period_month,
      status,
      closed_at,
      closed_by,
      created_at,
      updated_at
    from public.statement_periods
    order by period_month desc, created_at desc
    limit 120
  ),
  activity_log_rows as materialized (
    select
      id,
      admin_id,
      action,
      entity_type,
      entity_id,
      details,
      created_at
    from public.admin_activity_log
    order by created_at desc
    limit 120
  ),
  statement_period_keys as (
    select distinct artist_id, period_month
    from statement_period_rows
  ),
  earnings_metrics as (
    select
      summary.artist_id,
      summary.month as period_month,
      coalesce(sum(summary.revenue), 0)::numeric(19,8) as earnings,
      count(distinct summary.channel_id) filter (where summary.channel_id is not null) as channel_count,
      count(distinct summary.territory) filter (where summary.territory is not null and summary.territory <> '') as territory_count,
      count(distinct summary.release_id) filter (where summary.release_id is not null) as release_count
    from public.monthly_earnings_summary as summary
    inner join statement_period_keys as period_key
      on period_key.artist_id = summary.artist_id
      and period_key.period_month = summary.month
    group by summary.artist_id, summary.month
  ),
  publishing_metrics as (
    select
      publishing.artist_id,
      publishing.period_month,
      coalesce(sum(publishing.amount), 0)::numeric(19,8) as publishing
    from public.publishing_earnings as publishing
    inner join statement_period_keys as period_key
      on period_key.artist_id = publishing.artist_id
      and period_key.period_month = publishing.period_month
    group by publishing.artist_id, publishing.period_month
  ),
  upload_metrics as (
    select
      upload.artist_id,
      upload.period_month,
      count(*)::bigint as upload_count
    from public.csv_uploads as upload
    inner join statement_period_keys as period_key
      on period_key.artist_id = upload.artist_id
      and period_key.period_month = upload.period_month
    where upload.status = 'completed'
    group by upload.artist_id, upload.period_month
  ),
  summary_counts as (
    select
      (select count(*) from public.statement_periods where status = 'open') as open_statement_count,
      (select count(*) from public.statement_periods where status = 'closed') as closed_statement_count,
      (select count(*) from public.artists where is_active = false) as orphaned_artist_count,
      (select count(*) from public.releases where status = 'deleted') as archived_release_count,
      (select count(*) from public.tracks where status = 'deleted') as archived_track_count,
      (select count(*) from public.admin_activity_log) as activity_log_count,
      (select count(*) from public.channels) as channel_count
  )
  select jsonb_build_object(
    'summary',
    jsonb_build_object(
      'openStatementCount', summary_counts.open_statement_count,
      'closedStatementCount', summary_counts.closed_statement_count,
      'orphanedArtistCount', summary_counts.orphaned_artist_count,
      'archivedReleaseCount', summary_counts.archived_release_count,
      'archivedTrackCount', summary_counts.archived_track_count,
      'activityLogCount', summary_counts.activity_log_count,
      'channelCount', summary_counts.channel_count
    ),
    'statementPeriods',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', statement_period.id,
          'artistId', statement_period.artist_id,
          'artistName', coalesce(artist.name, 'Unknown artist'),
          'artistIsActive', coalesce(artist.is_active, false),
          'periodMonth', statement_period.period_month,
          'status', statement_period.status,
          'closedAt', statement_period.closed_at,
          'closedByAdminId', statement_period.closed_by,
          'closedByAdminName', closed_by_profile.full_name,
          'earnings', to_char(coalesce(earnings_metrics.earnings, 0), 'FM999999999999999999999999990.00000000'),
          'publishing', to_char(coalesce(publishing_metrics.publishing, 0), 'FM999999999999999999999999990.00000000'),
          'uploadCount', coalesce(upload_metrics.upload_count, 0),
          'channelCount', coalesce(earnings_metrics.channel_count, 0),
          'territoryCount', coalesce(earnings_metrics.territory_count, 0),
          'releaseCount', coalesce(earnings_metrics.release_count, 0),
          'createdAt', statement_period.created_at,
          'updatedAt', statement_period.updated_at
        )
        order by statement_period.period_month desc, statement_period.created_at desc
      )
      from statement_period_rows as statement_period
      left join public.artists as artist
        on artist.id = statement_period.artist_id
      left join public.profiles as closed_by_profile
        on closed_by_profile.id = statement_period.closed_by
      left join earnings_metrics
        on earnings_metrics.artist_id = statement_period.artist_id
        and earnings_metrics.period_month = statement_period.period_month
      left join publishing_metrics
        on publishing_metrics.artist_id = statement_period.artist_id
        and publishing_metrics.period_month = statement_period.period_month
      left join upload_metrics
        on upload_metrics.artist_id = statement_period.artist_id
        and upload_metrics.period_month = statement_period.period_month
    ), '[]'::jsonb),
    'activityLog',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', activity.id,
          'adminId', activity.admin_id,
          'adminName', admin_profile.full_name,
          'action', activity.action,
          'entityType', activity.entity_type,
          'entityId', activity.entity_id,
          'details', case
            when jsonb_typeof(activity.details) = 'object' then activity.details
            else '{}'::jsonb
          end,
          'createdAt', activity.created_at
        )
        order by activity.created_at desc
      )
      from activity_log_rows as activity
      left join public.profiles as admin_profile
        on admin_profile.id = activity.admin_id
    ), '[]'::jsonb),
    'orphanedArtists',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', artist.id,
          'name', artist.name,
          'email', artist.email,
          'fullName', profile.full_name,
          'country', artist.country,
          'bio', artist.bio,
          'createdAt', artist.created_at,
          'deactivatedAt', artist.deactivated_at
        )
        order by artist.deactivated_at desc nulls last, artist.id asc
      )
      from public.artists as artist
      left join public.profiles as profile
        on profile.id = artist.user_id
      where artist.is_active = false
    ), '[]'::jsonb),
    'archived',
    jsonb_build_object(
      'releases',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', release.id,
            'artistId', release.artist_id,
            'artistName', coalesce(artist.name, 'Unknown artist'),
            'title', release.title,
            'type', release.type,
            'upc', release.upc,
            'releaseDate', release.release_date,
            'updatedAt', release.updated_at
          )
          order by release.updated_at desc, release.id asc
        )
        from public.releases as release
        left join public.artists as artist
          on artist.id = release.artist_id
        where release.status = 'deleted'
      ), '[]'::jsonb),
      'tracks',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', track.id,
            'artistId', coalesce(release.artist_id::text, ''),
            'artistName', coalesce(artist.name, 'Unknown artist'),
            'releaseId', track.release_id,
            'releaseTitle', coalesce(release.title, 'Unknown release'),
            'title', track.title,
            'isrc', track.isrc,
            'trackNumber', track.track_number,
            'updatedAt', track.updated_at
          )
          order by track.updated_at desc, track.id asc
        )
        from public.tracks as track
        left join public.releases as release
          on release.id = track.release_id
        left join public.artists as artist
          on artist.id = release.artist_id
        where track.status = 'deleted'
      ), '[]'::jsonb)
    ),
    'channels',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', channel.id,
          'rawName', channel.raw_name,
          'displayName', channel.display_name,
          'iconUrl', channel.icon_url,
          'color', channel.color,
          'createdAt', channel.created_at,
          'updatedAt', channel.updated_at
        )
        order by channel.display_name asc, channel.raw_name asc, channel.id asc
      )
      from public.channels as channel
    ), '[]'::jsonb)
  )
  from summary_counts;
$$;

revoke all on function public.get_admin_settings_payload() from public, anon, authenticated;
grant execute on function public.get_admin_settings_payload() to service_role;
