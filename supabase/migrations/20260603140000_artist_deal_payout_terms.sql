alter table public.artists
  add column if not exists artist_share_pct numeric(5,2);

alter table public.login_invites
  add column if not exists artist_share_pct numeric(5,2);

alter table public.payout_requests
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_artist_share_pct numeric(5,2),
  add column if not exists terms_fee_version text,
  add column if not exists terms_fee_snapshot jsonb;

alter table public.artists
  drop constraint if exists artists_artist_share_pct_range;

alter table public.artists
  add constraint artists_artist_share_pct_range
  check (
    artist_share_pct is null
    or (artist_share_pct >= 0 and artist_share_pct <= 100)
  );

alter table public.login_invites
  drop constraint if exists login_invites_artist_share_pct_range;

alter table public.login_invites
  add constraint login_invites_artist_share_pct_range
  check (
    artist_share_pct is null
    or (artist_share_pct >= 0 and artist_share_pct <= 100)
  );

alter table public.payout_requests
  drop constraint if exists payout_requests_terms_artist_share_pct_range;

alter table public.payout_requests
  add constraint payout_requests_terms_artist_share_pct_range
  check (
    terms_artist_share_pct is null
    or (terms_artist_share_pct >= 0 and terms_artist_share_pct <= 100)
  );

alter table public.payout_requests
  drop constraint if exists payout_requests_terms_snapshot_complete;

alter table public.payout_requests
  add constraint payout_requests_terms_snapshot_complete
  check (
    (
      terms_accepted_at is null
      and terms_artist_share_pct is null
      and terms_fee_version is null
      and terms_fee_snapshot is null
    )
    or (
      terms_accepted_at is not null
      and terms_artist_share_pct is not null
      and terms_fee_version is not null
      and terms_fee_snapshot is not null
    )
  );

drop function if exists public.create_payout_request(uuid, numeric, text);

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

create or replace function public.get_artist_payouts_payload(
  target_artist_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_artists as (
    select distinct on (artist_id)
      artist_id,
      ordinal_position
    from unnest(coalesce(target_artist_ids, '{}'::uuid[])) with ordinality as input(artist_id, ordinal_position)
    where artist_id is not null
    order by artist_id, ordinal_position
  ),
  artist_options as (
    select
      artist.id as artist_id,
      artist.name as artist_name,
      artist.artist_share_pct,
      coalesce(wallet.available_balance, 0)::numeric(19,8) as available_balance,
      coalesce(wallet.pending_payouts, 0)::numeric(19,8) as pending_payouts,
      coalesce(wallet.approved_payouts, 0)::numeric(19,8) as approved_payouts,
      exists (
        select 1
        from public.payout_requests as pending_request
        where pending_request.artist_id = artist.id
          and pending_request.status = 'pending'
      ) as has_pending_request,
      selected.ordinal_position
    from selected_artists as selected
    inner join public.artists as artist
      on artist.id = selected.artist_id
    left join public.artist_wallet as wallet
      on wallet.artist_id = artist.id
  ),
  latest_requests as (
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
      request.terms_accepted_at,
      request.terms_artist_share_pct,
      request.terms_fee_version,
      request.terms_fee_snapshot,
      request.created_at,
      request.updated_at
    from public.payout_requests as request
    inner join selected_artists as selected
      on selected.artist_id = request.artist_id
    left join public.artists as artist
      on artist.id = request.artist_id
    left join lateral (
      select abs(ledger.amount)::numeric(19,8) as service_charge
      from public.transaction_ledger as ledger
      where ledger.artist_id = request.artist_id
        and ledger.type = 'due_charge'
        and ledger.idempotency_key in (
          format('admin_manual_payout_service_charge:%s', request.id),
          format('admin_payout_service_charge:%s', request.id)
        )
      order by ledger.created_at desc, ledger.id desc
      limit 1
    ) as service_charge_ledger on true
    order by request.created_at desc, request.id desc
    limit 40
  )
  select jsonb_build_object(
    'artists',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'artistId', option.artist_id,
          'artistName', option.artist_name,
          'artistSharePct', to_char(option.artist_share_pct, 'FM999999999999999999999999990.00'),
          'availableBalance', to_char(option.available_balance, 'FM999999999999999999999999990.00000000'),
          'visibleBalance', to_char(greatest(option.available_balance, 0), 'FM999999999999999999999999990.00000000'),
          'pendingPayouts', to_char(option.pending_payouts, 'FM999999999999999999999999990.00000000'),
          'approvedPayouts', to_char(option.approved_payouts, 'FM999999999999999999999999990.00000000'),
          'hasPendingRequest', option.has_pending_request
        )
        order by option.ordinal_position
      )
      from artist_options as option
    ), '[]'::jsonb),
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
          'bankChargePct', '1.00',
          'status', request.status,
          'artistNotes', request.artist_notes,
          'adminNotes', request.admin_notes,
          'reviewedBy', request.reviewed_by,
          'reviewedAt', request.reviewed_at,
          'paidAt', request.paid_at,
          'paymentMethod', request.payment_method,
          'paymentReference', request.payment_reference,
          'termsAcceptedAt', request.terms_accepted_at,
          'termsArtistSharePct', to_char(request.terms_artist_share_pct, 'FM999999999999999999999999990.00'),
          'termsFeeVersion', request.terms_fee_version,
          'termsFeeSnapshot', request.terms_fee_snapshot,
          'createdAt', request.created_at,
          'updatedAt', request.updated_at,
          'bankDetails', null
        )
        order by request.created_at desc, request.id desc
      )
      from latest_requests as request
    ), '[]'::jsonb),
    'minimumAmount', '50.00000000',
    'maxRequestsPerWindow', 3,
    'requestWindowHours', 24
  );
$$;

revoke all on function public.get_artist_payouts_payload(uuid[]) from public, anon, authenticated;
grant execute on function public.get_artist_payouts_payload(uuid[]) to service_role;

create or replace function public.get_admin_artists_payload()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
shared_account_counts as (
  select
    artist.user_id,
    count(*)::integer as shared_account_artist_count
  from public.artists as artist
  where artist.user_id is not null
  group by artist.user_id
),
artist_rows as (
  select
    artist.id,
    artist.name,
    artist.email,
    artist.artist_share_pct,
    artist.avatar_url,
    artist.country,
    artist.bio,
    artist.is_active,
    linked_profile.login_frozen_at,
    linked_profile.login_frozen_by,
    frozen_by_profile.full_name as login_frozen_by_name,
    case
      when artist.user_id is null then 0
      else coalesce(shared_account_counts.shared_account_artist_count, 1)
    end as shared_account_artist_count,
    artist.created_at,
    case
      when bank.artist_id is null then null
      else jsonb_build_object(
        'accountName', bank.account_name,
        'bankName', bank.bank_name,
        'accountNumber', bank.account_number,
        'bankAddress', bank.bank_address,
        'updatedAt', bank.updated_at
      )
    end as bank_details,
    case
      when publishing.artist_id is null then null
      else jsonb_build_object(
        'legalName', publishing.legal_name,
        'ipiNumber', publishing.ipi_number,
        'proName', publishing.pro_name,
        'updatedAt', publishing.updated_at
      )
    end as publishing_info
  from public.artists as artist
  left join public.profiles as linked_profile
    on linked_profile.id = artist.user_id
  left join shared_account_counts
    on shared_account_counts.user_id = artist.user_id
  left join public.profiles as frozen_by_profile
    on frozen_by_profile.id = linked_profile.login_frozen_by
  left join public.artist_bank_details as bank
    on bank.artist_id = artist.id
  left join public.artist_publishing_info as publishing
    on publishing.artist_id = artist.id
  where artist.is_active = true
)
select jsonb_build_object(
  'artists', coalesce(jsonb_agg(
    jsonb_build_object(
      'id', row.id,
      'name', row.name,
      'email', row.email,
      'artistSharePct', to_char(row.artist_share_pct, 'FM999999999999999999999999990.00'),
      'avatarUrl', row.avatar_url,
      'country', row.country,
      'bio', row.bio,
      'isActive', row.is_active,
      'loginFrozenAt', row.login_frozen_at,
      'loginFrozenBy', row.login_frozen_by,
      'loginFrozenByName', row.login_frozen_by_name,
      'sharedAccountArtistCount', row.shared_account_artist_count,
      'createdAt', row.created_at,
      'bankDetails', row.bank_details,
      'publishingInfo', row.publishing_info
    )
    order by row.name asc, row.id asc
  ), '[]'::jsonb)
)
from artist_rows as row;
$$;

revoke all on function public.get_admin_artists_payload() from public, anon, authenticated;
grant execute on function public.get_admin_artists_payload() to service_role;

notify pgrst, 'reload schema';
