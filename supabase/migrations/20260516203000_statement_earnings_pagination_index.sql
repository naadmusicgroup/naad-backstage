create index if not exists idx_csv_uploads_artist_status_period_id
  on public.csv_uploads (artist_id, status, period_month, id);
