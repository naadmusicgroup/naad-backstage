create or replace function public.get_artist_dashboard_home_analytics_rollups(
  target_artist_ids uuid[],
  target_period_start_month date default null,
  target_period_end_month date default null
)
returns table (
  row_type text,
  month date,
  channel_id uuid,
  territory text,
  release_id uuid,
  track_id uuid,
  revenue numeric,
  streams bigint,
  row_count bigint,
  territory_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select
      summary.month,
      summary.channel_id,
      summary.territory,
      case
        when upper(btrim(coalesce(summary.territory, ''))) = 'UK' then 'GB'
        when upper(btrim(coalesce(summary.territory, ''))) ~ '^[A-Z]{2}$'
          and upper(btrim(coalesce(summary.territory, ''))) not in ('EU', 'WW', 'XX', 'ZZ')
          then upper(btrim(summary.territory))
        else '__none__'
      end as territory_filter,
      summary.release_id,
      coalesce(summary.revenue, 0)::numeric as revenue,
      coalesce(summary.streams, 0)::bigint as streams
    from public.monthly_earnings_summary as summary
    where summary.artist_id = any(target_artist_ids)
      and (target_period_start_month is null or summary.month >= target_period_start_month)
      and (target_period_end_month is null or summary.month <= target_period_end_month)
  )
  select
    'summary'::text as row_type,
    null::date as month,
    null::uuid as channel_id,
    null::text as territory,
    null::uuid as release_id,
    null::uuid as track_id,
    coalesce(sum(scoped.revenue), 0)::numeric as revenue,
    coalesce(sum(scoped.streams), 0)::bigint as streams,
    count(*)::bigint as row_count,
    null::bigint as territory_count
  from scoped

  union all

  select
    'monthly'::text,
    scoped.month,
    null::uuid,
    null::text,
    null::uuid,
    null::uuid,
    coalesce(sum(scoped.revenue), 0)::numeric,
    coalesce(sum(scoped.streams), 0)::bigint,
    null::bigint,
    null::bigint
  from scoped
  group by scoped.month

  union all

  select
    'country'::text,
    null::date,
    null::uuid,
    nullif(scoped.territory_filter, '__none__'),
    null::uuid,
    null::uuid,
    coalesce(sum(scoped.revenue), 0)::numeric,
    coalesce(sum(scoped.streams), 0)::bigint,
    null::bigint,
    null::bigint
  from scoped
  group by scoped.territory_filter

  union all

  select
    'platform'::text,
    null::date,
    scoped.channel_id,
    null::text,
    null::uuid,
    null::uuid,
    coalesce(sum(scoped.revenue), 0)::numeric,
    coalesce(sum(scoped.streams), 0)::bigint,
    null::bigint,
    null::bigint
  from scoped
  group by scoped.channel_id

  union all

  select
    'release'::text,
    null::date,
    null::uuid,
    null::text,
    scoped.release_id,
    null::uuid,
    coalesce(sum(scoped.revenue), 0)::numeric,
    coalesce(sum(scoped.streams), 0)::bigint,
    null::bigint,
    count(distinct scoped.territory) filter (where scoped.territory is not null)::bigint
  from scoped
  group by scoped.release_id

  order by row_type, month asc nulls first, channel_id asc nulls first, territory asc nulls first, release_id asc nulls first;
$$;

revoke all on function public.get_artist_dashboard_home_analytics_rollups(uuid[], date, date)
  from public, anon, authenticated;
grant execute on function public.get_artist_dashboard_home_analytics_rollups(uuid[], date, date)
  to service_role;
