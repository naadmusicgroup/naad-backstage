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
    :style="meshStyle"
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
  contain: paint;
  isolation: isolate;
}

.artist-avatar-root::before {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  background:
    radial-gradient(
      circle at 32% 24%,
      color-mix(in srgb, var(--artist-avatar-c5) 78%, white 22%) 0 34%,
      color-mix(in srgb, var(--artist-avatar-c2) 18%, transparent) 58%,
      transparent 84%
    ),
    radial-gradient(
      circle at 70% 78%,
      color-mix(in srgb, var(--artist-avatar-c3) 22%, transparent) 0 24%,
      transparent 72%
    );
  content: "";
  pointer-events: none;
  mix-blend-mode: soft-light;
  opacity: 0.7;
  filter: blur(0.45px);
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
  background:
    linear-gradient(
      142deg,
      color-mix(in srgb, var(--artist-avatar-c1) 86%, black 14%),
      color-mix(in srgb, var(--artist-avatar-c2) 34%, var(--artist-avatar-c1) 66%) 42%,
      color-mix(in srgb, var(--artist-avatar-c4) 46%, black 18%) 100%
    );
  color: rgb(255 255 255 / 92%);
  isolation: isolate;
}

.artist-avatar-mesh {
  position: absolute;
  inset: -24%;
  z-index: 0;
  transform: rotate(var(--artist-avatar-angle)) scale(1.08);
  background:
    radial-gradient(ellipse 90% 58% at 18% 16%, color-mix(in srgb, var(--artist-avatar-c5) 70%, white 6%) 0 12%, transparent 42%),
    radial-gradient(ellipse 86% 64% at 86% 18%, color-mix(in srgb, var(--artist-avatar-c2) 78%, black 8%) 0 20%, transparent 52%),
    radial-gradient(ellipse 82% 68% at 22% 92%, color-mix(in srgb, var(--artist-avatar-c3) 72%, black 10%) 0 18%, transparent 50%),
    radial-gradient(ellipse 88% 66% at 92% 88%, color-mix(in srgb, var(--artist-avatar-c4) 78%, black 18%) 0 18%, transparent 52%),
    linear-gradient(
      72deg,
      transparent 0 20%,
      color-mix(in srgb, var(--artist-avatar-c5) 20%, transparent) 38%,
      transparent 58% 100%
    ),
    linear-gradient(
      155deg,
      color-mix(in srgb, var(--artist-avatar-c1) 88%, black 12%) 0%,
      color-mix(in srgb, var(--artist-avatar-c2) 64%, var(--artist-avatar-c1) 36%) 34%,
      color-mix(in srgb, var(--artist-avatar-c3) 54%, var(--artist-avatar-c5) 46%) 62%,
      color-mix(in srgb, var(--artist-avatar-c4) 76%, black 18%) 100%
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--artist-avatar-c1) 90%, black 10%),
      color-mix(in srgb, var(--artist-avatar-c2) 78%, var(--artist-avatar-c1) 22%) 46%,
      color-mix(in srgb, var(--artist-avatar-c4) 82%, black 18%)
    );
  background-size:
    180% 180%,
    170% 170%,
    180% 180%,
    170% 170%,
    200% 200%,
    190% 190%,
    180% 180%;
  background-position:
    10% 14%,
    90% 10%,
    18% 88%,
    82% 80%,
    52% 50%,
    8% 12%,
    0% 0%;
  filter: saturate(1.08) contrast(1.08) hue-rotate(0deg);
}

.artist-avatar-mesh::before,
.artist-avatar-mesh::after,
.artist-avatar-mesh-fallback::after {
  position: absolute;
  inset: 0;
  content: "";
  pointer-events: none;
}

.artist-avatar-mesh::before {
  z-index: 1;
  background:
    radial-gradient(ellipse 70% 54% at 22% 18%, rgb(255 255 255 / 24%) 0 18%, transparent 60%),
    radial-gradient(ellipse 76% 58% at 82% 78%, rgb(255 255 255 / 12%) 0 14%, transparent 64%),
    radial-gradient(ellipse 84% 76% at 52% 48%, rgb(0 0 0 / 16%) 0 20%, transparent 74%);
  background-size:
    150% 150%,
    160% 160%,
    180% 180%;
  background-position:
    8% 10%,
    92% 88%,
    52% 52%;
  mix-blend-mode: screen;
  opacity: 0.52;
}

.artist-avatar-mesh::after {
  z-index: 0;
  background:
    radial-gradient(ellipse 92% 62% at 82% 18%, color-mix(in srgb, var(--artist-avatar-c5) 64%, transparent) 0 14%, transparent 46%),
    radial-gradient(ellipse 86% 64% at 16% 26%, color-mix(in srgb, var(--artist-avatar-c3) 62%, transparent) 0 18%, transparent 48%),
    radial-gradient(ellipse 94% 70% at 88% 82%, color-mix(in srgb, var(--artist-avatar-c2) 68%, transparent) 0 20%, transparent 54%),
    radial-gradient(ellipse 82% 66% at 18% 84%, color-mix(in srgb, var(--artist-avatar-c4) 68%, transparent) 0 17%, transparent 50%),
    linear-gradient(
      128deg,
      transparent 0 16%,
      color-mix(in srgb, var(--artist-avatar-c5) 24%, transparent) 34%,
      color-mix(in srgb, var(--artist-avatar-c2) 18%, transparent) 52%,
      transparent 68% 100%
    );
  background-size:
    180% 180%,
    170% 170%,
    190% 190%,
    175% 175%,
    200% 200%;
  background-position:
    8% 16%,
    92% 10%,
    88% 84%,
    12% 86%,
    46% 52%;
  mix-blend-mode: screen;
  opacity: 0.42;
  transform: translate3d(4%, -3%, 0) rotate(-18deg) scale(1.06);
}

.artist-avatar-mesh-fallback::after {
  z-index: 1;
  border-radius: inherit;
  background:
    radial-gradient(circle at 32% 26%, rgb(255 255 255 / 18%) 0 34%, transparent 68%),
    radial-gradient(circle at 68% 76%, rgb(0 0 0 / 14%) 0 30%, transparent 74%);
  mix-blend-mode: soft-light;
  opacity: 0.38;
}

@media (prefers-reduced-motion: no-preference) {
  .artist-avatar-mesh,
  .artist-avatar-mesh::before,
  .artist-avatar-mesh::after {
    backface-visibility: hidden;
    will-change: opacity, transform, background-position, filter;
  }

  .artist-avatar-mesh {
    animation: artist-avatar-color-field 4300ms cubic-bezier(0.45, 0, 0.2, 1) infinite alternate;
    animation-play-state: paused;
  }

  .artist-avatar-mesh::before {
    animation: artist-avatar-sheen 5200ms cubic-bezier(0.45, 0, 0.2, 1) infinite alternate;
    animation-play-state: paused;
  }

  .artist-avatar-mesh::after {
    animation: artist-avatar-color-wash 3800ms cubic-bezier(0.45, 0, 0.2, 1) infinite alternate;
    animation-play-state: paused;
  }

  .artist-avatar-root:hover .artist-avatar-mesh,
  .artist-avatar-root:focus-within .artist-avatar-mesh {
    animation-play-state: running;
  }

  .artist-avatar-root:hover .artist-avatar-mesh::before,
  .artist-avatar-root:focus-within .artist-avatar-mesh::before {
    animation-play-state: running;
  }

  .artist-avatar-root:hover .artist-avatar-mesh::after,
  .artist-avatar-root:focus-within .artist-avatar-mesh::after {
    animation-play-state: running;
  }

  .artist-avatar-root.settings-avatar-preview .artist-avatar-mesh::before,
  .artist-avatar-root.settings-avatar-preview .artist-avatar-mesh::after {
    animation-play-state: running;
  }

  .artist-avatar-root.settings-avatar-preview .artist-avatar-mesh::before {
    animation-duration: 9800ms;
    opacity: 0.34;
  }

  .artist-avatar-root.settings-avatar-preview .artist-avatar-mesh::after {
    animation-duration: 8600ms;
    opacity: 0.26;
  }

  @keyframes artist-avatar-color-field {
    0% {
      transform: rotate(var(--artist-avatar-angle)) translate3d(-2%, 1%, 0) scale(1.08);
      background-position:
        10% 14%,
        90% 10%,
        18% 88%,
        82% 80%,
        52% 50%,
        8% 12%,
        0% 0%;
      filter: saturate(1.08) contrast(1.08) hue-rotate(0deg) brightness(1);
    }

    33% {
      transform: rotate(calc(var(--artist-avatar-angle) + 10deg)) translate3d(4%, -3%, 0) scale(1.14);
      background-position:
        24% 6%,
        76% 18%,
        10% 92%,
        90% 72%,
        44% 48%,
        18% 6%,
        8% 12%;
      filter: saturate(1.28) contrast(1.12) hue-rotate(10deg) brightness(1.05);
    }

    66% {
      transform: rotate(calc(var(--artist-avatar-angle) - 8deg)) translate3d(-4%, -2%, 0) scale(1.12);
      background-position:
        4% 22%,
        88% 4%,
        26% 76%,
        74% 88%,
        56% 54%,
        4% 18%,
        10% 4%;
      filter: saturate(1.18) contrast(1.11) hue-rotate(-10deg) brightness(1.03);
    }

    100% {
      transform: rotate(calc(var(--artist-avatar-angle) + 4deg)) translate3d(2%, 4%, 0) scale(1.1);
      background-position:
        14% 10%,
        84% 18%,
        20% 82%,
        86% 74%,
        48% 52%,
        12% 14%,
        4% 8%;
      filter: saturate(1.2) contrast(1.11) hue-rotate(6deg) brightness(1.04);
    }
  }

  @keyframes artist-avatar-sheen {
    0% {
      transform: translate3d(-4%, -2%, 0) rotate(-8deg) scale(1);
      opacity: 0.42;
      background-position:
        8% 10%,
        92% 88%,
        52% 52%;
    }

    50% {
      transform: translate3d(6%, 3%, 0) rotate(12deg) scale(1.08);
      opacity: 0.82;
      background-position:
        18% 18%,
        78% 74%,
        48% 50%;
    }

    100% {
      transform: translate3d(-2%, 6%, 0) rotate(22deg) scale(1.12);
      opacity: 0.54;
      background-position:
        12% 16%,
        88% 80%,
        56% 46%;
    }
  }

  @keyframes artist-avatar-color-wash {
    0% {
      opacity: 0.28;
      transform: translate3d(6%, -5%, 0) rotate(-26deg) scale(1.04);
      background-position:
        8% 16%,
        92% 10%,
        88% 84%,
        12% 86%,
        46% 52%;
    }

    35% {
      opacity: 0.7;
      transform: translate3d(-6%, 3%, 0) rotate(18deg) scale(1.16);
      background-position:
        18% 8%,
        78% 20%,
        72% 90%,
        18% 72%,
        54% 48%;
    }

    70% {
      opacity: 0.64;
      transform: translate3d(3%, 7%, 0) rotate(46deg) scale(1.1);
      background-position:
        6% 22%,
        88% 6%,
        82% 80%,
        10% 90%,
        40% 56%;
    }

    100% {
      opacity: 0.74;
      transform: translate3d(-5%, -4%, 0) rotate(86deg) scale(1.18);
      background-position:
        14% 12%,
        84% 18%,
        86% 78%,
        16% 84%,
        50% 50%;
    }
  }
}
</style>
