create or replace function public.get_admin_analytics_financial_rows()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with payout_service_charges as (
    select
      ledger.artist_id,
      coalesce(sum(abs(ledger.amount)), 0)::numeric(19,8) as payout_service_fees
    from public.transaction_ledger as ledger
    where ledger.type = 'due_charge'
      and (
        ledger.idempotency_key like 'admin_manual_payout_service_charge:%'
        or ledger.idempotency_key like 'admin_payout_service_charge:%'
      )
    group by ledger.artist_id
  ),
  rows as (
    select
      wallet.artist_id,
      coalesce(nullif(btrim(artist.name), ''), 'Unknown artist') as artist_name,
      coalesce(wallet.total_earned, 0)::numeric(19,8) as total_earned,
      coalesce(wallet.total_dues, 0)::numeric(19,8) as total_dues,
      greatest(
        coalesce(wallet.total_dues, 0)::numeric(19,8) - coalesce(payout_service_charges.payout_service_fees, 0)::numeric(19,8),
        0
      )::numeric(19,8) as artist_dues,
      coalesce(payout_service_charges.payout_service_fees, 0)::numeric(19,8) as payout_service_fees,
      coalesce(wallet.pending_payouts, 0)::numeric(19,8) as pending_payouts,
      coalesce(wallet.approved_payouts, 0)::numeric(19,8) as approved_payouts,
      coalesce(wallet.total_withdrawn, 0)::numeric(19,8) as total_withdrawn,
      coalesce(wallet.available_balance, 0)::numeric(19,8) as available_balance
    from public.artist_wallet as wallet
    inner join public.artists as artist
      on artist.id = wallet.artist_id
    left join payout_service_charges
      on payout_service_charges.artist_id = wallet.artist_id
    where artist.is_active is not false
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'artist_id', rows.artist_id,
        'artist_name', rows.artist_name,
        'total_earned', rows.total_earned::text,
        'total_dues', rows.total_dues::text,
        'artist_dues', rows.artist_dues::text,
        'payout_service_fees', rows.payout_service_fees::text,
        'pending_payouts', rows.pending_payouts::text,
        'approved_payouts', rows.approved_payouts::text,
        'total_withdrawn', rows.total_withdrawn::text,
        'available_balance', rows.available_balance::text
      )
      order by rows.total_earned desc, rows.artist_name asc
    ),
    '[]'::jsonb
  )
  from rows;
$$;

revoke all on function public.get_admin_analytics_financial_rows()
  from public, anon, authenticated;
grant execute on function public.get_admin_analytics_financial_rows()
  to service_role;
