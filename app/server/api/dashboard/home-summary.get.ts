import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import type {
  ArtistDashboardHomeResponse,
  ArtistDashboardHomeSummaryResponse,
  ArtistWalletResponse,
} from "~~/types/dashboard"

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

function emptyHomeResponse(profileFullName = ""): ArtistDashboardHomeResponse {
  return {
    latestRelease: null,
    releaseLookup: [],
    setup: {
      profileFullName,
      artist: null,
    },
  }
}

function assertPayloadObject<T>(value: unknown, message: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createError({
      statusCode: 500,
      statusMessage: message,
    })
  }

  return value as T
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "dashboard home summary")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return {
      wallet: emptyWalletResponse(),
      home: emptyHomeResponse(scope.profile.full_name ?? ""),
    } satisfies ArtistDashboardHomeSummaryResponse
  }

  const supabase = serverSupabaseServiceRole(event)
  const [walletResult, homeResult] = await Promise.all([
    supabase.rpc("get_artist_dashboard_wallet_payload", {
      target_artist_ids: artistIds,
    }),
    supabase.rpc("get_artist_dashboard_home_payload", {
      target_artist_ids: artistIds,
      target_artist_owner_user_id: scope.artistOwnerUserId,
      target_profile_full_name: scope.profile.full_name ?? "",
      target_is_impersonating: scope.isImpersonating,
    }),
  ])

  if (walletResult.error || homeResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load dashboard home summary.",
    })
  }

  return {
    wallet: assertPayloadObject<ArtistWalletResponse>(walletResult.data, "Unable to load wallet summary."),
    home: assertPayloadObject<ArtistDashboardHomeResponse>(homeResult.data, "Unable to load dashboard home."),
  } satisfies ArtistDashboardHomeSummaryResponse
})
