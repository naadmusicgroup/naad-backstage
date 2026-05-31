create index if not exists idx_track_collaborators_artist_track
on public.track_collaborators (artist_id, track_id);

create index if not exists idx_artist_release_submissions_release_created
on public.artist_release_submissions (release_id, created_at desc, id desc);

create index if not exists idx_artist_dsp_profile_preferences_artist
on public.artist_dsp_profile_preferences (artist_id, id);

create or replace function public.get_artist_dashboard_home_payload(
  target_artist_ids uuid[],
  target_artist_owner_user_id uuid,
  target_profile_full_name text default '',
  target_is_impersonating boolean default false
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with bounded_input as (
    select
      coalesce(target_artist_ids, array[]::uuid[]) as artist_ids,
      target_artist_owner_user_id as artist_owner_user_id,
      coalesce(target_profile_full_name, '') as profile_full_name,
      coalesce(target_is_impersonating, false) as is_impersonating
  ),
  profile_name as (
    select
      case
        when bounded_input.is_impersonating then coalesce(
          (
            select profile.full_name
            from public.profiles as profile
            where profile.id = bounded_input.artist_owner_user_id
          ),
          ''
        )
        else bounded_input.profile_full_name
      end as full_name
    from bounded_input
  ),
  owned_releases as (
    select
      release.id,
      release.artist_id,
      artist.name as artist_name,
      release.title,
      release.type,
      release.status,
      release.cover_art_url,
      release.cover_thumb_url,
      release.streaming_link,
      release.release_date,
      release.created_at
    from public.releases as release
    join public.artists as artist
      on artist.id = release.artist_id
    cross join bounded_input
    where release.artist_id = any(bounded_input.artist_ids)
      and release.status <> 'deleted'
  ),
  collaborator_release_ids as (
    select collaborator.release_id
    from public.release_collaborators as collaborator, bounded_input
    where collaborator.artist_id = any(bounded_input.artist_ids)

    union

    select track.release_id
    from public.track_collaborators as collaborator
    join public.tracks as track
      on track.id = collaborator.track_id
    cross join bounded_input
    where collaborator.artist_id = any(bounded_input.artist_ids)
  ),
  collaborator_releases as (
    select
      release.id,
      release.artist_id,
      artist.name as artist_name,
      release.title,
      release.type,
      release.status,
      release.cover_art_url,
      release.cover_thumb_url,
      release.streaming_link,
      release.release_date,
      release.created_at
    from public.releases as release
    join public.artists as artist
      on artist.id = release.artist_id
    cross join bounded_input
    where release.id in (select release_id from collaborator_release_ids)
      and release.status in ('live', 'taken_down')
      and not release.artist_id = any(bounded_input.artist_ids)
  ),
  visible_releases as (
    select * from owned_releases

    union all

    select * from collaborator_releases
  ),
  release_rows as (
    select
      visible_release.id,
      visible_release.release_date,
      visible_release.created_at,
      jsonb_build_object(
        'id', visible_release.id,
        'artistId', visible_release.artist_id,
        'artistName', coalesce(visible_release.artist_name, 'Unknown artist'),
        'title', visible_release.title,
        'type', visible_release.type,
        'displayStatus', case
          when visible_release.status in ('live', 'taken_down', 'deleted') then visible_release.status
          when latest_submission.status = 'pending_review' then 'pending_review'
          when latest_submission.status = 'approved' then 'scheduled'
          when latest_submission.status = 'rejected' then 'rejected'
          else visible_release.status
        end,
        'coverArtUrl', visible_release.cover_art_url,
        'coverThumbUrl', coalesce(visible_release.cover_thumb_url, visible_release.cover_art_url),
        'streamingLink', visible_release.streaming_link,
        'releaseDate', visible_release.release_date,
        'trackCount', coalesce(track_counts.track_count, 0)
      ) as release_json
    from visible_releases as visible_release
    left join lateral (
      select submission.status
      from public.artist_release_submissions as submission
      where submission.release_id = visible_release.id
      order by submission.created_at desc, submission.id desc
      limit 1
    ) as latest_submission on true
    left join lateral (
      select count(*)::integer as track_count
      from public.tracks as track
      where track.release_id = visible_release.id
        and track.status <> 'deleted'
    ) as track_counts on true
  ),
  release_lookup as (
    select
      coalesce(
        jsonb_agg(release_rows.release_json order by release_rows.release_date desc nulls last, release_rows.created_at desc, release_rows.id asc),
        '[]'::jsonb
      ) as releases
    from release_rows
  ),
  selected_artist as (
    select
      artist.id,
      artist.country
    from public.artists as artist, bounded_input
    where artist.id = any(bounded_input.artist_ids)
    order by artist.name asc
    limit 1
  ),
  setup_artist as (
    select
      case
        when selected_artist.id is null then null
        else jsonb_build_object(
          'artistId', selected_artist.id,
          'country', selected_artist.country,
          'bankDetails', case
            when bank_details.id is null then null
            else jsonb_build_object(
              'accountName', bank_details.account_name,
              'bankName', bank_details.bank_name,
              'accountNumber', bank_details.account_number
            )
          end,
          'dspProfiles', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'profileExists', profile.profile_exists,
                  'profileUrl', profile.profile_url
                )
                order by profile.id
              )
              from public.artist_dsp_profile_preferences as profile
              where profile.artist_id = selected_artist.id
            ),
            '[]'::jsonb
          )
        )
      end as artist
    from selected_artist
    left join public.artist_bank_details as bank_details
      on bank_details.artist_id = selected_artist.id
  )
  select jsonb_build_object(
    'latestRelease',
    (
      select release_rows.release_json
      from release_rows
      order by release_rows.release_date desc nulls last, release_rows.created_at desc, release_rows.id asc
      limit 1
    ),
    'releaseLookup',
    release_lookup.releases,
    'setup',
    jsonb_build_object(
      'profileFullName', profile_name.full_name,
      'artist', setup_artist.artist
    )
  )
  from profile_name
  cross join release_lookup
  left join setup_artist on true;
$$;

revoke all on function public.get_artist_dashboard_home_payload(uuid[], uuid, text, boolean)
from public, anon, authenticated;

grant execute on function public.get_artist_dashboard_home_payload(uuid[], uuid, text, boolean)
to service_role;
