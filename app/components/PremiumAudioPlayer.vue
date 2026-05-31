<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import {
  Loader2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-vue-next"

const AUDIO_PLAYER_EVENT = "naad-premium-audio-player-play"

const props = withDefaults(defineProps<{
  src: string
  title?: string
  artistName?: string
  artworkUrl?: string | null
  durationSeconds?: number | null
}>(), {
  title: "Audio preview",
  artistName: "Catalog preview",
  artworkUrl: null,
  durationSeconds: null,
})

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const isLoading = ref(false)
const hasLoadedMetadata = ref(false)
const hasError = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const bufferedEnd = ref(0)
const volume = ref(0.88)
const previousVolume = ref(0.88)
const isMuted = ref(false)

const playerId = `audio-player-${Math.random().toString(36).slice(2)}`

const effectiveDuration = computed(() => {
  if (Number.isFinite(duration.value) && duration.value > 0) {
    return duration.value
  }

  return props.durationSeconds && props.durationSeconds > 0 ? props.durationSeconds : 0
})

const seekMax = computed(() => Math.max(effectiveDuration.value, 1))
const progressPercent = computed(() => getPercent(currentTime.value, seekMax.value))
const bufferedPercent = computed(() => getPercent(bufferedEnd.value, seekMax.value))
const currentTimeLabel = computed(() => formatAudioTime(currentTime.value, "0:00"))
const durationLabel = computed(() => formatAudioTime(effectiveDuration.value, "--:--"))
const timeLabel = computed(() => `${currentTimeLabel.value} / ${durationLabel.value}`)
const volumeLabel = computed(() => (isMuted.value || volume.value === 0 ? "Muted" : `${Math.round(volume.value * 100)}%`))
const artworkFallback = computed(() => props.title.trim().slice(0, 1).toUpperCase() || "A")
const progressStyle = computed<Record<string, string>>(() => ({
  "--player-progress": `${progressPercent.value}%`,
  "--player-buffered": `${Math.max(bufferedPercent.value, progressPercent.value)}%`,
}))
const volumeStyle = computed<Record<string, string>>(() => ({
  "--player-volume": `${isMuted.value ? 0 : Math.round(volume.value * 100)}%`,
}))

watch(() => props.src, () => {
  isPlaying.value = false
  isLoading.value = false
  hasLoadedMetadata.value = false
  hasError.value = false
  currentTime.value = 0
  duration.value = 0
  bufferedEnd.value = 0

  void nextTick(() => {
    syncAudioVolume()
  })
})

onMounted(() => {
  syncAudioVolume()
  window.addEventListener(AUDIO_PLAYER_EVENT, handlePeerPlayback as EventListener)
})

onBeforeUnmount(() => {
  pauseAudio()
  window.removeEventListener(AUDIO_PLAYER_EVENT, handlePeerPlayback as EventListener)
})

function getPercent(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0
  }

  return Math.min(100, Math.max(0, (value / max) * 100))
}

function formatAudioTime(value: number, fallback: string) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }

  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function handlePeerPlayback(event: Event) {
  const peerId = (event as CustomEvent<string>).detail

  if (peerId && peerId !== playerId) {
    pauseAudio()
  }
}

function syncAudioVolume() {
  const audio = audioRef.value

  if (!audio) {
    return
  }

  audio.volume = Math.min(1, Math.max(0, volume.value))
  audio.muted = isMuted.value
}

function updateDurationFromAudio() {
  const audio = audioRef.value

  if (!audio) {
    return
  }

  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    duration.value = audio.duration
  }

  hasLoadedMetadata.value = true
  updateBufferedRange()
}

function updateBufferedRange() {
  const audio = audioRef.value

  if (!audio || !audio.buffered.length) {
    bufferedEnd.value = Math.max(bufferedEnd.value, currentTime.value)
    return
  }

  let end = 0

  for (let index = 0; index < audio.buffered.length; index += 1) {
    end = Math.max(end, audio.buffered.end(index))
  }

  bufferedEnd.value = Math.min(Math.max(end, currentTime.value), seekMax.value)
}

function handleTimeUpdate() {
  const audio = audioRef.value

  if (!audio) {
    return
  }

  currentTime.value = audio.currentTime
  updateBufferedRange()
}

function handleCanPlay() {
  isLoading.value = false
  hasError.value = false
  updateDurationFromAudio()
}

function handleWaiting() {
  if (isPlaying.value) {
    isLoading.value = true
  }
}

function handlePlaying() {
  isLoading.value = false
  hasError.value = false
  isPlaying.value = true
}

function handlePause() {
  isPlaying.value = false
  isLoading.value = false
}

function handleEnded() {
  const audio = audioRef.value

  isPlaying.value = false
  isLoading.value = false
  currentTime.value = 0

  if (audio) {
    audio.currentTime = 0
  }
}

function handleError() {
  hasError.value = true
  isLoading.value = false
  isPlaying.value = false
}

async function togglePlayback() {
  if (hasError.value) {
    return
  }

  if (isPlaying.value) {
    pauseAudio()
    return
  }

  await playAudio()
}

async function playAudio() {
  const audio = audioRef.value

  if (!audio) {
    return
  }

  window.dispatchEvent(new CustomEvent(AUDIO_PLAYER_EVENT, { detail: playerId }))
  isLoading.value = true

  try {
    await audio.play()
    isPlaying.value = true
    hasError.value = false
  } catch {
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

function pauseAudio() {
  const audio = audioRef.value

  if (!audio) {
    return
  }

  audio.pause()
  isPlaying.value = false
  isLoading.value = false
}

function seekAudio(event: Event) {
  const target = event.target as HTMLInputElement
  const nextTime = Number(target.value)
  const audio = audioRef.value

  if (!Number.isFinite(nextTime)) {
    return
  }

  currentTime.value = nextTime

  if (audio) {
    audio.currentTime = nextTime
  }
}

function toggleMute() {
  if (isMuted.value || volume.value === 0) {
    isMuted.value = false
    volume.value = previousVolume.value > 0 ? previousVolume.value : 0.88
  } else {
    previousVolume.value = volume.value
    isMuted.value = true
  }

  syncAudioVolume()
}

function changeVolume(event: Event) {
  const target = event.target as HTMLInputElement
  const nextVolume = Number(target.value)

  if (!Number.isFinite(nextVolume)) {
    return
  }

  volume.value = Math.min(1, Math.max(0, nextVolume))
  isMuted.value = volume.value === 0

  if (volume.value > 0) {
    previousVolume.value = volume.value
  }

  syncAudioVolume()
}
</script>

<template>
  <section class="premium-audio-player" :class="{ 'is-playing': isPlaying, 'has-error': hasError }">
    <audio
      ref="audioRef"
      :src="src"
      preload="metadata"
      @loadedmetadata="updateDurationFromAudio"
      @durationchange="updateDurationFromAudio"
      @progress="updateBufferedRange"
      @timeupdate="handleTimeUpdate"
      @canplay="handleCanPlay"
      @waiting="handleWaiting"
      @playing="handlePlaying"
      @pause="handlePause"
      @ended="handleEnded"
      @error="handleError"
      @contextmenu.prevent
    />

    <div class="premium-audio-art" @contextmenu.prevent>
      <img
        v-if="artworkUrl"
        :src="artworkUrl"
        :alt="`${title} artwork`"
        draggable="false"
        @dragstart.prevent
      />
      <span v-else>{{ artworkFallback }}</span>
    </div>

    <div class="premium-audio-copy">
      <span class="premium-audio-title" :title="title">{{ title }}</span>
      <span class="premium-audio-artist" :title="artistName">{{ artistName }}</span>
    </div>

    <AppTooltip :label="isPlaying ? 'Pause preview' : 'Play preview'">
      <button
        class="premium-audio-main-button"
        type="button"
        :aria-label="isPlaying ? 'Pause audio preview' : 'Play audio preview'"
        :disabled="hasError"
        @click="togglePlayback"
      >
        <Loader2 v-if="isLoading" class="premium-audio-spinner" aria-hidden="true" />
        <Pause v-else-if="isPlaying" aria-hidden="true" />
        <Play v-else aria-hidden="true" />
      </button>
    </AppTooltip>

    <input
      class="premium-audio-progress"
      type="range"
      min="0"
      :max="seekMax"
      step="0.01"
      :value="currentTime"
      :style="progressStyle"
      :aria-label="`Seek ${title}`"
      :aria-valuetext="timeLabel"
      :disabled="hasError"
      @input="seekAudio"
    />

    <span class="premium-audio-time">{{ timeLabel }}</span>

    <div class="premium-audio-volume">
      <AppTooltip :label="isMuted || volume === 0 ? 'Unmute preview' : 'Mute preview'">
        <button
          class="premium-audio-icon-button"
          type="button"
          :aria-label="isMuted || volume === 0 ? 'Unmute audio preview' : 'Mute audio preview'"
          @click="toggleMute"
        >
          <VolumeX v-if="isMuted || volume === 0" aria-hidden="true" />
          <Volume2 v-else aria-hidden="true" />
        </button>
      </AppTooltip>
      <input
        class="premium-audio-volume-slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="isMuted ? 0 : volume"
        :style="volumeStyle"
        aria-label="Audio preview volume"
        :aria-valuetext="volumeLabel"
        @input="changeVolume"
      />
    </div>
  </section>
</template>

<style scoped>
.premium-audio-player {
  --player-accent: var(--priority);
  --player-surface: #ffffff;
  --player-surface-raised: #f6f6f4;
  --player-surface-hover: #eeeeeb;
  --player-art-surface: #101010;
  --player-line: rgba(10, 10, 10, 0.1);
  --player-line-strong: rgba(10, 10, 10, 0.18);
  --player-text: #111111;
  --player-muted: rgba(17, 17, 17, 0.56);
  --player-control: rgba(10, 10, 10, 0.7);
  --player-control-strong: #111111;
  --player-control-hover-bg: rgba(10, 10, 10, 0.06);
  --player-track: rgba(10, 10, 10, 0.14);
  --player-buffer: rgba(10, 10, 10, 0.24);
  --player-thumb-ring: #ffffff;
  --player-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(10, 10, 10, 0.04);

  display: grid;
  grid-template-columns: auto minmax(110px, 0.9fr) auto minmax(160px, 1.4fr) auto auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 54px;
  padding: 8px 12px 8px 8px;
  border: 1px solid var(--player-line);
  border-radius: 8px;
  background: var(--player-surface);
  color: var(--player-text);
  box-shadow: var(--player-shadow);
}

:global(.dark .premium-audio-player) {
  --player-surface: #111111;
  --player-surface-raised: #181818;
  --player-surface-hover: #202020;
  --player-art-surface: #070707;
  --player-line: rgba(255, 255, 255, 0.1);
  --player-line-strong: rgba(255, 255, 255, 0.16);
  --player-text: #f4f4f2;
  --player-muted: rgba(244, 244, 242, 0.58);
  --player-control: rgba(255, 255, 255, 0.68);
  --player-control-strong: #ffffff;
  --player-control-hover-bg: rgba(255, 255, 255, 0.06);
  --player-track: rgba(255, 255, 255, 0.16);
  --player-buffer: rgba(255, 255, 255, 0.28);
  --player-thumb-ring: #f5f5f3;
  --player-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.premium-audio-player:hover,
.premium-audio-player.is-playing {
  border-color: var(--player-line-strong);
}

.premium-audio-player.has-error {
  opacity: 0.7;
}

.premium-audio-art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--player-art-surface);
  color: var(--player-muted);
  font-size: 13px;
  font-weight: 700;
}

.premium-audio-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.premium-audio-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.premium-audio-title,
.premium-audio-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.premium-audio-title {
  color: var(--player-text);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
}

.premium-audio-artist {
  color: var(--player-muted);
  font-size: 10.5px;
  font-weight: 520;
  line-height: 1.2;
}

.premium-audio-main-button,
.premium-audio-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 0;
  color: var(--player-control);
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    border-color 140ms ease;
}

.premium-audio-main-button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--player-line-strong);
  border-radius: 50%;
  background: var(--player-surface-raised);
}

.premium-audio-main-button:hover {
  border-color: var(--player-line-strong);
  background: var(--player-surface-hover);
  color: var(--player-control-strong);
}

.premium-audio-main-button svg {
  width: 14px;
  height: 14px;
}

.premium-audio-icon-button {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: transparent;
  color: var(--player-control);
}

.premium-audio-icon-button:hover {
  color: var(--player-control-strong);
  background: var(--player-control-hover-bg);
}

.premium-audio-icon-button svg {
  width: 14px;
  height: 14px;
}

.premium-audio-main-button:disabled,
.premium-audio-progress:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.premium-audio-main-button:focus-visible,
.premium-audio-icon-button:focus-visible,
.premium-audio-progress:focus-visible,
.premium-audio-volume-slider:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--player-accent) 70%, transparent);
  outline-offset: 3px;
}

.premium-audio-spinner {
  animation: premium-audio-spin 780ms linear infinite;
}

.premium-audio-progress,
.premium-audio-volume-slider {
  width: 100%;
  min-width: 0;
  height: 16px;
  appearance: none;
  border-radius: 999px;
  background-color: transparent;
  cursor: pointer;
}

.premium-audio-progress {
  background:
    linear-gradient(to right, var(--player-accent) 0 var(--player-progress), transparent var(--player-progress)) center / 100% 4px no-repeat,
    linear-gradient(to right, var(--player-buffer) 0 var(--player-buffered), transparent var(--player-buffered)) center / 100% 4px no-repeat,
    linear-gradient(var(--player-track), var(--player-track)) center / 100% 4px no-repeat;
}

.premium-audio-volume-slider {
  width: 86px;
  background:
    linear-gradient(to right, var(--player-accent) 0 var(--player-volume), transparent var(--player-volume)) center / 100% 4px no-repeat,
    linear-gradient(var(--player-track), var(--player-track)) center / 100% 4px no-repeat;
}

.premium-audio-progress::-webkit-slider-thumb,
.premium-audio-volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: 11px;
  height: 11px;
  border: 2px solid var(--player-thumb-ring);
  border-radius: 50%;
  background: var(--player-accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--player-line-strong) 80%, transparent);
}

.premium-audio-progress::-moz-range-thumb,
.premium-audio-volume-slider::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border: 2px solid var(--player-thumb-ring);
  border-radius: 50%;
  background: var(--player-accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--player-line-strong) 80%, transparent);
}

.premium-audio-time {
  min-width: 68px;
  color: var(--player-muted);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 560;
  line-height: 1;
  text-align: right;
  white-space: nowrap;
}

.premium-audio-volume {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 760px) {
  .premium-audio-player {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
  }

  .premium-audio-progress {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .premium-audio-time {
    grid-column: 1 / 3;
    grid-row: 3;
    min-width: 0;
    text-align: left;
  }

  .premium-audio-volume {
    grid-column: 3;
    grid-row: 3;
    justify-self: end;
  }

  .premium-audio-volume-slider {
    width: min(22vw, 86px);
  }
}

@media (max-width: 420px) {
  .premium-audio-player {
    padding-right: 10px;
  }

  .premium-audio-art {
    width: 34px;
    height: 34px;
  }

  .premium-audio-main-button {
    width: 30px;
    height: 30px;
  }

  .premium-audio-volume-slider {
    width: 64px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .premium-audio-main-button,
  .premium-audio-icon-button {
    transition: none;
  }

  .premium-audio-spinner {
    animation-duration: 1.6s;
  }
}

@keyframes premium-audio-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
