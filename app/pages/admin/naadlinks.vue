<script setup lang="ts">
import { BadgeCheck, Check, Copy, Download, ExternalLink, Link2, Pencil, Plus, RefreshCw, ShieldAlert, Trash2, UploadCloud, X } from "lucide-vue-next"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/native-select"
import { detectDspLinks } from "~/utils/naadlinks-dsp"
import { groupCreditsIntoSections } from "~/utils/naadlinks-credits"
import {
  emptyStreamingLinks,
  NAADLINK_ROOT_DOMAIN,
  NAADLINK_STREAMING_KEYS,
  type NaadLinkCreditSection,
  type NaadLinkPayload,
  type NaadLinkRecord,
  type NaadLinksListResponse,
  type NaadLinkSocial,
  type NaadLinkStreamingLinks,
  type ReleaseOptionForLinks,
  type ReleaseOptionsResponse,
} from "~~/types/naadlinks"
import type { ImportArtistOption } from "~~/types/imports"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

const STREAMING_LABELS: Record<keyof NaadLinkStreamingLinks, string> = {
  spotify: "Spotify", appleMusic: "Apple Music", youtubeMusic: "YouTube Music", youtube: "YouTube",
  tidal: "TIDAL", amazonMusic: "Amazon Music", itunes: "iTunes Store", deezer: "Deezer",
  soundcloud: "SoundCloud", audiomack: "Audiomack", anghami: "Anghami", boomplay: "Boomplay",
  kkbox: "KKBOX", pandora: "Pandora", iheart: "iHeartRadio", napster: "Napster", qobuz: "Qobuz",
  jiosaavn: "JioSaavn", gaana: "Gaana", wynk: "Wynk Music", hungama: "Hungama",
}

const { confirmAction } = useConfirmAction()
const ALL_MANAGE_ARTISTS = "all"

const { data: linksData, pending, error: linksError, refresh } = useLazyFetch<NaadLinksListResponse>("/api/admin/naadlinks")
const links = computed(() => linksData.value?.links ?? [])
const selectedManageArtist = ref(ALL_MANAGE_ARTISTS)
const manageArtistOptions = computed(() => {
  const options = new Map<string, { value: string; label: string; count: number }>()

  for (const link of links.value) {
    const value = naadLinkArtistFilterKey(link)
    const label = naadLinkArtistName(link)
    const existing = options.get(value)

    if (existing) {
      existing.count += 1
    } else {
      options.set(value, { value, label, count: 1 })
    }
  }

  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label))
})
const filteredLinks = computed(() => selectedManageArtist.value === ALL_MANAGE_ARTISTS
  ? links.value
  : links.value.filter((link) => naadLinkArtistFilterKey(link) === selectedManageArtist.value))
const manageLinksDescription = computed(() => selectedManageArtist.value === ALL_MANAGE_ARTISTS
  ? `${links.value.length} link page${links.value.length === 1 ? "" : "s"}`
  : `${filteredLinks.value.length} of ${links.value.length} link page${links.value.length === 1 ? "" : "s"}`)

watch(manageArtistOptions, (options) => {
  if (selectedManageArtist.value !== ALL_MANAGE_ARTISTS && !options.some((option) => option.value === selectedManageArtist.value)) {
    selectedManageArtist.value = ALL_MANAGE_ARTISTS
  }
})

useRevealPage({ ready: computed(() => !pending.value || !!linksData.value) })

const { data: artistData } = useLazyFetch<{ artists: ImportArtistOption[] }>("/api/admin/artists", {
  query: { surface: "options" },
})
const artists = computed(() => artistData.value?.artists ?? [])

const activeTab = ref<"manage" | "create">("manage")
const tabs = computed(() => [
  { label: "Manage links", value: "manage", badge: links.value.length },
  { label: editingId.value ? "Edit link" : "Create new link", value: "create" },
])

const errorMessage = ref("")
const successMessage = ref("")
const detectMessage = ref("")
const isSaving = ref(false)

// ── Create / edit flow ──
const editingId = ref<string | null>(null)
const editingLink = computed(() => links.value.find((link) => link.id === editingId.value) ?? null)
const selectedArtistId = ref("")
const releaseOptions = ref<ReleaseOptionForLinks[]>([])
const releaseSocial = ref<NaadLinkSocial>({})
const releasesPending = ref(false)
const selectedReleaseId = ref("")
const selectedTrackId = ref("")
const bulkLinks = ref("")
const creditSections = ref<NaadLinkCreditSection[]>([])

const form = reactive({
  slug: "",
  subdomain: "",
  releaseYear: "",
  artistName: "",
  homeUrl: "",
  trackTitle: "",
  coverArt: "",
  audioPreview: "",
  social: { instagram: "", youtube: "", tiktok: "", facebook: "" } as Record<keyof NaadLinkSocial, string>,
  streamingLinks: emptyStreamingLinks() as NaadLinkStreamingLinks,
})

const selectedRelease = computed(() => releaseOptions.value.find((release) => release.id === selectedReleaseId.value) ?? null)
const releaseTracks = computed(() => selectedRelease.value?.tracks ?? [])

// ── Deploy (FTP) state ──
interface FtpStatus {
  configured: boolean
  ok: boolean
  host?: string
  rootDomain: string
  error?: string
}
const { data: ftpStatus, refresh: refreshFtpStatus } = useLazyFetch<FtpStatus>("/api/admin/naadlinks/ftp-status", {
  key: "ftp-status",
})

// Per-artist subdomains + their verified state (verified once, kept forever).
interface ArtistSubdomain {
  artistId: string
  subdomain: string
  verified: boolean
  verifiedAt: string | null
}
const { data: subdomainsData, refresh: refreshSubdomains } = useLazyFetch<{ subdomains: ArtistSubdomain[] }>(
  "/api/admin/naadlinks/subdomains",
  { key: "naadlink-subdomains" },
)
const artistSubdomains = computed(() => subdomainsData.value?.subdomains ?? [])
const subdomainByArtist = computed(() => {
  const map = new Map<string, ArtistSubdomain>()
  for (const record of artistSubdomains.value) map.set(record.artistId, record)
  return map
})
const verifiedSubdomainSet = computed(
  () => new Set(artistSubdomains.value.filter((record) => record.verified).map((record) => record.subdomain)),
)

const verifyBusy = ref(false)
const deployBusy = ref(false)
const failedCoverIds = ref(new Set<string>())

// ── Deploy progress animation ──
const deployProgress = ref(0)
const deployPhase = ref("")
const showDeployProgress = ref(false)
let deployInterval: ReturnType<typeof setInterval> | null = null
let deployPhaseTimers: ReturnType<typeof setTimeout>[] = []
let deployHideTimer: ReturnType<typeof setTimeout> | null = null

function clearDeployTimers() {
  if (deployInterval) {
    clearInterval(deployInterval)
    deployInterval = null
  }
  deployPhaseTimers.forEach((timer) => clearTimeout(timer))
  deployPhaseTimers = []
  if (deployHideTimer) {
    clearTimeout(deployHideTimer)
    deployHideTimer = null
  }
}

function startDeployProgress() {
  clearDeployTimers()
  showDeployProgress.value = true
  deployProgress.value = 6
  deployPhase.value = "Saving the link…"
  // Brief, honest descriptions of each server-side phase.
  const phases: { at: number; label: string }[] = [
    { at: 400, label: "Building the page…" },
    { at: 1200, label: "Connecting to the server…" },
    { at: 2200, label: "Uploading files…" },
    { at: 6000, label: "Almost there…" },
  ]
  deployPhaseTimers = phases.map((phase) => setTimeout(() => (deployPhase.value = phase.label), phase.at))
  // Ease toward 92% while the request is in flight; snap to 100% on success.
  deployInterval = setInterval(() => {
    const target = 92
    if (deployProgress.value < target) {
      deployProgress.value = Math.min(target, deployProgress.value + Math.max(0.4, (target - deployProgress.value) * 0.05))
    }
  }, 140)
}

function finishDeployProgress() {
  clearDeployTimers()
  deployProgress.value = 100
  deployPhase.value = "Deployed"
  deployHideTimer = setTimeout(() => {
    showDeployProgress.value = false
    deployProgress.value = 0
  }, 1800)
}

function failDeployProgress(hidePhase = false) {
  clearDeployTimers()
  if (hidePhase) {
    showDeployProgress.value = false
    deployProgress.value = 0
    return
  }
  deployPhase.value = "Failed"
  deployHideTimer = setTimeout(() => {
    showDeployProgress.value = false
    deployProgress.value = 0
  }, 1800)
}

function normalizeSub(value: string) {
  return value.trim().toLowerCase().replace(/\.[a-z0-9.-]*$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}
const cleanSubdomain = computed(() => normalizeSub(form.subdomain))
const cleanSlug = computed(() => suggestSlug(form.slug))

// Inputs/actions become active once an artist is in context (or we're editing).
const formActive = computed(() => Boolean(selectedArtistId.value) || Boolean(editingId.value))
const currentArtistId = computed(() => selectedArtistId.value || editingLink.value?.artistId || "")

// Verified is an artist-level fact stored in naadlink_subdomains — so it holds
// across logins and new links, with no slug or saved link involved.
const isVerified = computed(() => Boolean(cleanSubdomain.value) && verifiedSubdomainSet.value.has(cleanSubdomain.value))

async function verifySubdomain() {
  resetMessages()
  if (!currentArtistId.value) {
    errorMessage.value = "Select an artist before verifying."
    return
  }
  if (!cleanSubdomain.value) {
    errorMessage.value = "Enter a subdomain to verify."
    return
  }
  verifyBusy.value = true
  try {
    const result = (await $fetch("/api/admin/naadlinks/verify-subdomain", {
      method: "POST",
      body: { artistId: currentArtistId.value, subdomain: cleanSubdomain.value },
    })) as { exists: boolean; domain: string; docroot: string }
    await refreshSubdomains()
    successMessage.value = result.exists
      ? `Verified ${result.domain} — it'll stay verified for this artist.`
      : `${result.domain} isn't set up yet. Create it in cPanel (doc root /${result.docroot}), then verify again.`
  } catch (caught: any) {
    errorMessage.value = caught?.data?.statusMessage || caught?.message || "Could not verify the subdomain."
  } finally {
    verifyBusy.value = false
  }
}

async function deployLink() {
  resetMessages()
  if (!isVerified.value) {
    errorMessage.value = "Verify the subdomain before deploying."
    return
  }
  if (!cleanSlug.value) {
    errorMessage.value = "Enter a link slug."
    return
  }
  deployBusy.value = true
  startDeployProgress()
  try {
    const saved = await persistLink()
    if (!saved) {
      failDeployProgress(true)
      return
    }
    const result = (await $fetch(`/api/admin/naadlinks/${saved.id}/deploy`, {
      method: "POST",
      body: {},
    })) as { url: string; fileCount: number }
    await refresh()
    finishDeployProgress()
    successMessage.value = `Deployed ${result.fileCount} files → ${result.url}`
  } catch (caught: any) {
    failDeployProgress()
    errorMessage.value = caught?.data?.statusMessage || caught?.message || "Deployment failed."
    await refresh()
  } finally {
    deployBusy.value = false
  }
}

function resetMessages() {
  errorMessage.value = ""
  successMessage.value = ""
  detectMessage.value = ""
}

function suggestSlug(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

watch(selectedArtistId, async (artistId) => {
  // Editing an existing link doesn't use the artist picker — leave its fields alone.
  if (editingId.value) {
    return
  }

  releaseOptions.value = []
  releaseSocial.value = {}
  selectedReleaseId.value = ""
  selectedTrackId.value = ""

  if (!artistId) {
    form.subdomain = ""
    return
  }

  // Auto-fill this artist's saved subdomain from the artist→subdomain table
  // (falling back to any existing link of theirs), so it's there + verified
  // without re-typing or re-verifying.
  const mapped = subdomainByArtist.value.get(artistId)
  const fromLink = links.value.find((link) => link.artistId === artistId && link.subdomain)?.subdomain
  form.subdomain = mapped?.subdomain ?? fromLink ?? ""

  releasesPending.value = true
  try {
    const result = (await $fetch("/api/admin/naadlinks/release-options", {
      query: { artistId },
    })) as ReleaseOptionsResponse
    releaseOptions.value = result.releases
    releaseSocial.value = result.social
  } catch (caught: any) {
    errorMessage.value = caught?.data?.statusMessage || caught?.message || "Unable to load this artist's releases."
  } finally {
    releasesPending.value = false
  }
})

watch(selectedReleaseId, () => {
  const release = selectedRelease.value
  if (!release) {
    return
  }
  selectedTrackId.value = release.tracks[0]?.id ?? ""
  applyAutofill()
})

watch(selectedTrackId, () => applyAutofill())

function applyAutofill() {
  const release = selectedRelease.value
  if (!release) {
    return
  }

  const track = release.tracks.find((item) => item.id === selectedTrackId.value) ?? release.tracks[0] ?? null

  form.artistName = release.artistName
  form.trackTitle = track?.title ?? release.title
  form.coverArt = release.coverArtUrl ?? ""
  form.audioPreview = track?.audioPreviewUrl ?? ""
  form.releaseYear = release.releaseDate ? release.releaseDate.slice(0, 4) : ""
  form.social = {
    instagram: releaseSocial.value.instagram ?? "",
    youtube: releaseSocial.value.youtube ?? "",
    tiktok: releaseSocial.value.tiktok ?? "",
    facebook: releaseSocial.value.facebook ?? "",
  }
  creditSections.value = groupCreditsIntoSections(track?.credits ?? [])

  if (!form.slug) {
    form.slug = suggestSlug(form.trackTitle)
  }
  // DSP links stay manual — never auto-filled.
}

// DSP links auto-detect as you paste — no button needed.
let dspDebounceTimer: ReturnType<typeof setTimeout> | null = null

function onBulkLinksInput() {
  if (dspDebounceTimer) {
    clearTimeout(dspDebounceTimer)
  }
  dspDebounceTimer = setTimeout(runDspDetect, 250)
}

function runDspDetect() {
  const { links: detectedLinks, detected } = detectDspLinks(bulkLinks.value, form.streamingLinks)
  form.streamingLinks = detectedLinks
  detectMessage.value = detected.length
    ? `Detected ${detected.length} platform${detected.length === 1 ? "" : "s"}.`
    : ""
}

function clearDsp(key: keyof NaadLinkStreamingLinks) {
  form.streamingLinks[key] = ""
}

const showAllDsp = ref(false)
const filledDspKeys = computed(() => NAADLINK_STREAMING_KEYS.filter((key) => form.streamingLinks[key]?.trim()))
const emptyDspKeys = computed(() => NAADLINK_STREAMING_KEYS.filter((key) => !form.streamingLinks[key]?.trim()))
const visibleDspKeys = computed(() => (showAllDsp.value ? NAADLINK_STREAMING_KEYS : filledDspKeys.value))

onBeforeUnmount(() => {
  if (dspDebounceTimer) {
    clearTimeout(dspDebounceTimer)
  }
  clearDeployTimers()
})

function addCreditItem(section: NaadLinkCreditSection) {
  section.items.push({ name: "", role: "" })
}

function removeCreditItem(section: NaadLinkCreditSection, index: number) {
  section.items.splice(index, 1)
}

function buildPayload(): NaadLinkPayload {
  const social: NaadLinkSocial = {}
  for (const key of ["instagram", "youtube", "tiktok", "facebook"] as const) {
    const value = form.social[key]?.trim()
    if (value) social[key] = value
  }

  return {
    artist: { name: form.artistName.trim(), homeUrl: form.homeUrl.trim() },
    track: {
      title: form.trackTitle.trim(),
      releaseYear: form.releaseYear.trim(),
      coverArt: form.coverArt.trim(),
      audioPreview: form.audioPreview.trim(),
    },
    credits: {
      sections: creditSections.value
        .map((section) => ({
          title: section.title.trim(),
          items: section.items
            .map((item) => ({ name: item.name.trim(), role: item.role?.trim() || undefined }))
            .filter((item) => item.name),
        }))
        .filter((section) => section.title && section.items.length),
    },
    social,
    streamingLinks: { ...form.streamingLinks },
  }
}

/**
 * Persists the current form (create or update) and returns the saved record,
 * or null if validation/the request failed (message already surfaced). Used by
 * the Save buttons and by the deploy panel's auto-save before cPanel actions.
 */
async function persistLink(): Promise<NaadLinkRecord | null> {
  resetMessages()

  const slug = suggestSlug(form.slug)
  if (!slug) {
    errorMessage.value = "Enter a link slug (letters, numbers, hyphens)."
    return null
  }
  if (!form.artistName.trim() || !form.trackTitle.trim()) {
    errorMessage.value = "Artist name and song title are required."
    return null
  }

  form.slug = slug
  isSaving.value = true
  try {
    const payload = buildPayload()
    let record: NaadLinkRecord

    if (editingId.value) {
      const result = (await $fetch(`/api/admin/naadlinks/${editingId.value}`, {
        method: "PATCH",
        body: { slug, payload, subdomain: form.subdomain || null },
      })) as { link: NaadLinkRecord }
      record = result.link
    } else {
      const result = (await $fetch("/api/admin/naadlinks", {
        method: "POST",
        body: {
          slug,
          artistId: selectedArtistId.value || null,
          releaseId: selectedReleaseId.value || null,
          trackId: selectedTrackId.value || null,
          subdomain: form.subdomain || null,
          payload,
        },
      })) as { link: NaadLinkRecord }
      record = result.link
      editingId.value = record.id
    }

    await refresh()
    return record
  } catch (caught: any) {
    errorMessage.value = caught?.data?.statusMessage || caught?.message || "Unable to save this link."
    return null
  } finally {
    isSaving.value = false
  }
}

async function saveLink(options: { generate: boolean }) {
  const record = await persistLink()
  if (!record) {
    return
  }
  successMessage.value = `Saved “${record.title}”.`
  if (options.generate) {
    downloadZip(record.id)
  }
}

function downloadZip(id: string) {
  window.open(`/api/admin/naadlinks/${id}/generate`, "_blank")
}

function naadLinkArtistName(link: NaadLinkRecord) {
  return (link.artistName || link.payload.artist.name || "Unassigned artist").trim() || "Unassigned artist"
}

function naadLinkArtistFilterKey(link: NaadLinkRecord) {
  return link.artistId ? `artist:${link.artistId}` : `name:${naadLinkArtistName(link).toLowerCase()}`
}

function naadLinkUrl(link: NaadLinkRecord) {
  const subdomain = normalizeSub(link.subdomain ?? "")
  const slug = suggestSlug(link.slug)

  return subdomain && slug ? `https://${subdomain}.${NAADLINK_ROOT_DOMAIN}/${slug}` : ""
}

function naadLinkCover(link: NaadLinkRecord) {
  if (failedCoverIds.value.has(link.id)) {
    return ""
  }

  return link.payload.track.coverArt?.trim() || ""
}

function naadLinkCoverAlt(link: NaadLinkRecord) {
  return `${link.title || link.payload.track.title || "NaadLink"} cover art`
}

function markLinkCoverFailed(linkId: string) {
  failedCoverIds.value = new Set(failedCoverIds.value).add(linkId)
}

async function copyLink(link: NaadLinkRecord) {
  resetMessages()
  const url = naadLinkUrl(link)

  if (!url) {
    errorMessage.value = "Set a subdomain before copying this link."
    return
  }

  try {
    await navigator.clipboard.writeText(url)
    successMessage.value = `Copied ${url}`
  } catch {
    errorMessage.value = "Unable to copy this link."
  }
}

function startNewLink() {
  resetMessages()
  editingId.value = null
  selectedArtistId.value = ""
  selectedReleaseId.value = ""
  selectedTrackId.value = ""
  releaseOptions.value = []
  releaseSocial.value = {}
  bulkLinks.value = ""
  creditSections.value = []
  form.slug = ""
  form.subdomain = ""
  form.releaseYear = ""
  form.artistName = ""
  form.homeUrl = ""
  form.trackTitle = ""
  form.coverArt = ""
  form.audioPreview = ""
  form.social = { instagram: "", youtube: "", tiktok: "", facebook: "" }
  form.streamingLinks = emptyStreamingLinks()
  activeTab.value = "create"
}

function editLink(link: NaadLinkRecord) {
  resetMessages()
  editingId.value = link.id
  selectedArtistId.value = ""
  selectedReleaseId.value = ""
  selectedTrackId.value = ""
  releaseOptions.value = []
  bulkLinks.value = ""
  form.slug = link.slug
  form.subdomain = (link.artistId ? subdomainByArtist.value.get(link.artistId)?.subdomain : null) ?? link.subdomain ?? ""
  form.releaseYear = link.payload.track.releaseYear
  form.artistName = link.payload.artist.name
  form.homeUrl = link.payload.artist.homeUrl
  form.trackTitle = link.payload.track.title
  form.coverArt = link.payload.track.coverArt
  form.audioPreview = link.payload.track.audioPreview
  form.social = {
    instagram: link.payload.social.instagram ?? "",
    youtube: link.payload.social.youtube ?? "",
    tiktok: link.payload.social.tiktok ?? "",
    facebook: link.payload.social.facebook ?? "",
  }
  form.streamingLinks = { ...emptyStreamingLinks(), ...link.payload.streamingLinks }
  creditSections.value = link.payload.credits.sections.map((section) => ({
    title: section.title,
    items: section.items.map((item) => ({ name: item.name, role: item.role ?? "" })),
  }))
  activeTab.value = "create"
}

async function deleteLink(link: NaadLinkRecord) {
  const confirmed = await confirmAction({
    title: "Delete link page",
    description: `Delete the NaadLink “${link.title}” (/${link.slug})? Already-uploaded pages stay live on cPanel.`,
    confirmLabel: "Delete",
    variant: "destructive",
  })
  if (!confirmed) {
    return
  }

  try {
    await $fetch(`/api/admin/naadlinks/${link.id}`, { method: "DELETE" })
    if (editingId.value === link.id) {
      startNewLink()
      activeTab.value = "manage"
    }
    await refresh()
  } catch (caught: any) {
    errorMessage.value = caught?.data?.statusMessage || caught?.message || "Unable to delete this link."
  }
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
function formatDate(value: string) {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? "" : dateFormatter.format(parsed)
}
</script>

<template>
  <div class="page naadlinks-page">
    <PageHeader
      eyebrow="Catalog"
      title="NaadLinks"
      description="Build a smart-link landing page from a release, then deploy it to its naad.link subdomain in one click."
    >
      <template #actions>
        <Button @click="startNewLink">
          <Plus class="size-4" />
          Create new link
        </Button>
      </template>
    </PageHeader>

    <WorkspaceFolderGrid v-model="activeTab" :items="tabs" label="NaadLinks sections" />

    <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
    <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>

    <!-- ── Manage ── -->
    <template v-if="activeTab === 'manage'">
      <DataPanel title="Created links" eyebrow="Manage" :description="manageLinksDescription">
        <AppAlert v-if="linksError" variant="destructive">
          {{ linksError.statusMessage || "Unable to load links right now." }}
        </AppAlert>

        <DashboardSkeleton v-else-if="pending && !linksData" layout="admin-naadlinks-manage" :rows="4" />

        <AppEmptyState
          v-else-if="!pending && !links.length"
          icon="file"
          title="No link pages yet"
          description="Create your first smart link from a release."
        />

        <div v-else class="naadlinks-manage-stack">
          <div class="naadlinks-manage-toolbar">
            <div class="field-row">
              <label for="naadlinks-artist-filter">Artist</label>
              <NativeSelect id="naadlinks-artist-filter" v-model="selectedManageArtist">
                <option :value="ALL_MANAGE_ARTISTS">All artists</option>
                <option v-for="artist in manageArtistOptions" :key="artist.value" :value="artist.value">
                  {{ artist.label }} ({{ artist.count }})
                </option>
              </NativeSelect>
            </div>
          </div>

          <AppEmptyState
            v-if="!filteredLinks.length"
            icon="file"
            title="No links for this artist"
            description="Choose another artist or create a new link."
          />

          <div v-else class="naadlinks-list">
          <div v-for="link in filteredLinks" :key="link.id" class="naadlinks-row">
            <div class="naadlinks-row-art">
              <img
                v-if="naadLinkCover(link)"
                :src="naadLinkCover(link)"
                :alt="naadLinkCoverAlt(link)"
                loading="lazy"
                @error="markLinkCoverFailed(link.id)"
              >
              <Link2 v-else class="size-5" aria-hidden="true" />
            </div>
            <div class="naadlinks-row-main">
              <div class="naadlinks-row-copy">
                <strong>{{ link.title || link.slug }}</strong>
                <span>
                  {{ link.artistName || link.payload.artist.name || "Unassigned artist" }}
                </span>
                <a
                  v-if="naadLinkUrl(link)"
                  class="naadlinks-row-url"
                  :href="naadLinkUrl(link)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink class="size-3.5" />
                  <span>{{ naadLinkUrl(link) }}</span>
                </a>
                <span v-else class="naadlinks-row-url is-muted">
                  <Link2 class="size-3.5" />
                  <span>Set subdomain for live URL</span>
                </span>
              </div>
            </div>
            <Badge v-if="link.deployStatus === 'live'" variant="success" class="naadlinks-row-badge">Live</Badge>
            <Badge v-else-if="link.deployStatus === 'failed'" variant="destructive" class="naadlinks-row-badge">Failed</Badge>
            <Badge v-else-if="link.subdomain" variant="outline" class="naadlinks-row-badge">Ready</Badge>
            <span class="naadlinks-row-date">{{ formatDate(link.createdAt) }}</span>
            <div class="naadlinks-row-actions">
              <Button variant="secondary" size="sm" :disabled="!naadLinkUrl(link)" @click="copyLink(link)">
                <Copy class="size-4" />
                Copy link
              </Button>
              <Button variant="secondary" size="sm" @click="downloadZip(link.id)">
                <Download class="size-4" />
                ZIP
              </Button>
              <Button variant="ghost" size="sm" @click="editLink(link)">
                <Pencil class="size-4" />
                Edit
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Delete link" @click="deleteLink(link)">
                <Trash2 class="size-4" />
              </Button>
            </div>
          </div>
          </div>
        </div>
      </DataPanel>
    </template>

    <!-- ── Create / Edit ── -->
    <template v-else>
      <div class="nl-create">
        <div class="nl-layout">
          <div class="nl-main">
        <!-- Step 1 — release + auto-filled details -->
        <DataPanel title="Release & details" eyebrow="Step 1" description="Pick a release to auto-fill, then edit anything.">
          <div v-if="!editingId" class="nl-pickers">
            <div class="field-row">
              <label for="nl-artist">Artist</label>
              <NativeSelect id="nl-artist" v-model="selectedArtistId">
                <option disabled value="">Select artist</option>
                <option v-for="artist in artists" :key="artist.id" :value="artist.id">{{ artist.name }}</option>
              </NativeSelect>
            </div>
            <div class="field-row">
              <label for="nl-release">Release</label>
              <NativeSelect id="nl-release" v-model="selectedReleaseId" :disabled="!selectedArtistId || releasesPending">
                <option disabled value="">{{ !selectedArtistId ? "Pick an artist first" : releasesPending ? "Loading…" : "Select release" }}</option>
                <option v-for="release in releaseOptions" :key="release.id" :value="release.id">{{ release.title }}</option>
              </NativeSelect>
            </div>
            <div class="field-row" :class="{ 'is-hidden': releaseTracks.length <= 1 }">
              <label for="nl-track">Track</label>
              <NativeSelect id="nl-track" v-model="selectedTrackId" :disabled="releaseTracks.length <= 1">
                <option v-for="track in releaseTracks" :key="track.id" :value="track.id">{{ track.title }}</option>
              </NativeSelect>
            </div>
          </div>

          <div class="nl-fields">
            <div class="nl-cover-field nl-col-2">
              <div class="nl-cover-thumb">
                <img v-if="form.coverArt" :src="form.coverArt" alt="Cover preview">
                <span v-else>No cover</span>
              </div>
              <div class="field-row nl-cover-input">
                <label for="nl-cover">Cover art URL</label>
                <Input id="nl-cover" v-model="form.coverArt" placeholder="https://…" />
              </div>
            </div>

            <div class="field-row">
              <label for="nl-artistname">Artist name</label>
              <Input id="nl-artistname" v-model="form.artistName" />
            </div>
            <div class="field-row">
              <label for="nl-title">Song title</label>
              <Input id="nl-title" v-model="form.trackTitle" />
            </div>
            <div class="field-row">
              <label for="nl-year">Release year</label>
              <Input id="nl-year" v-model="form.releaseYear" />
            </div>
            <div class="field-row">
              <label for="nl-audio">Audio preview URL</label>
              <Input id="nl-audio" v-model="form.audioPreview" placeholder="https://… (30s preview)" />
            </div>
            <div class="field-row nl-col-2">
              <label for="nl-home">Artist home URL (optional)</label>
              <Input id="nl-home" v-model="form.homeUrl" placeholder="https://…" />
            </div>
          </div>
        </DataPanel>

        <!-- Step 2 — streaming links (paste → auto-detect) -->
        <DataPanel title="Streaming links" eyebrow="Step 2 · manual" description="Paste your links — platforms are detected automatically as you paste.">
          <Textarea
            v-model="bulkLinks"
            rows="3"
            class="nl-paste"
            placeholder="Paste Spotify, Apple Music, YouTube, Tidal, JioSaavn… — one per line. They sort themselves."
            @input="onBulkLinksInput"
          />
          <div class="nl-dsp-status">
            <span><strong>{{ filledDspKeys.length }}</strong> platform{{ filledDspKeys.length === 1 ? "" : "s" }} added</span>
            <span v-if="detectMessage" class="nl-dsp-detected">{{ detectMessage }}</span>
          </div>

          <div v-if="visibleDspKeys.length" class="nl-dsp-grid">
            <div v-for="key in visibleDspKeys" :key="key" class="nl-dsp-row">
              <span class="nl-dsp-label">
                <DspLogo
                  :name="STREAMING_LABELS[key]"
                  :label="STREAMING_LABELS[key]"
                  size="xs"
                  :interactive="false"
                />
                <span class="sr-only">{{ STREAMING_LABELS[key] }}</span>
              </span>
              <div class="nl-dsp-input">
                <Input v-model="form.streamingLinks[key]" placeholder="https://…" />
                <Button v-if="form.streamingLinks[key]" variant="ghost" size="icon-sm" aria-label="Clear" @click="clearDsp(key)">
                  <X class="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <p v-else class="field-note">No platforms yet — paste links above to fill them in.</p>

          <Button variant="ghost" size="sm" class="nl-dsp-toggle" @click="showAllDsp = !showAllDsp">
            {{ showAllDsp ? "Hide empty platforms" : `+ Add platform manually (${emptyDspKeys.length})` }}
          </Button>
        </DataPanel>

        <!-- Social + credits, side by side on wide screens -->
        <div class="nl-two-col">
          <DataPanel title="Social links" eyebrow="Auto-filled" description="From the artist's saved socials.">
            <div class="nl-fields">
              <div class="field-row"><label for="nl-ig">Instagram</label><Input id="nl-ig" v-model="form.social.instagram" placeholder="instagram.com/…" /></div>
              <div class="field-row"><label for="nl-yt">YouTube</label><Input id="nl-yt" v-model="form.social.youtube" placeholder="youtube.com/…" /></div>
              <div class="field-row"><label for="nl-tt">TikTok</label><Input id="nl-tt" v-model="form.social.tiktok" placeholder="tiktok.com/@…" /></div>
              <div class="field-row"><label for="nl-fb">Facebook</label><Input id="nl-fb" v-model="form.social.facebook" placeholder="facebook.com/…" /></div>
            </div>
          </DataPanel>

          <DataPanel title="Credits" eyebrow="Auto-filled" description="Grouped from the track. Edit as needed.">
            <p v-if="!creditSections.length" class="field-note">Pick a release to auto-fill, or add credits manually.</p>
            <div v-for="section in creditSections" :key="section.title" class="nl-credit-section">
              <div class="nl-credit-head">
                <strong>{{ section.title }}</strong>
                <Button variant="ghost" size="sm" @click="addCreditItem(section)"><Plus class="size-3.5" /> Add</Button>
              </div>
              <div v-for="(item, index) in section.items" :key="index" class="nl-credit-row">
                <Input v-model="item.name" placeholder="Name" />
                <Input v-model="item.role" placeholder="Role" />
                <Button variant="ghost" size="icon-sm" aria-label="Remove" @click="removeCreditItem(section, index)"><Trash2 class="size-4" /></Button>
              </div>
            </div>
          </DataPanel>
        </div>
          </div>

          <!-- Right column — page address + actions, sticky together -->
          <aside class="nl-aside">
            <div class="nl-sidebar">
              <NaadLinkDeploy
                v-model:slug="form.slug"
                v-model:subdomain="form.subdomain"
                :active="formActive"
                :verified="isVerified"
                :ftp-ok="ftpStatus?.ok ?? null"
                :ftp-configured="ftpStatus?.configured ?? true"
                :root-domain="ftpStatus?.rootDomain"
                @refresh-status="refreshFtpStatus()"
              />

              <div v-if="showDeployProgress" class="nl-deploy-progress">
                <div class="nl-dp-head">
                  <span class="nl-dp-phase">{{ deployPhase }}</span>
                  <span class="nl-dp-pct">{{ Math.round(deployProgress) }}%</span>
                </div>
                <div class="nl-dp-track">
                  <div
                    class="nl-dp-fill"
                    :class="{ 'is-done': deployProgress >= 100, 'is-fail': deployPhase === 'Failed' }"
                    :style="{ width: `${deployProgress}%` }"
                  />
                </div>
              </div>

              <div class="nl-actions">
                <Button
                  variant="secondary"
                  :disabled="!formActive || !cleanSubdomain || verifyBusy || deployBusy"
                  :class="{ 'nl-verified-btn': isVerified }"
                  @click="verifySubdomain"
                >
                  <RefreshCw v-if="verifyBusy" class="size-4 animate-spin" />
                  <BadgeCheck v-else-if="isVerified" class="size-4" />
                  <Check v-else class="size-4" />
                  {{ isVerified ? "Verified" : "Verify" }}
                </Button>
                <Button
                  :disabled="!isVerified || !cleanSlug || deployBusy || verifyBusy || ftpStatus?.ok === false"
                  :title="!isVerified ? 'Verify the subdomain first' : ''"
                  @click="deployLink"
                >
                  <RefreshCw v-if="deployBusy" class="size-4 animate-spin" />
                  <UploadCloud v-else-if="isVerified" class="size-4" />
                  <ShieldAlert v-else class="size-4" />
                  {{ deployBusy ? "Deploying…" : editingLink?.deployStatus === 'live' ? "Re-deploy" : "Deploy" }}
                </Button>

                <Button variant="secondary" :disabled="isSaving" @click="saveLink({ generate: true })">
                  <Download class="size-4" />
                  {{ isSaving ? "Saving…" : "Save & ZIP" }}
                </Button>
                <Button variant="ghost" :disabled="isSaving" @click="saveLink({ generate: false })">
                  {{ isSaving ? "Saving…" : "Save" }}
                </Button>
                <Button variant="ghost" class="nl-action-wide" @click="() => { startNewLink(); activeTab = 'manage' }">
                  Cancel
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.naadlinks-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.naadlinks-manage-stack {
  display: grid;
  gap: 12px;
}

.naadlinks-manage-toolbar {
  display: flex;
  justify-content: flex-end;
}

.naadlinks-manage-toolbar .field-row {
  width: min(100%, 280px);
}

.naadlinks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.naadlinks-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: 12px;
  background: var(--card);
}

.naadlinks-row-art {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  flex: 0 0 54px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 34%, var(--card));
  color: var(--muted-foreground);
}

.naadlinks-row-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.naadlinks-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.naadlinks-row-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.naadlinks-row-copy strong {
  font-size: 14px;
  font-weight: 620;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.naadlinks-row-copy span {
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.naadlinks-row-url {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.25;
  text-decoration: none;
}

.naadlinks-row-url:hover {
  text-decoration: underline;
}

.naadlinks-row-url span {
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.naadlinks-row-url svg {
  flex: 0 0 auto;
}

.naadlinks-row-url.is-muted {
  color: var(--muted-foreground);
  text-decoration: none;
}

.naadlinks-row-date {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--muted-foreground);
}

.naadlinks-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

@media (max-width: 760px) {
  .naadlinks-manage-toolbar {
    justify-content: stretch;
  }

  .naadlinks-manage-toolbar .field-row {
    width: 100%;
  }

  .naadlinks-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 10px;
  }

  .naadlinks-row-main {
    flex: 1 1 calc(100% - 68px);
  }

  .naadlinks-row-badge,
  .naadlinks-row-date {
    margin-left: 66px;
  }

  .naadlinks-row-actions {
    width: 100%;
    flex-wrap: wrap;
    padding-left: 66px;
  }
}

/* ── Create form ── */
.nl-create {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 1180px;
}

/* Two columns: form on the left, page-address sidebar on the right.
   Single column (sidebar first, on top) on tablets and phones.
   align-items: stretch lets the sidebar column match the form's height so the
   sticky card/actions stay pinned across the whole scroll. */
.nl-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: stretch;
}

.nl-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.nl-aside {
  min-width: 0;
  order: -1; /* on top when stacked */
}

/* Page-address card + its actions group together (sticky on desktop, below). */
.nl-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (min-width: 960px) {
  .nl-layout {
    grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
  }
  .nl-aside {
    order: 0; /* back to the right-hand column */
  }
  .nl-sidebar {
    position: sticky;
    /* Clear the fixed topbar so the card isn't cropped under it on scroll. */
    top: calc(var(--topbar-height, 64px) + 12px);
    z-index: 6;
  }
}

.nl-pickers {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.nl-pickers .is-hidden {
  display: none;
}

.nl-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.nl-col-2 {
  grid-column: 1 / -1;
}

.nl-cover-field {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.nl-cover-input {
  flex: 1;
  min-width: 0;
}

.nl-cover-thumb {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 9px;
  text-align: center;
}

.nl-cover-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.nl-two-col {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.nl-credit-section {
  margin-bottom: 14px;
}

.nl-credit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.nl-credit-head strong {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.nl-credit-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  margin-bottom: 8px;
}

/* DSP */
.nl-paste {
  width: 100%;
}

.nl-dsp-status {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin: 10px 0 12px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.nl-dsp-detected {
  color: var(--priority);
  font-weight: 600;
}

.nl-dsp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
}

.nl-dsp-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nl-dsp-label {
  display: inline-flex;
  min-height: 20px;
  align-items: center;
  color: var(--muted-foreground);
}

.nl-dsp-label :deep(.dsp-logo) {
  max-width: 132px;
}

.nl-dsp-input {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nl-dsp-input :deep(input) {
  flex: 1;
  min-width: 0;
}

.nl-dsp-toggle {
  margin-top: 12px;
}

/* Sticky action bar */
.nl-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--glass-border, var(--border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--card) 82%, transparent);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.nl-actions :deep(button) {
  width: 100%;
}

.nl-action-wide {
  grid-column: 1 / -1;
}

/* Deploy progress */
.nl-deploy-progress {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 70%, transparent);
}

.nl-dp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.nl-dp-phase {
  font-weight: 600;
  color: var(--foreground);
}

.nl-dp-pct {
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
}

.nl-dp-track {
  height: 6px;
  border-radius: 999px;
  background: var(--muted);
  overflow: hidden;
}

.nl-dp-fill {
  position: relative;
  height: 100%;
  border-radius: 999px;
  overflow: hidden;
  background: linear-gradient(90deg, var(--priority, #d4af37), color-mix(in srgb, var(--priority, #d4af37) 65%, #fff));
  transition: width 0.3s ease;
}

.nl-dp-fill::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 28%), transparent);
  animation: nl-dp-shimmer 1.2s infinite;
}

.nl-dp-fill.is-done {
  background: var(--status-success, #34d399);
}

.nl-dp-fill.is-fail {
  background: var(--destructive, #f87171);
}

.nl-dp-fill.is-done::after,
.nl-dp-fill.is-fail::after {
  display: none;
}

@keyframes nl-dp-shimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}

.nl-actions .nl-verified-btn {
  color: var(--status-success, #34d399);
  border-color: color-mix(in srgb, var(--status-success, #34d399) 40%, transparent);
}

@media (min-width: 680px) {
  .nl-pickers {
    grid-template-columns: 1fr 1fr 1fr;
  }

  .nl-fields {
    grid-template-columns: 1fr 1fr;
  }

  .nl-two-col {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}
</style>
