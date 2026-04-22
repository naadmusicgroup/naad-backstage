alter table public.releases
  add column if not exists status text,
  add column if not exists genre text,
  add column if not exists takedown_reason text,
  add column if not exists takedown_proof_urls jsonb not null default '[]'::jsonb,
  add column if not exists takedown_requested_at timestamptz,
  add column if not exists takedown_requested_by uuid references public.profiles (id) on delete set null,
  add column if not exists takedown_completed_at timestamptz,
  add column if not exists takedown_completed_by uuid references public.profiles (id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

alter table public.tracks
  add column if not exists status text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

update public.releases
set
  status = case
    when status in ('draft', 'live', 'taken_down', 'deleted') then status
    when is_active = true then 'live'
    else 'deleted'
  end,
  genre = coalesce(nullif(trim(genre), ''), 'Other'),
  deleted_at = case
    when coalesce(status, case when is_active = true then 'live' else 'deleted' end) = 'deleted'
      and deleted_at is null
      then updated_at
    else deleted_at
  end
where status is null
   or status not in ('draft', 'live', 'taken_down', 'deleted')
   or genre is null
   or trim(genre) = '';

update public.tracks
set
  status = case
    when status in ('draft', 'live', 'deleted') then status
    when is_active = true then 'live'
    else 'deleted'
  end,
  deleted_at = case
    when coalesce(status, case when is_active = true then 'live' else 'deleted' end) = 'deleted'
      and deleted_at is null
      then updated_at
    else deleted_at
  end
where status is null
   or status not in ('draft', 'live', 'deleted');

alter table public.releases
  alter column status set default 'live',
  alter column status set not null,
  alter column genre set default 'Other',
  alter column genre set not null;

alter table public.tracks
  alter column status set default 'live',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'releases_status_check'
      and conrelid = 'public.releases'::regclass
  ) then
    alter table public.releases
      add constraint releases_status_check
      check (status in ('draft', 'live', 'taken_down', 'deleted'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tracks_status_check'
      and conrelid = 'public.tracks'::regclass
  ) then
    alter table public.tracks
      add constraint tracks_status_check
      check (status in ('draft', 'live', 'deleted'));
  end if;
end;
$$;

create or replace function public.sync_release_is_active_from_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is null then
    new.status := case when coalesce(new.is_active, true) then 'live' else 'deleted' end;
  end if;

  new.is_active := new.status <> 'deleted';

  if new.status = 'deleted' and new.deleted_at is null then
    new.deleted_at := now();
  end if;

  if new.status <> 'deleted' then
    new.deleted_at := null;
    new.deleted_by := null;
  end if;

  return new;
end;
$$;

create or replace function public.sync_track_is_active_from_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is null then
    new.status := case when coalesce(new.is_active, true) then 'live' else 'deleted' end;
  end if;

  new.is_active := new.status <> 'deleted';

  if new.status = 'deleted' and new.deleted_at is null then
    new.deleted_at := now();
  end if;

  if new.status <> 'deleted' then
    new.deleted_at := null;
    new.deleted_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists releases_sync_is_active_from_status on public.releases;
create trigger releases_sync_is_active_from_status
before insert or update on public.releases
for each row
execute function public.sync_release_is_active_from_status();

drop trigger if exists tracks_sync_is_active_from_status on public.tracks;
create trigger tracks_sync_is_active_from_status
before insert or update on public.tracks
for each row
execute function public.sync_track_is_active_from_status();

create table if not exists public.track_credits (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  credited_name text not null,
  linked_artist_id uuid references public.artists (id) on delete set null,
  role_code text not null,
  instrument text,
  display_credit text,
  notes text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_track_credits_track on public.track_credits (track_id, sort_order, created_at);
create index if not exists idx_track_credits_artist on public.track_credits (linked_artist_id) where linked_artist_id is not null;

drop trigger if exists track_credits_set_updated_at on public.track_credits;
create trigger track_credits_set_updated_at
before update on public.track_credits
for each row
execute function public.set_updated_at();

create table if not exists public.release_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  actor_artist_id uuid references public.artists (id) on delete set null,
  actor_role text not null default 'system' check (actor_role in ('system', 'admin', 'artist')),
  event_type text not null check (
    event_type in (
      'release_created',
      'release_edited',
      'genre_changed',
      'credits_changed',
      'split_version_created',
      'draft_edit_requested',
      'request_approved',
      'request_rejected',
      'request_applied',
      'takedown_requested',
      'takedown_completed',
      'release_deleted'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_release_events_release_created on public.release_events (release_id, created_at desc);

create table if not exists public.release_change_requests (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  requester_artist_id uuid not null references public.artists (id) on delete restrict,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  request_type text not null check (request_type in ('draft_edit', 'takedown')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied')),
  proposed_release jsonb not null default '{}'::jsonb,
  proposed_tracks jsonb not null default '[]'::jsonb,
  proposed_credits jsonb not null default '[]'::jsonb,
  proposed_genre text,
  takedown_reason text,
  proof_urls jsonb not null default '[]'::jsonb,
  admin_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_release_change_requests_open
  on public.release_change_requests (release_id)
  where status = 'pending';

create index if not exists idx_release_change_requests_requester
  on public.release_change_requests (requester_artist_id, created_at desc);

drop trigger if exists release_change_requests_set_updated_at on public.release_change_requests;
create trigger release_change_requests_set_updated_at
before update on public.release_change_requests
for each row
execute function public.set_updated_at();

create table if not exists public.release_split_versions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  effective_period_month date not null,
  change_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  source text not null default 'admin' check (source in ('migration', 'admin', 'artist_request')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_release_split_versions_release
  on public.release_split_versions (release_id, effective_period_month desc, created_at desc);

drop trigger if exists release_split_versions_set_updated_at on public.release_split_versions;
create trigger release_split_versions_set_updated_at
before update on public.release_split_versions
for each row
execute function public.set_updated_at();

create table if not exists public.release_split_version_entries (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.release_split_versions (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete restrict,
  role text not null,
  split_pct numeric(5,2) not null default 0 check (split_pct >= 0),
  created_at timestamptz not null default now(),
  unique (version_id, artist_id, role)
);

create index if not exists idx_release_split_version_entries_version
  on public.release_split_version_entries (version_id, created_at);

create table if not exists public.track_split_versions (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  release_id uuid not null references public.releases (id) on delete cascade,
  effective_period_month date not null,
  change_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  source text not null default 'admin' check (source in ('migration', 'admin', 'artist_request')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_track_split_versions_track
  on public.track_split_versions (track_id, effective_period_month desc, created_at desc);
create index if not exists idx_track_split_versions_release
  on public.track_split_versions (release_id, effective_period_month desc, created_at desc);

drop trigger if exists track_split_versions_set_updated_at on public.track_split_versions;
create trigger track_split_versions_set_updated_at
before update on public.track_split_versions
for each row
execute function public.set_updated_at();

create table if not exists public.track_split_version_entries (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.track_split_versions (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete restrict,
  role text not null,
  split_pct numeric(5,2) not null default 0 check (split_pct >= 0),
  created_at timestamptz not null default now(),
  unique (version_id, artist_id, role)
);

create index if not exists idx_track_split_version_entries_version
  on public.track_split_version_entries (version_id, created_at);

with release_seed as (
  select
    r.id as release_id,
    coalesce(date_trunc('month', r.release_date)::date, date_trunc('month', r.created_at)::date, current_date) as effective_period_month
  from public.releases r
  where exists (
    select 1
    from public.release_collaborators rc
    where rc.release_id = r.id
  )
    and not exists (
      select 1
      from public.release_split_versions existing
      where existing.release_id = r.id
    )
),
inserted_versions as (
  insert into public.release_split_versions (release_id, effective_period_month, change_reason, source)
  select
    release_id,
    effective_period_month,
    'Initial split snapshot',
    'migration'
  from release_seed
  returning id, release_id
)
insert into public.release_split_version_entries (version_id, artist_id, role, split_pct)
select
  inserted_versions.id,
  rc.artist_id,
  rc.role,
  rc.split_pct
from inserted_versions
join public.release_collaborators rc on rc.release_id = inserted_versions.release_id;

with track_seed as (
  select
    t.id as track_id,
    t.release_id,
    coalesce(date_trunc('month', r.release_date)::date, date_trunc('month', t.created_at)::date, current_date) as effective_period_month
  from public.tracks t
  join public.releases r on r.id = t.release_id
  where exists (
    select 1
    from public.track_collaborators tc
    where tc.track_id = t.id
  )
    and not exists (
      select 1
      from public.track_split_versions existing
      where existing.track_id = t.id
    )
),
inserted_versions as (
  insert into public.track_split_versions (track_id, release_id, effective_period_month, change_reason, source)
  select
    track_id,
    release_id,
    effective_period_month,
    'Initial split snapshot',
    'migration'
  from track_seed
  returning id, track_id
)
insert into public.track_split_version_entries (version_id, artist_id, role, split_pct)
select
  inserted_versions.id,
  tc.artist_id,
  tc.role,
  tc.split_pct
from inserted_versions
join public.track_collaborators tc on tc.track_id = inserted_versions.track_id;

create or replace function public.can_access_release(target_release_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.releases r
      where r.id = target_release_id
        and r.status <> 'deleted'
        and (
          r.artist_id in (select public.get_my_artist_ids())
          or (
            r.status in ('live', 'taken_down')
            and exists (
              select 1
              from public.release_collaborators rc
              where rc.release_id = r.id
                and rc.artist_id in (select public.get_my_artist_ids())
            )
          )
          or (
            r.status in ('live', 'taken_down')
            and exists (
              select 1
              from public.tracks t
              join public.track_collaborators tc on tc.track_id = t.id
              where t.release_id = r.id
                and tc.artist_id in (select public.get_my_artist_ids())
            )
          )
        )
    )
$$;

drop policy if exists tracks_select on public.tracks;
create policy tracks_select on public.tracks
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.releases r
    where r.id = tracks.release_id
      and tracks.status <> 'deleted'
      and public.can_access_release(r.id)
  )
);

drop policy if exists track_collaborators_select on public.track_collaborators;
create policy track_collaborators_select on public.track_collaborators
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.tracks t
    where t.id = track_collaborators.track_id
      and t.status <> 'deleted'
      and public.can_access_release(t.release_id)
  )
);

alter table public.track_credits enable row level security;
alter table public.release_events enable row level security;
alter table public.release_change_requests enable row level security;
alter table public.release_split_versions enable row level security;
alter table public.release_split_version_entries enable row level security;
alter table public.track_split_versions enable row level security;
alter table public.track_split_version_entries enable row level security;

drop policy if exists track_credits_select on public.track_credits;
create policy track_credits_select on public.track_credits
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.tracks t
    where t.id = track_credits.track_id
      and t.status <> 'deleted'
      and public.can_access_release(t.release_id)
  )
);

drop policy if exists track_credits_admin_write on public.track_credits;
create policy track_credits_admin_write on public.track_credits
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists release_events_select on public.release_events;
create policy release_events_select on public.release_events
for select
using (public.is_admin() or public.can_access_release(release_id));

drop policy if exists release_events_admin_write on public.release_events;
create policy release_events_admin_write on public.release_events
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists release_change_requests_select on public.release_change_requests;
create policy release_change_requests_select on public.release_change_requests
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.releases r
    where r.id = release_change_requests.release_id
      and r.artist_id in (select public.get_my_artist_ids())
  )
);

drop policy if exists release_change_requests_insert on public.release_change_requests;
create policy release_change_requests_insert on public.release_change_requests
for insert
with check (
  exists (
    select 1
    from public.releases r
    where r.id = release_change_requests.release_id
      and r.artist_id in (select public.get_my_artist_ids())
      and release_change_requests.requester_artist_id = r.artist_id
      and release_change_requests.requested_by = auth.uid()
  )
);

drop policy if exists release_change_requests_admin_update on public.release_change_requests;
create policy release_change_requests_admin_update on public.release_change_requests
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists release_split_versions_select on public.release_split_versions;
create policy release_split_versions_select on public.release_split_versions
for select
using (public.is_admin() or public.can_access_release(release_id));

drop policy if exists release_split_versions_admin_write on public.release_split_versions;
create policy release_split_versions_admin_write on public.release_split_versions
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists release_split_version_entries_select on public.release_split_version_entries;
create policy release_split_version_entries_select on public.release_split_version_entries
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.release_split_versions v
    where v.id = release_split_version_entries.version_id
      and public.can_access_release(v.release_id)
  )
);

drop policy if exists release_split_version_entries_admin_write on public.release_split_version_entries;
create policy release_split_version_entries_admin_write on public.release_split_version_entries
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists track_split_versions_select on public.track_split_versions;
create policy track_split_versions_select on public.track_split_versions
for select
using (public.is_admin() or public.can_access_release(release_id));

drop policy if exists track_split_versions_admin_write on public.track_split_versions;
create policy track_split_versions_admin_write on public.track_split_versions
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists track_split_version_entries_select on public.track_split_version_entries;
create policy track_split_version_entries_select on public.track_split_version_entries
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.track_split_versions v
    where v.id = track_split_version_entries.version_id
      and public.can_access_release(v.release_id)
  )
);

drop policy if exists track_split_version_entries_admin_write on public.track_split_version_entries;
create policy track_split_version_entries_admin_write on public.track_split_version_entries
for all
using (public.is_admin())
with check (public.is_admin());

alter table public.track_credits force row level security;
alter table public.release_events force row level security;
alter table public.release_change_requests force row level security;
alter table public.release_split_versions force row level security;
alter table public.release_split_version_entries force row level security;
alter table public.track_split_versions force row level security;
alter table public.track_split_version_entries force row level security;
