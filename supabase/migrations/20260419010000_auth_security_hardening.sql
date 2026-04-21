alter view public.artist_wallet set (security_invoker = true);
alter view public.monthly_earnings_summary set (security_invoker = true);

drop policy if exists csv_uploads_select on public.csv_uploads;
create policy csv_uploads_select on public.csv_uploads
for select
using (
  public.is_admin()
  or public.can_access_artist(artist_id)
);

revoke all on function public.commit_csv_upload(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commit_csv_upload(uuid, uuid, jsonb) to service_role;

revoke all on function public.reverse_csv_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reverse_csv_upload(uuid, uuid) to service_role;

revoke all on function public.approve_payout_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_payout_request(uuid, uuid, text) to service_role;

revoke all on function public.reject_payout_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_payout_request(uuid, uuid, text) to service_role;

revoke all on function public.mark_payout_request_paid(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_payout_request_paid(uuid, uuid, text, text, text) to service_role;

revoke all on function public.create_payout_request(uuid, uuid, numeric, text) from public, anon, authenticated, service_role;
drop function if exists public.create_payout_request(uuid, uuid, numeric, text);

create or replace function public.create_payout_request(
  target_artist_id uuid,
  request_amount numeric(19,8),
  request_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_profile_id uuid := auth.uid();
  locked_artist public.artists%rowtype;
  payout_row public.payout_requests%rowtype;
  available_balance numeric(19,8) := 0;
  resulting_balance numeric(19,8) := 0;
  request_count integer := 0;
  pending_count integer := 0;
  ledger_entry_id uuid;
begin
  if requester_profile_id is null then
    raise exception 'You must be signed in to request a payout.';
  end if;

  if target_artist_id is null then
    raise exception 'Artist id is required.';
  end if;

  if request_amount is null or request_amount <= 0 then
    raise exception 'Payout amount must be greater than zero.';
  end if;

  if request_amount < 50 then
    raise exception 'Payout amount must be at least $50.00.';
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

grant execute on function public.create_payout_request(uuid, numeric, text) to authenticated;
