create or replace function public.create_admin_manual_payout(
  target_artist_id uuid,
  actor_admin_id uuid,
  payout_amount numeric(19,8),
  payout_paid_at timestamptz,
  payout_method text,
  payout_reference text default null,
  review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_artist public.artists%rowtype;
  payout_row public.payout_requests%rowtype;
  ledger_entry_id uuid;
  resulting_balance numeric(19,8) := 0;
begin
  if target_artist_id is null then
    raise exception 'Artist id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1 from public.profiles where id = actor_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can record payout history.';
  end if;

  if payout_amount is null or payout_amount <= 0 then
    raise exception 'Payout amount must be greater than zero.';
  end if;

  if payout_paid_at is null then
    raise exception 'Payout date and time is required.';
  end if;

  if payout_paid_at > now() + interval '5 minutes' then
    raise exception 'Payout date and time cannot be in the future.';
  end if;

  if payout_method is null or payout_method not in ('bank_transfer', 'esewa', 'khalti', 'other') then
    raise exception 'Payment method must be bank_transfer, esewa, khalti, or other.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = target_artist_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Artist does not exist or is not active.';
  end if;

  insert into public.payout_requests (
    artist_id,
    requested_by,
    amount,
    status,
    admin_notes,
    artist_notes,
    reviewed_by,
    reviewed_at,
    paid_at,
    payment_method,
    payment_reference,
    created_at,
    updated_at
  )
  values (
    target_artist_id,
    actor_admin_id,
    payout_amount,
    'paid',
    nullif(trim(review_notes), ''),
    null,
    actor_admin_id,
    now(),
    payout_paid_at,
    payout_method,
    nullif(trim(payout_reference), ''),
    payout_paid_at,
    now()
  )
  returning *
  into payout_row;

  insert into public.transaction_ledger (
    artist_id,
    type,
    reference_id,
    amount,
    description,
    idempotency_key,
    created_at,
    updated_at
  )
  values (
    target_artist_id,
    'payout_pending',
    payout_row.id,
    payout_amount * -1,
    'Manual payout recorded',
    format('admin_manual_payout:%s', payout_row.id),
    payout_paid_at,
    now()
  )
  returning id
  into ledger_entry_id;

  perform public.recalculate_artist_ledger_balances(target_artist_id);

  select public.current_artist_wallet_ledger_balance(target_artist_id)
  into resulting_balance;

  return jsonb_build_object(
    'requestId', payout_row.id,
    'status', payout_row.status,
    'ledgerEntryId', ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

revoke all on function public.create_admin_manual_payout(uuid, uuid, numeric, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_admin_manual_payout(uuid, uuid, numeric, timestamptz, text, text, text)
  to service_role;

create or replace function public.get_admin_payouts_payload(
  target_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with request_limit as (
    select least(greatest(coalesce(target_limit, 100), 1), 500) as row_limit
  ),
  summary as (
    select
      count(*) filter (where status = 'pending') as pending_count,
      count(*) filter (where status = 'approved') as approved_count,
      count(*) filter (where status = 'rejected') as rejected_count,
      count(*) filter (where status = 'paid') as paid_count,
      coalesce(sum(amount) filter (where status = 'pending'), 0)::numeric(19,8) as pending_amount,
      coalesce(sum(amount) filter (where status = 'approved'), 0)::numeric(19,8) as approved_amount,
      coalesce(sum(amount) filter (where status = 'paid'), 0)::numeric(19,8) as paid_amount
    from public.payout_requests
  ),
  artist_options as materialized (
    select
      artist.id,
      artist.name,
      coalesce(wallet.available_balance, 0)::numeric(19,8) as available_balance,
      coalesce(wallet.pending_payouts, 0)::numeric(19,8) as pending_payouts,
      coalesce(wallet.approved_payouts, 0)::numeric(19,8) as approved_payouts,
      coalesce(wallet.total_withdrawn, 0)::numeric(19,8) as total_withdrawn
    from public.artists as artist
    left join public.artist_wallet as wallet
      on wallet.artist_id = artist.id
    where artist.is_active = true
    order by artist.name asc, artist.id asc
  ),
  latest_requests as materialized (
    select
      request.id,
      request.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      request.requested_by,
      request.amount,
      request.status,
      request.artist_notes,
      request.admin_notes,
      request.reviewed_by,
      request.reviewed_at,
      request.paid_at,
      request.payment_method,
      request.payment_reference,
      request.created_at,
      request.updated_at,
      bank_details.account_name,
      bank_details.bank_name,
      bank_details.account_number,
      bank_details.bank_address,
      bank_details.updated_at as bank_details_updated_at
    from public.payout_requests as request
    inner join public.artists as artist
      on artist.id = request.artist_id
    left join public.artist_bank_details as bank_details
      on bank_details.artist_id = artist.id
    order by request.created_at desc, request.id desc
    limit (select row_limit from request_limit)
  )
  select jsonb_build_object(
    'requests',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', request.id,
          'artistId', request.artist_id,
          'artistName', request.artist_name,
          'requestedBy', request.requested_by,
          'amount', to_char(request.amount, 'FM999999999999999999999999990.00000000'),
          'status', request.status,
          'artistNotes', request.artist_notes,
          'adminNotes', request.admin_notes,
          'reviewedBy', request.reviewed_by,
          'reviewedAt', request.reviewed_at,
          'paidAt', request.paid_at,
          'paymentMethod', request.payment_method,
          'paymentReference', request.payment_reference,
          'createdAt', request.created_at,
          'updatedAt', request.updated_at,
          'bankDetails', case
            when request.account_name is null then null
            else jsonb_build_object(
              'accountName', request.account_name,
              'bankName', request.bank_name,
              'accountNumber', request.account_number,
              'bankAddress', request.bank_address,
              'updatedAt', request.bank_details_updated_at
            )
          end
        )
        order by request.created_at desc, request.id desc
      )
      from latest_requests as request
    ), '[]'::jsonb),
    'summary',
    jsonb_build_object(
      'pendingCount', summary.pending_count,
      'approvedCount', summary.approved_count,
      'rejectedCount', summary.rejected_count,
      'paidCount', summary.paid_count,
      'pendingAmount', to_char(summary.pending_amount, 'FM999999999999999999999999990.00000000'),
      'approvedAmount', to_char(summary.approved_amount, 'FM999999999999999999999999990.00000000'),
      'paidAmount', to_char(summary.paid_amount, 'FM999999999999999999999999990.00000000')
    ),
    'artistOptions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'value', artist.id,
          'label', artist.name,
          'availableBalance', to_char(artist.available_balance, 'FM999999999999999999999999990.00000000'),
          'visibleBalance', to_char(greatest(artist.available_balance, 0), 'FM999999999999999999999999990.00000000'),
          'pendingPayouts', to_char(artist.pending_payouts, 'FM999999999999999999999999990.00000000'),
          'approvedPayouts', to_char(artist.approved_payouts, 'FM999999999999999999999999990.00000000'),
          'totalWithdrawn', to_char(artist.total_withdrawn, 'FM999999999999999999999999990.00000000')
        )
        order by artist.name asc, artist.id asc
      )
      from artist_options as artist
    ), '[]'::jsonb)
  )
  from summary;
$$;

revoke all on function public.get_admin_payouts_payload(integer) from public, anon, authenticated;
grant execute on function public.get_admin_payouts_payload(integer) to service_role;

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

create or replace function public.get_artist_dashboard_wallet_payload(
  target_artist_ids uuid[]
)
returns jsonb
language sql
stable
security invoker
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
    limit 3
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
  pending_due_rows as (
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
    where due.status = 'pending_acceptance'
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
      from pending_due_rows as due
    ), '[]'::jsonb)
  )
  from wallet_totals;
$$;

revoke all on function public.get_artist_dashboard_wallet_payload(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_artist_dashboard_wallet_payload(uuid[])
  to service_role;
