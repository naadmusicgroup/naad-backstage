alter table public.artist_publishing_writers
drop constraint if exists artist_publishing_writers_source_check;

alter table public.artist_publishing_writers
add constraint artist_publishing_writers_source_check
check (source in ('artist_saved', 'artist_submission', 'admin_direct', 'artist_publishing_info'));

update public.publishing_writers
set
  full_name = btrim(full_name),
  ipi_number = nullif(btrim(coalesce(ipi_number, '')), ''),
  pro_name = nullif(btrim(coalesce(pro_name, '')), '')
where full_name <> btrim(full_name)
  or coalesce(ipi_number, '') <> coalesce(nullif(btrim(coalesce(ipi_number, '')), ''), '')
  or coalesce(pro_name, '') <> coalesce(nullif(btrim(coalesce(pro_name, '')), ''), '');

with ranked as (
  select
    id as duplicate_id,
    first_value(id) over (
      partition by
        lower(btrim(full_name)),
        lower(coalesce(nullif(btrim(ipi_number), ''), '')),
        lower(coalesce(nullif(btrim(pro_name), ''), ''))
      order by created_at asc, id asc
    ) as keep_id
  from public.publishing_writers
),
duplicate_artist_links as (
  select link.id
  from public.artist_publishing_writers as link
  join ranked
    on ranked.duplicate_id = link.writer_id
   and ranked.duplicate_id <> ranked.keep_id
  where exists (
    select 1
    from public.artist_publishing_writers as survivor_link
    where survivor_link.artist_id = link.artist_id
      and survivor_link.writer_id = ranked.keep_id
  )
)
delete from public.artist_publishing_writers as link
using duplicate_artist_links
where link.id = duplicate_artist_links.id;

with ranked as (
  select
    id as duplicate_id,
    first_value(id) over (
      partition by
        lower(btrim(full_name)),
        lower(coalesce(nullif(btrim(ipi_number), ''), '')),
        lower(coalesce(nullif(btrim(pro_name), ''), ''))
      order by created_at asc, id asc
    ) as keep_id
  from public.publishing_writers
)
update public.artist_publishing_writers as link
set writer_id = ranked.keep_id
from ranked
where link.writer_id = ranked.duplicate_id
  and ranked.duplicate_id <> ranked.keep_id;

with ranked as (
  select
    id as duplicate_id,
    first_value(id) over (
      partition by
        lower(btrim(full_name)),
        lower(coalesce(nullif(btrim(ipi_number), ''), '')),
        lower(coalesce(nullif(btrim(pro_name), ''), ''))
      order by created_at asc, id asc
    ) as keep_id
  from public.publishing_writers
),
duplicate_registration_writers as (
  select registration_writer.id
  from public.publishing_registration_track_writers as registration_writer
  join ranked
    on ranked.duplicate_id = registration_writer.writer_id
   and ranked.duplicate_id <> ranked.keep_id
  where exists (
    select 1
    from public.publishing_registration_track_writers as survivor_registration_writer
    where survivor_registration_writer.registration_track_id = registration_writer.registration_track_id
      and survivor_registration_writer.writer_id = ranked.keep_id
      and survivor_registration_writer.role = registration_writer.role
  )
)
delete from public.publishing_registration_track_writers as registration_writer
using duplicate_registration_writers
where registration_writer.id = duplicate_registration_writers.id;

with ranked as (
  select
    id as duplicate_id,
    first_value(id) over (
      partition by
        lower(btrim(full_name)),
        lower(coalesce(nullif(btrim(ipi_number), ''), '')),
        lower(coalesce(nullif(btrim(pro_name), ''), ''))
      order by created_at asc, id asc
    ) as keep_id
  from public.publishing_writers
)
update public.publishing_registration_track_writers as registration_writer
set writer_id = ranked.keep_id
from ranked
where registration_writer.writer_id = ranked.duplicate_id
  and ranked.duplicate_id <> ranked.keep_id;

with ranked as (
  select
    id as duplicate_id,
    first_value(id) over (
      partition by
        lower(btrim(full_name)),
        lower(coalesce(nullif(btrim(ipi_number), ''), '')),
        lower(coalesce(nullif(btrim(pro_name), ''), ''))
      order by created_at asc, id asc
    ) as keep_id
  from public.publishing_writers
)
delete from public.publishing_writers as writer
using ranked
where writer.id = ranked.duplicate_id
  and ranked.duplicate_id <> ranked.keep_id;

create unique index if not exists idx_publishing_writers_strict_identity
on public.publishing_writers (
  lower(btrim(full_name)),
  lower(coalesce(nullif(btrim(ipi_number), ''), '')),
  lower(coalesce(nullif(btrim(pro_name), ''), ''))
);

with normalized_artist_info as (
  select
    artist_id,
    btrim(legal_name) as full_name,
    nullif(btrim(coalesce(ipi_number, '')), '') as ipi_number,
    nullif(btrim(coalesce(pro_name, '')), '') as pro_name
  from public.artist_publishing_info
  where nullif(btrim(coalesce(legal_name, '')), '') is not null
),
distinct_writer_info as (
  select distinct on (
    lower(full_name),
    lower(coalesce(ipi_number, '')),
    lower(coalesce(pro_name, ''))
  )
    full_name,
    ipi_number,
    pro_name,
    artist_id
  from normalized_artist_info
  order by
    lower(full_name),
    lower(coalesce(ipi_number, '')),
    lower(coalesce(pro_name, '')),
    artist_id
)
insert into public.publishing_writers (
  full_name,
  ipi_number,
  pro_name,
  created_by_artist_id
)
select
  info.full_name,
  info.ipi_number,
  info.pro_name,
  info.artist_id
from distinct_writer_info as info
where not exists (
  select 1
  from public.publishing_writers as writer
  where lower(btrim(writer.full_name)) = lower(info.full_name)
    and lower(coalesce(nullif(btrim(writer.ipi_number), ''), '')) = lower(coalesce(info.ipi_number, ''))
    and lower(coalesce(nullif(btrim(writer.pro_name), ''), '')) = lower(coalesce(info.pro_name, ''))
)
on conflict do nothing;

with normalized_artist_info as (
  select
    artist_id,
    btrim(legal_name) as full_name,
    nullif(btrim(coalesce(ipi_number, '')), '') as ipi_number,
    nullif(btrim(coalesce(pro_name, '')), '') as pro_name
  from public.artist_publishing_info
  where nullif(btrim(coalesce(legal_name, '')), '') is not null
)
insert into public.artist_publishing_writers (
  artist_id,
  writer_id,
  source
)
select
  info.artist_id,
  writer.id,
  'artist_publishing_info'
from normalized_artist_info as info
join public.publishing_writers as writer
  on lower(btrim(writer.full_name)) = lower(info.full_name)
 and lower(coalesce(nullif(btrim(writer.ipi_number), ''), '')) = lower(coalesce(info.ipi_number, ''))
 and lower(coalesce(nullif(btrim(writer.pro_name), ''), '')) = lower(coalesce(info.pro_name, ''))
on conflict (artist_id, writer_id) do nothing;
