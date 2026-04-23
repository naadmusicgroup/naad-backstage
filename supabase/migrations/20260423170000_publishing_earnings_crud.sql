create or replace function public.ensure_open_statement_period(
  target_artist_id uuid,
  target_period_month date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row public.statement_periods%rowtype;
begin
  if target_artist_id is null then
    raise exception 'Artist id is required.';
  end if;

  if target_period_month is null then
    raise exception 'Period month is required.';
  end if;

  target_period_month := date_trunc('month', target_period_month)::date;

  select *
  into period_row
  from public.statement_periods
  where artist_id = target_artist_id
    and period_month = target_period_month
  for update;

  if found then
    if period_row.status = 'closed' then
      raise exception 'Period is closed for this month.';
    end if;

    return;
  end if;

  insert into public.statement_periods (
    artist_id,
    period_month,
    status
  )
  values (
    target_artist_id,
    target_period_month,
    'open'
  );
end;
$$;

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

  select coalesce(available_balance, 0)
  into resulting_balance
  from public.artist_wallet
  where artist_id = publishing_row.artist_id;

  resulting_balance := coalesce(resulting_balance, 0);

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

  select coalesce(available_balance, 0)
  into resulting_balance
  from public.artist_wallet
  where artist_id = publishing_row.artist_id;

  resulting_balance := coalesce(resulting_balance, 0);

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
