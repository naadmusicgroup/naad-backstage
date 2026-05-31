create index if not exists idx_payout_requests_admin_recent
on public.payout_requests (created_at desc, id desc);

create index if not exists idx_payout_requests_admin_status_amount
on public.payout_requests (status)
include (amount);

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
  latest_requests as materialized (
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
      request.updated_at,
      bank_details.account_name,
      bank_details.bank_name,
      bank_details.account_number,
      bank_details.bank_address,
      bank_details.updated_at as bank_details_updated_at
    from public.payout_requests as request
    inner join public.artists as artist
      on artist.id = request.artist_id
    left join public.artist_bank_details as bank_details
      on bank_details.artist_id = artist.id
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
    )
  )
  from summary;
$$;

revoke all on function public.get_admin_payouts_payload(integer) from public, anon, authenticated;
grant execute on function public.get_admin_payouts_payload(integer) to service_role;
