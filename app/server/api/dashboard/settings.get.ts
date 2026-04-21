import { createError } from "h3"
import { serverSupabaseClient, serverSupabaseUser } from "#supabase/server"
import { requireArtistProfile } from "~~/server/utils/auth"
import type { ArtistSettingsArtistRecord, ArtistSettingsResponse } from "~~/types/settings"

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

interface ArtistSettingsRow {
  id: string
  name: string
  avatar_url: string | null
  country: string | null
  bio: string | null
  artist_bank_details: RelatedBankDetailsRow | RelatedBankDetailsRow[] | null
  artist_publishing_info: RelatedPublishingInfoRow | RelatedPublishingInfoRow[] | null
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function mapArtistRecord(row: ArtistSettingsRow): ArtistSettingsArtistRecord {
  const bankDetails = firstRelation(row.artist_bank_details)
  const publishingInfo = firstRelation(row.artist_publishing_info)

  return {
    artistId: row.id,
    artistName: row.name,
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
  }
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireArtistProfile(event)
  const user = await serverSupabaseUser(event)
  const supabase = await serverSupabaseClient(event)

  const [{ data: profile, error: profileError }, { data: artists, error: artistsError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", userId)
      .single<ProfileRow>(),
    supabase
      .from("artists")
      .select(
        "id, name, avatar_url, country, bio, artist_bank_details(account_name, bank_name, account_number, bank_address, updated_at), artist_publishing_info(legal_name, ipi_number, pro_name, updated_at)",
      )
      .eq("user_id", userId)
      .eq("is_active", true)
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
      email: user?.email ?? null,
    },
    artists: ((artists ?? []) as ArtistSettingsRow[]).map(mapArtistRecord),
  } satisfies ArtistSettingsResponse
})
