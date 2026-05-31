alter table public.dues
  add column if not exists accepted_at timestamptz;

alter table public.dues
  add column if not exists accepted_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dues_accepted_by_fkey'
  ) then
    alter table public.dues
      add constraint dues_accepted_by_fkey
      foreign key (accepted_by)
      references public.profiles (id)
      on delete set null;
  end if;
end
$$;

alter table public.dues
  drop constraint if exists dues_status_check;

alter table public.dues
  add constraint dues_status_check
  check (status in ('pending_acceptance', 'unpaid', 'paid', 'cancelled'));

update public.dues
set accepted_at = coalesce(accepted_at, created_at)
where status in ('unpaid', 'paid')
  and accepted_at is null;

create or replace view public.artist_wallet
with (security_invoker = true)
as
select
  a.id as artist_id,
  coalesce(e.total_earnings, 0) + coalesce(p.total_publishing, 0) as total_earned,
  coalesce(d.total_dues, 0) as total_dues,
  coalesce(po.pending_payouts, 0) as pending_payouts,
  coalesce(po.approved_payouts, 0) as approved_payouts,
  coalesce(po.paid_payouts, 0) as total_withdrawn,
  (coalesce(e.total_earnings, 0) + coalesce(p.total_publishing, 0))
    - coalesce(d.total_dues, 0)
    - coalesce(po.pending_payouts, 0)
    - coalesce(po.approved_payouts, 0)
    - coalesce(po.paid_payouts, 0) as available_balance
from public.artists a
left join (
  select e.artist_id, sum(e.total_amount) as total_earnings
  from public.earnings e
  join public.csv_uploads u
    on u.id = e.upload_id
  where u.status = 'completed'
    and e.earning_type = 'original'
  group by e.artist_id
) e on e.artist_id = a.id
left join (
  select artist_id, sum(amount) as total_publishing
  from public.publishing_earnings
  group by artist_id
) p on p.artist_id = a.id
left join (
  select artist_id, sum(amount) as total_dues
  from public.dues
  where status in ('unpaid', 'paid')
  group by artist_id
) d on d.artist_id = a.id
left join (
  select
    artist_id,
    sum(case when status = 'pending' then amount else 0 end) as pending_payouts,
    sum(case when status = 'approved' then amount else 0 end) as approved_payouts,
    sum(case when status = 'paid' then amount else 0 end) as paid_payouts
  from public.payout_requests
  group by artist_id
) po on po.artist_id = a.id;

alter view public.artist_wallet set (security_invoker = true);

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
    'pending_acceptance',
    target_due_date
  )
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
    'Due awaiting acceptance',
    format('A new fee is waiting for your acceptance: %s. Your wallet will not be deducted until you accept it.', due_row.title),
    'due_added',
    due_row.id
  );

  return jsonb_build_object(
    'dueId', due_row.id,
    'status', due_row.status,
    'ledgerEntryId', null,
    'resultingBalance', null
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
  resulting_balance numeric(19,8) := null;
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

  if due_row.status <> 'pending_acceptance' and delta_amount <> 0 then
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
    raise exception 'Only accepted unpaid dues can be marked as paid.';
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
  resulting_balance numeric(19,8) := null;
  new_ledger_entry_id uuid := null;
  was_wallet_posted boolean := false;
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

  was_wallet_posted := due_row.status in ('unpaid', 'paid');

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

  if was_wallet_posted then
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
  end if;

  return jsonb_build_object(
    'dueId', due_row.id,
    'status', due_row.status,
    'ledgerEntryId', new_ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

create or replace function public.accept_due_charge(
  target_due_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_profile_id uuid := auth.uid();
  due_row public.dues%rowtype;
  locked_artist public.artists%rowtype;
  resulting_balance numeric(19,8) := 0;
  new_ledger_entry_id uuid;
begin
  if requester_profile_id is null then
    raise exception 'You must be signed in to accept this due.';
  end if;

  if target_due_id is null then
    raise exception 'Due id is required.';
  end if;

  select *
  into due_row
  from public.dues
  where id = target_due_id
  for update;

  if not found then
    raise exception 'That due could not be found.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = due_row.artist_id
    and user_id = requester_profile_id
    and is_active = true
  for update;

  if not found then
    raise exception 'You cannot accept this due.';
  end if;

  if due_row.status <> 'pending_acceptance' then
    raise exception 'Only dues awaiting acceptance can be accepted.';
  end if;

  update public.dues
  set
    status = 'unpaid',
    accepted_at = now(),
    accepted_by = requester_profile_id
  where id = due_row.id
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
    due_row.amount * -1,
    resulting_balance,
    format('Fee accepted: %s', due_row.title),
    format('due:accept:%s', due_row.id)
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

revoke all on function public.accept_due_charge(uuid) from public, anon, authenticated;
grant execute on function public.accept_due_charge(uuid) to authenticated;

revoke all on function public.create_due_charge(uuid, text, numeric, date, uuid) from public, anon, authenticated;
revoke all on function public.update_due_charge(uuid, text, numeric, date, uuid) from public, anon, authenticated;
revoke all on function public.mark_due_paid(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_due_charge(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_due_charge(uuid, text, numeric, date, uuid) to service_role;
grant execute on function public.update_due_charge(uuid, text, numeric, date, uuid) to service_role;
grant execute on function public.mark_due_paid(uuid, uuid) to service_role;
grant execute on function public.cancel_due_charge(uuid, uuid) to service_role;
