create index if not exists idx_monthly_earnings_summary_cache_upload_id
  on public.monthly_earnings_summary_cache (upload_id);

create index if not exists idx_monthly_earnings_summary_cache_channel_id
  on public.monthly_earnings_summary_cache (channel_id);

create index if not exists idx_monthly_earnings_summary_cache_release_id
  on public.monthly_earnings_summary_cache (release_id);

create index if not exists idx_monthly_earnings_summary_cache_track_id
  on public.monthly_earnings_summary_cache (track_id);
