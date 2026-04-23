import { createError } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { toMoneyString } from "~~/server/utils/money"
import { mapAdminPublishingRecord } from "~~/server/utils/publishing"
import type { AdminPublishingOption, AdminPublishingResponse } from "~~/types/admin"

interface PublishingEntryRow {
  id: string
  artist_id: string
  release_id: string | null
  amount: string | number
  period_month: string
  notes: string | null
  entered_by: string
  ledger_entry_id: string | null
  created_at: string
  updated_at: string
  artists: { id: string; name: string } | Array<{ id: string; name: string }> | null
  releases: { id: string; title: string } | Array<{ id: string; title: string }> | null
}

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
}

interface ArtistOptionRow {
  id: string
  name: string
}

interface ReleaseOptionRow {
  id: string
  artist_id: string
  title: string
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

function displayProfileName(row: ProfileRow) {
  return row.full_name?.trim() || row.email?.trim() || null
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const [entriesResult, artistsResult, releasesResult] = await Promise.all([
    supabase
      .from("publishing_earnings")
      .select(
        "id, artist_id, release_id, amount, period_month, notes, entered_by, ledger_entry_id, created_at, updated_at, artists(id, name), releases(id, title)",
      )
      .order("period_month", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("artists")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("releases")
      .select("id, artist_id, title")
      .neq("status", "deleted")
      .order("title", { ascending: true }),
  ])

  throwIfError(entriesResult.error, "Unable to load publishing entries.")
  throwIfError(artistsResult.error, "Unable to load artist options.")
  throwIfError(releasesResult.error, "Unable to load release options.")

  const entries = (entriesResult.data ?? []) as PublishingEntryRow[]
  const profileIds = [...new Set(entries.map((row) => row.entered_by).filter(Boolean))]
  let profiles: ProfileRow[] = []

  if (profileIds.length) {
    const profilesResult = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds)

    throwIfError(profilesResult.error, "Unable to load publishing entry profiles.")
    profiles = (profilesResult.data ?? []) as ProfileRow[]
  }

  const profileById = new Map(profiles.map((row) => [row.id, displayProfileName(row)]))
  const totalAmount = entries.reduce((sum, row) => sum.add(row.amount ?? 0), new Decimal(0))
  const artistIds = new Set(entries.map((row) => row.artist_id))
  const releaseIds = new Set(entries.map((row) => row.release_id).filter(Boolean) as string[])
  const periodMonths = new Set(entries.map((row) => row.period_month))

  return {
    entries: entries.map((row) => mapAdminPublishingRecord(row, profileById)),
    summary: {
      entryCount: entries.length,
      totalAmount: toMoneyString(totalAmount),
      artistCount: artistIds.size,
      releaseCount: releaseIds.size,
      periodCount: periodMonths.size,
    },
    artistOptions: ((artistsResult.data ?? []) as ArtistOptionRow[]).map((row) => ({
      value: row.id,
      label: row.name,
    })) satisfies AdminPublishingOption[],
    releaseOptions: ((releasesResult.data ?? []) as ReleaseOptionRow[]).map((row) => ({
      value: row.id,
      label: row.title,
      meta: row.artist_id,
    })) satisfies AdminPublishingOption[],
  } satisfies AdminPublishingResponse
})
