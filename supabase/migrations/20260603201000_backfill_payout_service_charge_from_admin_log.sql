alter table public.payout_requests
  add column if not exists service_charge numeric(19,8) default 0;

alter table public.payout_requests
  alter column service_charge set default 0;

with logged_service_charge as (
  select
    activity.entity_id::uuid as request_id,
    (activity.details ->> 'service_charge')::numeric(19,8) as service_charge,
    activity.created_at,
    activity.id
  from public.admin_activity_log as activity
  where activity.entity_type = 'payout_request'
    and activity.action in ('payout.financials_updated', 'payout.manual_paid')
    and activity.entity_id is not null
    and activity.details ? 'service_charge'
    and activity.details ->> 'service_charge' ~ '^[0-9]+(\.[0-9]{1,8})?$'
),
latest_logged_service_charge as (
  select distinct on (activity.request_id)
    activity.request_id,
    activity.service_charge
  from logged_service_charge as activity
  order by activity.request_id, activity.created_at desc, activity.id desc
)
update public.payout_requests as request
set
  service_charge = latest_logged_service_charge.service_charge,
  updated_at = now()
from latest_logged_service_charge
where request.id = latest_logged_service_charge.request_id
  and latest_logged_service_charge.service_charge > 0
  and coalesce(request.service_charge, 0) = 0;

notify pgrst, 'reload schema';
