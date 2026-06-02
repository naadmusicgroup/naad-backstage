import { createError, getQuery } from "h3"
import Decimal from "decimal.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { toMoneyString } from "~~/server/utils/money"
import { fetchAllPages } from "~~/server/utils/supabase-pagination"
import {
  DEFAULT_ANALYTICS_PERIOD_RANGE,
  analyticsMonthRange,
  type AnalyticsPeriodRange,
} from "~~/app/utils/analytics-periods"
import { dspLogoKeyForName } from "~~/app/utils/dsp-logos"
import type {
  AdminAnalyticsFinancialArtistRow,
  AdminAnalyticsResponse,
  AdminAnalyticsRevenueRow,
} from "~~/types/admin"

interface AdminAnalyticsRevenueRpcRow {
  artist_id: string
  artist_name: string | null
  month: string
  channel_id: string | null
  channel_name: string | null
  territory: string | null
  release_id?: string | null
  release_title?: string | null
  release_cover_art_url?: string | null
  release_cover_thumb_url?: string | null
  track_id?: string | null
  track_title?: string | null
  track_isrc?: string | null
  upload_id?: string | null
  upload_filename?: string | null
  revenue: string | number | null
  streams: string | number | null
  row_count?: string | number | null
}

interface NormalizedRevenueRow extends AdminAnalyticsRevenueRow {
  rawRevenue: string | number | null
}

interface AdminAnalyticsFinancialRpcRow {
  artist_id: string
  artist_name: string | null
  total_earned: string | number | null
  total_dues: string | number | null
  artist_dues: string | number | null
  payout_service_fees: string | number | null
  pending_payouts: string | number | null
  approved_payouts: string | number | null
  total_withdrawn: string | number | null
  available_balance: string | number | null
}

function normalizeCountryCode(value: string | null | undefined) {
  const code = String(value ?? "").trim().toUpperCase()

  if (code === "UK") {
    return "GB"
  }

  if (!/^[A-Z]{2}$/.test(code) || ["EU", "WW", "XX", "ZZ"].includes(code)) {
    return null
  }

  return code
}

function countryNameForCode(code: string | null) {
  if (!code) {
    return "Unknown country"
  }

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

function analyticsPeriodRangeFromQuery(value: unknown): AnalyticsPeriodRange {
  const requested = Array.isArray(value) ? value[0] : value

  if (
    requested === "last_3_months"
    || requested === "last_6_months"
    || requested === "last_12_months"
    || requested === "ytd"
    || requested === "all_time"
  ) {
    return requested
  }

  return DEFAULT_ANALYTICS_PERIOD_RANGE
}

function monthDateFromKey(value: string | null | undefined) {
  return value ? `${value}-01` : null
}

function cleanText(value: string | null | undefined) {
  return String(value ?? "").trim()
}

function mapRevenueRow(row: AdminAnalyticsRevenueRpcRow): NormalizedRevenueRow {
  const artistName = cleanText(row.artist_name) || "Unknown artist"
  const channelName = row.channel_id
    ? cleanText(row.channel_name) || "Unknown channel"
    : "Unassigned channel"
  const countryCode = normalizeCountryCode(row.territory)

  return {
    artistId: row.artist_id,
    artistName,
    periodMonth: row.month,
    channelId: row.channel_id,
    channelName,
    logoKey: dspLogoKeyForName(channelName),
    countryCode,
    countryName: countryNameForCode(countryCode),
    releaseId: row.release_id ?? null,
    releaseTitle: cleanText(row.release_title) || null,
    releaseCoverArtUrl: cleanText(row.release_cover_art_url) || null,
    releaseCoverThumbUrl: cleanText(row.release_cover_thumb_url) || null,
    trackId: row.track_id ?? null,
    trackTitle: cleanText(row.track_title) || null,
    trackIsrc: cleanText(row.track_isrc) || null,
    uploadId: row.upload_id ?? null,
    uploadFilename: cleanText(row.upload_filename) || null,
    revenue: toMoneyString(row.revenue ?? 0),
    rawRevenue: row.revenue,
    streams: Number(row.streams ?? 0),
    rowCount: Number(row.row_count ?? 1),
  }
}

async function fetchFinancialRows(supabase: SupabaseClient<any>) {
  const { data, error } = await supabase.rpc("get_admin_analytics_financial_rows")

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to load financial analytics.",
    })
  }

  return ((Array.isArray(data) ? data : []) as AdminAnalyticsFinancialRpcRow[])
    .map((row): AdminAnalyticsFinancialArtistRow => {
      return {
        artistId: row.artist_id,
        artistName: cleanText(row.artist_name) || "Unknown artist",
        totalEarned: toMoneyString(row.total_earned ?? 0),
        totalDues: toMoneyString(row.total_dues ?? 0),
        artistDues: toMoneyString(row.artist_dues ?? 0),
        payoutServiceFees: toMoneyString(row.payout_service_fees ?? 0),
        pendingPayouts: toMoneyString(row.pending_payouts ?? 0),
        approvedPayouts: toMoneyString(row.approved_payouts ?? 0),
        totalWithdrawn: toMoneyString(row.total_withdrawn ?? 0),
        availableBalance: toMoneyString(row.available_balance ?? 0),
      }
    })
    .sort((left, right) => Number(right.totalEarned) - Number(left.totalEarned))
}

function buildFinancialSummary(rows: AdminAnalyticsFinancialArtistRow[]) {
  const totals = rows.reduce((summary, row) => ({
    lifetimeEarnings: summary.lifetimeEarnings.add(row.totalEarned),
    totalDues: summary.totalDues.add(row.totalDues),
    artistDues: summary.artistDues.add(row.artistDues),
    payoutServiceFees: summary.payoutServiceFees.add(row.payoutServiceFees),
    pendingPayouts: summary.pendingPayouts.add(row.pendingPayouts),
    approvedPayouts: summary.approvedPayouts.add(row.approvedPayouts),
    totalPayouts: summary.totalPayouts.add(row.totalWithdrawn),
    availableBalance: summary.availableBalance.add(row.availableBalance),
  }), {
    lifetimeEarnings: new Decimal(0),
    totalDues: new Decimal(0),
    artistDues: new Decimal(0),
    payoutServiceFees: new Decimal(0),
    pendingPayouts: new Decimal(0),
    approvedPayouts: new Decimal(0),
    totalPayouts: new Decimal(0),
    availableBalance: new Decimal(0),
  })

  return {
    lifetimeEarnings: toMoneyString(totals.lifetimeEarnings),
    totalDues: toMoneyString(totals.totalDues),
    artistDues: toMoneyString(totals.artistDues),
    payoutServiceFees: toMoneyString(totals.payoutServiceFees),
    pendingPayouts: toMoneyString(totals.pendingPayouts),
    approvedPayouts: toMoneyString(totals.approvedPayouts),
    totalPayouts: toMoneyString(totals.totalPayouts),
    availableBalance: toMoneyString(totals.availableBalance),
    artistCount: rows.length,
    payableArtistCount: rows.filter((row) => Number(row.availableBalance) > 0).length,
  }
}

function buildRevenueAggregates(revenueRows: NormalizedRevenueRow[]) {
  const totalRevenue = revenueRows.reduce((sum, row) => sum.add(row.rawRevenue ?? 0), new Decimal(0))
  const totalRevenueNumber = totalRevenue.toNumber() || 1
  const countryGroups = new Map<string, {
    code: string | null
    revenue: Decimal
    streams: number
  }>()
  const platformGroups = new Map<string, {
    channelId: string | null
    channelName: string
    revenue: Decimal
    streams: number
  }>()
  const monthlyGroups = new Map<string, {
    revenue: Decimal
    streams: number
  }>()
  const platformTimelineGroups = new Map<string, {
    periodMonth: string
    channelId: string | null
    channelName: string
    revenue: Decimal
    streams: number
  }>()
  const artistGroups = new Map<string, {
    artistName: string
    revenue: Decimal
    streams: number
    countries: Set<string>
  }>()

  for (const row of revenueRows) {
    const revenue = new Decimal(row.rawRevenue ?? 0)
    const streams = Number(row.streams ?? 0)
    const countryCode = row.countryCode
    const countryKey = countryCode ?? "__unknown__"
    const countryGroup = countryGroups.get(countryKey) ?? {
      code: countryCode,
      revenue: new Decimal(0),
      streams: 0,
    }
    countryGroup.revenue = countryGroup.revenue.add(revenue)
    countryGroup.streams += streams
    countryGroups.set(countryKey, countryGroup)

    const channelName = row.channelName
    const platformKey = row.channelId ?? "__unassigned__"
    const platformGroup = platformGroups.get(platformKey) ?? {
      channelId: row.channelId,
      channelName,
      revenue: new Decimal(0),
      streams: 0,
    }
    platformGroup.revenue = platformGroup.revenue.add(revenue)
    platformGroup.streams += streams
    platformGroups.set(platformKey, platformGroup)

    const platformTimelineKey = `${row.periodMonth}::${platformKey}`
    const platformTimelineGroup = platformTimelineGroups.get(platformTimelineKey) ?? {
      periodMonth: row.periodMonth,
      channelId: row.channelId,
      channelName,
      revenue: new Decimal(0),
      streams: 0,
    }
    platformTimelineGroup.revenue = platformTimelineGroup.revenue.add(revenue)
    platformTimelineGroup.streams += streams
    platformTimelineGroups.set(platformTimelineKey, platformTimelineGroup)

    const monthlyGroup = monthlyGroups.get(row.periodMonth) ?? {
      revenue: new Decimal(0),
      streams: 0,
    }
    monthlyGroup.revenue = monthlyGroup.revenue.add(revenue)
    monthlyGroup.streams += streams
    monthlyGroups.set(row.periodMonth, monthlyGroup)

    const artistGroup = artistGroups.get(row.artistId) ?? {
      artistName: row.artistName,
      revenue: new Decimal(0),
      streams: 0,
      countries: new Set<string>(),
    }
    artistGroup.revenue = artistGroup.revenue.add(revenue)
    artistGroup.streams += streams

    if (countryCode) {
      artistGroup.countries.add(countryCode)
    }

    artistGroups.set(row.artistId, artistGroup)
  }

  return {
    revenueRows: [...revenueRows]
      .sort((left, right) => (
        left.periodMonth.localeCompare(right.periodMonth)
        || left.artistName.localeCompare(right.artistName)
        || left.channelName.localeCompare(right.channelName)
        || left.countryName.localeCompare(right.countryName)
        || String(left.releaseTitle ?? "").localeCompare(String(right.releaseTitle ?? ""))
        || String(left.trackTitle ?? "").localeCompare(String(right.trackTitle ?? ""))
      ))
      .map(({ rawRevenue: _rawRevenue, ...row }) => row),
    geoCountries: [...countryGroups.values()]
      .map((group) => ({
        countryCode: group.code,
        countryName: countryNameForCode(group.code),
        revenue: toMoneyString(group.revenue),
        streams: group.streams,
        share: group.revenue.div(totalRevenueNumber).mul(100).toNumber(),
      }))
      .sort((left, right) => Number(right.revenue) - Number(left.revenue)),
    platformBreakdown: [...platformGroups.values()]
      .map((group) => ({
        channelId: group.channelId,
        channelName: group.channelName,
        logoKey: dspLogoKeyForName(group.channelName),
        revenue: toMoneyString(group.revenue),
        streams: group.streams,
        share: group.revenue.div(totalRevenueNumber).mul(100).toNumber(),
      }))
      .sort((left, right) => Number(right.revenue) - Number(left.revenue)),
    platformTimeline: [...platformTimelineGroups.values()]
      .map((group) => ({
        periodMonth: group.periodMonth,
        channelId: group.channelId,
        channelName: group.channelName,
        logoKey: dspLogoKeyForName(group.channelName),
        revenue: toMoneyString(group.revenue),
        streams: group.streams,
      }))
      .sort((left, right) => left.periodMonth.localeCompare(right.periodMonth) || left.channelName.localeCompare(right.channelName)),
    monthlyRevenue: [...monthlyGroups.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([periodMonth, group]) => ({
        periodMonth,
        revenue: toMoneyString(group.revenue),
        streams: group.streams,
      })),
    artistLeaderboard: [...artistGroups.entries()]
      .map(([artistId, group]) => ({
        artistId,
        artistName: group.artistName,
        revenue: toMoneyString(group.revenue),
        streams: group.streams,
        countryCount: group.countries.size,
      }))
      .sort((left, right) => Number(right.revenue) - Number(left.revenue)),
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)
  const periodRange = analyticsPeriodRangeFromQuery(getQuery(event).periodRange)
  const monthRange = analyticsMonthRange(periodRange)
  const rpcArgs = {
    target_period_start_month: monthDateFromKey(monthRange?.startMonth),
    target_period_end_month: monthDateFromKey(monthRange?.endMonth),
  }

  const rpcRows = await fetchAllPages<AdminAnalyticsRevenueRpcRow>(
    "Unable to load revenue analytics.",
    (from, to) => supabase
      .rpc("get_admin_analytics_revenue_rows", rpcArgs)
      .range(from, to),
  )
  const revenueRows = rpcRows.map((row) => mapRevenueRow(row as AdminAnalyticsRevenueRpcRow))
  const revenueAggregates = buildRevenueAggregates(revenueRows)
  const financialArtists = await fetchFinancialRows(supabase)
  const financialSummary = buildFinancialSummary(financialArtists)

  return {
    ...revenueAggregates,
    financialSummary,
    financialArtists,
  } satisfies AdminAnalyticsResponse
})
