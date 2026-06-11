alter table public.publishing_writers
add column if not exists is_active boolean not null default true,
add column if not exists archived_at timestamptz,
add column if not exists archived_by uuid references public.profiles (id) on delete set null;

update public.publishing_writers
set
  full_name = btrim(full_name),
  first_name = nullif(btrim(coalesce(first_name, '')), ''),
  middle_name = nullif(btrim(coalesce(middle_name, '')), ''),
  last_name = nullif(btrim(coalesce(last_name, '')), ''),
  ipi_number = nullif(btrim(coalesce(ipi_number, '')), ''),
  pro_name = nullif(btrim(coalesce(pro_name, '')), '')
where full_name <> btrim(full_name)
  or coalesce(first_name, '') <> coalesce(nullif(btrim(coalesce(first_name, '')), ''), '')
  or coalesce(middle_name, '') <> coalesce(nullif(btrim(coalesce(middle_name, '')), ''), '')
  or coalesce(last_name, '') <> coalesce(nullif(btrim(coalesce(last_name, '')), ''), '')
  or coalesce(ipi_number, '') <> coalesce(nullif(btrim(coalesce(ipi_number, '')), ''), '')
  or coalesce(pro_name, '') <> coalesce(nullif(btrim(coalesce(pro_name, '')), ''), '');

drop index if exists public.idx_publishing_writers_strict_identity;

with identity_rank as (
  select
    id as duplicate_id,
    first_value(id) over (
      partition by
        case
          when nullif(btrim(coalesce(ipi_number, '')), '') is not null
            then 'ipi:' || lower(btrim(ipi_number))
          else 'name-pro:' || lower(btrim(full_name)) || ':' || lower(coalesce(nullif(btrim(pro_name), ''), ''))
        end
      order by
        is_active desc,
        archived_at asc nulls first,
        created_at asc,
        id asc
    ) as keep_id
  from public.publishing_writers
),
duplicate_artist_links as (
  select link.id
  from public.artist_publishing_writers as link
  join identity_rank
    on identity_rank.duplicate_id = link.writer_id
   and identity_rank.duplicate_id <> identity_rank.keep_id
  where exists (
    select 1
    from public.artist_publishing_writers as survivor_link
    where survivor_link.artist_id = link.artist_id
      and survivor_link.writer_id = identity_rank.keep_id
  )
)
delete from public.artist_publishing_writers as link
using duplicate_artist_links
where link.id = duplicate_artist_links.id;

with identity_rank as (
  select
    id as duplicate_id,
    first_value(id) over (
      partition by
        case
          when nullif(btrim(coalesce(ipi_number, '')), '') is not null
            then 'ipi:' || lower(btrim(ipi_number))
          else 'name-pro:' || lower(btrim(full_name)) || ':' || lower(coalesce(nullif(btrim(pro_name), ''), ''))
        end
      order by
        is_active desc,
        archived_at asc nulls first,
        created_at asc,
        id asc
    ) as keep_id
  from public.publishing_writers
)
update public.artist_publishing_writers as link
set writer_id = identity_rank.keep_id
from identity_rank
where link.writer_id = identity_rank.duplicate_id
  and identity_rank.duplicate_id <> identity_rank.keep_id;

with identity_rank as (
  select
    id as duplicate_id,
    first_value(id) over (
      partition by
        case
          when nullif(btrim(coalesce(ipi_number, '')), '') is not null
            then 'ipi:' || lower(btrim(ipi_number))
          else 'name-pro:' || lower(btrim(full_name)) || ':' || lower(coalesce(nullif(btrim(pro_name), ''), ''))
        end
      order by
        is_active desc,
        archived_at asc nulls first,
        created_at asc,
        id asc
    ) as keep_id
  from public.publishing_writers
)
update public.publishing_registration_track_writers as registration_writer
set writer_id = identity_rank.keep_id
from identity_rank
where registration_writer.writer_id = identity_rank.duplicate_id
  and identity_rank.duplicate_id <> identity_rank.keep_id;

with identity_rank as (
  select
    id as duplicate_id,
    first_value(id) over (
      partition by
        case
          when nullif(btrim(coalesce(ipi_number, '')), '') is not null
            then 'ipi:' || lower(btrim(ipi_number))
          else 'name-pro:' || lower(btrim(full_name)) || ':' || lower(coalesce(nullif(btrim(pro_name), ''), ''))
        end
      order by
        is_active desc,
        archived_at asc nulls first,
        created_at asc,
        id asc
    ) as keep_id
  from public.publishing_writers
)
delete from public.publishing_writers as writer
using identity_rank
where writer.id = identity_rank.duplicate_id
  and identity_rank.duplicate_id <> identity_rank.keep_id;

create unique index if not exists idx_publishing_writers_unique_ipi
on public.publishing_writers (lower(btrim(ipi_number)))
where nullif(btrim(coalesce(ipi_number, '')), '') is not null;

create unique index if not exists idx_publishing_writers_unique_name_pro_without_ipi
on public.publishing_writers (
  lower(btrim(full_name)),
  lower(coalesce(nullif(btrim(pro_name), ''), ''))
)
where nullif(btrim(coalesce(ipi_number, '')), '') is null;
