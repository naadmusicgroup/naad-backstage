import { createError, getQuery } from "h3"
import { serverSupabaseClient } from "~~/server/utils/supabase"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import {
  mapArtistPayoutOption,
  mapPayoutRequestRecord,
  MAX_PAYOUT_REQUESTS_PER_WINDOW,
  MIN_PAYOUT_AMOUNT,
  PAYOUT_REQUEST_WINDOW_HOURS,
} from "~~/server/utils/payouts"
import { toMoneyString } from "~~/server/utils/money"
import type { ArtistPayoutsResponse } from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const query = getQuery(event)
  const requestedArtistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const supabase = await serverSupabaseClient(event)

  const { data: artistRows, error: artistError } = await supabase
    .from("artists")
    .select("id, name")
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistError.message,
    })
  }

  const ownedArtists = artistRows ?? []
  const ownedArtistIds = ownedArtists.map((artist) => artist.id)

  if (requestedArtistId && !ownedArtistIds.includes(requestedArtistId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only load payout data for artist profiles on your own account.",
    })
  }

  const scopedArtists = requestedArtistId
    ? ownedArtists.filter((artist) => artist.id === requestedArtistId)
    : ownedArtists

  if (!scopedArtists.length) {
    return {
      artists: [],
      requests: [],
      minimumAmount: toMoneyString(MIN_PAYOUT_AMOUNT),
      maxRequestsPerWindow: MAX_PAYOUT_REQUESTS_PER_WINDOW,
      requestWindowHours: PAYOUT_REQUEST_WINDOW_HOURS,
    } satisfies ArtistPayoutsResponse
  }

  const artistIds = scopedArtists.map((artist) => artist.id)

  const { data: walletRows, error: walletError } = await supabase
    .from("artist_wallet")
    .select("artist_id, available_balance, pending_payouts, approved_payouts")
    .in("artist_id", artistIds)

  if (walletError) {
    throw createError({
      statusCode: 500,
      statusMessage: walletError.message,
    })
  }

  const { data: requestRows, error: requestError } = await supabase
    .from("payout_requests")
    .select(
      "id, artist_id, requested_by, amount, status, artist_notes, admin_notes, reviewed_by, reviewed_at, paid_at, payment_method, payment_reference, created_at, updated_at, artists!inner(id, name)",
    )
    .in("artist_id", artistIds)
    .order("created_at", { ascending: false })
    .limit(40)

  if (requestError) {
    throw createError({
      statusCode: 500,
      statusMessage: requestError.message,
    })
  }

  const walletByArtistId = new Map(
    ((walletRows ?? []) as any[]).map((row) => [
      row.artist_id,
      {
        availableBalance: row.available_balance,
        pendingPayouts: row.pending_payouts,
        approvedPayouts: row.approved_payouts,
      },
    ]),
  )
  const pendingArtistIds = new Set(
    ((requestRows ?? []) as any[]).filter((row) => row.status === "pending").map((row) => row.artist_id),
  )

  return {
    artists: scopedArtists.map((artist) =>
      mapArtistPayoutOption({
        artistId: artist.id,
        artistName: artist.name,
        availableBalance: walletByArtistId.get(artist.id)?.availableBalance ?? 0,
        pendingPayouts: walletByArtistId.get(artist.id)?.pendingPayouts ?? 0,
        approvedPayouts: walletByArtistId.get(artist.id)?.approvedPayouts ?? 0,
        hasPendingRequest: pendingArtistIds.has(artist.id),
      }),
    ),
    requests: ((requestRows ?? []) as any[]).map((row) => mapPayoutRequestRecord(row)),
    minimumAmount: toMoneyString(MIN_PAYOUT_AMOUNT),
    maxRequestsPerWindow: MAX_PAYOUT_REQUESTS_PER_WINDOW,
    requestWindowHours: PAYOUT_REQUEST_WINDOW_HOURS,
  } satisfies ArtistPayoutsResponse
})

