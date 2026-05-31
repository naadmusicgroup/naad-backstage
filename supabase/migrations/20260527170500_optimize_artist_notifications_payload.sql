create index if not exists idx_notifications_artist_created
on public.notifications (artist_id, created_at desc, id desc);

create or replace function public.get_artist_notifications_payload(
  target_artist_ids uuid[],
  target_page integer default 1,
  target_page_size integer default 100,
  target_unread_only boolean default false
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with bounded_input as (
    select
      coalesce(target_artist_ids, array[]::uuid[]) as artist_ids,
      greatest(coalesce(target_page, 1), 1) as requested_page,
      least(greatest(coalesce(target_page_size, 100), 1), 200) as page_size,
      coalesce(target_unread_only, false) as unread_only
  ),
  counts as (
    select
      count(*)::integer as total_count,
      count(*) filter (where notification.is_read = false)::integer as unread_count
    from public.notifications as notification, bounded_input
    where notification.artist_id = any(bounded_input.artist_ids)
  ),
  page_bounds as (
    select
      bounded_input.artist_ids,
      bounded_input.unread_only,
      bounded_input.page_size,
      case
        when bounded_input.unread_only then counts.unread_count
        else counts.total_count
      end as filtered_count,
      counts.total_count,
      counts.unread_count,
      greatest(
        1,
        ceil(
          case
            when bounded_input.unread_only then counts.unread_count
            else counts.total_count
          end::numeric / bounded_input.page_size
        )::integer
      ) as total_pages,
      least(
        bounded_input.requested_page,
        greatest(
          1,
          ceil(
            case
              when bounded_input.unread_only then counts.unread_count
              else counts.total_count
            end::numeric / bounded_input.page_size
          )::integer
        )
      ) as page
    from bounded_input, counts
  ),
  page_rows as (
    select
      notification.id,
      notification.artist_id,
      artist.name as artist_name,
      notification.title,
      notification.message,
      notification.type,
      notification.reference_id,
      notification.is_read,
      notification.created_at,
      notification.updated_at
    from public.notifications as notification
    left join public.artists as artist
      on artist.id = notification.artist_id
    cross join page_bounds
    where notification.artist_id = any(page_bounds.artist_ids)
      and (not page_bounds.unread_only or notification.is_read = false)
    order by notification.created_at desc, notification.id desc
    limit (select page_size from page_bounds)
    offset ((select page from page_bounds) - 1) * (select page_size from page_bounds)
  )
  select jsonb_build_object(
    'notifications',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', page_rows.id,
          'artistId', page_rows.artist_id,
          'artistName', coalesce(page_rows.artist_name, 'Unknown artist'),
          'title', page_rows.title,
          'message', page_rows.message,
          'type', page_rows.type,
          'typeLabel', case page_rows.type
            when 'earnings_posted' then 'Earnings posted'
            when 'payout_approved' then 'Payout approved'
            when 'payout_rejected' then 'Payout rejected'
            when 'payout_paid' then 'Payout paid'
            when 'due_added' then 'Due added'
            else 'Notification'
          end,
          'referenceId', page_rows.reference_id,
          'isRead', page_rows.is_read,
          'createdAt', page_rows.created_at,
          'updatedAt', page_rows.updated_at
        )
        order by page_rows.created_at desc, page_rows.id desc
      ) filter (where page_rows.id is not null),
      '[]'::jsonb
    ),
    'unreadCount', page_bounds.unread_count,
    'totalCount', page_bounds.total_count,
    'pagination', jsonb_build_object(
      'page', page_bounds.page,
      'pageSize', page_bounds.page_size,
      'totalCount', page_bounds.filtered_count,
      'totalPages', page_bounds.total_pages,
      'hasPreviousPage', page_bounds.page > 1,
      'hasNextPage', page_bounds.page < page_bounds.total_pages
    )
  )
  from page_bounds
  left join page_rows on true
  group by
    page_bounds.page,
    page_bounds.page_size,
    page_bounds.filtered_count,
    page_bounds.total_count,
    page_bounds.unread_count,
    page_bounds.total_pages;
$$;

revoke all on function public.get_artist_notifications_payload(uuid[], integer, integer, boolean)
from public, anon, authenticated;

grant execute on function public.get_artist_notifications_payload(uuid[], integer, integer, boolean)
to service_role;
