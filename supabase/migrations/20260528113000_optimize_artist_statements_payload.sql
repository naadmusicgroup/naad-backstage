create index if not exists idx_publishing_earnings_artist_period_amount_id
on public.publishing_earnings (artist_id, period_month desc, amount desc, id);

create or replace function public.get_artist_statements_payload(
  target_artist_ids uuid[]
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with bounded_input as (
    select coalesce(target_artist_ids, array[]::uuid[]) as artist_ids
  ),
  earnings_monthly as (
    select
      summary.month as period_month,
      coalesce(sum(summary.revenue), 0) as earnings,
      coalesce(sum(summary.streams), 0)::bigint as streams,
      coalesce(sum(summary.row_count), 0)::bigint as row_count,
      coalesce(array_agg(distinct summary.channel_id) filter (where summary.channel_id is not null), array[]::uuid[]) as channel_ids,
      coalesce(array_agg(distinct btrim(summary.territory)) filter (where summary.territory is not null and btrim(summary.territory) <> ''), array[]::text[]) as territories,
      coalesce(array_agg(distinct summary.release_id) filter (where summary.release_id is not null), array[]::uuid[]) as release_ids
    from public.monthly_earnings_summary as summary, bounded_input
    where summary.artist_id = any(bounded_input.artist_ids)
    group by summary.month
  ),
  statement_period_rows as (
    select
      statement_period.period_month,
      bool_or(statement_period.status = 'closed') as is_closed,
      max(statement_period.closed_at) filter (where statement_period.closed_at is not null) as closed_at
    from public.statement_periods as statement_period, bounded_input
    where statement_period.artist_id = any(bounded_input.artist_ids)
    group by statement_period.period_month
  ),
  publishing_rows as (
    select
      publishing.id,
      publishing.artist_id,
      artist.name as artist_name,
      publishing.release_id,
      release.title as release_title,
      publishing.period_month,
      publishing.amount,
      publishing.notes
    from public.publishing_earnings as publishing
    join public.artists as artist
      on artist.id = publishing.artist_id
    left join public.releases as release
      on release.id = publishing.release_id
    cross join bounded_input
    where publishing.artist_id = any(bounded_input.artist_ids)
  ),
  publishing_monthly as (
    select
      publishing.period_month,
      coalesce(sum(publishing.amount), 0) as publishing,
      coalesce(array_agg(distinct publishing.release_id) filter (where publishing.release_id is not null), array[]::uuid[]) as release_ids
    from publishing_rows as publishing
    group by publishing.period_month
  ),
  period_months as (
    select period_month from statement_period_rows
    union
    select period_month from earnings_monthly
    union
    select period_month from publishing_monthly
  ),
  statement_rows as (
    select
      period.period_month,
      case when coalesce(statement_period.is_closed, false) then 'closed' else 'open' end as status,
      statement_period.closed_at,
      coalesce(earnings.earnings, 0) as earnings,
      coalesce(publishing.publishing, 0) as publishing,
      coalesce(earnings.streams, 0)::bigint as streams,
      coalesce(earnings.row_count, 0)::bigint as row_count,
      cardinality(coalesce(earnings.channel_ids, array[]::uuid[])) as channel_count,
      cardinality(coalesce(earnings.territories, array[]::text[])) as territory_count,
      (
        select count(distinct release_id)::integer
        from (
          select unnest(coalesce(earnings.release_ids, array[]::uuid[])) as release_id
          union all
          select unnest(coalesce(publishing.release_ids, array[]::uuid[])) as release_id
        ) as release_union
        where release_id is not null
      ) as release_count
    from period_months as period
    left join statement_period_rows as statement_period
      on statement_period.period_month = period.period_month
    left join earnings_monthly as earnings
      on earnings.period_month = period.period_month
    left join publishing_monthly as publishing
      on publishing.period_month = period.period_month
  ),
  release_options as (
    select jsonb_agg(
      jsonb_build_object(
        'value', release_option.release_id::text,
        'label', coalesce(release_option.release_title, 'Unknown release')
      )
      order by coalesce(release_option.release_title, 'Unknown release')
    ) as rows
    from (
      select distinct on (publishing.release_id)
        publishing.release_id,
        publishing.release_title
      from publishing_rows as publishing
      where publishing.release_id is not null
      order by publishing.release_id, coalesce(publishing.release_title, 'Unknown release')
    ) as release_option
  ),
  statement_json as (
    select jsonb_agg(
      jsonb_build_object(
        'periodMonth', statement.period_month::text,
        'status', statement.status,
        'closedAt', statement.closed_at,
        'earnings', to_char(statement.earnings, 'FM999999999999999999999999990.00000000'),
        'publishing', to_char(statement.publishing, 'FM999999999999999999999999990.00000000'),
        'streams', statement.streams,
        'rowCount', statement.row_count,
        'channelCount', statement.channel_count,
        'territoryCount', statement.territory_count,
        'releaseCount', statement.release_count
      )
      order by statement.period_month desc
    ) as rows
    from statement_rows as statement
  ),
  period_options as (
    select jsonb_agg(
      jsonb_build_object(
        'value', statement.period_month::text,
        'label', to_char(statement.period_month, 'FMMonth YYYY')
      )
      order by statement.period_month desc
    ) as rows
    from statement_rows as statement
  ),
  publishing_json as (
    select jsonb_agg(
      jsonb_build_object(
        'id', publishing.id::text,
        'periodMonth', publishing.period_month::text,
        'artistId', publishing.artist_id::text,
        'artistName', publishing.artist_name,
        'releaseId', publishing.release_id::text,
        'releaseTitle', case
          when publishing.release_id is null then null
          else coalesce(publishing.release_title, 'Unknown release')
        end,
        'amount', to_char(coalesce(publishing.amount, 0), 'FM999999999999999999999999990.00000000'),
        'notes', publishing.notes
      )
      order by publishing.period_month desc, publishing.amount desc, publishing.id asc
    ) as rows
    from publishing_rows as publishing
  )
  select jsonb_build_object(
    'defaultPeriodMonth', (
      select statement.period_month::text
      from statement_rows as statement
      order by statement.period_month desc
      limit 1
    ),
    'statements', coalesce((select rows from statement_json), '[]'::jsonb),
    'earningsBreakdownRows', '[]'::jsonb,
    'publishingBreakdownRows', coalesce((select rows from publishing_json), '[]'::jsonb),
    'filterOptions', jsonb_build_object(
      'periodMonths', coalesce((select rows from period_options), '[]'::jsonb),
      'releases', coalesce((select rows from release_options), '[]'::jsonb),
      'territories', '[]'::jsonb,
      'channels', '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_artist_statements_payload(uuid[]) from public, anon, authenticated;
grant execute on function public.get_artist_statements_payload(uuid[]) to service_role;
