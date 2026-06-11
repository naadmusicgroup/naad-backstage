<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next"
import {
  TRACK_CREDIT_ROLE_GROUPS,
  TRACK_CREDIT_ROLE_OPTIONS,
  normalizeTrackCreditRoleCodes,
} from "~~/types/catalog"

type CreditRoleGroup = {
  group: string
  roles: readonly string[]
}

const props = withDefaults(defineProps<{
  modelValue: string[]
  inputId: string
  roleGroups?: readonly CreditRoleGroup[]
  disabled?: boolean
  searchable?: boolean
  compact?: boolean
  searchPlaceholder?: string
  initialVisibleCount?: number
  loadMoreCount?: number
}>(), {
  modelValue: () => [],
  roleGroups: () => TRACK_CREDIT_ROLE_GROUPS,
  disabled: false,
  searchable: true,
  compact: false,
  searchPlaceholder: "Search credit roles",
  initialVisibleCount: 42,
  loadMoreCount: 42,
})

const emit = defineEmits<{
  "update:modelValue": [value: string[]]
}>()

const searchInput = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const search = ref("")
const visibleRoleLimit = ref(props.initialVisibleCount)

const roleGroups = computed(() => props.roleGroups?.length ? props.roleGroups : TRACK_CREDIT_ROLE_GROUPS)
const roleOptions = computed(() => roleGroups.value.flatMap((group) => [...group.roles]))

const selectedRoles = computed({
  get: () => normalizeTrackCreditRoleCodes(
    props.modelValue ?? [],
    roleOptions.value.length ? roleOptions.value : TRACK_CREDIT_ROLE_OPTIONS,
  ),
  set: (value: string[]) => {
    emit(
      "update:modelValue",
      normalizeTrackCreditRoleCodes(
        value,
        roleOptions.value.length ? roleOptions.value : TRACK_CREDIT_ROLE_OPTIONS,
      ),
    )
  },
})

const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return roleGroups.value
  }

  return roleGroups.value
    .map((group) => ({
      ...group,
      roles: group.roles.filter((role) => {
        const normalizedRole = role.toLowerCase()
        const normalizedGroup = group.group.toLowerCase()
        return normalizedRole.includes(query) || normalizedGroup.includes(query)
      }),
    }))
    .filter((group) => group.roles.length)
})

const filteredRoleCount = computed(() => filteredGroups.value.reduce((total, group) => total + group.roles.length, 0))
const visibleFilteredGroups = computed(() => {
  let remainingRoles = Math.max(0, visibleRoleLimit.value)

  return filteredGroups.value
    .map((group) => {
      if (remainingRoles <= 0) {
        return {
          ...group,
          roles: [],
        }
      }

      const roles = group.roles.slice(0, remainingRoles)
      remainingRoles -= roles.length

      return {
        ...group,
        roles,
      }
    })
    .filter((group) => group.roles.length)
})
const hasMoreFilteredRoles = computed(() => visibleRoleLimit.value < filteredRoleCount.value)

const selectedSummary = computed(() => {
  if (!selectedRoles.value.length) {
    return "Search and select one or more roles."
  }

  if (selectedRoles.value.length <= 3) {
    return selectedRoles.value.join(", ")
  }

  return `${selectedRoles.value.slice(0, 3).join(", ")} +${selectedRoles.value.length - 3} more`
})
const selectedTitle = computed(() => {
  if (!selectedRoles.value.length) {
    return "Select roles"
  }

  return props.compact ? selectedSummary.value : `${selectedRoles.value.length} roles selected`
})

watch(
  () => [props.initialVisibleCount, search.value] as const,
  () => {
    visibleRoleLimit.value = props.initialVisibleCount
  },
)

function focusSearchInput() {
  if (!props.searchable) {
    return
  }

  nextTick(() => {
    searchInput.value?.focus()
  })
}

function handleOpenChange(value: boolean) {
  if (props.disabled && value) {
    return
  }

  isOpen.value = value

  if (!value) {
    search.value = ""
    return
  }

  visibleRoleLimit.value = props.initialVisibleCount
  focusSearchInput()
}

function toggleRole(role: string) {
  if (props.disabled) {
    return
  }

  const nextRoles = selectedRoles.value.includes(role)
    ? selectedRoles.value.filter((entry) => entry !== role)
    : [...selectedRoles.value, role]

  selectedRoles.value = nextRoles
}

function removeRole(role: string) {
  if (props.disabled) {
    return
  }

  selectedRoles.value = selectedRoles.value.filter((entry) => entry !== role)
}

function clearRoles() {
  if (props.disabled) {
    return
  }

  selectedRoles.value = []
  focusSearchInput()
}

function loadMoreRoles() {
  visibleRoleLimit.value = Math.min(
    filteredRoleCount.value,
    visibleRoleLimit.value + props.loadMoreCount,
  )
}

function handleRoleListScroll(event: Event) {
  if (!hasMoreFilteredRoles.value) {
    return
  }

  const target = event.target

  if (!(target instanceof HTMLElement)) {
    return
  }

  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 36) {
    loadMoreRoles()
  }
}

function closeMenu() {
  handleOpenChange(false)
}
</script>

<template>
  <div
    class="credit-role-picker"
    :class="{ 'is-open': isOpen, 'is-disabled': disabled, 'is-compact': compact }"
    @keydown.esc.stop.prevent="closeMenu"
  >
    <Popover :open="isOpen" @update:open="handleOpenChange">
      <PopoverTrigger as-child>
        <button
          class="credit-role-picker__toggle"
          type="button"
          :disabled="disabled"
          :aria-controls="`${inputId}-menu`"
          :aria-expanded="isOpen"
        >
          <div class="credit-role-picker__summary">
            <strong>{{ selectedTitle }}</strong>
            <span v-if="!compact" class="detail-copy">{{ selectedSummary }}</span>
          </div>
          <ChevronDown v-if="compact" class="credit-role-picker__chevron" aria-hidden="true" />
          <span class="credit-role-picker__action">{{ isOpen ? "Close" : "Choose" }}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        :id="`${inputId}-menu`"
        :class="['credit-role-picker__menu', { 'credit-role-picker__menu--compact': compact }]"
        align="start"
        side="bottom"
        :side-offset="8"
        :collision-padding="16"
      >
        <div v-if="searchable || selectedRoles.length" class="credit-role-picker__toolbar">
          <input
            v-if="searchable"
            :id="inputId"
            ref="searchInput"
            v-model="search"
            class="input"
            type="text"
            :placeholder="searchPlaceholder"
          />
          <span v-else class="credit-role-picker__toolbar-spacer" aria-hidden="true"></span>
          <button
            v-if="selectedRoles.length"
            class="button button-secondary"
            type="button"
            :disabled="disabled"
            @click="clearRoles"
          >
            Clear
          </button>
        </div>

        <p v-if="!filteredGroups.length" class="credit-role-empty">
          No credit roles match that search.
        </p>

        <div v-else class="credit-role-picker__groups" @scroll.passive="handleRoleListScroll">
          <div
            v-for="group in visibleFilteredGroups"
            :key="group.group"
            class="credit-role-picker__group"
          >
            <strong>{{ group.group }}</strong>

            <div class="credit-role-picker__options">
              <label
                v-for="role in group.roles"
                :key="`${inputId}-${role}`"
                class="credit-role-option"
                :class="{ 'is-selected': selectedRoles.includes(role) }"
              >
                <input
                  :checked="selectedRoles.includes(role)"
                  :disabled="disabled"
                  type="checkbox"
                  @change="toggleRole(role)"
                />
                <span>{{ role }}</span>
              </label>
            </div>
          </div>
          <div
            v-if="hasMoreFilteredRoles"
            class="credit-role-picker__scroll-sentinel"
            aria-hidden="true"
          ></div>
        </div>
      </PopoverContent>
    </Popover>

    <div v-if="selectedRoles.length" class="credit-role-picker__chips">
      <button
        v-for="role in selectedRoles"
        :key="role"
        class="credit-role-chip"
        type="button"
        :disabled="disabled"
        @click="removeRole(role)"
      >
        <span>{{ role }}</span>
        <span aria-hidden="true">x</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.credit-role-picker {
  position: relative;
  display: grid;
  gap: 8px;
  min-width: 0;
}

.credit-role-picker__toggle {
  display: flex;
  width: 100%;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  border: 1px solid var(--input);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
  padding: 8px 12px;
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease;
}

.credit-role-picker.is-open .credit-role-picker__toggle {
  border-color: var(--ring);
  background: var(--accent);
  color: var(--accent-foreground);
}

.credit-role-picker.is-disabled {
  opacity: 0.62;
}

.credit-role-picker.is-disabled .credit-role-picker__toggle,
.credit-role-picker.is-disabled .credit-role-chip,
.credit-role-picker.is-disabled .credit-role-option {
  cursor: not-allowed;
}

.credit-role-picker__summary {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.credit-role-picker__summary strong,
.credit-role-picker__summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credit-role-picker__summary strong {
  font-size: 13px;
  font-weight: 720;
}

.credit-role-picker__action {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--secondary);
  color: var(--secondary-foreground);
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}

.credit-role-picker__chevron {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--foreground) 72%, var(--muted-foreground));
  transition:
    color 140ms ease,
    transform 160ms ease;
}

.credit-role-picker.is-open .credit-role-picker__chevron {
  transform: rotate(180deg);
}

.credit-role-picker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.credit-role-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 32px;
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--secondary);
  color: var(--foreground);
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 650;
}

.credit-role-chip:disabled {
  opacity: 0.58;
}

.credit-role-chip span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credit-role-picker__menu {
  display: grid;
  width: min(520px, calc(100vw - 32px));
  min-width: min(var(--radix-popover-trigger-width, 280px), calc(100vw - 32px));
  max-height: min(420px, calc(100vh - 140px));
  overflow: hidden;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent) !important;
  border-radius: 12px !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 96%, var(--card) 4%), var(--popover)),
    var(--popover) !important;
  color: var(--popover-foreground);
  padding: 5px;
  box-shadow:
    0 18px 42px -28px rgb(0 0 0 / 48%),
    0 6px 18px -16px rgb(0 0 0 / 36%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent) !important;
}

.credit-role-picker__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 70%, transparent);
  padding: 5px 5px 8px;
}

.credit-role-picker__toolbar .input {
  min-height: 36px;
  border: 1px solid var(--input);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-glass, var(--card)) 72%, var(--popover));
  color: var(--foreground);
  padding: 0 10px;
  font-size: 13px;
  font-weight: 560;
  outline: 0;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent);
}

.credit-role-picker__toolbar .input:focus {
  border-color: var(--ring);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent),
    0 0 0 2px color-mix(in srgb, var(--ring) 14%, transparent);
}

.credit-role-picker__toolbar-spacer {
  min-width: 0;
}

.credit-role-picker__toolbar .button {
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--secondary);
  color: var(--secondary-foreground);
  padding: 0 10px;
  font-size: 13px;
  font-weight: 700;
}

.credit-role-picker__groups {
  display: grid;
  gap: 6px;
  min-height: 0;
  max-height: min(340px, calc(100vh - 220px));
  overflow-y: auto;
  padding: 8px 5px 5px;
}

.credit-role-picker__group {
  display: grid;
  gap: 6px;
}

.credit-role-picker__group > strong {
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground));
  font-size: 11px;
  font-weight: 760;
  letter-spacing: 0;
  padding: 3px 6px 2px;
  text-transform: uppercase;
}

.credit-role-picker__options {
  display: grid;
  gap: 3px;
}

.credit-role-option {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 11px;
  align-items: center;
  min-height: 36px;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 6px 8px;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 560;
  line-height: 1.2;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.credit-role-option:hover,
.credit-role-option:focus-within {
  border-color: color-mix(in srgb, var(--ring) 28%, var(--border));
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--foreground);
}

.credit-role-option.is-selected {
  border-color: color-mix(in srgb, var(--priority, var(--ring)) 28%, var(--border));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--priority, var(--ring)) 8%, transparent), transparent),
    color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--foreground);
}

.credit-role-option input {
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--muted-foreground) 46%, var(--border));
  border-radius: 4px;
  appearance: none;
  background: color-mix(in srgb, var(--card) 54%, transparent);
  color: var(--primary-foreground);
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.credit-role-option input::before {
  width: 8px;
  height: 5px;
  border-bottom: 2px solid currentColor;
  border-left: 2px solid currentColor;
  background: transparent;
  content: "";
  opacity: 0;
  transform: translateY(-1px) rotate(-45deg) scale(0.72);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.credit-role-option input:checked {
  border-color: color-mix(in srgb, var(--priority, var(--primary)) 72%, var(--primary));
  background: linear-gradient(180deg, var(--priority-hover, var(--primary)), var(--priority, var(--primary)));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 34%, transparent),
    0 0 0 2px color-mix(in srgb, var(--priority, var(--primary)) 14%, transparent);
}

.credit-role-option input:checked::before {
  opacity: 1;
  transform: translateY(-1px) rotate(-45deg) scale(1);
}

.credit-role-empty {
  color: var(--muted-foreground);
  padding: 12px;
  font-size: 13px;
  font-weight: 600;
}

.credit-role-picker__scroll-sentinel {
  min-height: 10px;
  border-radius: 999px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--border) 32%, transparent), transparent);
}

.credit-role-picker.is-compact {
  gap: 0;
}

.credit-role-picker.is-compact .credit-role-picker__toggle {
  min-height: 44px;
  border-color: color-mix(in srgb, var(--input) 90%, var(--surface-border, var(--border)));
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong, var(--card)) 86%, var(--card)) 0%, color-mix(in srgb, var(--surface-glass, var(--muted)) 72%, var(--card)) 100%),
    var(--card);
  padding: 0 13px;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent);
}

.credit-role-picker.is-compact.is-open .credit-role-picker__toggle {
  border-color: color-mix(in srgb, var(--priority, var(--ring)) 74%, var(--ring));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong, var(--card)) 92%, var(--card)) 0%, color-mix(in srgb, var(--surface-glass, var(--muted)) 80%, var(--card)) 100%),
    var(--card);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    0 0 0 3px color-mix(in srgb, var(--priority, var(--ring)) 12%, transparent),
    0 8px 22px -18px color-mix(in srgb, var(--foreground) 26%, transparent);
}

.credit-role-picker.is-compact .credit-role-picker__summary {
  gap: 0;
}

.credit-role-picker.is-compact .credit-role-picker__summary strong {
  font-size: 15px;
  font-weight: 700;
}

.credit-role-picker.is-compact .credit-role-picker__action {
  display: none;
}

.credit-role-picker.is-compact .credit-role-picker__chevron {
  width: 18px;
  height: 18px;
  color: color-mix(in srgb, var(--foreground) 78%, var(--muted-foreground));
}

.credit-role-picker.is-compact .credit-role-picker__chips {
  display: none;
}

.credit-role-picker__menu--compact {
  width: min(360px, calc(100vw - 32px));
  min-width: min(var(--radix-popover-trigger-width, 260px), calc(100vw - 32px));
  max-height: min(360px, calc(100vh - 140px));
}

.credit-role-picker__menu--compact .credit-role-picker__toolbar {
  padding: 4px 4px 7px;
}

.credit-role-picker__menu--compact .credit-role-picker__toolbar .input,
.credit-role-picker__menu--compact .credit-role-picker__toolbar .button {
  min-height: 34px;
  font-size: 13px;
}

.credit-role-picker__menu--compact .credit-role-picker__groups {
  max-height: 288px;
  padding: 7px 4px 4px;
}

.credit-role-picker__menu--compact .credit-role-option {
  min-height: 34px;
  border-radius: 7px;
  padding: 5px 8px;
}

:global(.credit-role-picker__menu) {
  display: grid !important;
  width: min(520px, calc(100vw - 32px)) !important;
  min-width: min(280px, calc(100vw - 32px)) !important;
  max-height: min(420px, calc(100vh - 140px)) !important;
  overflow: hidden !important;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent) !important;
  border-radius: 12px !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 96%, var(--card) 4%), var(--popover)),
    var(--popover) !important;
  padding: 5px !important;
  box-shadow:
    0 18px 42px -28px rgb(0 0 0 / 48%),
    0 6px 18px -16px rgb(0 0 0 / 36%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent) !important;
}

:global(.credit-role-picker__menu.credit-role-picker__menu--compact) {
  width: min(360px, calc(100vw - 32px)) !important;
  min-width: min(320px, calc(100vw - 32px)) !important;
  max-height: min(360px, calc(100vh - 140px)) !important;
}

@media (max-width: 640px) {
  .credit-role-picker__menu {
    width: min(100vw - 32px, 420px);
  }
}
</style>
