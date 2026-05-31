<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import type { ArtistAvatarMode, ArtistAvatarPreset } from "~~/types/settings"
import {
  ARTIST_AVATAR_MESH_PRESET_STYLES,
  ARTIST_AVATAR_PRESETS,
  DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS,
} from "~~/types/settings"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

const MESH_PRESET_STYLES = ARTIST_AVATAR_MESH_PRESET_STYLES
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

const props = withDefaults(defineProps<{
  avatarMode?: ArtistAvatarMode | string | null
  avatarPreset?: ArtistAvatarPreset | string | null
  avatarCustomColors?: string[] | null
  avatarUrl?: string | null
  displayName?: string | null
  fallback?: string | null
  label?: string
  class?: HTMLAttributes["class"]
}>(), {
  avatarMode: "mesh",
  avatarPreset: "aurora",
  avatarCustomColors: null,
  avatarUrl: null,
  displayName: null,
  fallback: null,
  label: "",
  class: "",
})

const normalizedPreset = computed<ArtistAvatarPreset>(() => {
  const preset = String(props.avatarPreset ?? "").trim().toLowerCase()

  return (ARTIST_AVATAR_PRESETS as readonly string[]).includes(preset)
    ? preset as ArtistAvatarPreset
    : "aurora"
})

const normalizedMode = computed<ArtistAvatarMode>(() => (
  props.avatarMode === "uploaded" ? "uploaded" : "mesh"
))

const showUploadedImage = computed(() => (
  normalizedMode.value === "uploaded" && Boolean(props.avatarUrl)
))

const avatarRenderKey = computed(() => {
  if (normalizedMode.value === "uploaded") {
    return `uploaded:${props.avatarUrl || ""}`
  }

  const customKey = normalizedPreset.value === "custom"
    ? (normalizedCustomColors.value ?? DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS).join(",")
    : ""

  return `mesh:${normalizedPreset.value}:${customKey}`
})

const avatarLabel = computed(() => (
  props.label || `${props.displayName || "Artist"} avatar`
))

const normalizedCustomColors = computed(() => {
  if (!Array.isArray(props.avatarCustomColors) || props.avatarCustomColors.length !== DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS.length) {
    return null
  }

  const colors = props.avatarCustomColors.map((color) => String(color ?? "").trim())
  return colors.every((color) => HEX_COLOR_PATTERN.test(color)) ? colors : null
})

const meshStyle = computed(() => {
  const preset = MESH_PRESET_STYLES[normalizedPreset.value]
  const customColors = normalizedPreset.value === "custom" ? normalizedCustomColors.value : null
  const colors = customColors ?? [preset.c1, preset.c2, preset.c3, preset.c4, preset.c5]

  return {
    "--artist-avatar-c1": colors[0],
    "--artist-avatar-c2": colors[1],
    "--artist-avatar-c3": colors[2],
    "--artist-avatar-c4": colors[3],
    "--artist-avatar-c5": colors[4],
    "--artist-avatar-angle": preset.angle,
  }
})
</script>

<template>
  <Avatar
    :key="avatarRenderKey"
    :aria-label="avatarLabel"
    :class="cn('artist-avatar-root', props.class)"
  >
    <template v-if="showUploadedImage">
      <AvatarImage
        :src="props.avatarUrl || ''"
        :alt="avatarLabel"
        class="artist-avatar-image"
      />

      <AvatarFallback class="artist-avatar-fallback" />
    </template>

    <span
      v-else
      class="artist-avatar-mesh-fallback"
      :style="meshStyle"
    >
      <span class="artist-avatar-mesh" aria-hidden="true" />
    </span>
  </Avatar>
</template>

<style scoped>
.artist-avatar-root {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  isolation: isolate;
}

.artist-avatar-image,
.artist-avatar-fallback,
.artist-avatar-mesh-fallback {
  border-radius: inherit !important;
}

.artist-avatar-fallback,
.artist-avatar-mesh-fallback {
  width: 100%;
  height: 100%;
}

.artist-avatar-fallback {
  background:
    radial-gradient(circle at 30% 24%, color-mix(in srgb, currentColor 16%, transparent), transparent 38%),
    color-mix(in srgb, currentColor 7%, transparent);
}

.artist-avatar-mesh-fallback {
  position: relative;
  display: block;
  overflow: hidden;
  background: var(--artist-avatar-c1);
  color: rgb(255 255 255 / 92%);
}

.artist-avatar-mesh {
  position: absolute;
  inset: -22%;
  z-index: 0;
  transform: rotate(var(--artist-avatar-angle));
  background:
    radial-gradient(circle at 18% 18%, var(--artist-avatar-c5) 0 11%, transparent 31%),
    radial-gradient(circle at 76% 20%, var(--artist-avatar-c2) 0 15%, transparent 38%),
    radial-gradient(circle at 24% 80%, var(--artist-avatar-c3) 0 18%, transparent 42%),
    radial-gradient(circle at 82% 82%, var(--artist-avatar-c4) 0 18%, transparent 45%),
    linear-gradient(135deg, var(--artist-avatar-c1), var(--artist-avatar-c2) 46%, var(--artist-avatar-c4));
  filter: saturate(1.08) contrast(1.04);
}

.artist-avatar-mesh::after {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgb(255 255 255 / 16%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 13%) 1px, transparent 1px);
  background-size: 7px 7px;
  content: "";
  mix-blend-mode: overlay;
  opacity: 0.25;
}
</style>
