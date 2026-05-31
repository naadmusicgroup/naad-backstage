import { createError, getQuery } from "h3"
import { serverSupabaseClient, serverSupabaseUser } from "~~/server/utils/supabase"
import { resolveArtistDashboardScope } from "~~/server/utils/artist-dashboard"
import type {
  ArtistAvatarMode,
  ArtistAvatarPreset,
  ArtistDspProfilePlatform,
  ArtistDspProfileRecord,
  ArtistSettingsArtistRecord,
  ArtistSettingsResponse,
} from "~~/types/settings"
import {
  normalizeArtistAvatarMode,
  resolveArtistAvatarCustomColors,
  normalizeArtistAvatarPreset,
} from "~~/server/utils/artist-avatars"

interface ProfileRow {
  full_name: string | null
  phone: string | null
}

interface RelatedBankDetailsRow {
  account_name: string
  bank_name: string
  account_number: string
  bank_address: string | null
  updated_at: string | null
}

interface RelatedPublishingInfoRow {
  legal_name: string | null
  ipi_number: string | null
  pro_name: string | null
  updated_at: string | null
}

interface RelatedDspProfileRow {
  platform: ArtistDspProfilePlatform
  profile_exists: boolean
  profile_url: string | null
  display_name: string | null
  avatar_url: string | null
  updated_at: string | null
}

interface ArtistSettingsRow {
  id: string
  name: string
  email: string | null
  avatar_mode: ArtistAvatarMode | null
  avatar_preset: ArtistAvatarPreset | null
  avatar_custom_colors: string[] | null
  avatar_url: string | null
  country: string | null
  bio: string | null
  artist_bank_details: RelatedBankDetailsRow | RelatedBankDetailsRow[] | null
  artist_publishing_info: RelatedPublishingInfoRow | RelatedPublishingInfoRow[] | null
  artist_dsp_profile_preferences: RelatedDspProfileRow[] | null
}

interface ArtistUploadSettingsRow {
  id: string
  name: string
  artist_dsp_profile_preferences: RelatedDspProfileRow[] | null
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function mapDspProfile(row: RelatedDspProfileRow): ArtistDspProfileRecord {
  return {
    platform: row.platform,
    profileExists: row.profile_exists,
    profileUrl: row.profile_url,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    updatedAt: row.updated_at,
  }
}

function mapArtistRecord(row: ArtistSettingsRow): ArtistSettingsArtistRecord {
  const bankDetails = firstRelation(row.artist_bank_details)
  const publishingInfo = firstRelation(row.artist_publishing_info)

  return {
    artistId: row.id,
    artistName: row.name,
    avatarMode: normalizeArtistAvatarMode(row.avatar_mode),
    avatarPreset: normalizeArtistAvatarPreset(row.avatar_preset),
    avatarCustomColors: resolveArtistAvatarCustomColors(row.avatar_custom_colors),
    avatarUrl: row.avatar_url,
    country: row.country,
    bio: row.bio,
    bankDetails: bankDetails
      ? {
          accountName: bankDetails.account_name,
          bankName: bankDetails.bank_name,
          accountNumber: bankDetails.account_number,
          bankAddress: bankDetails.bank_address,
          updatedAt: bankDetails.updated_at,
        }
      : null,
    publishingInfo: publishingInfo
      ? {
          legalName: publishingInfo.legal_name,
          ipiNumber: publishingInfo.ipi_number,
          proName: publishingInfo.pro_name,
          updatedAt: publishingInfo.updated_at,
        }
      : null,
    dspProfiles: (row.artist_dsp_profile_preferences ?? []).map(mapDspProfile),
  }
}

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function surfaceFromQuery(value: unknown) {
  const normalized = String(firstQueryValue(value) ?? "").trim().toLowerCase()
  return normalized === "upload_preferences" ? "upload_preferences" : "settings"
}

function emptyProfile() {
  return {
    fullName: "",
    phone: null,
    email: null,
  }
}

function mapUploadArtistRecord(row: ArtistUploadSettingsRow): ArtistSettingsArtistRecord {
  return {
    artistId: row.id,
    artistName: row.name,
    avatarMode: normalizeArtistAvatarMode(null),
    avatarPreset: normalizeArtistAvatarPreset(null),
    avatarCustomColors: null,
    avatarUrl: null,
    country: null,
    bio: null,
    bankDetails: null,
    publishingInfo: null,
    dspProfiles: (row.artist_dsp_profile_preferences ?? []).map(mapDspProfile),
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const surface = surfaceFromQuery(query.surface)
  const scope = await resolveArtistDashboardScope(event, "", "settings")
  const supabase = await serverSupabaseClient(event)

  if (surface === "upload_preferences") {
    const { data: artists, error: artistsError } = await supabase
      .from("artists")
      .select("id, name, artist_dsp_profile_preferences(platform, profile_exists, profile_url, display_name, avatar_url, updated_at)")
      .in("id", scope.artistIds)
      .order("name", { ascending: true })

    if (artistsError) {
      throw createError({
        statusCode: 500,
        statusMessage: artistsError.message,
      })
    }

    return {
      profile: emptyProfile(),
      artists: ((artists ?? []) as ArtistUploadSettingsRow[]).map(mapUploadArtistRecord),
    } satisfies ArtistSettingsResponse
  }

  const user = scope.isImpersonating ? null : await serverSupabaseUser(event)

  const [{ data: profile, error: profileError }, { data: artists, error: artistsError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", scope.artistOwnerUserId)
      .single<ProfileRow>(),
    supabase
      .from("artists")
      .select(
        "id, name, email, avatar_mode, avatar_preset, avatar_custom_colors, avatar_url, country, bio, artist_bank_details(account_name, bank_name, account_number, bank_address, updated_at), artist_publishing_info(legal_name, ipi_number, pro_name, updated_at), artist_dsp_profile_preferences(platform, profile_exists, profile_url, display_name, avatar_url, updated_at)",
      )
      .in("id", scope.artistIds)
      .order("name", { ascending: true }),
  ])

  if (profileError) {
    throw createError({
      statusCode: 500,
      statusMessage: profileError.message,
    })
  }

  if (artistsError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistsError.message,
    })
  }

  return {
    profile: {
      fullName: profile.full_name ?? "",
      phone: profile.phone,
      email: scope.isImpersonating
        ? scope.artistRows[0]?.email ?? null
        : user?.email ?? scope.artistRows[0]?.email ?? null,
    },
    artists: ((artists ?? []) as ArtistSettingsRow[]).map(mapArtistRecord),
  } satisfies ArtistSettingsResponse
})

