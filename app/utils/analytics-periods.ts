export type AnalyticsPeriodRange = "last_3_months" | "last_6_months" | "last_12_months" | "ytd" | "all_time"

export interface AnalyticsPeriodOption {
  value: AnalyticsPeriodRange
  label: string
}

export const ANALYTICS_PERIOD_OPTIONS: AnalyticsPeriodOption[] = [
  { value: "last_3_months", label: "3 months" },
  { value: "last_6_months", label: "6 months" },
  { value: "last_12_months", label: "12 months" },
  { value: "ytd", label: "YTD" },
  { value: "all_time", label: "All time" },
]

export const DEFAULT_ANALYTICS_PERIOD_RANGE: AnalyticsPeriodRange = "last_6_months"

function monthKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function normalizeMonthKey(value: string | null | undefined) {
  return String(value ?? "").slice(0, 7)
}

export function analyticsPeriodMonthDateKey(value: string | null | undefined) {
  const normalized = String(value ?? "").trim()
  const monthKey = normalizeMonthKey(normalized)

  return /^\d{4}-\d{2}$/.test(monthKey) ? `${monthKey}-01` : normalized
}

function addUtcMonths(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
}

export function analyticsMonthRange(range: AnalyticsPeriodRange, now = new Date()) {
  if (range === "all_time") {
    return null
  }

  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  if (range === "ytd") {
    return {
      startMonth: `${now.getUTCFullYear()}-01`,
      endMonth: monthKeyFromDate(currentMonth),
    }
  }

  const monthCountByRange: Record<Exclude<AnalyticsPeriodRange, "all_time" | "ytd">, number> = {
    last_3_months: 3,
    last_6_months: 6,
    last_12_months: 12,
  }
  const monthCount = monthCountByRange[range]

  return {
    startMonth: monthKeyFromDate(addUtcMonths(currentMonth, -(monthCount - 1))),
    endMonth: monthKeyFromDate(currentMonth),
  }
}

export function analyticsMonthRangeKeys(range: AnalyticsPeriodRange, now = new Date()) {
  const bounds = analyticsMonthRange(range, now)

  if (!bounds) {
    return null
  }

  const [startYear, startMonth] = bounds.startMonth.split("-").map(Number)
  const [endYear, endMonth] = bounds.endMonth.split("-").map(Number)

  if (!startYear || !startMonth || !endYear || !endMonth) {
    return []
  }

  const months: string[] = []
  let cursor = new Date(Date.UTC(startYear, startMonth - 1, 1))
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1))

  while (cursor <= end) {
    months.push(monthKeyFromDate(cursor))
    cursor = addUtcMonths(cursor, 1)
  }

  return months
}

export function isMonthInAnalyticsRange(periodMonth: string | null | undefined, range: AnalyticsPeriodRange, now = new Date()) {
  const monthKey = normalizeMonthKey(periodMonth)

  if (!monthKey) {
    return false
  }

  const bounds = analyticsMonthRange(range, now)

  if (!bounds) {
    return true
  }

  return monthKey >= bounds.startMonth && monthKey <= bounds.endMonth
}

export function filterRowsByAnalyticsRange<T>(
  rows: T[],
  range: AnalyticsPeriodRange,
  getPeriodMonth: (row: T) => string | null | undefined,
  now = new Date(),
) {
  return rows.filter((row) => isMonthInAnalyticsRange(getPeriodMonth(row), range, now))
}
