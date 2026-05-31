import { getQuery } from "h3"
import Decimal from "decimal.js"
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
  revenue: string | number | null
  streams: string | number | null
}

interface NormalizedRevenueRow extends AdminAnalyticsRevenueRow {
  rawRevenue: string | number | null
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
    revenue: toMoneyString(row.revenue ?? 0),
    rawRevenue: row.revenue,
    streams: Number(row.streams ?? 0),
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

  const revenueRows = (await fetchAllPages<AdminAnalyticsRevenueRpcRow>(
    "Unable to load revenue analytics.",
    (from, to) => supabase
      .rpc("get_admin_analytics_revenue_rows", rpcArgs)
      .range(from, to),
  ))
    .map((row) => mapRevenueRow(row as AdminAnalyticsRevenueRpcRow))
  const revenueAggregates = buildRevenueAggregates(revenueRows)

  return {
    ...revenueAggregates,
  } satisfies AdminAnalyticsResponse
})
