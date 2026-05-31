create or replace function public.get_statement_earnings_totals(
  target_artist_ids uuid[],
  target_period_month date default null,
  target_period_start_month date default null,
  target_period_end_month date default null,
  target_release_id uuid default null,
  target_channel_id uuid default null,
  target_territory text default null
)
returns table (
  total_revenue numeric,
  total_streams bigint,
  processed_row_count bigint,
  grouped_row_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(summary.revenue), 0) as total_revenue,
    coalesce(sum(summary.streams), 0)::bigint as total_streams,
    coalesce(sum(summary.row_count), 0)::bigint as processed_row_count,
    count(*)::bigint as grouped_row_count
  from public.monthly_earnings_summary as summary
  where summary.artist_id = any(target_artist_ids)
    and (target_period_month is null or summary.month = target_period_month)
    and (target_period_month is not null or target_period_start_month is null or summary.month >= target_period_start_month)
    and (target_period_month is not null or target_period_end_month is null or summary.month <= target_period_end_month)
    and (target_release_id is null or summary.release_id = target_release_id)
    and (target_channel_id is null or summary.channel_id = target_channel_id)
    and (target_territory is null or summary.territory = target_territory);
$$;

create or replace function public.get_statement_earnings_filter_values(
  target_artist_ids uuid[],
  target_period_month date default null,
  target_period_start_month date default null,
  target_period_end_month date default null
)
returns table (
  release_ids uuid[],
  channel_ids uuid[],
  territories text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(array_agg(distinct summary.release_id) filter (where summary.release_id is not null), array[]::uuid[]) as release_ids,
    coalesce(array_agg(distinct summary.channel_id) filter (where summary.channel_id is not null), array[]::uuid[]) as channel_ids,
    coalesce(array_agg(distinct btrim(summary.territory)) filter (where summary.territory is not null and btrim(summary.territory) <> ''), array[]::text[]) as territories
  from public.monthly_earnings_summary as summary
  where summary.artist_id = any(target_artist_ids)
    and (target_period_month is null or summary.month = target_period_month)
    and (target_period_month is not null or target_period_start_month is null or summary.month >= target_period_start_month)
    and (target_period_month is not null or target_period_end_month is null or summary.month <= target_period_end_month);
$$;

create or replace function public.get_artist_statement_earnings_monthly(
  target_artist_ids uuid[]
)
returns table (
  period_month date,
  earnings numeric,
  streams bigint,
  row_count bigint,
  channel_ids uuid[],
  territories text[],
  release_ids uuid[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    summary.month as period_month,
    coalesce(sum(summary.revenue), 0) as earnings,
    coalesce(sum(summary.streams), 0)::bigint as streams,
    coalesce(sum(summary.row_count), 0)::bigint as row_count,
    coalesce(array_agg(distinct summary.channel_id) filter (where summary.channel_id is not null), array[]::uuid[]) as channel_ids,
    coalesce(array_agg(distinct btrim(summary.territory)) filter (where summary.territory is not null and btrim(summary.territory) <> ''), array[]::text[]) as territories,
    coalesce(array_agg(distinct summary.release_id) filter (where summary.release_id is not null), array[]::uuid[]) as release_ids
  from public.monthly_earnings_summary as summary
  where summary.artist_id = any(target_artist_ids)
  group by summary.month
  order by summary.month desc;
$$;

revoke all on function public.get_statement_earnings_totals(uuid[], date, date, date, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_statement_earnings_filter_values(uuid[], date, date, date) from public, anon, authenticated;
revoke all on function public.get_artist_statement_earnings_monthly(uuid[]) from public, anon, authenticated;

grant execute on function public.get_statement_earnings_totals(uuid[], date, date, date, uuid, uuid, text) to service_role;
grant execute on function public.get_statement_earnings_filter_values(uuid[], date, date, date) to service_role;
grant execute on function public.get_artist_statement_earnings_monthly(uuid[]) to service_role;
