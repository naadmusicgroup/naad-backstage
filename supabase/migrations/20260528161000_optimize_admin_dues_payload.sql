create index if not exists idx_dues_admin_listing
on public.dues (created_at desc, id);

create index if not exists idx_dues_admin_status_amount
on public.dues (status)
include (amount, artist_id);

create or replace function public.get_admin_dues_payload()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with due_rows as materialized (
    select
      due.id,
      due.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      due.title,
      due.amount,
      due.frequency,
      due.status,
      due.due_date,
      due.accepted_at,
      due.accepted_by,
      nullif(btrim(accepted_profile.full_name), '') as accepted_by_name,
      due.paid_at,
      due.cancelled_at,
      due.cancelled_by,
      nullif(btrim(cancelled_profile.full_name), '') as cancelled_by_name,
      due.ledger_entry_id,
      due.created_at,
      due.updated_at
    from public.dues as due
    left join public.artists as artist
      on artist.id = due.artist_id
    left join public.profiles as accepted_profile
      on accepted_profile.id = due.accepted_by
    left join public.profiles as cancelled_profile
      on cancelled_profile.id = due.cancelled_by
    order by due.created_at desc, due.id asc
  ),
  summary as (
    select
      count(*) as due_count,
      count(*) filter (where status = 'pending_acceptance') as pending_acceptance_count,
      count(*) filter (where status = 'unpaid') as unpaid_count,
      count(*) filter (where status = 'paid') as paid_count,
      count(*) filter (where status = 'cancelled') as cancelled_count,
      coalesce(sum(amount) filter (where status = 'pending_acceptance'), 0)::numeric(19,8) as pending_acceptance_amount,
      coalesce(sum(amount) filter (where status in ('unpaid', 'paid')), 0)::numeric(19,8) as active_amount,
      coalesce(sum(amount) filter (where status = 'unpaid'), 0)::numeric(19,8) as unpaid_amount,
      coalesce(sum(amount) filter (where status = 'paid'), 0)::numeric(19,8) as paid_amount,
      coalesce(sum(amount) filter (where status = 'cancelled'), 0)::numeric(19,8) as cancelled_amount,
      count(distinct artist_id) as artist_count
    from public.dues
  ),
  artist_options as materialized (
    select
      artist.id,
      artist.name
    from public.artists as artist
    where artist.is_active = true
    order by artist.name asc, artist.id asc
  )
  select jsonb_build_object(
    'dues',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', due.id,
          'artistId', due.artist_id,
          'artistName', due.artist_name,
          'title', due.title,
          'amount', to_char(due.amount, 'FM999999999999999999999999990.00000000'),
          'frequency', due.frequency,
          'status', due.status,
          'dueDate', due.due_date,
          'acceptedAt', due.accepted_at,
          'acceptedBy', due.accepted_by,
          'acceptedByName', due.accepted_by_name,
          'paidAt', due.paid_at,
          'cancelledAt', due.cancelled_at,
          'cancelledBy', due.cancelled_by,
          'cancelledByName', due.cancelled_by_name,
          'ledgerEntryId', due.ledger_entry_id,
          'createdAt', due.created_at,
          'updatedAt', due.updated_at
        )
        order by due.created_at desc, due.id asc
      )
      from due_rows as due
    ), '[]'::jsonb),
    'summary',
    jsonb_build_object(
      'dueCount', summary.due_count,
      'pendingAcceptanceCount', summary.pending_acceptance_count,
      'unpaidCount', summary.unpaid_count,
      'paidCount', summary.paid_count,
      'cancelledCount', summary.cancelled_count,
      'pendingAcceptanceAmount', to_char(summary.pending_acceptance_amount, 'FM999999999999999999999999990.00000000'),
      'activeAmount', to_char(summary.active_amount, 'FM999999999999999999999999990.00000000'),
      'unpaidAmount', to_char(summary.unpaid_amount, 'FM999999999999999999999999990.00000000'),
      'paidAmount', to_char(summary.paid_amount, 'FM999999999999999999999999990.00000000'),
      'cancelledAmount', to_char(summary.cancelled_amount, 'FM999999999999999999999999990.00000000'),
      'artistCount', summary.artist_count
    ),
    'artistOptions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'value', artist.id,
          'label', artist.name
        )
        order by artist.name asc, artist.id asc
      )
      from artist_options as artist
    ), '[]'::jsonb)
  )
  from summary;
$$;

revoke all on function public.get_admin_dues_payload() from public, anon, authenticated;
grant execute on function public.get_admin_dues_payload() to service_role;
