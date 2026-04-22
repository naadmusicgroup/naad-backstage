<script setup lang="ts">
import type {
  AdminActivityLogRecord,
  AdminArtistActionResponse,
  AdminChannelRegistryRecord,
  AdminSettingsResponse,
  ArtistAccessMethod,
  AdminStatementPeriodRecord,
  OrphanedArtistRecord,
} from "~~/types/settings"
import {
  emptyArtistCreateDraft,
  nullableText,
  type ArtistCreateDraft,
} from "~/utils/admin-access"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

interface ChannelDraft {
  displayName: string
  iconUrl: string
  color: string
}

type OrphanedArtistRestoreDraft = ArtistCreateDraft

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

const statementStatusFilter = ref<"all" | "open" | "closed">("all")
const statementSearch = ref("")
const activityAdminFilter = ref("all")
const activityEntityFilter = ref("all")
const activitySearch = ref("")
const archiveSearch = ref("")
const successMessage = ref("")
const errorMessage = ref("")
const savingStatementPeriodId = ref("")
const restoringArtistId = ref("")
const savingChannelId = ref("")
const channelDrafts = reactive<Record<string, ChannelDraft>>({})
const orphanRestoreDrafts = reactive<Record<string, OrphanedArtistRestoreDraft>>({})

const { data, error, pending, refresh } = useLazyFetch<AdminSettingsResponse>("/api/admin/settings")

const summary = computed(() => data.value?.summary ?? {
  openStatementCount: 0,
  closedStatementCount: 0,
  orphanedArtistCount: 0,
  archivedReleaseCount: 0,
  archivedTrackCount: 0,
  activityLogCount: 0,
  channelCount: 0,
})

const statementPeriods = computed(() => data.value?.statementPeriods ?? [])
const activityLog = computed(() => data.value?.activityLog ?? [])
const orphanedArtists = computed(() => data.value?.orphanedArtists ?? [])
const archivedReleases = computed(() => data.value?.archived.releases ?? [])
const archivedTracks = computed(() => data.value?.archived.tracks ?? [])
const channels = computed(() => data.value?.channels ?? [])

watch(
  orphanedArtists,
  (value) => {
    const activeArtistIds = new Set(value.map((artist) => artist.id))

    for (const artist of value) {
      orphanRestoreDrafts[artist.id] = buildOrphanRestoreDraft(artist)
    }

    for (const artistId of Object.keys(orphanRestoreDrafts)) {
      if (!activeArtistIds.has(artistId)) {
        delete orphanRestoreDrafts[artistId]
      }
    }
  },
  { immediate: true },
)

watch(
  channels,
  (value) => {
    for (const channel of value) {
      channelDrafts[channel.id] = {
        displayName: channel.displayName ?? "",
        iconUrl: channel.iconUrl ?? "",
        color: channel.color ?? "",
      }
    }
  },
  { immediate: true },
)

const summaryMetrics = computed(() => [
  {
    label: "Open statements",
    value: String(summary.value.openStatementCount),
    footnote: "Still eligible for additional imports.",
    tone: "accent" as const,
  },
  {
    label: "Closed statements",
    value: String(summary.value.closedStatementCount),
    footnote: "Locked until an admin reopens them.",
    tone: "default" as const,
  },
  {
    label: "Deleted catalog",
    value: String(
      summary.value.orphanedArtistCount + summary.value.archivedReleaseCount + summary.value.archivedTrackCount,
    ),
    footnote: "Orphaned artists plus deleted releases and tracks visible for audit and history.",
    tone: "default" as const,
  },
  {
    label: "Channels tracked",
    value: String(summary.value.channelCount),
    footnote: "Auto-created during import preview and editable here.",
    tone: "alt" as const,
  },
  {
    label: "Audit entries",
    value: String(summary.value.activityLogCount),
    footnote: "Append-only admin activity log.",
    tone: "default" as const,
  },
])

const filteredStatementPeriods = computed(() => {
  const query = statementSearch.value.trim().toLowerCase()

  return statementPeriods.value.filter((period) => {
    if (statementStatusFilter.value !== "all" && period.status !== statementStatusFilter.value) {
      return false
    }

    if (!query) {
      return true
    }

    return [period.artistName, formatMonth(period.periodMonth), period.periodMonth].some((value) =>
      value.toLowerCase().includes(query),
    )
  })
})

const adminOptions = computed(() => {
  return [...new Set(activityLog.value.map((entry) => entry.adminName).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b),
  )
})

const entityOptions = computed(() => {
  return [...new Set(activityLog.value.map((entry) => entry.entityType))].sort((a, b) => a.localeCompare(b))
})

const filteredActivityLog = computed(() => {
  const query = activitySearch.value.trim().toLowerCase()

  return activityLog.value.filter((entry) => {
    if (activityAdminFilter.value !== "all" && (entry.adminName ?? "Unknown admin") !== activityAdminFilter.value) {
      return false
    }

    if (activityEntityFilter.value !== "all" && entry.entityType !== activityEntityFilter.value) {
      return false
    }

    if (!query) {
      return true
    }

    return [
      entry.adminName ?? "",
      entry.action,
      entry.entityType,
      entry.entityId ?? "",
      JSON.stringify(entry.details),
    ].some((value) => value.toLowerCase().includes(query))
  })
})

const filteredOrphanedArtists = computed(() => {
  const query = archiveSearch.value.trim().toLowerCase()

  if (!query) {
    return orphanedArtists.value
  }

  return orphanedArtists.value.filter((artist) =>
    [artist.name, artist.fullName ?? "", artist.email ?? "", artist.country ?? "", artist.bio ?? ""].some((value) =>
      value.toLowerCase().includes(query),
    ),
  )
})

const filteredArchivedReleases = computed(() => {
  const query = archiveSearch.value.trim().toLowerCase()

  if (!query) {
    return archivedReleases.value
  }

  return archivedReleases.value.filter((release) =>
    [release.title, release.artistName, release.upc ?? "", release.type].some((value) =>
      value.toLowerCase().includes(query),
    ),
  )
})

const filteredArchivedTracks = computed(() => {
  const query = archiveSearch.value.trim().toLowerCase()

  if (!query) {
    return archivedTracks.value
  }

  return archivedTracks.value.filter((track) =>
    [track.title, track.artistName, track.releaseTitle, track.isrc].some((value) =>
      value.toLowerCase().includes(query),
    ),
  )
})

function resetMessages() {
  successMessage.value = ""
  errorMessage.value = ""
}

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""
}

function setError(error: any, fallback: string) {
  errorMessage.value = error?.data?.statusMessage || error?.message || fallback
  successMessage.value = ""
}

function formatMonth(value: string) {
  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return monthFormatter.format(parsedDate)
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available"
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return "Not available"
  }

  return dateTimeFormatter.format(parsedDate)
}

function formatMoney(value: string) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function formatActionLabel(action: string) {
  return action
    .split(".")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" / ")
}

function statementStatusClass(status: AdminStatementPeriodRecord["status"]) {
  return status === "closed" ? "status-completed" : "status-processing"
}

function detailEntries(details: Record<string, unknown>) {
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== "")
    .slice(0, 5)
}

function buildOrphanRestoreDraft(artist: OrphanedArtistRecord): OrphanedArtistRestoreDraft {
  const draft = emptyArtistCreateDraft()
  draft.accessMethod = "password"
  draft.artistName = artist.name
  draft.email = artist.email ?? ""
  draft.fullName = artist.fullName ?? artist.name
  draft.country = artist.country ?? ""
  draft.bio = artist.bio ?? ""
  draft.password = ""
  return draft
}

function restoreActionLabel(accessMethod: ArtistAccessMethod) {
  return accessMethod === "gmailInvite" ? "Create Gmail restore invite" : "Restore with password login"
}

async function updateStatementPeriod(period: AdminStatementPeriodRecord, nextStatus: "open" | "closed") {
  const actionLabel = nextStatus === "closed" ? "close" : "re-open"

  if (import.meta.client && !window.confirm(`${actionLabel} ${period.artistName}'s ${formatMonth(period.periodMonth)} statement period?`)) {
    return
  }

  savingStatementPeriodId.value = period.id
  resetMessages()

  try {
    await $fetch(`/api/admin/settings/statement-periods/${period.id}`, {
      method: "PATCH",
      body: {
        status: nextStatus,
      },
    })

    await refresh()
    setSuccess(`${period.artistName} ${formatMonth(period.periodMonth)} is now ${nextStatus}.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to update the statement period.")
  } finally {
    savingStatementPeriodId.value = ""
  }
}

async function restoreArtistAccess(artist: OrphanedArtistRecord) {
  const draft = orphanRestoreDrafts[artist.id]

  if (!draft) {
    return
  }

  const actionLabel = draft.accessMethod === "gmailInvite" ? "Create Gmail restore invite" : "Restore dashboard access"

  restoringArtistId.value = artist.id
  resetMessages()

  try {
    await $fetch<AdminArtistActionResponse>(`/api/admin/artists/${artist.id}/restore-access`, {
      method: "POST",
      body: {
        accessMethod: draft.accessMethod,
        email: draft.email,
        fullName: draft.fullName,
        password: draft.accessMethod === "password" ? draft.password : undefined,
        country: nullableText(draft.country),
        bio: nullableText(draft.bio),
      },
    })

    await refresh()
    setSuccess(
      draft.accessMethod === "gmailInvite"
        ? `Created a Gmail restore invite for ${artist.name}. The artist stays orphaned until first Google sign-in.`
        : `Restored dashboard access for ${artist.name}.`,
    )
  } catch (fetchError: any) {
    setError(fetchError, `Unable to ${actionLabel.toLowerCase()} for this artist.`)
  } finally {
    restoringArtistId.value = ""
  }
}

async function saveChannel(channel: AdminChannelRegistryRecord) {
  savingChannelId.value = channel.id
  resetMessages()

  try {
    await $fetch(`/api/admin/settings/channels/${channel.id}`, {
      method: "PATCH",
      body: {
        displayName: channelDrafts[channel.id]?.displayName || null,
        iconUrl: channelDrafts[channel.id]?.iconUrl || null,
        color: channelDrafts[channel.id]?.color || null,
      },
    })

    await refresh()
    setSuccess(`Saved channel settings for ${channel.displayName || channel.rawName}.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to save the channel settings.")
  } finally {
    savingChannelId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <div class="metrics">
      <MetricCard
        v-for="metric in summaryMetrics"
        :key="metric.label"
        :label="metric.label"
        :value="metric.value"
        :footnote="metric.footnote"
        :tone="metric.tone"
      />
    </div>

    <SectionCard
      title="Settings and logs"
      eyebrow="Back office"
      description="This workspace controls statement locks, orphan/access restore, channel labels, and the append-only admin audit trail."
    >
      <div class="form-grid">
        <div v-if="errorMessage" class="banner error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="banner">{{ successMessage }}</div>
        <div v-if="error" class="banner error">{{ error.statusMessage || "Unable to load admin settings right now." }}</div>
      </div>
    </SectionCard>

    <SectionCard
      title="Statement period controls"
      eyebrow="Financial lock"
      description="Closed periods block additional CSV commits. Re-open only when you intentionally need to correct a posted month."
    >
      <div class="form-grid">
        <div class="catalog-grid">
          <div class="field-row">
            <label for="statement-search">Search periods</label>
            <input
              id="statement-search"
              v-model="statementSearch"
              class="input"
              type="search"
              placeholder="Search by artist or month"
            />
          </div>

          <div class="field-row">
            <label for="statement-status-filter">Status</label>
            <select id="statement-status-filter" v-model="statementStatusFilter" class="input">
              <option value="all">All periods</option>
              <option value="open">Open only</option>
              <option value="closed">Closed only</option>
            </select>
          </div>
        </div>

        <div v-if="pending" class="status-message">Loading statement periods...</div>

        <div v-else-if="!filteredStatementPeriods.length" class="muted-copy">
          No statement periods match this filter yet.
        </div>

        <div v-else class="catalog-list">
          <article v-for="period in filteredStatementPeriods" :key="period.id" class="catalog-item">
            <div class="catalog-header">
              <div class="summary-copy">
                <strong>{{ period.artistName }}</strong>
                <span class="detail-copy">{{ formatMonth(period.periodMonth) }}</span>
                <span class="detail-copy" v-if="!period.artistIsActive">Artist is orphaned</span>
              </div>
              <span class="status-pill" :class="statementStatusClass(period.status)">
                {{ period.status === "closed" ? "Closed" : "Open" }}
              </span>
            </div>

            <div class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Recorded earnings</span>
                <strong>{{ formatMoney(period.earnings) }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Publishing earnings</span>
                <strong>{{ formatMoney(period.publishing) }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Posted uploads</span>
                <strong>{{ period.uploadCount }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Channel count</span>
                <strong>{{ period.channelCount }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Territory count</span>
                <strong>{{ period.territoryCount }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Release count</span>
                <strong>{{ period.releaseCount }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Closed at</span>
                <strong>{{ formatDateTime(period.closedAt) }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Closed by</span>
                <strong>{{ period.closedByAdminName || "Not closed yet" }}</strong>
              </div>
            </div>

            <div class="button-row">
              <button
                v-if="period.status === 'open'"
                class="button button-secondary"
                :disabled="savingStatementPeriodId === period.id"
                @click="updateStatementPeriod(period, 'closed')"
              >
                {{ savingStatementPeriodId === period.id ? "Closing..." : "Close period" }}
              </button>
              <button
                v-else
                class="button button-secondary"
                :disabled="savingStatementPeriodId === period.id"
                @click="updateStatementPeriod(period, 'open')"
              >
                {{ savingStatementPeriodId === period.id ? "Re-opening..." : "Re-open period" }}
              </button>
            </div>
          </article>
        </div>
      </div>
    </SectionCard>

    <SectionCard
      title="Channel registry"
      eyebrow="Platform labels"
      description="Channels auto-create from import preview. Use this registry to clean display names, icon URLs, and color tags without touching artist-visible financial data."
    >
      <div v-if="pending" class="status-message">Loading channel registry...</div>

      <div v-else-if="!channels.length" class="muted-copy">
        No channels have been registered yet. They will appear here after imports introduce them.
      </div>

      <div v-else class="catalog-list">
        <article v-for="channel in channels" :key="channel.id" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ channel.displayName || channel.rawName }}</strong>
              <span class="detail-copy mono">{{ channel.rawName }}</span>
            </div>
            <span class="pill pill-muted">Updated {{ formatDateTime(channel.updatedAt) }}</span>
          </div>

          <div class="catalog-grid catalog-grid-wide">
            <div class="field-row">
              <label :for="`channel-display-${channel.id}`">Display name</label>
              <input :id="`channel-display-${channel.id}`" v-model="channelDrafts[channel.id].displayName" class="input" type="text" />
            </div>

            <div class="field-row">
              <label :for="`channel-icon-${channel.id}`">Icon URL</label>
              <input :id="`channel-icon-${channel.id}`" v-model="channelDrafts[channel.id].iconUrl" class="input" type="url" />
            </div>

            <div class="field-row">
              <label :for="`channel-color-${channel.id}`">Color</label>
              <input :id="`channel-color-${channel.id}`" v-model="channelDrafts[channel.id].color" class="input mono" type="text" placeholder="#FF6B3D" />
            </div>
          </div>

          <div class="table-actions">
            <div class="summary-copy">
              <span class="detail-copy">
                Color preview
                <strong
                  class="channel-color-preview"
                  :style="{ backgroundColor: channelDrafts[channel.id].color || '#2d201a' }"
                />
              </span>
            </div>

            <div class="button-row">
              <a
                v-if="channelDrafts[channel.id].iconUrl"
                :href="channelDrafts[channel.id].iconUrl"
                class="button button-secondary"
                target="_blank"
                rel="noreferrer"
              >
                Open icon
              </a>
              <button
                class="button button-secondary"
                :disabled="savingChannelId === channel.id"
                @click="saveChannel(channel)"
              >
                {{ savingChannelId === channel.id ? "Saving..." : "Save channel" }}
              </button>
            </div>
          </div>
        </article>
      </div>
    </SectionCard>

    <SectionCard
      title="Admin activity log"
      eyebrow="Audit trail"
      description="Every admin mutation is append-only. Filter the recent trail by admin, entity type, or a search term."
    >
      <div class="form-grid">
        <div class="catalog-grid catalog-grid-wide">
          <div class="field-row">
            <label for="activity-search">Search activity</label>
            <input id="activity-search" v-model="activitySearch" class="input" type="search" placeholder="Search action, entity id, or detail payload" />
          </div>

          <div class="field-row">
            <label for="activity-admin-filter">Admin</label>
            <select id="activity-admin-filter" v-model="activityAdminFilter" class="input">
              <option value="all">All admins</option>
              <option v-for="adminName in adminOptions" :key="adminName" :value="adminName">
                {{ adminName }}
              </option>
            </select>
          </div>

          <div class="field-row">
            <label for="activity-entity-filter">Entity</label>
            <select id="activity-entity-filter" v-model="activityEntityFilter" class="input">
              <option value="all">All entities</option>
              <option v-for="entityName in entityOptions" :key="entityName" :value="entityName">
                {{ entityName }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="pending" class="status-message">Loading activity log...</div>

        <div v-else-if="!filteredActivityLog.length" class="muted-copy">
          No admin activity matches this filter.
        </div>

        <div v-else class="catalog-list">
          <article v-for="entry in filteredActivityLog" :key="entry.id" class="catalog-item">
            <div class="catalog-header">
              <div class="summary-copy">
                <strong>{{ formatActionLabel(entry.action) }}</strong>
                <span class="detail-copy">{{ entry.adminName || "Unknown admin" }} on {{ formatDateTime(entry.createdAt) }}</span>
              </div>
              <span class="pill pill-muted">{{ entry.entityType }}</span>
            </div>

            <div class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Entity id</span>
                <strong class="mono">{{ entry.entityId || "Not recorded" }}</strong>
              </div>
              <div
                v-for="[detailKey, detailValue] in detailEntries(entry.details)"
                :key="`${entry.id}-${detailKey}`"
                class="summary-row"
              >
                <span class="detail-copy">{{ detailKey }}</span>
                <strong>{{ String(detailValue) }}</strong>
              </div>
            </div>
          </article>
        </div>
      </div>
    </SectionCard>

    <SectionCard
      title="Orphaned and deleted records"
      eyebrow="History workspace"
      description="Orphaned artists can be restored. Deleted releases and tracks stay visible here for audit and financial history only."
    >
      <div class="form-grid">
        <div class="field-row">
          <label for="archive-search">Search orphaned or deleted items</label>
          <input
            id="archive-search"
            v-model="archiveSearch"
            class="input"
            type="search"
            placeholder="Search orphaned artists, deleted releases, or tracks"
          />
        </div>
      </div>

      <div class="panel-grid">
        <div class="catalog-subitem catalog-subitem-muted">
          <div class="catalog-section-header">
            <div class="summary-copy">
              <strong>Orphaned artists</strong>
              <span class="detail-copy">{{ summary.orphanedArtistCount }} total orphaned artist records.</span>
            </div>
          </div>

          <div v-if="!filteredOrphanedArtists.length" class="muted-copy">No orphaned artists match this search.</div>

          <div v-else class="catalog-subitems">
            <template v-for="artist in filteredOrphanedArtists" :key="artist.id">
            <div v-if="orphanRestoreDrafts[artist.id]" class="catalog-subitem catalog-subitem-compact">
              <div class="summary-copy">
                <strong>{{ artist.name }}</strong>
                <span class="detail-copy">{{ artist.email || "No email saved" }}</span>
                <span class="detail-copy">{{ artist.fullName || "No last-known full name" }}</span>
                <span class="detail-copy">Orphaned {{ formatDateTime(artist.deactivatedAt) }}</span>
              </div>

              <div class="form-grid">
                <div class="field-row">
                  <label :for="`orphan-method-${artist.id}`">Access method</label>
                  <select :id="`orphan-method-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].accessMethod" class="input">
                    <option value="password">Password account now</option>
                    <option value="gmailInvite">Gmail invite</option>
                  </select>
                </div>

                <div class="field-row">
                  <label :for="`orphan-email-${artist.id}`">Login email</label>
                  <input :id="`orphan-email-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].email" class="input" type="email" />
                </div>

                <div class="field-row">
                  <label :for="`orphan-full-name-${artist.id}`">Full name</label>
                  <input :id="`orphan-full-name-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].fullName" class="input" type="text" />
                </div>

                <div class="field-row" v-if="orphanRestoreDrafts[artist.id].accessMethod === 'password'">
                  <label :for="`orphan-password-${artist.id}`">Temporary password</label>
                  <input :id="`orphan-password-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].password" class="input" type="password" />
                </div>

                <div class="field-row">
                  <label :for="`orphan-country-${artist.id}`">Country</label>
                  <input :id="`orphan-country-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].country" class="input" type="text" />
                </div>

                <div class="field-row field-row-full">
                  <label :for="`orphan-bio-${artist.id}`">Bio</label>
                  <textarea :id="`orphan-bio-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].bio" class="input" rows="3" />
                </div>
              </div>

              <div class="button-row">
                <button class="button button-secondary" :disabled="restoringArtistId === artist.id" @click="restoreArtistAccess(artist)">
                  {{ restoringArtistId === artist.id ? "Saving..." : restoreActionLabel(orphanRestoreDrafts[artist.id].accessMethod) }}
                </button>
              </div>
            </div>
            </template>
          </div>
        </div>

        <div class="catalog-subitem catalog-subitem-muted">
          <div class="catalog-section-header">
            <div class="summary-copy">
              <strong>Deleted releases</strong>
              <span class="detail-copy">{{ summary.archivedReleaseCount }} total deleted release records.</span>
            </div>
          </div>

          <div v-if="!filteredArchivedReleases.length" class="muted-copy">No deleted releases match this search.</div>

          <div v-else class="catalog-subitems">
            <div v-for="release in filteredArchivedReleases" :key="release.id" class="catalog-subitem catalog-subitem-compact">
              <div class="summary-copy">
                <strong>{{ release.title }}</strong>
                <span class="detail-copy">{{ release.artistName }} / {{ release.type.toUpperCase() }}</span>
                <span class="detail-copy">{{ release.upc || "No UPC" }}</span>
                <span class="detail-copy">Deleted catalog rows stay out of the artist release page but remain in earnings history.</span>
              </div>
            </div>
          </div>
        </div>

        <div class="catalog-subitem catalog-subitem-muted">
          <div class="catalog-section-header">
            <div class="summary-copy">
              <strong>Deleted tracks</strong>
              <span class="detail-copy">{{ summary.archivedTrackCount }} total deleted track records.</span>
            </div>
          </div>

          <div v-if="!filteredArchivedTracks.length" class="muted-copy">No deleted tracks match this search.</div>

          <div v-else class="catalog-subitems">
            <div v-for="track in filteredArchivedTracks" :key="track.id" class="catalog-subitem catalog-subitem-compact">
              <div class="summary-copy">
                <strong>{{ track.title }}</strong>
                <span class="detail-copy">{{ track.artistName }} / {{ track.releaseTitle }}</span>
                <span class="detail-copy" :title="track.isrc">{{ track.isrc }}</span>
                <span class="detail-copy">Historic statements keep the track label even after deletion.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  </div>
</template>

<style scoped>
.channel-color-preview {
  display: inline-flex;
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  margin-left: 0.5rem;
  vertical-align: middle;
}
</style>
