import { createError } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { toMoneyString } from "~~/server/utils/money"
import { mapPayoutRequestRecord } from "~~/server/utils/payouts"
import type { AdminDashboardResponse } from "~~/types/admin"
import type { AdminActivityLogRecord } from "~~/types/settings"

interface RelatedBankDetailsRow {
  account_name: string
}

interface RelatedPublishingInfoRow {
  legal_name: string | null
  ipi_number: string | null
  pro_name: string | null
}

interface ActiveArtistRow {
  id: string
  name: string
  email: string | null
  country: string | null
  artist_bank_details: RelatedBankDetailsRow | RelatedBankDetailsRow[] | null
  artist_publishing_info: RelatedPublishingInfoRow | RelatedPublishingInfoRow[] | null
}

interface UploadArtistJoinRow {
  name: string
}

interface UploadRow {
  id: string
  artist_id: string
  filename: string
  status: "processing" | "completed" | "failed" | "reversed" | "abandoned"
  row_count: number | null
  matched_count: number | null
  unmatched_count: number | null
  total_amount: string | number | null
  period_month: string
  error_message: string | null
  created_at: string
  artists: UploadArtistJoinRow | UploadArtistJoinRow[] | null
}

interface StatementArtistJoinRow {
  name: string
}

interface StatementRow {
  id: string
  artist_id: string
  period_month: string
  status: "open" | "closed"
  closed_at: string | null
  artists: StatementArtistJoinRow | StatementArtistJoinRow[] | null
}

interface StatementSummaryRow {
  artist_id: string
  month: string
  revenue: string | number | null
}

interface UploadCountRow {
  artist_id: string
  period_month: string
}

interface ActivityRow {
  id: string
  admin_id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

interface ProfileRow {
  id: string
  full_name: string | null
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function detailRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

function periodKey(artistId: string, periodMonth: string) {
  return `${artistId}:${periodMonth}`
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const [
    activeArtistsResult,
    activeReleaseCountResult,
    activeTrackCountResult,
    completedUploadCountResult,
    awaitingCommitUploadCountResult,
    failedUploadCountResult,
    pendingPayoutCountResult,
    approvedPayoutCountResult,
    openStatementCountResult,
    closedStatementCountResult,
    recentUploadsResult,
    payoutQueueResult,
    recentStatementPeriodsResult,
    recentActivityResult,
  ] = await Promise.all([
    supabase
      .from("artists")
      .select(
        "id, name, email, country, artist_bank_details(account_name), artist_publishing_info(legal_name, ipi_number, pro_name)",
      )
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase.from("releases").select("id", { count: "exact", head: true }).in("status", ["draft", "live", "taken_down"]),
    supabase.from("tracks").select("id", { count: "exact", head: true }).in("status", ["draft", "live"]),
    supabase.from("csv_uploads").select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("csv_uploads").select("id", { count: "exact", head: true }).eq("status", "processing"),
    supabase.from("csv_uploads").select("id", { count: "exact", head: true }).in("status", ["failed", "abandoned"]),
    supabase.from("payout_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("payout_requests").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("statement_periods").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("statement_periods").select("id", { count: "exact", head: true }).eq("status", "closed"),
    supabase
      .from("csv_uploads")
      .select(
        "id, artist_id, filename, status, row_count, matched_count, unmatched_count, total_amount, period_month, error_message, created_at, artists!inner(name)",
      )
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("payout_requests")
      .select(
        "id, artist_id, requested_by, amount, status, artist_notes, admin_notes, reviewed_by, reviewed_at, paid_at, payment_method, payment_reference, created_at, updated_at, artists!inner(id, name, artist_bank_details(account_name, bank_name, account_number, bank_address, updated_at))",
      )
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("statement_periods")
      .select("id, artist_id, period_month, status, closed_at, artists!inner(name)")
      .order("period_month", { ascending: false })
      .limit(8),
    supabase
      .from("admin_activity_log")
      .select("id, admin_id, action, entity_type, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ])

  throwIfError(activeArtistsResult.error, "Unable to load active artists.")
  throwIfError(activeReleaseCountResult.error, "Unable to count active releases.")
  throwIfError(activeTrackCountResult.error, "Unable to count active tracks.")
  throwIfError(completedUploadCountResult.error, "Unable to count completed uploads.")
  throwIfError(awaitingCommitUploadCountResult.error, "Unable to count in-flight uploads.")
  throwIfError(failedUploadCountResult.error, "Unable to count failed uploads.")
  throwIfError(pendingPayoutCountResult.error, "Unable to count pending payouts.")
  throwIfError(approvedPayoutCountResult.error, "Unable to count approved payouts.")
  throwIfError(openStatementCountResult.error, "Unable to count open statement periods.")
  throwIfError(closedStatementCountResult.error, "Unable to count closed statement periods.")
  throwIfError(recentUploadsResult.error, "Unable to load recent uploads.")
  throwIfError(payoutQueueResult.error, "Unable to load payout queue.")
  throwIfError(recentStatementPeriodsResult.error, "Unable to load statement periods.")
  throwIfError(recentActivityResult.error, "Unable to load recent activity.")

  const activeArtists = (activeArtistsResult.data ?? []) as ActiveArtistRow[]
  const recentUploads = (recentUploadsResult.data ?? []) as UploadRow[]
  const payoutQueueRows = (payoutQueueResult.data ?? []) as any[]
  const recentStatementPeriods = (recentStatementPeriodsResult.data ?? []) as StatementRow[]
  const recentActivityRows = (recentActivityResult.data ?? []) as ActivityRow[]

  const pendingAmount = payoutQueueRows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum.add(row.amount ?? 0), new Decimal(0))
  const approvedAmount = payoutQueueRows
    .filter((row) => row.status === "approved")
    .reduce((sum, row) => sum.add(row.amount ?? 0), new Decimal(0))

  const profileIds = [...new Set(recentActivityRows.map((row) => row.admin_id))]
  let profiles: ProfileRow[] = []

  if (profileIds.length) {
    const profileResult = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds)

    throwIfError(profileResult.error, "Unable to load admin activity profiles.")
    profiles = (profileResult.data ?? []) as ProfileRow[]
  }

  const profileById = new Map(profiles.map((row) => [row.id, row.full_name]))

  const statementArtistIds = [...new Set(recentStatementPeriods.map((row) => row.artist_id))]
  const statementMonths = [...new Set(recentStatementPeriods.map((row) => row.period_month))]
  const statementEarnings = new Map<string, Decimal>()
  const statementUploads = new Map<string, number>()

  if (statementArtistIds.length && statementMonths.length) {
    const [summaryResult, uploadCountResult] = await Promise.all([
      supabase
        .from("monthly_earnings_summary")
        .select("artist_id, month, revenue")
        .in("artist_id", statementArtistIds)
        .in("month", statementMonths),
      supabase
        .from("csv_uploads")
        .select("artist_id, period_month")
        .in("artist_id", statementArtistIds)
        .in("period_month", statementMonths)
        .in("status", ["completed", "reversed"]),
    ])

    throwIfError(summaryResult.error, "Unable to load statement revenue totals.")
    throwIfError(uploadCountResult.error, "Unable to load statement upload counts.")

    for (const row of (summaryResult.data ?? []) as StatementSummaryRow[]) {
      const key = periodKey(row.artist_id, row.month)
      statementEarnings.set(key, (statementEarnings.get(key) ?? new Decimal(0)).add(row.revenue ?? 0))
    }

    for (const row of (uploadCountResult.data ?? []) as UploadCountRow[]) {
      const key = periodKey(row.artist_id, row.period_month)
      statementUploads.set(key, (statementUploads.get(key) ?? 0) + 1)
    }
  }

  const readiness = activeArtists
    .map((artist) => {
      const bankDetails = firstRelation(artist.artist_bank_details)
      const publishingInfo = firstRelation(artist.artist_publishing_info)
      const hasPublishingInfo = Boolean(
        publishingInfo && (publishingInfo.legal_name || publishingInfo.ipi_number || publishingInfo.pro_name),
      )

      return {
        id: artist.id,
        name: artist.name,
        email: artist.email,
        country: artist.country,
        missingBankDetails: !bankDetails,
        missingPublishingInfo: !hasPublishingInfo,
      }
    })
    .filter((artist) => artist.missingBankDetails || artist.missingPublishingInfo)
    .sort((left, right) => {
      const leftPriority = Number(left.missingBankDetails) + Number(left.missingPublishingInfo)
      const rightPriority = Number(right.missingBankDetails) + Number(right.missingPublishingInfo)

      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority
      }

      return left.name.localeCompare(right.name)
    })
    .slice(0, 8)

  const activity = recentActivityRows.map((row) => ({
    id: row.id,
    adminId: row.admin_id,
    adminName: profileById.get(row.admin_id) ?? null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: detailRecord(row.details),
    createdAt: row.created_at,
  })) satisfies AdminActivityLogRecord[]

  return {
    summary: {
      activeArtistCount: activeArtists.length,
      activeReleaseCount: activeReleaseCountResult.count ?? 0,
      activeTrackCount: activeTrackCountResult.count ?? 0,
      completedUploadCount: completedUploadCountResult.count ?? 0,
      awaitingCommitUploadCount: awaitingCommitUploadCountResult.count ?? 0,
      failedUploadCount: failedUploadCountResult.count ?? 0,
      pendingPayoutCount: pendingPayoutCountResult.count ?? 0,
      pendingPayoutAmount: toMoneyString(pendingAmount),
      approvedPayoutCount: approvedPayoutCountResult.count ?? 0,
      approvedPayoutAmount: toMoneyString(approvedAmount),
      openStatementCount: openStatementCountResult.count ?? 0,
      closedStatementCount: closedStatementCountResult.count ?? 0,
      artistsMissingBankDetailsCount: activeArtists.filter((artist) => !firstRelation(artist.artist_bank_details)).length,
      artistsMissingPublishingInfoCount: activeArtists.filter((artist) => {
        const publishingInfo = firstRelation(artist.artist_publishing_info)
        return !(publishingInfo && (publishingInfo.legal_name || publishingInfo.ipi_number || publishingInfo.pro_name))
      }).length,
    },
    recentUploads: recentUploads.map((row) => ({
      id: row.id,
      artistId: row.artist_id,
      artistName: firstRelation(row.artists)?.name ?? "Unknown artist",
      filename: row.filename,
      status: row.status,
      rowCount: row.row_count,
      matchedCount: row.matched_count,
      unmatchedCount: row.unmatched_count,
      totalAmount: row.total_amount === null ? null : toMoneyString(row.total_amount),
      periodMonth: row.period_month,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    })),
    payoutQueue: payoutQueueRows.map((row) => mapPayoutRequestRecord(row)),
    recentStatementPeriods: recentStatementPeriods.map((row) => ({
      id: row.id,
      artistId: row.artist_id,
      artistName: firstRelation(row.artists)?.name ?? "Unknown artist",
      periodMonth: row.period_month,
      status: row.status,
      closedAt: row.closed_at,
      earnings: toMoneyString(statementEarnings.get(periodKey(row.artist_id, row.period_month)) ?? 0),
      uploadCount: statementUploads.get(periodKey(row.artist_id, row.period_month)) ?? 0,
    })),
    artistReadiness: readiness,
    recentActivity: activity,
  } satisfies AdminDashboardResponse
})

