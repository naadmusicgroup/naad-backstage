create index if not exists idx_publishing_earnings_admin_listing
on public.publishing_earnings (period_month desc, created_at desc, id);

create index if not exists idx_releases_admin_publishing_options
on public.releases (title asc, id)
where status <> 'deleted';

create or replace function public.get_admin_publishing_payload()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with entry_rows as materialized (
    select
      publishing.id,
      publishing.artist_id,
      coalesce(artist.name, 'Unknown artist') as artist_name,
      publishing.release_id,
      release.title as release_title,
      publishing.amount,
      publishing.period_month,
      publishing.notes,
      publishing.entered_by,
      nullif(btrim(profile.full_name), '') as entered_by_name,
      publishing.ledger_entry_id,
      publishing.created_at,
      publishing.updated_at
    from public.publishing_earnings as publishing
    inner join public.artists as artist
      on artist.id = publishing.artist_id
    left join public.releases as release
      on release.id = publishing.release_id
    left join public.profiles as profile
      on profile.id = publishing.entered_by
    order by publishing.period_month desc, publishing.created_at desc, publishing.id asc
  ),
  summary as (
    select
      count(*) as entry_count,
      coalesce(sum(amount), 0)::numeric(19,8) as total_amount,
      count(distinct artist_id) as artist_count,
      count(distinct release_id) filter (where release_id is not null) as release_count,
      count(distinct period_month) as period_count
    from public.publishing_earnings
  ),
  artist_options as materialized (
    select
      artist.id,
      artist.name
    from public.artists as artist
    where artist.is_active = true
    order by artist.name asc, artist.id asc
  ),
  release_options as materialized (
    select
      release.id,
      release.artist_id,
      release.title
    from public.releases as release
    where release.status <> 'deleted'
    order by release.title asc, release.id asc
  )
  select jsonb_build_object(
    'entries',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', entry.id,
          'artistId', entry.artist_id,
          'artistName', entry.artist_name,
          'releaseId', entry.release_id,
          'releaseTitle', entry.release_title,
          'amount', to_char(entry.amount, 'FM999999999999999999999999990.00000000'),
          'periodMonth', entry.period_month,
          'notes', entry.notes,
          'enteredBy', entry.entered_by,
          'enteredByName', entry.entered_by_name,
          'ledgerEntryId', entry.ledger_entry_id,
          'createdAt', entry.created_at,
          'updatedAt', entry.updated_at
        )
        order by entry.period_month desc, entry.created_at desc, entry.id asc
      )
      from entry_rows as entry
    ), '[]'::jsonb),
    'summary',
    jsonb_build_object(
      'entryCount', summary.entry_count,
      'totalAmount', to_char(summary.total_amount, 'FM999999999999999999999999990.00000000'),
      'artistCount', summary.artist_count,
      'releaseCount', summary.release_count,
      'periodCount', summary.period_count
    ),
    'artistOptions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'value', artist.id,
          'label', artist.name
        )
        order by artist.name asc, artist.id asc
      )
      from artist_options as artist
    ), '[]'::jsonb),
    'releaseOptions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'value', release.id,
          'label', release.title,
          'meta', release.artist_id
        )
        order by release.title asc, release.id asc
      )
      from release_options as release
    ), '[]'::jsonb)
  )
  from summary;
$$;

revoke all on function public.get_admin_publishing_payload() from public, anon, authenticated;
grant execute on function public.get_admin_publishing_payload() to service_role;
