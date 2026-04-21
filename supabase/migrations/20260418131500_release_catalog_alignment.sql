create table if not exists public.track_collaborators (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete restrict,
  role text not null,
  split_pct numeric(5,2) not null default 0 check (split_pct >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track_id, artist_id, role)
);

create index if not exists idx_track_collaborators_track on public.track_collaborators (track_id);
create index if not exists idx_track_collaborators_artist on public.track_collaborators (artist_id);

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
        and r.is_active = true
        and (
          r.artist_id in (select public.get_my_artist_ids())
          or exists (
            select 1
            from public.release_collaborators rc
            where rc.release_id = r.id
              and rc.artist_id in (select public.get_my_artist_ids())
          )
          or exists (
            select 1
            from public.tracks t
            join public.track_collaborators tc on tc.track_id = t.id
            where t.release_id = r.id
              and tc.artist_id in (select public.get_my_artist_ids())
          )
        )
    )
$$;

create or replace function public.enforce_track_collaborator_splits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_track uuid;
  split_total numeric(8,2);
begin
  target_track := coalesce(new.track_id, old.track_id);

  select coalesce(sum(split_pct), 0)
  into split_total
  from public.track_collaborators
  where track_id = target_track
    and (tg_op = 'INSERT' or id <> old.id);

  if tg_op in ('INSERT', 'UPDATE') then
    split_total := split_total + new.split_pct;
  end if;

  if split_total > 100 then
    raise exception 'Track collaborator splits exceed 100 percent for track %', target_track;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists track_collaborators_split_guard on public.track_collaborators;
create trigger track_collaborators_split_guard
before insert or update or delete on public.track_collaborators
for each row
execute function public.enforce_track_collaborator_splits();

drop trigger if exists track_collaborators_set_updated_at on public.track_collaborators;
create trigger track_collaborators_set_updated_at before update on public.track_collaborators for each row execute function public.set_updated_at();

alter table public.track_collaborators enable row level security;

drop policy if exists track_collaborators_select on public.track_collaborators;
create policy track_collaborators_select on public.track_collaborators
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.tracks t
    where t.id = track_collaborators.track_id
      and t.is_active = true
      and public.can_access_release(t.release_id)
  )
);

drop policy if exists track_collaborators_admin_write on public.track_collaborators;
create policy track_collaborators_admin_write on public.track_collaborators
for all
using (public.is_admin())
with check (public.is_admin());

alter table public.track_collaborators force row level security;
