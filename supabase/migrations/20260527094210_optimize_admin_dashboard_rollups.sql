create or replace function public.get_admin_dashboard_summary()
returns table (
  active_artist_count bigint,
  active_release_count bigint,
  active_track_count bigint,
  completed_upload_count bigint,
  awaiting_commit_upload_count bigint,
  failed_upload_count bigint,
  pending_payout_count bigint,
  pending_payout_amount numeric,
  approved_payout_count bigint,
  approved_payout_amount numeric,
  open_statement_count bigint,
  closed_statement_count bigint,
  artists_missing_bank_details_count bigint,
  artists_missing_publishing_info_count bigint,
  pending_release_submission_count bigint
)
language sql
stable
set search_path = public
as $$
  with active_artist_flags as (
    select
      a.id,
      (bd.artist_id is null) as missing_bank_details,
      not (
        coalesce(pi.legal_name, '') <> ''
        or coalesce(pi.ipi_number, '') <> ''
        or coalesce(pi.pro_name, '') <> ''
      ) as missing_publishing_info
    from public.artists as a
    left join public.artist_bank_details as bd
      on bd.artist_id = a.id
    left join public.artist_publishing_info as pi
      on pi.artist_id = a.id
    where a.is_active = true
  ),
  upload_counts as (
    select
      count(*) filter (where status = 'completed') as completed_upload_count,
      count(*) filter (where status = 'processing') as awaiting_commit_upload_count,
      count(*) filter (where status in ('failed', 'abandoned')) as failed_upload_count
    from public.csv_uploads
  ),
  payout_totals as (
    select
      count(*) filter (where status = 'pending') as pending_payout_count,
      coalesce(sum(amount) filter (where status = 'pending'), 0) as pending_payout_amount,
      count(*) filter (where status = 'approved') as approved_payout_count,
      coalesce(sum(amount) filter (where status = 'approved'), 0) as approved_payout_amount
    from public.payout_requests
    where status in ('pending', 'approved')
  ),
  statement_counts as (
    select
      count(*) filter (where status = 'open') as open_statement_count,
      count(*) filter (where status = 'closed') as closed_statement_count
    from public.statement_periods
  )
  select
    (select count(*) from active_artist_flags) as active_artist_count,
    (select count(*) from public.releases where status in ('draft', 'live', 'taken_down')) as active_release_count,
    (select count(*) from public.tracks where status in ('draft', 'live')) as active_track_count,
    coalesce(upload_counts.completed_upload_count, 0) as completed_upload_count,
    coalesce(upload_counts.awaiting_commit_upload_count, 0) as awaiting_commit_upload_count,
    coalesce(upload_counts.failed_upload_count, 0) as failed_upload_count,
    coalesce(payout_totals.pending_payout_count, 0) as pending_payout_count,
    coalesce(payout_totals.pending_payout_amount, 0) as pending_payout_amount,
    coalesce(payout_totals.approved_payout_count, 0) as approved_payout_count,
    coalesce(payout_totals.approved_payout_amount, 0) as approved_payout_amount,
    coalesce(statement_counts.open_statement_count, 0) as open_statement_count,
    coalesce(statement_counts.closed_statement_count, 0) as closed_statement_count,
    (select count(*) from active_artist_flags where missing_bank_details) as artists_missing_bank_details_count,
    (select count(*) from active_artist_flags where missing_publishing_info) as artists_missing_publishing_info_count,
    (select count(*) from public.artist_release_submissions where status = 'pending_review') as pending_release_submission_count
  from upload_counts, payout_totals, statement_counts;
$$;

revoke all on function public.get_admin_dashboard_summary() from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_summary() to service_role;

create or replace function public.get_admin_dashboard_readiness(
  target_limit integer default 8
)
returns table (
  id uuid,
  name text,
  email text,
  country text,
  missing_bank_details boolean,
  missing_publishing_info boolean
)
language sql
stable
set search_path = public
as $$
  with active_artist_flags as (
    select
      a.id,
      a.name,
      a.email,
      a.country,
      (bd.artist_id is null) as missing_bank_details,
      not (
        coalesce(pi.legal_name, '') <> ''
        or coalesce(pi.ipi_number, '') <> ''
        or coalesce(pi.pro_name, '') <> ''
      ) as missing_publishing_info
    from public.artists as a
    left join public.artist_bank_details as bd
      on bd.artist_id = a.id
    left join public.artist_publishing_info as pi
      on pi.artist_id = a.id
    where a.is_active = true
  )
  select
    active_artist_flags.id,
    active_artist_flags.name,
    active_artist_flags.email,
    active_artist_flags.country,
    active_artist_flags.missing_bank_details,
    active_artist_flags.missing_publishing_info
  from active_artist_flags
  where missing_bank_details or missing_publishing_info
  order by
    (missing_bank_details::integer + missing_publishing_info::integer) desc,
    name asc,
    id asc
  limit least(greatest(coalesce(target_limit, 8), 1), 50);
$$;

revoke all on function public.get_admin_dashboard_readiness(integer) from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_readiness(integer) to service_role;

create or replace function public.get_admin_dashboard_statement_period_totals(
  target_artist_ids uuid[],
  target_period_months date[]
)
returns table (
  artist_id uuid,
  period_month date,
  earnings numeric,
  upload_count bigint
)
language sql
stable
set search_path = public
as $$
  with statement_revenue as (
    select
      summary.artist_id,
      summary.month as period_month,
      coalesce(sum(summary.revenue), 0) as earnings
    from public.monthly_earnings_summary as summary
    where summary.artist_id = any(target_artist_ids)
      and summary.month = any(target_period_months)
    group by summary.artist_id, summary.month
  ),
  upload_counts as (
    select
      uploads.artist_id,
      uploads.period_month,
      count(*) as upload_count
    from public.csv_uploads as uploads
    where uploads.artist_id = any(target_artist_ids)
      and uploads.period_month = any(target_period_months)
      and uploads.status = 'completed'
    group by uploads.artist_id, uploads.period_month
  )
  select
    coalesce(statement_revenue.artist_id, upload_counts.artist_id) as artist_id,
    coalesce(statement_revenue.period_month, upload_counts.period_month) as period_month,
    coalesce(statement_revenue.earnings, 0) as earnings,
    coalesce(upload_counts.upload_count, 0) as upload_count
  from statement_revenue
  full join upload_counts
    on upload_counts.artist_id = statement_revenue.artist_id
   and upload_counts.period_month = statement_revenue.period_month;
$$;

revoke all on function public.get_admin_dashboard_statement_period_totals(uuid[], date[]) from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_statement_period_totals(uuid[], date[]) to service_role;
