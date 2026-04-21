create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  role text not null check (role in ('admin', 'artist')),
  phone text,
  country text,
  bio text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  email text,
  avatar_url text,
  country text,
  bio text,
  admin_notes text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_bank_details (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null unique references public.artists (id) on delete cascade,
  account_name text not null,
  bank_name text not null,
  account_number text not null,
  bank_address text,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_publishing_info (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null unique references public.artists (id) on delete cascade,
  legal_name text,
  ipi_number text,
  pro_name text,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete restrict,
  title text not null,
  type text not null check (type in ('single', 'ep', 'album')),
  upc text unique,
  cover_art_url text,
  streaming_link text,
  release_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete restrict,
  title text not null,
  isrc text not null unique,
  track_number integer,
  duration_seconds integer,
  audio_preview_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.release_collaborators (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete restrict,
  role text not null,
  split_pct numeric(5,2) not null default 0 check (split_pct >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, artist_id, role)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  raw_name text not null unique,
  display_name text,
  icon_url text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.csv_uploads (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  artist_id uuid not null references public.artists (id) on delete restrict,
  filename text not null,
  file_url text not null,
  status text not null check (status in ('processing', 'completed', 'failed', 'reversed', 'abandoned')),
  error_message text,
  row_count integer,
  matched_count integer,
  unmatched_count integer,
  total_amount numeric(19,8),
  total_units bigint,
  period_start date,
  period_end date,
  period_month date not null,
  reporting_date date,
  checksum text not null,
  parsed_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, checksum)
);

create table if not exists public.earnings (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete restrict,
  track_id uuid not null references public.tracks (id) on delete restrict,
  release_id uuid not null references public.releases (id) on delete restrict,
  channel_id uuid not null references public.channels (id) on delete restrict,
  upload_id uuid not null references public.csv_uploads (id) on delete restrict,
  sale_date date not null,
  accounting_date date not null,
  reporting_date date,
  territory text,
  units integer not null default 0,
  unit_price numeric(19,8) not null default 0,
  original_currency text,
  total_amount numeric(19,8) not null,
  earning_type text not null check (earning_type in ('original', 'adjustment', 'reversal')),
  csv_row_number integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (upload_id, csv_row_number)
);

create table if not exists public.transaction_ledger (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete restrict,
  type text not null check (type in ('csv_import', 'csv_reversal', 'publishing', 'due_charge', 'payout_pending', 'payout_rejected', 'adjustment')),
  reference_id uuid not null,
  amount numeric(19,8) not null,
  balance_after numeric(19,8) not null,
  description text not null,
  period_month date,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dues (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete restrict,
  title text not null,
  amount numeric(19,8) not null,
  frequency text not null default 'one_time' check (frequency in ('one_time')),
  status text not null check (status in ('unpaid', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  ledger_entry_id uuid references public.transaction_ledger (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.publishing_earnings (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete restrict,
  release_id uuid references public.releases (id) on delete set null,
  amount numeric(19,8) not null,
  period_month date not null,
  notes text,
  entered_by uuid not null references public.profiles (id) on delete restrict,
  ledger_entry_id uuid references public.transaction_ledger (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete restrict,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  amount numeric(19,8) not null check (amount >= 0),
  status text not null check (status in ('pending', 'approved', 'rejected', 'paid')),
  admin_notes text,
  artist_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  payment_method text check (payment_method in ('bank_transfer', 'esewa', 'khalti', 'other')),
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete restrict,
  release_id uuid references public.releases (id) on delete set null,
  platform text not null check (platform in ('spotify', 'apple_music', 'tiktok', 'meta', 'youtube')),
  metric_type text not null check (metric_type in ('monthly_listeners', 'streams', 'views', 'impressions', 'video_creations')),
  value bigint not null default 0,
  period_month date not null,
  entered_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  title text not null,
  message text,
  type text not null check (type in ('earnings_posted', 'payout_approved', 'payout_rejected', 'payout_paid', 'due_added')),
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.statement_periods (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  period_month date not null,
  status text not null check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, period_month)
);

create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.get_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.get_my_artist_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select id
  from public.artists
  where user_id = auth.uid()
    and is_active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
$$;

create or replace function public.can_access_artist(target_artist_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.artists a
      where a.id = target_artist_id
        and a.id in (select public.get_my_artist_ids())
    )
$$;

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
        )
    )
$$;

create or replace function public.enforce_release_collaborator_splits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_release uuid;
  split_total numeric(8,2);
begin
  target_release := coalesce(new.release_id, old.release_id);

  select coalesce(sum(split_pct), 0)
  into split_total
  from public.release_collaborators
  where release_id = target_release
    and (tg_op = 'INSERT' or id <> old.id);

  if tg_op in ('INSERT', 'UPDATE') then
    split_total := split_total + new.split_pct;
  end if;

  if split_total > 100 then
    raise exception 'Collaborator splits exceed 100 percent for release %', target_release;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists release_collaborators_split_guard on public.release_collaborators;
create trigger release_collaborators_split_guard
before insert or update or delete on public.release_collaborators
for each row
execute function public.enforce_release_collaborator_splits();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists artists_set_updated_at on public.artists;
create trigger artists_set_updated_at before update on public.artists for each row execute function public.set_updated_at();
drop trigger if exists artist_bank_details_set_updated_at on public.artist_bank_details;
create trigger artist_bank_details_set_updated_at before update on public.artist_bank_details for each row execute function public.set_updated_at();
drop trigger if exists artist_publishing_info_set_updated_at on public.artist_publishing_info;
create trigger artist_publishing_info_set_updated_at before update on public.artist_publishing_info for each row execute function public.set_updated_at();
drop trigger if exists releases_set_updated_at on public.releases;
create trigger releases_set_updated_at before update on public.releases for each row execute function public.set_updated_at();
drop trigger if exists tracks_set_updated_at on public.tracks;
create trigger tracks_set_updated_at before update on public.tracks for each row execute function public.set_updated_at();
drop trigger if exists release_collaborators_set_updated_at on public.release_collaborators;
create trigger release_collaborators_set_updated_at before update on public.release_collaborators for each row execute function public.set_updated_at();
drop trigger if exists channels_set_updated_at on public.channels;
create trigger channels_set_updated_at before update on public.channels for each row execute function public.set_updated_at();
drop trigger if exists csv_uploads_set_updated_at on public.csv_uploads;
create trigger csv_uploads_set_updated_at before update on public.csv_uploads for each row execute function public.set_updated_at();
drop trigger if exists transaction_ledger_set_updated_at on public.transaction_ledger;
create trigger transaction_ledger_set_updated_at before update on public.transaction_ledger for each row execute function public.set_updated_at();
drop trigger if exists dues_set_updated_at on public.dues;
create trigger dues_set_updated_at before update on public.dues for each row execute function public.set_updated_at();
drop trigger if exists publishing_earnings_set_updated_at on public.publishing_earnings;
create trigger publishing_earnings_set_updated_at before update on public.publishing_earnings for each row execute function public.set_updated_at();
drop trigger if exists payout_requests_set_updated_at on public.payout_requests;
create trigger payout_requests_set_updated_at before update on public.payout_requests for each row execute function public.set_updated_at();
drop trigger if exists analytics_snapshots_set_updated_at on public.analytics_snapshots;
create trigger analytics_snapshots_set_updated_at before update on public.analytics_snapshots for each row execute function public.set_updated_at();
drop trigger if exists notifications_set_updated_at on public.notifications;
create trigger notifications_set_updated_at before update on public.notifications for each row execute function public.set_updated_at();
drop trigger if exists statement_periods_set_updated_at on public.statement_periods;
create trigger statement_periods_set_updated_at before update on public.statement_periods for each row execute function public.set_updated_at();
drop trigger if exists admin_activity_log_set_updated_at on public.admin_activity_log;
create trigger admin_activity_log_set_updated_at before update on public.admin_activity_log for each row execute function public.set_updated_at();

create or replace view public.artist_wallet as
select
  a.id as artist_id,
  coalesce(e.total_earnings, 0) + coalesce(p.total_publishing, 0) as total_earned,
  coalesce(d.total_dues, 0) as total_dues,
  coalesce(po.pending_payouts, 0) as pending_payouts,
  coalesce(po.approved_payouts, 0) as approved_payouts,
  coalesce(po.paid_payouts, 0) as total_withdrawn,
  (coalesce(e.total_earnings, 0) + coalesce(p.total_publishing, 0))
    - coalesce(d.total_dues, 0)
    - coalesce(po.pending_payouts, 0)
    - coalesce(po.approved_payouts, 0)
    - coalesce(po.paid_payouts, 0) as available_balance
from public.artists a
left join (
  select artist_id, sum(total_amount) as total_earnings
  from public.earnings
  group by artist_id
) e on e.artist_id = a.id
left join (
  select artist_id, sum(amount) as total_publishing
  from public.publishing_earnings
  group by artist_id
) p on p.artist_id = a.id
left join (
  select artist_id, sum(amount) as total_dues
  from public.dues
  where status <> 'cancelled'
  group by artist_id
) d on d.artist_id = a.id
left join (
  select
    artist_id,
    sum(case when status = 'pending' then amount else 0 end) as pending_payouts,
    sum(case when status = 'approved' then amount else 0 end) as approved_payouts,
    sum(case when status = 'paid' then amount else 0 end) as paid_payouts
  from public.payout_requests
  group by artist_id
) po on po.artist_id = a.id;

create or replace view public.monthly_earnings_summary as
select
  artist_id,
  date_trunc('month', sale_date)::date as month,
  channel_id,
  territory,
  release_id,
  track_id,
  sum(total_amount) as revenue,
  sum(units) as streams,
  count(*) as row_count
from public.earnings
group by artist_id, date_trunc('month', sale_date)::date, channel_id, territory, release_id, track_id;

create index if not exists idx_earnings_artist_id on public.earnings (artist_id);
create index if not exists idx_earnings_track_id on public.earnings (track_id);
create index if not exists idx_earnings_release_id on public.earnings (release_id);
create index if not exists idx_earnings_channel_id on public.earnings (channel_id);
create index if not exists idx_earnings_upload_id on public.earnings (upload_id);
create index if not exists idx_earnings_sale_date on public.earnings (sale_date);
create index if not exists idx_earnings_artist_sale_date on public.earnings (artist_id, sale_date);
create index if not exists idx_ledger_artist_created on public.transaction_ledger (artist_id, created_at desc);
create unique index if not exists idx_ledger_idempotency on public.transaction_ledger (idempotency_key) where idempotency_key is not null;
create index if not exists idx_payouts_artist_status on public.payout_requests (artist_id, status);
create index if not exists idx_payouts_artist_created on public.payout_requests (artist_id, created_at desc);
create index if not exists idx_dues_artist_status on public.dues (artist_id, status);
create index if not exists idx_notifications_artist_read on public.notifications (artist_id, is_read, created_at desc);
create unique index if not exists idx_analytics_unique on public.analytics_snapshots (
  artist_id,
  coalesce(release_id, '00000000-0000-0000-0000-000000000000'::uuid),
  platform,
  metric_type,
  period_month
);
create index if not exists idx_admin_log_admin_id on public.admin_activity_log (admin_id);
create index if not exists idx_admin_log_entity on public.admin_activity_log (entity_type, entity_id);
create index if not exists idx_admin_log_created on public.admin_activity_log (created_at desc);

alter table public.profiles enable row level security;
alter table public.artists enable row level security;
alter table public.artist_bank_details enable row level security;
alter table public.artist_publishing_info enable row level security;
alter table public.releases enable row level security;
alter table public.tracks enable row level security;
alter table public.release_collaborators enable row level security;
alter table public.channels enable row level security;
alter table public.csv_uploads enable row level security;
alter table public.earnings enable row level security;
alter table public.transaction_ledger enable row level security;
alter table public.dues enable row level security;
alter table public.publishing_earnings enable row level security;
alter table public.payout_requests enable row level security;
alter table public.analytics_snapshots enable row level security;
alter table public.notifications enable row level security;
alter table public.statement_periods enable row level security;
alter table public.admin_activity_log enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select
using (public.is_admin() or id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update
using (public.is_admin() or id = auth.uid())
with check (public.is_admin() or id = auth.uid());

drop policy if exists artists_select on public.artists;
create policy artists_select on public.artists
for select
using (
  public.is_admin()
  or (
    user_id = auth.uid()
    and is_active = true
  )
);

drop policy if exists artists_admin_write on public.artists;
create policy artists_admin_write on public.artists
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists artist_bank_details_select on public.artist_bank_details;
create policy artist_bank_details_select on public.artist_bank_details
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists artist_bank_details_upsert on public.artist_bank_details;
create policy artist_bank_details_upsert on public.artist_bank_details
for all
using (public.is_admin() or public.can_access_artist(artist_id))
with check (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists artist_publishing_info_select on public.artist_publishing_info;
create policy artist_publishing_info_select on public.artist_publishing_info
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists artist_publishing_info_admin_write on public.artist_publishing_info;
create policy artist_publishing_info_admin_write on public.artist_publishing_info
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists releases_select on public.releases;
create policy releases_select on public.releases
for select
using (public.is_admin() or public.can_access_release(id));

drop policy if exists releases_admin_write on public.releases;
create policy releases_admin_write on public.releases
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists tracks_select on public.tracks;
create policy tracks_select on public.tracks
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.releases r
    where r.id = tracks.release_id
      and public.can_access_release(r.id)
      and tracks.is_active = true
  )
);

drop policy if exists tracks_admin_write on public.tracks;
create policy tracks_admin_write on public.tracks
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists release_collaborators_select on public.release_collaborators;
create policy release_collaborators_select on public.release_collaborators
for select
using (public.is_admin() or public.can_access_release(release_id));

drop policy if exists release_collaborators_admin_write on public.release_collaborators;
create policy release_collaborators_admin_write on public.release_collaborators
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
for select
using (true);

drop policy if exists channels_admin_write on public.channels;
create policy channels_admin_write on public.channels
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists csv_uploads_select on public.csv_uploads;
create policy csv_uploads_select on public.csv_uploads
for select
using (public.is_admin());

drop policy if exists earnings_select on public.earnings;
create policy earnings_select on public.earnings
for select
using (
  public.is_admin()
  or (
    public.can_access_artist(artist_id)
    and earning_type in ('original', 'adjustment')
  )
);

drop policy if exists transaction_ledger_select on public.transaction_ledger;
create policy transaction_ledger_select on public.transaction_ledger
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists dues_select on public.dues;
create policy dues_select on public.dues
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists dues_admin_write on public.dues;
create policy dues_admin_write on public.dues
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists publishing_select on public.publishing_earnings;
create policy publishing_select on public.publishing_earnings
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists publishing_admin_write on public.publishing_earnings;
create policy publishing_admin_write on public.publishing_earnings
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists payouts_select on public.payout_requests;
create policy payouts_select on public.payout_requests
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists payouts_insert on public.payout_requests;
create policy payouts_insert on public.payout_requests
for insert
with check (
  public.can_access_artist(artist_id)
  and requested_by = auth.uid()
  and status = 'pending'
);

drop policy if exists payouts_update on public.payout_requests;
create policy payouts_update on public.payout_requests
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists analytics_select on public.analytics_snapshots;
create policy analytics_select on public.analytics_snapshots
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists analytics_admin_write on public.analytics_snapshots;
create policy analytics_admin_write on public.analytics_snapshots
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
for update
using (public.is_admin() or public.can_access_artist(artist_id))
with check (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists statement_periods_select on public.statement_periods;
create policy statement_periods_select on public.statement_periods
for select
using (public.is_admin() or public.can_access_artist(artist_id));

drop policy if exists statement_periods_admin_write on public.statement_periods;
create policy statement_periods_admin_write on public.statement_periods
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_activity_log_select on public.admin_activity_log;
create policy admin_activity_log_select on public.admin_activity_log
for select
using (public.is_admin());

alter table public.profiles force row level security;
alter table public.artists force row level security;
alter table public.artist_bank_details force row level security;
alter table public.artist_publishing_info force row level security;
alter table public.releases force row level security;
alter table public.tracks force row level security;
alter table public.release_collaborators force row level security;
alter table public.channels force row level security;
alter table public.csv_uploads force row level security;
alter table public.earnings force row level security;
alter table public.transaction_ledger force row level security;
alter table public.dues force row level security;
alter table public.publishing_earnings force row level security;
alter table public.payout_requests force row level security;
alter table public.analytics_snapshots force row level security;
alter table public.notifications force row level security;
alter table public.statement_periods force row level security;
alter table public.admin_activity_log force row level security;
