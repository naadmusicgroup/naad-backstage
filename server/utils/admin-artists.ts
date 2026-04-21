import type { SupabaseClient } from "@supabase/supabase-js"
import type { AdminArtistOverview } from "~~/types/settings"

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

interface LinkedProfileRow {
  id: string
  login_frozen_at: string | null
  login_frozen_by: string | null
}

interface ProfileNameRow {
  id: string
  full_name: string | null
}

export interface AdminArtistRow {
  id: string
  user_id: string | null
  name: string
  email: string | null
  avatar_url: string | null
  country: string | null
  bio: string | null
  is_active: boolean
  created_at: string
  profiles: LinkedProfileRow | LinkedProfileRow[] | null
  artist_bank_details: RelatedBankDetailsRow | RelatedBankDetailsRow[] | null
  artist_publishing_info: RelatedPublishingInfoRow | RelatedPublishingInfoRow[] | null
}

export const adminArtistSelect =
  "id, user_id, name, email, avatar_url, country, bio, is_active, created_at, profiles!artists_user_id_fkey(id, login_frozen_at, login_frozen_by), artist_bank_details(account_name, bank_name, account_number, bank_address, updated_at), artist_publishing_info(legal_name, ipi_number, pro_name, updated_at)"

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

async function loadArtistAccountContext(
  supabase: SupabaseClient<any>,
  rows: AdminArtistRow[],
) {
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean) as string[])]
  const frozenByIds = [...new Set(
    rows
      .map((row) => firstRelation(row.profiles)?.login_frozen_by)
      .filter(Boolean) as string[],
  )]

  const linkedCountByUserId = new Map<string, number>()
  const frozenByNameById = new Map<string, string | null>()

  if (userIds.length) {
    const { data, error } = await supabase
      .from("artists")
      .select("user_id")
      .in("user_id", userIds)

    if (error) {
      throw error
    }

    for (const row of (data ?? []) as Array<{ user_id: string | null }>) {
      if (!row.user_id) {
        continue
      }

      linkedCountByUserId.set(row.user_id, (linkedCountByUserId.get(row.user_id) ?? 0) + 1)
    }
  }

  if (frozenByIds.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", frozenByIds)

    if (error) {
      throw error
    }

    for (const row of (data ?? []) as ProfileNameRow[]) {
      frozenByNameById.set(row.id, row.full_name)
    }
  }

  return {
    linkedCountByUserId,
    frozenByNameById,
  }
}

function mapArtistRow(
  row: AdminArtistRow,
  context: Awaited<ReturnType<typeof loadArtistAccountContext>>,
): AdminArtistOverview {
  const bankDetails = firstRelation(row.artist_bank_details)
  const publishingInfo = firstRelation(row.artist_publishing_info)
  const linkedProfile = firstRelation(row.profiles)

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    country: row.country,
    bio: row.bio,
    isActive: row.is_active,
    loginFrozenAt: linkedProfile?.login_frozen_at ?? null,
    loginFrozenBy: linkedProfile?.login_frozen_by ?? null,
    loginFrozenByName: linkedProfile?.login_frozen_by
      ? (context.frozenByNameById.get(linkedProfile.login_frozen_by) ?? null)
      : null,
    sharedAccountArtistCount: row.user_id ? (context.linkedCountByUserId.get(row.user_id) ?? 1) : 0,
    createdAt: row.created_at,
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

export async function mapAdminArtistRows(
  supabase: SupabaseClient<any>,
  rows: AdminArtistRow[],
) {
  const context = await loadArtistAccountContext(supabase, rows)
  return rows.map((row) => mapArtistRow(row, context))
}

export async function mapAdminArtistRow(
  supabase: SupabaseClient<any>,
  row: AdminArtistRow,
) {
  const [mappedRow] = await mapAdminArtistRows(supabase, [row])
  return mappedRow
}
