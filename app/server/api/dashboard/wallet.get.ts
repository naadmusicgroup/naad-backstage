import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import type { ArtistWalletResponse } from "~~/types/dashboard"

function emptyWalletResponse(): ArtistWalletResponse {
  const now = new Date().toISOString()
  const currentYear = new Date().getUTCFullYear()

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
    statementYears: [currentYear],
    statementSummary: {
      year: currentYear,
      openingBalance: "0.00000000",
      closingBalance: "0.00000000",
      from: now,
      to: now,
      transactionCount: 0,
    },
    statementTransactions: [],
    dues: [],
  }
}

function surfaceFromQuery(value: unknown) {
  return String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim()
}

function statementYearFromQuery(value: unknown) {
  const raw = String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim()
  const year = Number(raw)

  if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
    return year
  }

  return new Date().getUTCFullYear()
}

function statementYearStart(year: number) {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString()
}

function statementYearEnd(year: number) {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString()
}

function isLegacyWalletRpcSignatureError(error: { code?: string } | null) {
  return error?.code === "PGRST202"
}

function withStatementFallback(data: ArtistWalletResponse, statementYear: number): ArtistWalletResponse {
  return {
    ...data,
    statementYears: data.statementYears?.length ? data.statementYears : [statementYear],
    statementSummary: data.statementSummary ?? {
      year: statementYear,
      openingBalance: data.availableBalance,
      closingBalance: data.availableBalance,
      from: statementYearStart(statementYear),
      to: statementYearEnd(statementYear),
      transactionCount: 0,
    },
    statementTransactions: data.statementTransactions ?? [],
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const isDashboardHomeSurface = surfaceFromQuery(query.surface) === "dashboard_home"
  const statementYear = statementYearFromQuery(query.statementYear)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "wallet data")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return emptyWalletResponse()
  }

  const supabase = serverSupabaseServiceRole(event)
  let { data, error } = await supabase.rpc(
    isDashboardHomeSurface ? "get_artist_dashboard_wallet_payload" : "get_artist_wallet_payload",
    isDashboardHomeSurface
      ? { target_artist_ids: artistIds }
      : {
          target_artist_ids: artistIds,
          statement_year: statementYear,
        },
  )

  if (!isDashboardHomeSurface && isLegacyWalletRpcSignatureError(error)) {
    const legacyResult = await supabase.rpc("get_artist_wallet_payload", { target_artist_ids: artistIds })
    data = legacyResult.data
    error = legacyResult.error
  }

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load wallet data.",
    })
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load wallet data.",
    })
  }

  return withStatementFallback(data as ArtistWalletResponse, statementYear)
})
