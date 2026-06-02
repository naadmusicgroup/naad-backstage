create table if not exists public.monthly_earnings_summary_cache (
  artist_id uuid not null references public.artists (id) on delete restrict,
  month date not null,
  upload_id uuid not null references public.csv_uploads (id) on delete cascade,
  channel_id uuid references public.channels (id) on delete restrict,
  territory text,
  release_id uuid references public.releases (id) on delete restrict,
  track_id uuid references public.tracks (id) on delete restrict,
  revenue numeric(19,8) not null default 0,
  streams bigint not null default 0,
  row_count bigint not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_monthly_earnings_summary_cache_unique
  on public.monthly_earnings_summary_cache (
    artist_id,
    month,
    upload_id,
    channel_id,
    territory,
    release_id,
    track_id
  ) nulls not distinct;

create index if not exists idx_monthly_earnings_summary_cache_artist_month
  on public.monthly_earnings_summary_cache (artist_id, month);

create index if not exists idx_monthly_earnings_summary_cache_month
  on public.monthly_earnings_summary_cache (month, artist_id);

alter table public.monthly_earnings_summary_cache enable row level security;

drop policy if exists monthly_earnings_summary_cache_select on public.monthly_earnings_summary_cache;
create policy monthly_earnings_summary_cache_select on public.monthly_earnings_summary_cache
for select
using (public.is_admin() or public.can_access_artist(artist_id));

alter table public.monthly_earnings_summary_cache force row level security;

grant select on public.monthly_earnings_summary_cache to authenticated, service_role;

create or replace function public.refresh_monthly_earnings_summary_for_artist_month(
  target_artist_id uuid,
  target_month date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_month date;
  deleted_rows integer := 0;
  inserted_rows integer := 0;
begin
  if target_artist_id is null then
    raise exception 'Artist id is required.';
  end if;

  if target_month is null then
    raise exception 'Statement month is required.';
  end if;

  normalized_month := date_trunc('month', target_month)::date;

  delete from public.monthly_earnings_summary_cache
  where artist_id = target_artist_id
    and month = normalized_month;

  get diagnostics deleted_rows = row_count;

  insert into public.monthly_earnings_summary_cache (
    artist_id,
    month,
    upload_id,
    channel_id,
    territory,
    release_id,
    track_id,
    revenue,
    streams,
    row_count,
    updated_at
  )
  select
    earning.artist_id,
    upload.period_month,
    earning.upload_id,
    earning.channel_id,
    earning.territory,
    earning.release_id,
    earning.track_id,
    coalesce(sum(earning.total_amount), 0)::numeric(19,8),
    coalesce(sum(earning.units), 0)::bigint,
    count(*)::bigint,
    now()
  from public.earnings as earning
  inner join public.csv_uploads as upload
    on upload.id = earning.upload_id
  where earning.artist_id = target_artist_id
    and upload.period_month = normalized_month
    and upload.status = 'completed'
    and earning.earning_type = 'original'
  group by
    earning.artist_id,
    upload.period_month,
    earning.upload_id,
    earning.channel_id,
    earning.territory,
    earning.release_id,
    earning.track_id;

  get diagnostics inserted_rows = row_count;

  return jsonb_build_object(
    'artistId', target_artist_id,
    'month', normalized_month,
    'deletedRows', deleted_rows,
    'insertedRows', inserted_rows
  );
end;
$$;

revoke all on function public.refresh_monthly_earnings_summary_for_artist_month(uuid, date)
  from public, anon, authenticated;
grant execute on function public.refresh_monthly_earnings_summary_for_artist_month(uuid, date)
  to service_role;

create or replace function public.rebuild_monthly_earnings_summary_cache()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_rows integer := 0;
  completed_uploads integer := 0;
  original_earning_rows integer := 0;
begin
  select count(*)::integer
  into completed_uploads
  from public.csv_uploads
  where status = 'completed';

  select count(*)::integer
  into original_earning_rows
  from public.earnings
  where earning_type = 'original';

  truncate table public.monthly_earnings_summary_cache;

  insert into public.monthly_earnings_summary_cache (
    artist_id,
    month,
    upload_id,
    channel_id,
    territory,
    release_id,
    track_id,
    revenue,
    streams,
    row_count,
    updated_at
  )
  select
    earning.artist_id,
    upload.period_month,
    earning.upload_id,
    earning.channel_id,
    earning.territory,
    earning.release_id,
    earning.track_id,
    coalesce(sum(earning.total_amount), 0)::numeric(19,8),
    coalesce(sum(earning.units), 0)::bigint,
    count(*)::bigint,
    now()
  from public.earnings as earning
  inner join public.csv_uploads as upload
    on upload.id = earning.upload_id
  where upload.status = 'completed'
    and earning.earning_type = 'original'
  group by
    earning.artist_id,
    upload.period_month,
    earning.upload_id,
    earning.channel_id,
    earning.territory,
    earning.release_id,
    earning.track_id;

  get diagnostics inserted_rows = row_count;

  return jsonb_build_object(
    'summaryRowsInserted', inserted_rows,
    'completedUploads', completed_uploads,
    'originalEarningRows', original_earning_rows
  );
end;
$$;

revoke all on function public.rebuild_monthly_earnings_summary_cache()
  from public, anon, authenticated;
grant execute on function public.rebuild_monthly_earnings_summary_cache()
  to service_role;

create or replace function public.refresh_monthly_earnings_summary_after_upload_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_monthly_earnings_summary_for_artist_month(old.artist_id, old.period_month);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.artist_id is distinct from new.artist_id
      or old.period_month is distinct from new.period_month then
      perform public.refresh_monthly_earnings_summary_for_artist_month(old.artist_id, old.period_month);
      perform public.refresh_monthly_earnings_summary_for_artist_month(new.artist_id, new.period_month);
      return new;
    end if;

    if old.status is distinct from new.status
      and (old.status = 'completed' or new.status = 'completed' or old.status = 'reversed' or new.status = 'reversed') then
      perform public.refresh_monthly_earnings_summary_for_artist_month(new.artist_id, new.period_month);
    end if;

    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.refresh_monthly_earnings_summary_after_upload_change()
  from public, anon, authenticated;

drop trigger if exists csv_uploads_refresh_monthly_earnings_summary on public.csv_uploads;
create trigger csv_uploads_refresh_monthly_earnings_summary
after update of artist_id, period_month, status or delete on public.csv_uploads
for each row
execute function public.refresh_monthly_earnings_summary_after_upload_change();

create or replace view public.monthly_earnings_summary
with (security_invoker = true)
as
select
  summary.artist_id,
  summary.month,
  summary.channel_id,
  summary.territory,
  summary.release_id,
  summary.track_id,
  coalesce(sum(summary.revenue), 0)::numeric as revenue,
  coalesce(sum(summary.streams), 0)::bigint as streams,
  coalesce(sum(summary.row_count), 0)::bigint as row_count
from public.monthly_earnings_summary_cache as summary
group by
  summary.artist_id,
  summary.month,
  summary.channel_id,
  summary.territory,
  summary.release_id,
  summary.track_id;

grant select on public.monthly_earnings_summary to authenticated, service_role;

create or replace function public.get_admin_analytics_revenue_rows(
  target_period_start_month date default null,
  target_period_end_month date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with revenue_rows as (
    select
      summary.artist_id,
      coalesce(nullif(btrim(artist.name), ''), 'Unknown artist') as artist_name,
      summary.month,
      summary.channel_id,
      case
        when summary.channel_id is null then 'Unassigned channel'
        else coalesce(nullif(btrim(channel.display_name), ''), nullif(btrim(channel.raw_name), ''), 'Unknown channel')
      end as channel_name,
      nullif(btrim(summary.territory), '') as territory,
      summary.release_id,
      coalesce(nullif(btrim(release.title), ''), 'Unknown release') as release_title,
      release.cover_art_url as release_cover_art_url,
      release.cover_thumb_url as release_cover_thumb_url,
      summary.track_id,
      coalesce(nullif(btrim(track.title), ''), 'Unknown track') as track_title,
      nullif(btrim(track.isrc), '') as track_isrc,
      summary.upload_id,
      upload.filename as upload_filename,
      coalesce(summary.revenue, 0)::numeric as revenue,
      coalesce(summary.streams, 0)::bigint as streams,
      coalesce(summary.row_count, 0)::bigint as row_count
    from public.monthly_earnings_summary_cache as summary
    left join public.artists as artist
      on artist.id = summary.artist_id
    left join public.channels as channel
      on channel.id = summary.channel_id
    left join public.releases as release
      on release.id = summary.release_id
    left join public.tracks as track
      on track.id = summary.track_id
    left join public.csv_uploads as upload
      on upload.id = summary.upload_id
    where (target_period_start_month is null or summary.month >= target_period_start_month)
      and (target_period_end_month is null or summary.month <= target_period_end_month)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'artist_id', revenue_rows.artist_id,
        'artist_name', revenue_rows.artist_name,
        'month', revenue_rows.month,
        'channel_id', revenue_rows.channel_id,
        'channel_name', revenue_rows.channel_name,
        'territory', revenue_rows.territory,
        'release_id', revenue_rows.release_id,
        'release_title', revenue_rows.release_title,
        'release_cover_art_url', revenue_rows.release_cover_art_url,
        'release_cover_thumb_url', revenue_rows.release_cover_thumb_url,
        'track_id', revenue_rows.track_id,
        'track_title', revenue_rows.track_title,
        'track_isrc', revenue_rows.track_isrc,
        'upload_id', revenue_rows.upload_id,
        'upload_filename', revenue_rows.upload_filename,
        'revenue', revenue_rows.revenue::text,
        'streams', revenue_rows.streams,
        'row_count', revenue_rows.row_count
      )
      order by
        revenue_rows.artist_name asc,
        revenue_rows.month asc,
        revenue_rows.channel_name asc,
        revenue_rows.territory asc nulls first,
        revenue_rows.release_title asc,
        revenue_rows.track_title asc,
        revenue_rows.upload_filename asc nulls first
    ),
    '[]'::jsonb
  )
  from revenue_rows;
$$;

revoke all on function public.get_admin_analytics_revenue_rows(date, date)
  from public, anon, authenticated;
grant execute on function public.get_admin_analytics_revenue_rows(date, date)
  to service_role;
