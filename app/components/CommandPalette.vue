<script setup lang="ts">
import type { NavItem } from "~/utils/navigation"
import { CornerDownLeft, Lock, Search } from "lucide-vue-next"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

/**
 * ⌘K command palette — jump anywhere from anywhere.
 * Fed by the same NavItem registry as the sidebar, so it is always
 * role-correct (artist vs admin) and respects locked destinations.
 */
const props = defineProps<{
  items: NavItem[]
}>()

const open = defineModel<boolean>("open", { default: false })

const query = ref("")
const activeIndex = ref(0)
const listElement = ref<HTMLElement | null>(null)

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase()

  if (!q) {
    return props.items
  }

  return props.items.filter((item) =>
    `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(q),
  )
})

const groupedItems = computed(() => {
  const groups = new Map<string, { item: NavItem; index: number }[]>()

  filteredItems.value.forEach((item, index) => {
    const group = item.group || "Navigation"
    groups.set(group, [...(groups.get(group) ?? []), { item, index }])
  })

  return Array.from(groups, ([label, entries]) => ({ label, entries }))
})

watch([open, query], () => {
  activeIndex.value = 0

  if (!open.value) {
    query.value = ""
  }
})

watch(activeIndex, () => {
  nextTick(() => {
    listElement.value
      ?.querySelector(`[data-palette-index="${activeIndex.value}"]`)
      ?.scrollIntoView({ block: "nearest" })
  })
})

function move(delta: number) {
  const count = filteredItems.value.length

  if (!count) {
    return
  }

  activeIndex.value = (activeIndex.value + delta + count) % count
}

function choose(item?: NavItem) {
  const target = item ?? filteredItems.value[activeIndex.value]

  if (!target || target.locked) {
    return
  }

  open.value = false
  void navigateTo(target.to)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="command-palette top-[18vh] max-w-[560px] translate-y-0 gap-0 p-0">
      <DialogTitle class="sr-only">Command menu</DialogTitle>

      <div class="palette-input-row">
        <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          v-model="query"
          type="text"
          class="palette-input"
          placeholder="Where to?"
          autocomplete="off"
          spellcheck="false"
          aria-label="Search destinations"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="choose()"
        >
        <span class="palette-kbd">esc</span>
      </div>

      <div ref="listElement" class="palette-list" role="listbox" aria-label="Destinations">
        <template v-for="group in groupedItems" :key="group.label">
          <p class="palette-group-label">{{ group.label }}</p>
          <button
            v-for="entry in group.entries"
            :key="entry.item.to"
            type="button"
            class="palette-row"
            :class="{
              'palette-row-active': entry.index === activeIndex,
              'palette-row-locked': entry.item.locked,
            }"
            :data-palette-index="entry.index"
            role="option"
            :aria-selected="entry.index === activeIndex"
            :disabled="entry.item.locked"
            @mouseenter="activeIndex = entry.index"
            @click="choose(entry.item)"
          >
            <span class="palette-row-icon" aria-hidden="true">
              <component :is="entry.item.icon" class="size-4" data-no-icon-depth />
            </span>
            <span class="palette-row-copy">
              <strong>{{ entry.item.label }}</strong>
              <span>{{ entry.item.description }}</span>
            </span>
            <Lock v-if="entry.item.locked" class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <CornerDownLeft v-else-if="entry.index === activeIndex" class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </template>

        <p v-if="!filteredItems.length" class="palette-empty">Nothing matches "{{ query }}".</p>
      </div>

      <div class="palette-footer">
        <span><span class="palette-kbd">↑</span><span class="palette-kbd">↓</span> navigate</span>
        <span><span class="palette-kbd">↵</span> open</span>
        <span><span class="palette-kbd">ctrl</span><span class="palette-kbd">K</span> toggle</span>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.palette-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--line-1, var(--border));
  padding: 14px 16px;
}

.palette-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--foreground);
  font-size: 15px;
  outline: none;
}

.palette-input::placeholder {
  color: var(--ink-4, var(--muted-foreground));
}

.palette-list {
  max-height: min(48vh, 380px);
  overflow-y: auto;
  padding: 8px;
}

.palette-group-label {
  margin: 6px 8px 4px;
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.palette-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--foreground);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
}

.palette-row-active {
  background: color-mix(in srgb, var(--muted) 55%, transparent);
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--priority) 65%, transparent);
}

.palette-row-locked {
  cursor: not-allowed;
  opacity: 0.45;
}

.palette-row-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--line-1, var(--border));
  border-radius: 8px;
  color: var(--muted-foreground);
}

.palette-row-active .palette-row-icon {
  border-color: color-mix(in srgb, var(--priority) 35%, var(--line-1, var(--border)));
  color: var(--foreground);
}

.palette-row-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.palette-row-copy strong {
  font-size: 13.5px;
  font-weight: 620;
  line-height: 1.3;
}

.palette-row-copy span {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-empty {
  padding: 28px 12px;
  color: var(--muted-foreground);
  font-size: 13px;
  text-align: center;
}

.palette-footer {
  display: flex;
  gap: 16px;
  border-top: 1px solid var(--line-1, var(--border));
  color: var(--muted-foreground);
  padding: 10px 16px;
  font-size: 11.5px;
}

.palette-footer > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.palette-kbd {
  display: inline-grid;
  min-width: 19px;
  place-items: center;
  border: 1px solid var(--line-1, var(--border));
  border-bottom-width: 2px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--muted) 40%, transparent);
  color: var(--muted-foreground);
  padding: 1px 5px;
  font-family: var(--font-app-mono);
  font-size: 10.5px;
  line-height: 1.5;
}
</style>
