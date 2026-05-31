import { getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import { throwSupabaseError } from "~~/server/utils/supabase-pagination"
import { normalizeStatementEarningsFilters } from "~~/server/utils/statement-earnings"
import { dspLogoKeyForName } from "~~/app/utils/dsp-logos"
import type { ArtistStatementEarningsResponse } from "~~/types/dashboard"

function emptyResponse(pageSize: number): ArtistStatementEarningsResponse {
  return {
    rows: [],
    summary: {
      totalRevenue: "0.00000000",
      totalUnits: 0,
      processedRowCount: 0,
      groupedRowCount: 0,
    },
    filterOptions: {
      releases: [],
      territories: [],
      channels: [],
    },
    pagination: {
      page: 1,
      pageSize,
      totalCount: 0,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    },
  }
}

function addLogoKeys(response: ArtistStatementEarningsResponse): ArtistStatementEarningsResponse {
  return {
    ...response,
    rows: response.rows.map((row) => ({
      ...row,
      logoKey: dspLogoKeyForName(row.channelName),
    })),
    filterOptions: {
      ...response.filterOptions,
      channels: response.filterOptions.channels.map((channel) => ({
        ...channel,
        logoKey: dspLogoKeyForName(channel.label),
      })),
    },
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "statement earnings")
  const filters = normalizeStatementEarningsFilters(query)

  if (!scope.artistIds.length) {
    return emptyResponse(filters.pageSize)
  }

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase.rpc("get_statement_earnings_page_payload", {
    target_artist_ids: scope.artistIds,
    target_page: filters.page,
    target_page_size: filters.pageSize,
    target_period_month: filters.periodMonth || null,
    target_period_start_month: filters.periodStartMonth || null,
    target_period_end_month: filters.periodEndMonth || null,
    target_release_id: filters.releaseId || null,
    target_channel_id: filters.channelId || null,
    target_territory: filters.territory || null,
  })

  throwSupabaseError(error, "Unable to load statement earnings.")

  return addLogoKeys((data ?? emptyResponse(filters.pageSize)) as ArtistStatementEarningsResponse)
})
