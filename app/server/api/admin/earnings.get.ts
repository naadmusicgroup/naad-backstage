import { createError, getQuery } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  assertArtistExists,
  assertReleaseExists,
  assertTrackExists,
  normalizeEffectivePeriodMonth,
  normalizeOptionalUuidQueryParam,
} from "~~/server/utils/catalog"
import { dspLogoKeyForName } from "~~/app/utils/dsp-logos"
import type { AdminEarningsLedgerResponse, EarningType } from "~~/types/admin"

interface EarningsLedgerFilters {
  artistId: string
  releaseId: string
  trackId: string
  channelId: string
  territory: string
  periodMonth: string
  earningType: EarningType | ""
}

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const EARNING_TYPES = new Set<EarningType>(["original", "adjustment", "reversal"])

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function normalizePositiveIntegerQueryParam(value: unknown, label: string, defaultValue: number) {
  const normalized = firstQueryValue(value)

  if (normalized === undefined || normalized === null || normalized === "") {
    return defaultValue
  }

  const numeric = Number(String(normalized).trim())

  if (!Number.isInteger(numeric) || numeric < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a positive whole number.`,
    })
  }

  return numeric
}

function normalizeOptionalTextQueryParam(value: unknown) {
  const normalized = String(firstQueryValue(value) ?? "").trim()

  if (!normalized || normalized.toLowerCase() === "all" || normalized.toLowerCase() === "null") {
    return ""
  }

  return normalized
}

function normalizeOptionalPeriodMonthQueryParam(value: unknown) {
  const normalized = normalizeOptionalTextQueryParam(value)

  if (!normalized) {
    return ""
  }

  return normalizeEffectivePeriodMonth(normalized, "Period month")
}

function normalizeOptionalEarningType(value: unknown) {
  const normalized = normalizeOptionalTextQueryParam(value).toLowerCase() as EarningType

  if (!normalized) {
    return ""
  }

  if (!EARNING_TYPES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Earning type must be original, adjustment, or reversal.",
    })
  }

  return normalized
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

async function assertRelatedFiltersExist(supabase: SupabaseClient<any>, filters: EarningsLedgerFilters) {
  if (filters.artistId) {
    await assertArtistExists(supabase, filters.artistId)
  }

  if (filters.releaseId) {
    await assertReleaseExists(supabase, filters.releaseId)
  }

  if (filters.trackId) {
    await assertTrackExists(supabase, filters.trackId)
  }

  if (filters.channelId) {
    const { data, error } = await supabase
      .from("channels")
      .select("id")
      .eq("id", filters.channelId)
      .maybeSingle()

    throwIfError(error, "Unable to validate the selected channel.")

    if (!data) {
      throw createError({
        statusCode: 404,
        statusMessage: "The selected channel does not exist.",
      })
    }
  }
}

function withDspLogoKeys(payload: AdminEarningsLedgerResponse): AdminEarningsLedgerResponse {
  return {
    ...payload,
    rows: payload.rows.map((row) => ({
      ...row,
      logoKey: dspLogoKeyForName(row.channelName),
    })),
    filterOptions: {
      ...payload.filterOptions,
      channels: payload.filterOptions.channels.map((option) => ({
        ...option,
        logoKey: dspLogoKeyForName(option.label),
      })),
    },
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const requestedPage = normalizePositiveIntegerQueryParam(query.page, "Page", 1)
  const requestedPageSize = Math.min(
    normalizePositiveIntegerQueryParam(query.pageSize, "Page size", DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  )
  const supabase = serverSupabaseServiceRole(event)
  const filters: EarningsLedgerFilters = {
    artistId: normalizeOptionalUuidQueryParam(firstQueryValue(query.artistId), "Artist id"),
    releaseId: normalizeOptionalUuidQueryParam(firstQueryValue(query.releaseId), "Release id"),
    trackId: normalizeOptionalUuidQueryParam(firstQueryValue(query.trackId), "Track id"),
    channelId: normalizeOptionalUuidQueryParam(firstQueryValue(query.channelId), "Channel id"),
    territory: normalizeOptionalTextQueryParam(query.territory),
    periodMonth: normalizeOptionalPeriodMonthQueryParam(query.periodMonth),
    earningType: normalizeOptionalEarningType(query.earningType),
  }

  await assertRelatedFiltersExist(supabase, filters)

  const { data, error } = await supabase.rpc("get_admin_earnings_payload", {
    target_page: requestedPage,
    target_page_size: requestedPageSize,
    target_artist_id: filters.artistId || null,
    target_release_id: filters.releaseId || null,
    target_track_id: filters.trackId || null,
    target_channel_id: filters.channelId || null,
    target_territory: filters.territory || null,
    target_period_month: filters.periodMonth || null,
    target_earning_type: filters.earningType || null,
  })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to load earnings entries.",
    })
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load earnings entries.",
    })
  }

  return withDspLogoKeys(data as AdminEarningsLedgerResponse)
})
