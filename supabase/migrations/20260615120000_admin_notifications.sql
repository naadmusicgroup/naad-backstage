-- Admin-facing notification feed.
--
-- Unlike public.notifications (one row per artist, per-artist read state), admin
-- notifications are shared: a single row represents one platform event and its
-- read state is global. The first admin to view the feed marks every unread row
-- read for all admins. All access is server-side via the service role, so RLS is
-- enabled with no policies (deny-by-default for the anon/authenticated roles).

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text,
  artist_id uuid references public.artists(id) on delete set null,
  reference_id uuid,
  action_path text,
  is_read boolean not null default false,
  read_at timestamptz,
  read_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_notifications_created_at_idx
  on public.admin_notifications (created_at desc);

create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (is_read)
  where is_read = false;

create index if not exists admin_notifications_artist_id_idx
  on public.admin_notifications (artist_id);

drop trigger if exists admin_notifications_set_updated_at on public.admin_notifications;
create trigger admin_notifications_set_updated_at
  before update on public.admin_notifications
  for each row
  execute function public.set_updated_at();

alter table public.admin_notifications enable row level security;
