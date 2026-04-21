create or replace function public.create_payout_request(
  target_artist_id uuid,
  requester_profile_id uuid,
  request_amount numeric(19,8),
  request_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_artist public.artists%rowtype;
  payout_row public.payout_requests%rowtype;
  available_balance numeric(19,8) := 0;
  resulting_balance numeric(19,8) := 0;
  request_count integer := 0;
  pending_count integer := 0;
  ledger_entry_id uuid;
begin
  if target_artist_id is null then
    raise exception 'Artist id is required.';
  end if;

  if requester_profile_id is null then
    raise exception 'Requester id is required.';
  end if;

  if request_amount is null or request_amount <= 0 then
    raise exception 'Payout amount must be greater than zero.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = target_artist_id
    and user_id = requester_profile_id
    and is_active = true
  for update;

  if not found then
    raise exception 'You cannot request a payout for this artist.';
  end if;

  select count(*)::integer
  into pending_count
  from public.payout_requests
  where artist_id = target_artist_id
    and status = 'pending';

  if pending_count > 0 then
    raise exception 'A pending payout request already exists for this artist.';
  end if;

  select count(*)::integer
  into request_count
  from public.payout_requests
  where artist_id = target_artist_id
    and requested_by = requester_profile_id
    and created_at >= now() - interval '24 hours';

  if request_count >= 3 then
    raise exception 'You can create at most 3 payout requests in 24 hours.';
  end if;

  select coalesce(available_balance, 0)
  into available_balance
  from public.artist_wallet
  where artist_id = target_artist_id;

  available_balance := coalesce(available_balance, 0);

  if available_balance <= 0 then
    raise exception 'No payout balance is available right now.';
  end if;

  if request_amount > available_balance then
    raise exception 'Requested amount exceeds the available balance.';
  end if;

  resulting_balance := available_balance - request_amount;

  insert into public.payout_requests (
    artist_id,
    requested_by,
    amount,
    status,
    artist_notes
  )
  values (
    target_artist_id,
    requester_profile_id,
    request_amount,
    'pending',
    nullif(trim(request_notes), '')
  )
  returning *
  into payout_row;

  insert into public.transaction_ledger (
    artist_id,
    type,
    reference_id,
    amount,
    balance_after,
    description,
    idempotency_key
  )
  values (
    target_artist_id,
    'payout_pending',
    payout_row.id,
    request_amount * -1,
    resulting_balance,
    'Payout requested',
    format('payout_pending:%s', payout_row.id)
  )
  returning id
  into ledger_entry_id;

  return jsonb_build_object(
    'requestId', payout_row.id,
    'status', payout_row.status,
    'ledgerEntryId', ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

create or replace function public.approve_payout_request(
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
begin
  if target_request_id is null then
    raise exception 'Payout request id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  select *
  into payout_row
  from public.payout_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'That payout request could not be found.';
  end if;

  if payout_row.status <> 'pending' then
    raise exception 'Only pending payout requests can be approved.';
  end if;

  update public.payout_requests
  set
    status = 'approved',
    admin_notes = nullif(trim(review_notes), ''),
    reviewed_by = actor_admin_id,
    reviewed_at = now()
  where id = target_request_id
  returning *
  into payout_row;

  insert into public.notifications (
    artist_id,
    title,
    message,
    type,
    reference_id
  )
  values (
    payout_row.artist_id,
    'Payout approved',
    'Your payout request has been approved.',
    'payout_approved',
    payout_row.id
  );

  return jsonb_build_object(
    'requestId', payout_row.id,
    'status', payout_row.status,
    'ledgerEntryId', null,
    'resultingBalance', null
  );
end;
$$;

create or replace function public.reject_payout_request(
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
  locked_artist public.artists%rowtype;
  available_balance numeric(19,8) := 0;
  resulting_balance numeric(19,8) := 0;
  ledger_entry_id uuid;
begin
  if target_request_id is null then
    raise exception 'Payout request id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  select *
  into payout_row
  from public.payout_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'That payout request could not be found.';
  end if;

  if payout_row.status not in ('pending', 'approved') then
    raise exception 'Only pending or approved payout requests can be rejected.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = payout_row.artist_id
  for update;

  select coalesce(available_balance, 0)
  into available_balance
  from public.artist_wallet
  where artist_id = payout_row.artist_id;

  available_balance := coalesce(available_balance, 0);
  resulting_balance := available_balance + payout_row.amount;

  update public.payout_requests
  set
    status = 'rejected',
    admin_notes = nullif(trim(review_notes), ''),
    reviewed_by = actor_admin_id,
    reviewed_at = now()
  where id = target_request_id
  returning *
  into payout_row;

  insert into public.transaction_ledger (
    artist_id,
    type,
    reference_id,
    amount,
    balance_after,
    description,
    idempotency_key
  )
  values (
    payout_row.artist_id,
    'payout_rejected',
    payout_row.id,
    payout_row.amount,
    resulting_balance,
    'Payout request rejected',
    format('payout_rejected:%s', payout_row.id)
  )
  returning id
  into ledger_entry_id;

  insert into public.notifications (
    artist_id,
    title,
    message,
    type,
    reference_id
  )
  values (
    payout_row.artist_id,
    'Payout rejected',
    'Your payout request was rejected.',
    'payout_rejected',
    payout_row.id
  );

  return jsonb_build_object(
    'requestId', payout_row.id,
    'status', payout_row.status,
    'ledgerEntryId', ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

create or replace function public.mark_payout_request_paid(
  target_request_id uuid,
  actor_admin_id uuid,
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
  payout_row public.payout_requests%rowtype;
begin
  if target_request_id is null then
    raise exception 'Payout request id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  select *
  into payout_row
  from public.payout_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'That payout request could not be found.';
  end if;

  if payout_row.status <> 'approved' then
    raise exception 'Only approved payout requests can be marked as paid.';
  end if;

  update public.payout_requests
  set
    status = 'paid',
    admin_notes = coalesce(nullif(trim(review_notes), ''), admin_notes),
    payment_method = payout_method,
    payment_reference = nullif(trim(payout_reference), ''),
    paid_at = now()
  where id = target_request_id
  returning *
  into payout_row;

  insert into public.notifications (
    artist_id,
    title,
    message,
    type,
    reference_id
  )
  values (
    payout_row.artist_id,
    'Payout paid',
    'Your payout request has been marked as paid.',
    'payout_paid',
    payout_row.id
  );

  return jsonb_build_object(
    'requestId', payout_row.id,
    'status', payout_row.status,
    'ledgerEntryId', null,
    'resultingBalance', null
  );
end;
$$;

grant execute on function public.create_payout_request(uuid, uuid, numeric, text) to anon, authenticated, service_role;
grant execute on function public.approve_payout_request(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.reject_payout_request(uuid, uuid, text) to anon, authenticated, service_role;
grant execute on function public.mark_payout_request_paid(uuid, uuid, text, text, text) to anon, authenticated, service_role;
