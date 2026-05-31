export interface AnalyticsDrilldownState {
  kind: "overview" | "period" | "country" | "platform" | "release" | "artist"
  id: string | null
  label: string
  meta?: string
}

export interface AnalyticsRevenueDatum {
  periodMonth: string
  periodLabel: string
  revenue: number
  streams: number
}

export interface AnalyticsRankDatum {
  id: string
  label: string
  meta?: string
  value: number
  count?: number
  share?: number
  color?: string
}

export function numeric(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

export function formatAnalyticsMoney(value: string | number | null | undefined) {
  return `$${numeric(value).toFixed(2)}`
}

export function formatAnalyticsCompact(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric(value))
}

export function formatAnalyticsShare(value: number | null | undefined) {
  return `${Number(value ?? 0).toFixed(1)}%`
}

export function escapeAnalyticsTooltipHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function analyticsTooltipMedia(src: string | null | undefined, label: string, kind: "country" | "dsp") {
  if (!src) {
    return ""
  }

  return `<img class="analytics-chart-tooltip-media analytics-chart-tooltip-media-${kind}" src="${escapeAnalyticsTooltipHtml(src)}" alt="" aria-hidden="true" title="${escapeAnalyticsTooltipHtml(label)}">`
}
