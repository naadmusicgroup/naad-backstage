create index if not exists idx_csv_uploads_admin_dashboard_recent
on public.csv_uploads (created_at desc, id);

create index if not exists idx_payout_requests_admin_dashboard_queue
on public.payout_requests (status, created_at desc, id)
where status in ('pending', 'approved');

create index if not exists idx_artist_release_submissions_admin_dashboard_pending
on public.artist_release_submissions (status, created_at desc, id);

create index if not exists idx_artist_release_submission_tracks_submission
on public.artist_release_submission_tracks (submission_id, id);

create index if not exists idx_track_credits_track_sort
on public.track_credits (track_id, sort_order, id);

create or replace function public.get_admin_dashboard_payload()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active_artist_flags as materialized (
    select
      artist.id,
      artist.name,
      artist.email,
      artist.country,
      (bank_details.artist_id is null) as missing_bank_details,
      not (
        coalesce(publishing_info.legal_name, '') <> ''
        or coalesce(publishing_info.ipi_number, '') <> ''
        or coalesce(publishing_info.pro_name, '') <> ''
      ) as missing_publishing_info
    from public.artists as artist
    left join public.artist_bank_details as bank_details
      on bank_details.artist_id = artist.id
    left join public.artist_publishing_info as publishing_info
      on publishing_info.artist_id = artist.id
    where artist.is_active = true
  ),
  upload_counts as (
    select
      count(*) filter (where status = 'completed') as completed_upload_count,
      count(*) filter (where status = 'processing') as awaiting_commit_upload_count,
      count(*) filter (where status in ('failed', 'abandoned')) as failed_upload_count
    from public.csv_uploads
  ),
  payout_totals as (
    select
      count(*) filter (where status = 'pending') as pending_payout_count,
      coalesce(sum(amount) filter (where status = 'pending'), 0) as pending_payout_amount,
      count(*) filter (where status = 'approved') as approved_payout_count,
      coalesce(sum(amount) filter (where status = 'approved'), 0) as approved_payout_amount
    from public.payout_requests
    where status in ('pending', 'approved')
  ),
  statement_counts as (
    select
      count(*) filter (where status = 'open') as open_statement_count,
      count(*) filter (where status = 'closed') as closed_statement_count
    from public.statement_periods
  ),
  summary_counts as (
    select
      (select count(*) from active_artist_flags) as active_artist_count,
      (select count(*) from public.releases where status in ('draft', 'live', 'taken_down')) as active_release_count,
      (select count(*) from public.tracks where status in ('draft', 'live')) as active_track_count,
      coalesce(upload_counts.completed_upload_count, 0) as completed_upload_count,
      coalesce(upload_counts.awaiting_commit_upload_count, 0) as awaiting_commit_upload_count,
      coalesce(upload_counts.failed_upload_count, 0) as failed_upload_count,
      coalesce(payout_totals.pending_payout_count, 0) as pending_payout_count,
      coalesce(payout_totals.pending_payout_amount, 0) as pending_payout_amount,
      coalesce(payout_totals.approved_payout_count, 0) as approved_payout_count,
      coalesce(payout_totals.approved_payout_amount, 0) as approved_payout_amount,
      coalesce(statement_counts.open_statement_count, 0) as open_statement_count,
      coalesce(statement_counts.closed_statement_count, 0) as closed_statement_count,
      (select count(*) from active_artist_flags where missing_bank_details) as artists_missing_bank_details_count,
      (select count(*) from active_artist_flags where missing_publishing_info) as artists_missing_publishing_info_count,
      (select count(*) from public.artist_release_submissions where status = 'pending_review') as pending_release_submission_count
    from upload_counts, payout_totals, statement_counts
  ),
  recent_upload_rows as materialized (
    select
      upload.id,
      upload.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      upload.filename,
      upload.status,
      upload.row_count,
      upload.matched_count,
      upload.unmatched_count,
      upload.total_amount,
      upload.period_month,
      upload.error_message,
      upload.created_at
    from public.csv_uploads as upload
    inner join public.artists as artist
      on artist.id = upload.artist_id
    order by upload.created_at desc
    limit 8
  ),
  payout_queue_rows as materialized (
    select
      request.id,
      request.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      request.requested_by,
      request.amount,
      request.status,
      request.artist_notes,
      request.admin_notes,
      request.reviewed_by,
      request.reviewed_at,
      request.paid_at,
      request.payment_method,
      request.payment_reference,
      request.created_at,
      request.updated_at,
      bank_details.account_name,
      bank_details.bank_name,
      bank_details.account_number,
      bank_details.bank_address,
      bank_details.updated_at as bank_details_updated_at
    from public.payout_requests as request
    inner join public.artists as artist
      on artist.id = request.artist_id
    left join public.artist_bank_details as bank_details
      on bank_details.artist_id = artist.id
    where request.status in ('pending', 'approved')
    order by request.created_at desc
    limit 8
  ),
  statement_period_rows as materialized (
    select
      statement_period.id,
      statement_period.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      statement_period.period_month,
      statement_period.status,
      statement_period.closed_at
    from public.statement_periods as statement_period
    inner join public.artists as artist
      on artist.id = statement_period.artist_id
    order by statement_period.period_month desc
    limit 8
  ),
  statement_period_keys as (
    select distinct artist_id, period_month
    from statement_period_rows
  ),
  statement_revenue as (
    select
      summary.artist_id,
      summary.month as period_month,
      coalesce(sum(summary.revenue), 0) as earnings
    from public.monthly_earnings_summary as summary
    inner join statement_period_keys as period_key
      on period_key.artist_id = summary.artist_id
      and period_key.period_month = summary.month
    group by summary.artist_id, summary.month
  ),
  statement_upload_counts as (
    select
      upload.artist_id,
      upload.period_month,
      count(*) as upload_count
    from public.csv_uploads as upload
    inner join statement_period_keys as period_key
      on period_key.artist_id = upload.artist_id
      and period_key.period_month = upload.period_month
    where upload.status = 'completed'
    group by upload.artist_id, upload.period_month
  ),
  statement_totals as (
    select
      coalesce(statement_revenue.artist_id, statement_upload_counts.artist_id) as artist_id,
      coalesce(statement_revenue.period_month, statement_upload_counts.period_month) as period_month,
      coalesce(statement_revenue.earnings, 0) as earnings,
      coalesce(statement_upload_counts.upload_count, 0) as upload_count
    from statement_revenue
    full join statement_upload_counts
      on statement_upload_counts.artist_id = statement_revenue.artist_id
      and statement_upload_counts.period_month = statement_revenue.period_month
  ),
  pending_submission_rows as materialized (
    select
      submission.id,
      submission.release_id,
      submission.artist_id,
      submission.status,
      submission.source_cover_art_url,
      submission.final_cover_art_url,
      submission.target_stores,
      submission.artist_notes,
      submission.admin_notes,
      submission.created_at,
      release.title,
      release.type,
      release.genre,
      release.release_date,
      release.status as release_status,
      artist.name as artist_name,
      artist.email as artist_email
    from public.artist_release_submissions as submission
    inner join public.releases as release
      on release.id = submission.release_id
    inner join public.artists as artist
      on artist.id = submission.artist_id
    where submission.status = 'pending_review'
    order by submission.created_at desc
    limit 8
  ),
  readiness_rows as materialized (
    select
      id,
      name,
      email,
      country,
      missing_bank_details,
      missing_publishing_info
    from active_artist_flags
    where missing_bank_details or missing_publishing_info
    order by
      (missing_bank_details::integer + missing_publishing_info::integer) desc,
      name asc,
      id asc
    limit 8
  ),
  activity_rows as materialized (
    select
      activity.id,
      activity.admin_id,
      admin_profile.full_name as admin_name,
      activity.action,
      activity.entity_type,
      activity.entity_id,
      activity.details,
      activity.created_at
    from public.admin_activity_log as activity
    left join public.profiles as admin_profile
      on admin_profile.id = activity.admin_id
    order by activity.created_at desc
    limit 10
  )
  select jsonb_build_object(
    'summary',
    jsonb_build_object(
      'activeArtistCount', summary_counts.active_artist_count,
      'activeReleaseCount', summary_counts.active_release_count,
      'activeTrackCount', summary_counts.active_track_count,
      'completedUploadCount', summary_counts.completed_upload_count,
      'awaitingCommitUploadCount', summary_counts.awaiting_commit_upload_count,
      'failedUploadCount', summary_counts.failed_upload_count,
      'pendingPayoutCount', summary_counts.pending_payout_count,
      'pendingPayoutAmount', to_char(summary_counts.pending_payout_amount, 'FM999999999999999999999999990.00000000'),
      'approvedPayoutCount', summary_counts.approved_payout_count,
      'approvedPayoutAmount', to_char(summary_counts.approved_payout_amount, 'FM999999999999999999999999990.00000000'),
      'openStatementCount', summary_counts.open_statement_count,
      'closedStatementCount', summary_counts.closed_statement_count,
      'artistsMissingBankDetailsCount', summary_counts.artists_missing_bank_details_count,
      'artistsMissingPublishingInfoCount', summary_counts.artists_missing_publishing_info_count,
      'pendingReleaseSubmissionCount', summary_counts.pending_release_submission_count
    ),
    'recentUploads',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', upload.id,
          'artistId', upload.artist_id,
          'artistName', upload.artist_name,
          'filename', upload.filename,
          'status', upload.status,
          'rowCount', upload.row_count,
          'matchedCount', upload.matched_count,
          'unmatchedCount', upload.unmatched_count,
          'totalAmount', case
            when upload.total_amount is null then null
            else to_char(upload.total_amount, 'FM999999999999999999999999990.00000000')
          end,
          'periodMonth', upload.period_month,
          'errorMessage', upload.error_message,
          'createdAt', upload.created_at
        )
        order by upload.created_at desc
      )
      from recent_upload_rows as upload
    ), '[]'::jsonb),
    'pendingReleases',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', submission.id,
          'releaseId', submission.release_id,
          'artistId', submission.artist_id,
          'artistName', coalesce(submission.artist_name, 'Unknown artist'),
          'artistEmail', submission.artist_email,
          'title', coalesce(submission.title, 'Untitled release'),
          'type', coalesce(submission.type, 'single'),
          'genre', coalesce(nullif(btrim(submission.genre), ''), 'Other'),
          'releaseDate', submission.release_date,
          'status', submission.status,
          'displayStatus', case
            when submission.release_status in ('live', 'taken_down', 'deleted') then submission.release_status
            when submission.status = 'pending_review' then 'pending_review'
            when submission.status = 'approved' then 'scheduled'
            when submission.status = 'rejected' then 'rejected'
            else submission.release_status
          end,
          'sourceCoverArtUrl', submission.source_cover_art_url,
          'finalCoverArtUrl', submission.final_cover_art_url,
          'targetStores', case
            when jsonb_typeof(submission.target_stores) = 'array' then coalesce((
              select jsonb_agg(store.value order by store.ordinality)
              from jsonb_array_elements_text(submission.target_stores) with ordinality as store(value, ordinality)
            ), '[]'::jsonb)
            else '[]'::jsonb
          end,
          'artistNotes', submission.artist_notes,
          'adminNotes', submission.admin_notes,
          'submittedAt', submission.created_at,
          'tracks', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', submission_track.id,
                'trackId', submission_track.track_id,
                'title', coalesce(track.title, 'Untitled track'),
                'isrc', coalesce(track.isrc, ''),
                'trackNumber', track.track_number,
                'sourceAudioUrl', submission_track.source_audio_url,
                'finalAudioUrl', submission_track.final_audio_url,
                'credits', coalesce((
                  select jsonb_agg(
                    concat(credit.credited_name, ' - ', credit.role_code)
                    order by credit.sort_order asc nulls last, credit.id asc
                  )
                  from public.track_credits as credit
                  where credit.track_id = submission_track.track_id
                ), '[]'::jsonb)
              )
              order by submission_track.id asc
            )
            from public.artist_release_submission_tracks as submission_track
            left join public.tracks as track
              on track.id = submission_track.track_id
            where submission_track.submission_id = submission.id
          ), '[]'::jsonb)
        )
        order by submission.created_at desc
      )
      from pending_submission_rows as submission
    ), '[]'::jsonb),
    'payoutQueue',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', payout.id,
          'artistId', payout.artist_id,
          'artistName', payout.artist_name,
          'requestedBy', payout.requested_by,
          'amount', to_char(payout.amount, 'FM999999999999999999999999990.00000000'),
          'status', payout.status,
          'artistNotes', payout.artist_notes,
          'adminNotes', payout.admin_notes,
          'reviewedBy', payout.reviewed_by,
          'reviewedAt', payout.reviewed_at,
          'paidAt', payout.paid_at,
          'paymentMethod', payout.payment_method,
          'paymentReference', payout.payment_reference,
          'createdAt', payout.created_at,
          'updatedAt', payout.updated_at,
          'bankDetails', case
            when payout.account_name is null then null
            else jsonb_build_object(
              'accountName', payout.account_name,
              'bankName', payout.bank_name,
              'accountNumber', payout.account_number,
              'bankAddress', payout.bank_address,
              'updatedAt', payout.bank_details_updated_at
            )
          end
        )
        order by payout.created_at desc
      )
      from payout_queue_rows as payout
    ), '[]'::jsonb),
    'recentStatementPeriods',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', statement_period.id,
          'artistId', statement_period.artist_id,
          'artistName', statement_period.artist_name,
          'periodMonth', statement_period.period_month,
          'status', statement_period.status,
          'closedAt', statement_period.closed_at,
          'earnings', to_char(coalesce(statement_totals.earnings, 0), 'FM999999999999999999999999990.00000000'),
          'uploadCount', coalesce(statement_totals.upload_count, 0)
        )
        order by statement_period.period_month desc
      )
      from statement_period_rows as statement_period
      left join statement_totals
        on statement_totals.artist_id = statement_period.artist_id
        and statement_totals.period_month = statement_period.period_month
    ), '[]'::jsonb),
    'artistReadiness',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', readiness.id,
          'name', readiness.name,
          'email', readiness.email,
          'country', readiness.country,
          'missingBankDetails', readiness.missing_bank_details,
          'missingPublishingInfo', readiness.missing_publishing_info
        )
        order by
          (readiness.missing_bank_details::integer + readiness.missing_publishing_info::integer) desc,
          readiness.name asc,
          readiness.id asc
      )
      from readiness_rows as readiness
    ), '[]'::jsonb),
    'recentActivity',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', activity.id,
          'adminId', activity.admin_id,
          'adminName', activity.admin_name,
          'action', activity.action,
          'entityType', activity.entity_type,
          'entityId', activity.entity_id,
          'details', case
            when jsonb_typeof(activity.details) = 'object' then activity.details
            else '{}'::jsonb
          end,
          'createdAt', activity.created_at
        )
        order by activity.created_at desc
      )
      from activity_rows as activity
    ), '[]'::jsonb)
  )
  from summary_counts;
$$;

revoke all on function public.get_admin_dashboard_payload() from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_payload() to service_role;
