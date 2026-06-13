<script setup lang="ts">
import { Download, Link2, Pencil, Plus, Trash2 } from "lucide-vue-next"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/native-select"
import { detectDspLinks } from "~/utils/naadlinks-dsp"
import { groupCreditsIntoSections } from "~/utils/naadlinks-credits"
import {
  emptyStreamingLinks,
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

const { data: linksData, pending, error: linksError, refresh } = useLazyFetch<NaadLinksListResponse>("/api/admin/naadlinks")
const links = computed(() => linksData.value?.links ?? [])

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

function resetMessages() {
  errorMessage.value = ""
  successMessage.value = ""
  detectMessage.value = ""
}

function suggestSlug(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

watch(selectedArtistId, async (artistId) => {
  releaseOptions.value = []
  releaseSocial.value = {}
  selectedReleaseId.value = ""
  selectedTrackId.value = ""

  if (!artistId) {
    return
  }

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

function autoDetectDsp() {
  resetMessages()
  const { links: detectedLinks, detected } = detectDspLinks(bulkLinks.value, form.streamingLinks)
  form.streamingLinks = detectedLinks
  detectMessage.value = detected.length
    ? `Auto-filled ${detected.length} streaming link${detected.length === 1 ? "" : "s"}.`
    : "No new streaming links detected in that text."
}

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

async function saveLink(options: { generate: boolean }) {
  resetMessages()

  const slug = suggestSlug(form.slug)
  if (!slug) {
    errorMessage.value = "Enter a link slug (letters, numbers, hyphens)."
    return
  }
  if (!form.artistName.trim() || !form.trackTitle.trim()) {
    errorMessage.value = "Artist name and song title are required."
    return
  }

  form.slug = slug
  isSaving.value = true
  try {
    const payload = buildPayload()
    let record: NaadLinkRecord

    if (editingId.value) {
      const result = (await $fetch(`/api/admin/naadlinks/${editingId.value}`, {
        method: "PATCH",
        body: { slug, payload },
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
          payload,
        },
      })) as { link: NaadLinkRecord }
      record = result.link
      editingId.value = record.id
    }

    await refresh()
    successMessage.value = `Saved “${record.title}”.`

    if (options.generate) {
      downloadZip(record.id)
    }
  } catch (caught: any) {
    errorMessage.value = caught?.data?.statusMessage || caught?.message || "Unable to save this link."
  } finally {
    isSaving.value = false
  }
}

function downloadZip(id: string) {
  window.open(`/api/admin/naadlinks/${id}/generate`, "_blank")
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
      description="Build a smart-link landing page from a release, then download a ZIP to upload to cPanel."
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
      <DataPanel title="Created links" eyebrow="Manage" :description="`${links.length} link page${links.length === 1 ? '' : 's'}`">
        <AppAlert v-if="linksError" variant="destructive">
          {{ linksError.statusMessage || "Unable to load links right now." }}
        </AppAlert>

        <AppEmptyState
          v-else-if="!pending && !links.length"
          icon="file"
          title="No link pages yet"
          description="Create your first smart link from a release."
        />

        <div v-else class="naadlinks-list">
          <div v-for="link in links" :key="link.id" class="naadlinks-row">
            <div class="naadlinks-row-main">
              <Link2 class="size-4 text-muted-foreground" />
              <div class="naadlinks-row-copy">
                <strong>{{ link.title || link.slug }}</strong>
                <span>{{ link.artistName }} · <span class="font-mono">/{{ link.slug }}</span></span>
              </div>
            </div>
            <span class="naadlinks-row-date">{{ formatDate(link.createdAt) }}</span>
            <div class="naadlinks-row-actions">
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
      </DataPanel>
    </template>

    <!-- ── Create / Edit ── -->
    <template v-else>
      <div class="panel-grid">
        <DataPanel title="Release" eyebrow="Step 1" description="Pick the artist and release — details auto-fill from the catalog.">
          <div class="form-grid">
            <div v-if="!editingId" class="field-row">
              <label for="nl-artist">Artist</label>
              <NativeSelect id="nl-artist" v-model="selectedArtistId">
                <option disabled value="">Select artist</option>
                <option v-for="artist in artists" :key="artist.id" :value="artist.id">{{ artist.name }}</option>
              </NativeSelect>
            </div>

            <div v-if="!editingId && selectedArtistId" class="field-row">
              <label for="nl-release">Release</label>
              <NativeSelect id="nl-release" v-model="selectedReleaseId" :disabled="releasesPending">
                <option disabled value="">{{ releasesPending ? "Loading releases…" : "Select release" }}</option>
                <option v-for="release in releaseOptions" :key="release.id" :value="release.id">{{ release.title }}</option>
              </NativeSelect>
            </div>

            <div v-if="!editingId && releaseTracks.length > 1" class="field-row">
              <label for="nl-track">Track</label>
              <NativeSelect id="nl-track" v-model="selectedTrackId">
                <option v-for="track in releaseTracks" :key="track.id" :value="track.id">{{ track.title }}</option>
              </NativeSelect>
            </div>

            <p v-if="editingId" class="field-note">Editing an existing link. Re-pick an artist above only if you want to re-pull details.</p>
          </div>
        </DataPanel>

        <DataPanel title="Page details" eyebrow="Step 2" description="Auto-filled from the release. Edit anything before generating.">
          <div class="form-grid">
            <div class="field-row">
              <label for="nl-slug">Link slug (basepath)</label>
              <Input id="nl-slug" v-model="form.slug" placeholder="song-title" />
              <p class="field-note">The page deploys at <span class="font-mono">/{{ suggestSlug(form.slug) || "song-title" }}</span> and the ZIP is named the same.</p>
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
              <label for="nl-cover">Cover art URL</label>
              <Input id="nl-cover" v-model="form.coverArt" placeholder="https://…" />
            </div>
            <div v-if="form.coverArt" class="naadlinks-cover-preview">
              <img :src="form.coverArt" alt="Cover preview" />
            </div>
            <div class="field-row">
              <label for="nl-audio">Audio preview URL</label>
              <Input id="nl-audio" v-model="form.audioPreview" placeholder="https://… (30s preview)" />
            </div>
            <div class="field-row">
              <label for="nl-home">Artist home URL (optional)</label>
              <Input id="nl-home" v-model="form.homeUrl" placeholder="https://…" />
            </div>
          </div>
        </DataPanel>

        <DataPanel title="Social links" eyebrow="Auto-filled" description="Pulled from the artist's saved socials.">
          <div class="form-grid form-grid-2">
            <div class="field-row">
              <label for="nl-ig">Instagram</label>
              <Input id="nl-ig" v-model="form.social.instagram" placeholder="https://instagram.com/…" />
            </div>
            <div class="field-row">
              <label for="nl-yt">YouTube</label>
              <Input id="nl-yt" v-model="form.social.youtube" placeholder="https://youtube.com/…" />
            </div>
            <div class="field-row">
              <label for="nl-tt">TikTok</label>
              <Input id="nl-tt" v-model="form.social.tiktok" placeholder="https://tiktok.com/@…" />
            </div>
            <div class="field-row">
              <label for="nl-fb">Facebook</label>
              <Input id="nl-fb" v-model="form.social.facebook" placeholder="https://facebook.com/…" />
            </div>
          </div>
        </DataPanel>

        <DataPanel title="Credits" eyebrow="Auto-filled" description="Grouped from the track's credits. Edit names and roles as needed.">
          <div v-if="!creditSections.length" class="field-note">No credits yet — pick a release to auto-fill, or add them manually.</div>
          <div v-for="section in creditSections" :key="section.title" class="naadlinks-credit-section">
            <div class="naadlinks-credit-head">
              <strong>{{ section.title }}</strong>
              <Button variant="ghost" size="sm" @click="addCreditItem(section)">
                <Plus class="size-3.5" /> Add
              </Button>
            </div>
            <div v-for="(item, index) in section.items" :key="index" class="naadlinks-credit-row">
              <Input v-model="item.name" placeholder="Name" />
              <Input v-model="item.role" placeholder="Role" />
              <Button variant="ghost" size="icon-sm" aria-label="Remove credit" @click="removeCreditItem(section, index)">
                <Trash2 class="size-4" />
              </Button>
            </div>
          </div>
        </DataPanel>

        <DataPanel title="Streaming links (DSP)" eyebrow="Step 3 · manual" description="Paste a chunk of links and auto-detect, or fill fields directly.">
          <div class="form-grid">
            <div class="field-row">
              <label for="nl-bulk">Paste links</label>
              <Textarea id="nl-bulk" v-model="bulkLinks" rows="5" placeholder="Paste Spotify, Apple Music, YouTube, Tidal, JioSaavn… links — one per line." />
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="secondary" @click="autoDetectDsp">Auto-detect platforms</Button>
                <span v-if="detectMessage" class="field-note">{{ detectMessage }}</span>
              </div>
            </div>

            <div class="form-grid-2">
              <div v-for="key in NAADLINK_STREAMING_KEYS" :key="key" class="field-row">
                <label :for="`nl-dsp-${key}`">{{ STREAMING_LABELS[key] }}</label>
                <Input :id="`nl-dsp-${key}`" v-model="form.streamingLinks[key]" placeholder="https://…" />
              </div>
            </div>
          </div>
        </DataPanel>

        <div class="naadlinks-actions">
          <Button :disabled="isSaving" @click="saveLink({ generate: true })">
            <Download class="size-4" />
            {{ isSaving ? "Saving…" : "Save & download ZIP" }}
          </Button>
          <Button variant="secondary" :disabled="isSaving" @click="saveLink({ generate: false })">
            {{ isSaving ? "Saving…" : "Save" }}
          </Button>
          <Button variant="ghost" @click="() => { startNewLink(); activeTab = 'manage' }">Cancel</Button>
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

.naadlinks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.naadlinks-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: 12px;
  background: var(--card);
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

.form-grid-2 {
  display: grid;
  gap: 14px;
}

@media (min-width: 720px) {
  .form-grid-2 {
    grid-template-columns: 1fr 1fr;
  }
}

.naadlinks-cover-preview img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--surface-border, var(--border));
}

.naadlinks-credit-section {
  margin-bottom: 16px;
}

.naadlinks-credit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.naadlinks-credit-head strong {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.naadlinks-credit-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  margin-bottom: 8px;
}

.naadlinks-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 4px;
}
</style>
