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
  release_collaborator_ids uuid[] := array[]::uuid[];
  track_collaborator_ids uuid[] := array[]::uuid[];
  payout_request_ids uuid[] := array[]::uuid[];
  restore_invite_ids uuid[] := array[]::uuid[];
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
  into payout_request_ids
  from public.payout_requests as payout_requests
  where payout_requests.artist_id = target_artist_uuid;

  select coalesce(array_agg(id), array[]::uuid[])
  into restore_invite_ids
  from public.login_invites
  where target_artist_id = target_artist_uuid;

  delete from public.admin_activity_log
  where (entity_type = 'artist' and entity_id = target_artist_uuid)
     or (entity_type = 'release_catalog' and entity_id = target_artist_uuid)
     or (entity_type = 'release' and entity_id = any(owned_release_ids))
     or (entity_type = 'track' and entity_id = any(owned_track_ids))
     or (entity_type = 'release_collaborator' and entity_id = any(release_collaborator_ids))
     or (entity_type = 'track_collaborator' and entity_id = any(track_collaborator_ids))
     or (entity_type = 'payout_request' and entity_id = any(payout_request_ids))
     or (entity_type = 'login_invite' and entity_id = any(restore_invite_ids));

  delete from public.login_invites
  where target_artist_id = target_artist_uuid;

  delete from public.release_collaborators as release_collaborators
  where release_collaborators.artist_id = target_artist_uuid
     or release_collaborators.release_id = any(owned_release_ids);

  delete from public.track_collaborators as track_collaborators
  where track_collaborators.artist_id = target_artist_uuid
     or track_collaborators.track_id = any(owned_track_ids);

  delete from public.earnings as earnings
  where earnings.artist_id = target_artist_uuid
     or earnings.release_id = any(owned_release_ids)
     or earnings.track_id = any(owned_track_ids);

  delete from public.csv_uploads as csv_uploads
  where csv_uploads.artist_id = target_artist_uuid;

  delete from public.payout_requests as payout_requests
  where payout_requests.artist_id = target_artist_uuid;

  delete from public.dues as dues
  where dues.artist_id = target_artist_uuid;

  delete from public.publishing_earnings as publishing_earnings
  where publishing_earnings.artist_id = target_artist_uuid;

  delete from public.analytics_snapshots as analytics_snapshots
  where analytics_snapshots.artist_id = target_artist_uuid;

  delete from public.notifications as notifications
  where notifications.artist_id = target_artist_uuid;

  delete from public.statement_periods as statement_periods
  where statement_periods.artist_id = target_artist_uuid;

  delete from public.transaction_ledger as transaction_ledger
  where transaction_ledger.artist_id = target_artist_uuid;

  delete from public.tracks as tracks
  where tracks.release_id = any(owned_release_ids);

  delete from public.releases as releases
  where releases.artist_id = target_artist_uuid;

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
