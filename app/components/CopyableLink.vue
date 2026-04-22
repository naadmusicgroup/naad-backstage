<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    url: string | null | undefined
    emptyText?: string
  }>(),
  {
    emptyText: "Not set",
  },
)

const copied = ref(false)
const normalizedUrl = computed(() => String(props.url ?? "").trim())

let copiedTimer: ReturnType<typeof setTimeout> | null = null

function markCopied() {
  copied.value = true

  if (copiedTimer) {
    clearTimeout(copiedTimer)
  }

  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1500)
}

function fallbackCopy(text: string) {
  if (!import.meta.client) {
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand("copy")
  document.body.removeChild(textarea)
}

async function copyLink() {
  if (!normalizedUrl.value || !import.meta.client) {
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalizedUrl.value)
    } else {
      fallbackCopy(normalizedUrl.value)
    }

    markCopied()
  } catch {
    fallbackCopy(normalizedUrl.value)
    markCopied()
  }
}

onBeforeUnmount(() => {
  if (copiedTimer) {
    clearTimeout(copiedTimer)
  }
})
</script>

<template>
  <div v-if="normalizedUrl" class="copyable-link" :class="{ 'is-copied': copied }">
    <a :href="normalizedUrl" class="copyable-link__anchor detail-copy mono" target="_blank" rel="noreferrer">
      {{ normalizedUrl }}
    </a>

    <button
      type="button"
      class="copyable-link__button"
      :aria-label="copied ? 'Link copied' : 'Copy link'"
      :title="copied ? 'Link copied' : 'Copy link'"
      @click="copyLink"
    >
      <svg class="copyable-link__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.7" />
        <path
          d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>

  <div v-else class="detail-copy">{{ emptyText }}</div>
</template>
