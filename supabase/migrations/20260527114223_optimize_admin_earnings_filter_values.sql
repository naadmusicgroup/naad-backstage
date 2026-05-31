create or replace function public.get_admin_earnings_filter_values()
returns table (
  row_type text,
  value text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    'period_month'::text as row_type,
    period_month::text as value
  from (
    select distinct upload.period_month
    from public.csv_uploads as upload
    where upload.period_month is not null
  ) as periods

  union all

  select
    'territory'::text as row_type,
    territory as value
  from (
    select distinct btrim(earning.territory) as territory
    from public.earnings as earning
    where nullif(btrim(earning.territory), '') is not null
  ) as territories

  order by row_type asc, value asc;
$$;

revoke all on function public.get_admin_earnings_filter_values()
  from public, anon, authenticated;
grant execute on function public.get_admin_earnings_filter_values()
  to service_role;
