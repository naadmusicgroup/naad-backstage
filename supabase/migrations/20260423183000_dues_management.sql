create or replace function public.create_due_charge(
  target_artist_id uuid,
  target_title text,
  target_amount numeric(19,8),
  target_due_date date,
  actor_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_artist public.artists%rowtype;
  due_row public.dues%rowtype;
  resulting_balance numeric(19,8) := 0;
  new_ledger_entry_id uuid;
begin
  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1 from public.profiles where id = actor_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can manage dues.';
  end if;

  if target_artist_id is null then
    raise exception 'Artist id is required.';
  end if;

  if nullif(trim(target_title), '') is null then
    raise exception 'Due title is required.';
  end if;

  if target_amount is null or target_amount <= 0 then
    raise exception 'Due amount must be greater than zero.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = target_artist_id
    and is_active = true
  for update;

  if not found then
    raise exception 'The selected artist does not exist.';
  end if;

  insert into public.dues (
    artist_id,
    title,
    amount,
    frequency,
    status,
    due_date
  )
  values (
    target_artist_id,
    trim(target_title),
    target_amount,
    'one_time',
    'unpaid',
    target_due_date
  )
  returning *
  into due_row;

  select coalesce(available_balance, 0)
  into resulting_balance
  from public.artist_wallet
  where artist_id = target_artist_id;

  resulting_balance := coalesce(resulting_balance, 0);

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
    'due_charge',
    due_row.id,
    target_amount * -1,
    resulting_balance,
    format('Fee charged: %s', due_row.title),
    format('due:create:%s', due_row.id)
  )
  returning id
  into new_ledger_entry_id;

  update public.dues
  set ledger_entry_id = new_ledger_entry_id
  where id = due_row.id
  returning *
  into due_row;

  insert into public.notifications (
    artist_id,
    title,
    message,
    type,
    reference_id
  )
  values (
    target_artist_id,
    'New due added',
    format('A new fee was added to your account: %s.', due_row.title),
    'due_added',
    due_row.id
  );

  return jsonb_build_object(
    'dueId', due_row.id,
    'status', due_row.status,
    'ledgerEntryId', new_ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

create or replace function public.update_due_charge(
  target_due_id uuid,
  target_title text,
  target_amount numeric(19,8),
  target_due_date date,
  actor_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  due_row public.dues%rowtype;
  locked_artist public.artists%rowtype;
  delta_amount numeric(19,8) := 0;
  resulting_balance numeric(19,8) := 0;
  new_ledger_entry_id uuid := null;
begin
  if target_due_id is null then
    raise exception 'Due id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1 from public.profiles where id = actor_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can manage dues.';
  end if;

  if nullif(trim(target_title), '') is null then
    raise exception 'Due title is required.';
  end if;

  if target_amount is null or target_amount <= 0 then
    raise exception 'Due amount must be greater than zero.';
  end if;

  select *
  into due_row
  from public.dues
  where id = target_due_id
  for update;

  if not found then
    raise exception 'That due could not be found.';
  end if;

  if due_row.status = 'cancelled' then
    raise exception 'Cancelled dues cannot be edited.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = due_row.artist_id
  for update;

  delta_amount := target_amount - due_row.amount;

  update public.dues
  set
    title = trim(target_title),
    amount = target_amount,
    due_date = target_due_date
  where id = target_due_id
  returning *
  into due_row;

  select coalesce(available_balance, 0)
  into resulting_balance
  from public.artist_wallet
  where artist_id = due_row.artist_id;

  resulting_balance := coalesce(resulting_balance, 0);

  if delta_amount <> 0 then
    insert into public.transaction_ledger (
      artist_id,
      type,
      reference_id,
      amount,
      balance_after,
      description
    )
    values (
      due_row.artist_id,
      'due_charge',
      due_row.id,
      delta_amount * -1,
      resulting_balance,
      format('Fee adjusted: %s', due_row.title)
    )
    returning id
    into new_ledger_entry_id;

    update public.dues
    set ledger_entry_id = new_ledger_entry_id
    where id = due_row.id;
  end if;

  return jsonb_build_object(
    'dueId', due_row.id,
    'status', due_row.status,
    'ledgerEntryId', new_ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

create or replace function public.mark_due_paid(
  target_due_id uuid,
  actor_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  due_row public.dues%rowtype;
begin
  if target_due_id is null then
    raise exception 'Due id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1 from public.profiles where id = actor_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can manage dues.';
  end if;

  select *
  into due_row
  from public.dues
  where id = target_due_id
  for update;

  if not found then
    raise exception 'That due could not be found.';
  end if;

  if due_row.status <> 'unpaid' then
    raise exception 'Only unpaid dues can be marked as paid.';
  end if;

  update public.dues
  set
    status = 'paid',
    paid_at = now()
  where id = target_due_id
  returning *
  into due_row;

  return jsonb_build_object(
    'dueId', due_row.id,
    'status', due_row.status,
    'ledgerEntryId', null,
    'resultingBalance', null
  );
end;
$$;

create or replace function public.cancel_due_charge(
  target_due_id uuid,
  actor_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  due_row public.dues%rowtype;
  locked_artist public.artists%rowtype;
  resulting_balance numeric(19,8) := 0;
  new_ledger_entry_id uuid;
begin
  if target_due_id is null then
    raise exception 'Due id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1 from public.profiles where id = actor_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can manage dues.';
  end if;

  select *
  into due_row
  from public.dues
  where id = target_due_id
  for update;

  if not found then
    raise exception 'That due could not be found.';
  end if;

  if due_row.status = 'cancelled' then
    raise exception 'This due has already been cancelled.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = due_row.artist_id
  for update;

  update public.dues
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = actor_admin_id
  where id = target_due_id
  returning *
  into due_row;

  select coalesce(available_balance, 0)
  into resulting_balance
  from public.artist_wallet
  where artist_id = due_row.artist_id;

  resulting_balance := coalesce(resulting_balance, 0);

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
    due_row.artist_id,
    'due_charge',
    due_row.id,
    due_row.amount,
    resulting_balance,
    format('Fee cancelled: %s', due_row.title),
    format('due:cancel:%s', due_row.id)
  )
  returning id
  into new_ledger_entry_id;

  update public.dues
  set ledger_entry_id = new_ledger_entry_id
  where id = due_row.id;

  return jsonb_build_object(
    'dueId', due_row.id,
    'status', due_row.status,
    'ledgerEntryId', new_ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

revoke all on function public.create_due_charge(uuid, text, numeric, date, uuid) from public, anon, authenticated;
revoke all on function public.update_due_charge(uuid, text, numeric, date, uuid) from public, anon, authenticated;
revoke all on function public.mark_due_paid(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_due_charge(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_due_charge(uuid, text, numeric, date, uuid) to service_role;
grant execute on function public.update_due_charge(uuid, text, numeric, date, uuid) to service_role;
grant execute on function public.mark_due_paid(uuid, uuid) to service_role;
grant execute on function public.cancel_due_charge(uuid, uuid) to service_role;
