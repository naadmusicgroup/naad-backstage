import { createError, getQuery } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseClient } from "#supabase/server"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import { toMoneyString } from "~~/server/utils/money"
import type { ArtistActivityItem, ArtistWalletResponse } from "~~/types/dashboard"

function labelForLedger(type: string, description: string) {
  switch (type) {
    case "csv_import":
      return description || "Earnings received"
    case "publishing":
      return "Publishing credit"
    case "due_charge":
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

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const query = getQuery(event)
  const requestedArtistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const supabase = await serverSupabaseClient(event)
  const { data: artistRows, error: artistError } = await supabase
    .from("artists")
    .select("id")
    .eq("user_id", profile.id)
    .eq("is_active", true)

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistError.message,
    })
  }

  const ownedArtistIds = (artistRows ?? []).map((artist) => artist.id)

  if (requestedArtistId && !ownedArtistIds.includes(requestedArtistId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only load wallet data for artist profiles on your own account.",
    })
  }

  const artistIds = requestedArtistId ? [requestedArtistId] : ownedArtistIds

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

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("transaction_ledger")
    .select("id, type, amount, description, created_at")
    .in("artist_id", artistIds)
    .neq("type", "csv_reversal")
    .order("created_at", { ascending: false })
    .limit(8)

  if (ledgerError) {
    throw createError({
      statusCode: 500,
      statusMessage: ledgerError.message,
    })
  }

  const recentTransactions: ArtistActivityItem[] = (ledgerRows ?? []).map((row: any) => ({
    id: row.id,
    label: labelForLedger(row.type, row.description),
    description: row.description || labelForLedger(row.type, row.description),
    amount: toMoneyString(row.amount),
    createdAt: row.created_at,
  }))

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
  } satisfies ArtistWalletResponse
})
