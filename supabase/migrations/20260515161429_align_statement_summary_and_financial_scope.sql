create or replace view public.monthly_earnings_summary
with (security_invoker = true)
as
select
  e.artist_id,
  u.period_month as month,
  e.channel_id,
  e.territory,
  e.release_id,
  e.track_id,
  sum(e.total_amount) as revenue,
  sum(e.units) as streams,
  count(*) as row_count
from public.earnings e
join public.csv_uploads u
  on u.id = e.upload_id
group by e.artist_id, u.period_month, e.channel_id, e.territory, e.release_id, e.track_id;

alter view public.monthly_earnings_summary set (security_invoker = true);

create index if not exists idx_csv_uploads_artist_period_id
  on public.csv_uploads (artist_id, period_month, id);

create index if not exists idx_earnings_statement_rollup
  on public.earnings (artist_id, upload_id, earning_type, channel_id, territory, release_id, track_id)
  include (total_amount, units);
