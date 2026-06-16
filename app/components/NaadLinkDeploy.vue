<script setup lang="ts">
import { BadgeCheck, Check, Copy, ExternalLink, Plug, ShieldAlert } from "lucide-vue-next"
import { Input } from "@/components/ui/input"
import { NAADLINK_ROOT_DOMAIN } from "~~/types/naadlinks"

const props = defineProps<{
  slug: string
  subdomain: string
  /** Inputs are enabled only once an artist/link is in context. */
  active: boolean
  /** The subdomain's doc root has been verified on the server. */
  verified: boolean
  /** FTP connection health (null = still loading). */
  ftpOk: boolean | null
  ftpConfigured: boolean
  rootDomain?: string
}>()
const emit = defineEmits<{
  (e: "update:slug", value: string): void
  (e: "update:subdomain", value: string): void
  (e: "refresh-status"): void
}>()

const rootDomain = computed(() => props.rootDomain || NAADLINK_ROOT_DOMAIN)
const slugModel = computed({ get: () => props.slug, set: (v) => emit("update:slug", v) })
const subdomainModel = computed({ get: () => props.subdomain, set: (v) => emit("update:subdomain", v) })

const cleanSlug = computed(() =>
  slugModel.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
)
const cleanSubdomain = computed(() =>
  subdomainModel.value.trim().toLowerCase().replace(/\.[a-z0-9.-]*$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
)

const previewUrl = computed(
  () => `https://${cleanSubdomain.value || "subdomain"}.${rootDomain.value}/${cleanSlug.value || "slug"}`,
)
const finalUrl = computed(() =>
  cleanSubdomain.value && cleanSlug.value ? `https://${cleanSubdomain.value}.${rootDomain.value}/${cleanSlug.value}` : "",
)

const copied = ref(false)
async function copyUrl() {
  try {
    await navigator.clipboard.writeText(finalUrl.value || previewUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // ignore — user can copy manually
  }
}
</script>

<template>
  <div class="nl-addr" :class="{ 'is-inactive': !active }">
    <div class="nl-addr-head">
      <span class="nl-addr-title">Page address</span>
      <div class="nl-addr-head-right">
        <span v-if="verified" class="nl-verified is-ok">
          <BadgeCheck class="size-3.5" /> Verified
        </span>
        <span v-else-if="cleanSubdomain && active" class="nl-verified is-warn">
          <ShieldAlert class="size-3.5" /> Not verified
        </span>
        <button type="button" class="nl-conn" :class="ftpOk ? 'is-ok' : 'is-down'" @click="emit('refresh-status')">
          <Plug class="size-3.5" />
          {{ ftpConfigured === false ? "FTP not set" : ftpOk ? "FTP connected" : "FTP offline" }}
        </button>
      </div>
    </div>

    <!-- Subdomain + slug, side by side, forming the URL -->
    <div class="nl-addr-grid">
      <div class="nl-addr-col">
        <label for="nl-subdomain">Subdomain</label>
        <div class="nl-sub-input">
          <Input
            id="nl-subdomain"
            v-model="subdomainModel"
            :disabled="!active"
            placeholder="enter artist subdomain"
            autocapitalize="none"
            spellcheck="false"
          />
          <span class="nl-sub-suffix">.{{ rootDomain }}</span>
        </div>
      </div>

      <div class="nl-addr-col">
        <label for="nl-slug">Link slug (base path)</label>
        <Input
          id="nl-slug"
          v-model="slugModel"
          :disabled="!active"
          placeholder="song-title"
          autocapitalize="none"
          spellcheck="false"
        />
      </div>
    </div>

    <!-- Live URL -->
    <div class="nl-url">
      <code class="nl-url-text" :class="{ 'is-muted': !finalUrl }">{{ finalUrl || previewUrl }}</code>
      <button type="button" class="nl-url-btn" :aria-label="copied ? 'Copied' : 'Copy URL'" @click="copyUrl">
        <Check v-if="copied" class="size-3.5 text-emerald-500" />
        <Copy v-else class="size-3.5" />
      </button>
      <a v-if="finalUrl" :href="finalUrl" target="_blank" rel="noopener" class="nl-url-btn" aria-label="Open in new tab">
        <ExternalLink class="size-3.5" />
      </a>
    </div>

    <p v-if="!active" class="nl-addr-hint">Select an artist first to set the subdomain and base path.</p>
  </div>
</template>

<style scoped>
.nl-addr {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--gold-border, var(--surface-border, var(--border)));
  border-radius: 14px;
  background: color-mix(in srgb, var(--card) 86%, transparent);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.nl-addr.is-inactive {
  opacity: 0.72;
}

.nl-addr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.nl-addr-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.nl-addr-head-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.nl-verified {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}
.nl-verified.is-ok {
  color: var(--status-success, #34d399);
  background: color-mix(in srgb, var(--status-success, #34d399) 12%, transparent);
  border-color: color-mix(in srgb, var(--status-success, #34d399) 30%, transparent);
}
.nl-verified.is-warn {
  color: var(--status-warning, #f59e0b);
  background: color-mix(in srgb, var(--status-warning, #f59e0b) 12%, transparent);
  border-color: color-mix(in srgb, var(--status-warning, #f59e0b) 28%, transparent);
}

.nl-conn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.nl-conn:hover { opacity: 0.82; }
.nl-conn.is-ok {
  color: var(--status-success, #34d399);
  background: color-mix(in srgb, var(--status-success, #34d399) 12%, transparent);
  border-color: color-mix(in srgb, var(--status-success, #34d399) 30%, transparent);
}
.nl-conn.is-down {
  color: var(--status-warning, #f59e0b);
  background: color-mix(in srgb, var(--status-warning, #f59e0b) 12%, transparent);
  border-color: color-mix(in srgb, var(--status-warning, #f59e0b) 28%, transparent);
}

.nl-addr-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nl-addr-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.nl-addr-col label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-foreground);
}

.nl-sub-input {
  display: flex;
  align-items: center;
  min-width: 0;
}
.nl-sub-input :deep(input) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: 0;
  min-width: 0;
}
.nl-sub-suffix {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--muted-foreground);
  background: var(--muted);
  border: 1px solid var(--border);
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
}

.nl-url {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 8px 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 70%, transparent);
}
.nl-url-text {
  flex: 1;
  min-width: 0;
  padding-top: 5px;
  font-size: 12.5px;
  line-height: 1.5;
  word-break: break-all;
}
.nl-url-text.is-muted { color: var(--muted-foreground); }
.nl-url-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  color: var(--muted-foreground);
  cursor: pointer;
}
.nl-url-btn:hover { color: var(--foreground); background: var(--muted); }

.nl-addr-hint {
  margin: 0;
  font-size: 11px;
  color: var(--muted-foreground);
}
</style>
