<script setup lang="ts">
import { computed } from "vue"
import { dspLabelFor } from "~~/app/utils/dsp-logos"

const props = defineProps<{
  platform: string
  metricType?: string | null
  label?: string | null
  size?: "xs" | "sm" | "md"
}>()

const platformFallbacks: Record<string, string> = {
  apple_music: "Apple Music",
  tiktok: "TikTok",
  meta: "Meta / Instagram",
  youtube: "YouTube",
  spotify: "Spotify",
}

const metricFallbacks: Record<string, string> = {
  monthly_listeners: "monthly listeners",
  streams: "plays",
  views: "views",
  impressions: "impressions",
  video_creations: "video creations",
}

const platformLabel = computed(() => {
  const fallback = platformFallbacks[props.platform] ?? props.platform.replace(/_/g, " ")
  return dspLabelFor(props.platform, fallback)
})

const metricLabel = computed(() => {
  if (props.metricType && metricFallbacks[props.metricType]) {
    return metricFallbacks[props.metricType]
  }

  const label = String(props.label ?? "").trim()

  if (!label) {
    return props.metricType?.replace(/_/g, " ") ?? "metric"
  }

  return label
    .replace(platformLabel.value, "")
    .replace(platformFallbacks[props.platform] ?? "", "")
    .replace(/^[\s/.-]+/, "")
    .trim()
    || label
})
</script>

<template>
  <span class="dsp-metric-label">
    <DspLogo
      :name="platform"
      :label="platformLabel"
      :size="size ?? 'sm'"
    />
    <span class="dsp-metric-label-text">{{ metricLabel }}</span>
  </span>
</template>

<style scoped>
.dsp-metric-label {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  vertical-align: middle;
}

.dsp-metric-label-text {
  min-width: 0;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
