create or replace function public.get_artist_analytics_audience_streams(
  target_artist_ids uuid[],
  target_period_start_month date default null,
  target_period_end_month date default null,
  target_period_month text default 'all',
  target_channel_id text default 'all',
  target_territory text default 'all',
  target_release_id text default 'all',
  target_track_id text default 'all'
)
returns table (
  month date,
  channel_id uuid,
  territory text,
  streams bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      summary.month,
      summary.channel_id,
      summary.territory,
      coalesce(summary.streams, 0)::bigint as streams
    from public.monthly_earnings_summary as summary
    where summary.artist_id = any(target_artist_ids)
      and (target_period_start_month is null or summary.month >= target_period_start_month)
      and (target_period_end_month is null or summary.month <= target_period_end_month)
      and (
        coalesce(target_period_month, 'all') = 'all'
        or summary.month::text = target_period_month
      )
      and (
        coalesce(target_channel_id, 'all') = 'all'
        or (target_channel_id = '__none__' and summary.channel_id is null)
        or summary.channel_id::text = target_channel_id
      )
      and (
        coalesce(target_release_id, 'all') = 'all'
        or (target_release_id = '__none__' and summary.release_id is null)
        or summary.release_id::text = target_release_id
      )
      and (
        coalesce(target_track_id, 'all') = 'all'
        or (target_track_id = '__none__' and summary.track_id is null)
        or summary.track_id::text = target_track_id
      )
      and (
        coalesce(target_territory, 'all') = 'all'
        or (
          case
            when upper(btrim(coalesce(summary.territory, ''))) = 'UK' then 'GB'
            when upper(btrim(coalesce(summary.territory, ''))) ~ '^[A-Z]{2}$'
              and upper(btrim(coalesce(summary.territory, ''))) not in ('EU', 'WW', 'XX', 'ZZ')
              then upper(btrim(summary.territory))
            else '__none__'
          end
        ) = target_territory
      )
  )
  select
    filtered.month,
    filtered.channel_id,
    filtered.territory,
    coalesce(sum(filtered.streams), 0)::bigint as streams
  from filtered
  group by filtered.month, filtered.channel_id, filtered.territory
  order by filtered.month asc, filtered.channel_id asc nulls first, filtered.territory asc;
$$;

revoke all on function public.get_artist_analytics_audience_streams(uuid[], date, date, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_artist_analytics_audience_streams(uuid[], date, date, text, text, text, text, text)
  to service_role;
