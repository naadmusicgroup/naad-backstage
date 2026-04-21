import { createError, readBody } from "h3"
import { serverSupabaseClient } from "#supabase/server"
import { requireArtistProfile } from "~~/server/utils/auth"
import type {
  ArtistSettingsMutationResponse,
  UpdateArtistBankDetailsInput,
  UpdateArtistSettingsInput,
  UpdateArtistProfileInput,
  UpdateManagedArtistInput,
} from "~~/types/settings"

interface OwnedArtistRow {
  id: string
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = (value ?? "").trim()
  return normalized || null
}

function normalizeOptionalUrl(value: string | null | undefined) {
  const normalized = (value ?? "").trim()

  if (!normalized) {
    return null
  }

  try {
    return new URL(normalized).toString()
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Avatar URL must be a valid absolute URL.",
    })
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
  return {
    avatar_url: normalizeOptionalUrl(artist.avatarUrl),
    country: normalizeOptionalText(artist.country),
    bio: normalizeOptionalText(artist.bio),
  }
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

export default defineEventHandler(async (event) => {
  const { userId } = await requireArtistProfile(event)
  const body = await readBody<UpdateArtistSettingsInput>(event)
  const supabase = await serverSupabaseClient(event)

  const artistIds = new Set<string>()

  for (const item of [body.artist?.artistId, body.bankDetails?.artistId]) {
    if (item) {
      artistIds.add(item)
    }
  }

  let ownedArtistIds = new Set<string>()

  if (artistIds.size) {
    const { data: ownedArtists, error: ownedArtistsError } = await supabase
      .from("artists")
      .select("id")
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
    const { error } = await supabase
      .from("artists")
      .update(artistPayload)
      .eq("id", body.artist.artistId)
      .eq("user_id", userId)
      .eq("is_active", true)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
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

  if (!updatedSections.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No settings changes were provided.",
    })
  }

  return {
    ok: true,
    updatedSections,
  } satisfies ArtistSettingsMutationResponse
})
