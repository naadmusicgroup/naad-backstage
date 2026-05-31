create index if not exists idx_payout_requests_artist_created
on public.payout_requests (artist_id, created_at desc, id);

create index if not exists idx_payout_requests_artist_pending
on public.payout_requests (artist_id, id)
where status = 'pending';

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
      request.status,
      request.artist_notes,
      request.admin_notes,
      request.reviewed_by,
      request.reviewed_at,
      request.paid_at,
      request.payment_method,
      request.payment_reference,
      request.created_at,
      request.updated_at
    from public.payout_requests as request
    inner join selected_artists as selected
      on selected.artist_id = request.artist_id
    left join public.artists as artist
      on artist.id = request.artist_id
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
