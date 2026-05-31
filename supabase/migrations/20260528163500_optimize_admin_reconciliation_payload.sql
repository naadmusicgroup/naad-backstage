create index if not exists idx_csv_uploads_reconciliation_scan
on public.csv_uploads (artist_id, period_month, created_at, id)
include (filename, status, total_amount);

create index if not exists idx_earnings_reconciliation_upload_type
on public.earnings (upload_id, earning_type, artist_id)
include (total_amount);

create index if not exists idx_statement_periods_artist_month
on public.statement_periods (artist_id, period_month);

create index if not exists idx_transaction_ledger_artist_created
on public.transaction_ledger (artist_id, created_at desc, id desc)
include (type, amount, balance_after);

create or replace function public.get_admin_reconciliation_payload()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
artist_scope as (
  select id as artist_id from public.artists
  union
  select artist_id from public.artist_wallet
  union
  select artist_id from public.csv_uploads
  union
  select artist_id from public.earnings
  union
  select artist_id from public.publishing_earnings
  union
  select artist_id from public.statement_periods
  union
  select artist_id from public.dues
  union
  select artist_id from public.payout_requests
  union
  select artist_id from public.transaction_ledger
),
wallet_metrics as (
  select
    wallet.artist_id,
    coalesce(wallet.total_earned, 0)::numeric as wallet_earned,
    coalesce(wallet.total_dues, 0)::numeric as wallet_dues,
    coalesce(wallet.pending_payouts, 0)::numeric as wallet_pending_payouts,
    coalesce(wallet.approved_payouts, 0)::numeric as wallet_approved_payouts,
    coalesce(wallet.total_withdrawn, 0)::numeric as wallet_paid_payouts,
    coalesce(wallet.available_balance, 0)::numeric as wallet_available_balance
  from public.artist_wallet as wallet
),
upload_metrics as (
  select
    upload.artist_id,
    count(*) filter (where upload.status = 'completed')::integer as completed_upload_count,
    count(*) filter (where upload.status = 'reversed')::integer as reversed_upload_count
  from public.csv_uploads as upload
  group by upload.artist_id
),
earning_metrics as (
  select
    coalesce(upload.artist_id, earning.artist_id) as artist_id,
    coalesce(sum(earning.total_amount) filter (
      where upload.id is not null
        and earning.earning_type = 'original'
        and upload.status = 'completed'
    ), 0)::numeric as active_earnings,
    count(*) filter (where upload.id is null)::integer as orphan_earning_count,
    count(*) filter (
      where upload.id is not null
        and (
          earning.earning_type = 'reversal'
          or (earning.earning_type = 'original' and upload.status = 'reversed')
        )
    )::integer as reversed_earning_count,
    count(*) filter (
      where upload.id is not null
        and earning.earning_type = 'original'
        and upload.status <> 'completed'
        and upload.status <> 'reversed'
    )::integer as inactive_upload_earning_count
  from public.earnings as earning
  left join public.csv_uploads as upload
    on upload.id = earning.upload_id
  group by coalesce(upload.artist_id, earning.artist_id)
),
upload_earnings as (
  select
    upload.id as upload_id,
    coalesce(sum(earning.total_amount) filter (
      where earning.earning_type = 'original'
    ), 0)::numeric as original_earnings_sum
  from public.csv_uploads as upload
  left join public.earnings as earning
    on earning.upload_id = upload.id
  where upload.status = 'completed'
  group by upload.id
),
publishing_metrics as (
  select
    publishing.artist_id,
    coalesce(sum(publishing.amount), 0)::numeric as publishing
  from public.publishing_earnings as publishing
  group by publishing.artist_id
),
active_money_periods as (
  select distinct upload.artist_id, upload.period_month
  from public.csv_uploads as upload
  where upload.status = 'completed'
  union
  select distinct publishing.artist_id, publishing.period_month
  from public.publishing_earnings as publishing
),
statement_periods as (
  select distinct period.artist_id, period.period_month
  from public.statement_periods as period
),
due_metrics as (
  select
    due.artist_id,
    coalesce(sum(due.amount) filter (where due.status in ('unpaid', 'paid')), 0)::numeric as dues
  from public.dues as due
  group by due.artist_id
),
payout_metrics as (
  select
    payout.artist_id,
    coalesce(sum(payout.amount) filter (where payout.status in ('pending', 'approved')), 0)::numeric as payout_reserved,
    coalesce(sum(payout.amount) filter (where payout.status = 'paid'), 0)::numeric as payout_paid
  from public.payout_requests as payout
  group by payout.artist_id
),
ledger_metrics as (
  select
    ledger.artist_id,
    coalesce(sum(ledger.amount), 0)::numeric as ledger_amount_sum,
    count(*) filter (where ledger.type = 'csv_reversal')::integer as reversal_ledger_count
  from public.transaction_ledger as ledger
  group by ledger.artist_id
),
latest_ledger as (
  select distinct on (ledger.artist_id)
    ledger.artist_id,
    coalesce(ledger.balance_after, 0)::numeric as latest_ledger_balance
  from public.transaction_ledger as ledger
  order by ledger.artist_id, ledger.created_at desc, ledger.id desc
),
artist_metrics as (
  select
    scope.artist_id,
    artist.name as artist_name,
    artist.email as artist_email,
    coalesce(artist.is_active, false) as artist_is_active,
    coalesce(wallet.wallet_earned, 0)::numeric as wallet_earned,
    coalesce(wallet.wallet_dues, 0)::numeric as wallet_dues,
    coalesce(wallet.wallet_pending_payouts, 0)::numeric as wallet_pending_payouts,
    coalesce(wallet.wallet_approved_payouts, 0)::numeric as wallet_approved_payouts,
    coalesce(wallet.wallet_paid_payouts, 0)::numeric as wallet_paid_payouts,
    coalesce(wallet.wallet_available_balance, 0)::numeric as wallet_available_balance,
    coalesce(earning.active_earnings, 0)::numeric as active_earnings,
    coalesce(publishing.publishing, 0)::numeric as publishing,
    coalesce(due_metrics.dues, 0)::numeric as dues,
    coalesce(payout.payout_reserved, 0)::numeric as payout_reserved,
    coalesce(payout.payout_paid, 0)::numeric as payout_paid,
    coalesce(ledger.ledger_amount_sum, 0)::numeric as ledger_amount_sum,
    coalesce(latest_ledger.latest_ledger_balance, 0)::numeric as latest_ledger_balance,
    coalesce(upload.completed_upload_count, 0)::integer as completed_upload_count,
    coalesce(upload.reversed_upload_count, 0)::integer as reversed_upload_count,
    coalesce(earning.orphan_earning_count, 0)::integer as orphan_earning_count,
    coalesce(earning.reversed_earning_count, 0)::integer as reversed_earning_count,
    coalesce(earning.inactive_upload_earning_count, 0)::integer as inactive_upload_earning_count,
    coalesce(ledger.reversal_ledger_count, 0)::integer as reversal_ledger_count
  from artist_scope as scope
  left join public.artists as artist
    on artist.id = scope.artist_id
  left join wallet_metrics as wallet
    on wallet.artist_id = scope.artist_id
  left join upload_metrics as upload
    on upload.artist_id = scope.artist_id
  left join earning_metrics as earning
    on earning.artist_id = scope.artist_id
  left join publishing_metrics as publishing
    on publishing.artist_id = scope.artist_id
  left join due_metrics
    on due_metrics.artist_id = scope.artist_id
  left join payout_metrics as payout
    on payout.artist_id = scope.artist_id
  left join ledger_metrics as ledger
    on ledger.artist_id = scope.artist_id
  left join latest_ledger
    on latest_ledger.artist_id = scope.artist_id
),
issue_rows as (
  select
    upload.artist_id,
    10 as issue_order,
    upload.id::text as issue_key,
    'completed_upload_total_mismatch'::text as code,
    'error'::text as severity,
    upload.filename || ' total does not match its original earnings entries.' as message,
    upload.total_amount::numeric as expected,
    coalesce(upload_earnings.original_earnings_sum, 0)::numeric as actual
  from public.csv_uploads as upload
  left join upload_earnings
    on upload_earnings.upload_id = upload.id
  where upload.status = 'completed'
    and abs(coalesce(upload.total_amount, 0)::numeric - coalesce(upload_earnings.original_earnings_sum, 0)::numeric) > 0.000001

  union all

  select
    active_period.artist_id,
    20 as issue_order,
    active_period.period_month::text as issue_key,
    'missing_statement_period'::text as code,
    'warning'::text as severity,
    'No statement period exists for active money in ' || active_period.period_month::text || '.' as message,
    null::numeric as expected,
    null::numeric as actual
  from active_money_periods as active_period
  where not exists (
    select 1
    from statement_periods as period
    where period.artist_id = active_period.artist_id
      and period.period_month is not distinct from active_period.period_month
  )

  union all

  select
    metrics.artist_id,
    30 as issue_order,
    metrics.artist_id::text as issue_key,
    'orphan_earnings'::text as code,
    'error'::text as severity,
    metrics.orphan_earning_count::text || ' earning row' || case when metrics.orphan_earning_count = 1 then '' else 's' end || ' reference a missing CSV upload.' as message,
    null::numeric as expected,
    null::numeric as actual
  from artist_metrics as metrics
  where metrics.orphan_earning_count > 0

  union all

  select
    metrics.artist_id,
    40 as issue_order,
    metrics.artist_id::text as issue_key,
    'inactive_upload_earnings'::text as code,
    'error'::text as severity,
    metrics.inactive_upload_earning_count::text || ' original earning row' || case when metrics.inactive_upload_earning_count = 1 then '' else 's' end || ' are attached to non-completed CSV uploads.' as message,
    null::numeric as expected,
    null::numeric as actual
  from artist_metrics as metrics
  where metrics.inactive_upload_earning_count > 0

  union all

  select
    metrics.artist_id,
    50 as issue_order,
    metrics.artist_id::text as issue_key,
    'legacy_reversed_uploads'::text as code,
    'warning'::text as severity,
    metrics.reversed_upload_count::text || ' legacy reversed upload' || case when metrics.reversed_upload_count = 1 then '' else 's' end || ' remain admin-visible and excluded from artist totals.' as message,
    null::numeric as expected,
    null::numeric as actual
  from artist_metrics as metrics
  where metrics.reversed_upload_count > 0

  union all

  select
    metrics.artist_id,
    60 as issue_order,
    metrics.artist_id::text as issue_key,
    'legacy_reversal_earnings'::text as code,
    'warning'::text as severity,
    metrics.reversed_earning_count::text || ' legacy reversal earning row' || case when metrics.reversed_earning_count = 1 then '' else 's' end || ' remain excluded from artist totals.' as message,
    null::numeric as expected,
    null::numeric as actual
  from artist_metrics as metrics
  where metrics.reversed_earning_count > 0

  union all

  select
    metrics.artist_id,
    70 as issue_order,
    metrics.artist_id::text as issue_key,
    'legacy_reversal_ledger'::text as code,
    'warning'::text as severity,
    metrics.reversal_ledger_count::text || ' legacy CSV reversal ledger row' || case when metrics.reversal_ledger_count = 1 then '' else 's' end || ' remain admin-visible.' as message,
    null::numeric as expected,
    null::numeric as actual
  from artist_metrics as metrics
  where metrics.reversal_ledger_count > 0

  union all

  select
    metrics.artist_id,
    80 as issue_order,
    'wallet_statement_mismatch'::text as issue_key,
    'wallet_statement_mismatch'::text as code,
    'error'::text as severity,
    'Wallet total earned does not match active statement earnings plus publishing.' as message,
    metrics.active_earnings + metrics.publishing as expected,
    metrics.wallet_earned as actual
  from artist_metrics as metrics
  where abs(metrics.wallet_earned - (metrics.active_earnings + metrics.publishing)) > 0.000001

  union all

  select
    metrics.artist_id,
    90 as issue_order,
    'wallet_dues_mismatch'::text as issue_key,
    'wallet_dues_mismatch'::text as code,
    'error'::text as severity,
    'Wallet dues total does not match active dues.' as message,
    metrics.dues as expected,
    metrics.wallet_dues as actual
  from artist_metrics as metrics
  where abs(metrics.wallet_dues - metrics.dues) > 0.000001

  union all

  select
    metrics.artist_id,
    100 as issue_order,
    'wallet_reserved_payout_mismatch'::text as issue_key,
    'wallet_reserved_payout_mismatch'::text as code,
    'error'::text as severity,
    'Wallet reserved payout total does not match pending plus approved payouts.' as message,
    metrics.payout_reserved as expected,
    metrics.wallet_pending_payouts + metrics.wallet_approved_payouts as actual
  from artist_metrics as metrics
  where abs((metrics.wallet_pending_payouts + metrics.wallet_approved_payouts) - metrics.payout_reserved) > 0.000001

  union all

  select
    metrics.artist_id,
    110 as issue_order,
    'wallet_paid_payout_mismatch'::text as issue_key,
    'wallet_paid_payout_mismatch'::text as code,
    'error'::text as severity,
    'Wallet withdrawn total does not match paid payouts.' as message,
    metrics.payout_paid as expected,
    metrics.wallet_paid_payouts as actual
  from artist_metrics as metrics
  where abs(metrics.wallet_paid_payouts - metrics.payout_paid) > 0.000001

  union all

  select
    metrics.artist_id,
    120 as issue_order,
    'wallet_available_mismatch'::text as issue_key,
    'wallet_available_mismatch'::text as code,
    'error'::text as severity,
    'Wallet available balance does not match earnings, dues, and payout state.' as message,
    metrics.active_earnings + metrics.publishing - metrics.dues - metrics.payout_reserved - metrics.payout_paid as expected,
    metrics.wallet_available_balance as actual
  from artist_metrics as metrics
  where abs(metrics.wallet_available_balance - (metrics.active_earnings + metrics.publishing - metrics.dues - metrics.payout_reserved - metrics.payout_paid)) > 0.000001

  union all

  select
    metrics.artist_id,
    130 as issue_order,
    'ledger_sum_mismatch'::text as issue_key,
    'ledger_sum_mismatch'::text as code,
    'error'::text as severity,
    'Ledger amount sum does not match expected available balance.' as message,
    metrics.active_earnings + metrics.publishing - metrics.dues - metrics.payout_reserved - metrics.payout_paid as expected,
    metrics.ledger_amount_sum as actual
  from artist_metrics as metrics
  where abs(metrics.ledger_amount_sum - (metrics.active_earnings + metrics.publishing - metrics.dues - metrics.payout_reserved - metrics.payout_paid)) > 0.000001

  union all

  select
    metrics.artist_id,
    140 as issue_order,
    'stale_balance_after'::text as issue_key,
    'stale_balance_after'::text as code,
    'warning'::text as severity,
    'Latest ledger balance_after is stale compared with the ledger amount sum.' as message,
    metrics.ledger_amount_sum as expected,
    metrics.latest_ledger_balance as actual
  from artist_metrics as metrics
  where abs(metrics.latest_ledger_balance - metrics.ledger_amount_sum) > 0.000001
),
issues_by_artist as (
  select
    issue.artist_id,
    count(*)::integer as issue_count,
    count(*) filter (where issue.severity = 'error')::integer as error_count,
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'code', issue.code,
        'severity', issue.severity,
        'message', issue.message,
        'expected', case
          when issue.expected is null then null
          else to_char(issue.expected, 'FM999999999999999999999999990.00000000')
        end,
        'actual', case
          when issue.actual is null then null
          else to_char(issue.actual, 'FM999999999999999999999999990.00000000')
        end
      ))
      order by issue.issue_order, issue.issue_key
    ) as issues
  from issue_rows as issue
  group by issue.artist_id
),
artist_results as (
  select
    metrics.artist_id,
    coalesce(metrics.artist_name, 'Unknown artist') as artist_name,
    metrics.artist_email,
    metrics.artist_is_active,
    case
      when coalesce(issues.error_count, 0) > 0 then 'fail'
      when coalesce(issues.issue_count, 0) > 0 then 'warning'
      else 'pass'
    end as status,
    metrics.wallet_earned,
    metrics.active_earnings + metrics.publishing as statement_earned,
    metrics.active_earnings,
    metrics.publishing,
    metrics.dues,
    metrics.payout_reserved,
    metrics.payout_paid,
    metrics.wallet_available_balance,
    metrics.active_earnings + metrics.publishing - metrics.dues - metrics.payout_reserved - metrics.payout_paid as expected_available_balance,
    metrics.ledger_amount_sum,
    metrics.latest_ledger_balance,
    metrics.completed_upload_count,
    coalesce(issues.issue_count, 0)::integer as issue_count,
    coalesce(issues.issues, '[]'::jsonb) as issues
  from artist_metrics as metrics
  left join issues_by_artist as issues
    on issues.artist_id = metrics.artist_id
),
summary as (
  select
    count(*)::integer as artist_count,
    count(*) filter (where status = 'pass')::integer as pass_count,
    count(*) filter (where status = 'warning')::integer as warning_count,
    count(*) filter (where status = 'fail')::integer as fail_count,
    coalesce(sum(issue_count), 0)::integer as issue_count
  from artist_results
)
select jsonb_build_object(
  'checkedAt', now(),
  'summary', jsonb_build_object(
    'artistCount', coalesce(summary.artist_count, 0),
    'passCount', coalesce(summary.pass_count, 0),
    'warningCount', coalesce(summary.warning_count, 0),
    'failCount', coalesce(summary.fail_count, 0),
    'issueCount', coalesce(summary.issue_count, 0)
  ),
  'artists', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'artistId', artist.artist_id,
        'artistName', artist.artist_name,
        'artistEmail', artist.artist_email,
        'artistIsActive', artist.artist_is_active,
        'status', artist.status,
        'walletEarned', to_char(artist.wallet_earned, 'FM999999999999999999999999990.00000000'),
        'statementEarned', to_char(artist.statement_earned, 'FM999999999999999999999999990.00000000'),
        'activeEarningsSum', to_char(artist.active_earnings, 'FM999999999999999999999999990.00000000'),
        'publishingSum', to_char(artist.publishing, 'FM999999999999999999999999990.00000000'),
        'duesSum', to_char(artist.dues, 'FM999999999999999999999999990.00000000'),
        'payoutReservedSum', to_char(artist.payout_reserved, 'FM999999999999999999999999990.00000000'),
        'payoutPaidSum', to_char(artist.payout_paid, 'FM999999999999999999999999990.00000000'),
        'walletAvailableBalance', to_char(artist.wallet_available_balance, 'FM999999999999999999999999990.00000000'),
        'expectedAvailableBalance', to_char(artist.expected_available_balance, 'FM999999999999999999999999990.00000000'),
        'ledgerAmountSum', to_char(artist.ledger_amount_sum, 'FM999999999999999999999999990.00000000'),
        'latestLedgerBalance', to_char(artist.latest_ledger_balance, 'FM999999999999999999999999990.00000000'),
        'completedUploadCount', artist.completed_upload_count,
        'issueCount', artist.issue_count,
        'issues', artist.issues
      )
      order by
        (artist.status = 'fail') desc,
        (artist.status = 'warning') desc,
        artist.issue_count desc,
        artist.artist_name asc
    )
    from artist_results as artist
  ), '[]'::jsonb)
)
from summary;
$$;

revoke all on function public.get_admin_reconciliation_payload() from public, anon, authenticated;
grant execute on function public.get_admin_reconciliation_payload() to service_role;
