import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  adminArtistSelect,
  mapAdminArtistRow,
  type AdminArtistRow,
} from "~~/server/utils/admin-artists"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  isUniqueViolation,
  normalizeOptionalHttpUrl,
  normalizeOptionalText,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import type {
  AdminArtistMutationResponse,
  UpdateAdminArtistInput,
} from "~~/types/settings"

interface RelatedPublishingInfoRow {
  legal_name: string | null
  ipi_number: string | null
  pro_name: string | null
  updated_at: string | null
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

  const artistUpdate: Record<string, string | null> = {}
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
  let artistChanged = false
  let publishingChanged = false

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

  if (typeof body?.avatarUrl !== "undefined") {
    const normalizedAvatarUrl = normalizeOptionalHttpUrl(body.avatarUrl, "Avatar URL")

    if (normalizedAvatarUrl !== existingArtist.avatar_url) {
      artistUpdate.avatar_url = normalizedAvatarUrl
      changedFields.push("avatar_url")
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

    if (!existingArtist.user_id) {
      throw createError({
        statusCode: 409,
        statusMessage: "This artist no longer has a live login attached. Restore dashboard access before changing the login email.",
      })
    }

    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(existingArtist.user_id, {
      email: nextEmail,
      email_confirm: true,
    })

    if (authUpdateError) {
      throw createError(mapAuthUpdateError(authUpdateError))
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
  }

  if (artistChanged) {
    updatedSections.push("artist")
  }

  if (publishingChanged) {
    updatedSections.push("publishingInfo")
  }

  if (artistChanged || publishingChanged) {
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
