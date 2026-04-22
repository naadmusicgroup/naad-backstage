<script setup lang="ts">
import type { ArtistStatementSummary } from "~~/types/dashboard"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})
const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const { activeArtistId } = useActiveArtist()

const { data, error, pending, refresh } = useLazyFetch<{ statements: ArtistStatementSummary[] }>(
  "/api/dashboard/statements",
  {
    query: computed(() => (activeArtistId.value ? { artistId: activeArtistId.value } : undefined)),
  },
)

const statements = computed(() => data.value?.statements ?? [])

function formatMoney(value: string) {
  return `$${Number(value).toFixed(2)}`
}

function formatPeriodMonth(value: string) {
  return monthFormatter.format(new Date(`${value}T00:00:00Z`))
}

function formatIsoDate(value: string | null) {
  if (!value) {
    return "Not closed"
  }

  return compactDateFormatter.format(new Date(value))
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Monthly statements"
      eyebrow="Artist view"
      description="Each statement month rolls up posted earnings and publishing credits without exposing raw import rows."
    >
      <div class="button-row">
        <NuxtLink to="/dashboard/settings" class="button button-secondary">Add or review bank details</NuxtLink>
      </div>

      <div v-if="error" class="banner error">
        {{ error.statusMessage || "Unable to load statements right now." }}
        <div class="button-row">
          <button class="button button-secondary" @click="() => refresh()">Retry</button>
        </div>
      </div>

      <div v-else-if="pending && !data" class="status-message">Loading statements...</div>

      <div v-else-if="!statements.length" class="muted-copy">
        No statement months exist yet. Once an earnings upload is committed, each month will appear here.
      </div>

      <div v-else class="catalog-list">
        <article v-for="statement in statements" :key="statement.periodMonth" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ formatPeriodMonth(statement.periodMonth) }}</strong>
              <span class="detail-copy">Closed at: {{ formatIsoDate(statement.closedAt) }}</span>
            </div>
            <span class="status-pill" :class="statement.status === 'closed' ? 'status-closed' : 'status-open'">
              {{ statement.status === "closed" ? "Closed" : "Open" }}
            </span>
          </div>

          <div class="summary-table">
            <div class="summary-row">
              <span class="detail-copy">Earnings</span>
              <strong>{{ formatMoney(statement.earnings) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Publishing</span>
              <strong>{{ formatMoney(statement.publishing) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Channels</span>
              <strong>{{ statement.channelCount }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Territories</span>
              <strong>{{ statement.territoryCount }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Releases</span>
              <strong>{{ statement.releaseCount }}</strong>
            </div>
          </div>
        </article>
      </div>
    </SectionCard>
  </div>
</template>
