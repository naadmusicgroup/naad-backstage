create or replace function public.commit_csv_upload(
  target_upload_id uuid,
  actor_admin_id uuid,
  analytics_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  upload_row public.csv_uploads%rowtype;
  locked_artist public.artists%rowtype;
  period_row public.statement_periods%rowtype;
  current_balance numeric(19,8) := 0;
  matched_total numeric(19,8) := 0;
  new_balance numeric(19,8) := 0;
  inserted_rows integer := 0;
  analytics_rows integer := 0;
  ledger_entry_id uuid;
  notification_id uuid;
  matched_rows jsonb;
begin
  if target_upload_id is null then
    raise exception 'Upload id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  select *
  into upload_row
  from public.csv_uploads
  where id = target_upload_id
  for update;

  if not found then
    raise exception 'That upload could not be found.';
  end if;

  if upload_row.status = 'completed' then
    raise exception 'This upload has already been committed.';
  end if;

  if upload_row.status in ('failed', 'reversed', 'abandoned') then
    raise exception 'This upload cannot be committed in its current state (%).', upload_row.status;
  end if;

  if upload_row.parsed_data is null then
    raise exception 'Preview data is missing for this upload. Run preview again before commit.';
  end if;

  matched_rows := coalesce(upload_row.parsed_data -> 'matchedRows', '[]'::jsonb);

  if coalesce((upload_row.parsed_data -> 'summary' ->> 'matchedCount')::integer, jsonb_array_length(matched_rows)) <= 0 then
    raise exception 'This upload has no matched rows to ingest.';
  end if;

  if coalesce((upload_row.parsed_data -> 'summary' ->> 'unmatchedCount')::integer, 0) > 0 then
    raise exception 'This upload still has unmatched ISRC rows. Fix the catalog first.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = upload_row.artist_id
  for update;

  if not found or not locked_artist.is_active then
    raise exception 'The selected artist does not exist or is inactive.';
  end if;

  select *
  into period_row
  from public.statement_periods
  where artist_id = upload_row.artist_id
    and period_month = upload_row.period_month
  for update;

  if found and period_row.status = 'closed' then
    raise exception 'Period is closed for this month.';
  end if;

  if not found then
    insert into public.statement_periods (
      artist_id,
      period_month,
      status
    )
    values (
      upload_row.artist_id,
      upload_row.period_month,
      'open'
    )
    returning *
    into period_row;
  end if;

  insert into public.earnings (
    artist_id,
    track_id,
    release_id,
    channel_id,
    upload_id,
    sale_date,
    accounting_date,
    reporting_date,
    territory,
    units,
    unit_price,
    original_currency,
    total_amount,
    earning_type,
    csv_row_number
  )
  select
    upload_row.artist_id,
    rows."trackId"::uuid,
    rows."releaseId"::uuid,
    rows."channelId"::uuid,
    upload_row.id,
    rows."saleDate"::date,
    rows."accountingDate"::date,
    nullif(rows."reportingDate", '')::date,
    nullif(rows.territory, ''),
    rows.units,
    rows."unitPrice"::numeric(19,8),
    nullif(rows."originalCurrency", ''),
    rows."totalAmount"::numeric(19,8),
    'original',
    rows."csvRowNumber"
  from jsonb_to_recordset(matched_rows) as rows(
    "csvRowNumber" integer,
    "saleDate" text,
    "accountingDate" text,
    "reportingDate" text,
    territory text,
    units integer,
    "unitPrice" text,
    "originalCurrency" text,
    "totalAmount" text,
    "channelId" text,
    "trackId" text,
    "releaseId" text
  );

  get diagnostics inserted_rows = row_count;

  if inserted_rows = 0 then
    raise exception 'This upload has no matched rows to ingest.';
  end if;

  select coalesce(sum(total_amount), 0)::numeric(19,8)
  into matched_total
  from public.earnings
  where upload_id = upload_row.id
    and earning_type = 'original';

  select balance_after
  into current_balance
  from public.transaction_ledger
  where artist_id = upload_row.artist_id
  order by created_at desc, id desc
  limit 1;

  current_balance := coalesce(current_balance, 0);
  new_balance := current_balance + matched_total;

  insert into public.transaction_ledger (
    artist_id,
    type,
    reference_id,
    amount,
    balance_after,
    description,
    period_month,
    idempotency_key
  )
  values (
    upload_row.artist_id,
    'csv_import',
    upload_row.id,
    matched_total,
    new_balance,
    format('Earnings received for %s', to_char(upload_row.period_month, 'FMMonth YYYY')),
    upload_row.period_month,
    format('csv_import:%s', upload_row.id)
  )
  returning id
  into ledger_entry_id;

  insert into public.analytics_snapshots (
    artist_id,
    release_id,
    platform,
    metric_type,
    value,
    period_month,
    entered_by
  )
  select
    upload_row.artist_id,
    null,
    metric.platform,
    metric.metric_type,
    metric.metric_value,
    upload_row.period_month,
    actor_admin_id
  from (
    values
      ('spotify'::text, 'monthly_listeners'::text, nullif(analytics_payload ->> 'spotifyMonthlyListeners', '')::bigint),
      ('apple_music'::text, 'streams'::text, nullif(analytics_payload ->> 'appleMusicPlays', '')::bigint),
      ('tiktok'::text, 'video_creations'::text, nullif(analytics_payload ->> 'tikTokVideoCreations', '')::bigint),
      ('meta'::text, 'impressions'::text, nullif(analytics_payload ->> 'metaImpressions', '')::bigint),
      ('youtube'::text, 'views'::text, nullif(analytics_payload ->> 'youtubeViews', '')::bigint)
  ) as metric(platform, metric_type, metric_value)
  where metric.metric_value is not null
    and metric.metric_value >= 0;

  get diagnostics analytics_rows = row_count;

  insert into public.notifications (
    artist_id,
    title,
    message,
    type,
    reference_id
  )
  values (
    upload_row.artist_id,
    'Earnings received',
    format('New earnings were posted for %s.', to_char(upload_row.period_month, 'FMMonth YYYY')),
    'earnings_posted',
    upload_row.id
  )
  returning id
  into notification_id;

  update public.csv_uploads
  set
    status = 'completed',
    error_message = null,
    parsed_data = null
  where id = upload_row.id;

  insert into public.admin_activity_log (
    admin_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    actor_admin_id,
    'csv.ingested',
    'csv_upload',
    upload_row.id,
    jsonb_build_object(
      'artist_id', upload_row.artist_id,
      'rows_inserted', inserted_rows,
      'total_amount', matched_total::text,
      'period_month', upload_row.period_month,
      'analytics_rows', analytics_rows,
      'ledger_entry_id', ledger_entry_id,
      'notification_id', notification_id
    )
  );

  return jsonb_build_object(
    'uploadId', upload_row.id,
    'status', 'completed',
    'rowsInserted', inserted_rows,
    'totalAmount', matched_total::text,
    'analyticsRows', analytics_rows,
    'ledgerEntryId', ledger_entry_id
  );
end;
$$;

create or replace function public.reverse_csv_upload(
  target_upload_id uuid,
  actor_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  upload_row public.csv_uploads%rowtype;
  locked_artist public.artists%rowtype;
  current_balance numeric(19,8) := 0;
  reversal_total numeric(19,8) := 0;
  resulting_balance numeric(19,8) := 0;
  inserted_rows integer := 0;
  original_rows integer := 0;
  ledger_entry_id uuid;
begin
  if target_upload_id is null then
    raise exception 'Upload id is required.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  select *
  into upload_row
  from public.csv_uploads
  where id = target_upload_id
  for update;

  if not found then
    raise exception 'That upload could not be found.';
  end if;

  if upload_row.status <> 'completed' then
    raise exception 'Only completed uploads can be reversed.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = upload_row.artist_id
  for update;

  if not found then
    raise exception 'The selected artist does not exist.';
  end if;

  select
    count(*)::integer,
    coalesce(sum(total_amount), 0)::numeric(19,8)
  into original_rows, reversal_total
  from public.earnings
  where upload_id = upload_row.id
    and earning_type = 'original';

  if original_rows = 0 then
    raise exception 'No original earnings rows exist for this upload.';
  end if;

  select balance_after
  into current_balance
  from public.transaction_ledger
  where artist_id = upload_row.artist_id
  order by created_at desc, id desc
  limit 1;

  current_balance := coalesce(current_balance, 0);
  resulting_balance := current_balance - reversal_total;

  insert into public.earnings (
    artist_id,
    track_id,
    release_id,
    channel_id,
    upload_id,
    sale_date,
    accounting_date,
    reporting_date,
    territory,
    units,
    unit_price,
    original_currency,
    total_amount,
    earning_type,
    csv_row_number
  )
  select
    artist_id,
    track_id,
    release_id,
    channel_id,
    upload_id,
    sale_date,
    accounting_date,
    reporting_date,
    territory,
    units * -1,
    unit_price,
    original_currency,
    total_amount * -1,
    'reversal',
    csv_row_number * -1
  from public.earnings
  where upload_id = upload_row.id
    and earning_type = 'original';

  get diagnostics inserted_rows = row_count;

  insert into public.transaction_ledger (
    artist_id,
    type,
    reference_id,
    amount,
    balance_after,
    description,
    period_month,
    idempotency_key
  )
  values (
    upload_row.artist_id,
    'csv_reversal',
    upload_row.id,
    reversal_total * -1,
    resulting_balance,
    format('Upload reversed for %s', to_char(upload_row.period_month, 'FMMonth YYYY')),
    upload_row.period_month,
    format('csv_reversal:%s', upload_row.id)
  )
  returning id
  into ledger_entry_id;

  update public.csv_uploads
  set
    status = 'reversed',
    error_message = null
  where id = upload_row.id;

  insert into public.admin_activity_log (
    admin_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    actor_admin_id,
    'csv.reversed',
    'csv_upload',
    upload_row.id,
    jsonb_build_object(
      'artist_id', upload_row.artist_id,
      'rows_inserted', inserted_rows,
      'total_amount', reversal_total::text,
      'current_balance', current_balance::text,
      'resulting_balance', resulting_balance::text,
      'period_month', upload_row.period_month,
      'ledger_entry_id', ledger_entry_id
    )
  );

  return jsonb_build_object(
    'uploadId', upload_row.id,
    'status', 'reversed',
    'rowsInserted', inserted_rows,
    'totalAmount', reversal_total::text,
    'ledgerEntryId', ledger_entry_id,
    'currentBalance', current_balance::text,
    'resultingBalance', resulting_balance::text
  );
end;
$$;

grant execute on function public.commit_csv_upload(uuid, uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.reverse_csv_upload(uuid, uuid) to anon, authenticated, service_role;
