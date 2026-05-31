create or replace function public.get_csv_upload_original_earnings_total(
  target_upload_id uuid
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(earning.total_amount), 0)::numeric
  from public.earnings as earning
  where earning.upload_id = target_upload_id
    and earning.earning_type = 'original';
$$;

revoke all on function public.get_csv_upload_original_earnings_total(uuid)
  from public, anon, authenticated;
grant execute on function public.get_csv_upload_original_earnings_total(uuid)
  to service_role;
