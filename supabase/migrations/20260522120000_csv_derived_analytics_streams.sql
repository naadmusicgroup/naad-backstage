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
      'ledger_entry_id', ledger_entry_id,
      'notification_id', notification_id
    )
  );

  return jsonb_build_object(
    'uploadId', upload_row.id,
    'status', 'completed',
    'rowsInserted', inserted_rows,
    'totalAmount', matched_total::text,
    'ledgerEntryId', ledger_entry_id
  );
end;
$$;

revoke all on function public.commit_csv_upload(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commit_csv_upload(uuid, uuid, jsonb) to service_role;

create or replace function public.delete_csv_upload(
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
  resulting_balance numeric(19,8) := 0;
  upload_effect_total numeric(19,8) := 0;
  deleted_earnings integer := 0;
  deleted_ledger integer := 0;
  deleted_notifications integer := 0;
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

  select *
  into locked_artist
  from public.artists
  where id = upload_row.artist_id
  for update;

  if not found then
    raise exception 'The selected artist does not exist.';
  end if;

  select coalesce(available_balance, 0)
  into current_balance
  from public.artist_wallet
  where artist_id = upload_row.artist_id;

  select coalesce(sum(total_amount), 0)::numeric(19,8)
  into upload_effect_total
  from public.earnings
  where upload_id = upload_row.id
    and earning_type = 'original';

  delete from public.notifications
  where reference_id = upload_row.id
    and type = 'earnings_posted';

  get diagnostics deleted_notifications = row_count;

  delete from public.earnings
  where upload_id = upload_row.id;

  get diagnostics deleted_earnings = row_count;

  delete from public.transaction_ledger
  where reference_id = upload_row.id
    and type in ('csv_import', 'csv_reversal');

  get diagnostics deleted_ledger = row_count;

  delete from public.csv_uploads
  where id = upload_row.id;

  perform public.recalculate_artist_ledger_balances(upload_row.artist_id);

  select coalesce(available_balance, 0)
  into resulting_balance
  from public.artist_wallet
  where artist_id = upload_row.artist_id;

  insert into public.admin_activity_log (
    admin_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    actor_admin_id,
    'csv.deleted',
    'csv_upload',
    upload_row.id,
    jsonb_build_object(
      'artist_id', upload_row.artist_id,
      'status', upload_row.status,
      'period_month', upload_row.period_month,
      'total_amount', upload_effect_total::text,
      'current_balance', current_balance::text,
      'resulting_balance', resulting_balance::text,
      'earnings_rows_deleted', deleted_earnings,
      'ledger_rows_deleted', deleted_ledger,
      'notifications_deleted', deleted_notifications
    )
  );

  return jsonb_build_object(
    'uploadId', upload_row.id,
    'status', 'deleted',
    'totalAmount', upload_effect_total::text,
    'currentBalance', current_balance::text,
    'resultingBalance', resulting_balance::text,
    'earningsRowsDeleted', deleted_earnings,
    'ledgerRowsDeleted', deleted_ledger,
    'notificationsDeleted', deleted_notifications
  );
end;
$$;

revoke all on function public.delete_csv_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_csv_upload(uuid, uuid) to service_role;

create or replace function public.replace_csv_upload(
  old_upload_id uuid,
  new_upload_id uuid,
  actor_admin_id uuid,
  analytics_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  old_upload public.csv_uploads%rowtype;
  new_upload public.csv_uploads%rowtype;
  locked_artist public.artists%rowtype;
  period_row public.statement_periods%rowtype;
  current_balance numeric(19,8) := 0;
  matched_total numeric(19,8) := 0;
  new_balance numeric(19,8) := 0;
  old_upload_total numeric(19,8) := 0;
  inserted_rows integer := 0;
  old_deleted_earnings integer := 0;
  old_deleted_ledger integer := 0;
  old_deleted_notifications integer := 0;
  ledger_entry_id uuid;
  notification_id uuid;
  matched_rows jsonb;
begin
  if old_upload_id is null or new_upload_id is null then
    raise exception 'Both old and new upload ids are required.';
  end if;

  if old_upload_id = new_upload_id then
    raise exception 'Replacement upload must be different from the old upload.';
  end if;

  if actor_admin_id is null then
    raise exception 'Admin id is required.';
  end if;

  select *
  into old_upload
  from public.csv_uploads
  where id = old_upload_id
  for update;

  if not found then
    raise exception 'The upload being replaced could not be found.';
  end if;

  if old_upload.status <> 'completed' then
    raise exception 'Only completed uploads can be replaced.';
  end if;

  select *
  into new_upload
  from public.csv_uploads
  where id = new_upload_id
  for update;

  if not found then
    raise exception 'The replacement upload could not be found.';
  end if;

  if new_upload.status <> 'processing' then
    raise exception 'The replacement upload must be previewed and still processing.';
  end if;

  if new_upload.parsed_data is null then
    raise exception 'Replacement preview data is missing. Run preview before commit.';
  end if;

  if old_upload.artist_id <> new_upload.artist_id then
    raise exception 'Replacement upload must belong to the same artist.';
  end if;

  if old_upload.period_month <> new_upload.period_month then
    raise exception 'Replacement upload must use the same statement month.';
  end if;

  matched_rows := coalesce(new_upload.parsed_data -> 'matchedRows', '[]'::jsonb);

  if coalesce((new_upload.parsed_data -> 'summary' ->> 'matchedCount')::integer, jsonb_array_length(matched_rows)) <= 0 then
    raise exception 'Replacement upload has no matched rows to ingest.';
  end if;

  if coalesce((new_upload.parsed_data -> 'summary' ->> 'unmatchedCount')::integer, 0) > 0 then
    raise exception 'Replacement upload still has unmatched ISRC rows. Fix the catalog first.';
  end if;

  select *
  into locked_artist
  from public.artists
  where id = old_upload.artist_id
    and is_active = true
  for update;

  if not found then
    raise exception 'The selected artist does not exist or is inactive.';
  end if;

  select *
  into period_row
  from public.statement_periods
  where artist_id = old_upload.artist_id
    and period_month = old_upload.period_month
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
      old_upload.artist_id,
      old_upload.period_month,
      'open'
    )
    returning *
    into period_row;
  end if;

  select coalesce(available_balance, 0)
  into current_balance
  from public.artist_wallet
  where artist_id = old_upload.artist_id;

  select coalesce(sum(total_amount), 0)::numeric(19,8)
  into old_upload_total
  from public.earnings
  where upload_id = old_upload.id
    and earning_type = 'original';

  delete from public.notifications
  where reference_id = old_upload.id
    and type = 'earnings_posted';

  get diagnostics old_deleted_notifications = row_count;

  delete from public.earnings
  where upload_id = old_upload.id;

  get diagnostics old_deleted_earnings = row_count;

  delete from public.transaction_ledger
  where reference_id = old_upload.id
    and type in ('csv_import', 'csv_reversal');

  get diagnostics old_deleted_ledger = row_count;

  delete from public.csv_uploads
  where id = old_upload.id;

  perform public.recalculate_artist_ledger_balances(old_upload.artist_id);

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
    new_upload.artist_id,
    rows."trackId"::uuid,
    rows."releaseId"::uuid,
    rows."channelId"::uuid,
    new_upload.id,
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
    raise exception 'Replacement upload has no matched rows to ingest.';
  end if;

  select coalesce(sum(total_amount), 0)::numeric(19,8)
  into matched_total
  from public.earnings
  where upload_id = new_upload.id
    and earning_type = 'original';

  select balance_after
  into current_balance
  from public.transaction_ledger
  where artist_id = new_upload.artist_id
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
    new_upload.artist_id,
    'csv_import',
    new_upload.id,
    matched_total,
    new_balance,
    format('Replacement earnings received for %s', to_char(new_upload.period_month, 'FMMonth YYYY')),
    new_upload.period_month,
    format('csv_import:%s', new_upload.id)
  )
  returning id
  into ledger_entry_id;

  insert into public.notifications (
    artist_id,
    title,
    message,
    type,
    reference_id
  )
  values (
    new_upload.artist_id,
    'Earnings received',
    format('Replacement earnings were posted for %s.', to_char(new_upload.period_month, 'FMMonth YYYY')),
    'earnings_posted',
    new_upload.id
  )
  returning id
  into notification_id;

  update public.csv_uploads
  set
    status = 'completed',
    error_message = null,
    parsed_data = null
  where id = new_upload.id;

  insert into public.admin_activity_log (
    admin_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    actor_admin_id,
    'csv.replaced',
    'csv_upload',
    new_upload.id,
    jsonb_build_object(
      'artist_id', new_upload.artist_id,
      'old_upload_id', old_upload.id,
      'old_filename', old_upload.filename,
      'old_file_url', old_upload.file_url,
      'old_total_amount', old_upload_total::text,
      'old_earnings_rows_deleted', old_deleted_earnings,
      'old_ledger_rows_deleted', old_deleted_ledger,
      'old_notifications_deleted', old_deleted_notifications,
      'new_upload_id', new_upload.id,
      'new_filename', new_upload.filename,
      'new_total_amount', matched_total::text,
      'rows_inserted', inserted_rows,
      'period_month', new_upload.period_month,
      'ledger_entry_id', ledger_entry_id,
      'notification_id', notification_id
    )
  );

  return jsonb_build_object(
    'oldUploadId', old_upload.id,
    'oldFileUrl', old_upload.file_url,
    'uploadId', new_upload.id,
    'status', 'completed',
    'rowsInserted', inserted_rows,
    'totalAmount', matched_total::text,
    'oldTotalAmount', old_upload_total::text,
    'oldEarningsRowsDeleted', old_deleted_earnings,
    'oldLedgerRowsDeleted', old_deleted_ledger,
    'oldNotificationsDeleted', old_deleted_notifications,
    'ledgerEntryId', ledger_entry_id
  );
end;
$$;

revoke all on function public.replace_csv_upload(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_csv_upload(uuid, uuid, uuid, jsonb) to service_role;
