import { createError, readBody } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  adminArtistSelect,
  mapAdminArtistRow,
  type AdminArtistRow,
} from "~~/server/utils/admin-artists"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  syncArtistPublishingInfoWriter,
  unlinkArtistPublishingInfoWriter,
} from "~~/server/utils/publishing-registration"
import {
  normalizeArtistAvatarCustomColors,
  normalizeArtistAvatarMode,
  normalizeArtistAvatarPreset,
} from "~~/server/utils/artist-avatars"
import {
  ARTIST_DSP_PROFILE_PLATFORM_LABELS,
  ARTIST_DSP_PROFILE_PLATFORMS,
  ARTIST_SOCIAL_LINK_PLATFORM_LABELS,
  ARTIST_SOCIAL_LINK_PLATFORMS,
} from "~~/types/settings"
import {
  isUniqueViolation,
  normalizeOptionalHttpUrl,
  normalizeOptionalText,
  normalizeRequiredSplitPct,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import type {
  AdminArtistMutationResponse,
  ArtistDspProfilePlatform,
  ArtistDspProfileRecord,
  ArtistSocialLinkPlatform,
  ArtistSocialLinkRecord,
  UpdateAdminArtistBankDetailsInput,
  UpdateAdminArtistInput,
  UpdateArtistDspProfileInput,
  UpdateArtistSocialLinkInput,
} from "~~/types/settings"

interface RelatedPublishingInfoRow {
  legal_name: string | null
  ipi_number: string | null
  pro_name: string | null
  updated_at: string | null
}

interface DspProfilePreferenceRow {
  platform: ArtistDspProfilePlatform
  profile_exists: boolean
  profile_url: string | null
  display_name: string | null
  avatar_url: string | null
  updated_at: string | null
}

interface SocialLinkRow {
  platform: ArtistSocialLinkPlatform
  url: string
  updated_at: string | null
}

const DSP_PROFILE_PLATFORM_SET = new Set<string>(ARTIST_DSP_PROFILE_PLATFORMS)
const SOCIAL_LINK_PLATFORM_SET = new Set<string>(ARTIST_SOCIAL_LINK_PLATFORMS)
const SOCIAL_LINK_ALLOWED_HOSTS: Record<ArtistSocialLinkPlatform, string[]> = {
  facebook: ["facebook.com", "fb.com"],
  tiktok: ["tiktok.com"],
  instagram: ["instagram.com"],
  youtube: ["youtube.com", "youtu.be"],
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function normalizeEmail(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (!normalized || !normalized.includes("@")) {
    throw createError({
      statusCode: 400,
      statusMessage: "A valid artist email address is required.",
    })
  }

  return normalized
}

function normalizeStoredEmail(value: string | null) {
  return value?.trim().toLowerCase() || null
}

function normalizeOptionalArtistSharePct(value: unknown) {
  const normalized = String(value ?? "").trim()

  if (!normalized) {
    return null
  }

  return normalizeRequiredSplitPct(normalized, "Artist share")
}

function normalizeOptionalUrl(value: unknown, label: string) {
  const normalized = String(value ?? "").trim()

  if (!normalized) {
    return null
  }

  const urlCandidate = /^[a-z][a-z\d+.-]*:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized.replace(/^\/+/, "")}`

  return normalizeOptionalHttpUrl(urlCandidate, label)
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

function normalizeSocialLinkPlatform(value: unknown): ArtistSocialLinkPlatform {
  const platform = String(value ?? "").trim()

  if (!SOCIAL_LINK_PLATFORM_SET.has(platform)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Social platform is not supported.",
    })
  }

  return platform as ArtistSocialLinkPlatform
}

function normalizeSocialLinkUrl(
  value: unknown,
  platform: ArtistSocialLinkPlatform,
) {
  const label = ARTIST_SOCIAL_LINK_PLATFORM_LABELS[platform]
  const normalized = normalizeOptionalUrl(value, `${label} link`)

  if (!normalized) {
    return null
  }

  const url = new URL(normalized)
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "")
  const isAllowedHost = SOCIAL_LINK_ALLOWED_HOSTS[platform].some((allowedHost) => (
    hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
  ))

  if (!isAllowedHost) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} link must use a ${label} URL.`,
    })
  }

  return url.toString()
}

function isEmptyAdminBankDetails(bankDetails: UpdateAdminArtistBankDetailsInput | null | undefined) {
  return !bankDetails
    || (
      !String(bankDetails.accountName ?? "").trim()
      && !String(bankDetails.bankName ?? "").trim()
      && !String(bankDetails.accountNumber ?? "").trim()
      && !String(bankDetails.bankAddress ?? "").trim()
    )
}

function buildAdminBankDetailsUpsert(
  adminId: string,
  artistId: string,
  bankDetails: UpdateAdminArtistBankDetailsInput,
) {
  const accountName = String(bankDetails.accountName ?? "").trim()
  const bankName = String(bankDetails.bankName ?? "").trim()
  const accountNumber = String(bankDetails.accountNumber ?? "").trim()

  if (accountName.length < 2 || bankName.length < 2 || accountNumber.length < 4) {
    throw createError({
      statusCode: 400,
      statusMessage: "Account name, bank name, and account number are required for bank details.",
    })
  }

  return {
    artist_id: artistId,
    account_name: accountName,
    bank_name: bankName,
    account_number: accountNumber,
    bank_address: normalizeOptionalText(bankDetails.bankAddress),
    updated_by: adminId,
  }
}

function buildAdminDspProfileUpsert(
  adminId: string,
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
      updated_by: adminId,
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
    updated_by: adminId,
  }
}

function buildAdminSocialLinkUpsert(
  adminId: string,
  artistId: string,
  link: UpdateArtistSocialLinkInput,
) {
  const platform = normalizeSocialLinkPlatform(link.platform)
  const url = normalizeSocialLinkUrl(link.url, platform)

  if (!url) {
    return null
  }

  return {
    artist_id: artistId,
    platform,
    url,
    updated_by: adminId,
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

function mapSocialLink(row: SocialLinkRow): ArtistSocialLinkRecord {
  return {
    platform: row.platform,
    url: row.url,
    updatedAt: row.updated_at,
  }
}

async function saveAdminDspProfiles(
  supabase: SupabaseClient<any>,
  adminId: string,
  artistId: string,
  artistName: string,
  profiles: UpdateArtistDspProfileInput[] | null,
) {
  if (profiles === null) {
    const { error } = await supabase
      .from("artist_dsp_profile_preferences")
      .delete()
      .eq("artist_id", artistId)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to update artist platform profiles.",
      })
    }

    return []
  }

  const rows = []
  const platformsToDelete: ArtistDspProfilePlatform[] = []

  for (const profile of profiles ?? []) {
    const platform = normalizeDspProfilePlatform(profile.platform)
    const row = buildAdminDspProfileUpsert(adminId, artistId, artistName, profile)

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
        statusMessage: "Unable to update artist platform profiles.",
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
        statusMessage: "Unable to update artist platform profiles.",
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
      statusMessage: "Unable to load artist platform profiles.",
    })
  }

  return ((data ?? []) as DspProfilePreferenceRow[]).map(mapDspProfilePreference)
}

async function saveAdminSocialLinks(
  supabase: SupabaseClient<any>,
  adminId: string,
  artistId: string,
  links: UpdateArtistSocialLinkInput[] | null,
) {
  if (links === null) {
    const { error } = await supabase
      .from("artist_social_links")
      .delete()
      .eq("artist_id", artistId)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to update artist social links.",
      })
    }

    return []
  }

  const rows = []
  const platformsToDelete: ArtistSocialLinkPlatform[] = []

  for (const link of links ?? []) {
    const platform = normalizeSocialLinkPlatform(link.platform)
    const row = buildAdminSocialLinkUpsert(adminId, artistId, link)

    if (!row) {
      platformsToDelete.push(platform)
      continue
    }

    rows.push(row)
  }

  if (platformsToDelete.length) {
    const { error } = await supabase
      .from("artist_social_links")
      .delete()
      .eq("artist_id", artistId)
      .in("platform", platformsToDelete)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to update artist social links.",
      })
    }
  }

  if (rows.length) {
    const { error } = await supabase.from("artist_social_links").upsert(rows as any[], {
      onConflict: "artist_id,platform",
    })

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to update artist social links.",
      })
    }
  }

  const { data, error } = await supabase
    .from("artist_social_links")
    .select("platform, url, updated_at")
    .eq("artist_id", artistId)
    .order("platform", { ascending: true })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load artist social links.",
    })
  }

  return ((data ?? []) as SocialLinkRow[]).map(mapSocialLink)
}

function mapAuthUpdateError(error: { message?: string | null; status?: number | null }) {
  const message = error.message || "Unable to update the artist login email."
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes("already") && normalizedMessage.includes("email")) {
    return {
      statusCode: 409,
      statusMessage: message,
    }
  }

  if (normalizedMessage.includes("valid") && normalizedMessage.includes("email")) {
    return {
      statusCode: 400,
      statusMessage: message,
    }
  }

  if (error.status === 400 || error.status === 422) {
    return {
      statusCode: 400,
      statusMessage: message,
    }
  }

  if (error.status === 409) {
    return {
      statusCode: 409,
      statusMessage: message,
    }
  }

  return {
    statusCode: 500,
    statusMessage: message,
  }
}

function mapArtistUpdateError(error: { code?: string | null; message?: string | null }) {
  const message = error.message || "Unable to update the artist record."
  const normalizedMessage = message.toLowerCase()

  if (isUniqueViolation(error) || (normalizedMessage.includes("duplicate") && normalizedMessage.includes("email"))) {
    return {
      statusCode: 409,
      statusMessage: "That email is already assigned to another artist.",
    }
  }

  if (normalizedMessage.includes("invalid") && normalizedMessage.includes("email")) {
    return {
      statusCode: 400,
      statusMessage: "A valid artist email address is required.",
    }
  }

  return {
    statusCode: 500,
    statusMessage: message,
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const artistId = normalizeRequiredUuid(event.context.params?.id, "Artist id")
  const body = await readBody<UpdateAdminArtistInput>(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data: existingArtist, error: existingArtistError } = await supabase
    .from("artists")
    .select(adminArtistSelect)
    .eq("id", artistId)
    .maybeSingle<AdminArtistRow>()

  if (existingArtistError) {
    throw createError({
      statusCode: 500,
      statusMessage: existingArtistError.message,
    })
  }

  if (!existingArtist) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected artist does not exist.",
    })
  }

  const artistUpdate: Record<string, string | string[] | number | null> = {}
  const changedFields: string[] = []
  const updatedSections: AdminArtistMutationResponse["updatedSections"] = []
  const currentPublishingInfo = firstRelation(existingArtist.artist_publishing_info) as RelatedPublishingInfoRow | null
  const currentEmail = normalizeStoredEmail(existingArtist.email)
  let nextEmail: string | null = null
  let publishingAction: "upsert" | "delete" | null = null
  let nextPublishingInfo: {
    legal_name: string | null
    ipi_number: string | null
    pro_name: string | null
  } | null = null
  let touchedAvatar = false
  let artistChanged = false
  let publishingChanged = false
  let bankDetailsChanged = false
  let dspProfilesChanged = false
  let socialLinksChanged = false

  if (typeof body?.name !== "undefined") {
    const normalizedName = normalizeRequiredText(body.name, "Stage name")

    if (normalizedName !== existingArtist.name) {
      artistUpdate.name = normalizedName
      changedFields.push("name")
      artistChanged = true
    }
  }

  if (typeof body?.email !== "undefined") {
    nextEmail = normalizeEmail(body.email)

    if (nextEmail !== currentEmail) {
      artistUpdate.email = nextEmail
      changedFields.push("email")
      artistChanged = true
    }
  }

  if (typeof body?.artistSharePct !== "undefined") {
    const nextArtistSharePct = normalizeOptionalArtistSharePct(body.artistSharePct)
    const currentArtistSharePct = existingArtist.artist_share_pct === null || typeof existingArtist.artist_share_pct === "undefined"
      ? null
      : Number(existingArtist.artist_share_pct)

    if (nextArtistSharePct !== currentArtistSharePct) {
      artistUpdate.artist_share_pct = nextArtistSharePct
      changedFields.push("artist_share_pct")
      artistChanged = true
    }
  }

  if (typeof body?.avatarMode !== "undefined") {
    const nextAvatarMode = normalizeArtistAvatarMode(body.avatarMode)

    if (nextAvatarMode !== existingArtist.avatar_mode) {
      artistUpdate.avatar_mode = nextAvatarMode
      changedFields.push("avatar_mode")
      touchedAvatar = true
      artistChanged = true
    }
  }

  if (typeof body?.avatarPreset !== "undefined") {
    const nextAvatarPreset = normalizeArtistAvatarPreset(body.avatarPreset)

    if (nextAvatarPreset !== existingArtist.avatar_preset) {
      artistUpdate.avatar_preset = nextAvatarPreset
      changedFields.push("avatar_preset")
      touchedAvatar = true
      artistChanged = true
    }
  }

  if (typeof body?.avatarCustomColors !== "undefined") {
    const nextAvatarCustomColors = normalizeArtistAvatarCustomColors(body.avatarCustomColors)
    const currentAvatarCustomColors = existingArtist.avatar_custom_colors ?? null

    if (JSON.stringify(nextAvatarCustomColors) !== JSON.stringify(currentAvatarCustomColors)) {
      artistUpdate.avatar_custom_colors = nextAvatarCustomColors
      changedFields.push("avatar_custom_colors")
      touchedAvatar = true
      artistChanged = true
    }
  }

  if (typeof body?.avatarUrl !== "undefined") {
    const normalizedAvatarUrl = normalizeOptionalHttpUrl(body.avatarUrl, "Avatar URL")

    if (normalizedAvatarUrl !== existingArtist.avatar_url) {
      artistUpdate.avatar_url = normalizedAvatarUrl
      changedFields.push("avatar_url")
      touchedAvatar = true
      artistChanged = true
    }
  }

  if (typeof body?.country !== "undefined") {
    const normalizedCountry = normalizeOptionalText(body.country)

    if (normalizedCountry !== existingArtist.country) {
      artistUpdate.country = normalizedCountry
      changedFields.push("country")
      artistChanged = true
    }
  }

  if (typeof body?.bio !== "undefined") {
    const normalizedBio = normalizeOptionalText(body.bio)

    if (normalizedBio !== existingArtist.bio) {
      artistUpdate.bio = normalizedBio
      changedFields.push("bio")
      artistChanged = true
    }
  }

  if (typeof body?.publishingInfo !== "undefined") {
    nextPublishingInfo = {
      legal_name: normalizeOptionalText(body.publishingInfo?.legalName),
      ipi_number: normalizeOptionalText(body.publishingInfo?.ipiNumber),
      pro_name: normalizeOptionalText(body.publishingInfo?.proName),
    }

    const hasPublishingInfo = Boolean(
      nextPublishingInfo.legal_name
      || nextPublishingInfo.ipi_number
      || nextPublishingInfo.pro_name,
    )

    if (hasPublishingInfo) {
      if (
        nextPublishingInfo.legal_name !== currentPublishingInfo?.legal_name
        || nextPublishingInfo.ipi_number !== currentPublishingInfo?.ipi_number
        || nextPublishingInfo.pro_name !== currentPublishingInfo?.pro_name
      ) {
        publishingAction = "upsert"
        publishingChanged = true
      }
    } else if (currentPublishingInfo) {
      publishingAction = "delete"
      publishingChanged = true
    }
  }

  if (touchedAvatar) {
    artistUpdate.avatar_updated_at = new Date().toISOString()
  }

  if (nextEmail && nextEmail !== currentEmail) {
    const { data: duplicateArtist, error: duplicateArtistError } = await supabase
      .from("artists")
      .select("id")
      .eq("email", nextEmail)
      .neq("id", artistId)
      .maybeSingle<{ id: string }>()

    if (duplicateArtistError) {
      throw createError({
        statusCode: 500,
        statusMessage: duplicateArtistError.message,
      })
    }

    if (duplicateArtist) {
      throw createError({
        statusCode: 409,
        statusMessage: "That email is already assigned to another artist.",
      })
    }

    if (!existingArtist.user_id && existingArtist.is_active) {
      throw createError({
        statusCode: 409,
        statusMessage: "This artist no longer has a live login attached. Restore dashboard access before changing the login email.",
      })
    }

    if (existingArtist.user_id) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(existingArtist.user_id, {
        email: nextEmail,
        email_confirm: true,
      })

      if (authUpdateError) {
        throw createError(mapAuthUpdateError(authUpdateError))
      }
    }
  }

  if (Object.keys(artistUpdate).length) {
    const { error: artistUpdateError } = await supabase
      .from("artists")
      .update(artistUpdate)
      .eq("id", artistId)

    if (artistUpdateError) {
      throw createError(mapArtistUpdateError(artistUpdateError))
    }
  }

  if (publishingAction === "upsert" && nextPublishingInfo) {
    const { error: upsertPublishingError } = await supabase.from("artist_publishing_info").upsert(
      {
        artist_id: artistId,
        ...nextPublishingInfo,
        updated_by: profile.id,
      },
      {
        onConflict: "artist_id",
      },
    )

    if (upsertPublishingError) {
      throw createError({
        statusCode: 500,
        statusMessage: upsertPublishingError.message,
      })
    }

    await syncArtistPublishingInfoWriter({
      supabase,
      artistId,
      profileId: profile.id,
    })
  }

  if (publishingAction === "delete") {
    const { error: deletePublishingError } = await supabase
      .from("artist_publishing_info")
      .delete()
      .eq("artist_id", artistId)

    if (deletePublishingError) {
      throw createError({
        statusCode: 500,
        statusMessage: deletePublishingError.message,
      })
    }

    await unlinkArtistPublishingInfoWriter(supabase, artistId)
  }

  if (typeof body?.bankDetails !== "undefined") {
    const bankDetails = body.bankDetails

    if (isEmptyAdminBankDetails(bankDetails)) {
      const { error: deleteBankError } = await supabase
        .from("artist_bank_details")
        .delete()
        .eq("artist_id", artistId)

      if (deleteBankError) {
        throw createError({
          statusCode: 500,
          statusMessage: "Unable to update bank details.",
        })
      }
    } else if (bankDetails) {
      const bankPayload = buildAdminBankDetailsUpsert(profile.id, artistId, bankDetails)
      const { error: upsertBankError } = await supabase.from("artist_bank_details").upsert(bankPayload, {
        onConflict: "artist_id",
      })

      if (upsertBankError) {
        throw createError({
          statusCode: 500,
          statusMessage: "Unable to update bank details.",
        })
      }
    }

    bankDetailsChanged = true
    changedFields.push("bank_details")
  }

  if (typeof body?.dspProfiles !== "undefined") {
    await saveAdminDspProfiles(
      supabase,
      profile.id,
      artistId,
      String(artistUpdate.name ?? existingArtist.name),
      body.dspProfiles,
    )
    dspProfilesChanged = true
    changedFields.push("dsp_profiles")
  }

  if (typeof body?.socialLinks !== "undefined") {
    await saveAdminSocialLinks(
      supabase,
      profile.id,
      artistId,
      body.socialLinks,
    )
    socialLinksChanged = true
    changedFields.push("social_links")
  }

  if (artistChanged) {
    updatedSections.push("artist")
  }

  if (publishingChanged) {
    updatedSections.push("publishingInfo")
  }

  if (bankDetailsChanged) {
    updatedSections.push("bankDetails")
  }

  if (dspProfilesChanged) {
    updatedSections.push("dspProfiles")
  }

  if (socialLinksChanged) {
    updatedSections.push("socialLinks")
  }

  if (artistChanged || publishingChanged || bankDetailsChanged || dspProfilesChanged || socialLinksChanged) {
    await logAdminActivity(
      supabase,
      profile.id,
      "artist.updated",
      "artist",
      artistId,
      {
        artist_name: String(artistUpdate.name ?? existingArtist.name),
        changed_fields: changedFields,
        changed_sections: updatedSections,
        admin_managed_artist_settings: bankDetailsChanged || dspProfilesChanged || socialLinksChanged,
      },
    )
  }

  const { data: refreshedArtist, error: refreshedArtistError } = await supabase
    .from("artists")
    .select(adminArtistSelect)
    .eq("id", artistId)
    .single<AdminArtistRow>()

  if (refreshedArtistError) {
    throw createError({
      statusCode: 500,
      statusMessage: refreshedArtistError.message,
    })
  }

  return {
    ok: true,
    artist: await mapAdminArtistRow(supabase, refreshedArtist),
    updatedSections,
  } satisfies AdminArtistMutationResponse
})
