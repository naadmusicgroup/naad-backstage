<script setup lang="ts">
import type { ArtistReleasesResponse } from "~~/types/dashboard"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const { activeArtistId } = useActiveArtist()

const { data, pending, error, refresh } = useLazyFetch<ArtistReleasesResponse>("/api/dashboard/releases", {
  query: computed(() => (activeArtistId.value ? { artistId: activeArtistId.value } : undefined)),
})

const releases = computed(() => data.value?.releases ?? [])

function formatDate(value: string | null) {
  if (!value) {
    return "Release date not set"
  }

  return dateFormatter.format(new Date(`${value}T00:00:00Z`))
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return null
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Releases"
      eyebrow="Artist catalog"
      description="Your release page now reads directly from the live catalog, shows streaming media, and only reveals your own split percentage when collaboration tags exist."
    >
      <div v-if="error" class="form-grid">
        <div class="banner error">{{ error.statusMessage || "Unable to load your releases right now." }}</div>
        <div class="button-row">
          <button class="button button-secondary" @click="() => refresh()">Retry</button>
        </div>
      </div>

      <div v-else-if="pending && !data" class="status-message">Loading your catalog...</div>

      <template v-else>
        <div class="metrics">
          <MetricCard label="Active releases" :value="String(data?.releaseCount ?? 0)" tone="accent" />
          <MetricCard label="Active tracks" :value="String(data?.trackCount ?? 0)" />
          <MetricCard label="Owned releases" :value="String(data?.ownerReleaseCount ?? 0)" />
          <MetricCard label="Collaborations" :value="String(data?.collaboratorReleaseCount ?? 0)" tone="alt" />
        </div>

        <div v-if="!releases.length" class="muted-copy">
          No active releases are visible on this artist account yet. Once releases and tracks are added in admin, they will appear here immediately.
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
                    <span class="detail-copy">
                      {{ release.type.toUpperCase() }} / {{ formatDate(release.releaseDate) }}
                    </span>
                  </div>

                  <div class="badge-row">
                    <span class="status-pill" :class="release.viewerRelation === 'owner' ? 'status-completed' : 'status-processing'">
                      {{ release.viewerRelation === "owner" ? "Owned" : "Collaboration" }}
                    </span>
                    <span class="pill pill-muted">{{ release.tracks.length }} track{{ release.tracks.length === 1 ? "" : "s" }}</span>
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
                    <a
                      v-if="release.streamingLink"
                      :href="release.streamingLink"
                      class="button button-secondary"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open streaming link
                    </a>
                    <div v-else class="detail-copy">Not set</div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="release.releaseCollaborators.length" class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Release collaborators</strong>
                  <span class="detail-copy">Contributor names and roles are visible to all collaborators, but only your own split percentage is shown.</span>
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
            </div>

            <div class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Tracks</strong>
                  <span class="detail-copy">Audio previews stream in place. Track-level collaborator maps win, and release-level tags are only used as fallback.</span>
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
                        {{ track.collaborationSource === "release" ? "Using release-level collaborator tags for this track." : "Showing the track-level collaborator map." }}
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
                  </div>
                </div>
              </div>

              <p v-else class="muted-copy">No active tracks are attached to this release yet.</p>
            </div>
          </article>
        </div>
      </template>
    </SectionCard>
  </div>
</template>
