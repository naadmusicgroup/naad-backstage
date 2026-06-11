<script setup lang="ts">
import { Check, Pencil, Trash2 } from "lucide-vue-next"
import { Card } from "@/components/ui/card"
import {
  ARTIST_SOCIAL_LINK_PLATFORM_LABELS,
  ARTIST_SOCIAL_LINK_PLATFORMS,
  type ArtistSocialLinkDraft,
  type ArtistSocialLinkPlatform,
} from "~~/types/settings"

const props = withDefaults(defineProps<{
  modelValue: ArtistSocialLinkDraft[]
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  "update:modelValue": [value: ArtistSocialLinkDraft[]]
  commit: [value: ArtistSocialLinkDraft[]]
}>()

const touchedPlatforms = ref<ArtistSocialLinkPlatform[]>([])
const editingPlatforms = ref<ArtistSocialLinkPlatform[]>([...ARTIST_SOCIAL_LINK_PLATFORMS])

const linkPlaceholders: Record<ArtistSocialLinkPlatform, string> = {
  facebook: "facebook.com/artist",
  tiktok: "tiktok.com/@artist",
  instagram: "instagram.com/artist",
  youtube: "youtube.com/@artist",
}

const socialLogoSources: Record<ArtistSocialLinkPlatform, string> = {
  facebook: "/social-logos/facebook.svg",
  tiktok: "/social-logos/tiktok.svg",
  instagram: "/social-logos/instagram.svg",
  youtube: "/social-logos/youtube.svg",
}

function linkFor(platform: ArtistSocialLinkPlatform): ArtistSocialLinkDraft {
  return props.modelValue.find((link) => link.platform === platform) ?? {
    platform,
    url: "",
  }
}

function hasLink(platform: ArtistSocialLinkPlatform) {
  return Boolean(linkFor(platform).url.trim())
}

function hasLinkIn(links: ArtistSocialLinkDraft[], platform: ArtistSocialLinkPlatform) {
  return Boolean(links.find((link) => link.platform === platform)?.url.trim())
}

function isEditing(platform: ArtistSocialLinkPlatform) {
  return editingPlatforms.value.includes(platform)
}

function markTouched(platform: ArtistSocialLinkPlatform) {
  if (!touchedPlatforms.value.includes(platform)) {
    touchedPlatforms.value = [...touchedPlatforms.value, platform]
  }
}

function startEditing(platform: ArtistSocialLinkPlatform) {
  markTouched(platform)

  if (!editingPlatforms.value.includes(platform)) {
    editingPlatforms.value = [...editingPlatforms.value, platform]
  }
}

function commitLinks(links: ArtistSocialLinkDraft[]) {
  emit("commit", links.map((link) => ({ ...link })))
}

function stopEditing(platform: ArtistSocialLinkPlatform, links = props.modelValue) {
  if (!hasLinkIn(links, platform)) {
    if (touchedPlatforms.value.includes(platform)) {
      commitLinks(links)
    }

    return
  }

  editingPlatforms.value = editingPlatforms.value.filter((entry) => entry !== platform)
  commitLinks(links)
}

function buildLinks(platform: ArtistSocialLinkPlatform, url: string) {
  return ARTIST_SOCIAL_LINK_PLATFORMS.map((entry) => ({
    platform: entry,
    url: entry === platform ? url : linkFor(entry).url,
  }))
}

function emitLink(platform: ArtistSocialLinkPlatform, url: string) {
  markTouched(platform)

  emit("update:modelValue", buildLinks(platform, url))
}

function clearLink(platform: ArtistSocialLinkPlatform) {
  const nextLinks = buildLinks(platform, "")

  markTouched(platform)
  emit("update:modelValue", nextLinks)
  commitLinks(nextLinks)

  if (!editingPlatforms.value.includes(platform)) {
    editingPlatforms.value = [...editingPlatforms.value, platform]
  }
}

function collapseAfterPaste(platform: ArtistSocialLinkPlatform) {
  globalThis.setTimeout(() => stopEditing(platform), 0)
}

function formatSocialUrl(value: string) {
  const trimmed = value.trim()

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    const path = url.pathname.replace(/\/$/, "")

    return `${url.hostname.replace(/^www\./, "")}${path}${url.search}`
  } catch {
    return trimmed
  }
}

watch(
  () => props.modelValue.map((link) => `${link.platform}:${link.url}`).join("|"),
  () => {
    const nextEditing = new Set(editingPlatforms.value)

    for (const platform of ARTIST_SOCIAL_LINK_PLATFORMS) {
      if (!hasLink(platform)) {
        nextEditing.add(platform)
      } else if (!touchedPlatforms.value.includes(platform)) {
        nextEditing.delete(platform)
      }
    }

    editingPlatforms.value = [...nextEditing]
  },
  { immediate: true },
)
</script>

<template>
  <div class="social-link-stack">
    <Card
      v-for="platform in ARTIST_SOCIAL_LINK_PLATFORMS"
      :key="platform"
      size="sm"
      glint="edge"
      class="social-link-card"
      :class="`social-link-card-${platform}`"
      :aria-label="`${ARTIST_SOCIAL_LINK_PLATFORM_LABELS[platform]} link`"
    >
      <div class="social-link-row">
        <span class="social-link-platform">
          <span
            class="social-link-logo-frame"
            role="img"
            :aria-label="ARTIST_SOCIAL_LINK_PLATFORM_LABELS[platform]"
          >
            <img
              class="social-link-logo"
              :class="`social-link-logo-${platform}`"
              :src="socialLogoSources[platform]"
              alt=""
              loading="lazy"
              decoding="async"
            >
          </span>
          <span class="sr-only">{{ ARTIST_SOCIAL_LINK_PLATFORM_LABELS[platform] }}</span>
        </span>

        <template v-if="hasLink(platform) && !isEditing(platform)">
          <a class="social-link-value" :href="linkFor(platform).url" target="_blank" rel="noopener noreferrer">
            {{ formatSocialUrl(linkFor(platform).url) }}
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            :disabled="disabled"
            :aria-label="`Edit ${ARTIST_SOCIAL_LINK_PLATFORM_LABELS[platform]} link`"
            @click="startEditing(platform)"
          >
            <Pencil class="size-3.5" />
          </Button>
        </template>

        <template v-else>
          <div class="social-link-field">
            <label class="sr-only" :for="`social-link-${platform}`">
              {{ ARTIST_SOCIAL_LINK_PLATFORM_LABELS[platform] }} profile link
            </label>
            <Input
              :id="`social-link-${platform}`"
              :model-value="linkFor(platform).url"
              type="url"
              :placeholder="linkPlaceholders[platform]"
              :disabled="disabled"
              @paste="collapseAfterPaste(platform)"
              @change="stopEditing(platform)"
              @keydown.enter.prevent="stopEditing(platform)"
              @update:model-value="emitLink(platform, String($event ?? ''))"
            />
          </div>

          <Button
            v-if="hasLink(platform)"
            type="button"
            variant="secondary"
            size="icon-xs"
            :disabled="disabled"
            :aria-label="`Done editing ${ARTIST_SOCIAL_LINK_PLATFORM_LABELS[platform]} link`"
            @click="stopEditing(platform)"
          >
            <Check class="size-3.5" />
          </Button>
          <Button
            v-if="hasLink(platform)"
            type="button"
            variant="ghost"
            size="icon-xs"
            :disabled="disabled"
            :aria-label="`Clear ${ARTIST_SOCIAL_LINK_PLATFORM_LABELS[platform]} link`"
            @click="clearLink(platform)"
          >
            <Trash2 class="size-3.5" />
          </Button>
        </template>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.social-link-stack {
  display: grid;
  width: min(100%, 420px);
  gap: 8px;
}

.social-link-card {
  overflow: visible;
  gap: 0;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  background: color-mix(in srgb, var(--muted) 14%, var(--card));
  box-shadow: var(--surface-card-shadow-current, var(--surface-depth-edge));
  padding: 8px 4px 8px 10px;
}

.social-link-card:hover {
  box-shadow: var(--surface-card-shadow-current-hover, var(--surface-depth-edge-hover));
}

.social-link-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}

.social-link-platform {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0;
}

.social-link-logo-frame {
  --social-logo-width: 18px;
  --social-logo-height: 18px;
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-glass-strong, var(--card)) 74%, var(--muted));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 22%);
}

.social-link-logo {
  display: block;
  width: var(--social-logo-width);
  height: var(--social-logo-height);
  max-width: calc(100% - 8px);
  max-height: calc(100% - 8px);
  object-fit: contain;
  object-position: center;
}

.social-link-logo-facebook,
.social-link-logo-instagram {
  --social-logo-width: 19px;
  --social-logo-height: 19px;
}

.social-link-logo-tiktok {
  --social-logo-width: 18px;
  --social-logo-height: 18px;
}

.social-link-logo-youtube {
  --social-logo-width: 22px;
  --social-logo-height: 16px;
}

.social-link-value {
  display: inline-flex;
  min-width: 0;
  min-height: 34px;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 18%, var(--card));
  padding: 0 10px;
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 620;
  line-height: 1.4;
  overflow-wrap: anywhere;
  text-decoration: none;
}

.social-link-value:hover {
  text-decoration: underline;
}

.social-link-field {
  min-width: 0;
}

:global(.dark .social-link-card) {
  background: color-mix(in srgb, var(--muted) 12%, var(--card));
}

:global(.dark .social-link-logo-tiktok) {
  filter: invert(1);
}

:global(.dark .social-link-value) {
  background: color-mix(in srgb, var(--muted) 16%, var(--card));
}

@media (max-width: 680px) {
  .social-link-row {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 6px;
  }
}
</style>
