<script setup lang="ts">
import type {
  ArtistReleaseItem,
  ArtistReleasesResponse,
  ArtistReleaseTrack,
} from "~~/types/dashboard"
import type { ReleaseStatus, ReleaseType, TrackStatus } from "~~/types/catalog"
import { RELEASE_GENRE_OPTIONS, TRACK_CREDIT_ROLE_GROUPS } from "~~/types/catalog"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

interface CreditDraft {
  creditedName: string
  roleCodes: string[]
}

interface EditableTrackDraft {
  id?: string
  title: string
  isrc: string
  trackNumber: string
  audioPreviewUrl: string
  status: TrackStatus
  credits: CreditDraft[]
}

interface EditableReleaseDraft {
  title: string
  type: ReleaseType
  genre: string
  upc: string
  coverArtUrl: string
  streamingLink: string
  releaseDate: string
  status: ReleaseStatus
  tracks: EditableTrackDraft[]
  takedownReason: string
  proofUrlsText: string
}

const TRACK_CREDIT_ROLE_OPTIONS = TRACK_CREDIT_ROLE_GROUPS.flatMap((group) => [...group.roles]) as string[]

function normalizeCreditRoleCodes(roleCodes: string[]) {
  return [...new Set(roleCodes.filter(Boolean))].sort((left, right) => {
    const leftIndex = TRACK_CREDIT_ROLE_OPTIONS.indexOf(left)
    const rightIndex = TRACK_CREDIT_ROLE_OPTIONS.indexOf(right)

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right)
    }

    if (leftIndex === -1) {
      return 1
    }

    if (rightIndex === -1) {
      return -1
    }

    return leftIndex - rightIndex
  })
}

function blankCreditDraft(roleCodes: string[] = ["Main Artist"]): CreditDraft {
  return {
    creditedName: "",
    roleCodes: normalizeCreditRoleCodes(roleCodes),
  }
}

function groupCreditDrafts(credits: Array<{ creditedName: string; roleCode: string }>) {
  const drafts = new Map<string, CreditDraft>()

  for (const credit of credits) {
    const normalizedName = credit.creditedName.trim()
    const key = normalizedName.toLowerCase()
    const existing = drafts.get(key)

    if (existing) {
      existing.roleCodes = normalizeCreditRoleCodes([...existing.roleCodes, credit.roleCode])
      continue
    }

    drafts.set(key, {
      creditedName: normalizedName,
      roleCodes: normalizeCreditRoleCodes([credit.roleCode]),
    })
  }

  return [...drafts.values()]
}

function buildCreditInputs(credits: CreditDraft[], label: string) {
  return credits.flatMap((credit, creditIndex) => {
    const creditedName = credit.creditedName.trim()

    if (!creditedName) {
      throw new Error(`${label} credit ${creditIndex + 1} needs a credited name.`)
    }

    const roleCodes = normalizeCreditRoleCodes(credit.roleCodes)

    if (!roleCodes.length) {
      throw new Error(`${label} credit ${creditIndex + 1} needs at least one role.`)
    }

    return roleCodes.map((roleCode, roleIndex) => ({
      creditedName,
      roleCode,
      sortOrder: creditIndex * 100 + roleIndex,
    }))
  })
}

function toEditableTrack(track: ArtistReleaseTrack): EditableTrackDraft {
  return {
    id: track.id,
    title: track.title,
    isrc: track.isrc,
    trackNumber: track.trackNumber === null ? "" : String(track.trackNumber),
    audioPreviewUrl: track.audioPreviewUrl ?? "",
    status: track.status,
    credits: track.credits.length
      ? groupCreditDrafts(track.credits)
      : [blankCreditDraft()],
  }
}

function toEditableRelease(release: ArtistReleaseItem): EditableReleaseDraft {
  return {
    title: release.title,
    type: release.type,
    genre: release.genre,
    upc: release.upc ?? "",
    coverArtUrl: release.coverArtUrl ?? "",
    streamingLink: release.streamingLink ?? "",
    releaseDate: release.releaseDate ?? "",
    status: release.status,
    tracks: release.tracks.map(toEditableTrack),
    takedownReason: "",
    proofUrlsText: "",
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "Release date not set"
  }

  const date = new Date(`${value}T00:00:00Z`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return null
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ")
}

function statusClass(status: ReleaseStatus | TrackStatus) {
  if (status === "live") {
    return "status-completed"
  }

  if (status === "taken_down") {
    return "status-processing"
  }

  if (status === "deleted") {
    return "status-abandoned"
  }

  return "status-processing"
}

function toNullableText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

const { activeArtistId } = useActiveArtist()
const pageError = ref("")
const pageSuccess = ref("")
const submittingDraftRequest = reactive<Record<string, boolean>>({})
const submittingTakedownRequest = reactive<Record<string, boolean>>({})
const releaseDrafts = reactive<Record<string, EditableReleaseDraft>>({})

const { data, pending, error, refresh } = useLazyFetch<ArtistReleasesResponse>("/api/dashboard/releases", {
  query: computed(() => (activeArtistId.value ? { artistId: activeArtistId.value } : undefined)),
})

const releases = computed(() => data.value?.releases ?? [])

watch(
  releases,
  (items) => {
    for (const release of items) {
      if (release.viewerRelation === "owner") {
        releaseDrafts[release.id] = toEditableRelease(release)
      }
    }
  },
  { immediate: true },
)

function resetMessages() {
  pageError.value = ""
  pageSuccess.value = ""
}

function setSuccess(message: string) {
  pageSuccess.value = message
  pageError.value = ""
}

function setError(fetchError: any, fallback: string) {
  pageError.value = fetchError?.data?.statusMessage || fetchError?.message || fallback
  pageSuccess.value = ""
}

function addDraftTrack(releaseId: string) {
  ;(releaseDrafts[releaseId]?.tracks ?? []).push({
    title: "",
    isrc: "",
    trackNumber: "",
    audioPreviewUrl: "",
    status: "draft",
    credits: [blankCreditDraft()],
  })
}

function removeDraftTrack(releaseId: string, trackIndex: number) {
  const tracks = releaseDrafts[releaseId]?.tracks ?? []

  if (tracks.length <= 1) {
    releaseDrafts[releaseId].tracks = [
      {
        title: "",
        isrc: "",
        trackNumber: "",
        audioPreviewUrl: "",
        status: "draft",
        credits: [blankCreditDraft()],
      },
    ]
    return
  }

  tracks.splice(trackIndex, 1)
}

function addDraftCredit(releaseId: string, trackIndex: number) {
  releaseDrafts[releaseId]?.tracks[trackIndex]?.credits.push(
    blankCreditDraft(),
  )
}

function removeDraftCredit(releaseId: string, trackIndex: number, creditIndex: number) {
  const credits = releaseDrafts[releaseId]?.tracks[trackIndex]?.credits ?? []

  if (credits.length <= 1) {
    releaseDrafts[releaseId].tracks[trackIndex].credits = [blankCreditDraft()]
    return
  }

  credits.splice(creditIndex, 1)
}

async function submitDraftEditRequest(release: ArtistReleaseItem) {
  submittingDraftRequest[release.id] = true
  resetMessages()

  try {
    const draft = releaseDrafts[release.id]

    await $fetch("/api/dashboard/releases/requests", {
      method: "POST",
      body: {
        releaseId: release.id,
        requestType: "draft_edit",
        snapshot: {
          release: {
            title: draft.title,
            type: draft.type,
            upc: toNullableText(draft.upc),
            coverArtUrl: toNullableText(draft.coverArtUrl),
            streamingLink: toNullableText(draft.streamingLink),
            releaseDate: toNullableText(draft.releaseDate),
            status: draft.status,
          },
          tracks: draft.tracks.map((track) => ({
            id: track.id,
            title: track.title,
            isrc: track.isrc,
            trackNumber: toNullableText(track.trackNumber),
            audioPreviewUrl: toNullableText(track.audioPreviewUrl),
            status: track.status,
            credits: buildCreditInputs(track.credits, track.title || "Track"),
          })),
          credits: draft.tracks.flatMap((track, trackIndex) =>
            buildCreditInputs(track.credits, track.title || `Track ${trackIndex + 1}`).map((credit) => ({
              trackIndex,
              ...credit,
            })),
          ),
          genre: draft.genre,
        },
      },
    })

    await refresh()
    setSuccess("Draft edit request submitted for admin approval.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to submit the draft edit request.")
  } finally {
    submittingDraftRequest[release.id] = false
  }
}

async function submitTakedownRequest(release: ArtistReleaseItem) {
  submittingTakedownRequest[release.id] = true
  resetMessages()

  try {
    const draft = releaseDrafts[release.id]

    await $fetch("/api/dashboard/releases/requests", {
      method: "POST",
      body: {
        releaseId: release.id,
        requestType: "takedown",
        takedownReason: draft.takedownReason,
        proofUrls: draft.proofUrlsText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      },
    })

    await refresh()
    setSuccess("Takedown request submitted for admin review.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to submit the takedown request.")
  } finally {
    submittingTakedownRequest[release.id] = false
  }
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Releases"
      eyebrow="Artist catalog"
      description="Draft releases stay editable through approval requests, taken down releases remain visible with their status, and each track now shows separate credits alongside your own split history."
    >
      <div class="form-grid">
        <div v-if="pageError" class="banner error">{{ pageError }}</div>
        <div v-if="pageSuccess" class="banner">{{ pageSuccess }}</div>
        <div v-if="error" class="banner error">{{ error.statusMessage || "Unable to load your releases right now." }}</div>
      </div>

      <div v-if="pending && !data" class="status-message">Loading your catalog...</div>

      <template v-else>
        <div class="metrics">
          <MetricCard label="Visible releases" :value="String(data?.releaseCount ?? 0)" tone="accent" />
          <MetricCard label="Visible tracks" :value="String(data?.trackCount ?? 0)" />
          <MetricCard label="Owned releases" :value="String(data?.ownerReleaseCount ?? 0)" />
          <MetricCard label="Collaborations" :value="String(data?.collaboratorReleaseCount ?? 0)" tone="alt" />
        </div>

        <div v-if="!releases.length" class="muted-copy">
          No releases are visible on this artist account yet.
        </div>

        <div v-else class="catalog-list">
          <article v-for="release in releases" :key="release.id" class="catalog-item release-card">
            <div class="release-hero">
              <div class="release-art-frame" @contextmenu.prevent>
                <img
                  v-if="release.coverArtUrl"
                  :src="release.coverArtUrl"
                  :alt="`${release.title} cover art`"
                  class="release-art-image"
                  draggable="false"
                  @dragstart.prevent
                />
                <div v-else class="release-art-placeholder">
                  <span class="eyebrow">{{ release.type }}</span>
                  <strong>{{ release.title.slice(0, 1).toUpperCase() }}</strong>
                </div>
              </div>

              <div class="stack-lg">
                <div class="catalog-header">
                  <div class="summary-copy">
                    <strong>{{ release.title }}</strong>
                    <span class="detail-copy">{{ release.type.toUpperCase() }} / {{ release.genre }} / {{ formatDate(release.releaseDate) }}</span>
                  </div>

                  <div class="badge-row">
                    <span class="status-pill" :class="statusClass(release.status)">
                      {{ formatStatusLabel(release.status) }}
                    </span>
                    <span class="status-pill" :class="release.viewerRelation === 'owner' ? 'status-completed' : 'status-processing'">
                      {{ release.viewerRelation === "owner" ? "Owned" : "Collaboration" }}
                    </span>
                  </div>
                </div>

                <div class="catalog-grid catalog-grid-wide">
                  <div class="field-row">
                    <label>Primary artist</label>
                    <div class="detail-copy">{{ release.artistName }}</div>
                  </div>

                  <div class="field-row">
                    <label>Your access</label>
                    <div class="detail-copy">{{ release.viewerRoles.join(", ") }}</div>
                  </div>

                  <div class="field-row">
                    <label>UPC</label>
                    <div class="detail-copy mono">{{ release.upc || "Not set" }}</div>
                  </div>

                  <div class="field-row">
                    <label>Streaming link</label>
                    <CopyableLink :url="release.streamingLink" />
                  </div>
                </div>
              </div>
            </div>

            <div v-if="release.takedownReason" class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Takedown reason</span>
                <strong>{{ release.takedownReason }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Proof links</span>
                <strong>{{ release.takedownProofUrls.length || 0 }}</strong>
              </div>
            </div>

            <div v-if="release.pendingRequest" class="catalog-subitem catalog-subitem-muted">
              <div class="summary-copy">
                <strong>Open request</strong>
                <span class="detail-copy">
                  {{ release.pendingRequest.requestType === "draft_edit" ? "Draft edit" : "Takedown" }}
                  /
                  {{ formatStatusLabel(release.pendingRequest.status) }}
                  /
                  {{ formatDateTime(release.pendingRequest.createdAt) }}
                </span>
                <span v-if="release.pendingRequest.adminNotes" class="detail-copy">
                  {{ release.pendingRequest.adminNotes }}
                </span>
              </div>
            </div>

            <div v-if="release.releaseCollaborators.length" class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Release contributors</strong>
                  <span class="detail-copy">Contributor names and roles are visible, while split history only shows your own share changes.</span>
                </div>
              </div>

              <div class="catalog-subitems">
                <div
                  v-for="collaborator in release.releaseCollaborators"
                  :key="`${release.id}-${collaborator.artistId}-${collaborator.role}`"
                  class="catalog-subitem catalog-subitem-compact"
                >
                  <div class="summary-copy">
                    <strong>{{ collaborator.name }}</strong>
                    <span class="detail-copy">{{ collaborator.role }}</span>
                  </div>
                  <span v-if="collaborator.visibleSplitPct" class="pill">{{ collaborator.visibleSplitPct }}%</span>
                </div>
              </div>

              <div v-if="release.viewerSplitHistory.length" class="catalog-subitems">
                <div v-for="history in release.viewerSplitHistory" :key="`${release.id}-${history.scope}-${history.role}-${history.changedAt}`" class="catalog-subitem catalog-subitem-compact">
                  <div class="summary-copy">
                    <strong>Your release split</strong>
                    <span class="detail-copy">{{ history.role }} / {{ history.splitPct }}% / effective {{ history.effectivePeriodMonth }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Tracks</strong>
                  <span class="detail-copy">Track-level split maps win. Credits stay separate and render below each track.</span>
                </div>
              </div>

              <div v-if="release.tracks.length" class="catalog-subitems">
                <div v-for="track in release.tracks" :key="track.id" class="catalog-subitem track-card">
                  <div class="catalog-header">
                    <div class="summary-copy">
                      <strong>{{ track.trackNumber ? `${track.trackNumber}. ` : "" }}{{ track.title }}</strong>
                      <span class="detail-copy mono">{{ track.isrc }}</span>
                      <span v-if="formatDuration(track.durationSeconds)" class="detail-copy">{{ formatDuration(track.durationSeconds) }}</span>
                    </div>

                    <div class="badge-row">
                      <span class="status-pill" :class="statusClass(track.status)">{{ formatStatusLabel(track.status) }}</span>
                      <span v-if="track.collaborationSource === 'track'" class="pill pill-muted">Track split map</span>
                      <span v-else-if="track.collaborationSource === 'release'" class="pill pill-muted">Release fallback</span>
                    </div>
                  </div>

                  <audio
                    v-if="track.audioPreviewUrl"
                    class="audio-preview"
                    controls
                    controlslist="nodownload noplaybackrate"
                    disablepictureinpicture
                    preload="none"
                    @contextmenu.prevent
                  >
                    <source :src="track.audioPreviewUrl" />
                  </audio>

                  <p v-else class="muted-copy">No audio preview is attached to this track yet.</p>

                  <div v-if="track.collaborators.length" class="catalog-track-list">
                    <div class="summary-copy">
                      <strong>Contributors</strong>
                      <span class="detail-copy">
                        {{ track.collaborationSource === "release" ? "Using the release-level split map for this track." : "Showing the track-specific split map." }}
                      </span>
                    </div>

                    <div class="catalog-subitems">
                      <div
                        v-for="collaborator in track.collaborators"
                        :key="`${track.id}-${collaborator.artistId}-${collaborator.role}`"
                        class="catalog-subitem catalog-subitem-compact"
                      >
                        <div class="summary-copy">
                          <strong>{{ collaborator.name }}</strong>
                          <span class="detail-copy">{{ collaborator.role }}</span>
                        </div>
                        <span v-if="collaborator.visibleSplitPct" class="pill">{{ collaborator.visibleSplitPct }}%</span>
                      </div>
                    </div>

                    <div v-if="track.viewerSplitHistory.length" class="catalog-subitems">
                      <div v-for="history in track.viewerSplitHistory" :key="`${track.id}-${history.role}-${history.changedAt}`" class="catalog-subitem catalog-subitem-compact">
                        <div class="summary-copy">
                          <strong>Your track split</strong>
                          <span class="detail-copy">{{ history.role }} / {{ history.splitPct }}% / effective {{ history.effectivePeriodMonth }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="catalog-track-list">
                    <div class="summary-copy">
                      <strong>Credits</strong>
                    </div>

                    <div v-if="track.credits.length" class="catalog-subitems">
                      <div
                        v-for="credit in groupCreditDrafts(track.credits)"
                        :key="`${track.id}-${credit.creditedName}-${credit.roleCodes.join('-')}`"
                        class="catalog-subitem catalog-subitem-compact"
                      >
                        <div class="summary-copy">
                          <strong>{{ credit.creditedName }}</strong>
                          <span class="detail-copy">{{ credit.roleCodes.join(", ") }}</span>
                        </div>
                      </div>
                    </div>

                    <p v-else class="muted-copy">No credits are listed for this track yet.</p>
                  </div>
                </div>
              </div>

              <p v-else class="muted-copy">No visible tracks are attached to this release yet.</p>
            </div>

            <div class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Timeline</strong>
                  <span class="detail-copy">Append-only release events across edits, split versions, requests, and takedowns.</span>
                </div>
              </div>

              <div v-if="release.events.length" class="catalog-subitems">
                <div v-for="entry in release.events" :key="entry.id" class="catalog-subitem catalog-subitem-compact">
                  <div class="summary-copy">
                    <strong>{{ entry.summary }}</strong>
                    <span class="detail-copy">{{ entry.actorName || entry.actorRole }} / {{ formatDateTime(entry.createdAt) }}</span>
                  </div>
                </div>
              </div>

              <p v-else class="muted-copy">No release events are visible yet.</p>
            </div>

            <div
              v-if="release.viewerRelation === 'owner' && release.status === 'draft' && release.canSubmitDraftEdit && releaseDrafts[release.id]"
              class="catalog-track-list"
            >
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Edit draft for approval</strong>
                  <span class="detail-copy">Your draft changes stay pending until an admin approves them.</span>
                </div>
              </div>

              <div class="catalog-grid catalog-grid-wide">
                <div class="field-row">
                  <label :for="`draft-title-${release.id}`">Title</label>
                  <input :id="`draft-title-${release.id}`" v-model="releaseDrafts[release.id].title" class="input" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`draft-type-${release.id}`">Type</label>
                  <select :id="`draft-type-${release.id}`" v-model="releaseDrafts[release.id].type" class="input">
                    <option value="single">Single</option>
                    <option value="ep">EP</option>
                    <option value="album">Album</option>
                  </select>
                </div>

                <div class="field-row">
                  <label :for="`draft-genre-${release.id}`">Genre</label>
                  <select :id="`draft-genre-${release.id}`" v-model="releaseDrafts[release.id].genre" class="input">
                    <option v-for="genre in RELEASE_GENRE_OPTIONS" :key="genre" :value="genre">{{ genre }}</option>
                  </select>
                </div>

                <div class="field-row">
                  <label :for="`draft-upc-${release.id}`">UPC</label>
                  <input :id="`draft-upc-${release.id}`" v-model="releaseDrafts[release.id].upc" class="input mono" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`draft-date-${release.id}`">Release date</label>
                  <input :id="`draft-date-${release.id}`" v-model="releaseDrafts[release.id].releaseDate" class="input" type="date" />
                </div>

                <div class="field-row">
                  <label :for="`draft-cover-${release.id}`">Cover art URL</label>
                  <input :id="`draft-cover-${release.id}`" v-model="releaseDrafts[release.id].coverArtUrl" class="input" type="url" />
                </div>

                <div class="field-row field-row-full">
                  <label :for="`draft-link-${release.id}`">Streaming link</label>
                  <input :id="`draft-link-${release.id}`" v-model="releaseDrafts[release.id].streamingLink" class="input" type="url" />
                </div>
              </div>

              <div class="catalog-subitems">
                <article v-for="(track, trackIndex) in releaseDrafts[release.id].tracks" :key="`draft-track-${release.id}-${trackIndex}`" class="catalog-subitem">
                  <div class="catalog-grid catalog-grid-wide">
                    <div class="field-row">
                      <label :for="`draft-track-title-${release.id}-${trackIndex}`">Track title</label>
                      <input :id="`draft-track-title-${release.id}-${trackIndex}`" v-model="track.title" class="input" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`draft-track-isrc-${release.id}-${trackIndex}`">ISRC</label>
                      <input :id="`draft-track-isrc-${release.id}-${trackIndex}`" v-model="track.isrc" class="input mono" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`draft-track-number-${release.id}-${trackIndex}`">Track no.</label>
                      <input :id="`draft-track-number-${release.id}-${trackIndex}`" v-model="track.trackNumber" class="input" type="number" min="1" />
                    </div>

                    <div class="field-row">
                      <label :for="`draft-track-audio-${release.id}-${trackIndex}`">Audio preview URL</label>
                      <input :id="`draft-track-audio-${release.id}-${trackIndex}`" v-model="track.audioPreviewUrl" class="input" type="url" />
                    </div>
                  </div>

                  <div class="catalog-subitems">
                    <div v-for="(credit, creditIndex) in track.credits" :key="`draft-credit-${release.id}-${trackIndex}-${creditIndex}`" class="catalog-subitem catalog-subitem-compact">
                      <div class="catalog-grid catalog-grid-wide">
                        <div class="field-row">
                          <label :for="`draft-credit-name-${release.id}-${trackIndex}-${creditIndex}`">Credited name</label>
                          <input :id="`draft-credit-name-${release.id}-${trackIndex}-${creditIndex}`" v-model="credit.creditedName" class="input" type="text" />
                        </div>

                        <div class="field-row field-row-full">
                          <label>Roles</label>
                          <div class="role-checkbox-groups">
                            <div v-for="group in TRACK_CREDIT_ROLE_GROUPS" :key="`${group.group}-${release.id}-${trackIndex}-${creditIndex}`" class="role-checkbox-group">
                              <strong>{{ group.group }}</strong>
                              <div class="role-checkbox-list">
                                <label
                                  v-for="role in group.roles"
                                  :key="`draft-credit-role-${release.id}-${trackIndex}-${creditIndex}-${role}`"
                                  class="role-checkbox"
                                >
                                  <input
                                    :id="`draft-credit-role-${release.id}-${trackIndex}-${creditIndex}-${role}`"
                                    v-model="credit.roleCodes"
                                    type="checkbox"
                                    :value="role"
                                  />
                                  <span>{{ role }}</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="button-row">
                        <button class="button button-secondary button-danger" @click="removeDraftCredit(release.id, trackIndex, creditIndex)">
                          Remove credit
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="button-row">
                    <button class="button button-secondary" @click="addDraftCredit(release.id, trackIndex)">Add credit</button>
                    <button class="button button-secondary button-danger" @click="removeDraftTrack(release.id, trackIndex)">Remove track</button>
                  </div>
                </article>
              </div>

              <div class="button-row">
                <button class="button button-secondary" @click="addDraftTrack(release.id)">Add track</button>
                <button class="button" :disabled="submittingDraftRequest[release.id]" @click="submitDraftEditRequest(release)">
                  {{ submittingDraftRequest[release.id] ? "Submitting..." : "Submit draft edit request" }}
                </button>
              </div>
            </div>

            <div
              v-if="release.viewerRelation === 'owner' && release.status === 'live' && !release.pendingRequest && releaseDrafts[release.id]"
              class="catalog-track-list"
            >
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Request takedown</strong>
                  <span class="detail-copy">Takedowns preserve earnings history while changing the release status from live to taken down after admin approval.</span>
                </div>
              </div>

              <div class="field-row">
                <label :for="`takedown-reason-${release.id}`">Reason</label>
                <textarea :id="`takedown-reason-${release.id}`" v-model="releaseDrafts[release.id].takedownReason" class="input" rows="3" />
              </div>

              <div class="field-row">
                <label :for="`takedown-proof-${release.id}`">Proof links (one per line)</label>
                <textarea :id="`takedown-proof-${release.id}`" v-model="releaseDrafts[release.id].proofUrlsText" class="input" rows="3" />
              </div>

              <div class="button-row">
                <button class="button button-secondary" :disabled="submittingTakedownRequest[release.id]" @click="submitTakedownRequest(release)">
                  {{ submittingTakedownRequest[release.id] ? "Submitting..." : "Submit takedown request" }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </template>
    </SectionCard>
  </div>
</template>

<style scoped>
.role-checkbox-groups {
  display: grid;
  gap: 0.75rem;
}

.role-checkbox-group {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.75rem;
}

.role-checkbox-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.5rem 0.75rem;
}

.role-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
}
</style>
