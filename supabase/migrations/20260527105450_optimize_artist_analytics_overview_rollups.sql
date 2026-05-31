create or replace function public.get_artist_analytics_overview_rollups(
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
      summary.track_id,
      coalesce(summary.revenue, 0)::numeric as revenue,
      coalesce(summary.streams, 0)::bigint as streams
    from public.monthly_earnings_summary as summary
    where summary.artist_id = any(target_artist_ids)
      and (target_period_start_month is null or summary.month >= target_period_start_month)
      and (target_period_end_month is null or summary.month <= target_period_end_month)
  ),
  filtered as (
    select *
    from scoped
    where (
        coalesce(target_period_month, 'all') = 'all'
        or month::text = target_period_month
      )
      and (
        coalesce(target_channel_id, 'all') = 'all'
        or (target_channel_id = '__none__' and channel_id is null)
        or channel_id::text = target_channel_id
      )
      and (
        coalesce(target_territory, 'all') = 'all'
        or territory_filter = target_territory
      )
      and (
        coalesce(target_release_id, 'all') = 'all'
        or (target_release_id = '__none__' and release_id is null)
        or release_id::text = target_release_id
      )
      and (
        coalesce(target_track_id, 'all') = 'all'
        or (target_track_id = '__none__' and track_id is null)
        or track_id::text = target_track_id
      )
  ),
  publishing_scoped as (
    select
      publishing.period_month,
      coalesce(publishing.amount, 0)::numeric as amount
    from public.publishing_earnings as publishing
    where publishing.artist_id = any(target_artist_ids)
      and (target_period_start_month is null or publishing.period_month >= target_period_start_month)
      and (target_period_end_month is null or publishing.period_month <= target_period_end_month)
  ),
  publishing_filtered as (
    select *
    from publishing_scoped
    where (
      coalesce(target_period_month, 'all') = 'all'
      or period_month::text = target_period_month
    )
  )
  select
    'summary'::text as row_type,
    null::date as month,
    null::uuid as channel_id,
    null::text as territory,
    null::uuid as release_id,
    null::uuid as track_id,
    coalesce(sum(filtered.revenue), 0)::numeric as revenue,
    coalesce(sum(filtered.streams), 0)::bigint as streams,
    count(*)::bigint as row_count,
    null::bigint as territory_count
  from filtered

  union all

  select
    'monthly'::text,
    filtered.month,
    null::uuid,
    null::text,
    null::uuid,
    null::uuid,
    coalesce(sum(filtered.revenue), 0)::numeric,
    coalesce(sum(filtered.streams), 0)::bigint,
    null::bigint,
    null::bigint
  from filtered
  group by filtered.month

  union all

  select
    'country'::text,
    null::date,
    null::uuid,
    nullif(filtered.territory_filter, '__none__'),
    null::uuid,
    null::uuid,
    coalesce(sum(filtered.revenue), 0)::numeric,
    coalesce(sum(filtered.streams), 0)::bigint,
    null::bigint,
    null::bigint
  from filtered
  group by filtered.territory_filter

  union all

  select
    'platform'::text,
    null::date,
    filtered.channel_id,
    null::text,
    null::uuid,
    null::uuid,
    coalesce(sum(filtered.revenue), 0)::numeric,
    coalesce(sum(filtered.streams), 0)::bigint,
    null::bigint,
    null::bigint
  from filtered
  group by filtered.channel_id

  union all

  select
    'platform_month'::text,
    filtered.month,
    filtered.channel_id,
    null::text,
    null::uuid,
    null::uuid,
    coalesce(sum(filtered.revenue), 0)::numeric,
    coalesce(sum(filtered.streams), 0)::bigint,
    null::bigint,
    null::bigint
  from filtered
  group by filtered.month, filtered.channel_id

  union all

  select
    'release'::text,
    null::date,
    null::uuid,
    null::text,
    filtered.release_id,
    null::uuid,
    coalesce(sum(filtered.revenue), 0)::numeric,
    coalesce(sum(filtered.streams), 0)::bigint,
    null::bigint,
    count(distinct filtered.territory) filter (where filtered.territory is not null)::bigint
  from filtered
  group by filtered.release_id

  union all

  select
    'earnings_matrix'::text,
    filtered.month,
    filtered.channel_id,
    null::text,
    filtered.release_id,
    null::uuid,
    coalesce(sum(filtered.revenue), 0)::numeric,
    coalesce(sum(filtered.streams), 0)::bigint,
    null::bigint,
    null::bigint
  from filtered
  group by filtered.month, filtered.channel_id, filtered.release_id

  union all

  select
    'publishing'::text,
    publishing_filtered.period_month,
    null::uuid,
    null::text,
    null::uuid,
    null::uuid,
    coalesce(sum(publishing_filtered.amount), 0)::numeric,
    null::bigint,
    null::bigint,
    null::bigint
  from publishing_filtered
  group by publishing_filtered.period_month

  union all

  select distinct
    'filter_earning_period'::text,
    scoped.month,
    null::uuid,
    null::text,
    null::uuid,
    null::uuid,
    null::numeric,
    null::bigint,
    null::bigint,
    null::bigint
  from scoped

  union all

  select distinct
    'filter_period'::text,
    scoped.month,
    null::uuid,
    null::text,
    null::uuid,
    null::uuid,
    null::numeric,
    null::bigint,
    null::bigint,
    null::bigint
  from scoped

  union all

  select distinct
    'filter_period'::text,
    publishing_scoped.period_month,
    null::uuid,
    null::text,
    null::uuid,
    null::uuid,
    null::numeric,
    null::bigint,
    null::bigint,
    null::bigint
  from publishing_scoped

  union all

  select distinct
    'filter_channel'::text,
    null::date,
    scoped.channel_id,
    null::text,
    null::uuid,
    null::uuid,
    null::numeric,
    null::bigint,
    null::bigint,
    null::bigint
  from scoped

  union all

  select distinct
    'filter_territory'::text,
    null::date,
    null::uuid,
    scoped.territory_filter,
    null::uuid,
    null::uuid,
    null::numeric,
    null::bigint,
    null::bigint,
    null::bigint
  from scoped

  union all

  select distinct
    'filter_release'::text,
    null::date,
    null::uuid,
    null::text,
    scoped.release_id,
    null::uuid,
    null::numeric,
    null::bigint,
    null::bigint,
    null::bigint
  from scoped

  union all

  select distinct
    'filter_track'::text,
    null::date,
    null::uuid,
    null::text,
    scoped.release_id,
    scoped.track_id,
    null::numeric,
    null::bigint,
    null::bigint,
    null::bigint
  from scoped
  where (
    coalesce(target_release_id, 'all') = 'all'
    or (target_release_id = '__none__' and scoped.release_id is null)
    or scoped.release_id::text = target_release_id
  )
  order by row_type, month asc nulls first, channel_id asc nulls first, territory asc nulls first, release_id asc nulls first, track_id asc nulls first;
$$;

revoke all on function public.get_artist_analytics_overview_rollups(uuid[], date, date, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_artist_analytics_overview_rollups(uuid[], date, date, text, text, text, text, text)
  to service_role;
