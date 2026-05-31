<script setup lang="ts">
import { Check, Copy } from "lucide-vue-next"
import { toast } from "vue-sonner"
import AppTooltip from "~/components/AppTooltip.vue"

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
    toast.success("Link copied")
  } catch {
    fallbackCopy(normalizedUrl.value)
    markCopied()
    toast.success("Link copied")
  }
}

onBeforeUnmount(() => {
  if (copiedTimer) {
    clearTimeout(copiedTimer)
  }
})
</script>

<template>
  <div v-if="normalizedUrl" class="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
    <a :href="normalizedUrl" class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground hover:text-foreground" target="_blank" rel="noreferrer">
      {{ normalizedUrl }}
    </a>

    <AppTooltip :label="copied ? 'Copied' : 'Copy link'">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        :aria-label="copied ? 'Link copied' : 'Copy link'"
        @click="copyLink"
      >
        <Check v-if="copied" class="size-4" />
        <Copy v-else class="size-4" />
      </Button>
    </AppTooltip>
  </div>

  <div v-else class="text-sm text-muted-foreground">{{ emptyText }}</div>
</template>
