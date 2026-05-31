create or replace function public.admin_purge_artist(
  target_artist_uuid uuid
)
returns table (
  artist_id uuid,
  linked_user_id uuid,
  profile_became_unused boolean,
  remaining_linked_artist_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  remaining_count integer := 0;
  owned_release_ids uuid[] := array[]::uuid[];
  owned_track_ids uuid[] := array[]::uuid[];
  csv_upload_ids uuid[] := array[]::uuid[];
  release_collaborator_ids uuid[] := array[]::uuid[];
  track_collaborator_ids uuid[] := array[]::uuid[];
  track_credit_ids uuid[] := array[]::uuid[];
  release_event_ids uuid[] := array[]::uuid[];
  release_change_request_ids uuid[] := array[]::uuid[];
  release_submission_ids uuid[] := array[]::uuid[];
  release_submission_track_ids uuid[] := array[]::uuid[];
  release_split_version_ids uuid[] := array[]::uuid[];
  release_split_entry_ids uuid[] := array[]::uuid[];
  track_split_version_ids uuid[] := array[]::uuid[];
  track_split_entry_ids uuid[] := array[]::uuid[];
  payout_request_ids uuid[] := array[]::uuid[];
  due_ids uuid[] := array[]::uuid[];
  publishing_earning_ids uuid[] := array[]::uuid[];
  analytics_snapshot_ids uuid[] := array[]::uuid[];
  statement_period_ids uuid[] := array[]::uuid[];
  ledger_ids uuid[] := array[]::uuid[];
  restore_invite_ids uuid[] := array[]::uuid[];
  artist_avatar_image_ids uuid[] := array[]::uuid[];
  artist_dsp_profile_preference_ids uuid[] := array[]::uuid[];
begin
  select artists.user_id
  into current_user_id
  from public.artists
  where artists.id = target_artist_uuid
  for update;

  if not found then
    raise exception 'Artist % does not exist.', target_artist_uuid;
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
  into owned_release_ids
  from public.releases as releases
  where releases.artist_id = target_artist_uuid;

  select coalesce(array_agg(id), array[]::uuid[])
  into owned_track_ids
  from public.tracks as tracks
  where tracks.release_id = any(owned_release_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into csv_upload_ids
  from public.csv_uploads as csv_uploads
  where csv_uploads.artist_id = target_artist_uuid;

  select coalesce(array_agg(id), array[]::uuid[])
  into release_collaborator_ids
  from public.release_collaborators as release_collaborators
  where release_collaborators.artist_id = target_artist_uuid
     or release_collaborators.release_id = any(owned_release_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into track_collaborator_ids
  from public.track_collaborators as track_collaborators
  where track_collaborators.artist_id = target_artist_uuid
     or track_collaborators.track_id = any(owned_track_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into track_credit_ids
  from public.track_credits as track_credits
  where track_credits.linked_artist_id = target_artist_uuid
     or track_credits.track_id = any(owned_track_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into release_event_ids
  from public.release_events as release_events
  where release_events.actor_artist_id = target_artist_uuid
     or release_events.release_id = any(owned_release_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into release_change_request_ids
  from public.release_change_requests as release_change_requests
  where release_change_requests.requester_artist_id = target_artist_uuid
     or release_change_requests.release_id = any(owned_release_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into release_submission_ids
  from public.artist_release_submissions as submissions
  where submissions.artist_id = target_artist_uuid
     or submissions.release_id = any(owned_release_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into release_submission_track_ids
  from public.artist_release_submission_tracks as submission_tracks
  where submission_tracks.submission_id = any(release_submission_ids)
     or submission_tracks.track_id = any(owned_track_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into release_split_version_ids
  from public.release_split_versions as split_versions
  where split_versions.release_id = any(owned_release_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into release_split_entry_ids
  from public.release_split_version_entries as split_entries
  where split_entries.artist_id = target_artist_uuid
     or split_entries.version_id = any(release_split_version_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into track_split_version_ids
  from public.track_split_versions as split_versions
  where split_versions.release_id = any(owned_release_ids)
     or split_versions.track_id = any(owned_track_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into track_split_entry_ids
  from public.track_split_version_entries as split_entries
  where split_entries.artist_id = target_artist_uuid
     or split_entries.version_id = any(track_split_version_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into payout_request_ids
  from public.payout_requests as payout_requests
  where payout_requests.artist_id = target_artist_uuid;

  select coalesce(array_agg(id), array[]::uuid[])
  into due_ids
  from public.dues as dues
  where dues.artist_id = target_artist_uuid;

  select coalesce(array_agg(id), array[]::uuid[])
  into publishing_earning_ids
  from public.publishing_earnings as publishing_earnings
  where publishing_earnings.artist_id = target_artist_uuid
     or publishing_earnings.release_id = any(owned_release_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into analytics_snapshot_ids
  from public.analytics_snapshots as analytics_snapshots
  where analytics_snapshots.artist_id = target_artist_uuid
     or analytics_snapshots.release_id = any(owned_release_ids)
     or analytics_snapshots.upload_id = any(csv_upload_ids);

  select coalesce(array_agg(id), array[]::uuid[])
  into statement_period_ids
  from public.statement_periods as statement_periods
  where statement_periods.artist_id = target_artist_uuid;

  select coalesce(array_agg(id), array[]::uuid[])
  into ledger_ids
  from public.transaction_ledger as transaction_ledger
  where transaction_ledger.artist_id = target_artist_uuid;

  select coalesce(array_agg(id), array[]::uuid[])
  into restore_invite_ids
  from public.login_invites
  where target_artist_id = target_artist_uuid;

  select coalesce(array_agg(id), array[]::uuid[])
  into artist_avatar_image_ids
  from public.artist_avatar_images as avatar_images
  where avatar_images.artist_id = target_artist_uuid;

  select coalesce(array_agg(id), array[]::uuid[])
  into artist_dsp_profile_preference_ids
  from public.artist_dsp_profile_preferences as dsp_preferences
  where dsp_preferences.artist_id = target_artist_uuid;

  delete from public.admin_activity_log
  where (entity_type = 'artist' and entity_id = target_artist_uuid)
     or entity_id = any(owned_release_ids)
     or entity_id = any(owned_track_ids)
     or entity_id = any(csv_upload_ids)
     or entity_id = any(release_collaborator_ids)
     or entity_id = any(track_collaborator_ids)
     or entity_id = any(track_credit_ids)
     or entity_id = any(release_event_ids)
     or entity_id = any(release_change_request_ids)
     or entity_id = any(release_submission_ids)
     or entity_id = any(release_submission_track_ids)
     or entity_id = any(release_split_version_ids)
     or entity_id = any(release_split_entry_ids)
     or entity_id = any(track_split_version_ids)
     or entity_id = any(track_split_entry_ids)
     or entity_id = any(payout_request_ids)
     or entity_id = any(due_ids)
     or entity_id = any(publishing_earning_ids)
     or entity_id = any(analytics_snapshot_ids)
     or entity_id = any(statement_period_ids)
     or entity_id = any(ledger_ids)
     or entity_id = any(restore_invite_ids)
     or entity_id = any(artist_avatar_image_ids)
     or entity_id = any(artist_dsp_profile_preference_ids);

  delete from public.login_invites
  where target_artist_id = target_artist_uuid;

  delete from public.release_change_requests as release_change_requests
  where release_change_requests.id = any(release_change_request_ids);

  delete from public.artist_release_submission_tracks as submission_tracks
  where submission_tracks.id = any(release_submission_track_ids);

  delete from public.artist_release_submissions as submissions
  where submissions.id = any(release_submission_ids);

  delete from public.release_split_version_entries as split_entries
  where split_entries.id = any(release_split_entry_ids);

  delete from public.track_split_version_entries as split_entries
  where split_entries.id = any(track_split_entry_ids);

  delete from public.release_split_versions as split_versions
  where split_versions.id = any(release_split_version_ids);

  delete from public.track_split_versions as split_versions
  where split_versions.id = any(track_split_version_ids);

  delete from public.track_credits as track_credits
  where track_credits.id = any(track_credit_ids);

  delete from public.release_events as release_events
  where release_events.id = any(release_event_ids);

  delete from public.release_collaborators as release_collaborators
  where release_collaborators.id = any(release_collaborator_ids);

  delete from public.track_collaborators as track_collaborators
  where track_collaborators.id = any(track_collaborator_ids);

  delete from public.analytics_snapshots as analytics_snapshots
  where analytics_snapshots.id = any(analytics_snapshot_ids);

  delete from public.notifications as notifications
  where notifications.artist_id = target_artist_uuid;

  delete from public.earnings as earnings
  where earnings.artist_id = target_artist_uuid
     or earnings.release_id = any(owned_release_ids)
     or earnings.track_id = any(owned_track_ids)
     or earnings.upload_id = any(csv_upload_ids);

  delete from public.transaction_ledger as transaction_ledger
  where transaction_ledger.id = any(ledger_ids);

  delete from public.payout_requests as payout_requests
  where payout_requests.id = any(payout_request_ids);

  delete from public.dues as dues
  where dues.id = any(due_ids);

  delete from public.publishing_earnings as publishing_earnings
  where publishing_earnings.id = any(publishing_earning_ids);

  delete from public.csv_uploads as csv_uploads
  where csv_uploads.id = any(csv_upload_ids);

  delete from public.statement_periods as statement_periods
  where statement_periods.id = any(statement_period_ids);

  delete from public.artist_dsp_profile_preferences as dsp_preferences
  where dsp_preferences.id = any(artist_dsp_profile_preference_ids);

  delete from public.artist_avatar_images as avatar_images
  where avatar_images.id = any(artist_avatar_image_ids);

  delete from public.artist_bank_details as bank_details
  where bank_details.artist_id = target_artist_uuid;

  delete from public.artist_publishing_info as publishing_info
  where publishing_info.artist_id = target_artist_uuid;

  delete from public.tracks as tracks
  where tracks.id = any(owned_track_ids);

  delete from public.releases as releases
  where releases.id = any(owned_release_ids);

  delete from public.artists
  where id = target_artist_uuid;

  if current_user_id is not null then
    select count(*)
    into remaining_count
    from public.artists
    where user_id = current_user_id;
  end if;

  return query
  select
    target_artist_uuid,
    current_user_id,
    current_user_id is not null and remaining_count = 0,
    remaining_count;
end;
$$;

revoke all on function public.admin_purge_artist(uuid) from public, anon, authenticated;
grant execute on function public.admin_purge_artist(uuid) to service_role;
