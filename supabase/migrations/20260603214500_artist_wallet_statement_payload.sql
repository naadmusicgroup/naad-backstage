drop function if exists public.get_artist_wallet_payload(uuid[]);
drop function if exists public.get_artist_wallet_payload(uuid[], integer);

create or replace function public.get_artist_wallet_payload(
  target_artist_ids uuid[],
  statement_year integer default null
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
  current_statement_year as (
    select extract(year from timezone('utc', now()))::integer as year
  ),
  ledger_year_rows as (
    select distinct extract(year from timezone('utc', ledger.created_at))::integer as statement_year_value
    from public.transaction_ledger as ledger
    inner join selected_artists as selected
      on selected.artist_id = ledger.artist_id
    where ledger.type <> 'csv_reversal'
  ),
  statement_year_options as (
    select coalesce(
      array_agg(statement_year_value order by statement_year_value desc),
      array[(select year from current_statement_year)]
    ) as years
    from ledger_year_rows
  ),
  selected_statement_year as (
    select
      case
        when $2 between 2000 and 2100 then $2
        when current_year.year = any(year_options.years) then current_year.year
        else coalesce((select max(statement_year_value) from ledger_year_rows), current_year.year)
      end as year
    from current_statement_year as current_year
    cross join statement_year_options as year_options
  ),
  statement_bounds as (
    select
      selected_year.year,
      make_timestamptz(selected_year.year, 1, 1, 0, 0, 0, 'UTC') as from_at,
      make_timestamptz(selected_year.year + 1, 1, 1, 0, 0, 0, 'UTC') as exclusive_to_at,
      make_timestamptz(selected_year.year + 1, 1, 1, 0, 0, 0, 'UTC') - interval '1 microsecond' as to_at
    from selected_statement_year as selected_year
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
  artist_wallet_rows as (
    select
      selected.artist_id,
      coalesce(wallet.available_balance, 0)::numeric(19,8) as available_balance
    from selected_artists as selected
    left join public.artist_wallet as wallet
      on wallet.artist_id = selected.artist_id
  ),
  artist_statement_balances as (
    select
      artist.artist_id,
      coalesce((
        select ledger.balance_after - ledger.amount
        from public.transaction_ledger as ledger
        where ledger.artist_id = artist.artist_id
          and ledger.created_at >= bounds.from_at
          and ledger.created_at < bounds.exclusive_to_at
          and ledger.type <> 'csv_reversal'
        order by ledger.created_at asc, ledger.id asc
        limit 1
      ), artist.available_balance)::numeric(19,8) as opening_balance,
      coalesce((
        select ledger.balance_after
        from public.transaction_ledger as ledger
        where ledger.artist_id = artist.artist_id
          and ledger.created_at >= bounds.from_at
          and ledger.created_at < bounds.exclusive_to_at
          and ledger.type <> 'csv_reversal'
        order by ledger.created_at desc, ledger.id desc
        limit 1
      ), artist.available_balance)::numeric(19,8) as closing_balance
    from artist_wallet_rows as artist
    cross join statement_bounds as bounds
  ),
  statement_ledger_rows as materialized (
    select
      ledger.id,
      ledger.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      ledger.type,
      ledger.reference_id,
      ledger.amount,
      ledger.balance_after,
      coalesce(ledger.description, '') as description,
      ledger.created_at,
      due.title as due_title,
      due.status as due_status,
      payout.status as payout_status,
      payout.artist_notes,
      payout.admin_notes
    from public.transaction_ledger as ledger
    inner join selected_artists as selected
      on selected.artist_id = ledger.artist_id
    left join public.artists as artist
      on artist.id = ledger.artist_id
    left join public.dues as due
      on due.id = ledger.reference_id
      and ledger.type = 'due_charge'
    left join public.payout_requests as payout
      on payout.id = ledger.reference_id
      and ledger.type in ('payout_pending', 'payout_rejected')
    cross join statement_bounds as bounds
    where ledger.created_at >= bounds.from_at
      and ledger.created_at < bounds.exclusive_to_at
      and ledger.type <> 'csv_reversal'
    order by ledger.created_at desc, ledger.id desc
  ),
  statement_labeled as (
    select
      id,
      artist_id,
      artist_name,
      type,
      reference_id,
      amount,
      balance_after,
      created_at,
      case
        when type in ('csv_import', 'publishing') then 'balance'
        when type = 'due_charge' then 'dues'
        when type in ('payout_pending', 'payout_rejected') then 'payouts'
        else 'adjustments'
      end as category,
      case
        when type = 'csv_import' then 'Earnings received'
        when type = 'publishing' then 'Publishing credit'
        when type = 'due_charge' and lower(description) like '%cancelled%' then 'Fee cancelled'
        when type = 'due_charge' and lower(description) like '%adjusted%' then 'Fee adjusted'
        when type = 'due_charge' then coalesce(nullif(due_title, ''), 'Fee charged')
        when type = 'payout_pending' and payout_status = 'paid' then 'Payout paid'
        when type = 'payout_pending' and payout_status = 'approved' then 'Payout approved'
        when type = 'payout_pending' then 'Payout requested'
        when type = 'payout_rejected' then 'Payout rejected'
        when type = 'adjustment' then 'Balance adjustment'
        else 'Account activity'
      end as label,
      case
        when type = 'due_charge' then due_status
        when type in ('payout_pending', 'payout_rejected') then payout_status
        else null
      end as status,
      coalesce(
        nullif(description, ''),
        nullif(due_title, ''),
        nullif(artist_notes, ''),
        nullif(admin_notes, ''),
        'Wallet activity'
      ) as display_description
    from statement_ledger_rows
  ),
  statement_summary as (
    select
      bounds.year,
      coalesce(sum(balance.opening_balance), 0)::numeric(19,8) as opening_balance,
      coalesce(sum(balance.closing_balance), 0)::numeric(19,8) as closing_balance,
      bounds.from_at,
      bounds.to_at,
      (select count(*) from statement_labeled)::integer as transaction_count
    from statement_bounds as bounds
    left join artist_statement_balances as balance
      on true
    group by bounds.year, bounds.from_at, bounds.to_at
  ),
  ledger_rows as (
    select
      ledger.id,
      ledger.type,
      ledger.amount,
      coalesce(ledger.description, '') as description,
      ledger.created_at,
      payout.status as payout_status
    from public.transaction_ledger as ledger
    inner join selected_artists as selected
      on selected.artist_id = ledger.artist_id
    left join public.payout_requests as payout
      on payout.id = ledger.reference_id
      and ledger.type = 'payout_pending'
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
        when type = 'payout_pending' and payout_status = 'paid' then 'Payout paid'
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
    'statementYears',
    to_jsonb(statement_year_options.years),
    'statementSummary',
    jsonb_build_object(
      'year', statement_summary.year,
      'openingBalance', to_char(statement_summary.opening_balance, 'FM999999999999999999999999990.00000000'),
      'closingBalance', to_char(statement_summary.closing_balance, 'FM999999999999999999999999990.00000000'),
      'from', statement_summary.from_at,
      'to', statement_summary.to_at,
      'transactionCount', statement_summary.transaction_count
    ),
    'statementTransactions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', statement.id,
          'artistId', statement.artist_id,
          'artistName', statement.artist_name,
          'category', statement.category,
          'ledgerType', statement.type,
          'label', statement.label,
          'description', statement.display_description,
          'amount', to_char(statement.amount, 'FM999999999999999999999999990.00000000'),
          'balanceAfter', to_char(statement.balance_after, 'FM999999999999999999999999990.00000000'),
          'status', statement.status,
          'referenceId', statement.reference_id,
          'createdAt', statement.created_at
        )
        order by statement.created_at desc, statement.id desc
      )
      from statement_labeled as statement
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
  from wallet_totals
  cross join statement_summary
  cross join statement_year_options;
$$;

revoke all on function public.get_artist_wallet_payload(uuid[], integer) from public, anon, authenticated;
grant execute on function public.get_artist_wallet_payload(uuid[], integer) to service_role;

notify pgrst, 'reload schema';
