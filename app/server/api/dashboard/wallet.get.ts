import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import type { ArtistWalletResponse } from "~~/types/dashboard"

function emptyWalletResponse(): ArtistWalletResponse {
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
  }
}

function surfaceFromQuery(value: unknown) {
  return String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim()
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const isDashboardHomeSurface = surfaceFromQuery(query.surface) === "dashboard_home"
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "wallet data")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return emptyWalletResponse()
  }

  const { data, error } = await serverSupabaseServiceRole(event)
    .rpc(isDashboardHomeSurface ? "get_artist_dashboard_wallet_payload" : "get_artist_wallet_payload", {
      target_artist_ids: artistIds,
    })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to load wallet data.",
    })
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load wallet data.",
    })
  }

  return data as ArtistWalletResponse
})
