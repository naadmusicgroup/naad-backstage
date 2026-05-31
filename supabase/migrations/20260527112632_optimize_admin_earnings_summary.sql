create or replace function public.get_admin_earnings_ledger_summary(
  target_artist_id uuid default null,
  target_release_id uuid default null,
  target_track_id uuid default null,
  target_channel_id uuid default null,
  target_territory text default null,
  target_earning_type text default null,
  target_upload_ids uuid[] default null
)
returns table (
  row_count bigint,
  total_revenue numeric,
  total_units bigint,
  artist_count bigint,
  release_count bigint,
  track_count bigint,
  channel_count bigint,
  territory_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint as row_count,
    coalesce(sum(e.total_amount), 0)::numeric as total_revenue,
    coalesce(sum(e.units), 0)::bigint as total_units,
    count(distinct e.artist_id)::bigint as artist_count,
    count(distinct e.release_id)::bigint as release_count,
    count(distinct e.track_id)::bigint as track_count,
    count(distinct e.channel_id)::bigint as channel_count,
    count(distinct nullif(btrim(e.territory), ''))::bigint as territory_count
  from public.earnings as e
  where (target_artist_id is null or e.artist_id = target_artist_id)
    and (target_release_id is null or e.release_id = target_release_id)
    and (target_track_id is null or e.track_id = target_track_id)
    and (target_channel_id is null or e.channel_id = target_channel_id)
    and (target_territory is null or e.territory = target_territory)
    and (target_earning_type is null or e.earning_type = target_earning_type)
    and (target_upload_ids is null or e.upload_id = any(target_upload_ids));
$$;

revoke all on function public.get_admin_earnings_ledger_summary(uuid, uuid, uuid, uuid, text, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.get_admin_earnings_ledger_summary(uuid, uuid, uuid, uuid, text, text, uuid[])
  to service_role;
