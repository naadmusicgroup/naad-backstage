alter table public.payout_requests
  add column if not exists service_charge numeric(19,8) default 0;

alter table public.payout_requests
  alter column service_charge set default 0;

create temporary table if not exists payout_fee_cancel_cleanup_artists (
  artist_id uuid primary key
) on commit drop;

truncate table payout_fee_cancel_cleanup_artists;

with payout_service_fee_ledger as materialized (
  select
    ledger.id as ledger_id,
    ledger.artist_id,
    ledger.reference_id as due_id,
    abs(ledger.amount)::numeric(19,8) as fee_amount,
    case
      when ledger.idempotency_key like 'admin_manual_payout_service_charge:%'
        then replace(ledger.idempotency_key, 'admin_manual_payout_service_charge:', '')::uuid
      when ledger.idempotency_key like 'admin_payout_service_charge:%'
        then replace(ledger.idempotency_key, 'admin_payout_service_charge:', '')::uuid
      else null
    end as request_id
  from public.transaction_ledger as ledger
  left join public.dues as due
    on due.id = ledger.reference_id
  where ledger.type = 'due_charge'
    and (
      ledger.idempotency_key like 'admin_manual_payout_service_charge:%'
      or ledger.idempotency_key like 'admin_payout_service_charge:%'
      or lower(coalesce(due.title, '')) in ('manual payout service charge', 'payout service charge')
      or lower(ledger.description) in ('fee cancelled: manual payout service charge', 'fee cancelled: payout service charge')
      or lower(ledger.description) like 'manual payout service charge for payout %'
      or lower(ledger.description) like 'payout service charge for payout %'
    )
),
service_fee_amounts as (
  select
    request_id,
    max(fee_amount)::numeric(19,8) as fee_amount
  from payout_service_fee_ledger
  where request_id is not null
  group by request_id
)
update public.payout_requests as request
set
  service_charge = service_fee_amounts.fee_amount,
  updated_at = now()
from service_fee_amounts
where request.id = service_fee_amounts.request_id
  and coalesce(request.service_charge, 0) = 0;

insert into payout_fee_cancel_cleanup_artists (artist_id)
select distinct artist_id
from (
  select ledger.artist_id
  from public.transaction_ledger as ledger
  left join public.dues as due
    on due.id = ledger.reference_id
  where ledger.type = 'due_charge'
    and (
      ledger.idempotency_key like 'admin_manual_payout_service_charge:%'
      or ledger.idempotency_key like 'admin_payout_service_charge:%'
      or lower(coalesce(due.title, '')) in ('manual payout service charge', 'payout service charge')
      or lower(ledger.description) in ('fee cancelled: manual payout service charge', 'fee cancelled: payout service charge')
      or lower(ledger.description) like 'manual payout service charge for payout %'
      or lower(ledger.description) like 'payout service charge for payout %'
    )
) as affected
on conflict do nothing;

with payout_service_fee_ledger as materialized (
  select
    ledger.id as ledger_id,
    ledger.reference_id as due_id
  from public.transaction_ledger as ledger
  left join public.dues as due
    on due.id = ledger.reference_id
  where ledger.type = 'due_charge'
    and (
      ledger.idempotency_key like 'admin_manual_payout_service_charge:%'
      or ledger.idempotency_key like 'admin_payout_service_charge:%'
      or lower(coalesce(due.title, '')) in ('manual payout service charge', 'payout service charge')
      or lower(ledger.description) in ('fee cancelled: manual payout service charge', 'fee cancelled: payout service charge')
      or lower(ledger.description) like 'manual payout service charge for payout %'
      or lower(ledger.description) like 'payout service charge for payout %'
    )
),
payout_service_fee_due_ids as materialized (
  select distinct due_id
  from payout_service_fee_ledger
  where due_id is not null
),
related_payout_service_fee_ledger as materialized (
  select distinct ledger.id as ledger_id
  from public.transaction_ledger as ledger
  left join payout_service_fee_due_ids
    on payout_service_fee_due_ids.due_id = ledger.reference_id
  where ledger.type = 'due_charge'
    and (
      ledger.id in (select ledger_id from payout_service_fee_ledger)
      or payout_service_fee_due_ids.due_id is not null
    )
),
cleared_dues as (
  update public.dues as due
  set ledger_entry_id = null
  from payout_service_fee_due_ids
  where due.id = payout_service_fee_due_ids.due_id
  returning due.id
),
deleted_ledger as (
  delete from public.transaction_ledger as ledger
  using related_payout_service_fee_ledger
  where ledger.id = related_payout_service_fee_ledger.ledger_id
  returning ledger.id
)
delete from public.dues as due
using payout_service_fee_due_ids
where due.id = payout_service_fee_due_ids.due_id;

do $$
declare
  affected_artist_id uuid;
begin
  for affected_artist_id in
    select artist_id from payout_fee_cancel_cleanup_artists
  loop
    perform public.recalculate_artist_ledger_balances(affected_artist_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
