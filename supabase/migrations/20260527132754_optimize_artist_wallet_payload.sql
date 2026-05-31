create index if not exists idx_transaction_ledger_artist_visible_created
on public.transaction_ledger (artist_id, created_at desc, id)
where type <> 'csv_reversal';

create index if not exists idx_dues_artist_created
on public.dues (artist_id, created_at desc, id);

create or replace function public.get_artist_wallet_payload(
  target_artist_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_artists as (
    select distinct artist_id
    from unnest(coalesce(target_artist_ids, '{}'::uuid[])) as artist_id
    where artist_id is not null
  ),
  wallet_totals as (
    select
      coalesce(sum(wallet.total_earned), 0)::numeric(19,8) as total_earned,
      coalesce(sum(wallet.available_balance), 0)::numeric(19,8) as available_balance,
      coalesce(sum(wallet.total_dues), 0)::numeric(19,8) as total_dues,
      coalesce(sum(wallet.pending_payouts), 0)::numeric(19,8) as pending_payouts,
      coalesce(sum(wallet.approved_payouts), 0)::numeric(19,8) as approved_payouts,
      coalesce(sum(wallet.total_withdrawn), 0)::numeric(19,8) as total_withdrawn
    from public.artist_wallet as wallet
    inner join selected_artists as selected
      on selected.artist_id = wallet.artist_id
  ),
  ledger_rows as (
    select
      ledger.id,
      ledger.type,
      ledger.amount,
      coalesce(ledger.description, '') as description,
      ledger.created_at
    from public.transaction_ledger as ledger
    inner join selected_artists as selected
      on selected.artist_id = ledger.artist_id
    where ledger.type <> 'csv_reversal'
    order by ledger.created_at desc, ledger.id desc
    limit 8
  ),
  ledger_labeled as (
    select
      id,
      amount,
      created_at,
      case
        when type = 'csv_import' then coalesce(nullif(description, ''), 'Earnings received')
        when type = 'publishing' then 'Publishing credit'
        when type = 'due_charge' and lower(description) like '%cancelled%' then 'Fee cancelled'
        when type = 'due_charge' and lower(description) like '%adjusted%' then 'Fee adjusted'
        when type = 'due_charge' then 'Fee charged'
        when type = 'payout_pending' then 'Payout requested'
        when type = 'payout_rejected' then 'Payout rejected'
        when type = 'adjustment' then 'Balance adjustment'
        else 'Account activity'
      end as label,
      description
    from ledger_rows
  ),
  due_rows as (
    select
      due.id,
      due.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      due.title,
      due.amount,
      due.status,
      due.due_date,
      due.accepted_at,
      due.accepted_by,
      due.paid_at,
      due.cancelled_at,
      due.created_at
    from public.dues as due
    inner join selected_artists as selected
      on selected.artist_id = due.artist_id
    left join public.artists as artist
      on artist.id = due.artist_id
    order by due.created_at desc, due.id asc
  )
  select jsonb_build_object(
    'totalEarned', to_char(wallet_totals.total_earned, 'FM999999999999999999999999990.00000000'),
    'availableBalance', to_char(wallet_totals.available_balance, 'FM999999999999999999999999990.00000000'),
    'visibleBalance', to_char(greatest(wallet_totals.available_balance, 0), 'FM999999999999999999999999990.00000000'),
    'totalDues', to_char(wallet_totals.total_dues, 'FM999999999999999999999999990.00000000'),
    'reservedPayouts', to_char(wallet_totals.pending_payouts + wallet_totals.approved_payouts, 'FM999999999999999999999999990.00000000'),
    'pendingPayouts', to_char(wallet_totals.pending_payouts, 'FM999999999999999999999999990.00000000'),
    'approvedPayouts', to_char(wallet_totals.approved_payouts, 'FM999999999999999999999999990.00000000'),
    'totalWithdrawn', to_char(wallet_totals.total_withdrawn, 'FM999999999999999999999999990.00000000'),
    'balanceSettling', wallet_totals.available_balance < 0,
    'recentTransactions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ledger.id,
          'label', ledger.label,
          'description', coalesce(nullif(ledger.description, ''), ledger.label),
          'amount', to_char(ledger.amount, 'FM999999999999999999999999990.00000000'),
          'createdAt', ledger.created_at
        )
        order by ledger.created_at desc, ledger.id desc
      )
      from ledger_labeled as ledger
    ), '[]'::jsonb),
    'dues',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', due.id,
          'artistId', due.artist_id,
          'artistName', due.artist_name,
          'title', due.title,
          'amount', to_char(due.amount, 'FM999999999999999999999999990.00000000'),
          'status', due.status,
          'dueDate', due.due_date,
          'acceptedAt', due.accepted_at,
          'acceptedBy', due.accepted_by,
          'paidAt', due.paid_at,
          'cancelledAt', due.cancelled_at,
          'createdAt', due.created_at
        )
        order by due.created_at desc, due.id asc
      )
      from due_rows as due
    ), '[]'::jsonb)
  )
  from wallet_totals;
$$;

revoke all on function public.get_artist_wallet_payload(uuid[]) from public, anon, authenticated;
grant execute on function public.get_artist_wallet_payload(uuid[]) to service_role;
