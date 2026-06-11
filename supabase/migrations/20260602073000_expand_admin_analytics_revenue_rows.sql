create or replace function public.get_admin_analytics_revenue_rows(
  target_period_start_month date default null,
  target_period_end_month date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with revenue_rows as (
    select
      earning.artist_id,
      coalesce(nullif(btrim(artist.name), ''), 'Unknown artist') as artist_name,
      upload.period_month as month,
      earning.channel_id,
      case
        when earning.channel_id is null then 'Unassigned channel'
        else coalesce(nullif(btrim(channel.display_name), ''), nullif(btrim(channel.raw_name), ''), 'Unknown channel')
      end as channel_name,
      nullif(btrim(earning.territory), '') as territory,
      earning.release_id,
      coalesce(nullif(btrim(release.title), ''), 'Unknown release') as release_title,
      release.cover_art_url as release_cover_art_url,
      release.cover_thumb_url as release_cover_thumb_url,
      earning.track_id,
      coalesce(nullif(btrim(track.title), ''), 'Unknown track') as track_title,
      nullif(btrim(track.isrc), '') as track_isrc,
      earning.upload_id,
      upload.filename as upload_filename,
      coalesce(sum(earning.total_amount), 0)::numeric as revenue,
      coalesce(sum(earning.units), 0)::bigint as streams,
      count(*)::bigint as row_count
    from public.earnings as earning
    inner join public.csv_uploads as upload
      on upload.id = earning.upload_id
    left join public.artists as artist
      on artist.id = earning.artist_id
    left join public.channels as channel
      on channel.id = earning.channel_id
    left join public.releases as release
      on release.id = earning.release_id
    left join public.tracks as track
      on track.id = earning.track_id
    where earning.earning_type = 'original'
      and (target_period_start_month is null or upload.period_month >= target_period_start_month)
      and (target_period_end_month is null or upload.period_month <= target_period_end_month)
    group by
      earning.artist_id,
      artist.name,
      upload.period_month,
      earning.channel_id,
      channel.display_name,
      channel.raw_name,
      earning.territory,
      earning.release_id,
      release.title,
      release.cover_art_url,
      release.cover_thumb_url,
      earning.track_id,
      track.title,
      track.isrc,
      earning.upload_id,
      upload.filename
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'artist_id', revenue_rows.artist_id,
        'artist_name', revenue_rows.artist_name,
        'month', revenue_rows.month,
        'channel_id', revenue_rows.channel_id,
        'channel_name', revenue_rows.channel_name,
        'territory', revenue_rows.territory,
        'release_id', revenue_rows.release_id,
        'release_title', revenue_rows.release_title,
        'release_cover_art_url', revenue_rows.release_cover_art_url,
        'release_cover_thumb_url', revenue_rows.release_cover_thumb_url,
        'track_id', revenue_rows.track_id,
        'track_title', revenue_rows.track_title,
        'track_isrc', revenue_rows.track_isrc,
        'upload_id', revenue_rows.upload_id,
        'upload_filename', revenue_rows.upload_filename,
        'revenue', revenue_rows.revenue::text,
        'streams', revenue_rows.streams,
        'row_count', revenue_rows.row_count
      )
      order by
        revenue_rows.artist_name asc,
        revenue_rows.month asc,
        revenue_rows.channel_name asc,
        revenue_rows.territory asc nulls first,
        revenue_rows.release_title asc,
        revenue_rows.track_title asc,
        revenue_rows.upload_filename asc nulls first
    ),
    '[]'::jsonb
  )
  from revenue_rows;
$$;

revoke all on function public.get_admin_analytics_revenue_rows(date, date)
  from public, anon, authenticated;
grant execute on function public.get_admin_analytics_revenue_rows(date, date)
  to service_role;
