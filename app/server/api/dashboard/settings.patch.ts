import { createError, readBody } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseClient, serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireArtistProfile } from "~~/server/utils/auth"
import {
  normalizeArtistAvatarCustomColors,
  normalizeArtistAvatarMode,
  normalizeArtistAvatarPreset,
} from "~~/server/utils/artist-avatars"
import type {
  ArtistDspProfileRecord,
  ArtistDspProfilePlatform,
  ArtistSettingsMutationResponse,
  UpdateArtistBankDetailsInput,
  UpdateArtistDspProfileInput,
  UpdateArtistDspProfilesInput,
  UpdateArtistSettingsInput,
  UpdateArtistProfileInput,
  UpdateManagedArtistInput,
} from "~~/types/settings"
import { ARTIST_DSP_PROFILE_PLATFORM_LABELS, ARTIST_DSP_PROFILE_PLATFORMS } from "~~/types/settings"

interface OwnedArtistRow {
  id: string
  name: string
}

interface DspProfilePreferenceRow {
  platform: ArtistDspProfilePlatform
  profile_exists: boolean
  profile_url: string | null
  display_name: string | null
  avatar_url: string | null
  updated_at: string | null
}

const DSP_PROFILE_PLATFORM_SET = new Set<string>(ARTIST_DSP_PROFILE_PLATFORMS)

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = (value ?? "").trim()
  return normalized || null
}

function normalizeOptionalUrl(value: string | null | undefined, label = "Avatar URL") {
  const normalized = (value ?? "").trim()

  if (!normalized) {
    return null
  }

  const urlCandidate = /^[a-z][a-z\d+.-]*:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized.replace(/^\/+/, "")}`

  try {
    return new URL(urlCandidate).toString()
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid absolute URL.`,
    })
  }
}

function mapDspProfilePreference(row: DspProfilePreferenceRow): ArtistDspProfileRecord {
  return {
    platform: row.platform,
    profileExists: row.profile_exists,
    profileUrl: row.profile_url,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    updatedAt: row.updated_at,
  }
}

function buildProfileUpdate(profile: UpdateArtistProfileInput) {
  const payload: Record<string, string | null> = {}

  if (typeof profile.fullName !== "undefined") {
    const fullName = profile.fullName.trim()

    if (fullName.length < 2) {
      throw createError({
        statusCode: 400,
        statusMessage: "Full name must be at least 2 characters.",
      })
    }

    payload.full_name = fullName
  }

  if (typeof profile.phone !== "undefined") {
    payload.phone = normalizeOptionalText(profile.phone)
  }

  return payload
}

function buildArtistUpdate(artist: UpdateManagedArtistInput) {
  const payload: Record<string, string | string[] | null> = {}
  let touchedAvatar = false

  if (typeof artist.avatarUrl !== "undefined") {
    payload.avatar_url = normalizeOptionalUrl(artist.avatarUrl)
    touchedAvatar = true
  }

  if (typeof artist.avatarMode !== "undefined") {
    payload.avatar_mode = normalizeArtistAvatarMode(artist.avatarMode)
    touchedAvatar = true
  }

  if (typeof artist.avatarPreset !== "undefined") {
    payload.avatar_preset = normalizeArtistAvatarPreset(artist.avatarPreset)
    touchedAvatar = true
  }

  if (typeof artist.avatarCustomColors !== "undefined") {
    payload.avatar_custom_colors = normalizeArtistAvatarCustomColors(artist.avatarCustomColors)
    touchedAvatar = true
  }

  if (touchedAvatar) {
    payload.avatar_updated_at = new Date().toISOString()
  }

  if (typeof artist.country !== "undefined") {
    payload.country = normalizeOptionalText(artist.country)
  }

  if (typeof artist.bio !== "undefined") {
    payload.bio = normalizeOptionalText(artist.bio)
  }

  return payload
}

function buildBankDetailsUpsert(userId: string, bankDetails: UpdateArtistBankDetailsInput) {
  const accountName = bankDetails.accountName.trim()
  const bankName = bankDetails.bankName.trim()
  const accountNumber = bankDetails.accountNumber.trim()

  if (accountName.length < 2 || bankName.length < 2 || accountNumber.length < 4) {
    throw createError({
      statusCode: 400,
      statusMessage: "Account name, bank name, and account number are required for bank details.",
    })
  }

  return {
    artist_id: bankDetails.artistId,
    account_name: accountName,
    bank_name: bankName,
    account_number: accountNumber,
    bank_address: normalizeOptionalText(bankDetails.bankAddress),
    updated_by: userId,
  }
}

function normalizeDspProfilePlatform(value: unknown): ArtistDspProfilePlatform {
  const platform = String(value ?? "").trim()

  if (!DSP_PROFILE_PLATFORM_SET.has(platform)) {
    throw createError({
      statusCode: 400,
      statusMessage: "DSP platform is not supported.",
    })
  }

  return platform as ArtistDspProfilePlatform
}

function buildDspProfileUpsert(
  userId: string,
  artistId: string,
  artistName: string,
  profile: UpdateArtistDspProfileInput,
) {
  const platform = normalizeDspProfilePlatform(profile.platform)

  if (profile.profileExists === null) {
    return null
  }

  if (!profile.profileExists) {
    return {
      artist_id: artistId,
      platform,
      profile_exists: false,
      profile_url: null,
      display_name: null,
      avatar_url: null,
      updated_by: userId,
    }
  }

  const profileUrl = normalizeOptionalUrl(profile.profileUrl, `${ARTIST_DSP_PROFILE_PLATFORM_LABELS[platform]} profile URL`)
  const displayName = normalizeOptionalText(profile.displayName) ?? artistName

  if (!profileUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: `${ARTIST_DSP_PROFILE_PLATFORM_LABELS[platform]} profile URL is required when the profile is connected.`,
    })
  }

  if (displayName.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: `${ARTIST_DSP_PROFILE_PLATFORM_LABELS[platform]} display name must be at least 2 characters.`,
    })
  }

  return {
    artist_id: artistId,
    platform,
    profile_exists: true,
    profile_url: profileUrl,
    display_name: displayName,
    avatar_url: normalizeOptionalUrl(profile.avatarUrl, `${ARTIST_DSP_PROFILE_PLATFORM_LABELS[platform]} avatar URL`),
    updated_by: userId,
  }
}

async function saveDspProfiles(
  supabase: SupabaseClient<any>,
  userId: string,
  artistNameById: Map<string, string>,
  dspProfiles: UpdateArtistDspProfilesInput,
) {
  const artistId = dspProfiles.artistId
  const artistName = artistNameById.get(artistId) ?? "Artist"
  const rows = []
  const platformsToDelete: ArtistDspProfilePlatform[] = []

  for (const profile of dspProfiles.profiles ?? []) {
    const platform = normalizeDspProfilePlatform(profile.platform)
    const row = buildDspProfileUpsert(userId, artistId, artistName, profile)

    if (!row) {
      platformsToDelete.push(platform)
      continue
    }

    rows.push(row)
  }

  if (platformsToDelete.length) {
    const { error } = await supabase
      .from("artist_dsp_profile_preferences")
      .delete()
      .eq("artist_id", artistId)
      .in("platform", platformsToDelete)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }
  }

  if (rows.length) {
    const { error } = await supabase.from("artist_dsp_profile_preferences").upsert(rows as any[], {
      onConflict: "artist_id,platform",
    })

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }
  }

  const { data, error } = await supabase
    .from("artist_dsp_profile_preferences")
    .select("platform, profile_exists, profile_url, display_name, avatar_url, updated_at")
    .eq("artist_id", artistId)
    .order("platform", { ascending: true })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  return ((data ?? []) as DspProfilePreferenceRow[]).map(mapDspProfilePreference)
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireArtistProfile(event)
  const body = await readBody<UpdateArtistSettingsInput>(event)
  const supabase = await serverSupabaseClient(event)
  const adminSupabase = serverSupabaseServiceRole(event)

  const artistIds = new Set<string>()

  for (const item of [body.artist?.artistId, body.bankDetails?.artistId, body.dspProfiles?.artistId]) {
    if (item) {
      artistIds.add(item)
    }
  }

  let ownedArtistIds = new Set<string>()
  let artistNameById = new Map<string, string>()

  if (artistIds.size) {
    const { data: ownedArtists, error: ownedArtistsError } = await adminSupabase
      .from("artists")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_active", true)
      .in("id", [...artistIds])

    if (ownedArtistsError) {
      throw createError({
        statusCode: 500,
        statusMessage: ownedArtistsError.message,
      })
    }

    ownedArtistIds = new Set(((ownedArtists ?? []) as OwnedArtistRow[]).map((artist) => artist.id))
    artistNameById = new Map(((ownedArtists ?? []) as OwnedArtistRow[]).map((artist) => [artist.id, artist.name]))

    for (const artistId of artistIds) {
      if (!ownedArtistIds.has(artistId)) {
        throw createError({
          statusCode: 403,
          statusMessage: "You can only update settings for artist profiles on your own account.",
        })
      }
    }

  }

  const updatedSections: ArtistSettingsMutationResponse["updatedSections"] = []
  let savedDspProfiles: ArtistDspProfileRecord[] | undefined

  if (body.profile) {
    const profilePayload = buildProfileUpdate(body.profile)

    if (Object.keys(profilePayload).length) {
      const { error } = await supabase.from("profiles").update(profilePayload).eq("id", userId)

      if (error) {
        throw createError({
          statusCode: 500,
          statusMessage: error.message,
        })
      }

      updatedSections.push("profile")
    }
  }

  if (body.artist) {
    const artistPayload = buildArtistUpdate(body.artist)
    const { data: updatedArtist, error } = await adminSupabase
      .from("artists")
      .update(artistPayload)
      .eq("id", body.artist.artistId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .select("id")
      .maybeSingle()

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    if (!updatedArtist) {
      throw createError({
        statusCode: 403,
        statusMessage: "You can only update settings for artist profiles on your own account.",
      })
    }

    updatedSections.push("artist")
  }

  if (body.bankDetails) {
    const bankPayload = buildBankDetailsUpsert(userId, body.bankDetails)
    const { error } = await supabase.from("artist_bank_details").upsert(bankPayload, {
      onConflict: "artist_id",
    })

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    updatedSections.push("bankDetails")
  }

  if (body.dspProfiles) {
    savedDspProfiles = await saveDspProfiles(
      supabase,
      userId,
      artistNameById,
      body.dspProfiles,
    )

    updatedSections.push("dspProfiles")
  }

  if (!updatedSections.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No settings changes were provided.",
    })
  }

  return {
    ok: true,
    updatedSections,
    ...(savedDspProfiles ? { dspProfiles: savedDspProfiles } : {}),
  } satisfies ArtistSettingsMutationResponse
})

