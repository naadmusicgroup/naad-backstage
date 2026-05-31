create or replace function public.current_artist_wallet_ledger_balance(
  target_artist_id uuid
)
returns numeric(19,8)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::numeric(19,8)
  from public.transaction_ledger
  where artist_id = target_artist_id
    and type in (
      'csv_import',
      'csv_reversal',
      'publishing',
      'due_charge',
      'payout_pending',
      'payout_rejected'
    );
$$;

revoke all on function public.current_artist_wallet_ledger_balance(uuid) from public, anon, authenticated;
grant execute on function public.current_artist_wallet_ledger_balance(uuid) to service_role;

create or replace function public.set_transaction_ledger_balance_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.balance_after := (
    public.current_artist_wallet_ledger_balance(new.artist_id) + new.amount
  )::numeric(19,8);

  return new;
end;
$$;

drop trigger if exists transaction_ledger_set_balance_after on public.transaction_ledger;
create trigger transaction_ledger_set_balance_after
before insert on public.transaction_ledger
for each row
execute function public.set_transaction_ledger_balance_after();

revoke all on function public.set_transaction_ledger_balance_after() from public, anon, authenticated;

create or replace view public.artist_wallet
with (security_invoker = true)
as
with ledger_components as (
  select
    artist_id,
    coalesce(
      sum(amount) filter (where type in ('csv_import', 'csv_reversal', 'publishing')),
      0
    ) as total_earned,
    coalesce(
      sum(amount * -1) filter (where type = 'due_charge'),
      0
    ) as total_dues,
    coalesce(
      sum(amount) filter (
        where type in (
          'csv_import',
          'csv_reversal',
          'publishing',
          'due_charge',
          'payout_pending',
          'payout_rejected'
        )
      ),
      0
    ) as available_balance
  from public.transaction_ledger
  group by artist_id
),
payout_components as (
  select
    artist_id,
    sum(case when status = 'pending' then amount else 0 end) as pending_payouts,
    sum(case when status = 'approved' then amount else 0 end) as approved_payouts,
    sum(case when status = 'paid' then amount else 0 end) as paid_payouts
  from public.payout_requests
  group by artist_id
)
select
  a.id as artist_id,
  coalesce(l.total_earned, 0) as total_earned,
  coalesce(l.total_dues, 0) as total_dues,
  coalesce(po.pending_payouts, 0) as pending_payouts,
  coalesce(po.approved_payouts, 0) as approved_payouts,
  coalesce(po.paid_payouts, 0) as total_withdrawn,
  coalesce(l.available_balance, 0) as available_balance
from public.artists a
left join ledger_components l
  on l.artist_id = a.id
left join payout_components po
  on po.artist_id = a.id;

alter view public.artist_wallet set (security_invoker = true);

create or replace function public.create_publishing_earning(
  target_artist_id uuid,
  target_release_id uuid,
  target_amount numeric(19,8),
  target_period_month date,
  target_notes text,
  actor_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_artist public.artists%rowtype;
  release_row public.releases%rowtype;
  publishing_row public.publishing_earnings%rowtype;
  resulting_balance numeric(19,8) := 0;
  new_ledger_entry_id uuid;
begin
  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1 from public.profiles where id = actor_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can manage publishing earnings.';
  end if;

  if target_amount is null or target_amount <= 0 then
    raise exception 'Publishing amount must be greater than zero.';
  end if;

  target_period_month := date_trunc('month', target_period_month)::date;

  select *
  into locked_artist
  from public.artists
  where id = target_artist_id
    and is_active = true
  for update;

  if not found then
    raise exception 'The selected artist does not exist.';
  end if;

  if target_release_id is not null then
    select *
    into release_row
    from public.releases
    where id = target_release_id
      and artist_id = target_artist_id
      and status <> 'deleted';

    if not found then
      raise exception 'The selected release does not belong to this artist.';
    end if;
  end if;

  perform public.ensure_open_statement_period(target_artist_id, target_period_month);

  insert into public.publishing_earnings (
    artist_id,
    release_id,
    amount,
    period_month,
    notes,
    entered_by
  )
  values (
    target_artist_id,
    target_release_id,
    target_amount,
    target_period_month,
    nullif(trim(target_notes), ''),
    actor_admin_id
  )
  returning *
  into publishing_row;

  resulting_balance := (
    public.current_artist_wallet_ledger_balance(target_artist_id) + target_amount
  )::numeric(19,8);

  insert into public.transaction_ledger (
    artist_id,
    type,
    reference_id,
    amount,
    balance_after,
    description,
    period_month,
    idempotency_key
  )
  values (
    target_artist_id,
    'publishing',
    publishing_row.id,
    target_amount,
    resulting_balance,
    format('Publishing credit for %s', to_char(target_period_month, 'FMMonth YYYY')),
    target_period_month,
    format('publishing:create:%s', publishing_row.id)
  )
  returning id
  into new_ledger_entry_id;

  update public.publishing_earnings
  set ledger_entry_id = new_ledger_entry_id
  where id = publishing_row.id
  returning *
  into publishing_row;

  return jsonb_build_object(
    'entryId', publishing_row.id,
    'ledgerEntryId', new_ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

create or replace function public.update_publishing_earning(
  target_entry_id uuid,
  target_release_id uuid,
  target_amount numeric(19,8),
  target_period_month date,
  target_notes text,
  actor_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  publishing_row public.publishing_earnings%rowtype;
  locked_artist public.artists%rowtype;
  release_row public.releases%rowtype;
  delta_amount numeric(19,8) := 0;
  resulting_balance numeric(19,8) := 0;
  new_ledger_entry_id uuid := null;
begin
  if target_entry_id is null then
    raise exception 'Publishing entry id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1 from public.profiles where id = actor_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can manage publishing earnings.';
  end if;

  if target_amount is null or target_amount <= 0 then
    raise exception 'Publishing amount must be greater than zero.';
  end if;

  target_period_month := date_trunc('month', target_period_month)::date;

  select *
  into publishing_row
  from public.publishing_earnings
  where id = target_entry_id
  for update;

  if not found then
    raise exception 'That publishing entry could not be found.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = publishing_row.artist_id
  for update;

  perform public.ensure_open_statement_period(publishing_row.artist_id, publishing_row.period_month);
  perform public.ensure_open_statement_period(publishing_row.artist_id, target_period_month);

  if target_release_id is not null then
    select *
    into release_row
    from public.releases
    where id = target_release_id
      and artist_id = publishing_row.artist_id
      and status <> 'deleted';

    if not found then
      raise exception 'The selected release does not belong to this artist.';
    end if;
  end if;

  delta_amount := target_amount - publishing_row.amount;

  update public.publishing_earnings
  set
    release_id = target_release_id,
    amount = target_amount,
    period_month = target_period_month,
    notes = nullif(trim(target_notes), '')
  where id = target_entry_id
  returning *
  into publishing_row;

  resulting_balance := (
    public.current_artist_wallet_ledger_balance(publishing_row.artist_id) + delta_amount
  )::numeric(19,8);

  if delta_amount <> 0 then
    insert into public.transaction_ledger (
      artist_id,
      type,
      reference_id,
      amount,
      balance_after,
      description,
      period_month
    )
    values (
      publishing_row.artist_id,
      'publishing',
      publishing_row.id,
      delta_amount,
      resulting_balance,
      format('Publishing credit adjusted for %s', to_char(target_period_month, 'FMMonth YYYY')),
      target_period_month
    )
    returning id
    into new_ledger_entry_id;

    update public.publishing_earnings
    set ledger_entry_id = new_ledger_entry_id
    where id = publishing_row.id;
  end if;

  return jsonb_build_object(
    'entryId', publishing_row.id,
    'ledgerEntryId', new_ledger_entry_id,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

create or replace function public.delete_publishing_earning(
  target_entry_id uuid,
  actor_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  publishing_row public.publishing_earnings%rowtype;
  locked_artist public.artists%rowtype;
  resulting_balance numeric(19,8) := 0;
  new_ledger_entry_id uuid;
begin
  if target_entry_id is null then
    raise exception 'Publishing entry id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  if not exists (
    select 1 from public.profiles where id = actor_admin_id and role = 'admin'
  ) then
    raise exception 'Only admins can manage publishing earnings.';
  end if;

  select *
  into publishing_row
  from public.publishing_earnings
  where id = target_entry_id
  for update;

  if not found then
    raise exception 'That publishing entry could not be found.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = publishing_row.artist_id
  for update;

  perform public.ensure_open_statement_period(publishing_row.artist_id, publishing_row.period_month);

  delete from public.publishing_earnings
  where id = target_entry_id;

  resulting_balance := (
    public.current_artist_wallet_ledger_balance(publishing_row.artist_id) - publishing_row.amount
  )::numeric(19,8);

  insert into public.transaction_ledger (
    artist_id,
    type,
    reference_id,
    amount,
    balance_after,
    description,
    period_month,
    idempotency_key
  )
  values (
    publishing_row.artist_id,
    'publishing',
    publishing_row.id,
    publishing_row.amount * -1,
    resulting_balance,
    format('Publishing credit removed for %s', to_char(publishing_row.period_month, 'FMMonth YYYY')),
    publishing_row.period_month,
    format('publishing:delete:%s', publishing_row.id)
  )
  returning id
  into new_ledger_entry_id;

  return jsonb_build_object(
    'entryId', publishing_row.id,
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
  ledger_delta numeric(19,8) := 0;
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
  ledger_delta := delta_amount * -1;

  update public.dues
  set
    title = trim(target_title),
    amount = target_amount,
    due_date = target_due_date
  where id = target_due_id
  returning *
  into due_row;

  if due_row.status <> 'pending_acceptance' and delta_amount <> 0 then
    resulting_balance := (
      public.current_artist_wallet_ledger_balance(due_row.artist_id) + ledger_delta
    )::numeric(19,8);

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
      ledger_delta,
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
    resulting_balance := (
      public.current_artist_wallet_ledger_balance(due_row.artist_id) + due_row.amount
    )::numeric(19,8);

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

  resulting_balance := (
    public.current_artist_wallet_ledger_balance(due_row.artist_id) - due_row.amount
  )::numeric(19,8);

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

revoke all on function public.create_publishing_earning(uuid, uuid, numeric, date, text, uuid) from public, anon, authenticated;
revoke all on function public.update_publishing_earning(uuid, uuid, numeric, date, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_publishing_earning(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_publishing_earning(uuid, uuid, numeric, date, text, uuid) to service_role;
grant execute on function public.update_publishing_earning(uuid, uuid, numeric, date, text, uuid) to service_role;
grant execute on function public.delete_publishing_earning(uuid, uuid) to service_role;

revoke all on function public.accept_due_charge(uuid) from public, anon, authenticated;
grant execute on function public.accept_due_charge(uuid) to authenticated;

revoke all on function public.update_due_charge(uuid, text, numeric, date, uuid) from public, anon, authenticated;
revoke all on function public.cancel_due_charge(uuid, uuid) from public, anon, authenticated;

grant execute on function public.update_due_charge(uuid, text, numeric, date, uuid) to service_role;
grant execute on function public.cancel_due_charge(uuid, uuid) to service_role;
