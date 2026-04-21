create or replace view public.monthly_earnings_summary as
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
