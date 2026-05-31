create index if not exists idx_csv_uploads_status_period_id
  on public.csv_uploads (status, period_month, id);

create index if not exists idx_earnings_upload_original_analytics
  on public.earnings (upload_id, artist_id, channel_id, territory, release_id, track_id)
  include (total_amount, units)
  where earning_type = 'original';

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
      summary.artist_id,
      coalesce(nullif(btrim(active_artist.name), ''), 'Unknown artist') as artist_name,
      summary.month,
      summary.channel_id,
      case
        when summary.channel_id is null then 'Unassigned channel'
        else coalesce(nullif(btrim(channel.display_name), ''), nullif(btrim(channel.raw_name), ''), 'Unknown channel')
      end as channel_name,
      summary.territory,
      coalesce(summary.revenue, 0)::numeric as revenue,
      coalesce(summary.streams, 0)::bigint as streams
    from public.monthly_earnings_summary as summary
    left join public.artists as active_artist
      on active_artist.id = summary.artist_id
      and active_artist.is_active = true
    left join public.channels as channel
      on channel.id = summary.channel_id
    where (target_period_start_month is null or summary.month >= target_period_start_month)
      and (target_period_end_month is null or summary.month <= target_period_end_month)
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
        'revenue', revenue_rows.revenue::text,
        'streams', revenue_rows.streams
      )
      order by
        revenue_rows.artist_id asc,
        revenue_rows.month asc,
        revenue_rows.channel_id asc nulls first,
        revenue_rows.territory asc nulls first
    ),
    '[]'::jsonb
  )
  from revenue_rows;
$$;

revoke all on function public.get_admin_analytics_revenue_rows(date, date)
  from public, anon, authenticated;
grant execute on function public.get_admin_analytics_revenue_rows(date, date)
  to service_role;
