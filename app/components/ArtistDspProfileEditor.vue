<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  ARTIST_DSP_PROFILE_PLATFORM_LABELS,
  ARTIST_DSP_PROFILE_PLATFORMS,
  type ArtistDspProfileDraft,
  type ArtistDspProfilePlatform,
} from "~~/types/settings"

const props = withDefaults(defineProps<{
  modelValue: ArtistDspProfileDraft[]
  artistName: string
  disabled?: boolean
}>(), {
  artistName: "Artist",
  disabled: false,
})

const emit = defineEmits<{
  "update:modelValue": [value: ArtistDspProfileDraft[]]
  commit: [value: ArtistDspProfileDraft[]]
}>()
const { confirmAction } = useConfirmAction()

const platformQuestions: Record<ArtistDspProfilePlatform, string> = {
  spotify: "Artist already live on this platform?",
  apple_music: "Artist already live on this platform?",
  amazon_music: "Artist already live on this platform?",
}

function blankProfile(platform: ArtistDspProfilePlatform): ArtistDspProfileDraft {
  return {
    platform,
    profileExists: null,
    profileUrl: "",
    displayName: props.artistName,
    avatarUrl: "",
  }
}

function profileFor(platform: ArtistDspProfilePlatform) {
  return props.modelValue.find((profile) => profile.platform === platform) ?? blankProfile(platform)
}

function buildProfiles(platform: ArtistDspProfilePlatform, patch: Partial<ArtistDspProfileDraft>) {
  const profiles = ARTIST_DSP_PROFILE_PLATFORMS.map((entry) => {
    const current = profileFor(entry)
    const next = entry === platform ? { ...current, ...patch } : current

    if (entry === platform && patch.profileExists === true && !next.displayName.trim()) {
      next.displayName = props.artistName
    }

    if (entry === platform && patch.profileExists === false) {
      next.profileUrl = ""
      next.displayName = ""
      next.avatarUrl = ""
    }

    return next
  })

  return profiles
}

function commitProfiles(profiles: ArtistDspProfileDraft[]) {
  emit("commit", profiles.map((profile) => ({ ...profile })))
}

function emitProfile(platform: ArtistDspProfilePlatform, patch: Partial<ArtistDspProfileDraft>, options: { commit?: boolean } = {}) {
  const profiles = buildProfiles(platform, patch)

  emit("update:modelValue", profiles)

  if (options.commit) {
    commitProfiles(profiles)
  }
}

function commitTextProfile(
  platform: ArtistDspProfilePlatform,
  field: "profileUrl",
  event: Event,
) {
  emitProfile(platform, { [field]: (event.target as HTMLInputElement).value }, { commit: true })
}

async function clearProfile(platform: ArtistDspProfilePlatform) {
  const confirmed = await confirmAction({
    title: "Clear DSP profile",
    description: `Clear ${ARTIST_DSP_PROFILE_PLATFORM_LABELS[platform]} profile details for ${props.artistName}?`,
    confirmLabel: "Clear profile",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  emitProfile(platform, {
    profileExists: null,
    profileUrl: "",
    displayName: props.artistName,
    avatarUrl: "",
  }, { commit: true })
}
</script>

<template>
  <div class="dsp-profile-stack">
    <Card
      v-for="platform in ARTIST_DSP_PROFILE_PLATFORMS"
      :key="platform"
      size="sm"
      glint="edge"
      class="dsp-profile-card"
      :class="`dsp-profile-card-${platform}`"
    >
      <CardHeader class="dsp-profile-card-header">
        <strong class="dsp-profile-logo">
          <DspLogo
            :name="ARTIST_DSP_PROFILE_PLATFORM_LABELS[platform]"
            :label="ARTIST_DSP_PROFILE_PLATFORM_LABELS[platform]"
            size="lg"
          />
        </strong>
        <div class="dsp-profile-actions">
          <StatusBadge
            v-if="profileFor(platform).profileExists"
            tone="success"
            class="rounded-full px-3 py-1"
          >
            Profile connected
          </StatusBadge>
          <StatusBadge
            v-else-if="profileFor(platform).profileExists === false"
            tone="muted"
            class="rounded-full px-3 py-1"
          >
            Not connected
          </StatusBadge>
          <Button
            v-if="profileFor(platform).profileExists === false"
            variant="ghost"
            size="sm"
            :disabled="disabled"
            @click="clearProfile(platform)"
          >
            Clear
          </Button>
        </div>
      </CardHeader>

      <CardContent class="dsp-profile-card-content">
        <div class="dsp-profile-question">
          <span>{{ platformQuestions[platform] }}</span>
          <label
            class="dsp-profile-choice"
            :class="{ selected: profileFor(platform).profileExists === true }"
          >
            <Input
              class="dsp-profile-choice-input"
              type="radio"
              :name="`dsp-profile-${platform}`"
              :checked="profileFor(platform).profileExists === true"
              :disabled="disabled"
              @change="emitProfile(platform, { profileExists: true }, { commit: true })"
            />
            Yes
          </label>
          <label
            class="dsp-profile-choice"
            :class="{ selected: profileFor(platform).profileExists === false }"
          >
            <Input
              class="dsp-profile-choice-input"
              type="radio"
              :name="`dsp-profile-${platform}`"
              :checked="profileFor(platform).profileExists === false"
              :disabled="disabled"
              @change="emitProfile(platform, { profileExists: false }, { commit: true })"
            />
            No
          </label>
        </div>

        <div v-if="profileFor(platform).profileExists" class="dsp-profile-fields">
          <div class="field-row">
            <label :for="`dsp-display-${platform}`">Display name</label>
            <Input
              :id="`dsp-display-${platform}`"
              :model-value="profileFor(platform).displayName"
              type="text"
              :placeholder="artistName"
              disabled
              readonly
            />
          </div>

          <div class="field-row">
            <label :for="`dsp-url-${platform}`">Profile URL</label>
            <Input
              :id="`dsp-url-${platform}`"
              :model-value="profileFor(platform).profileUrl"
              type="url"
              placeholder="https://"
              :disabled="disabled"
              @change="commitTextProfile(platform, 'profileUrl', $event)"
              @keydown.enter.prevent="commitTextProfile(platform, 'profileUrl', $event)"
              @update:model-value="emitProfile(platform, { profileUrl: String($event ?? '') })"
            />
          </div>
        </div>

        <div v-if="profileFor(platform).profileExists" class="dsp-profile-preview">
          <Avatar class="dsp-profile-avatar">
            <AvatarImage
              v-if="profileFor(platform).avatarUrl"
              :src="profileFor(platform).avatarUrl"
              :alt="profileFor(platform).displayName || artistName"
            />
            <AvatarFallback class="dsp-profile-avatar-fallback">
              {{ (profileFor(platform).displayName || artistName).slice(0, 1).toUpperCase() }}
            </AvatarFallback>
          </Avatar>
          <div class="dsp-profile-copy">
            <strong>{{ profileFor(platform).displayName || artistName }}</strong>
            <span>{{ profileFor(platform).profileUrl || "Profile URL pending" }}</span>
          </div>
          <Button variant="secondary" size="sm" :disabled="disabled" @click="clearProfile(platform)">
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<style scoped>
.dsp-profile-stack {
  display: grid;
  gap: 10px;
}

.dsp-profile-card {
  overflow: hidden;
  gap: 12px;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  background: color-mix(in srgb, var(--muted) 16%, var(--card));
  box-shadow: var(--surface-card-shadow-current, var(--surface-depth-edge));
  padding-block: 14px;
}

.dsp-profile-card:hover {
  box-shadow: var(--surface-card-shadow-current-hover, var(--surface-depth-edge-hover));
}

.dsp-profile-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  padding: 0 14px 12px;
}

.dsp-profile-card-content {
  display: grid;
  gap: 14px;
  padding: 0 14px;
}

.dsp-profile-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.dsp-profile-logo {
  color: var(--foreground);
  font-size: 14px;
  font-weight: 760;
  letter-spacing: 0;
}

.dsp-profile-question {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  color: var(--foreground);
  font-size: 14px;
}

.dsp-profile-question > span {
  min-width: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.35;
}

.dsp-profile-choice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  min-height: 44px;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 76%, transparent);
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
}

.dsp-profile-choice:hover {
  border-color: color-mix(in srgb, var(--priority, var(--primary)) 28%, var(--border));
  background: color-mix(in srgb, var(--muted) 28%, var(--card));
}

.dsp-profile-choice.selected {
  border-color: color-mix(in srgb, var(--priority, var(--primary)) 54%, var(--border));
  background: color-mix(in srgb, var(--priority, var(--primary)) 9%, var(--surface-glass-strong, var(--card)));
  box-shadow: var(--surface-control-shadow, none);
}

.dsp-profile-question :deep(input[type="radio"]),
.dsp-profile-choice-input {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  min-height: 18px;
  margin: 0;
  padding: 0;
  appearance: auto;
  accent-color: var(--priority, var(--primary));
  border: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
  outline-offset: 2px;
}

.dsp-profile-fields {
  display: grid;
  gap: 10px;
}

@media (min-width: 860px) {
  .dsp-profile-fields {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.3fr) minmax(0, 1fr);
  }
}

.dsp-profile-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--muted) 22%, var(--card));
  padding: 12px;
}

.dsp-profile-avatar {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--priority, var(--primary)) 24%, var(--border));
  background: color-mix(in srgb, var(--priority, var(--primary)) 12%, var(--muted));
  color: var(--foreground);
  font-size: 16px;
  font-weight: 850;
  box-shadow: none;
}

.dsp-profile-avatar-fallback {
  border-radius: inherit;
  background: transparent;
  color: inherit;
}

.dsp-profile-copy strong,
.dsp-profile-copy span {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.dsp-profile-copy strong {
  color: var(--foreground);
  font-size: 14px;
  font-weight: 820;
}

.dsp-profile-copy span {
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.4;
}

:global(.dark .dsp-profile-card) {
  background: color-mix(in srgb, var(--muted) 12%, var(--card));
}

:global(.dark .dsp-profile-choice),
:global(.dark .dsp-profile-preview) {
  background: color-mix(in srgb, var(--muted) 16%, var(--card));
}

:global(.dark .dsp-profile-choice.selected) {
  background: color-mix(in srgb, var(--priority, var(--primary)) 8%, var(--card));
}

@media (max-width: 680px) {
  .dsp-profile-card-header,
  .dsp-profile-preview {
    align-items: flex-start;
    grid-template-columns: 1fr;
  }

  .dsp-profile-card-header,
  .dsp-profile-actions {
    flex-direction: column;
  }

  .dsp-profile-actions {
    align-items: flex-start;
  }

  .dsp-profile-question {
    grid-template-columns: 1fr 1fr;
  }

  .dsp-profile-question > span {
    grid-column: 1 / -1;
  }

  .dsp-profile-choice {
    min-width: 0;
  }
}
</style>
