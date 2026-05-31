create index if not exists idx_transaction_ledger_manual_payout_service_charge_marker
on public.transaction_ledger (idempotency_key)
where type = 'due_charge'
  and idempotency_key like 'admin_manual_payout_service_charge:%';

drop function if exists public.create_admin_manual_payout(
  uuid,
  uuid,
  numeric,
  timestamptz,
  text,
  text,
  text
);

drop function if exists public.create_admin_manual_payout(
  uuid,
  uuid,
  numeric,
  timestamptz,
  text,
  text,
  text,
  numeric
);

create or replace function public.create_admin_manual_payout(
  target_artist_id uuid,
  actor_admin_id uuid,
  payout_amount numeric(19,8),
  payout_paid_at timestamptz,
  payout_method text,
  payout_reference text default null,
  review_notes text default null,
  payout_service_charge numeric(19,8) default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_artist public.artists%rowtype;
  payout_row public.payout_requests%rowtype;
  service_charge_due_row public.dues%rowtype;
  ledger_entry_id uuid;
  service_charge_ledger_entry_id uuid := null;
  service_charge_amount numeric(19,8) := coalesce(payout_service_charge, 0);
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

  if service_charge_amount < 0 then
    raise exception 'Service charge cannot be negative.';
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

  if service_charge_amount > 0 then
    insert into public.dues (
      artist_id,
      title,
      amount,
      frequency,
      status,
      due_date,
      paid_at,
      accepted_at,
      accepted_by,
      created_at,
      updated_at
    )
    values (
      target_artist_id,
      'Manual payout service charge',
      service_charge_amount,
      'one_time',
      'paid',
      payout_paid_at::date,
      payout_paid_at,
      payout_paid_at,
      actor_admin_id,
      payout_paid_at,
      now()
    )
    returning *
    into service_charge_due_row;

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
      'due_charge',
      service_charge_due_row.id,
      service_charge_amount * -1,
      format('Manual payout service charge for payout %s', payout_row.id),
      format('admin_manual_payout_service_charge:%s', payout_row.id),
      payout_paid_at,
      now()
    )
    returning id
    into service_charge_ledger_entry_id;

    update public.dues
    set ledger_entry_id = service_charge_ledger_entry_id
    where id = service_charge_due_row.id
    returning *
    into service_charge_due_row;
  end if;

  perform public.recalculate_artist_ledger_balances(target_artist_id);

  select public.current_artist_wallet_ledger_balance(target_artist_id)
  into resulting_balance;

  return jsonb_build_object(
    'requestId', payout_row.id,
    'status', payout_row.status,
    'ledgerEntryId', ledger_entry_id,
    'serviceCharge', service_charge_amount::text,
    'serviceChargeDueId', service_charge_due_row.id,
    'serviceChargeLedgerEntryId', service_charge_ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

revoke all on function public.create_admin_manual_payout(uuid, uuid, numeric, timestamptz, text, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.create_admin_manual_payout(uuid, uuid, numeric, timestamptz, text, text, text, numeric)
  to service_role;

create or replace function public.reverse_admin_manual_payout(
  target_request_id uuid,
  actor_admin_id uuid,
  review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payout_row public.payout_requests%rowtype;
  ledger_row public.transaction_ledger%rowtype;
  service_charge_ledger_row public.transaction_ledger%rowtype;
  service_charge_due_id uuid := null;
  service_charge_amount numeric(19,8) := 0;
  resulting_balance numeric(19,8) := 0;
  deleted_notifications integer := 0;
begin
  if target_request_id is null then
    raise exception 'Payout request id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1 from public.profiles where id = actor_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can reverse manual payouts.';
  end if;

  select *
  into payout_row
  from public.payout_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'That payout request could not be found.';
  end if;

  if payout_row.status <> 'paid' then
    raise exception 'Only paid manual payouts can be reversed.';
  end if;

  perform 1
  from public.artists
  where id = payout_row.artist_id
  for update;

  select *
  into ledger_row
  from public.transaction_ledger
  where reference_id = target_request_id
    and type = 'payout_pending'
    and idempotency_key = format('admin_manual_payout:%s', target_request_id)
  for update;

  if not found then
    raise exception 'Only admin-recorded manual payouts can be reversed.';
  end if;

  select *
  into service_charge_ledger_row
  from public.transaction_ledger
  where type = 'due_charge'
    and idempotency_key = format('admin_manual_payout_service_charge:%s', target_request_id)
  for update;

  if found then
    service_charge_due_id := service_charge_ledger_row.reference_id;
    service_charge_amount := abs(service_charge_ledger_row.amount)::numeric(19,8);

    update public.dues
    set ledger_entry_id = null
    where id = service_charge_due_id;

    delete from public.transaction_ledger
    where id = service_charge_ledger_row.id;

    delete from public.dues
    where id = service_charge_due_id;
  end if;

  delete from public.notifications
  where reference_id = target_request_id
    and type = 'payout_paid';

  get diagnostics deleted_notifications = row_count;

  delete from public.transaction_ledger
  where id = ledger_row.id;

  delete from public.payout_requests
  where id = payout_row.id;

  perform public.recalculate_artist_ledger_balances(payout_row.artist_id);

  select public.current_artist_wallet_ledger_balance(payout_row.artist_id)
  into resulting_balance;

  return jsonb_build_object(
    'requestId', payout_row.id,
    'artistId', payout_row.artist_id,
    'amount', payout_row.amount::text,
    'ledgerEntryId', ledger_row.id,
    'serviceCharge', service_charge_amount::text,
    'serviceChargeDueId', service_charge_due_id,
    'serviceChargeLedgerEntryId', service_charge_ledger_row.id,
    'resultingBalance', resulting_balance::text,
    'notificationsDeleted', deleted_notifications
  );
end;
$$;

revoke all on function public.reverse_admin_manual_payout(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reverse_admin_manual_payout(uuid, uuid, text)
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
      coalesce(service_charge_ledger.service_charge, 0)::numeric(19,8) as service_charge,
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
      bank_details.updated_at as bank_details_updated_at,
      exists (
        select 1
        from public.transaction_ledger as ledger
        where ledger.reference_id = request.id
          and ledger.type = 'payout_pending'
          and ledger.idempotency_key = format('admin_manual_payout:%s', request.id)
      ) as is_manual_payout
    from public.payout_requests as request
    inner join public.artists as artist
      on artist.id = request.artist_id
    left join public.artist_bank_details as bank_details
      on bank_details.artist_id = artist.id
    left join lateral (
      select abs(ledger.amount)::numeric(19,8) as service_charge
      from public.transaction_ledger as ledger
      where ledger.type = 'due_charge'
        and ledger.idempotency_key = format('admin_manual_payout_service_charge:%s', request.id)
      order by ledger.created_at desc, ledger.id desc
      limit 1
    ) as service_charge_ledger on true
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
          'serviceCharge', to_char(request.service_charge, 'FM999999999999999999999999990.00000000'),
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
          'isManualPayout', request.is_manual_payout,
          'canReverse', request.is_manual_payout and request.status = 'paid',
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

notify pgrst, 'reload schema';
