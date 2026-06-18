create or replace function public.get_artist_ingestable_track_candidates(
  target_artist_id uuid,
  target_isrcs text[],
  target_period_month date
)
returns table (
  track_id uuid,
  release_id uuid,
  track_artist_id uuid,
  release_artist_id uuid,
  isrc text,
  normalized_isrc text,
  track_title text,
  track_status text,
  track_is_active boolean,
  release_title text,
  release_upc text,
  normalized_upc text,
  release_status text,
  release_is_active boolean,
  catalog_access text,
  split_version_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  with normalized_input as materialized (
    select distinct upper(btrim(value)) as normalized_isrc
    from unnest(coalesce(target_isrcs, array[]::text[])) as value
    where btrim(coalesce(value, '')) <> ''
  ),
  candidate_tracks as materialized (
    select
      track.id as track_id,
      track.release_id,
      track.artist_id as track_artist_id,
      release.artist_id as release_artist_id,
      track.isrc,
      upper(btrim(track.isrc)) as normalized_isrc,
      track.title as track_title,
      track.status as track_status,
      track.is_active as track_is_active,
      release.title as release_title,
      release.upc as release_upc,
      nullif(upper(btrim(coalesce(release.upc, ''))), '') as normalized_upc,
      release.status as release_status,
      release.is_active as release_is_active
    from public.tracks as track
    join public.releases as release
      on release.id = track.release_id
    join normalized_input as input
      on input.normalized_isrc = upper(btrim(track.isrc))
    where target_artist_id is not null
      and target_period_month is not null
  )
  select
    candidate.track_id,
    candidate.release_id,
    candidate.track_artist_id,
    candidate.release_artist_id,
    candidate.isrc,
    candidate.normalized_isrc,
    candidate.track_title,
    candidate.track_status,
    candidate.track_is_active,
    candidate.release_title,
    candidate.release_upc,
    candidate.normalized_upc,
    candidate.release_status,
    candidate.release_is_active,
    case
      when candidate.track_artist_id = target_artist_id
        or candidate.release_artist_id = target_artist_id then 'owner'
      when track_access.has_access then 'track_split'
      when track_version.version_id is null and release_access.has_access then 'release_split'
      else null
    end as catalog_access,
    case
      when track_access.has_access then track_version.version_id
      when track_version.version_id is null and release_access.has_access then release_version.version_id
      else null
    end as split_version_id
  from candidate_tracks as candidate
  left join lateral (
    select version.id as version_id
    from public.track_split_versions as version
    where version.track_id = candidate.track_id
      and version.effective_period_month <= date_trunc('month', target_period_month)::date
    order by version.effective_period_month desc, version.created_at desc, version.id desc
    limit 1
  ) as track_version on true
  left join lateral (
    select true as has_access
    from public.track_split_version_entries as entry
    where entry.version_id = track_version.version_id
      and entry.artist_id = target_artist_id
    limit 1
  ) as track_access on true
  left join lateral (
    select version.id as version_id
    from public.release_split_versions as version
    where version.release_id = candidate.release_id
      and version.effective_period_month <= date_trunc('month', target_period_month)::date
    order by version.effective_period_month desc, version.created_at desc, version.id desc
    limit 1
  ) as release_version on true
  left join lateral (
    select true as has_access
    from public.release_split_version_entries as entry
    where entry.version_id = release_version.version_id
      and entry.artist_id = target_artist_id
    limit 1
  ) as release_access on true
  where candidate.track_artist_id = target_artist_id
     or candidate.release_artist_id = target_artist_id
     or track_access.has_access
     or (track_version.version_id is null and release_access.has_access);
$$;

revoke all on function public.get_artist_ingestable_track_candidates(uuid, text[], date) from public, anon, authenticated;
grant execute on function public.get_artist_ingestable_track_candidates(uuid, text[], date) to service_role;

create or replace function public.assert_csv_upload_matches_ingestable(
  target_artist_id uuid,
  target_period_month date,
  matched_rows jsonb
)
returns void
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  invalid_count integer := 0;
begin
  with matched as (
    select
      rows."csvRowNumber" as csv_row_number,
      nullif(upper(btrim(coalesce(rows.isrc, ''))), '') as normalized_isrc,
      nullif(upper(btrim(coalesce(rows.upc, ''))), '') as normalized_upc,
      nullif(rows."trackId", '')::uuid as track_id,
      nullif(rows."releaseId", '')::uuid as release_id
    from jsonb_to_recordset(coalesce(matched_rows, '[]'::jsonb)) as rows(
      "csvRowNumber" integer,
      isrc text,
      upc text,
      "trackId" text,
      "releaseId" text
    )
  ),
  row_candidates as (
    select
      matched.csv_row_number,
      matched.normalized_isrc,
      matched.normalized_upc,
      matched.track_id,
      matched.release_id,
      candidate.track_id as candidate_track_id,
      candidate.release_id as candidate_release_id,
      candidate.normalized_upc as candidate_normalized_upc,
      (
        coalesce(candidate.track_status, 'live') <> 'deleted'
        and coalesce(candidate.track_is_active, true) <> false
        and coalesce(candidate.release_status, 'live') <> 'deleted'
        and coalesce(candidate.release_is_active, true) <> false
      ) as is_active_candidate
    from matched
    left join lateral public.get_artist_ingestable_track_candidates(
      target_artist_id,
      array[matched.normalized_isrc],
      target_period_month
    ) as candidate on matched.normalized_isrc is not null
  ),
  row_counts as (
    select
      row_candidates.csv_row_number,
      row_candidates.normalized_isrc,
      row_candidates.normalized_upc,
      row_candidates.track_id,
      row_candidates.release_id,
      count(*) filter (
        where row_candidates.candidate_track_id is not null
          and row_candidates.is_active_candidate
      ) as active_candidate_count,
      count(*) filter (
        where row_candidates.candidate_track_id is not null
          and row_candidates.is_active_candidate
          and row_candidates.normalized_upc is not null
          and row_candidates.candidate_normalized_upc = row_candidates.normalized_upc
      ) as active_upc_candidate_count,
      count(*) filter (
        where row_candidates.candidate_track_id = row_candidates.track_id
          and row_candidates.candidate_release_id = row_candidates.release_id
          and row_candidates.is_active_candidate
          and (
            row_candidates.normalized_upc is null
            or row_candidates.candidate_normalized_upc = row_candidates.normalized_upc
          )
      ) as selected_candidate_count
    from row_candidates
    group by
      row_candidates.csv_row_number,
      row_candidates.normalized_isrc,
      row_candidates.normalized_upc,
      row_candidates.track_id,
      row_candidates.release_id
  )
  select count(*)::integer
  into invalid_count
  from row_counts
  where normalized_isrc is null
     or track_id is null
     or release_id is null
     or selected_candidate_count <> 1
     or (
      normalized_upc is null
      and active_candidate_count <> 1
     )
     or (
      normalized_upc is not null
      and active_upc_candidate_count <> 1
     );

  if invalid_count > 0 then
    raise exception 'Matched CSV rows are no longer ingestable for the selected artist and statement month. Re-run preview before committing. Invalid rows: %', invalid_count;
  end if;
end;
$$;

revoke all on function public.assert_csv_upload_matches_ingestable(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.assert_csv_upload_matches_ingestable(uuid, date, jsonb) to service_role;

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

  perform public.assert_csv_upload_matches_ingestable(upload_row.artist_id, upload_row.period_month, matched_rows);

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

  perform public.assert_csv_upload_matches_ingestable(new_upload.artist_id, new_upload.period_month, matched_rows);

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
