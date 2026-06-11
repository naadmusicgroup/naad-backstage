create or replace function public.create_payout_request(
  target_artist_id uuid,
  request_amount numeric(19,8),
  request_notes text default null,
  terms_acknowledged boolean default false
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
  terms_fee_version text := 'payout_terms_v2';
  terms_fee_snapshot jsonb;
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

  if locked_artist.artist_share_pct is null then
    raise exception 'Your Naad Music Group deal percentage is not set yet. Ask an admin to set it before requesting payout.';
  end if;

  if terms_acknowledged is distinct from true then
    raise exception 'You must acknowledge your Naad Music Group deal and transaction fee terms before requesting payout.';
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
  terms_fee_snapshot := jsonb_build_object(
    'dealPercentMeaning', 'artist_share',
    'artistSharePct', locked_artist.artist_share_pct,
    'bankTransactionFeePct', 1,
    'bankTransactionFeeCoveredBy', 'Naad Music Group',
    'availableBalanceAtAcceptance', available_balance,
    'bankTransactionFeeAmount', round(available_balance * 0.01, 8),
    'weOweYouBeforeProviderFee', round(available_balance * 0.99, 8),
    'weOweYouFormula', 'available_balance_minus_1pct_bank_transaction_fee',
    'paymentProvider', 'Tipalti',
    'paymentProviderServiceFeeRangeUsd', jsonb_build_object('min', 5, 'max', 25),
    'termsDisplayOrder', jsonb_build_array(
      'artist_deal',
      'bank_transaction_fee',
      'we_owe_you',
      'payment_provider_service_fee'
    )
  );

  insert into public.payout_requests (
    artist_id,
    requested_by,
    amount,
    status,
    artist_notes,
    terms_accepted_at,
    terms_artist_share_pct,
    terms_fee_version,
    terms_fee_snapshot
  )
  values (
    target_artist_id,
    requester_profile_id,
    request_amount,
    'pending',
    nullif(trim(request_notes), ''),
    now(),
    locked_artist.artist_share_pct,
    terms_fee_version,
    terms_fee_snapshot
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
    'amount', payout_row.amount::text,
    'ledgerEntryId', ledger_entry_id,
    'resultingBalance', resulting_balance::text,
    'termsAcceptedAt', payout_row.terms_accepted_at,
    'termsArtistSharePct', payout_row.terms_artist_share_pct::text,
    'termsFeeVersion', payout_row.terms_fee_version,
    'termsFeeSnapshot', payout_row.terms_fee_snapshot
  );
end;
$$;

revoke all on function public.create_payout_request(uuid, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.create_payout_request(uuid, numeric, text, boolean) to authenticated;

notify pgrst, 'reload schema';
