create index if not exists idx_artists_admin_active_name_id
on public.artists (is_active, name, id);

create index if not exists idx_artists_user_id_shared_count
on public.artists (user_id)
where user_id is not null;

create index if not exists idx_artist_bank_details_artist_id
on public.artist_bank_details (artist_id);

create index if not exists idx_artist_publishing_info_artist_id
on public.artist_publishing_info (artist_id);

create or replace function public.get_admin_artists_payload()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
shared_account_counts as (
  select
    artist.user_id,
    count(*)::integer as shared_account_artist_count
  from public.artists as artist
  where artist.user_id is not null
  group by artist.user_id
),
artist_rows as (
  select
    artist.id,
    artist.name,
    artist.email,
    artist.avatar_url,
    artist.country,
    artist.bio,
    artist.is_active,
    linked_profile.login_frozen_at,
    linked_profile.login_frozen_by,
    frozen_by_profile.full_name as login_frozen_by_name,
    case
      when artist.user_id is null then 0
      else coalesce(shared_account_counts.shared_account_artist_count, 1)
    end as shared_account_artist_count,
    artist.created_at,
    case
      when bank.artist_id is null then null
      else jsonb_build_object(
        'accountName', bank.account_name,
        'bankName', bank.bank_name,
        'accountNumber', bank.account_number,
        'bankAddress', bank.bank_address,
        'updatedAt', bank.updated_at
      )
    end as bank_details,
    case
      when publishing.artist_id is null then null
      else jsonb_build_object(
        'legalName', publishing.legal_name,
        'ipiNumber', publishing.ipi_number,
        'proName', publishing.pro_name,
        'updatedAt', publishing.updated_at
      )
    end as publishing_info
  from public.artists as artist
  left join public.profiles as linked_profile
    on linked_profile.id = artist.user_id
  left join shared_account_counts
    on shared_account_counts.user_id = artist.user_id
  left join public.profiles as frozen_by_profile
    on frozen_by_profile.id = linked_profile.login_frozen_by
  left join public.artist_bank_details as bank
    on bank.artist_id = artist.id
  left join public.artist_publishing_info as publishing
    on publishing.artist_id = artist.id
  where artist.is_active = true
)
select jsonb_build_object(
  'artists', coalesce(jsonb_agg(
    jsonb_build_object(
      'id', row.id,
      'name', row.name,
      'email', row.email,
      'avatarUrl', row.avatar_url,
      'country', row.country,
      'bio', row.bio,
      'isActive', row.is_active,
      'loginFrozenAt', row.login_frozen_at,
      'loginFrozenBy', row.login_frozen_by,
      'loginFrozenByName', row.login_frozen_by_name,
      'sharedAccountArtistCount', row.shared_account_artist_count,
      'createdAt', row.created_at,
      'bankDetails', row.bank_details,
      'publishingInfo', row.publishing_info
    )
    order by row.name asc, row.id asc
  ), '[]'::jsonb)
)
from artist_rows as row;
$$;

revoke all on function public.get_admin_artists_payload() from public, anon, authenticated;
grant execute on function public.get_admin_artists_payload() to service_role;
