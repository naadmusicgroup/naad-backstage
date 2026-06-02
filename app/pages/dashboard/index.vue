<script setup lang="ts">
import {
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  Clock3,
  Copy,
  Disc3,
  Globe,
  Lock,
  Music,
  ReceiptText,
  Sparkles,
  Trophy,
  UploadCloud,
} from "lucide-vue-next"
import { toast } from "vue-sonner"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import PremiumPayoutIcon from "~/components/icons/PremiumPayoutIcon.vue"
import PremiumReleaseIcon from "~/components/icons/PremiumReleaseIcon.vue"
import { DISTRIBUTION_LOCKED_MESSAGE } from "~/utils/navigation"
import { notificationDestination } from "~/utils/notification-destinations"
import {
  formatAnalyticsCompact,
} from "~~/app/utils/analytics-charts"
import type {
  ArtistAnalyticsReleaseRow,
  ArtistAnalyticsOverviewResponse,
  ArtistAnalyticsCountryRow,
  ArtistAnalyticsPlatformRow,
  ArtistDashboardHomeRelease,
  ArtistDashboardHomeResponse,
  ArtistDashboardHomeSummaryResponse,
  ArtistNotificationRecord,
  ArtistWalletResponse,
} from "~~/types/dashboard"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

type RevenueChartRange = "12m" | "6m" | "3m"
type DashboardKpiTone = "default" | "accent" | "alt"
type DashboardKpiArt = "wallet" | "total" | "dues"
type DashboardKpiTheme = "dark" | "light"
type DashboardKpiArtFormat = "avif" | "webp" | "png"
type DashboardKpiArtImageSet = Record<DashboardKpiArtFormat, string>

type NextMoveKind = "due" | "notification"

interface DashboardNextMove {
  kind: NextMoveKind
  eyebrow: string
  title: string
  description: string
  actionLabel: string
  to: ReturnType<typeof notificationDestination> | string
}

const dashboardKpiArtImages = {
  wallet: {
    dark: {
      avif: "/dashboard-wallet-balance-bg.avif",
      webp: "/dashboard-wallet-balance-bg.webp",
      png: "/dashboard-wallet-balance-bg.png",
    },
    light: {
      avif: "/dashboard-wallet-balance-bg-light.avif",
      webp: "/dashboard-wallet-balance-bg-light.webp",
      png: "/dashboard-wallet-balance-bg-light.png",
    },
  },
  total: {
    dark: {
      avif: "/dashboard-total-balance-bg.avif",
      webp: "/dashboard-total-balance-bg.webp",
      png: "/dashboard-total-balance-bg.png",
    },
    light: {
      avif: "/dashboard-total-balance-bg-light.avif",
      webp: "/dashboard-total-balance-bg-light.webp",
      png: "/dashboard-total-balance-bg-light.png",
    },
  },
  dues: {
    dark: {
      avif: "/dashboard-pending-dues-bg.avif",
      webp: "/dashboard-pending-dues-bg.webp",
      png: "/dashboard-pending-dues-bg.png",
    },
    light: {
      avif: "/dashboard-pending-dues-bg-light.avif",
      webp: "/dashboard-pending-dues-bg-light.webp",
      png: "/dashboard-pending-dues-bg-light.png",
    },
  },
} satisfies Record<DashboardKpiArt, Record<DashboardKpiTheme, DashboardKpiArtImageSet>>

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const { activeArtistId } = useActiveArtist()
const { viewer } = useViewerContext()
const streamingLinkCopied = ref(false)
const distributionLockedMessage = DISTRIBUTION_LOCKED_MESSAGE
const artistScopeQuery = computed(() => (activeArtistId.value ? { artistId: activeArtistId.value } : undefined))
const analyticsQuery = computed(() => ({
  ...(activeArtistId.value ? { artistId: activeArtistId.value } : {}),
  overviewPeriodRange: "last_12_months",
  surface: "dashboard_home",
}))
const {
  data: analyticsData,
  error: analyticsError,
  pending: analyticsPending,
  refresh: refreshAnalytics,
} = useLazyFetch<ArtistAnalyticsOverviewResponse>("/api/dashboard/analytics", {
  query: analyticsQuery,
})
const {
  data: homeSummaryData,
  error: homeSummaryError,
  pending: homeSummaryPending,
  refresh: refreshHomeSummary,
} = useLazyFetch<ArtistDashboardHomeSummaryResponse>("/api/dashboard/home-summary", {
  query: artistScopeQuery,
})
const notificationPreview = useArtistNotificationPreview()
const walletData = computed<ArtistWalletResponse | null>(() => homeSummaryData.value?.wallet ?? null)
const homeData = computed<ArtistDashboardHomeResponse | null>(() => homeSummaryData.value?.home ?? null)
const walletError = computed(() => homeSummaryError.value)
const releasesError = computed(() => homeSummaryError.value)
const releasesPending = computed(() => homeSummaryPending.value)
const refreshWallet = refreshHomeSummary
const refreshReleases = refreshHomeSummary

const wallet = computed<ArtistWalletResponse>(() => {
  return (
    walletData.value ?? {
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
  )
})

const revenueChartRange = ref<RevenueChartRange>("12m")
const revenueRangeOptions = [
  { value: "12m", label: "Last 12 months", months: 12 },
  { value: "6m", label: "Last 6 months", months: 6 },
  { value: "3m", label: "Last 3 months", months: 3 },
] satisfies Array<{ value: RevenueChartRange; label: string; months: number }>

function setRevenueChartRange(value: string) {
  if (revenueRangeOptions.some((option) => option.value === value)) {
    revenueChartRange.value = value as RevenueChartRange
  }
}
const releases = computed(() => homeData.value?.releaseLookup ?? [])
const latestRelease = computed<ArtistDashboardHomeRelease | null>(() => homeData.value?.latestRelease ?? null)
const notifications = computed(() => (notificationPreview?.data.value?.notifications ?? []).slice(0, 3))
const notificationsError = computed(() => notificationPreview?.error.value ?? null)
const latestActionNotification = computed<ArtistNotificationRecord | null>(() => (
  notifications.value.find((notification) => !notification.isRead && notification.type !== "due_added") ?? null
))
const isDashboardDarkTheme = ref(true)
const loadedDashboardKpiArt = reactive<Record<string, boolean>>({})
let dashboardThemeObserver: MutationObserver | null = null

function dashboardKpiTheme() {
  return isDashboardDarkTheme.value ? "dark" : "light"
}

function dashboardKpiArtSources(art?: DashboardKpiArt) {
  if (!art) {
    return null
  }

  return dashboardKpiArtImages[art][dashboardKpiTheme()]
}

function dashboardKpiArtSrc(art?: DashboardKpiArt, format: DashboardKpiArtFormat = "png") {
  return dashboardKpiArtSources(art)?.[format] ?? ""
}

function releaseCoverArtUrl(release: Pick<ArtistDashboardHomeRelease, "coverArtUrl"> | ArtistAnalyticsReleaseRow | null | undefined) {
  return release?.coverArtUrl || null
}

function dashboardKpiArtLoadedKey(src?: string) {
  if (!src) {
    return ""
  }

  if (import.meta.client) {
    try {
      return new URL(src, window.location.origin).pathname
    } catch {
      return src
    }
  }

  return src
}

function markDashboardKpiArtLoaded(src?: string) {
  const key = dashboardKpiArtLoadedKey(src)

  if (key) {
    loadedDashboardKpiArt[key] = true
  }
}

function isDashboardKpiArtLoaded(art?: DashboardKpiArt) {
  const sources = dashboardKpiArtSources(art)
  return Boolean(
    sources
    && Object.values(sources).some((src) => loadedDashboardKpiArt[dashboardKpiArtLoadedKey(src)]),
  )
}

function syncDashboardTheme() {
  if (!import.meta.client) {
    return
  }

  isDashboardDarkTheme.value = document.documentElement.classList.contains("dark")
}

function handleDashboardKpiArtLoad(event: Event) {
  const image = event.target

  if (image instanceof HTMLImageElement && image.naturalWidth > 0) {
    markDashboardKpiArtLoaded(image.currentSrc || image.src)
  }
}

onMounted(() => {
  syncDashboardTheme()

  dashboardThemeObserver = new MutationObserver(() => {
    syncDashboardTheme()
  })
  dashboardThemeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
})

onBeforeUnmount(() => {
  dashboardThemeObserver?.disconnect()
})

const pendingAcceptanceDues = computed(() => wallet.value.dues.filter((due) => due.status === "pending_acceptance"))
const pendingAcceptanceDue = computed(() => pendingAcceptanceDues.value[0] ?? null)
const pendingDueTotal = computed(() => pendingAcceptanceDues.value.reduce((sum, due) => {
  const amount = Number(due.amount ?? 0)
  return sum + (Number.isFinite(amount) ? amount : 0)
}, 0))
const recentFinancialActivity = computed(() => wallet.value.recentTransactions.slice(0, 3))
const settingsArtist = computed(() => homeData.value?.setup.artist ?? null)
const artistSetupShortcut = computed(() => {
  const artist = settingsArtist.value

  if (!artist || !homeData.value) {
    return null
  }

  const bankDetails = artist.bankDetails
  const hasBankDetails = Boolean(
    bankDetails
    && hasTextValue(bankDetails.accountName)
    && hasTextValue(bankDetails.bankName)
    && hasTextValue(bankDetails.accountNumber),
  )

  if (!hasBankDetails) {
    return {
      detail: "Add payout bank details",
      to: { path: "/dashboard/settings", query: { section: "bank" }, hash: "#bank-details" },
    }
  }

  const hasDspProfile = artist.dspProfiles.some((profile) => profile.profileExists && hasTextValue(profile.profileUrl))

  if (!hasDspProfile) {
    return {
      detail: "Add DSP profile links",
      to: { path: "/dashboard/settings", query: { section: "preferences" } },
    }
  }

  const hasCoreProfile = hasTextValue(homeData.value.setup.profileFullName) && hasTextValue(artist.country)

  if (!hasCoreProfile) {
    return {
      detail: "Complete profile details",
      to: { path: "/dashboard/settings", query: { section: "profile" } },
    }
  }

  return null
})
const dashboardStats = computed<Array<{
  label: string
  value: string
  footnote?: string
  tone?: DashboardKpiTone
  art?: DashboardKpiArt
}>>(() => [
  {
    label: "Available balance",
    value: formatMoney(wallet.value.visibleBalance),
    footnote: wallet.value.balanceSettling ? "Balance is settling" : "Ready for payout",
    tone: "accent",
    art: "wallet",
  },
  {
    label: "Total balance to date",
    value: formatMoney(wallet.value.totalEarned),
    footnote: "Lifetime posted earnings",
    art: "total",
  },
  {
    label: "Pending dues",
    value: formatMoney(pendingDueTotal.value),
    footnote: `${pendingAcceptanceDues.value.length.toLocaleString()} pending request${pendingAcceptanceDues.value.length === 1 ? "" : "s"}`,
    tone: "alt",
    art: "dues",
  },
])
const topEarningSong = computed<ArtistAnalyticsReleaseRow | null>(() => {
  const rows = analyticsData.value?.releaseRows ?? []
  return rows.find((row) => row.id !== "__none__" && Number(row.value) > 0) ?? null
})
const topEarningSongRelease = computed<ArtistDashboardHomeRelease | null>(() => {
  const song = topEarningSong.value
  if (!song) return null
  return releases.value.find((release) => release.id === song.id) ?? null
})
const topStreamingSong = computed<ArtistAnalyticsReleaseRow | null>(() => {
  const rows = [...(analyticsData.value?.releaseRows ?? [])]
  rows.sort((a, b) => b.count - a.count)
  return rows.find((row) => row.id !== "__none__" && Number(row.count) > 0) ?? null
})
const topStreamingSongRelease = computed<ArtistDashboardHomeRelease | null>(() => {
  const song = topStreamingSong.value
  if (!song) return null
  return releases.value.find((release) => release.id === song.id) ?? null
})
const topCountry = computed<ArtistAnalyticsCountryRow | null>(() => {
  const countries = analyticsData.value?.countries ?? []
  return countries[0] ?? null
})
const topDsp = computed<ArtistAnalyticsPlatformRow | null>(() => {
  const platforms = analyticsData.value?.platformRows ?? []
  return platforms[0] ?? null
})
const nextMove = computed<DashboardNextMove | null>(() => {
  const due = pendingAcceptanceDue.value

  if (due) {
    return {
      kind: "due",
      eyebrow: "Needs response",
      title: "Accept due request",
      description: `${due.title} is waiting before ${formatMoney(due.amount)} can be applied.`,
      actionLabel: "Review dues",
      to: { path: "/dashboard/wallet", query: { section: "dues" } },
    }
  }

  const notification = latestActionNotification.value

  if (notification) {
    return {
      kind: "notification",
      eyebrow: notification.typeLabel,
      title: notification.title,
      description: notification.message || "Open the latest account update.",
      actionLabel: "Open update",
      to: notificationDestination(notification),
    }
  }

  return null
})
let streamingLinkCopiedTimer: ReturnType<typeof setTimeout> | null = null

function markStreamingLinkCopied() {
  streamingLinkCopied.value = true

  if (streamingLinkCopiedTimer) {
    clearTimeout(streamingLinkCopiedTimer)
  }

  streamingLinkCopiedTimer = setTimeout(() => {
    streamingLinkCopied.value = false
  }, 1500)
}

function fallbackCopy(text: string) {
  if (!import.meta.client) {
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand("copy")
  document.body.removeChild(textarea)
}

async function copyStreamingLink() {
  const url = latestRelease.value?.streamingLink?.trim()

  if (!url || !import.meta.client) {
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
    } else {
      fallbackCopy(url)
    }
  } catch {
    fallbackCopy(url)
  }

  markStreamingLinkCopied()
  toast.success("Streaming link copied")
}

onBeforeUnmount(() => {
  if (streamingLinkCopiedTimer) {
    clearTimeout(streamingLinkCopiedTimer)
  }
})

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0)
  return `$${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`
}

async function refreshNotifications() {
  await notificationPreview?.refresh()
}

function hasTextValue(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function formatSignedMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0)
  const normalized = Number.isFinite(amount) ? amount : 0
  const prefix = normalized > 0 ? "+" : normalized < 0 ? "-" : ""
  return `${prefix}$${Math.abs(normalized).toFixed(2)}`
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return dateTimeFormatter.format(date)
}

function formatReleaseDate(value: string | null) {
  if (!value) {
    return "Release date not set"
  }

  const parsedDate = new Date(`${value}T00:00:00Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return dateFormatter.format(parsedDate)
}

function formatReleaseType(value: string) {
  return value.toUpperCase()
}

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ")
}

function releaseStatusTone(status: string) {
  if (status === "live") {
    return "success"
  }

  if (status === "scheduled" || status === "approved") {
    return "info"
  }

  if (status === "taken_down") {
    return "warning"
  }

  if (status === "deleted" || status === "rejected") {
    return "danger"
  }

  return "warning"
}
</script>

<template>
  <div class="page dashboard-home">
    <PageHeader
      eyebrow="Dashboard"
      :title="`Welcome back, ${viewer.profile?.fullName || 'there'}`"
      description="Monthly revenue, latest release, and clean wallet movement in one snapshot."
    />

    <svg class="dashboard-kpi-text-filters" aria-hidden="true" focusable="false">
      <defs>
        <filter id="kpi-deboss-light" x="-20%" y="-55%" width="140%" height="210%" color-interpolation-filters="sRGB">
          <feMorphology in="SourceAlpha" operator="erode" radius="0.35" result="eroded" />
          <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation="0.28" result="softEdge" />
          <feOffset in="softEdge" dx="-0.45" dy="-0.45" result="shadeMaskOffset" />
          <feComposite in="shadeMaskOffset" in2="SourceAlpha" operator="in" result="shadeMask" />
          <feFlood flood-color="#1f1b15" flood-opacity="0.32" result="shadeColor" />
          <feComposite in="shadeColor" in2="shadeMask" operator="in" result="innerShade" />
          <feOffset in="softEdge" dx="0.5" dy="0.5" result="lightMaskOffset" />
          <feComposite in="lightMaskOffset" in2="SourceAlpha" operator="in" result="lightMask" />
          <feFlood flood-color="#fff8e8" flood-opacity="0.24" result="lightColor" />
          <feComposite in="lightColor" in2="lightMask" operator="in" result="innerLight" />
          <feMorphology in="SourceAlpha" operator="dilate" radius="0.55" result="dilated" />
          <feComposite in="dilated" in2="SourceAlpha" operator="out" result="outerRim" />
          <feGaussianBlur in="outerRim" stdDeviation="0.35" result="outerRimSoft" />
          <feOffset in="outerRimSoft" dx="0.55" dy="0.65" result="contactMask" />
          <feFlood flood-color="#614f2c" flood-opacity="0.18" result="contactColor" />
          <feComposite in="contactColor" in2="contactMask" operator="in" result="contact" />
          <feBlend in="SourceGraphic" in2="innerShade" mode="multiply" result="shaded" />
          <feBlend in="shaded" in2="innerLight" mode="screen" result="beveled" />
          <feMerge>
            <feMergeNode in="beveled" />
          </feMerge>
        </filter>
        <filter id="kpi-deboss-value-light" x="-20%" y="-55%" width="140%" height="210%" color-interpolation-filters="sRGB">
          <feMorphology in="SourceAlpha" operator="erode" radius="0.55" result="eroded" />
          <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation="0.35" result="softEdge" />
          <feOffset in="softEdge" dx="-0.62" dy="-0.62" result="shadeMaskOffset" />
          <feComposite in="shadeMaskOffset" in2="SourceAlpha" operator="in" result="shadeMask" />
          <feFlood flood-color="#1c1812" flood-opacity="0.4" result="shadeColor" />
          <feComposite in="shadeColor" in2="shadeMask" operator="in" result="innerShade" />
          <feOffset in="softEdge" dx="0.72" dy="0.72" result="lightMaskOffset" />
          <feComposite in="lightMaskOffset" in2="SourceAlpha" operator="in" result="lightMask" />
          <feFlood flood-color="#fff9ec" flood-opacity="0.32" result="lightColor" />
          <feComposite in="lightColor" in2="lightMask" operator="in" result="innerLight" />
          <feMorphology in="SourceAlpha" operator="dilate" radius="0.75" result="dilated" />
          <feComposite in="dilated" in2="SourceAlpha" operator="out" result="outerRim" />
          <feGaussianBlur in="outerRim" stdDeviation="0.42" result="outerRimSoft" />
          <feOffset in="outerRimSoft" dx="0.7" dy="0.85" result="contactMask" />
          <feFlood flood-color="#554424" flood-opacity="0.22" result="contactColor" />
          <feComposite in="contactColor" in2="contactMask" operator="in" result="contact" />
          <feBlend in="SourceGraphic" in2="innerShade" mode="multiply" result="shaded" />
          <feBlend in="shaded" in2="innerLight" mode="screen" result="beveled" />
          <feMerge>
            <feMergeNode in="beveled" />
          </feMerge>
        </filter>
        <filter id="kpi-deboss-dark" x="-20%" y="-55%" width="140%" height="210%" color-interpolation-filters="sRGB">
          <feMorphology in="SourceAlpha" operator="erode" radius="0.35" result="eroded" />
          <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation="0.28" result="softEdge" />
          <feOffset in="softEdge" dx="-0.48" dy="-0.48" result="shadeMaskOffset" />
          <feComposite in="shadeMaskOffset" in2="SourceAlpha" operator="in" result="shadeMask" />
          <feFlood flood-color="#000000" flood-opacity="0.68" result="shadeColor" />
          <feComposite in="shadeColor" in2="shadeMask" operator="in" result="innerShade" />
          <feOffset in="softEdge" dx="0.5" dy="0.5" result="lightMaskOffset" />
          <feComposite in="lightMaskOffset" in2="SourceAlpha" operator="in" result="lightMask" />
          <feFlood flood-color="#ffe6ad" flood-opacity="0.14" result="lightColor" />
          <feComposite in="lightColor" in2="lightMask" operator="in" result="innerLight" />
          <feMorphology in="SourceAlpha" operator="dilate" radius="0.55" result="dilated" />
          <feComposite in="dilated" in2="SourceAlpha" operator="out" result="outerRim" />
          <feGaussianBlur in="outerRim" stdDeviation="0.35" result="outerRimSoft" />
          <feOffset in="outerRimSoft" dx="0.55" dy="0.65" result="contactMask" />
          <feFlood flood-color="#000000" flood-opacity="0.42" result="contactColor" />
          <feComposite in="contactColor" in2="contactMask" operator="in" result="contact" />
          <feBlend in="SourceGraphic" in2="innerShade" mode="multiply" result="shaded" />
          <feBlend in="shaded" in2="innerLight" mode="screen" result="beveled" />
          <feMerge>
            <feMergeNode in="beveled" />
          </feMerge>
        </filter>
        <filter id="kpi-deboss-value-dark" x="-20%" y="-55%" width="140%" height="210%" color-interpolation-filters="sRGB">
          <feMorphology in="SourceAlpha" operator="erode" radius="0.55" result="eroded" />
          <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation="0.35" result="softEdge" />
          <feOffset in="softEdge" dx="-0.68" dy="-0.68" result="shadeMaskOffset" />
          <feComposite in="shadeMaskOffset" in2="SourceAlpha" operator="in" result="shadeMask" />
          <feFlood flood-color="#000000" flood-opacity="0.78" result="shadeColor" />
          <feComposite in="shadeColor" in2="shadeMask" operator="in" result="innerShade" />
          <feOffset in="softEdge" dx="0.72" dy="0.72" result="lightMaskOffset" />
          <feComposite in="lightMaskOffset" in2="SourceAlpha" operator="in" result="lightMask" />
          <feFlood flood-color="#ffe5a0" flood-opacity="0.2" result="lightColor" />
          <feComposite in="lightColor" in2="lightMask" operator="in" result="innerLight" />
          <feMorphology in="SourceAlpha" operator="dilate" radius="0.75" result="dilated" />
          <feComposite in="dilated" in2="SourceAlpha" operator="out" result="outerRim" />
          <feGaussianBlur in="outerRim" stdDeviation="0.42" result="outerRimSoft" />
          <feOffset in="outerRimSoft" dx="0.7" dy="0.85" result="contactMask" />
          <feFlood flood-color="#000000" flood-opacity="0.52" result="contactColor" />
          <feComposite in="contactColor" in2="contactMask" operator="in" result="contact" />
          <feBlend in="SourceGraphic" in2="innerShade" mode="multiply" result="shaded" />
          <feBlend in="shaded" in2="innerLight" mode="screen" result="beveled" />
          <feMerge>
            <feMergeNode in="beveled" />
          </feMerge>
        </filter>
      </defs>
    </svg>

    <div class="dashboard-kpi-grid stagger-enter">
      <div
        v-for="stat in dashboardStats"
        :key="stat.label"
        :class="[
          'dashboard-kpi-shell',
          stat.tone && `dashboard-kpi-shell-${stat.tone}`,
          stat.art && `dashboard-kpi-shell-${stat.art}`,
        ]"
      >
        <article
          v-if="stat.art"
          :class="[
            'dashboard-wallet-kpi-card',
            `dashboard-wallet-kpi-card-${stat.art}`,
            { 'is-art-loaded': isDashboardKpiArtLoaded(stat.art) },
          ]"
          :aria-label="`${stat.label}: ${stat.value}. ${stat.footnote || ''}`"
          :aria-busy="!isDashboardKpiArtLoaded(stat.art)"
        >
          <picture>
            <source :srcset="dashboardKpiArtSrc(stat.art, 'avif')" type="image/avif">
            <source :srcset="dashboardKpiArtSrc(stat.art, 'webp')" type="image/webp">
            <img
              class="dashboard-wallet-art"
              :src="dashboardKpiArtSrc(stat.art)"
              alt=""
              aria-hidden="true"
              decoding="async"
              :fetchpriority="stat.art === 'wallet' ? 'high' : 'auto'"
              :loading="stat.art === 'wallet' ? 'eager' : 'lazy'"
              :width="stat.art === 'wallet' ? 2160 : 1440"
              :height="stat.art === 'wallet' ? 720 : 864"
              @load="handleDashboardKpiArtLoad"
            >
          </picture>
          <template v-if="!isDashboardKpiArtLoaded(stat.art)">
            <Skeleton
              class="pointer-events-none absolute inset-0 z-[2] h-full w-full rounded-[18px]"
              aria-hidden="true"
            />
            <div
              :class="[
                'pointer-events-none absolute z-[3] grid gap-3',
                stat.art === 'wallet'
                  ? 'inset-[27px_28px_22px] max-w-[min(60%,270px)] content-center'
                  : 'inset-[27px_28px_22px] max-w-[min(52%,196px)] content-start pt-[clamp(6px,1.9cqw,10px)]',
              ]"
              aria-hidden="true"
            >
              <Skeleton class="h-3 w-36 rounded-full" />
              <Skeleton :class="stat.art === 'wallet' ? 'h-11 w-56 rounded-md' : 'h-12 w-44 rounded-md'" />
              <Skeleton class="h-3 w-40 rounded-full" />
            </div>
          </template>
          <div class="dashboard-wallet-copy">
            <span>{{ stat.label }}</span>
            <strong>{{ stat.value }}</strong>
            <small>{{ stat.footnote }}</small>
          </div>
          <div v-if="stat.art === 'wallet'" class="dashboard-wallet-hardware" aria-hidden="true">
            <div class="dashboard-wallet-chip">
              <span />
            </div>
            <svg class="dashboard-wallet-contactless" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round">
              <path d="M9 12a6 6 0 0 1 0 8" />
              <path d="M15 8a11 11 0 0 1 0 16" />
              <path d="M21 5a16 16 0 0 1 0 22" />
            </svg>
          </div>
        </article>
        <StatCard
          v-else
          :label="stat.label"
          :value="stat.value"
          :footnote="stat.footnote"
          :tone="stat.tone"
        />
      </div>
    </div>

    <DashboardBento class="artist-dashboard-bento stagger-enter">
      <!-- Left Column: Performance & Financial Activity -->
      <div class="bento-cell bento-span-8 main-stack">
        <Card
          class="snapshot-card snapshot-card-primary performance-overview-card interactive-3d-card"
        >
          <AppAlert v-if="walletError" variant="destructive">
            {{ walletError.statusMessage || "Unable to load wallet data right now." }}
            <template #action>
              <Button variant="secondary" @click="() => refreshWallet()">Retry</Button>
            </template>
          </AppAlert>

          <LazyAnalyticsMonthlyRevenueChartPanel
            :points="analyticsData?.monthlyRevenue ?? []"
            :loading="analyticsPending"
            :error="analyticsError ? analyticsError.statusMessage || 'Unable to load monthly revenue right now.' : null"
            retry-label="Retry"
            :range-value="revenueChartRange"
            :range-options="revenueRangeOptions"
            show-range-select
            fill-last-twelve-months
            @retry="() => refreshAnalytics()"
            @update:range-value="setRevenueChartRange"
          />
        </Card>

        <!-- Spotlight Quick Actions Card -->
        <Card
          class="snapshot-card quick-actions-card interactive-3d-card"
        >
          <div class="section-header">
            <div>
              <p class="eyebrow">Quick Tools</p>
              <h3>Shortcuts</h3>
            </div>
            <Sparkles class="size-5 text-muted-foreground" />
          </div>

          <div class="dashboard-action-grid">
            <AppTooltip
              :label="distributionLockedMessage"
              side="top"
              content-class="dashboard-locked-tooltip"
            >
              <button
                type="button"
                class="dashboard-action-tile dashboard-action-tile-locked"
                :aria-label="`Upload Music. Locked. ${distributionLockedMessage}`"
                aria-disabled="true"
              >
                <span class="dashboard-action-icon">
                  <UploadCloud class="size-4" />
                </span>
                <span>
                  <strong>Upload Music</strong>
                  <small>Submit releases to stores</small>
                </span>
                <span class="dashboard-action-lock-badge" aria-hidden="true">
                  <Lock class="size-3" />
                </span>
              </button>
            </AppTooltip>

            <NuxtLink :to="{ path: '/dashboard/wallet', query: { section: 'payout' } }" class="dashboard-action-tile">
              <span class="dashboard-action-icon">
                <PremiumPayoutIcon class="size-4" />
              </span>
              <span>
                <strong>Request Payout</strong>
                <small>Withdraw available balance</small>
              </span>
              <ArrowRight class="size-4 text-muted-foreground" />
            </NuxtLink>

            <NuxtLink to="/dashboard/statements" class="dashboard-action-tile">
              <span class="dashboard-action-icon">
                <ReceiptText class="size-4" />
              </span>
              <span>
                <strong>Statements</strong>
                <small>Review monthly statements</small>
              </span>
              <ArrowRight class="size-4 text-muted-foreground" />
            </NuxtLink>

            <NuxtLink :to="{ path: '/dashboard/settings', query: { section: 'preferences' } }" class="dashboard-action-tile">
              <span class="dashboard-action-icon">
                <Disc3 class="size-4" />
              </span>
              <span>
                <strong>DSP Profiles</strong>
                <small>Manage store links</small>
              </span>
              <ArrowRight class="size-4 text-muted-foreground" />
            </NuxtLink>
          </div>
        </Card>

        <Card
          class="snapshot-card financial-activity-card interactive-3d-card"
        >
          <div class="section-header">
            <div>
              <p class="eyebrow">Financial activity</p>
              <h3>Recent movement</h3>
            </div>
            <ReceiptText class="size-5 text-muted-foreground" />
          </div>

          <div v-if="recentFinancialActivity.length" class="financial-activity-list stagger-enter">
            <div v-for="item in recentFinancialActivity" :key="item.id" class="financial-activity-row">
              <span :class="Number(item.amount) >= 0 ? 'activity-dot positive' : 'activity-dot negative'" />
              <div class="activity-copy">
                <strong>{{ item.label }}</strong>
                <span>{{ item.description }}</span>
                <span class="activity-time">
                  <Clock3 class="size-3" />
                  {{ formatDateTime(item.createdAt) }}
                </span>
              </div>
              <strong :class="Number(item.amount) >= 0 ? 'amount-positive' : 'amount-negative'">
                {{ formatSignedMoney(item.amount) }}
              </strong>
            </div>
          </div>

          <AppEmptyState
            v-else
            compact
            icon="file"
            title="No wallet activity yet"
            description="Credits, payout movement, and deductions appear here after the first ledger event."
            class="border-0 bg-transparent shadow-none"
          />

          <Button variant="secondary" class="subtle-card-link" as-child>
            <NuxtLink to="/dashboard/wallet">
              View wallet activity
              <ArrowRight class="size-4" />
            </NuxtLink>
          </Button>
        </Card>
      </div>

      <!-- Right Column: Next Move, Pulse, Shortcuts & Performer -->
      <div class="bento-cell bento-span-4 side-stack-cell">
        <Card
          :class="['snapshot-card next-move-card interactive-3d-card', nextMove ? 'next-move-card-priority' : 'snapshot-card-receded']"
        >
          <div class="section-header">
            <div>
              <p class="eyebrow">Next move</p>
              <h3>{{ nextMove ? "What needs you" : "Keep moving" }}</h3>
            </div>
            <Sparkles class="size-5 text-muted-foreground" />
          </div>

          <AppAlert v-if="notificationsError && nextMove?.kind === 'notification'" variant="destructive">
            {{ notificationsError.statusMessage || "Unable to load updates right now." }}
            <template #action>
              <Button variant="secondary" @click="() => refreshNotifications()">Retry</Button>
            </template>
          </AppAlert>

          <NuxtLink v-else-if="nextMove" :to="nextMove.to" class="next-move-link next-move-link-priority">
            <span class="next-move-icon">
              <ReceiptText v-if="nextMove.kind === 'due'" class="size-5" />
              <Bell v-else class="size-5" />
            </span>
            <span class="next-move-copy">
              <span class="metric-label">{{ nextMove.eyebrow }}</span>
              <strong>{{ nextMove.title }}</strong>
              <span class="detail-copy">{{ nextMove.description }}</span>
            </span>
            <span class="next-move-action">
              {{ nextMove.actionLabel }}
              <ArrowRight class="size-4" />
            </span>
          </NuxtLink>

          <div v-else-if="artistSetupShortcut" class="fallback-route-list">
            <NuxtLink :to="artistSetupShortcut.to" class="next-move-link next-move-link-muted">
              <span class="next-move-icon">
                <Sparkles class="size-5" />
              </span>
              <span class="next-move-copy">
                <span class="metric-label">Setup</span>
                <strong>Finish artist profile</strong>
                <span class="detail-copy">{{ artistSetupShortcut.detail }}</span>
              </span>
              <span class="next-move-action">
                Continue
                <ArrowRight class="size-4" />
              </span>
            </NuxtLink>
          </div>

          <div v-else class="fallback-route-list">
            <AppTooltip
              :label="distributionLockedMessage"
              side="top"
              content-class="dashboard-locked-tooltip"
            >
              <button
                type="button"
                class="next-move-link next-move-link-muted next-move-link-locked"
                :aria-label="`Upload a release. Locked. ${distributionLockedMessage}`"
                aria-disabled="true"
              >
                <span class="next-move-icon">
                  <UploadCloud class="size-5" />
                </span>
                <span class="next-move-copy">
                  <span class="metric-label">Catalog</span>
                  <strong>Upload a release</strong>
                  <span class="detail-copy">Cover art, audio, credits, and store delivery.</span>
                </span>
                <span class="next-move-action next-move-lock-status" aria-hidden="true">
                  <Lock class="size-3" />
                  Locked
                </span>
              </button>
            </AppTooltip>

            <NuxtLink to="/dashboard/statements" class="next-move-link next-move-link-muted">
              <span class="next-move-icon">
                <ReceiptText class="size-5" />
              </span>
              <span class="next-move-copy">
                <span class="metric-label">Finance</span>
                <strong>Review statements</strong>
                <span class="detail-copy">Monthly royalty statements and grouped earnings.</span>
              </span>
            </NuxtLink>
          </div>
        </Card>

        <Card
          class="snapshot-card release-pulse-card interactive-3d-card"
        >
          <div class="section-header">
            <div>
              <p class="eyebrow">Release pulse</p>
              <h3>Latest drop</h3>
            </div>
            <PremiumReleaseIcon class="size-5 text-muted-foreground" />
          </div>

          <DashboardSkeleton v-if="releasesPending && !homeData" layout="release-pulse" />

          <AppAlert v-else-if="releasesError" variant="destructive">
            {{ releasesError.statusMessage || "Unable to load releases right now." }}
            <template #action>
              <Button variant="secondary" @click="() => refreshReleases()">Retry</Button>
            </template>
          </AppAlert>

          <template v-else-if="latestRelease">
            <div class="release-pulse-art">
              <img
                v-if="releaseCoverArtUrl(latestRelease)"
                :src="releaseCoverArtUrl(latestRelease) || ''"
                :alt="`${latestRelease.title} cover art`"
              >
              <div v-else class="release-art-placeholder">
                <Disc3 class="size-9" />
                <span>No art</span>
              </div>
              <div class="release-pulse-badges">
                <StatusBadge :tone="releaseStatusTone(latestRelease.displayStatus)">
                  {{ formatStatusLabel(latestRelease.displayStatus) }}
                </StatusBadge>
                <span class="release-type-pill">{{ formatReleaseType(latestRelease.type) }}</span>
              </div>
            </div>

            <div class="release-pulse-copy">
              <h4>{{ latestRelease.title || "Untitled release" }}</h4>
              <p class="detail-copy">{{ latestRelease.artistName }}</p>
              <div class="release-meta-grid">
                <span>
                  <CalendarClock class="size-4" />
                  {{ formatReleaseDate(latestRelease.releaseDate) }}
                </span>
                <span>
                  <Disc3 class="size-4" />
                  {{ latestRelease.trackCount }} track{{ latestRelease.trackCount === 1 ? "" : "s" }}
                </span>
              </div>
              <Button
                v-if="latestRelease.streamingLink"
                type="button"
                variant="secondary"
                class="release-copy-button release-action-button"
                @click="copyStreamingLink"
              >
                <Check v-if="streamingLinkCopied" class="release-button-icon" />
                <Copy v-else class="release-button-icon" />
                {{ streamingLinkCopied ? "Copied" : "Copy streaming link" }}
              </Button>
            </div>

            <Button variant="secondary" as-child class="release-open-button">
              <NuxtLink to="/dashboard/releases">
                Open releases
                <ArrowRight class="release-button-arrow" />
              </NuxtLink>
            </Button>
          </template>

          <AppEmptyState
            v-else
            compact
            icon="file"
            title="No releases yet"
            description="Your newest release will become the visual anchor here."
            class="border-0 bg-transparent shadow-none"
          />
        </Card>

        <Card
          class="snapshot-card snapshot-card-receded performer-card interactive-3d-card"
        >
          <div class="section-header">
            <div>
              <p class="eyebrow">Insights</p>
              <h3>Top Performers</h3>
            </div>
            <Trophy class="size-5 text-muted-foreground" />
          </div>

          <DashboardSkeleton v-if="analyticsPending && !analyticsData" layout="top-performers" />

          <template v-else-if="topEarningSong || topStreamingSong || topCountry || topDsp">
            <div class="top-performers-list">
              <!-- 1. Top Earning Song -->
              <div v-if="topEarningSong" class="top-performer-row">
                <div class="performer-row-media">
                  <img
                    v-if="releaseCoverArtUrl(topEarningSongRelease)"
                    :src="releaseCoverArtUrl(topEarningSongRelease) || ''"
                    :alt="topEarningSong.label"
                  >
                  <Disc3 v-else class="size-5 text-muted-foreground" />
                </div>
                <div class="performer-row-info">
                  <span class="row-badge">Top Earning Song</span>
                  <h4>{{ topEarningSong.label }}</h4>
                  <p v-if="topEarningSongRelease">{{ topEarningSongRelease.artistName }}</p>
                </div>
                <div class="performer-row-metric">
                  <MoneyValue :value="topEarningSong.value" size="sm" class="font-bold text-foreground" />
                  <span class="metric-label">earned</span>
                </div>
              </div>

              <!-- 2. Top Streaming Song -->
              <div v-if="topStreamingSong" class="top-performer-row">
                <div class="performer-row-media">
                  <img
                    v-if="releaseCoverArtUrl(topStreamingSongRelease)"
                    :src="releaseCoverArtUrl(topStreamingSongRelease) || ''"
                    :alt="topStreamingSong.label"
                  >
                  <Music v-else class="size-5 text-muted-foreground" />
                </div>
                <div class="performer-row-info">
                  <span class="row-badge">Top Streams + Impression</span>
                  <h4>{{ topStreamingSong.label }}</h4>
                  <p v-if="topStreamingSongRelease">{{ topStreamingSongRelease.artistName }}</p>
                </div>
                <div class="performer-row-metric">
                  <span class="metric-value font-bold text-foreground">{{ formatAnalyticsCompact(topStreamingSong.count) }}</span>
                  <span class="metric-label">streams</span>
                </div>
              </div>

              <!-- 3. Top Country -->
              <div v-if="topCountry" class="top-performer-row">
                <div class="performer-row-media">
                  <CountryFlag :code="topCountry.countryCode" />
                </div>
                <div class="performer-row-info">
                  <span class="row-badge">Top Region</span>
                  <h4>{{ topCountry.countryName }}</h4>
                  <p>{{ formatAnalyticsCompact(topCountry.streams) }} total plays</p>
                </div>
                <div class="performer-row-metric">
                  <span class="metric-value font-bold text-foreground">{{ formatMoney(topCountry.revenue) }}</span>
                  <span class="metric-label">{{ topCountry.share.toFixed(1) }}% share</span>
                </div>
              </div>

              <!-- 4. Top DSP -->
              <div v-if="topDsp" class="top-performer-row">
                <div class="performer-row-media performer-row-media-dsp">
                  <DspLogo :logo-key="topDsp.logoKey" :label="topDsp.label" size="xs" class="dsp-logo-mini" />
                </div>
                <div class="performer-row-info">
                  <span class="row-badge">Top Platform</span>
                  <h4>{{ topDsp.label }}</h4>
                  <p>{{ formatAnalyticsCompact(topDsp.streams) }} total plays</p>
                </div>
                <div class="performer-row-metric">
                  <span class="metric-value font-bold text-foreground">{{ formatMoney(topDsp.revenue) }}</span>
                  <span class="metric-label">{{ topDsp.share.toFixed(1) }}% share</span>
                </div>
              </div>
            </div>

            <Button variant="secondary" class="subtle-card-link" as-child>
              <NuxtLink to="/dashboard/analytics">
                Open analytics
                <ArrowRight class="size-4" />
              </NuxtLink>
            </Button>
          </template>

          <AppEmptyState
            v-else
            compact
            icon="file"
            title="No top performers yet"
            description="The leading analytics data appears here once earnings are posted."
            class="border-0 bg-transparent shadow-none"
          />
        </Card>
      </div>
    </DashboardBento>
  </div>
</template>

<style scoped>
.dashboard-home {
  gap: 28px;
}

.dashboard-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.dashboard-heading h2 {
  margin: 0;
  color: var(--foreground);
  font-size: clamp(26px, 3.6vw, 40px);
  font-weight: 680;
  line-height: 1.08;
  letter-spacing: 0;
  text-wrap: balance;
}

.dashboard-heading p:not(.eyebrow) {
  margin: 8px 0 0;
  max-width: 680px;
  color: var(--muted-foreground);
  font-size: 15px;
  line-height: 1.55;
}

.dashboard-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
  align-items: start;
  gap: 16px;
}

.dashboard-kpi-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.8fr) repeat(2, minmax(0, 1fr));
  align-items: start;
}

.dashboard-kpi-text-filters {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

.dashboard-kpi-shell {
  position: relative;
  min-width: 0;
  border-radius: 16px;
}

.dashboard-kpi-shell :deep(.stat-card) {
  height: 100%;
}

.dashboard-kpi-shell-wallet,
.dashboard-kpi-shell-total,
.dashboard-kpi-shell-dues {
  overflow: visible;
}

.dashboard-wallet-kpi-card {
  position: relative;
  isolation: isolate;
  display: grid;
  container-type: inline-size;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: auto;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #302d27;
  padding: 27px 28px 22px;
  --kpi-text-label: rgb(54 49 42 / 82%);
  --kpi-text-value: rgb(42 38 32 / 92%);
  --kpi-text-small: rgb(70 64 55 / 68%);
  --kpi-text-blend-mode: multiply;
  --kpi-text-filter: url(#kpi-deboss-light);
  --kpi-value-filter: url(#kpi-deboss-value-light);
}

.dashboard-wallet-kpi-card-wallet {
  aspect-ratio: 3 / 1;
}

:global(.dark .dashboard-wallet-kpi-card) {
  color: #f8f3dc;
  --kpi-text-label: rgb(224 216 194 / 72%);
  --kpi-text-value: #f1e6cb;
  --kpi-text-small: rgb(217 211 192 / 64%);
  --kpi-text-blend-mode: normal;
  --kpi-text-filter: url(#kpi-deboss-dark);
  --kpi-value-filter: url(#kpi-deboss-value-dark);
}

.dashboard-wallet-kpi-card-total {
  aspect-ratio: 5 / 3;
  color: #302d27;
}

.dashboard-wallet-kpi-card-dues {
  aspect-ratio: 5 / 3;
  color: #302d27;
}

:global(.dark .dashboard-wallet-kpi-card-total) {
  color: #f8f3dc;
}

:global(.dark .dashboard-wallet-kpi-card-dues) {
  color: #f8f3dc;
}

.dashboard-wallet-art {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms var(--ease-out);
  filter:
    drop-shadow(0 12px 18px rgb(54 45 26 / 12%))
    drop-shadow(0 28px 28px rgb(35 30 18 / 10%));
}

.dashboard-wallet-kpi-card.is-art-loaded .dashboard-wallet-art {
  opacity: 1;
}

:global(.dark .dashboard-wallet-art) {
  filter:
    drop-shadow(0 1px 0 rgb(255 225 135 / 16%))
    drop-shadow(0 18px 22px rgb(0 0 0 / 42%))
    drop-shadow(0 36px 36px rgb(0 0 0 / 30%));
}

:global(.dark .dashboard-kpi-grid .stat-card-alt) {
  background: var(--card);
  border-color: color-mix(in srgb, var(--priority) 24%, var(--surface-border, var(--border)));
}

.dashboard-wallet-copy {
  position: relative;
  z-index: 4;
  display: grid;
  align-content: center;
  gap: 8px;
  max-width: min(60%, 270px);
  min-width: 0;
  height: 100%;
  opacity: 1;
  transition: opacity 180ms var(--ease-out);
}

.dashboard-wallet-kpi-card:not(.is-art-loaded) .dashboard-wallet-copy,
.dashboard-wallet-kpi-card:not(.is-art-loaded) .dashboard-wallet-hardware {
  opacity: 0;
}

.dashboard-wallet-kpi-card-total .dashboard-wallet-copy,
.dashboard-wallet-kpi-card-dues .dashboard-wallet-copy {
  align-content: start;
  gap: clamp(6px, 1.6cqw, 9px);
  max-width: min(52%, 196px);
  padding-top: clamp(6px, 1.9cqw, 10px);
}

.dashboard-wallet-copy span {
  overflow: hidden;
  color: var(--kpi-text-label);
  filter: var(--kpi-text-filter);
  font-size: clamp(11px, 1.05vw, 14px);
  font-weight: 760;
  letter-spacing: 0.18em;
  line-height: 1.15;
  mix-blend-mode: var(--kpi-text-blend-mode);
  text-shadow: none;
  text-overflow: ellipsis;
  text-rendering: geometricPrecision;
  text-transform: uppercase;
  white-space: nowrap;
}

.dashboard-wallet-copy strong {
  overflow: hidden;
  color: var(--kpi-text-value);
  filter: var(--kpi-value-filter);
  font-family: var(--font-sans);
  font-size: clamp(31px, 3.9vw, 50px);
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
  font-weight: 780;
  letter-spacing: 0;
  line-height: 0.98;
  mix-blend-mode: var(--kpi-text-blend-mode);
  text-shadow: none;
  text-overflow: ellipsis;
  text-rendering: geometricPrecision;
  white-space: nowrap;
}

.dashboard-wallet-copy small {
  overflow: hidden;
  color: var(--kpi-text-small);
  filter: var(--kpi-text-filter);
  font-size: clamp(12px, 1.25vw, 17px);
  line-height: 1.25;
  mix-blend-mode: var(--kpi-text-blend-mode);
  text-shadow: none;
  text-overflow: ellipsis;
  text-rendering: geometricPrecision;
  white-space: nowrap;
}

.dashboard-wallet-kpi-card-total .dashboard-wallet-copy span,
.dashboard-wallet-kpi-card-dues .dashboard-wallet-copy span {
  color: var(--kpi-text-label);
  font-size: clamp(11px, 3.1cqw, 13px);
  letter-spacing: 0.12em;
  line-height: 1.08;
  overflow: visible;
  text-overflow: clip;
}

.dashboard-wallet-kpi-card-total .dashboard-wallet-copy strong,
.dashboard-wallet-kpi-card-dues .dashboard-wallet-copy strong {
  color: var(--kpi-text-value);
  font-size: clamp(37px, 11.4cqw, 53px);
  line-height: 0.9;
  overflow: visible;
  text-overflow: clip;
}

.dashboard-wallet-kpi-card-total .dashboard-wallet-copy small,
.dashboard-wallet-kpi-card-dues .dashboard-wallet-copy small {
  color: var(--kpi-text-small);
  font-size: clamp(12px, 3.4cqw, 15px);
  line-height: 1.18;
  overflow: visible;
  text-overflow: clip;
}

.dashboard-wallet-hardware {
  position: absolute;
  right: clamp(20px, 5vw, 52px);
  top: 50%;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: clamp(12px, 1.8vw, 18px);
  color: rgb(218 173 69 / 86%);
  transform: translateY(-45%);
  filter: drop-shadow(0 7px 10px rgb(0 0 0 / 54%));
  opacity: 1;
  transition: opacity 180ms var(--ease-out);
}

.dashboard-wallet-chip {
  position: relative;
  width: clamp(45px, 4.5vw, 60px);
  height: clamp(32px, 3.2vw, 42px);
  overflow: hidden;
  border: 1px solid rgb(54 35 8 / 58%);
  border-radius: 9px;
  background:
    linear-gradient(135deg, #f7d66a 0%, #a67216 42%, #f3cb5b 72%, #7d5513 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 246 197 / 66%),
    inset 0 -1px 0 rgb(35 20 2 / 54%),
    0 1px 0 rgb(255 240 160 / 20%);
}

.dashboard-wallet-chip::before,
.dashboard-wallet-chip::after,
.dashboard-wallet-chip span {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, transparent 28%, rgb(54 35 8 / 56%) 29% 31%, transparent 32% 68%, rgb(54 35 8 / 56%) 69% 71%, transparent 72%),
    linear-gradient(0deg, transparent 30%, rgb(54 35 8 / 52%) 31% 33%, transparent 34% 66%, rgb(54 35 8 / 52%) 67% 69%, transparent 70%);
  opacity: 0.74;
}

.dashboard-wallet-chip::after {
  inset: 4px 8px;
  border: 1px solid rgb(54 35 8 / 58%);
  border-radius: 6px;
  background: transparent;
}

.dashboard-wallet-contactless {
  width: clamp(28px, 3vw, 38px);
  height: clamp(34px, 3.5vw, 44px);
  color: rgb(219 174 70 / 84%);
}

.dashboard-main-column,
.dashboard-side-column {
  display: grid;
  align-content: start;
  gap: 16px;
  min-width: 0;
}

/* Design Engineering: tighter grouping within action zone */
.dashboard-main-column > :nth-child(2) {
  margin-top: -4px;
}

.snapshot-card {
  display: grid;
  align-content: start;
  gap: 20px;
  padding: 24px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: 16px;
  background: var(--card);
  box-shadow: var(--shadow-card);
  isolation: isolate;
  transform: translateZ(0);
  overflow: hidden;
}

:global(.dark .snapshot-card) {
  background: var(--card);
  box-shadow: var(--shadow-card);
}

/* Design Engineering: Primary card tier — hero surface */
.snapshot-card-primary {
  border-color: var(--surface-border, var(--border));
  box-shadow: var(--shadow-card);
}

:global(.dark .snapshot-card-primary) {
  box-shadow: var(--shadow-card);
}

/* Design Engineering: Standard card tier */
.snapshot-card-standard {
  /* inherits base .snapshot-card */
}

/* Design Engineering: Receded card tier — quieter surface */
.snapshot-card-receded {
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--shadow-card);
}

:global(.dark .snapshot-card-receded) {
  background: var(--card);
  box-shadow: var(--shadow-card);
}

.revenue-chart-card {
  position: relative;
  gap: 14px;
  min-height: 0;
  align-self: start;
  padding: 24px;
}

/* Design Engineering: Subtle graph-paper backdrop for chart credibility */
.revenue-chart-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    repeating-linear-gradient(
      0deg,
      color-mix(in srgb, var(--border) 18%, transparent) 0px,
      color-mix(in srgb, var(--border) 18%, transparent) 1px,
      transparent 1px,
      transparent 32px
    ),
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--border) 18%, transparent) 0px,
      color-mix(in srgb, var(--border) 18%, transparent) 1px,
      transparent 1px,
      transparent 32px
    );
  pointer-events: none;
  z-index: 0;
  opacity: 0.5;
}

.release-pulse-card {
  min-height: 460px;
}

.chart-shell-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.metric-label {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.45;
  text-transform: uppercase;
}

.revenue-insight-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
  padding-top: 18px;
}

.revenue-insight-chip {
  display: grid;
  gap: 5px;
  min-width: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.revenue-insight-chip span,
.revenue-insight-chip small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revenue-insight-chip span {
  font-weight: 650;
  letter-spacing: 0;
  text-transform: uppercase;
}

.revenue-insight-chip strong {
  overflow: hidden;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-action-strip {
  gap: 10px;
  padding: 12px;
}

.dashboard-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dashboard-action-tile,
.dashboard-context-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 62px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 2%), color-mix(in srgb, var(--card) 92%, var(--muted) 8%));
  color: var(--foreground);
  padding: 10px 12px;
  text-decoration: none;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    var(--shadow-card);
  position: relative;
  overflow: hidden;
  --silver-glow: color-mix(in srgb, var(--foreground) 5%, transparent);
  transition: border-color 200ms var(--ease-out), background 200ms var(--ease-out), transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out);
}

button.dashboard-action-tile,
button.next-move-link {
  width: 100%;
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent);
  font: inherit;
  text-align: left;
}

.dark .dashboard-action-tile,
.dark .dashboard-context-row {
  --silver-glow: transparent;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  background:
    radial-gradient(115% 165% at 50% 42%, color-mix(in srgb, var(--card) 92%, var(--foreground) 4%) 0%, color-mix(in srgb, var(--card) 76%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 70%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 68%, var(--background)), color-mix(in srgb, var(--background) 62%, var(--card)));
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 2.6%),
    inset 0 0 16px rgb(254 249 231 / 1.8%),
    inset 0 1px 0 rgb(254 249 231 / 5.2%),
    inset 0 -1px 0 rgb(0 0 0 / 34%),
    0 1px 0 rgb(254 249 231 / 2.8%),
    0 14px 26px -20px rgb(0 0 0 / 86%);
}

.dark .dashboard-action-tile::before,
.dark .dashboard-context-row::before {
  opacity: 0;
}

.dashboard-action-tile > *,
.dashboard-context-row > * {
  position: relative;
  z-index: 1;
}

.dashboard-action-tile::before,
.dashboard-context-row::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(145deg, var(--silver-glow), transparent 46%),
    radial-gradient(circle at 14% 0%, color-mix(in srgb, var(--foreground) 6%, transparent), transparent 36%);
  opacity: 0.7;
  transform: none;
  transition: opacity 250ms var(--ease-out), transform 250ms var(--ease-out);
  pointer-events: none;
  z-index: 0;
}

.dashboard-action-tile-wide {
  grid-column: 1 / -1;
}

.dashboard-contextual-routes {
  display: grid;
  gap: 8px;
  margin-top: 2px;
  border-top: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 54%, transparent);
  padding-top: 10px;
}

.dashboard-context-row {
  min-height: 54px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, var(--foreground) 2%), color-mix(in srgb, var(--card) 91%, var(--muted) 9%));
}

.dashboard-action-tile:hover,
.dashboard-context-row:hover {
  border-color: color-mix(in srgb, var(--priority) 38%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--priority) 4%), color-mix(in srgb, var(--card) 90%, var(--muted) 10%));
  transform: translateY(-2px) translateZ(0);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent),
    var(--shadow-card-hover);
}

.dark .dashboard-action-tile:hover,
.dark .dashboard-context-row:hover {
  border-color: color-mix(in srgb, var(--priority) 12%, var(--surface-border, var(--border)));
  background:
    radial-gradient(115% 165% at 50% 42%, color-mix(in srgb, var(--card) 94%, var(--foreground) 5%) 0%, color-mix(in srgb, var(--card) 78%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 66%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 70%, var(--background)), color-mix(in srgb, var(--background) 58%, var(--card)));
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 3.2%),
    inset 0 0 18px rgb(254 249 231 / 2.4%),
    inset 0 1px 0 rgb(254 249 231 / 6.5%),
    inset 0 -1px 0 rgb(0 0 0 / 28%),
    0 1px 0 rgb(254 249 231 / 3.4%),
    0 18px 32px -21px rgb(0 0 0 / 92%);
}

.dashboard-action-tile:hover::before,
.dashboard-context-row:hover::before {
  opacity: 1;
  transform: none;
}

.dark .dashboard-action-tile:hover::before,
.dark .dashboard-context-row:hover::before {
  opacity: 0.34;
}

.dashboard-action-tile:hover .dashboard-action-icon,
.dashboard-context-row:hover .dashboard-action-icon {
  border-color: color-mix(in srgb, var(--priority) 50%, transparent);
  background: color-mix(in srgb, var(--priority) 6%, var(--muted));
  color: var(--priority);
  transform: translateY(-0.5px) translateZ(0);
}

.dark .dashboard-action-tile:hover .dashboard-action-icon,
.dark .dashboard-context-row:hover .dashboard-action-icon {
  border-color: color-mix(in srgb, var(--priority) 22%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 88%, var(--foreground) 4%), color-mix(in srgb, var(--background) 42%, var(--card)));
  color: color-mix(in srgb, var(--priority) 44%, var(--foreground));
}

.dashboard-action-tile:focus-visible,
.dashboard-context-row:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
}

.dashboard-action-tile:active,
.dashboard-context-row:active {
  transform: translateY(0) translateZ(0);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent),
    inset 0 10px 18px -16px color-mix(in srgb, var(--foreground) 28%, transparent),
    var(--shadow-sm);
}

.dark .dashboard-action-tile:active,
.dark .dashboard-context-row:active {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 70%, transparent);
  background:
    radial-gradient(105% 145% at 50% 45%, color-mix(in srgb, var(--card) 82%, var(--foreground) 2%) 0%, color-mix(in srgb, var(--card) 68%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 74%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 58%, var(--background)), color-mix(in srgb, var(--background) 68%, var(--card)));
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 2.4%),
    inset 0 10px 20px -16px rgb(0 0 0 / 84%),
    inset 0 1px 0 rgb(254 249 231 / 3.4%),
    inset 0 -1px 0 rgb(0 0 0 / 44%),
    0 8px 18px -18px rgb(0 0 0 / 86%);
}

.dashboard-action-tile > span:not(.dashboard-action-icon),
.dashboard-context-row > span:not(.dashboard-action-icon) {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.dashboard-action-tile strong,
.dashboard-action-tile small,
.dashboard-context-row strong,
.dashboard-context-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-action-tile strong,
.dashboard-context-row strong {
  color: var(--foreground);
  font-size: 14px;
  font-weight: 680;
  line-height: 1.2;
}

.dashboard-action-tile small,
.dashboard-context-row small {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.3;
}

.dashboard-action-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 3%), color-mix(in srgb, var(--muted) 38%, var(--card)));
  color: var(--foreground);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent),
    0 10px 18px -14px rgb(10 10 10 / 44%);
  transition: border-color 200ms var(--ease-out), color 200ms var(--ease-out), background-color 200ms var(--ease-out), transform 200ms var(--ease-out);
}

.dashboard-action-tile .lucide-arrow-right,
.dashboard-context-row .lucide-arrow-right {
  transition: transform 200ms var(--ease-out), color 200ms var(--ease-out);
}

.dashboard-action-tile:hover .lucide-arrow-right,
.dashboard-context-row:hover .lucide-arrow-right {
  transform: translateX(1.5px) translateZ(0);
  color: var(--priority);
}

.dark .dashboard-action-tile:hover .lucide-arrow-right,
.dark .dashboard-context-row:hover .lucide-arrow-right {
  color: color-mix(in srgb, var(--priority) 48%, var(--muted-foreground));
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-header h3 {
  margin: 0;
  color: var(--foreground);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0;
}

.release-pulse-art,
.performer-compact-art {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  background: color-mix(in srgb, var(--surface-glass-strong, var(--muted)) 70%, transparent);
  box-shadow: var(--shadow-sm);
}

.release-pulse-art {
  aspect-ratio: 1 / 1;
  min-height: 220px;
}

.release-pulse-art img,
.performer-compact-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.release-pulse-art::after {
  position: absolute;
  inset: auto 0 0;
  height: 45%;
  content: "";
  background: linear-gradient(180deg, transparent, rgba(10,10,10, 0.78));
  pointer-events: none;
}

.release-pulse-badges {
  position: absolute;
  inset: auto 14px 14px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.release-art-placeholder {
  display: grid;
  place-items: center;
  gap: 6px;
  height: 100%;
  color: var(--muted-foreground);
  font-size: 12px;
}

.release-pulse-copy,
.performer-compact-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.release-pulse-copy h4,
.performer-compact-copy h4 {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 22px;
  font-weight: 680;
  line-height: 1.15;
}

.release-copy-button {
  justify-self: start;
  margin-top: 2px;
}

.release-action-button,
.release-open-button {
  gap: 8px;
  font-size: 0.875rem;
  font-weight: 560;
  letter-spacing: 0;
}

.release-button-icon,
.release-button-arrow {
  width: 15px;
  height: 15px;
  stroke-width: 1.85;
}

.release-button-arrow {
  margin-left: 2px;
}

.performer-card {
  gap: 16px;
  align-self: start;
  min-height: 0;
}

.performer-compact {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 58%, transparent);
  padding: 10px;
  box-shadow: none;
}

.performer-compact-art {
  width: 92px;
  height: 92px;
  min-width: 92px;
  min-height: 0;
  max-width: 92px;
  max-height: 92px;
  aspect-ratio: 1 / 1;
  background: color-mix(in srgb, var(--surface-glass-strong, var(--muted)) 70%, transparent);
}

.performer-compact-copy {
  align-content: start;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
}

.performer-compact-copy h4 {
  overflow: hidden;
  font-size: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.performer-stat-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.performer-stat-row > div {
  display: grid;
  gap: 5px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 44%, transparent);
  padding: 8px 9px;
  min-width: 0;
}

.performer-stat-row span {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: uppercase;
}

.performer-stat-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.release-type-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 9px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.release-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.release-meta-grid span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 46%, transparent);
  color: var(--muted-foreground);
  padding: 10px;
  font-size: 13px;
  line-height: 1.35;
}

.financial-activity-list {
  display: grid;
  gap: 10px;
}

.badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.activity-time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.next-move-link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 0;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 2%), color-mix(in srgb, var(--card) 92%, var(--muted) 8%));
  color: var(--foreground);
  padding: 14px;
  text-decoration: none;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    var(--shadow-card);
  position: relative;
  overflow: hidden;
  --silver-glow: color-mix(in srgb, var(--foreground) 5%, transparent);
  transition: border-color 200ms var(--ease-out), background 200ms var(--ease-out), transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out);
}

.dark .next-move-link {
  --silver-glow: transparent;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  background:
    radial-gradient(115% 165% at 50% 42%, color-mix(in srgb, var(--card) 92%, var(--foreground) 4%) 0%, color-mix(in srgb, var(--card) 76%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 70%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 68%, var(--background)), color-mix(in srgb, var(--background) 62%, var(--card)));
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 2.6%),
    inset 0 0 16px rgb(254 249 231 / 1.8%),
    inset 0 1px 0 rgb(254 249 231 / 5.2%),
    inset 0 -1px 0 rgb(0 0 0 / 34%),
    0 1px 0 rgb(254 249 231 / 2.8%),
    0 14px 26px -20px rgb(0 0 0 / 86%);
}

.dark .next-move-link::before {
  opacity: 0;
}

.next-move-link > * {
  position: relative;
  z-index: 1;
}

.next-move-link::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(145deg, var(--silver-glow), transparent 46%),
    radial-gradient(circle at 14% 0%, color-mix(in srgb, var(--foreground) 6%, transparent), transparent 36%);
  opacity: 0.7;
  transform: none;
  transition: opacity 250ms var(--ease-out), transform 250ms var(--ease-out);
  pointer-events: none;
  z-index: 0;
}

.next-move-link:hover {
  border-color: color-mix(in srgb, var(--priority) 38%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--priority) 4%), color-mix(in srgb, var(--card) 90%, var(--muted) 10%)) !important;
  transform: translateY(-2px) translateZ(0);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent),
    var(--shadow-card-hover);
}

.dark .next-move-link:hover {
  border-color: color-mix(in srgb, var(--priority) 12%, var(--surface-border, var(--border)));
  background:
    radial-gradient(115% 165% at 50% 42%, color-mix(in srgb, var(--card) 94%, var(--foreground) 5%) 0%, color-mix(in srgb, var(--card) 78%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 66%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 70%, var(--background)), color-mix(in srgb, var(--background) 58%, var(--card))) !important;
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 3.2%),
    inset 0 0 18px rgb(254 249 231 / 2.4%),
    inset 0 1px 0 rgb(254 249 231 / 6.5%),
    inset 0 -1px 0 rgb(0 0 0 / 28%),
    0 1px 0 rgb(254 249 231 / 3.4%),
    0 18px 32px -21px rgb(0 0 0 / 92%);
}

.next-move-link:hover::before {
  opacity: 1;
  transform: none;
}

.dark .next-move-link:hover::before {
  opacity: 0.34;
}

.next-move-link:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
}

.next-move-link:active {
  transform: translateY(0) translateZ(0);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent),
    inset 0 10px 18px -16px color-mix(in srgb, var(--foreground) 28%, transparent),
    var(--shadow-sm);
}

.dark .next-move-link:active {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 70%, transparent);
  background:
    radial-gradient(105% 145% at 50% 45%, color-mix(in srgb, var(--card) 82%, var(--foreground) 2%) 0%, color-mix(in srgb, var(--card) 68%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 74%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 58%, var(--background)), color-mix(in srgb, var(--background) 68%, var(--card))) !important;
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 2.4%),
    inset 0 10px 20px -16px rgb(0 0 0 / 84%),
    inset 0 1px 0 rgb(254 249 231 / 3.4%),
    inset 0 -1px 0 rgb(0 0 0 / 44%),
    0 8px 18px -18px rgb(0 0 0 / 86%);
}

.next-move-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 3%), color-mix(in srgb, var(--muted) 38%, var(--card)));
  color: var(--foreground);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent),
    0 10px 18px -14px rgb(10 10 10 / 44%);
  transition: border-color 200ms var(--ease-out), color 200ms var(--ease-out), background-color 200ms var(--ease-out), transform 200ms var(--ease-out);
}

.next-move-link:hover .next-move-icon {
  border-color: color-mix(in srgb, var(--priority) 50%, transparent);
  background: color-mix(in srgb, var(--priority) 6%, var(--muted));
  color: var(--priority);
  transform: translateY(-0.5px) translateZ(0);
}

.dark .next-move-link:hover .next-move-icon {
  border-color: color-mix(in srgb, var(--priority) 22%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 88%, var(--foreground) 4%), color-mix(in srgb, var(--background) 42%, var(--card)));
  color: color-mix(in srgb, var(--priority) 44%, var(--foreground));
}

.next-move-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.next-move-copy strong {
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 18px;
  font-weight: 660;
  line-height: 1.12;
}

.next-move-action {
  grid-column: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
}

.next-move-link .lucide-arrow-right,
.next-move-link .lucide-arrow-left {
  transition: transform 200ms var(--ease-out), color 200ms var(--ease-out);
}

.next-move-link:hover .lucide-arrow-right {
  transform: translateX(1.5px) translateZ(0);
  color: var(--priority);
}

.dark .next-move-link:hover .lucide-arrow-right {
  color: color-mix(in srgb, var(--priority) 48%, var(--muted-foreground));
}

.dashboard-action-tile-locked,
.next-move-link-locked {
  color: color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground));
  cursor: not-allowed;
}

.dashboard-action-tile-locked:hover,
.next-move-link-locked:hover,
.dashboard-action-tile-locked:active,
.next-move-link-locked:active {
  border-color: color-mix(in srgb, var(--muted-foreground) 24%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--muted) 4%), color-mix(in srgb, var(--card) 90%, var(--muted) 10%)) !important;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    var(--shadow-card);
  transform: translateY(0) translateZ(0);
}

.dark .dashboard-action-tile-locked:hover,
.dark .next-move-link-locked:hover,
.dark .dashboard-action-tile-locked:active,
.dark .next-move-link-locked:active {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  background:
    radial-gradient(115% 165% at 50% 42%, color-mix(in srgb, var(--card) 88%, var(--foreground) 3%) 0%, color-mix(in srgb, var(--card) 74%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 70%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 66%, var(--background)), color-mix(in srgb, var(--background) 62%, var(--card))) !important;
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 2.6%),
    inset 0 0 16px rgb(254 249 231 / 1.8%),
    inset 0 1px 0 rgb(254 249 231 / 5.2%),
    inset 0 -1px 0 rgb(0 0 0 / 34%),
    0 1px 0 rgb(254 249 231 / 2.8%),
    0 14px 26px -20px rgb(0 0 0 / 86%);
}

.dashboard-action-tile-locked:hover::before,
.next-move-link-locked:hover::before {
  opacity: 0.46;
}

.dashboard-action-tile-locked .dashboard-action-icon,
.next-move-link-locked .next-move-icon,
.dashboard-action-tile-locked:hover .dashboard-action-icon,
.next-move-link-locked:hover .next-move-icon {
  border-color: color-mix(in srgb, var(--muted-foreground) 22%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--muted) 44%, var(--card));
  color: color-mix(in srgb, var(--foreground) 60%, var(--muted-foreground));
  transform: translateY(0) translateZ(0);
}

.dashboard-action-lock-badge {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--muted-foreground) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted-foreground) 9%, transparent);
  color: color-mix(in srgb, var(--foreground) 62%, var(--muted-foreground));
}

.next-move-lock-status {
  color: color-mix(in srgb, var(--foreground) 62%, var(--muted-foreground));
}

:global(.dashboard-locked-tooltip) {
  max-width: 280px;
  white-space: normal;
  line-height: 1.35;
}

.subtle-card-link {
  justify-self: start;
  min-height: 34px;
  padding-inline: 14px;
  font-weight: 650;
}

.financial-activity-row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--muted) 22%, var(--card));
  box-shadow: var(--shadow-card);
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-standard, 200ms) var(--ease-out),
    transform var(--duration-standard, 200ms) var(--ease-out);
}

:global(.dark .financial-activity-row) {
  background: color-mix(in srgb, var(--muted) 18%, var(--card));
}

.activity-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.activity-copy strong {
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 14px;
  font-weight: 650;
}

.activity-copy span {
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.45;
}

.activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: none;
}

.activity-dot.positive {
  background: var(--status-success);
  box-shadow: none;
}

.activity-dot.negative {
  background: var(--status-warning);
  box-shadow: none;
}

.amount-positive {
  color: var(--status-success);
}

.amount-negative {
  color: var(--status-warning);
}

@media (max-width: 1180px) {
  .dashboard-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .chart-shell-top {
    display: grid;
  }

  .revenue-insight-strip {
    grid-template-columns: 1fr;
  }

  .dashboard-action-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-action-tile-wide {
    grid-column: auto;
  }

  .release-pulse-art {
    min-height: 180px;
  }

  .release-meta-grid {
    grid-template-columns: 1fr;
  }

  .performer-compact {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .performer-compact-art {
    width: 72px;
    height: 72px;
    min-width: 72px;
    max-width: 72px;
    max-height: 72px;
  }

  .performer-stat-row {
    grid-template-columns: 1fr;
  }

  .financial-activity-row {
    grid-template-columns: 10px minmax(0, 1fr);
  }

  .financial-activity-row > strong {
    grid-column: 2;
  }
}

.artist-dashboard-bento {
  align-items: stretch;
}

.bento-cell {
  display: grid;
  min-width: 0;
}

.bento-cell > .snapshot-card {
  height: 100%;
}

.snapshot-card > * {
  min-width: 0;
}

.performance-overview-card {
  position: relative;
  overflow: hidden;
  gap: 20px;
  min-height: auto;
}

.performance-overview-card::before {
  content: none;
}

.performance-overview-card > * {
  position: relative;
  z-index: 1;
}

.performance-chart-section {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.revenue-chart-panel {
  gap: 14px;
}

.revenue-chart-header {
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 0;
}

.revenue-chart-title {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.revenue-chart-title span {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revenue-chart-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.revenue-range-select {
  flex: 0 0 168px;
}

.revenue-chart-body {
  min-width: 0;
  margin-inline: 0;
  overflow: visible;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.revenue-shadcn-chart,
.revenue-chart-loading,
.revenue-chart-empty {
  min-height: 286px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 2%), color-mix(in srgb, var(--card) 93%, var(--muted) 7%));
}

.revenue-shadcn-chart {
  padding: 12px 10px 4px;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent),
    0 16px 34px -32px rgb(10 10 10 / 46%);
}

.revenue-chart-loading {
  display: block;
}

.revenue-chart-empty {
  display: grid;
  place-items: center;
}

.revenue-shadcn-chart :deep(.unovis-xy-container) {
  min-height: 270px;
}

.revenue-shadcn-chart :deep(svg) {
  overflow: visible;
}

.revenue-shadcn-chart :deep(.vis-axis .tick line),
.revenue-shadcn-chart :deep(.vis-axis .domain) {
  stroke: color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
}

.revenue-shadcn-chart :deep(.vis-axis-grid-line) {
  display: none;
  stroke: transparent;
}

.revenue-shadcn-chart :deep(.vis-line path) {
  filter: drop-shadow(0 10px 12px color-mix(in srgb, var(--chart-1) 18%, transparent));
}

.revenue-shadcn-chart :deep(.vis-crosshair-line) {
  stroke: color-mix(in srgb, var(--chart-1) 42%, transparent);
  stroke-dasharray: 4 6;
}

.revenue-shadcn-chart :deep(.vis-crosshair-circle) {
  fill: var(--card);
  stroke: var(--chart-1);
  stroke-width: 2px;
}

:global(.revenue-chart-tooltip-popover) {
  width: max-content !important;
  min-width: 128px !important;
  max-width: 220px !important;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent) !important;
  border-radius: 10px !important;
  background: var(--popover) !important;
  color: var(--popover-foreground) !important;
  box-shadow: 0 14px 30px rgb(0 0 0 / 26%) !important;
  padding: 0 !important;
  backdrop-filter: blur(14px);
}

:global(.revenue-chart-tooltip-content) {
  display: grid;
  gap: 4px;
  min-width: 124px;
  padding: 10px 12px;
}

:global(.revenue-chart-tooltip-content strong) {
  color: var(--foreground);
  font-size: 12px;
  font-weight: 680;
  line-height: 1.1;
}

:global(.revenue-chart-tooltip-content span) {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.25;
}

:global(.dark) .revenue-shadcn-chart,
:global(.dark) .revenue-chart-loading,
:global(.dark) .revenue-chart-empty {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 64%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 86%, var(--foreground) 3%), color-mix(in srgb, var(--background) 68%, var(--card)));
}

.main-stack {
  display: flex;
  flex-direction: column;
  align-content: start;
  gap: 16px;
}

.main-stack > .snapshot-card {
  height: auto;
}

.side-stack-cell {
  align-content: start;
  gap: 16px;
}

.side-stack-cell > .snapshot-card {
  height: auto;
}

.side-stack-cell .release-pulse-card {
  min-height: 404px;
}

.revenue-chart-card::before {
  content: none;
}

.revenue-chart-card {
  position: static;
  gap: 16px;
  min-height: 390px;
  padding: 28px;
}

.next-move-card {
  gap: 16px;
}

.next-move-card-priority {
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--shadow-card);
}

.next-move-link-priority {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 2%), color-mix(in srgb, var(--card) 92%, var(--muted) 8%));
}

.next-move-link-muted {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, var(--foreground) 2%), color-mix(in srgb, var(--card) 91%, var(--muted) 9%));
}

.dark .next-move-link-priority,
.dark .next-move-link-muted {
  background:
    radial-gradient(115% 165% at 50% 42%, color-mix(in srgb, var(--card) 92%, var(--foreground) 4%) 0%, color-mix(in srgb, var(--card) 76%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 70%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 68%, var(--background)), color-mix(in srgb, var(--background) 62%, var(--card)));
}


.fallback-route-list {
  display: grid;
  gap: 10px;
}

@media (max-width: 1440px) {
  .dashboard-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bento-cell > .snapshot-card {
    min-height: 0;
  }
}

@media (max-width: 760px) {
  .dashboard-kpi-grid {
    grid-template-columns: 1fr;
  }

  .snapshot-card {
    padding: 20px;
  }

  .performance-overview-card {
    min-height: 0;
  }

  .revenue-chart-header {
    align-items: stretch;
    flex-direction: column;
  }

  .revenue-chart-actions {
    justify-content: stretch;
    width: 100%;
  }

  .revenue-chart-actions > svg {
    display: none;
  }

  .revenue-range-select {
    flex-basis: auto;
    width: 100%;
  }

  .revenue-shadcn-chart,
  .revenue-chart-loading,
  .revenue-chart-empty {
    min-height: 258px;
    border-radius: 14px;
    padding-inline: 0;
  }

  .revenue-insight-strip {
    grid-template-columns: 1fr;
  }
}

/* ── Design Engineering: Revenue Insight Chip Entrance ── */
@keyframes insight-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.revenue-insight-chip {
  animation: insight-enter 460ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.revenue-insight-chip:nth-child(1) { animation-delay: 1600ms; }
.revenue-insight-chip:nth-child(2) { animation-delay: 1680ms; }
.revenue-insight-chip:nth-child(3) { animation-delay: 1760ms; }

/* ── Design Engineering: Elegant Static Card Suite ── */
.interactive-3d-card {
  position: relative;
  transition: border-color 300ms cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 300ms cubic-bezier(0.16, 1, 0.3, 1);

  /* Entrance animation via separate properties to avoid transform conflicts */
  opacity: 0;
  animation: bento-entrance 800ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.interactive-3d-card > * {
  position: relative;
  z-index: 2;
}

.interactive-3d-card:hover {
  border-color: var(--surface-border, var(--border));
  box-shadow: var(--shadow-card-hover);
}

/* Stagger entrance delays for orchestrated card reveals */
.performance-overview-card { animation-delay: 50ms; }
.next-move-card { animation-delay: 150ms; }
.release-pulse-card { animation-delay: 250ms; }
.quick-actions-card { animation-delay: 350ms; }
.financial-activity-card { animation-delay: 450ms; }
.performer-card { animation-delay: 550ms; }

@keyframes bento-entrance {
  from {
    opacity: 0;
    translate: 0 24px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

/* Release pulse album art micro-animation */
.release-pulse-art img {
  transition: transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
}

.release-pulse-card:hover .release-pulse-art img {
  transform: scale(1.06);
}

/* Respect user accessibility constraints (prefers-reduced-motion) */
@media (prefers-reduced-motion: reduce) {
  .interactive-3d-card {
    opacity: 1 !important;
    translate: none !important;
    animation: none !important;
    transition: none !important;
  }
  .release-pulse-art img {
    transition: none !important;
  }
  .release-pulse-card:hover .release-pulse-art img {
    transform: none !important;
  }
}

/* ── Design Engineering: Section Header Entrance ── */
.performance-chart-section .section-header {
  animation: insight-enter 400ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) 360ms both;
}

/* ── Top Performers Multi-Metric Row Styles ── */
.top-performers-list {
  display: grid;
  gap: 12px;
}

.top-performer-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-glass-strong, var(--muted)) 34%, transparent);
  padding: 10px 14px;
  transition: transform 200ms var(--ease-out), border-color 200ms var(--ease-out), background 200ms var(--ease-out);
}

.top-performer-row:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--priority) 46%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--priority) 2.5%, var(--card));
}

.performer-row-media {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 60%, transparent);
  display: grid;
  place-items: center;
}

.performer-row-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.performer-row-media-dsp {
  width: auto;
  height: 24px;
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
}

.dsp-logo-mini {
  --dsp-logo-box-width: 68px !important;
  --dsp-logo-box-height: 16px !important;
}

.performer-row-info {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.performer-row-info .row-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--muted-foreground);
  letter-spacing: 0.06em;
  line-height: 1;
}

.performer-row-info h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 680;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.performer-row-info p {
  margin: 0;
  font-size: 11px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.25;
}

.performer-row-metric {
  display: grid;
  justify-items: end;
  align-content: center;
  gap: 1px;
}

.performer-row-metric .metric-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.performer-row-metric .metric-label {
  font-size: 10px;
  color: var(--muted-foreground);
  text-transform: lowercase;
}
</style>
