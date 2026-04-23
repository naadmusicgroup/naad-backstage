import { createError, getQuery } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseClient } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import { toMoneyString } from "~~/server/utils/money"
import type { ArtistActivityItem, ArtistDueItem, ArtistWalletResponse } from "~~/types/dashboard"

interface DueRow {
  id: string
  artist_id: string
  title: string
  amount: string | number
  status: ArtistDueItem["status"]
  due_date: string | null
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
  artists: { id: string; name: string } | Array<{ id: string; name: string }> | null
}

function labelForLedger(type: string, description: string) {
  switch (type) {
    case "csv_import":
      return description || "Earnings received"
    case "publishing":
      return "Publishing credit"
    case "due_charge":
      if (description.toLowerCase().includes("cancelled")) {
        return "Fee cancelled"
      }

      if (description.toLowerCase().includes("adjusted")) {
        return "Fee adjusted"
      }

      return "Fee charged"
    case "payout_pending":
      return "Payout requested"
    case "payout_rejected":
      return "Payout rejected"
    case "adjustment":
      return "Balance adjustment"
    default:
      return "Account activity"
  }
}

function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const supabase = await serverSupabaseClient(event)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "wallet data")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return {
      totalEarned: "0.00000000",
      availableBalance: "0.00000000",
      visibleBalance: "0.00000000",
      totalDues: "0.00000000",
      reservedPayouts: "0.00000000",
      pendingPayouts: "0.00000000",
      approvedPayouts: "0.00000000",
      totalWithdrawn: "0.00000000",
      balanceSettling: false,
      recentTransactions: [],
      dues: [],
    } satisfies ArtistWalletResponse
  }

  const { data: walletRows, error: walletError } = await supabase
    .from("artist_wallet")
    .select(
      "artist_id, total_earned, total_dues, pending_payouts, approved_payouts, total_withdrawn, available_balance",
    )
    .in("artist_id", artistIds)

  if (walletError) {
    throw createError({
      statusCode: 500,
      statusMessage: walletError.message,
    })
  }

  const totals = {
    totalEarned: new Decimal(0),
    availableBalance: new Decimal(0),
    totalDues: new Decimal(0),
    pendingPayouts: new Decimal(0),
    approvedPayouts: new Decimal(0),
    totalWithdrawn: new Decimal(0),
  }

  for (const row of walletRows ?? []) {
    totals.totalEarned = totals.totalEarned.add(row.total_earned ?? 0)
    totals.availableBalance = totals.availableBalance.add(row.available_balance ?? 0)
    totals.totalDues = totals.totalDues.add(row.total_dues ?? 0)
    totals.pendingPayouts = totals.pendingPayouts.add(row.pending_payouts ?? 0)
    totals.approvedPayouts = totals.approvedPayouts.add(row.approved_payouts ?? 0)
    totals.totalWithdrawn = totals.totalWithdrawn.add(row.total_withdrawn ?? 0)
  }

  const reservedPayouts = totals.pendingPayouts.add(totals.approvedPayouts)
  const visibleBalance = Decimal.max(totals.availableBalance, 0)

  const [ledgerResult, duesResult] = await Promise.all([
    supabase
      .from("transaction_ledger")
      .select("id, type, amount, description, created_at")
      .in("artist_id", artistIds)
      .neq("type", "csv_reversal")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("dues")
      .select("id, artist_id, title, amount, status, due_date, paid_at, cancelled_at, created_at, artists(id, name)")
      .in("artist_id", artistIds)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  if (ledgerResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: ledgerResult.error.message,
    })
  }

  if (duesResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: duesResult.error.message,
    })
  }

  const recentTransactions: ArtistActivityItem[] = (ledgerResult.data ?? []).map((row: any) => ({
    id: row.id,
    label: labelForLedger(row.type, row.description),
    description: row.description || labelForLedger(row.type, row.description),
    amount: toMoneyString(row.amount),
    createdAt: row.created_at,
  }))
  const dues: ArtistDueItem[] = ((duesResult.data ?? []) as DueRow[]).map((row) => {
    const artist = unwrapJoinRow(row.artists)

    return {
      id: row.id,
      artistId: row.artist_id,
      artistName: artist?.name ?? "Unknown artist",
      title: row.title,
      amount: toMoneyString(row.amount),
      status: row.status,
      dueDate: row.due_date,
      paidAt: row.paid_at,
      cancelledAt: row.cancelled_at,
      createdAt: row.created_at,
    }
  })

  return {
    totalEarned: toMoneyString(totals.totalEarned),
    availableBalance: toMoneyString(totals.availableBalance),
    visibleBalance: toMoneyString(visibleBalance),
    totalDues: toMoneyString(totals.totalDues),
    reservedPayouts: toMoneyString(reservedPayouts),
    pendingPayouts: toMoneyString(totals.pendingPayouts),
    approvedPayouts: toMoneyString(totals.approvedPayouts),
    totalWithdrawn: toMoneyString(totals.totalWithdrawn),
    balanceSettling: totals.availableBalance.isNegative(),
    recentTransactions,
    dues,
  } satisfies ArtistWalletResponse
})

